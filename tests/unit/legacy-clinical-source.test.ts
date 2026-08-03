import { describe, expect, it } from "vitest";

import { createLegacyClinicalSource } from "../../src/legacy/clinical-source";
import type { UdsEncounter } from "../../src/domain/uds";

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
});
