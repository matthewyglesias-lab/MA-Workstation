import { describe, expect, it } from "vitest";

import {
  SAMPLE_INTENTS,
  SAMPLE_MEDICATIONS,
  SAMPLE_MEDICATIONS_BY_KEY,
  sampleMedicationDefaults,
} from "../../src/domain/samples-catalog";

describe("SAMPLE_MEDICATIONS", () => {
  it("includes every catalog medication in the by-key lookup", () => {
    for (const medication of SAMPLE_MEDICATIONS) {
      expect(SAMPLE_MEDICATIONS_BY_KEY[medication.key]).toBe(medication);
    }
  });

  it("includes the manual-entry 'other' fallback", () => {
    expect(SAMPLE_MEDICATIONS_BY_KEY.other).toBeDefined();
    expect(SAMPLE_MEDICATIONS_BY_KEY.other.sigOptions).toHaveLength(1);
  });

  it("every medication has at least one sig option", () => {
    for (const medication of SAMPLE_MEDICATIONS) {
      expect(medication.sigOptions.length).toBeGreaterThan(0);
    }
  });
});

describe("sampleMedicationDefaults", () => {
  it("builds the label/purpose/directions/quantity for the first sig option", () => {
    const trintellix = SAMPLE_MEDICATIONS_BY_KEY.trintellix;
    const defaults = sampleMedicationDefaults(trintellix);
    expect(defaults.medicationLabel).toBe("Trintellix 5 mg tablet (vortioxetine)");
    expect(defaults.purpose).toBe("Medication sample start");
    expect(defaults.directions).toContain("Take 1 tablet by mouth once daily");
    expect(defaults.quantity).toBe("7–14 tablets or sample card");
    expect(defaults.foodInstructions).toBe("auto");
  });

  it("picks a later sig option by index, including its titration guidance", () => {
    const vraylar = SAMPLE_MEDICATIONS_BY_KEY.vraylar;
    const defaults = sampleMedicationDefaults(vraylar, 3);
    expect(defaults.medicationLabel).toContain("1.5 mg capsule");
    expect(defaults.titration).toContain("indication-specific");
  });

  it("falls back to the medication's first strength/defaultSig when a sig option omits them", () => {
    const other = SAMPLE_MEDICATIONS_BY_KEY.other;
    const defaults = sampleMedicationDefaults(other);
    expect(defaults.directions).toBe("Take exactly as prescribed by your provider.");
  });
});

describe("SAMPLE_INTENTS", () => {
  it("matches the legacy prescriber-intent option values", () => {
    expect(SAMPLE_INTENTS.map((intent) => intent.value)).toEqual([
      "Medication sample start",
      "Titration / starter pack",
      "Bridge until pharmacy fill",
      "Dose change sample",
      "Tolerability trial",
      "Continuation sample",
    ]);
  });

  it("every intent has a non-empty patient-facing note", () => {
    for (const intent of SAMPLE_INTENTS) {
      expect(intent.note.trim().length).toBeGreaterThan(0);
    }
  });
});
