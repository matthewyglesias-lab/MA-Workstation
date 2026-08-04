import type { PatientIdentity } from "../domain/contracts";
import type { UdsEncounter } from "../domain/uds";
import { UDS_RECORDS_STORAGE_KEY } from "./keys";
import {
  deepClone,
  failure,
  isPlainObject,
  success,
  type PersistenceResult,
  type SafeStorage,
} from "./storage";

export interface UdsAddendum extends Record<string, unknown> {
  id: string;
  createdAt: string;
  author: string;
  text: string;
}

/** Optional browser-local closeout metadata. Older completed records omit it. */
export interface UdsLocalAttestation extends Record<string, unknown> {
  staff: string;
  timestamp: string;
  statementVersion: string;
}

export interface UdsRecord extends Record<string, unknown> {
  id: string;
  type: "uds";
  status: "draft" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  patient: PatientIdentity;
  summary: string;
  snapshot: UdsEncounter;
  addenda: UdsAddendum[];
  attestation?: UdsLocalAttestation;
}

export interface SaveUdsRecordInput extends Record<string, unknown> {
  id?: string;
  patient: PatientIdentity;
  summary: string;
  snapshot: UdsEncounter;
  /** Only meaningful on `complete()`; a plain `saveDraft()` never sets one. */
  attestation?: UdsLocalAttestation;
}

export interface AddUdsAddendumInput {
  recordId: string;
  author: string;
  text: string;
}

export interface UdsRecordRepositoryOptions {
  now?: () => string;
  createId?: () => string;
  createAddendumId?: () => string;
}

