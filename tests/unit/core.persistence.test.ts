import { describe, expect, it } from "vitest";
import {
  ActivityLogRepository,
  INJECTION_RECORDS_STORAGE_KEY,
  InjectionRecordRepository,
  SITE_HISTORY_STORAGE_KEY,
  SafeStorage,
  SiteHistoryRepository,
  UDS_RECORDS_STORAGE_KEY,
  UdsRecordRepository,
  browserSafeStorage,
  type StorageLike,
} from "../../src/persistence";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;
  failWrites = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota");
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const input = (id?: string) => ({
  ...(id ? { id } : {}),
  patient: { name: "PATIENT, TEST", dob: "01/01/1990" },
  summary: "Invega Sustenna 156 mg",
  snapshot: {
    medKey: "sustenna",
    state: { dose: "156 mg", site: "L deltoid" },
    initiation: {},
    smartVitals: {},
    disposition: { kind: "administered" },
    fields: { lot: "LOT-A" },
    safetyNone: true,
    note: { cc: "CC", as: "Assessment", pl: "Plan" },
  },
});

describe("InjectionRecordRepository", () => {
  it("reports blocked browser storage without mutating application state", () => {
    const repository = new InjectionRecordRepository(new SafeStorage(null));
    const listed = repository.list();
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.code).toBe("storage-unavailable");
  });

  it("does not rewrite records when opened", () => {
    const memory = new MemoryStorage();
    memory.values.set(
      INJECTION_RECORDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "legacy",
          type: "injection",
          status: "draft",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "",
          patient: {
            name: "Legacy",
            dob: "01/01/1980",
            futurePatient: {
              source: { system: "historical-ehr", identifier: "LEGACY-42" },
            },
          },
          summary: "Legacy",
          snapshot: { version: 3, futureSnapshotField: "keep" },
          addenda: [],
          futureRecordField: "keep",
        },
      ]),
    );
    const repository = new InjectionRecordRepository(new SafeStorage(memory));
    const before = memory.values.get(INJECTION_RECORDS_STORAGE_KEY);
    const opened = repository.open("legacy");
    expect(opened.ok).toBe(true);
    expect(memory.writes).toBe(0);
    expect(memory.values.get(INJECTION_RECORDS_STORAGE_KEY)).toBe(before);
  });

  it("writes snapshot v4 while preserving unknown record and snapshot fields", () => {
    const memory = new MemoryStorage();
    memory.values.set(
      INJECTION_RECORDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "draft-1",
          type: "injection",
          status: "draft",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "",
          patient: {
            name: "Legacy",
            dob: "01/01/1980",
            futurePatient: {
              source: { system: "historical-ehr", identifier: "LEGACY-42" },
            },
          },
          summary: "Legacy",
          snapshot: {
            version: 3,
            medKey: "sustenna",
            state: { unknownState: "keep" },
            futureSnapshotField: "keep",
          },
          addenda: [],
          futureRecordField: "keep",
        },
      ]),
    );
    const repository = new InjectionRecordRepository(new SafeStorage(memory), {
      now: () => "2026-07-30T10:00:00.000Z",
    });
    const saved = repository.saveDraft(input("draft-1"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.snapshot.version).toBe(4);
    expect(saved.value.snapshot.futureSnapshotField).toBe("keep");
    expect(saved.value.snapshot.state.unknownState).toBe("keep");
    expect(saved.value.futureRecordField).toBe("keep");
    expect(saved.value.patient).toMatchObject({
      name: "PATIENT, TEST",
      dob: "01/01/1990",
      futurePatient: {
        source: { system: "historical-ehr", identifier: "LEGACY-42" },
      },
    });
  });

  it("keeps completed snapshots immutable and appends dated addenda separately", () => {
    const memory = new MemoryStorage();
    let timestamp = "2026-07-30T10:00:00.000Z";
    const repository = new InjectionRecordRepository(new SafeStorage(memory), {
      now: () => timestamp,
      createId: () => "inj-1",
      createAddendumId: () => "add-1",
    });
    const completed = repository.complete(input());
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const lockedSnapshot = JSON.stringify(completed.value.snapshot);

    const edit = repository.saveDraft(input("inj-1"));
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error.code).toBe("immutable-record");

    timestamp = "2026-07-30T11:00:00.000Z";
    const added = repository.addAddendum({
      recordId: "inj-1",
      author: "MA",
      text: "Clarification only.",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(JSON.stringify(added.value.snapshot)).toBe(lockedSnapshot);
    expect(added.value.addenda).toEqual([
      {
        id: "add-1",
        createdAt: timestamp,
        author: "MA",
        text: "Clarification only.",
      },
    ]);
  });

  it("does not lock or replace the current record when a storage write fails", () => {
    const memory = new MemoryStorage();
    const repository = new InjectionRecordRepository(new SafeStorage(memory), {
      createId: () => "inj-1",
      now: () => "2026-07-30T10:00:00.000Z",
    });
    const draft = repository.saveDraft(input());
    expect(draft.ok).toBe(true);
    const before = memory.values.get(INJECTION_RECORDS_STORAGE_KEY);
    memory.failWrites = true;
    const completed = repository.complete(input("inj-1"));
    expect(completed.ok).toBe(false);
    expect(memory.values.get(INJECTION_RECORDS_STORAGE_KEY)).toBe(before);
    memory.failWrites = false;
    const opened = repository.open("inj-1");
    expect(opened.ok && opened.value.status).toBe("draft");
  });

  it("leaves malformed storage untouched instead of overwriting it", () => {
    const memory = new MemoryStorage();
    memory.values.set(INJECTION_RECORDS_STORAGE_KEY, "{bad json");
    const repository = new InjectionRecordRepository(new SafeStorage(memory));
    const listed = repository.list();
    expect(listed.ok && listed.value).toEqual([]);
    const save = repository.saveDraft(input());
    expect(save.ok).toBe(false);
    expect(memory.values.get(INJECTION_RECORDS_STORAGE_KEY)).toBe("{bad json");
    expect(memory.writes).toBe(0);
  });
});

