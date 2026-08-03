import type { PatientIdentity } from "../domain/contracts";
import {
  INJECTION_RECORDS_STORAGE_KEY,
} from "./keys";
import {
  deepClone,
  deepMergePreservingUnknown,
  failure,
  isPlainObject,
  success,
  type PersistenceResult,
  type SafeStorage,
} from "./storage";

export interface InjectionSnapshotV4 extends Record<string, unknown> {
  version: 4;
  medKey: string;
  state: Record<string, unknown>;
  initiation: Record<string, unknown>;
  smartVitals: Record<string, unknown>;
  disposition: Record<string, unknown>;
  fields: Record<string, unknown>;
  safetyNone: boolean;
  note: {
    cc: string;
    as: string;
    pl: string;
    [key: string]: unknown;
  };
}

export interface InjectionAddendum extends Record<string, unknown> {
  id: string;
  createdAt: string;
  author: string;
  text: string;
}

export interface InjectionRecord extends Record<string, unknown> {
  id: string;
  type: "injection";
  status: "draft" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  patient: PatientIdentity;
  summary: string;
  snapshot: InjectionSnapshotV4;
  addenda: InjectionAddendum[];
}

export interface SaveInjectionRecordInput extends Record<string, unknown> {
  id?: string;
  patient: PatientIdentity;
  summary: string;
  snapshot: Partial<InjectionSnapshotV4> & Record<string, unknown>;
}

export interface AddInjectionAddendumInput {
  recordId: string;
  author: string;
  text: string;
}

export interface InjectionRecordRepositoryOptions {
  now?: () => string;
  createId?: () => string;
  createAddendumId?: () => string;
}

