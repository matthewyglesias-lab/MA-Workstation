import { describe, expect, it } from "vitest";

import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  INJECTION_MEDICATIONS,
  INJECTION_PREPARATION_REVIEWED_ON,
  InjectionEngine,
  emptyInjectionEncounter,
  medicationPreparationGuidance,
  medicationVerificationDocumentation,
  medicationVerificationLabel,
  type InjectionEncounter,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "../../src/domain";
import { injectionEncounterToDocumentationInput } from "../../src/documentation/adapters/injection-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

type PreparationCase = {
  key: Exclude<InjectionMedicationKey, "other">;
  verification: MedicationVerificationKey;
  label: string;
  documentation: string;
  /** Present only when the product's checked preparation/inspection fact
   * explicitly supports a normal-result statement in the note. */
  normalResult?: string;
  guidance: readonly string[];
};

/**
 * Preparation needs deliberately stay product-specific.  This matrix gives
 * every supported product a review-date/source assertion as well as a
 * representative label instruction, so a future broad "mixing" or visual
 * inspection default cannot silently replace a product's actual instructions.
 */
const preparationCases: readonly PreparationCase[] = [
  {
    key: "aristada",
    verification: "resuspend",
    label: "ARISTADA syringe preparation completed",
    documentation:
      "ARISTADA syringe tapped ≥10 times, shaken vigorously ≥30 sec; suspension uniform.",
    guidance: ["Tap the syringe at least 10 times", "more than 15 minutes"],
  },
  {
    key: "initio",
    verification: "resuspend",
    label: "ARISTADA INITIO syringe preparation completed",
    documentation:
      "ARISTADA INITIO syringe tapped ≥10 times, shaken vigorously ≥30 sec; suspension uniform.",
    guidance: ["Tap the syringe at least 10 times", "more than 15 minutes"],
  },
  {
    key: "sustenna",
    verification: "resuspend",
    label: "INVEGA SUSTENNA suspension shaken and visually inspected",
    documentation:
      "INVEGA SUSTENNA syringe shaken vigorously ≥10 sec; suspension homogeneous, no foreign matter or discoloration observed.",
    normalResult: "no foreign matter or discoloration observed.",
    guidance: ["at least 10 seconds", "foreign matter or discoloration"],
  },
  {
    key: "erzofri",
    verification: "resuspend",
    label: "ERZOFRI suspension preparation completed",
    documentation:
      "ERZOFRI syringe shaken vigorously ≥10 sec; suspension homogeneous.",
    guidance: ["at least 10 seconds", "Do not mix with another product or diluent"],
  },
  {
    key: "trinza",
    verification: "resuspend",
    label: "INVEGA TRINZA suspension shaken and visually inspected",
    documentation:
      "INVEGA TRINZA syringe shaken vigorously ≥15 sec and injected within 5 min; uniform, milky-white suspension confirmed, no foreign matter or discoloration observed.",
    normalResult: "no foreign matter or discoloration observed.",
    guidance: ["at least 15 seconds", "inject within 5 minutes"],
  },
  {
    key: "hafyera",
    verification: "resuspend",
    label: "INVEGA HAFYERA resuspension and visual inspection completed",
    documentation:
      "INVEGA HAFYERA syringe shaken rapidly ≥15 sec, rested briefly, then shaken ≥15 sec more; uniform, thick, milky-white suspension confirmed, no particulate matter or discoloration observed.",
    normalResult: "no particulate matter or discoloration observed.",
    guidance: ["shake very fast for at least 15 seconds", "shake again for 15 seconds"],
  },
  {
    key: "uzedy",
    verification: "resuspend",
    label: "UZEDY room-temperature, product, and bubble checks completed",
    documentation:
      "UZEDY kit reached room temperature in-package ≥30 min; suspension opaque white-to-off-white, free of non-white particles, bubble positioned at the syringe cap.",
    normalResult: "free of non-white particles",
    guidance: ["at least 30 minutes", "Forcefully flick the syringe downward three times"],
  },
  {
    key: "maintena",
    verification: "resuspend",
    label: "ABILIFY MAINTENA reconstitution and inspection completed",
    documentation:
      "ABILIFY MAINTENA reconstituted per ordered presentation; suspension uniform, opaque, and milky-white, no particulate matter or discoloration observed.",
    normalResult: "no particulate matter or discoloration observed.",
    guidance: ["dual-chamber syringe and vial have different reconstitution procedures"],
  },
  {
    key: "asimtufii",
    verification: "resuspend",
    label: "ABILIFY ASIMTUFII suspension prepared and visually inspected",
    documentation:
      "ABILIFY ASIMTUFII syringe tapped ≥10 times, shaken vigorously ≥10 sec; uniform, opaque, milky-white suspension confirmed, no particulate matter or discoloration observed.",
    normalResult: "no particulate matter or discoloration observed.",
    guidance: ["at least 10 seconds until the medication is uniform", "particulate matter or discoloration"],
  },
  {
    key: "vivitrol",
    verification: "resuspend",
    label: "VIVITROL reconstitution and suspension check completed",
    documentation:
      "VIVITROL reached room temperature and was reconstituted with supplied diluent; milky-white, clump-free suspension confirmed moving freely down the vial walls, 4 mL prepared for immediate administration.",
    normalResult: "milky-white, clump-free suspension confirmed",
    guidance: ["inject 3.4 mL of diluent", "withdraw 4.2 mL", "prepare 4 mL for injection"],
  },
  {
    key: "haldol",
    verification: "visualInspection",
    label: "HALDOL DECANOATE solution inspection completed",
    documentation:
      "HALDOL DECANOATE solution visually inspected: clear, yellow to light amber, free of visible debris.",
    normalResult: "clear, yellow to light amber, free of visible debris.",
    guidance: ["debris", "yellow to light amber"],
  },
  {
    key: "prolixin",
    verification: "visualInspection",
    label: "Dry equipment and applicable solution inspection completed",
    documentation:
      "Fluphenazine decanoate visually inspected when solution and container permitted, with no particulate matter or discoloration observed. Dry preparation equipment used.",
    normalResult: "no particulate matter or discoloration observed",
    guidance: ["whenever solution and container permit", "Use a dry syringe"],
  },
];

const requiredAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const administered = (medicationKey: InjectionMedicationKey): InjectionEncounter => {
  const medication = INJECTION_MEDICATIONS[medicationKey];
  return {
    ...emptyInjectionEncounter(),
    patient: { name: "PREPARATION, TEST", dob: "01/01/1990" },
    medicationKey,
    customMedication: medicationKey === "other" ? "Custom depot medication" : "",
    dose: medication.doses[0] ?? "100 mg",
    route: medication.route,
    site: medication.defaultSite || "R thigh per active order",
    intervalKey: medication.intervalKey,
    reason: "scheduled",
    priorDoseDate: "2026-01-02",
    administrationDate: "2026-01-30",
    nextDoseDate: "2026-02-27",
    orderingProvider: "Preparation Provider",
    administeredBy: "Preparation MA",
    administrationTime: "09:15",
    allergies: "NKDA reviewed",
    traceability: { ndc: "12345-6789-01", lot: "PREP-LOT", expiration: "2027-12" },
    response: { kind: "well" },
    attestations: requiredAttestations,
    acuteSafetyScreenConfirmed: true,
    disposition: { kind: "administered" },
    details: { productSource: "Clinic stock" },
  };
};

const stopCodes = (result: ReturnType<typeof InjectionEngine.evaluate>): string[] =>
  result.stops.map((entry) => entry.code);

