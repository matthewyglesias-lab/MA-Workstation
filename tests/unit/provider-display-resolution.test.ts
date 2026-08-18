import { describe, expect, it } from "vitest";

import { InjectionEngine, emptyInjectionEncounter, type InjectionEncounter } from "../../src/domain/injection";
import { injectionEncounterToDocumentationInput } from "../../src/documentation/adapters/injection-from-encounter";
import { emptySamplesEncounter, type SamplesEncounter } from "../../src/domain/samples";
import { samplesEncounterToDocumentationInput } from "../../src/documentation/adapters/samples-from-encounter";
import { emptyFormsEncounter, type FormsEncounter } from "../../src/domain/forms";
import { formsEncounterToDocumentationInput } from "../../src/documentation/adapters/forms-from-encounter";

/**
 * `ProviderField` stores the provider register's stable id in the encounter
 * (documented explicitly in provider-register.ts: "the value written to the
 * record is the provider's stable id rather than whatever was typed"), so
 * every place that turns an encounter into chart text or a patient handout
 * has to resolve that id back to a display name. A caller that forgets
 * writes the raw id - "adeniji-john" - straight into the record.
 */
describe("provider id resolution in generated documentation", () => {
  const requiredInjectionAttestations = {
    id2: true,
    rights: true,
    allergy: true,
    consent: true,
    screen: true,
    hygiene: true,
    prior: true,
  };

  it("resolves a registered ordering provider id to a display name in the injection note", () => {
    const encounter: InjectionEncounter = {
      ...emptyInjectionEncounter(),
      patient: { name: "REGISTER, PROVIDER", dob: "01/01/1990" },
      medicationKey: "sustenna",
      dose: "156 mg",
      route: "IM",
      site: "L deltoid",
      intervalKey: "q4wk",
      reason: "scheduled",
      priorDoseDate: "2026-07-10",
      administrationDate: "2026-08-07",
      administrationTime: "17:50",
      nextDoseDate: "2026-09-04",
      orderingProvider: "adeniji-john",
      administeredBy: "Matthew Y.",
      allergies: "NKDA",
      traceability: { ndc: "50458-564-01", lot: "PAB1234", expiration: "2027-10" },
      response: { kind: "well" },
      attestations: requiredInjectionAttestations,
      verifications: { resuspend: true },
      acuteSafetyScreenConfirmed: true,
      disposition: { kind: "administered" },
      details: { productSource: "Clinic sample" },
    };

    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input).not.toBeNull();

    expect(input!.noteFacts?.orderingProvider).toBe("Adeniji, John, PMHNP");
    expect(input!.noteFacts?.orderingProvider).not.toContain("adeniji-john");
    expect(input!.followUp?.orderingProvider).toBe("Adeniji, John, PMHNP");
  });

  it("leaves a free-text or pre-register ordering provider untouched", () => {
    const encounter: InjectionEncounter = {
      ...emptyInjectionEncounter(),
      disposition: { kind: "held", provider: "Dr. Held", time: "09:00", outcome: "Hold today." },
      orderingProvider: "Jane Doe, MD",
    };
    const evaluation = InjectionEngine.evaluate(encounter, {});
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input?.followUp?.orderingProvider).toBe("Jane Doe, MD");
  });

  it("resolves a registered prescriber id to a display name in the samples note", () => {
    const encounter: SamplesEncounter = {
      ...emptySamplesEncounter(),
      patient: { name: "REGISTER, SAMPLE", dob: "01/01/1990" },
      medicationLabel: "Test Med",
      prescriber: "syed-hozair",
    };
    const input = samplesEncounterToDocumentationInput(encounter, "2026-08-18");
    expect(input?.prescriber).toBe("Syed, Hozair, MD");
    expect(input?.prescriber).not.toContain("syed-hozair");
  });

  it("resolves a registered assigned-provider id to a display name in the forms note", () => {
    const encounter: FormsEncounter = {
      ...emptyFormsEncounter(),
      patient: { name: "REGISTER, FORM", dob: "01/01/1990" },
      provider: "patel-mansi",
    };
    const input = formsEncounterToDocumentationInput(encounter);
    expect(input.assignedProvider).toBe("Patel, Mansi, NP");
    expect(input.assignedProvider).not.toContain("patel-mansi");
  });
});
