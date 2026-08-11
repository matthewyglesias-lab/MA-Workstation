import { describe, expect, it } from "vitest";

import { formatDobAsTyped } from "../../src/presentation/format-dob";

describe("formatDobAsTyped", () => {
  it("inserts slashes as digits accumulate while typing forward", () => {
    expect(formatDobAsTyped("0")).toBe("0");
    expect(formatDobAsTyped("01")).toBe("01");
    expect(formatDobAsTyped("010")).toBe("01/0");
    expect(formatDobAsTyped("0102")).toBe("01/02");
    expect(formatDobAsTyped("01021")).toBe("01/02/1");
    expect(formatDobAsTyped("01021990")).toBe("01/02/1990");
  });

  it("strips non-digit characters before rebuilding slashes", () => {
    expect(formatDobAsTyped("01/02/1990")).toBe("01/02/1990");
    expect(formatDobAsTyped("01-02-1990")).toBe("01/02/1990");
    expect(formatDobAsTyped("ab01cd02ef1990")).toBe("01/02/1990");
  });

  it("drops the trailing formatted segment as digits are removed (backspacing)", () => {
    expect(formatDobAsTyped("01/02/199")).toBe("01/02/199");
    expect(formatDobAsTyped("01/0")).toBe("01/0");
    expect(formatDobAsTyped("01/")).toBe("01");
    expect(formatDobAsTyped("0")).toBe("0");
    expect(formatDobAsTyped("")).toBe("");
  });

  it("caps at 8 digits (MMDDYYYY) and ignores anything typed beyond that", () => {
    expect(formatDobAsTyped("010219905555")).toBe("01/02/1990");
  });
});
