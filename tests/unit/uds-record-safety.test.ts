import { describe, expect, it } from "vitest";
import { emptyUdsEncounter } from "../../src/domain/uds";
import { UDS_RECORDS_STORAGE_KEY } from "../../src/persistence/keys";
import {
  UdsRecordRepository,
  type SaveUdsRecordInput,
  type UdsRecord,
} from "../../src/persistence/uds-records";
import { SafeStorage, type StorageLike } from "../../src/persistence/storage";
import {
  holdUdsRecordMutationLock,
  isUnambiguousUsableUdsRecordList,
  isUsableUdsRecord,
  runOwnedUdsRecordMutation,
  UDS_RECORD_MUTATION_LOCK_NAME,
  type UdsLockManagerLike,
  type UdsRecordMutationAccess,
} from "../../src/presentation/uds-record-safety";

/** Entirely synthetic record; no production patient information is used. */
const validRecord = (): UdsRecord => ({
  id: "uds-synthetic-1",
  type: "uds",
  status: "completed",
  createdAt: "2026-08-04T15:00:00.000Z",
  updatedAt: "2026-08-04T15:10:00.000Z",
  completedAt: "2026-08-04T15:10:00.000Z",
  patient: { name: "Baker, Test", dob: "02/03/1992" },
  summary: "Synthetic UDS screen",
  snapshot: {
    ...emptyUdsEncounter(),
    patient: { name: "  BAKER,   TEST ", dob: " 02/03/1992 " },
    collectionDateTime: "2026-08-04T08:00",
    reason: "routine",
  },
  addenda: [
    {
      id: "add-synthetic-1",
      createdAt: "2026-08-04T16:00:00.000Z",
      author: "Test Staff",
      text: "Synthetic clarification.",
    },
  ],
  attestation: {
    staff: "Test Staff",
    timestamp: "2026-08-04T15:10:00.000Z",
    statementVersion: "local-attestation-v1",
  },
});

const draftRecord = (): UdsRecord => {
  const record = validRecord();
  delete record.attestation;
  return {
    ...record,
    status: "draft",
    completedAt: "",
    addenda: [],
  };
};

const inputFrom = (record: UdsRecord, id = record.id): SaveUdsRecordInput => ({
  id,
  patient: record.patient,
  summary: record.summary,
  snapshot: record.snapshot,
});