const udsInput = (id?: string) => ({
  ...(id ? { id } : {}),
  patient: { name: "RIVERA, ANA", dob: "06/11/1988" },
  summary: "SAFE life 14-Panel Cup · 14/14 tested",
  snapshot: {
    patient: { name: "RIVERA, ANA", dob: "06/11/1988" },
    collectionDateTime: "2026-08-03T09:15",
    reason: "routine" as const,
    device: "SAFE life 14-Panel Cup",
    omittedPanel: "" as const,
    physicalReadingsVerified: true,
    lot: "UDS4471",
    expiration: "2027-04",
    collector: "A. Rivera, MA",
    temperature: "acceptable" as const,
    control: "valid" as const,
    validity: "acceptable" as const,
    medicationAlignment: "no unexpected" as const,
    results: { THC: "neg" as const },
  },
});

describe("UdsRecordRepository", () => {
  it("reports blocked browser storage without mutating application state", () => {
    const repository = new UdsRecordRepository(new SafeStorage(null));
    const listed = repository.list();
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.code).toBe("storage-unavailable");
  });

  it("saves a draft, then completes it in place with an attestation", () => {
    const memory = new MemoryStorage();
    let timestamp = "2026-08-04T15:00:00.000Z";
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      now: () => timestamp,
      createId: () => "uds-1",
    });
    const draft = repository.saveDraft(udsInput());
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.status).toBe("draft");
    expect(draft.value.id).toBe("uds-1");
    expect(draft.value.snapshot.device).toBe("SAFE life 14-Panel Cup");

    timestamp = "2026-08-04T15:10:00.000Z";
    const attestation = {
      staff: "QA Staff, MA",
      timestamp,
      statementVersion: "local-attestation-v1",
    };
    const completed = repository.complete({ ...udsInput("uds-1"), attestation });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.value.status).toBe("completed");
    expect(completed.value.completedAt).toBe(timestamp);
    expect(completed.value.attestation).toEqual(attestation);
  });

  it("keeps completed snapshots immutable and appends dated addenda separately", () => {
    const memory = new MemoryStorage();
    let timestamp = "2026-08-04T15:00:00.000Z";
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      now: () => timestamp,
      createId: () => "uds-1",
      createAddendumId: () => "add-1",
    });
    const completed = repository.complete(udsInput());
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const lockedSnapshot = JSON.stringify(completed.value.snapshot);

    const edit = repository.saveDraft(udsInput("uds-1"));
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error.code).toBe("immutable-record");

    timestamp = "2026-08-04T16:00:00.000Z";
    const added = repository.addAddendum({
      recordId: "uds-1",
      author: "MA",
      text: "Clarification only.",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(JSON.stringify(added.value.snapshot)).toBe(lockedSnapshot);
    expect(added.value.addenda).toEqual([
      { id: "add-1", createdAt: timestamp, author: "MA", text: "Clarification only." },
    ]);
  });

  it("rejects an addendum with an empty author or text", () => {
    const memory = new MemoryStorage();
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-1",
    });
    repository.complete(udsInput());
    const missingAuthor = repository.addAddendum({ recordId: "uds-1", author: "  ", text: "Note" });
    expect(missingAuthor.ok).toBe(false);
    if (!missingAuthor.ok) expect(missingAuthor.error.code).toBe("validation");
    const missingText = repository.addAddendum({ recordId: "uds-1", author: "MA", text: "  " });
    expect(missingText.ok).toBe(false);
    if (!missingText.ok) expect(missingText.error.code).toBe("validation");
  });

  it("rejects an addendum against a draft (only completed records take addenda)", () => {
    const memory = new MemoryStorage();
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-1",
    });
    repository.saveDraft(udsInput());
    const added = repository.addAddendum({ recordId: "uds-1", author: "MA", text: "Note" });
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.error.code).toBe("validation");
  });

  it("discards an editable draft outright, but refuses to discard a completed record", () => {
    const memory = new MemoryStorage();
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-1",
    });
    repository.saveDraft(udsInput());
    const discarded = repository.discard("uds-1");
    expect(discarded.ok).toBe(true);
    const listed = repository.list();
    expect(listed.ok && listed.value).toEqual([]);

    const missing = repository.discard("uds-1");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("not-found");

    const repository2 = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-2",
    });
    repository2.complete(udsInput());
    const refused = repository2.discard("uds-2");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("immutable-record");
  });

  it("does not lock or replace the current record when a storage write fails", () => {
    const memory = new MemoryStorage();
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-1",
      now: () => "2026-08-04T15:00:00.000Z",
    });
    const draft = repository.saveDraft(udsInput());
    expect(draft.ok).toBe(true);
    const before = memory.values.get(UDS_RECORDS_STORAGE_KEY);
    memory.failWrites = true;
    const completed = repository.complete(udsInput("uds-1"));
    expect(completed.ok).toBe(false);
    expect(memory.values.get(UDS_RECORDS_STORAGE_KEY)).toBe(before);
    memory.failWrites = false;
    const opened = repository.open("uds-1");
    expect(opened.ok && opened.value.status).toBe("draft");
  });

  it("leaves malformed storage untouched instead of overwriting it", () => {
    const memory = new MemoryStorage();
    memory.values.set(UDS_RECORDS_STORAGE_KEY, "{bad json");
    const repository = new UdsRecordRepository(new SafeStorage(memory));
    const listed = repository.list();
    expect(listed.ok && listed.value).toEqual([]);
    const save = repository.saveDraft(udsInput());
    expect(save.ok).toBe(false);
    expect(memory.values.get(UDS_RECORDS_STORAGE_KEY)).toBe("{bad json");
    expect(memory.writes).toBe(0);
  });

  it("searches across patient, device, lot, and addenda text", () => {
    const memory = new MemoryStorage();
    const repository = new UdsRecordRepository(new SafeStorage(memory), {
      createId: () => "uds-1",
    });
    repository.saveDraft(udsInput());
    const found = repository.search("UDS4471");
    expect(found.ok && found.value).toHaveLength(1);
    const notFound = repository.search("nonexistent-lot");
    expect(notFound.ok && notFound.value).toHaveLength(0);
  });
});

