import { describe, expect, it } from "vitest";

import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  INJECTION_PATIENT_SCREEN_RULES,
  buildInjectionPatientScreenDocument,
  canBuildInjectionPatientScreenDocument,
  emptyInjectionEncounter,
  type InjectionEncounter,
  type InjectionMedicationKey,
} from "../../src/domain";
import { isDraftInjectionPatientScreeningEnabled } from "../../src/presentation/workflows/injection/patient-screening-print";

const encounterFor = (medicationKey: InjectionMedicationKey): InjectionEncounter => {
  const reference =
    medicationKey === "other"
      ? undefined
      : INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey];
  return {
    ...emptyInjectionEncounter(),
    patient: { name: "SCREEN, PATIENT", dob: "01/02/1990" },
    medicationKey,
    customMedication: medicationKey === "other" ? "Clinic-supplied medication" : "",
    dose: reference?.catalog.doses[0] ?? "",
    route: reference?.catalog.route ?? "",
    intervalKey: reference?.catalog.intervalKey ?? "",
    reason: "scheduled",
    administrationDate: "2026-08-05",
  };
};

describe("Injection patient screening draft model", () => {
  it("has a complete paired bilingual draft inventory with auditable provenance", () => {
    expect(INJECTION_PATIENT_SCREEN_RULES.length).toBeGreaterThan(3);
    for (const rule of INJECTION_PATIENT_SCREEN_RULES) {
      expect(rule.reviewStatus).toBe("draft");
      expect(rule.copy.en.sectionTitle.trim()).not.toHaveLength(0);
      expect(rule.copy.en.prompt.trim()).not.toHaveLength(0);
      expect(rule.copy.es.sectionTitle.trim()).not.toHaveLength(0);
      expect(rule.copy.es.prompt.trim()).not.toHaveLength(0);
      expect(rule.provenance.labelRevision.trim()).not.toHaveLength(0);
      if (rule.provenance.kind === "product-label") {
        expect(rule.provenance.source.url).toMatch(/^https:\/\//);
        expect(rule.provenance.source.labelRevision).toBe(rule.provenance.labelRevision);
      }
    }
  });

  it("builds source-traceable product content for every catalog medication", () => {
    for (const [medicationKey, reference] of Object.entries(
      INJECTION_CLINICAL_REFERENCE_BUNDLE.medications,
    ) as Array<[Exclude<InjectionMedicationKey, "other">, (typeof INJECTION_CLINICAL_REFERENCE_BUNDLE.medications)[Exclude<InjectionMedicationKey, "other">]]>) {
      const encounter = encounterFor(medicationKey);
      const documentModel = buildInjectionPatientScreenDocument(encounter, "en");
      const items = documentModel.sections.flatMap((section) => section.items);

      expect(documentModel.reviewStatus).toBe("draft");
      expect(documentModel.hasProductSpecificContent).toBe(true);
      expect(documentModel.metadata.medication).toBe(reference.catalog.label);
      expect(documentModel.source?.url).toBe(reference.source.url);
      expect(
        items.some(
          (item) =>
            item.provenance.kind === "product-label" &&
            item.provenance.source.url === reference.source.url,
        ),
      ).toBe(true);
    }
  });

  it("uses the same rules in English and Spanish without changing the selected product", () => {
    const encounter = encounterFor("uzedy");
    encounter.dose = "200 mg";
    encounter.intervalKey = "q4wk";
    const english = buildInjectionPatientScreenDocument(encounter, "en");
    const spanish = buildInjectionPatientScreenDocument(encounter, "es");

    expect(english.metadata.medication).toBe(spanish.metadata.medication);
    expect(english.metadata.dose).toBe("200 mg");
    expect(english.metadata.interval).toBe("q4 wk");
    expect(spanish.labels.draftMarker).toMatch(/BORRADOR/);
    expect(english.labels.draftMarker).toMatch(/DRAFT/);
    expect(spanish.sections.map((section) => section.id)).toEqual(
      english.sections.map((section) => section.id),
    );
  });

  it("adds a dose-and-phase rule only when its source selector matches", () => {
    const encounter = encounterFor("erzofri");
    encounter.dose = "351 mg";
    encounter.reason = "scheduled";
    const routine = buildInjectionPatientScreenDocument(encounter, "en");
    expect(
      routine.sections
        .flatMap((section) => section.items)
        .map((item) => item.id),
    ).toContain("conditional-erzofri-erzofri-351-phase");

    encounter.reason = "initiation";
    const initiation = buildInjectionPatientScreenDocument(encounter, "en");
    expect(
      initiation.sections
        .flatMap((section) => section.items)
        .map((item) => item.id),
    ).not.toContain("conditional-erzofri-erzofri-351-phase");
  });

  it("uses the universal form for Other without inventing product-specific content", () => {
    const documentModel = buildInjectionPatientScreenDocument(encounterFor("other"), "en");
    const items = documentModel.sections.flatMap((section) => section.items);

    expect(documentModel.hasProductSpecificContent).toBe(false);
    expect(documentModel.source).toBeUndefined();
    expect(items.some((item) => item.provenance.kind === "product-label")).toBe(false);
    expect(items.map((item) => item.prompt).join(" ")).toMatch(/clinic-approved medication-specific form/i);
  });

  it("requires a catalog dose, permits Other, and does not mutate the encounter", () => {
    const blank = emptyInjectionEncounter();
    expect(canBuildInjectionPatientScreenDocument(blank)).toBe(false);

    const catalogWithoutDose = encounterFor("aristada");
    catalogWithoutDose.dose = "";
    expect(canBuildInjectionPatientScreenDocument(catalogWithoutDose)).toBe(false);
    expect(canBuildInjectionPatientScreenDocument(encounterFor("other"))).toBe(true);

    const encounter = encounterFor("aristada");
    const before = structuredClone(encounter);
    buildInjectionPatientScreenDocument(encounter, "es");
    expect(encounter).toEqual(before);
  });

  it("defaults the draft feature flag to off and accepts only an explicit preview value", () => {
    expect(isDraftInjectionPatientScreeningEnabled(undefined)).toBe(false);
    expect(isDraftInjectionPatientScreeningEnabled("false")).toBe(false);
    expect(isDraftInjectionPatientScreeningEnabled("true")).toBe(true);
  });
});