describe("injection preparation guidance", () => {
  it("keeps every supported product's preparation verification and its dated DailyMed source together", () => {
    for (const preparationCase of preparationCases) {
      const medication = INJECTION_MEDICATIONS[preparationCase.key];
      const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[preparationCase.key];
      const detail = reference.catalog.verificationDetails?.[preparationCase.verification];
      const guidance = medicationPreparationGuidance(
        medication,
        medication.doses[0] ?? "",
        medication.defaultSite,
      );

      expect(reference.catalog.verifications, preparationCase.key).toContain(
        preparationCase.verification,
      );
      expect(detail, preparationCase.key).toBeDefined();
      expect(detail?.source.reviewedOn, preparationCase.key).toBe(
        INJECTION_PREPARATION_REVIEWED_ON,
      );
      expect(detail?.source.url, preparationCase.key).toBe(reference.source.url);
      expect(detail?.source.url, preparationCase.key).toContain("dailymed.nlm.nih.gov");
      expect(
        reference.administration.notes.filter((note) => note.phase === "preparation"),
        preparationCase.key,
      ).not.toHaveLength(0);
      for (const note of reference.administration.notes.filter((entry) => entry.phase === "preparation")) {
        expect(note.source.reviewedOn, `${preparationCase.key} ${note.id}`).toBe(
          INJECTION_PREPARATION_REVIEWED_ON,
        );
        expect(note.source.url, `${preparationCase.key} ${note.id}`).toBe(reference.source.url);
      }
      expect(medicationVerificationLabel(medication, preparationCase.verification)).toBe(
        preparationCase.label,
      );
      expect(
        medicationVerificationDocumentation(
          medication,
          preparationCase.verification,
          medication.doses[0] ?? "",
          medication.defaultSite,
        ),
      ).toBe(preparationCase.documentation);
      // The live workflow remains instruction-oriented; the charted fact is
      // a product-specific completed event, never a mechanical rewrite of the
      // imperative helper text.
      expect(preparationCase.documentation).not.toMatch(
        /^(Tap|Shake|Inspect|Allow|Use|Reconstitute|Prepare)\b/,
      );
      for (const expectedInstruction of preparationCase.guidance) {
        expect(guidance, `${preparationCase.key}: ${expectedInstruction}`).toContain(
          expectedInstruction,
        );
      }
      if (preparationCase.normalResult) {
        expect(preparationCase.documentation, preparationCase.key).toContain(
          preparationCase.normalResult,
        );
      }
    }
  });

  it("keeps every checked preparation fact in its own chart line and omits it when unchecked", () => {
    for (const preparationCase of preparationCases) {
      const encounter = administered(preparationCase.key);
      if (preparationCase.key === "initio") {
        encounter.reason = "initiation";
        encounter.intervalKey = "once";
        encounter.priorDoseDate = "";
        encounter.nextDoseDate = "";
      }
      if (preparationCase.key === "haldol") {
        encounter.details = { productSource: "Clinic stock", volume: "2", volumeUnit: "mL" };
      }
      if (preparationCase.key === "vivitrol") {
        encounter.habitus = "average";
      }
      const requirements = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
      encounter.verifications = Object.fromEntries(
        requirements.output.requiredVerifications.map((key) => [key, true]),
      );

      const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
      const input = injectionEncounterToDocumentationInput(encounter, evaluation);
      if (!input?.noteFacts) throw new Error(`expected note facts for ${preparationCase.key}`);
      const note = DocumentationEngine.format("injection", input, evaluation);

      expect(input.noteFacts.productPreparation, preparationCase.key).toBe(
        preparationCase.documentation,
      );
      expect(note.assessment, preparationCase.key).toContain(
        `Product preparation: ${preparationCase.documentation}`,
      );
      expect(note.plan, preparationCase.key).not.toContain(preparationCase.documentation);
      expect(note.assessment, preparationCase.key).not.toContain(
        `Clinical review: ${preparationCase.documentation}`,
      );

      encounter.verifications = {};
      const uncheckedEvaluation = InjectionEngine.evaluate(encounter, {
        today: encounter.administrationDate,
      });
      const uncheckedInput = injectionEncounterToDocumentationInput(encounter, uncheckedEvaluation);
      // An unchecked required preparation verification cannot produce a
      // finalizable compact note, which is stronger than merely hiding the
      // product-preparation line from a chart-ready document.
      expect(uncheckedInput?.noteFacts, preparationCase.key).toBeUndefined();
    }
  });

  it("keeps Sustenna's 10-second preparation distinct from Trinza's 15-second/five-minute workflow", () => {
    const sustenna = medicationPreparationGuidance(INJECTION_MEDICATIONS.sustenna, "156 mg", "R deltoid");
    const trinza = medicationPreparationGuidance(INJECTION_MEDICATIONS.trinza, "410 mg", "R deltoid");

    expect(sustenna).toContain("at least 10 seconds");
    expect(sustenna).not.toContain("at least 15 seconds");
    expect(sustenna).not.toContain("within 5 minutes");
    expect(trinza).toContain("at least 15 seconds");
    expect(trinza).toContain("within 5 minutes");
  });

  it("does not invent a universal particulate/discoloration requirement for products whose sourced preparation does not state one", () => {
    for (const key of ["aristada", "initio", "erzofri"] as const) {
      const medication = INJECTION_MEDICATIONS[key];
      const guidance = medicationPreparationGuidance(
        medication,
        medication.doses[0] ?? "",
        medication.defaultSite,
      );

      expect(guidance, key).not.toContain("particulate matter or discoloration");
      expect(guidance, key).not.toContain("foreign matter or discoloration");
    }
  });
});