const defaultNow = () => new Date().toISOString();
const defaultRecordId = () =>
  `inj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const defaultAddendumId = () => `add_${Date.now()}`;

const isInjectionRecord = (value: unknown): value is InjectionRecord =>
  isPlainObject(value) &&
  value.type === "injection" &&
  typeof value.id === "string" &&
  Boolean(value.id) &&
  (value.status === "draft" || value.status === "completed");

const normalizeSnapshotV4 = (
  update: SaveInjectionRecordInput["snapshot"],
  previous?: InjectionSnapshotV4,
): InjectionSnapshotV4 => {
  const defaults: InjectionSnapshotV4 = {
    version: 4,
    medKey: "",
    state: {},
    initiation: {},
    smartVitals: {},
    disposition: {},
    fields: {},
    safetyNone: false,
    note: { cc: "", as: "", pl: "" },
  };
  const merged = deepMergePreservingUnknown(
    previous ? deepMergePreservingUnknown(defaults, previous) : defaults,
    update as InjectionSnapshotV4,
  );
  return {
    ...merged,
    version: 4,
    medKey: String(merged.medKey ?? ""),
    state: isPlainObject(merged.state) ? merged.state : {},
    initiation: isPlainObject(merged.initiation) ? merged.initiation : {},
    smartVitals: isPlainObject(merged.smartVitals) ? merged.smartVitals : {},
    disposition: isPlainObject(merged.disposition) ? merged.disposition : {},
    fields: isPlainObject(merged.fields) ? merged.fields : {},
    safetyNone: Boolean(merged.safetyNone),
    note: {
      ...(isPlainObject(merged.note) ? merged.note : {}),
      cc: String(isPlainObject(merged.note) ? merged.note.cc ?? "" : ""),
      as: String(isPlainObject(merged.note) ? merged.note.as ?? "" : ""),
      pl: String(isPlainObject(merged.note) ? merged.note.pl ?? "" : ""),
    },
  };
};

interface StoredDocument {
  entries: unknown[];
  warnings: string[];
  writable: boolean;
}

export class InjectionRecordRepository {
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly createAddendumId: () => string;

  constructor(
    private readonly storage: SafeStorage,
    options: InjectionRecordRepositoryOptions = {},
  ) {
    this.now = options.now ?? defaultNow;
    this.createId = options.createId ?? defaultRecordId;
    this.createAddendumId = options.createAddendumId ?? defaultAddendumId;
  }

  private readDocument(): PersistenceResult<StoredDocument> {
    const raw = this.storage.read(INJECTION_RECORDS_STORAGE_KEY);
    if (!raw.ok) return raw;
    if (!raw.value) return success({ entries: [], warnings: [], writable: true });
    try {
      const parsed: unknown = JSON.parse(raw.value);
      if (!Array.isArray(parsed)) {
        return success(
          {
            entries: [],
            warnings: ["Injection record storage did not contain an array."],
            writable: false,
          },
          ["Malformed storage was left unchanged."],
        );
      }
      const invalidCount = parsed.filter((entry) => !isInjectionRecord(entry)).length;
      const warnings = invalidCount
        ? [`Ignored ${invalidCount} malformed or non-injection storage entr${invalidCount === 1 ? "y" : "ies"}.`]
        : [];
      return success({ entries: parsed, warnings, writable: true }, warnings);
    } catch {
      return success(
        {
          entries: [],
          warnings: ["Injection record storage contains malformed JSON."],
          writable: false,
        },
        ["Malformed storage was left unchanged."],
      );
    }
  }

  private writeEntries(entries: unknown[]): PersistenceResult<void> {
    return this.storage.write(INJECTION_RECORDS_STORAGE_KEY, JSON.stringify(entries));
  }

  list(): PersistenceResult<InjectionRecord[]> {
    const document = this.readDocument();
    if (!document.ok) return document;
    const records = document.value.entries
      .filter(isInjectionRecord)
      .map((record) => deepClone(record))
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return success(records, document.value.warnings);
  }

  open(id: string): PersistenceResult<InjectionRecord> {
    const listed = this.list();
    if (!listed.ok) return listed;
    const record = listed.value.find((entry) => entry.id === id);
    return record
      ? success(record, listed.warnings)
      : failure("not-found", `Injection record "${id}" was not found.`);
  }

  private save(
    input: SaveInjectionRecordInput,
    status: InjectionRecord["status"],
  ): PersistenceResult<InjectionRecord> {
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing injection record storage is malformed. It was left unchanged; recover or export it before saving records.",
      );
    }
    const entries = document.value.entries;
    const existingIndex = input.id
      ? entries.findIndex((entry) => isInjectionRecord(entry) && entry.id === input.id)
      : -1;
    const existing =
      existingIndex >= 0 && isInjectionRecord(entries[existingIndex])
        ? entries[existingIndex]
        : undefined;
    if (existing?.status === "completed") {
      return failure(
        "immutable-record",
        "Completed injection records are read-only; add a dated addendum instead.",
      );
    }
    const timestamp = this.now();
    const id = existing?.id ?? input.id ?? this.createId();
    const patient = deepMergePreservingUnknown(
      isPlainObject(existing?.patient) ? existing.patient : {},
      {
        ...(isPlainObject(input.patient) ? input.patient : {}),
        name: String(input.patient.name ?? "").trim(),
        dob: String(input.patient.dob ?? "").trim(),
      },
    ) as PatientIdentity;
    const mergedInput = deepMergePreservingUnknown(existing ?? ({} as InjectionRecord), {
      ...input,
      id,
      type: "injection",
      status,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: status === "completed" ? timestamp : "",
      patient,
      summary: String(input.summary ?? ""),
      snapshot: normalizeSnapshotV4(input.snapshot, existing?.snapshot),
      addenda: deepClone(existing?.addenda ?? []),
    } as InjectionRecord);
    const record: InjectionRecord = {
      ...mergedInput,
      id,
      type: "injection",
      status,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: status === "completed" ? timestamp : "",
      patient,
      summary: String(input.summary ?? ""),
      snapshot: normalizeSnapshotV4(input.snapshot, existing?.snapshot),
      addenda: deepClone(existing?.addenda ?? []),
    };
    const nextEntries = entries.slice();
    if (existingIndex >= 0) nextEntries[existingIndex] = record;
    else nextEntries.unshift(record);
    const written = this.writeEntries(nextEntries);
    if (!written.ok) return written;
    return success(deepClone(record), document.value.warnings);
  }

  saveDraft(input: SaveInjectionRecordInput): PersistenceResult<InjectionRecord> {
    return this.save(input, "draft");
  }

  complete(input: SaveInjectionRecordInput): PersistenceResult<InjectionRecord> {
    return this.save(input, "completed");
  }

  addAddendum(input: AddInjectionAddendumInput): PersistenceResult<InjectionRecord> {
    const author = input.author.trim();
    const text = input.text.trim();
    if (!author || !text) {
      return failure("validation", "An addendum requires both an author and text.");
    }
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing injection record storage is malformed. It was left unchanged; recover it before saving an addendum.",
      );
    }
    const index = document.value.entries.findIndex(
      (entry) => isInjectionRecord(entry) && entry.id === input.recordId,
    );
    const current = index >= 0 ? document.value.entries[index] : undefined;
    if (!isInjectionRecord(current)) {
      return failure("not-found", `Injection record "${input.recordId}" was not found.`);
    }
    if (current.status !== "completed") {
      return failure("validation", "Addenda may be added only to completed records.");
    }
    const timestamp = this.now();
    const addendum: InjectionAddendum = {
      id: this.createAddendumId(),
      createdAt: timestamp,
      author,
      text,
    };
    const updated: InjectionRecord = {
      ...deepClone(current),
      updatedAt: timestamp,
      addenda: [...(Array.isArray(current.addenda) ? deepClone(current.addenda) : []), addendum],
    };
    const nextEntries = document.value.entries.slice();
    nextEntries[index] = updated;
    const written = this.writeEntries(nextEntries);
    if (!written.ok) return written;
    return success(deepClone(updated), document.value.warnings);
  }

  search(
    query: string,
    filter: "all" | "draft" | "completed" | "addenda" = "all",
  ): PersistenceResult<InjectionRecord[]> {
    const listed = this.list();
    if (!listed.ok) return listed;
    const needle = query.trim().toLocaleLowerCase();
    const records = listed.value.filter((record) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "addenda"
          ? Array.isArray(record.addenda) && record.addenda.length > 0
          : record.status === filter);
      if (!matchesFilter) return false;
      if (!needle) return true;
      const snapshot = record.snapshot;
      const searchable = [
        record.patient.name,
        record.patient.dob,
        record.summary,
        record.status,
        snapshot.medKey,
        ...Object.values(snapshot.state ?? {}),
        ...Object.values(snapshot.fields ?? {}),
        ...(record.addenda ?? []).flatMap((entry) => [entry.author, entry.text]),
      ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .join(" ")
        .toLocaleLowerCase();
      return searchable.includes(needle);
    });
    return success(records, listed.warnings);
  }
}
