/**
 * Daily Closeout has no encounter and no domain engine - it's a read-only
 * dashboard over the SAME per-day activity log every other workflow's
 * "Add to log" action already writes to localStorage (legacy-runtime.js's
 * LOG/appendLogEntry()/saveLog()). This module is a typed reader over that
 * same storage key, not a write path - entries are still added by the
 * originating workflow, never by this panel.
 */

export type ActivityLogEntryType = "injection" | "uds" | "sample" | "forms";
export type ActivityLogEntryStatus = "needs_review" | "completed";

export interface ActivityLogEntry {
  time?: string;
  type: ActivityLogEntryType;
  status: ActivityLogEntryStatus;
  pt?: string;
  summary?: string;
  details?: string;
  trace?: string;
  follow?: string;
  by?: string;
}

const ENTRY_TYPES = new Set<ActivityLogEntryType>(["injection", "uds", "sample", "forms"]);

export const activityLogDateKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const activityLogStorageKey = (date: Date = new Date()): string =>
  `ipmgMedAssistActivityLog_${activityLogDateKey(date)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Defensive parse - malformed/legacy-incompatible entries are dropped rather than crashing the panel. */
export const parseActivityLog = (raw: string | null): ActivityLogEntry[] => {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord).map((entry) => ({
    time: typeof entry.time === "string" ? entry.time : undefined,
    type: ENTRY_TYPES.has(entry.type as ActivityLogEntryType) ? (entry.type as ActivityLogEntryType) : "injection",
    status: entry.status === "needs_review" ? "needs_review" : "completed",
    pt: typeof entry.pt === "string" ? entry.pt : undefined,
    summary: typeof entry.summary === "string" ? entry.summary : undefined,
    details: typeof entry.details === "string" ? entry.details : undefined,
    trace: typeof entry.trace === "string" ? entry.trace : undefined,
    follow: typeof entry.follow === "string" ? entry.follow : undefined,
    by: typeof entry.by === "string" ? entry.by : undefined,
  }));
};

export const readTodayActivityLog = (date: Date = new Date()): ActivityLogEntry[] => {
  try {
    return parseActivityLog(window.localStorage.getItem(activityLogStorageKey(date)));
  } catch {
    return [];
  }
};

export interface ActivityLogStats {
  total: number;
  injection: number;
  uds: number;
  sample: number;
  forms: number;
  completed: number;
  review: number;
}

export const activityLogStats = (entries: readonly ActivityLogEntry[]): ActivityLogStats => {
  const count = (type: ActivityLogEntryType) => entries.filter((entry) => entry.type === type).length;
  return {
    total: entries.length,
    injection: count("injection"),
    uds: count("uds"),
    sample: count("sample"),
    forms: count("forms"),
    completed: entries.filter((entry) => entry.status === "completed").length,
    review: entries.filter((entry) => entry.status === "needs_review").length,
  };
};

export const needsReviewEntries = (
  entries: readonly ActivityLogEntry[],
): Array<ActivityLogEntry & { index: number }> =>
  entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.status === "needs_review");

export type ActivityLogFilter = "all" | ActivityLogEntryType | ActivityLogEntryStatus;

export const ACTIVITY_LOG_FILTERS: ReadonlyArray<{ key: ActivityLogFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "injection", label: "Injections" },
  { key: "uds", label: "UDS" },
  { key: "sample", label: "Samples" },
  { key: "forms", label: "Forms" },
  { key: "needs_review", label: "Needs review" },
  { key: "completed", label: "Completed" },
];

export const filterActivityLog = (
  entries: readonly ActivityLogEntry[],
  filter: ActivityLogFilter,
): ActivityLogEntry[] => {
  if (filter === "all") return [...entries];
  if (filter === "needs_review" || filter === "completed") {
    return entries.filter((entry) => entry.status === filter);
  }
  return entries.filter((entry) => entry.type === filter);
};

export const activityLogTypeLabel = (type: ActivityLogEntryType): string =>
  type === "uds" ? "UDS" : type === "sample" ? "Sample" : type === "forms" ? "Forms" : "Injection";

export const activityLogStatusLabel = (status: ActivityLogEntryStatus): string =>
  status === "needs_review" ? "Needs review" : "Completed";
