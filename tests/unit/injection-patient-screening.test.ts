import { describe, expect, it } from "vitest";

import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  INJECTION_PATIENT_SCREENING_APPROVED_ON,
  INJECTION_PATIENT_SCREENING_CONTENT_VERSION,
  INJECTION_PATIENT_SCREEN_RULES,
  buildInjectionPatientScreenDocument,
  canBuildInjectionPatientScreenDocument,
  emptyInjectionEncounter,
  type InjectionEncounter,
  type InjectionMedicationKey,
} from "../../src/domain";
import { isInjectionPatientScreeningEnabled } from "../../src/presentation/workflows/injection/patient-screening-print";

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

describe("Injection patient screening model", () => {
  it("has a complete paired bilingual approved inventory with auditable provenance", () => {
    expect(INJECTION_PATIENT_SCREENING_CONTENT_VERSION).toBe("2026.08.06.1");
    expect(INJECTION_PATIENT_SCREENING_APPROVED_ON).toBe("2026-08-06");
    expect(INJECTION_PATIENT_SCREEN_RULES.length).toBeGreaterThan(3);
    for (const rule of INJECTION_PATIENT_SCREEN_RULES) {
      expect(rule.reviewStatus).toBe("approved");
      expect(rule.copy.en.sectionTitle.trim()).not.toHaveLength(0);
      expect(rule.copy.en.sectionTitle).not.toMatch(/draft/i);
      expect(rule.copy.en.prompt.trim()).not.toHaveLength(0);
      expect(rule.copy.en.staffInterpretation.trim()).not.toHaveLength(0);
      expect(rule.copy.es.sectionTitle.trim()).not.toHaveLength(0);
      expect(rule.copy.es.sectionTitle).not.toMatch(/borrador/i);
      expect(rule.copy.es.prompt.trim()).not.toHaveLength(0);
      expect(rule.copy.es.staffInterpretation.trim()).not.toHaveLength(0);
      expect(rule.responseType).toBe("yes-no-not-sure");
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

      expect(documentModel.reviewStatus).toBe("approved");
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
      expect(items.some((item) => item.id.startsWith(`medication-${medicationKey}-`))).toBe(true);
      expect(items.every((item) => item.staffInterpretation.trim().length > 0)).toBe(true);
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
    expect(spanish.labels.consentTitle).toBe("CONSENTIMIENTO INFORMADO");
    expect(english.labels.consentTitle).toBe("INFORMED CONSENT");
    expect(spanish.sections.map((section) => section.id)).toEqual(
      english.sections.map((section) => section.id),
    );
    expect(english.showsConsent).toBe(false);
    expect(english.sections.map((section) => section.id)).not.toContain("consent");
  });

  it("uses a patient-friendly universal symptom check-in with an explicit Not sure path", () => {
    const english = buildInjectionPatientScreenDocument(encounterFor("other"), "en");
    const spanish = buildInjectionPatientScreenDocument(encounterFor("other"), "es");
    const universalItems = english.sections
      .flatMap((section) => section.items)
      .filter((item) => item.id.startsWith("universal-"));

    expect(english.labels.patientCheckIn).toBe("SINCE YOUR LAST INJECTION");
    expect(english.labels.notSure).toBe("Not sure");
    expect(spanish.labels.notSure).toBe("No estoy seguro/a");
    expect(universalItems.map((item) => item.id)).toEqual([
      "universal-plan-confirmation",
      "universal-unwell-or-new-illness",
      "universal-dizziness-fainting-or-fall",
      "universal-chest-breathing-or-heart-symptoms",
      "universal-injection-site-concern",
      "universal-other-post-injection-problem",
      "universal-allergy-or-reaction",
      "universal-medication-change",
      "universal-new-health-event",
      "universal-pregnancy-or-lactation",
      "universal-questions",
    ]);
    expect(universalItems.every((item) => item.responseType === "yes-no-not-sure")).toBe(true);
    expect(universalItems.every((item) => item.staffInterpretation.includes("Yes or Not sure"))).toBe(
      true,
    );
    expect(universalItems[0]?.prompt).toMatch(/different from what you expected/i);
    expect(
      spanish.sections.flatMap((section) => section.items).map((item) => item.staffInterpretation),
    ).toContainEqual(expect.stringContaining("No estoy seguro/a"));
  });

  it("keeps serious antipsychotic symptoms in separate medication-specific prompts", () => {
    const documentModel = buildInjectionPatientScreenDocument(encounterFor("uzedy"), "en");
    const ids = documentModel.sections.flatMap((section) => section.items).map((item) => item.id);

    expect(ids).toContain("medication-uzedy-fever-stiffness-or-confusion");
    expect(ids).toContain("medication-uzedy-movement-or-swallowing");
  });

  it("adds approved consent content only for a catalog initiation-like encounter", () => {
    const initiation = encounterFor("vivitrol");
    initiation.reason = "initiation";
    const documentModel = buildInjectionPatientScreenDocument(initiation, "en");
    const consentItems = documentModel.sections
      .filter((section) => section.id === "consent")
      .flatMap((section) => section.items);

    expect(documentModel.showsConsent).toBe(true);
    expect(consentItems.length).toBeGreaterThanOrEqual(2);
    expect(consentItems.map((item) => item.id)).toContain("consent-vivitrol-detailed-review");
    expect(consentItems.every((item) => item.reviewStatus === "approved")).toBe(true);
    expect(
      consentItems.find((item) => item.id === "consent-initiation-discussion-request")?.prompt,
    ).toMatch(/important risks, reasonable alternatives/i);
    expect(documentModel.labels.consentBody).toMatch(/voluntarily agree to receive/i);
    const spanishInitiation = buildInjectionPatientScreenDocument(initiation, "es");
    expect(spanishInitiation.labels.consentBody).toMatch(/Acepto voluntariamente recibir/i);

    const other = encounterFor("other");
    other.reason = "initiation";
    const otherDocument = buildInjectionPatientScreenDocument(other, "en");
    expect(otherDocument.showsConsent).toBe(false);
    expect(otherDocument.sections.map((section) => section.id)).not.toContain("consent");
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

  it("enables the approved form by default and supports an explicit operational disable", () => {
    expect(isInjectionPatientScreeningEnabled(undefined)).toBe(true);
    expect(isInjectionPatientScreeningEnabled("false")).toBe(false);
    expect(isInjectionPatientScreeningEnabled("true")).toBe(true);
  });
});
