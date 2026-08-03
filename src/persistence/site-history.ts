import { SITE_HISTORY_STORAGE_KEY } from "./keys";
import {
  deepClone,
  failure,
  isPlainObject,
  success,
  type PersistenceResult,
  type SafeStorage,
} from "./storage";

export interface SiteHistoryEntry extends Record<string, unknown> {
  site: string;
  date: string;
  medKey: string;
  route: string;
  recordId: string;
  fingerprint: string;
  storedAt: string;
}

export interface RecordSiteHistoryInput {
  patientName: string;
  dob: string;
  site: string;
  date: string;
  medKey: string;
  route: string;
  recordId?: string;
}

export const siteHistoryPatientKey = (name: string, dob: string): string => {
  const patient = name.trim().toLocaleLowerCase();
  const birthDate = dob.trim().toLocaleLowerCase();
  return patient && birthDate ? `${patient}|${birthDate}` : "";
};

interface StoredSiteHistory {
  document: Record<string, unknown>;
  warnings: string[];
  writable: boolean;
}

export class SiteHistoryRepository {
  constructor(
    private readonly storage: SafeStorage,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private read(): PersistenceResult<StoredSiteHistory> {
    const raw = this.storage.read(SITE_HISTORY_STORAGE_KEY);
    if (!raw.ok) return raw;
    if (!raw.value) return success({ document: {}, warnings: [], writable: true });
    try {
      const parsed: unknown = JSON.parse(raw.value);
      return isPlainObject(parsed)
        ? success({ document: parsed, warnings: [], writable: true })
        : success(
            {
              document: {},
              warnings: ["Site history storage was malformed and was left unchanged."],
              writable: false,
            },
            ["Site history storage was malformed and was left unchanged."],
          );
    } catch {
      const warnings = ["Site history JSON was malformed and was left unchanged."];
      return success({ document: {}, warnings, writable: false }, warnings);
    }
  }

  list(patientName: string, dob: string): PersistenceResult<SiteHistoryEntry[]> {
    const key = siteHistoryPatientKey(patientName, dob);
    if (!key) return success([]);
    const stored = this.read();
    if (!stored.ok) return stored;
    const entries = stored.value.document[key];
    const validEntries = Array.isArray(entries)
      ? entries.filter(isPlainObject) as SiteHistoryEntry[]
      : [];
    const warnings = [
      ...stored.value.warnings,
      ...(entries !== undefined && !Array.isArray(entries)
        ? ["The selected patient's site-history entry was malformed and was left unchanged."]
        : []),
      ...(Array.isArray(entries) && validEntries.length !== entries.length
        ? ["Malformed entries in the selected patient's site history were ignored and left unchanged."]
        : []),
    ];
    return success(deepClone(validEntries), warnings);
  }

  record(input: RecordSiteHistoryInput): PersistenceResult<SiteHistoryEntry> {
    const key = siteHistoryPatientKey(input.patientName, input.dob);
    if (
      !key ||
      !input.site.trim() ||
      !input.date.trim() ||
      !input.medKey.trim() ||
      !input.route.trim()
    ) {
      return failure(
        "validation",
        "Site history requires patient name, DOB, site, date, medication, and route.",
      );
    }
    const stored = this.read();
    if (!stored.ok) return stored;
    if (!stored.value.writable) {
      return failure(
        "invalid-data",
        "Existing site history storage is malformed. It was left unchanged; recover or export it before recording a site.",
      );
    }
    const currentPatientHistory = stored.value.document[key];
    if (
      currentPatientHistory !== undefined &&
      (!Array.isArray(currentPatientHistory) ||
        currentPatientHistory.some((entry) => !isPlainObject(entry)))
    ) {
      return failure(
        "invalid-data",
        "The selected patient's stored site history is malformed. It was left unchanged; recover it before recording another site.",
      );
    }
    const prior = Array.isArray(currentPatientHistory)
      ? (deepClone(currentPatientHistory) as SiteHistoryEntry[])
      : [];
    const recordId = input.recordId?.trim() ?? "";
    const fingerprint = [input.date, input.medKey, input.route, input.site].join("|");
    const entry: SiteHistoryEntry = {
      site: input.site.trim(),
      date: input.date,
      medKey: input.medKey.trim(),
      route: input.route.trim(),
      recordId,
      fingerprint,
      storedAt: this.now(),
    };
    const deduplicated = prior.filter((item) =>
      recordId ? item.recordId !== recordId : item.fingerprint !== fingerprint,
    );
    const nextDocument = {
      ...stored.value.document,
      [key]: [...deduplicated, entry].slice(-12),
    };
    const written = this.storage.write(SITE_HISTORY_STORAGE_KEY, JSON.stringify(nextDocument));
    if (!written.ok) return written;
    return success(deepClone(entry), stored.value.warnings);
  }

  last(
    patientName: string,
    dob: string,
    medKey: string,
    route: string,
  ): PersistenceResult<SiteHistoryEntry | null> {
    const listed = this.list(patientName, dob);
    if (!listed.ok) return listed;
    const matching = listed.value
      .filter((entry) => entry.medKey === medKey && entry.route === route)
      .sort((a, b) =>
        `${a.date ?? ""}|${a.storedAt ?? ""}`.localeCompare(
          `${b.date ?? ""}|${b.storedAt ?? ""}`,
        ),
      );
    return success(matching.at(-1) ?? null, listed.warnings);
  }
}