const defaultNow = () => new Date().toISOString();
const defaultRecordId = () =>
  `uds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const defaultAddendumId = () => `add_${Date.now()}`;

const isUdsRecord = (value: unknown): value is UdsRecord =>
  isPlainObject(value) &&
  value.type === "uds" &&
  typeof value.id === "string" &&
  Boolean(value.id) &&
  (value.status === "draft" || value.status === "completed");

interface StoredDocument {
  entries: unknown[];
  warnings: string[];
  writable: boolean;
}

export class UdsRecordRepository {
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly createAddendumId: () => string;

  constructor(
    private readonly storage: SafeStorage,
    options: UdsRecordRepositoryOptions = {},
  ) {
    this.now = options.now ?? defaultNow;
    this.createId = options.createId ?? defaultRecordId;
    this.createAddendumId = options.createAddendumId ?? defaultAddendumId;
  }

  private readDocument(): PersistenceResult<StoredDocument> {
    const raw = this.storage.read(UDS_RECORDS_STORAGE_KEY);
    if (!raw.ok) return raw;
    if (!raw.value) return success({ entries: [], warnings: [], writable: true });
    try {
      const parsed: unknown = JSON.parse(raw.value);
      if (!Array.isArray(parsed)) {
        return success(
          {
            entries: [],
            warnings: ["UDS record storage did not contain an array."],
            writable: false,
          },
          ["Malformed storage was left unchanged."],
        );
      }
      const invalidCount = parsed.filter((entry) => !isUdsRecord(entry)).length;
      const warnings = invalidCount
        ? [`Ignored ${invalidCount} malformed or non-UDS storage entr${invalidCount === 1 ? "y" : "ies"}.`]
        : [];
      return success({ entries: parsed, warnings, writable: true }, warnings);
    } catch {
      return success(
        {
          entries: [],
          warnings: ["UDS record storage contains malformed JSON."],
          writable: false,
        },
        ["Malformed storage was left unchanged."],
      );
    }
  }

  private writeEntries(entries: unknown[]): PersistenceResult<void> {
    return this.storage.write(UDS_RECORDS_STORAGE_KEY, JSON.stringify(entries));
  }

  list(): PersistenceResult<UdsRecord[]> {
    const document = this.readDocument();
    if (!document.ok) return document;
    const records = document.value.entries
      .filter(isUdsRecord)
      .map((record) => deepClone(record))
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
    return success(records, document.value.warnings);
  }

  open(id: string): PersistenceResult<UdsRecord> {
    const listed = this.list();
    if (!listed.ok) return listed;
    const record = listed.value.find((entry) => entry.id === id);
    return record
      ? success(record, listed.warnings)
      : failure("not-found", `UDS record "${id}" was not found.`);
  }

  private save(
    input: SaveUdsRecordInput,
    status: UdsRecord["status"],
  ): PersistenceResult<UdsRecord> {
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing UDS record storage is malformed. It was left unchanged; recover or export it before saving records.",
      );
    }
    const entries = document.value.entries;
    const existingIndex = input.id
      ? entries.findIndex((entry) => isUdsRecord(entry) && entry.id === input.id)
      : -1;
    const existing =
      existingIndex >= 0 && isUdsRecord(entries[existingIndex])
        ? entries[existingIndex]
        : undefined;
    if (existing?.status === "completed") {
      return failure(
        "immutable-record",
        "Completed UDS records are read-only; add a dated addendum instead.",
      );
    }
    const timestamp = this.now();
    const id = existing?.id ?? input.id ?? this.createId();
    const patient: PatientIdentity = {
      name: String(input.patient.name ?? "").trim(),
      dob: String(input.patient.dob ?? "").trim(),
    };
    const record: UdsRecord = {
      ...(existing ?? {}),
      id,
      type: "uds",
      status,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: status === "completed" ? timestamp : "",
      patient,
      summary: String(input.summary ?? ""),
      snapshot: deepClone(input.snapshot),
      addenda: deepClone(existing?.addenda ?? []),
      ...(input.attestation
        ? { attestation: deepClone(input.attestation) }
        : existing?.attestation
          ? { attestation: deepClone(existing.attestation) }
          : {}),
    };
    const nextEntries = entries.slice();
    if (existingIndex >= 0) nextEntries[existingIndex] = record;
    else nextEntries.unshift(record);
    const written = this.writeEntries(nextEntries);
    if (!written.ok) return written;
    return success(deepClone(record), document.value.warnings);
  }

  saveDraft(input: SaveUdsRecordInput): PersistenceResult<UdsRecord> {
    return this.save(input, "draft");
  }

  complete(input: SaveUdsRecordInput): PersistenceResult<UdsRecord> {
    return this.save(input, "completed");
  }

  /**
   * UDS has no legacy engine to fall back on the way Injection's discard
   * does (`window.IPMGRecords.discard`), so this repository owns removing an
   * editable draft outright rather than merely never being called.
   */
  discard(id: string): PersistenceResult<void> {
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing UDS record storage is malformed. It was left unchanged; recover it before discarding a draft.",
      );
    }
    const entries = document.value.entries;
    const index = entries.findIndex((entry) => isUdsRecord(entry) && entry.id === id);
    const current = index >= 0 ? entries[index] : undefined;
    if (!isUdsRecord(current)) {
      return failure("not-found", `UDS record "${id}" was not found.`);
    }
    if (current.status === "completed") {
      return failure(
        "immutable-record",
        "Completed UDS records are read-only and cannot be discarded.",
      );
    }
    const nextEntries = entries.slice();
    nextEntries.splice(index, 1);
    const written = this.writeEntries(nextEntries);
    if (!written.ok) return written;
    return success(undefined, document.value.warnings);
  }

  addAddendum(input: AddUdsAddendumInput): PersistenceResult<UdsRecord> {
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
        "Existing UDS record storage is malformed. It was left unchanged; recover it before saving an addendum.",
      );
    }
    const index = document.value.entries.findIndex(
      (entry) => isUdsRecord(entry) && entry.id === input.recordId,
    );
    const current = index >= 0 ? document.value.entries[index] : undefined;
    if (!isUdsRecord(current)) {
      return failure("not-found", `UDS record "${input.recordId}" was not found.`);
    }
    if (current.status !== "completed") {
      return failure("validation", "Addenda may be added only to completed records.");
    }
    const timestamp = this.now();
    const addendum: UdsAddendum = {
      id: this.createAddendumId(),
      createdAt: timestamp,
      author,
      text,
    };
    const updated: UdsRecord = {
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
  ): PersistenceResult<UdsRecord[]> {
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
        snapshot.device,
        snapshot.lot,
        ...Object.values(snapshot.results ?? {}),
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
