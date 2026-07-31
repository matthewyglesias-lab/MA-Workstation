import { activityLogStorageKey } from "./keys";
import {
  deepClone,
  failure,
  success,
  type PersistenceResult,
  type SafeStorage,
} from "./storage";

export interface ActivityLogEntry extends Record<string, unknown> {
  type: "injection" | "uds" | "sample" | "forms";
  status: "completed" | "needs_review";
  time: string;
  pt: string;
  summary: string;
  details?: string;
  trace?: string;
  follow?: string;
  by?: string;
}

interface StoredActivityLog {
  entries: ActivityLogEntry[];
  warnings: string[];
  writable: boolean;
}

export class ActivityLogRepository {
  constructor(
    private readonly storage: SafeStorage,
    private readonly localDate: string,
  ) {}

  get key(): string {
    return activityLogStorageKey(this.localDate);
  }

  private readDocument(): PersistenceResult<StoredActivityLog> {
    const raw = this.storage.read(this.key);
    if (!raw.ok) return raw;
    if (!raw.value) return success({ entries: [], warnings: [], writable: true });
    try {
      const parsed: unknown = JSON.parse(raw.value);
      if (!Array.isArray(parsed)) {
        const warnings = ["Activity log storage was malformed and was left unchanged."];
        return success({ entries: [], warnings, writable: false }, warnings);
      }
      return success({
        entries: deepClone(parsed) as ActivityLogEntry[],
        warnings: [],
        writable: true,
      });
    } catch {
      const warnings = ["Activity log JSON was malformed and was left unchanged."];
      return success({ entries: [], warnings, writable: false }, warnings);
    }
  }

  list(): PersistenceResult<ActivityLogEntry[]> {
    const document = this.readDocument();
    if (!document.ok) return document;
    return success(deepClone(document.value.entries), document.value.warnings);
  }

  append(entry: ActivityLogEntry): PersistenceResult<ActivityLogEntry[]> {
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing activity log storage is malformed. It was left unchanged; recover or export it before adding entries.",
      );
    }
    const next = [...document.value.entries, deepClone(entry)];
    const written = this.storage.write(this.key, JSON.stringify(next));
    if (!written.ok) return written;
    return success(deepClone(next), document.value.warnings);
  }

  replace(entries: ActivityLogEntry[]): PersistenceResult<ActivityLogEntry[]> {
    if (!Array.isArray(entries)) {
      return failure("validation", "Activity log entries must be an array.");
    }
    const document = this.readDocument();
    if (!document.ok) return document;
    if (!document.value.writable) {
      return failure(
        "invalid-data",
        "Existing activity log storage is malformed. It was left unchanged; recover or export it before replacing entries.",
      );
    }
    const next = deepClone(entries);
    const written = this.storage.write(this.key, JSON.stringify(next));
    if (!written.ok) return written;
    return success(next);
  }
}
