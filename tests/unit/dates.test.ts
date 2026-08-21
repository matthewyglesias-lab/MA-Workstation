import { describe, expect, it } from "vitest";

import { weekendSnapDates } from "../../src/domain/dates";

describe("weekendSnapDates", () => {
  it("offers the Friday before and Monday after a Saturday date", () => {
    expect(weekendSnapDates("2026-08-22")).toEqual({
      friday: "2026-08-21",
      monday: "2026-08-24",
    });
  });

  it("offers the Friday before and Monday after a Sunday date", () => {
    expect(weekendSnapDates("2026-08-23")).toEqual({
      friday: "2026-08-21",
      monday: "2026-08-24",
    });
  });

  it("returns null for a weekday", () => {
    expect(weekendSnapDates("2026-08-19")).toBeNull();
  });

  it("returns null for an empty or invalid date", () => {
    expect(weekendSnapDates("")).toBeNull();
    expect(weekendSnapDates("2026-13-40")).toBeNull();
  });
});
