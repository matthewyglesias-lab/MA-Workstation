import { describe, expect, it } from "vitest";

import {
  OTHER_PROVIDER_KEY,
  SAN_BERNARDINO_PROVIDERS,
  findRegisteredProvider,
  formatProviderName,
  hasProviderRegister,
  providerRegisterOptions,
  resolveProviderDisplay,
  type RegisteredProvider,
} from "../../src/domain/provider-register";

const SAMPLE: ReadonlyArray<RegisteredProvider> = [
  { id: "rivera-a", family: "Rivera", given: "A.", credential: "PMHNP" },
  { id: "chen-m", family: "Chen", given: "M.", credential: "MD" },
  { id: "past-p", family: "Past", given: "P.", credential: "DO", inactive: true },
];

describe("San Bernardino register", () => {
  // Deliberately empty until the clinic supplies its own roster. Populating it
  // from a directory aggregator would put departed or wrong-site providers in
  // the ordering-provider field, which is a documentation error.
  it("ships empty rather than guessing at a roster", () => {
    expect(SAN_BERNARDINO_PROVIDERS).toEqual([]);
    expect(hasProviderRegister()).toBe(false);
  });

  it("keeps every id unique so a stored record resolves to one provider", () => {
    const ids = SAN_BERNARDINO_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("formatProviderName", () => {
  it("renders family, given, credential in charting order", () => {
    expect(formatProviderName(SAMPLE[0]!)).toBe("Rivera, A., PMHNP");
  });

  it("omits a missing credential without leaving a dangling comma", () => {
    expect(formatProviderName({ id: "x", family: "Solo", given: "S.", credential: "" }))
      .toBe("Solo, S.");
  });
});

describe("providerRegisterOptions", () => {
  it("offers active providers and withholds inactive ones from new entry", () => {
    const keys = providerRegisterOptions(SAMPLE).map((option) => option.key);
    expect(keys).toEqual(["rivera-a", "chen-m"]);
  });

  it("is empty when the register is", () => {
    expect(providerRegisterOptions([])).toEqual([]);
  });

  it("never collides with the Other sentinel", () => {
    expect(providerRegisterOptions(SAMPLE).some((o) => o.key === OTHER_PROVIDER_KEY))
      .toBe(false);
  });
});

describe("resolveProviderDisplay", () => {
  it("resolves a stored id to the formatted name", () => {
    expect(resolveProviderDisplay("rivera-a", SAMPLE)).toBe("Rivera, A., PMHNP");
  });

  // Records written before the register - and every Other entry - hold typed
  // text. Rewriting or dropping those would corrupt existing local records.
  it("passes through free text that matches no id", () => {
    expect(resolveProviderDisplay("Dr. Someone Else", SAMPLE)).toBe("Dr. Someone Else");
    expect(resolveProviderDisplay("  Dr. Spaced  ", SAMPLE)).toBe("Dr. Spaced");
  });

  it("still resolves an inactive provider so old records keep reading right", () => {
    expect(resolveProviderDisplay("past-p", SAMPLE)).toBe("Past, P., DO");
  });

  it("is empty for an unset provider", () => {
    expect(resolveProviderDisplay("", SAMPLE)).toBe("");
    expect(resolveProviderDisplay("   ", SAMPLE)).toBe("");
  });
});

describe("findRegisteredProvider", () => {
  it("finds active and inactive entries by id, and nothing for free text", () => {
    expect(findRegisteredProvider("chen-m", SAMPLE)?.family).toBe("Chen");
    expect(findRegisteredProvider("past-p", SAMPLE)?.family).toBe("Past");
    expect(findRegisteredProvider("Dr. Typed", SAMPLE)).toBeUndefined();
    expect(findRegisteredProvider("", SAMPLE)).toBeUndefined();
  });
});

describe("hasProviderRegister", () => {
  it("is false when the register holds only inactive providers", () => {
    expect(hasProviderRegister([SAMPLE[2]!])).toBe(false);
    expect(hasProviderRegister(SAMPLE)).toBe(true);
    expect(hasProviderRegister([])).toBe(false);
  });
});
