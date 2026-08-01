import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LOG_FILTERS,
  activityLogDateKey,
  activityLogStats,
  activityLogStatusLabel,
  activityLogStorageKey,
  activityLogTypeLabel,
  filterActivityLog,
  needsReviewEntries,
  parseActivityLog,
  type ActivityLogEntry,
} from "../../src/domain/activity-log";

const entry = (partial: Partial<ActivityLogEntry>): ActivityLogEntry => ({
  type: "injection",
  status: "completed",
  ...partial,
});

describe("activityLogDateKey / activityLogStorageKey", () => {
  it("formats as YYYY-MM-DD matching legacy's localDateKey()", () => {
    const date = new Date(2026, 6, 9); // July 9, 2026 (month is 0-indexed)
    expect(activityLogDateKey(date)).toBe("2026-07-09");
    expect(activityLogStorageKey(date)).toBe("ipmgMedAssistActivityLog_2026-07-09");
  });
});

describe("parseActivityLog", () => {
  it("returns an empty array for null, malformed JSON, or non-array payloads", () => {
    expect(parseActivityLog(null)).toEqual([]);
    expect(parseActivityLog("{not json")).toEqual([]);
    expect(parseActivityLog(JSON.stringify({ not: "an array" }))).toEqual([]);
  });

  it("drops non-object entries and defaults missing/invalid fields defensively", () => {
    const parsed = parseActivityLog(
      JSON.stringify([
        "not an object",
        { type: "uds", status: "needs_review", pt: "Draft, Patient", summary: "test" },
        { type: "bogus-type", status: "bogus-status" },
      ]),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ type: "uds", status: "needs_review", pt: "Draft, Patient" });
    // Unknown type/status fall back to the same defaults legacy's own
    // logTypeLabel()/logStatusLabel() treat as their base case.
    expect(parsed[1]).toMatchObject({ type: "injection", status: "completed" });
  });
});

describe("activityLogStats", () => {
  it("counts totals by type and status", () => {
    const entries = [
      entry({ type: "injection", status: "completed" }),
      entry({ type: "injection", status: "needs_review" }),
      entry({ type: "uds", status: "completed" }),
      entry({ type: "sample", status: "completed" }),
      entry({ type: "forms", status: "needs_review" }),
    ];
    expect(activityLogStats(entries)).toEqual({
      total: 5,
      injection: 2,
      uds: 1,
      sample: 1,
      forms: 1,
      completed: 3,
      review: 2,
    });
  });
});

describe("needsReviewEntries", () => {
  it("returns only needs_review entries, tagged with their original index", () => {
    const entries = [
      entry({ status: "completed" }),
      entry({ status: "needs_review", pt: "Review Me" }),
    ];
    const review = needsReviewEntries(entries);
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ pt: "Review Me", index: 1 });
  });
});

describe("filterActivityLog", () => {
  const entries = [
    entry({ type: "injection", status: "completed" }),
    entry({ type: "uds", status: "needs_review" }),
    entry({ type: "sample", status: "completed" }),
  ];

  it("'all' returns everything", () => {
    expect(filterActivityLog(entries, "all")).toHaveLength(3);
  });

  it("filters by entry type", () => {
    expect(filterActivityLog(entries, "uds")).toHaveLength(1);
  });

  it("filters by status", () => {
    expect(filterActivityLog(entries, "needs_review")).toHaveLength(1);
    expect(filterActivityLog(entries, "completed")).toHaveLength(2);
  });
});

describe("label helpers", () => {
  it("match legacy's logTypeLabel()/logStatusLabel() exactly", () => {
    expect(activityLogTypeLabel("injection")).toBe("Injection");
    expect(activityLogTypeLabel("uds")).toBe("UDS");
    expect(activityLogTypeLabel("sample")).toBe("Sample");
    expect(activityLogTypeLabel("forms")).toBe("Forms");
    expect(activityLogStatusLabel("needs_review")).toBe("Needs review");
    expect(activityLogStatusLabel("completed")).toBe("Completed");
  });

  it("ACTIVITY_LOG_FILTERS matches legacy's LOG_FILTERS order and labels", () => {
    expect(ACTIVITY_LOG_FILTERS.map((f) => f.key)).toEqual([
      "all",
      "injection",
      "uds",
      "sample",
      "forms",
      "needs_review",
      "completed",
    ]);
  });
});
