import { describe, expect, it } from "vitest";
import {
  addInjectionInterval,
  clinicDateAt,
  elapsedCalendarDays,
  injectionIntervalLabel,
} from "../src/shared/injection-schedule.js";

describe("injection order comparison arithmetic", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2028-02-29", 12, "2029-02-28"],
    ["2026-01-31", 2, "2026-03-31"],
    ["2026-08-31", 6, "2027-02-28"],
    ["2026-12-31", 1, "2027-01-31"],
  ])("adds true calendar months from %s", (anchor, every, expected) => {
    expect(addInjectionInterval(anchor, { every, unit: "months" })).toBe(
      expected,
    );
  });

  it("keeps calendar months distinct from four-week or 30-day schedules", () => {
    const anchor = "2026-01-31";
    expect(addInjectionInterval(anchor, { every: 4, unit: "weeks" })).toBe(
      "2026-02-28",
    );
    expect(addInjectionInterval(anchor, { every: 30, unit: "days" })).toBe(
      "2026-03-02",
    );
    expect(
      addInjectionInterval("2026-03-31", { every: 1, unit: "months" }),
    ).toBe("2026-04-30");
    expect(
      addInjectionInterval("2026-03-31", { every: 4, unit: "weeks" }),
    ).toBe("2026-04-28");
  });

  it("uses the clinic date and counts calendar days across daylight saving", () => {
    const zone = "America/Los_Angeles";
    expect(clinicDateAt("2026-09-15T01:30:00Z", zone)).toBe("2026-09-14");
    const springStart = clinicDateAt("2026-03-08T09:30:00Z", zone)!;
    const springEnd = clinicDateAt("2026-03-09T08:30:00Z", zone)!;
    expect(elapsedCalendarDays(springStart, springEnd)).toBe(1);
    const fallStart = clinicDateAt("2026-11-01T08:30:00Z", zone)!;
    const fallEnd = clinicDateAt("2026-11-02T09:30:00Z", zone)!;
    expect(elapsedCalendarDays(fallStart, fallEnd)).toBe(1);
    expect(elapsedCalendarDays("2026-09-15", "2026-09-15")).toBe(0);
    expect(elapsedCalendarDays("2026-09-15", "2026-09-14")).toBe(-1);
  });

  it("declines impossible dates and invalid intervals without inventing a date", () => {
    for (const anchor of ["2026-02-29", "2026-04-31", "not-a-date", "2026-1-1"])
      expect(
        addInjectionInterval(anchor, { every: 1, unit: "months" }),
      ).toBeNull();
    for (const every of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])
      expect(
        addInjectionInterval("2026-09-15", { every, unit: "months" }),
      ).toBeNull();
    expect(clinicDateAt("not-a-date", "America/Los_Angeles")).toBeNull();
    expect(clinicDateAt("2026-09-15T10:00:00Z", "invalid/timezone")).toBeNull();
    expect(elapsedCalendarDays("2026-02-29", "2026-03-01")).toBeNull();
    expect(
      addInjectionInterval("9999-12-31", { every: 1, unit: "days" }),
    ).toBeNull();
  });

  it("labels the exact prescribed interval", () => {
    expect(injectionIntervalLabel({ every: 1, unit: "months" })).toBe(
      "Every 1 month",
    );
    expect(injectionIntervalLabel({ every: 2, unit: "weeks" })).toBe(
      "Every 2 weeks",
    );
  });
});