describe("other compatibility repositories", () => {
  it("contains a throwing browser localStorage getter inside SafeStorage", () => {
    const globalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    try {
      const storage = browserSafeStorage();
      expect(storage.available).toBe(false);
      const result = storage.read("any-key");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("storage-unavailable");
    } finally {
      if (globalWindow) Object.defineProperty(globalThis, "window", globalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("rolls back an activity append when persistence fails", () => {
    const memory = new MemoryStorage();
    const repository = new ActivityLogRepository(new SafeStorage(memory), "2026-07-30");
    memory.failWrites = true;
    const result = repository.append({
      type: "uds",
      status: "needs_review",
      time: "10:00 AM",
      pt: "PATIENT, TEST",
      summary: "UDS",
    });
    expect(result.ok).toBe(false);
    expect(memory.values.size).toBe(0);
  });

  it("leaves malformed activity-log storage unchanged on append and replace", () => {
    const memory = new MemoryStorage();
    const repository = new ActivityLogRepository(new SafeStorage(memory), "2026-07-30");
    const entry = {
      type: "uds" as const,
      status: "needs_review" as const,
      time: "10:00 AM",
      pt: "PATIENT, TEST",
      summary: "UDS",
    };
    for (const malformed of ["{bad json", JSON.stringify({ entries: [] })]) {
      memory.values.set(repository.key, malformed);
      memory.writes = 0;
      const appended = repository.append(entry);
      expect(appended.ok).toBe(false);
      if (!appended.ok) expect(appended.error.code).toBe("invalid-data");
      const replaced = repository.replace([entry]);
      expect(replaced.ok).toBe(false);
      if (!replaced.ok) expect(replaced.error.code).toBe("invalid-data");
      expect(memory.values.get(repository.key)).toBe(malformed);
      expect(memory.writes).toBe(0);
    }
  });

  it("deduplicates site history and preserves unrelated document fields", () => {
    const memory = new MemoryStorage();
    memory.values.set(SITE_HISTORY_STORAGE_KEY, JSON.stringify({ futureRoot: { keep: true } }));
    const repository = new SiteHistoryRepository(
      new SafeStorage(memory),
      () => "2026-07-30T10:00:00.000Z",
    );
    const entry = {
      patientName: "Patient, Test",
      dob: "01/01/1990",
      site: "R deltoid",
      date: "2026-07-30",
      medKey: "sustenna",
      route: "IM",
      recordId: "inj-1",
    };
    expect(repository.record(entry).ok).toBe(true);
    expect(repository.record(entry).ok).toBe(true);
    const listed = repository.list(entry.patientName, entry.dob);
    expect(listed.ok && listed.value).toHaveLength(1);
    expect(JSON.parse(memory.values.get(SITE_HISTORY_STORAGE_KEY)!).futureRoot).toEqual({
      keep: true,
    });
  });

  it("leaves malformed site-history storage unchanged on record", () => {
    const memory = new MemoryStorage();
    const repository = new SiteHistoryRepository(new SafeStorage(memory));
    const entry = {
      patientName: "Patient, Test",
      dob: "01/01/1990",
      site: "R deltoid",
      date: "2026-07-30",
      medKey: "sustenna",
      route: "IM",
      recordId: "inj-1",
    };
    const patientKey = "patient, test|01/01/1990";
    const malformedDocuments = [
      "{bad json",
      JSON.stringify([]),
      JSON.stringify({ [patientKey]: { site: "not-an-array" } }),
      JSON.stringify({ [patientKey]: [null] }),
    ];
    for (const malformed of malformedDocuments) {
      memory.values.set(SITE_HISTORY_STORAGE_KEY, malformed);
      memory.writes = 0;
      const recorded = repository.record(entry);
      expect(recorded.ok).toBe(false);
      if (!recorded.ok) expect(recorded.error.code).toBe("invalid-data");
      expect(memory.values.get(SITE_HISTORY_STORAGE_KEY)).toBe(malformed);
      expect(memory.writes).toBe(0);
    }
  });
});
