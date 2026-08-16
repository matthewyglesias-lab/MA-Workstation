import { describe, expect, it } from "vitest";

import {
  formatWorkstationDate,
  parseWorkstationDate,
} from "../../src/presentation/workflows/WorkstationDateField";

// Fixed reference point so relative entry (T, T-1, N) is deterministic.
const NOW = new Date(2026, 6, 30, 14, 5); // 2026-07-30 14:05 local

describe("parseWorkstationDate — date mode", () => {
  const parse = (raw: string) => parseWorkstationDate(raw, "date", NOW);

  it("accepts six- and eight-digit entry", () => {
    expect(parse("112595")).toBe("1995-11-25");
    expect(parse("11251995")).toBe("1995-11-25");
    expect(parse("030126")).toBe("2026-03-01");
  });

  it("accepts punctuated entry with either separator", () => {
    expect(parse("11/25/95")).toBe("1995-11-25");
    expect(parse("11-25-1995")).toBe("1995-11-25");
    expect(parse("3/1/26")).toBe("2026-03-01");
  });

  it("fills the current year for four-digit day/month entry", () => {
    expect(parse("1125")).toBe("2026-11-25");
    expect(parse("11/25")).toBe("2026-11-25");
  });

  it("windows two-digit years at 49/50", () => {
    expect(parse("010149")).toBe("2049-01-01");
    expect(parse("010150")).toBe("1950-01-01");
  });

  it("resolves T and its day offsets", () => {
    expect(parse("T")).toBe("2026-07-30");
    expect(parse("t")).toBe("2026-07-30");
    expect(parse("TODAY")).toBe("2026-07-30");
    expect(parse("T-1")).toBe("2026-07-29");
    expect(parse("T+30")).toBe("2026-08-29");
  });

  it("crosses month and year boundaries on offsets", () => {
    expect(parseWorkstationDate("T-1", "date", new Date(2026, 0, 1))).toBe(
      "2025-12-31",
    );
    expect(parseWorkstationDate("T+1", "date", new Date(2026, 11, 31))).toBe(
      "2027-01-01",
    );
  });

  it("treats empty entry as a cleared value, not a rejection", () => {
    expect(parse("")).toBe("");
    expect(parse("   ")).toBe("");
  });

  it("rejects impossible calendar dates", () => {
    expect(parse("023026")).toBeNull(); // Feb 30
    expect(parse("133026")).toBeNull(); // month 13
    expect(parse("000126")).toBeNull(); // month 0
    expect(parse("010026")).toBeNull(); // day 0
  });

  it("accepts a real leap day and rejects a false one", () => {
    expect(parse("022924")).toBe("2024-02-29");
    expect(parse("022925")).toBeNull();
  });

  it("rejects malformed entry rather than guessing", () => {
    expect(parse("abc")).toBeNull();
    expect(parse("12345")).toBeNull();
    expect(parse("11/25/95/01")).toBeNull();
    expect(parse("T-")).toBeNull();
    expect(parse("11 25")).toBeNull();
  });
});

describe("parseWorkstationDate — datetime mode", () => {
  const parse = (raw: string) => parseWorkstationDate(raw, "datetime", NOW);

  it("pairs a date with 24-hour time", () => {
    expect(parse("112595 0930")).toBe("1995-11-25T09:30");
    expect(parse("112595 09:30")).toBe("1995-11-25T09:30");
    expect(parse("112595 930")).toBe("1995-11-25T09:30");
    expect(parse("112595 1430")).toBe("1995-11-25T14:30");
  });

  it("defaults a bare date to midnight", () => {
    expect(parse("112595")).toBe("1995-11-25T00:00");
    expect(parse("T")).toBe("2026-07-30T00:00");
  });

  it("resolves N to the current date and time together", () => {
    expect(parse("N")).toBe("2026-07-30T14:05");
    expect(parse("NOW")).toBe("2026-07-30T14:05");
  });

  it("combines relative dates with explicit times", () => {
    expect(parse("T-1 0800")).toBe("2026-07-29T08:00");
  });

  it("rejects out-of-range times", () => {
    expect(parse("112595 2460")).toBeNull();
    expect(parse("112595 2500")).toBeNull();
    expect(parse("112595 xyz")).toBeNull();
    expect(parse("112595 0930 extra")).toBeNull();
  });
});

describe("formatWorkstationDate", () => {
  it("renders stored ISO values in the register's MM/DD/YY form", () => {
    expect(formatWorkstationDate("1995-11-25", "date")).toBe("11/25/95");
    expect(formatWorkstationDate("2026-03-01", "date")).toBe("03/01/26");
  });

  it("appends 24-hour time in datetime mode", () => {
    expect(formatWorkstationDate("1995-11-25T09:30", "datetime")).toBe(
      "11/25/95 0930",
    );
  });

  it("drops the time component when the field is date-only", () => {
    expect(formatWorkstationDate("1995-11-25T09:30", "date")).toBe("11/25/95");
  });

  it("returns empty for unset or unparseable stored values", () => {
    expect(formatWorkstationDate("", "date")).toBe("");
    expect(formatWorkstationDate("not-a-date", "date")).toBe("");
  });

  it("round-trips every value the parser produces", () => {
    for (const raw of ["112595", "T", "T-1", "030126", "022924"]) {
      const iso = parseWorkstationDate(raw, "date", NOW);
      expect(iso).not.toBeNull();
      const shown = formatWorkstationDate(iso as string, "date");
      expect(parseWorkstationDate(shown, "date", NOW)).toBe(iso);
    }
  });
});