class InterleavingStorage implements StorageLike {
  readonly values = new Map<string, string>();
  beforeRecordsWrite?: () => void;
  private dispatchingRecordsWrite = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (
      key === UDS_RECORDS_STORAGE_KEY &&
      this.beforeRecordsWrite &&
      !this.dispatchingRecordsWrite
    ) {
      this.dispatchingRecordsWrite = true;
      try {
        this.beforeRecordsWrite();
      } finally {
        this.dispatchingRecordsWrite = false;
      }
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class DeterministicLockManager implements UdsLockManagerLike {
  held = false;
  requests: Array<{ name: string; mode: string; ifAvailable: boolean }> = [];

  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<void> | void,
  ): Promise<void> {
    this.requests.push({ name, ...options });
    if (this.held) return Promise.resolve(callback(null));
    this.held = true;
    return Promise.resolve(callback({ name })).finally(() => {
      this.held = false;
    });
  }
}

const mutate = (
  change: (record: Record<string, unknown>) => void,
): unknown => {
  const record = structuredClone(validRecord()) as unknown as Record<string, unknown>;
  change(record);
  return record;
};

describe("isUsableUdsRecord", () => {
  it("accepts a valid saved record with normalized matching identity", () => {
    expect(isUsableUdsRecord(validRecord())).toBe(true);
  });

  it.each([
    ["null snapshot", null],
    ["missing snapshot", undefined],
  ])("rejects a record with %s", (_label, snapshot) => {
    const record = mutate((candidate) => {
      if (snapshot === undefined) delete candidate.snapshot;
      else candidate.snapshot = snapshot;
    });
    expect(isUsableUdsRecord(record)).toBe(false);
  });

  it.each([
    ["non-string collector", (snapshot: Record<string, unknown>) => { snapshot.collector = 17; }],
    ["invalid reason enum", (snapshot: Record<string, unknown>) => { snapshot.reason = "surprise"; }],
    ["invalid boolean", (snapshot: Record<string, unknown>) => { snapshot.physicalReadingsVerified = "yes"; }],
    ["invalid custom panel", (snapshot: Record<string, unknown>) => { snapshot.customPanels = ["THC", "XYZ"]; }],
    ["invalid optional field", (snapshot: Record<string, unknown>) => { snapshot.comment = null; }],
  ])("rejects malformed nested data: %s", (_label, change) => {
    const record = mutate((candidate) => {
      change(candidate.snapshot as Record<string, unknown>);
    });
    expect(isUsableUdsRecord(record)).toBe(false);
  });

  it("rejects a root patient that does not match the snapshot patient", () => {
    const record = mutate((candidate) => {
      candidate.patient = { name: "Carter, Test", dob: "02/03/1992" };
    });
    expect(isUsableUdsRecord(record)).toBe(false);
  });

  it.each([
    ["unknown result panel", { THC: "neg", XYZ: "pos" }],
    ["invalid result state", { THC: "positive" }],
    ["null results", null],
  ])("rejects malformed results: %s", (_label, results) => {
    const record = mutate((candidate) => {
      (candidate.snapshot as Record<string, unknown>).results = results;
    });
    expect(isUsableUdsRecord(record)).toBe(false);
  });

  it.each([
    ["non-array addenda", {}],
    ["missing addendum text", [{ id: "add-1", createdAt: "now", author: "Staff" }]],
    ["non-string addendum author", [{ id: "add-1", createdAt: "now", author: null, text: "Note" }]],
  ])("rejects malformed addenda: %s", (_label, addenda) => {
    const record = mutate((candidate) => {
      candidate.addenda = addenda;
    });
    expect(isUsableUdsRecord(record)).toBe(false);
  });

  it("never throws for hostile or malformed values", () => {
    const throwingRecord = new Proxy({}, {
      get() {
        throw new Error("hostile getter");
      },
    });

    expect(() => isUsableUdsRecord(throwingRecord)).not.toThrow();
    expect(isUsableUdsRecord(throwingRecord)).toBe(false);
    expect(() => isUsableUdsRecord({ snapshot: { results: null } })).not.toThrow();
    expect(isUsableUdsRecord({ snapshot: { results: null } })).toBe(false);
  });
});

describe("isUnambiguousUsableUdsRecordList", () => {
  it("accepts distinct usable records", () => {
    const second = { ...validRecord(), id: "uds-synthetic-2" };
    expect(isUnambiguousUsableUdsRecordList([validRecord(), second])).toBe(true);
  });

  it("rejects every duplicate-id and malformed-list mutation boundary", () => {
    const duplicate = { ...validRecord() };
    expect(isUnambiguousUsableUdsRecordList([validRecord(), duplicate])).toBe(false);
    expect(isUnambiguousUsableUdsRecordList([validRecord(), { id: "bad" }])).toBe(false);
  });
});

describe("exclusive UDS record mutation access", () => {
  it("holds one real lock for the session and fails a competing acquisition closed", async () => {
    const locks = new DeterministicLockManager();
    let first: UdsRecordMutationAccess = "pending";
    let second: UdsRecordMutationAccess = "pending";

    const releaseFirst = holdUdsRecordMutationLock((status) => { first = status; }, locks);
    const releaseSecond = holdUdsRecordMutationLock((status) => { second = status; }, locks);

    expect(first).toBe("owned");
    expect(second).toBe("busy");
    expect(locks.requests).toEqual([
      { name: UDS_RECORD_MUTATION_LOCK_NAME, mode: "exclusive", ifAvailable: true },
      { name: UDS_RECORD_MUTATION_LOCK_NAME, mode: "exclusive", ifAvailable: true },
    ]);
    releaseSecond();
    releaseFirst();
    await Promise.resolve();
  });

  it("fails closed when Web Locks throws before acquisition", () => {
    const locks: UdsLockManagerLike = {
      request() {
        throw new DOMException("Synthetic unsupported lock manager", "NotSupportedError");
      },
    };
    let status: UdsRecordMutationAccess = "pending";
    holdUdsRecordMutationLock((next) => { status = next; }, locks);
    expect(status).toBe("unsupported");
  });

  it.each([
    "saveDraft",
    "complete",
    "discard",
    "addAddendum",
  ] as const)(
    "blocks a forced competing %s during the owner's whole-array write",
    async (operation) => {
      const locks = new DeterministicLockManager();
      const memory = new InterleavingStorage();
      const startingRecord = operation === "addAddendum" ? validRecord() : draftRecord();
      const rawBefore = JSON.stringify([startingRecord]);
      memory.values.set(UDS_RECORDS_STORAGE_KEY, rawBefore);
      const storage = new SafeStorage(memory);
      const firstRepository = new UdsRecordRepository(storage, {
        now: () => "2027-01-15T10:00:00.000Z",
        createAddendumId: () => "outer-addendum",
      });
      const otherRepository = new UdsRecordRepository(storage, {
        now: () => "2027-01-15T10:01:00.000Z",
        createAddendumId: () => "other-addendum",
      });
      let firstAccess: UdsRecordMutationAccess = "pending";
      let otherAccess: UdsRecordMutationAccess = "pending";
      let otherAttempt: ReturnType<typeof runOwnedUdsRecordMutation> | undefined;
      const releaseFirst = holdUdsRecordMutationLock(
        (status) => { firstAccess = status; },
        locks,
      );

      memory.beforeRecordsWrite = () => {
        const releaseOther = holdUdsRecordMutationLock(
          (status) => { otherAccess = status; },
          locks,
        );
        otherAttempt = runOwnedUdsRecordMutation(otherAccess, () => {
          if (operation === "addAddendum") {
            return otherRepository.addAddendum({
              recordId: startingRecord.id,
              author: "Other Tab, Test MA",
              text: "Synthetic competing addendum.",
            });
          }
          return otherRepository.saveDraft({
            ...inputFrom(startingRecord),
            summary: "Synthetic competing revision",
          });
        });
        releaseOther();
      };

      const firstAttempt = runOwnedUdsRecordMutation(firstAccess, () => {
        switch (operation) {
          case "saveDraft":
            return firstRepository.saveDraft({
              ...inputFrom(startingRecord),
              summary: "Synthetic first revision",
            });
          case "complete":
            return firstRepository.complete({
              ...inputFrom(startingRecord),
              attestation: {
                staff: "First Tab, Test MA",
                timestamp: "2027-01-15T10:00:00.000Z",
                statementVersion: "local-attestation-v1",
              },
            });
          case "discard":
            return firstRepository.discard(startingRecord.id);
          case "addAddendum":
            return firstRepository.addAddendum({
              recordId: startingRecord.id,
              author: "First Tab, Test MA",
              text: "Synthetic first addendum.",
            });
        }
      });

      expect(otherAccess).toBe("busy");
      expect(otherAttempt?.ok).toBe(false);
      expect(firstAttempt.ok).toBe(true);
      if (firstAttempt.ok) expect(firstAttempt.value.ok).toBe(true);
      const records = JSON.parse(memory.values.get(UDS_RECORDS_STORAGE_KEY) ?? "[]") as UdsRecord[];
      if (operation === "discard") {
        expect(records).toEqual([]);
      } else if (operation === "addAddendum") {
        expect(records[0]?.addenda.map((entry) => entry.id)).toEqual([
          "add-synthetic-1",
          "outer-addendum",
        ]);
      } else {
        expect(records).toHaveLength(1);
        expect(records[0]?.summary).not.toBe("Synthetic competing revision");
        expect(records[0]?.status).toBe(operation === "complete" ? "completed" : "draft");
      }
      releaseFirst();
      await Promise.resolve();
    },
  );

  it("preserves a sibling created after the owner releases the whole-array lock", async () => {
    const locks = new DeterministicLockManager();
    const memory = new InterleavingStorage();
    const current = draftRecord();
    memory.values.set(UDS_RECORDS_STORAGE_KEY, JSON.stringify([current]));
    const storage = new SafeStorage(memory);
    const currentRepository = new UdsRecordRepository(storage, {
      now: () => "2027-01-15T10:00:00.000Z",
    });
    let currentAccess: UdsRecordMutationAccess = "pending";
    const releaseCurrent = holdUdsRecordMutationLock(
      (status) => { currentAccess = status; },
      locks,
    );
    const currentAttempt = runOwnedUdsRecordMutation(currentAccess, () =>
      currentRepository.saveDraft({
        ...inputFrom(current),
        summary: "Synthetic current revision",
      }),
    );
    expect(currentAttempt.ok).toBe(true);
    releaseCurrent();
    await Promise.resolve();
    await Promise.resolve();

    const siblingRepository = new UdsRecordRepository(storage, {
      now: () => "2027-01-15T10:01:00.000Z",
      createId: () => "uds-synthetic-sibling",
    });
    const siblingInput = inputFrom({ ...draftRecord(), id: "uds-synthetic-sibling" });
    delete siblingInput.id;
    let siblingAccess: UdsRecordMutationAccess = "pending";
    const releaseSibling = holdUdsRecordMutationLock(
      (status) => { siblingAccess = status; },
      locks,
    );
    const siblingAttempt = runOwnedUdsRecordMutation(siblingAccess, () =>
      siblingRepository.saveDraft(siblingInput),
    );
    expect(siblingAttempt.ok).toBe(true);
    const records = JSON.parse(memory.values.get(UDS_RECORDS_STORAGE_KEY) ?? "[]") as UdsRecord[];
    expect(records.map((record) => record.id).sort()).toEqual([
      "uds-synthetic-1",
      "uds-synthetic-sibling",
    ]);
    expect(records.find((record) => record.id === current.id)?.summary)
      .toBe("Synthetic current revision");
    releaseSibling();
    await Promise.resolve();
  });
});
