import { describe, expect, it } from "vitest";

import { createLegacyClinicalSource } from "../../src/legacy/clinical-source";
import type { UdsEncounter } from "../../src/domain/uds";
import type { InjectionEncounter } from "../../src/domain/injection";

/**
 * The typed panels hold their own encounter state, but the shell re-reads the
 * encounter out of the hidden legacy mirror to evaluate it. Any field the
 * mirror drops is therefore invisible to the engine no matter what the
 * operator typed - and a field the reader hardcodes is worse still, because
 * it silently pins a gate shut.
 */
const sourceWith = (profile: Record<string, unknown>) =>
  createLegacyClinicalSource({
    // Nothing in these tests depends on a real field value; the reader falls
    // back to "" for every id it cannot find.
    document: { getElementById: () => null } as unknown as Document,
    window: {
      __IPMG_RC538_UDS_PROFILE__: profile,
    } as unknown as Window & typeof globalThis,
  });

const readUds = (profile: Record<string, unknown>): UdsEncounter =>
  sourceWith(profile).read("uds").encounter as UdsEncounter;

describe("legacy clinical source: UDS device profile", () => {
  it("round-trips the custom-panel-set confirmation for an uncatalogued device", () => {
    // Regression: this was hardcoded false, so the "Other point-of-care UDS
    // cup" stop could never clear and the screen was unfinishable.
    expect(readUds({ customPanelSetVerified: true }).customPanelSetVerified).toBe(true);
    expect(readUds({ customPanelSetVerified: false }).customPanelSetVerified).toBe(false);
    expect(readUds({}).customPanelSetVerified).toBe(false);
  });

  it("round-trips the physical-readings confirmation", () => {
    expect(readUds({ readingsVerified: true }).physicalReadingsVerified).toBe(true);
    expect(readUds({}).physicalReadingsVerified).toBe(false);
  });

  it("only accepts an omitted panel that is a real analyte", () => {
    expect(readUds({ omitted: "PPX" }).omittedPanel).toBe("PPX");
    expect(readUds({ omitted: "NOPE" }).omittedPanel).toBe("");
  });

  it("does not turn a blank medication review into an affirmative default", () => {
    const encounter = sourceWith({}).read("uds").encounter as UdsEncounter;
    expect(encounter.medicationAlignment).toBe("");
  });
});

describe("legacy clinical source: injection documentation metadata", () => {
  it("round-trips the audited next-dose override fields", () => {
    const source = createLegacyClinicalSource({
      document: { getElementById: () => null } as unknown as Document,
      window: {
        ipmgLegacyClinicalStateSnapshot: () => ({
          injection: {
            documentation: {
              nextDose: {
                value: "2030-01-15",
                source: "manual",
                calculatedFrom: "2026-07-30|q4wk",
                overrideKind: "provider-direction",
                overrideReason: "Documented treatment-plan date",
                overrideProvider: "Jane Doe, MD",
                recordedAt: "2026-07-30T17:00:00.000Z",
              },
            },
          },
        }),
      } as unknown as Window & typeof globalThis,
    });
    const encounter = source.read("injection").encounter as InjectionEncounter;
    expect(encounter.details?.nextDose).toEqual({
      value: "2030-01-15",
      source: "manual",
      calculatedFrom: "2026-07-30|q4wk",
      overrideKind: "provider-direction",
      overrideReason: "Documented treatment-plan date",
      overrideProvider: "Jane Doe, MD",
      recordedAt: "2026-07-30T17:00:00.000Z",
    });
    // The runtime's hidden #nextDate may have been cleared by a legacy
    // medication selection while this durable manual provenance remains.
    // The typed encounter must restore the actual active-order return date.
    expect(encounter.nextDoseDate).toBe("2030-01-15");
  });

  it("keeps a pre-provenance Other return date for explicit active-order review", () => {
    const values = new Map<string, string>([["nextDate", "2030-02-12"]]);
    const source = createLegacyClinicalSource({
      document: {
        getElementById: (id: string) =>
          values.has(id) ? ({ value: values.get(id) } as HTMLInputElement) : null,
      } as unknown as Document,
      window: {
        ipmgLegacyClinicalStateSnapshot: () => ({
          injection: {
            medicationKey: "other",
            customMedication: "Legacy custom product",
          },
        }),
      } as unknown as Window & typeof globalThis,
    });

    const encounter = source.read("injection").encounter as InjectionEncounter;
    expect(encounter.nextDoseDate).toBe("2030-02-12");
    // It predates durable provenance, so the typed UI must retain it as a
    // legacy value requiring review rather than calling it calculated or a
    // verified manual active-order date.
    expect(encounter.details?.nextDose).toBeUndefined();
  });
});