describe("preparation-related safety stops", () => {
  it("requires product-specific visual inspection for Haldol and Prolixin", () => {
    const haldol = administered("haldol");
    haldol.details = { productSource: "Clinic stock", volume: "2", volumeUnit: "mL" };
    expect(stopCodes(InjectionEngine.evaluate(haldol, { today: haldol.administrationDate }))).toContain(
      "verification.visualInspection",
    );

    haldol.verifications = { visualInspection: true };
    expect(stopCodes(InjectionEngine.evaluate(haldol, { today: haldol.administrationDate }))).not.toContain(
      "verification.visualInspection",
    );

    const prolixin = administered("prolixin");
    prolixin.dose = "25 mg";
    prolixin.route = "SubQ";
    prolixin.site = "L upper arm per active order";
    prolixin.intervalKey = "q3wk";
    expect(stopCodes(InjectionEngine.evaluate(prolixin, { today: prolixin.administrationDate }))).toContain(
      "verification.visualInspection",
    );

    prolixin.verifications = { visualInspection: true };
    expect(stopCodes(InjectionEngine.evaluate(prolixin, { today: prolixin.administrationDate }))).not.toContain(
      "verification.visualInspection",
    );
  });

  it("requires an actual Haldol volume before it can apply the 3 mL per-site ceiling", () => {
    const haldol = administered("haldol");
    haldol.verifications = { visualInspection: true };

    expect(stopCodes(InjectionEngine.evaluate(haldol, { today: haldol.administrationDate }))).toContain(
      "administration.volume-required",
    );

    haldol.details = { productSource: "Clinic stock", volume: "3", volumeUnit: "mL" };
    const atLimit = InjectionEngine.evaluate(haldol, { today: haldol.administrationDate });
    expect(stopCodes(atLimit)).not.toContain("administration.volume-required");
    expect(stopCodes(atLimit)).not.toContain("administration.volume-max");

    haldol.details = { productSource: "Clinic stock", volume: "3.1", volumeUnit: "mL" };
    expect(stopCodes(InjectionEngine.evaluate(haldol, { today: haldol.administrationDate }))).toContain(
      "administration.volume-max",
    );
  });

  it("requires Haldol volume to be documented in mL, not as a dose mass", () => {
    const haldol = administered("haldol");
    haldol.verifications = { visualInspection: true };
    haldol.details = { productSource: "Clinic stock", volume: "100", volumeUnit: "mg" };

    const result = InjectionEngine.evaluate(haldol, { today: haldol.administrationDate });
    expect(stopCodes(result)).toContain("administration.volume-unit");
    expect(result.stops.find((entry) => entry.code === "administration.volume-unit")?.message).toBe(
      "Document the Haldol volume in mL so the 3 mL per-site limit can be checked.",
    );
    expect(result.output.canFinalize).toBe(false);
  });

  it("blocks ARISTADA INITIO from being filed as maintenance but allows an initiation phase", () => {
    const initio = administered("initio");
    initio.dose = "675 mg";
    initio.intervalKey = "once";
    initio.site = "R deltoid";
    initio.nextDoseDate = "";
    initio.verifications = { resuspend: true };

    expect(stopCodes(InjectionEngine.evaluate(initio, { today: initio.administrationDate }))).toContain(
      "initio.phase",
    );

    initio.reason = "initiation";
    initio.priorDoseDate = "";
    expect(stopCodes(InjectionEngine.evaluate(initio, { today: initio.administrationDate }))).not.toContain(
      "initio.phase",
    );
  });

  it("does not calculate an Other medication's next date or present catalog sites as product guidance", () => {
    const other = administered("other");
    other.dose = "12 mg";
    other.route = "IM";
    other.site = "R upper arm per active order";
    other.intervalKey = "q4wk";

    const result = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(result.output.expectedNextDoseDate).toBe("");
    expect(result.output.timing.state).toBe("idle");
    expect(result.output.timing.message).toContain("No product-specific timing guidance");
    expect(result.output.allowedSites).toEqual([]);
    expect(stopCodes(result)).not.toContain("timing.outside-window");
    expect(medicationPreparationGuidance(INJECTION_MEDICATIONS.other, other.dose, other.site)).toBe("");
  });

  it("keeps a one-time Other order free of a routine return-date instruction", () => {
    const other = administered("other");
    other.dose = "12 mg";
    other.route = "IM";
    other.site = "R upper arm per active order";
    other.intervalKey = "once";
    other.nextDoseDate = "";

    const result = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(result.output.timing.state).toBe("idle");
    expect(result.output.timing.message).toBe("One-time Other order; no routine return date is required.");
    expect(stopCodes(result)).not.toContain("followup.next-dose");
    expect(stopCodes(result)).not.toContain("followup.other-return-order");
    expect(result.output.canFinalize).toBe(true);
  });

  it("requires active-order provenance for an Other medication's manual return date", () => {
    const other = administered("other");
    other.dose = "12 mg";
    other.route = "IM";
    other.site = "R upper arm per active order";
    other.intervalKey = "q4wk";

    const unprovenanced = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(unprovenanced)).toContain("followup.other-return-order");
    expect(unprovenanced.output.canFinalize).toBe(false);

    // A stale visible return date must not become trusted merely because a
    // custom order was changed to a one-time interval. There is no required
    // future date on that path, but any date that remains still needs its
    // active-order provenance.
    other.intervalKey = "once";
    const oneTimeUnprovenanced = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(oneTimeUnprovenanced)).toContain("followup.other-return-order");
    expect(oneTimeUnprovenanced.output.canFinalize).toBe(false);
    other.intervalKey = "q4wk";

    other.details = {
      productSource: "Clinic stock",
      nextDose: {
        value: other.nextDoseDate,
        source: "calculated",
        calculatedFrom: "2026-01-30|q4wk",
      },
    };
    const legacyCalculated = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(legacyCalculated)).toContain("followup.other-return-order");
    expect(legacyCalculated.output.canFinalize).toBe(false);

    other.details = {
      productSource: "Clinic stock",
      nextDose: {
        value: other.nextDoseDate,
        source: "manual",
        overrideKind: "active-order",
        overrideReason: "Return date verified against the active order.",
        recordedAt: "2026-01-30T09:15:00.000Z",
      },
    };
    const provenanced = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(provenanced)).not.toContain("followup.other-return-order");
    expect(provenanced.output.canFinalize).toBe(true);
  });

  it("still blocks impossible Other chronology without inventing a product cadence", () => {
    const other = administered("other");
    other.dose = "12 mg";
    other.route = "IM";
    other.site = "R upper arm per active order";
    other.intervalKey = "q4wk";
    other.priorDoseDate = "2026-02-01";
    other.administrationDate = "2026-01-30";
    other.nextDoseDate = "2026-02-27";

    const result = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(result.output.expectedNextDoseDate).toBe("");
    expect(result.output.timing.expectedDate).toBe("");
    expect(result.output.timing.state).toBe("stop");
    expect(stopCodes(result)).toContain("timing.outside-window");
    expect(result.stops.find((entry) => entry.code === "timing.outside-window")?.message).toBe(
      "The administration date is before the prior-dose date; verify the dates.",
    );
    expect(result.output.canFinalize).toBe(false);
  });

  it("blocks a malformed scheduled prior-dose date but keeps an omitted non-scheduled date optional", () => {
    const scheduled = administered("haldol");
    scheduled.verifications = { visualInspection: true };
    scheduled.details = { productSource: "Clinic stock", volume: "2", volumeUnit: "mL" };
    scheduled.priorDoseDate = "2026-02-30";

    const invalidPriorDate = InjectionEngine.evaluate(scheduled, {
      today: scheduled.administrationDate,
    });
    expect(stopCodes(invalidPriorDate)).toContain("timing.prior-dose-invalid");
    expect(
      invalidPriorDate.stops.find((entry) => entry.code === "timing.prior-dose-invalid")?.message,
    ).toBe("Verify the prior-dose date; use a real calendar date.");
    expect(invalidPriorDate.output.canFinalize).toBe(false);

    const nonScheduled = administered("haldol");
    nonScheduled.verifications = { visualInspection: true };
    nonScheduled.details = { productSource: "Clinic stock", volume: "2", volumeUnit: "mL" };
    nonScheduled.reason = "prn";
    nonScheduled.priorDoseDate = "";

    const optionalPriorDate = InjectionEngine.evaluate(nonScheduled, {
      today: nonScheduled.administrationDate,
    });
    expect(stopCodes(optionalPriorDate)).not.toContain("timing.prior-dose-invalid");
    expect(stopCodes(optionalPriorDate)).not.toContain("timing.prior-dose");
    expect(optionalPriorDate.output.requirements.priorDoseDate?.state).toBe("optional");
    expect(optionalPriorDate.output.canFinalize).toBe(true);
  });

  it("does not let a non-administration Other handoff finalize or print an unreviewed return date", () => {
    const other = administered("other");
    other.dose = "12 mg";
    other.route = "IM";
    other.site = "R upper arm per active order";
    other.intervalKey = "q4wk";
    other.disposition = {
      kind: "held",
      provider: "Ordering Provider",
      time: "2026-01-30T09:30",
      outcome: "Hold and review the active order before rescheduling.",
    };

    const unreviewed = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(unreviewed)).toContain("followup.other-return-order");
    expect(unreviewed.output.canFinalize).toBe(false);
    expect(injectionEncounterToDocumentationInput(other, unreviewed)?.followUp?.nextDoseDate).toBeUndefined();

    other.details = {
      productSource: "Clinic stock",
      nextDose: {
        value: other.nextDoseDate,
        source: "manual",
        overrideKind: "active-order",
        overrideReason: "Return date verified against the active order.",
        recordedAt: "2026-01-30T09:15:00.000Z",
      },
    };
    const reviewed = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(reviewed)).not.toContain("followup.other-return-order");
    expect(reviewed.output.canFinalize).toBe(true);
    expect(injectionEncounterToDocumentationInput(other, reviewed)?.followUp?.nextDoseDate).toBe(
      "Feb 27, 2026",
    );

    other.priorDoseDate = "2026-02-30";
    const malformedPrior = InjectionEngine.evaluate(other, { today: other.administrationDate });
    expect(stopCodes(malformedPrior)).toContain("timing.prior-dose-invalid");
    expect(malformedPrior.output.canFinalize).toBe(false);
  });
});
