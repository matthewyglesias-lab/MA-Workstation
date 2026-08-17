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
  { id: "rivera-a", family: "Rivera", given: "A.", credential: "PMHNP", prescriber: true },
  { id: "chen-m", family: "Chen", given: "M.", credential: "MD", prescriber: true },
  { id: "talk-t", family: "Talk", given: "T.", credential: "LMFT", prescriber: false },
  { id: "past-p", family: "Past", given: "P.", credential: "DO", prescriber: true, inactive: true },
];

describe("San Bernardino register", () => {
  it("is populated from the clinic's own schedule", () => {
    expect(SAN_BERNARDINO_PROVIDERS.length).toBe(10);
    expect(hasProviderRegister()).toBe(true);
  });

  // An LMFT cannot write a medication order. Nine of the ten San Bernardino
  // clinicians appear on the licensure tab; Randall Stier correctly does not.
  it("marks exactly the non-prescribing clinician as such", () => {
    const nonPrescribers = SAN_BERNARDINO_PROVIDERS.filter((p) => !p.prescriber);
    expect(nonPrescribers.map((p) => p.id)).toEqual(["stier-randall"]);
    expect(nonPrescribers[0]!.credential).toBe("LMFT");
  });

  it("withholds the non-prescriber from ordering fields but keeps them registered", () => {
    const ordering = providerRegisterOptions(undefined, { prescribersOnly: true });
    const all = providerRegisterOptions();
    expect(ordering.length).toBe(9);
    expect(all.length).toBe(10);
    expect(ordering.some((o) => o.key === "stier-randall")).toBe(false);
    expect(resolveProviderDisplay("stier-randall")).toBe("Stier, Randall, LMFT");
  });

  it("gives every provider a credential and a non-empty name", () => {
    for (const provider of SAN_BERNARDINO_PROVIDERS) {
      expect(provider.credential).not.toBe("");
      expect(provider.family).not.toBe("");
      expect(provider.given).not.toBe("");
      expect(provider.id).toMatch(/^[a-z-]+$/);
    }
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
    expect(
      formatProviderName({ id: "x", family: "Solo", given: "S.", credential: "", prescriber: true }),
    ).toBe("Solo, S.");
  });
});

describe("providerRegisterOptions", () => {
  it("offers active providers and withholds inactive ones from new entry", () => {
    const keys = providerRegisterOptions(SAMPLE).map((option) => option.key);
    expect(keys).toEqual(["rivera-a", "chen-m", "talk-t"]);
  });

  it("withholds non-prescribers when the field orders medication", () => {
    const keys = providerRegisterOptions(SAMPLE, { prescribersOnly: true })
      .map((option) => option.key);
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
    expect(hasProviderRegister([SAMPLE[3]!])).toBe(false);
    expect(hasProviderRegister(SAMPLE)).toBe(true);
    expect(hasProviderRegister([])).toBe(false);
  });

  // A roster of therapists only must still fall back to free text on an
  // ordering field rather than render an empty dropdown.
  it("is false for an ordering field when no one can prescribe", () => {
    expect(hasProviderRegister([SAMPLE[2]!], { prescribersOnly: true })).toBe(false);
    expect(hasProviderRegister([SAMPLE[2]!])).toBe(true);
  });
});
