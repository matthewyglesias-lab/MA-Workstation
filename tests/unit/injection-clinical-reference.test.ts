import { describe, expect, it } from "vitest";

import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  INJECTION_CLINICAL_REFERENCE_REVIEWED_ON,
  InjectionEngine,
  addCalendarDays,
  allowedDosesForInterval,
  calculateNextInjectionDate,
  compatibleIntervalsForDose,
  effectiveInjectionWindow,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  preferredIntervalForDose,
  type InjectionEncounter,
  type InjectionMedicationKey,
} from "../../src/domain";
import { INJECTION_MEDICATIONS } from "../../src/domain/injection-catalog";

const requiredAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const administered = (medicationKey: InjectionMedicationKey): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "REFERENCE, TEST", dob: "01/01/1990" },
  medicationKey,
  dose: "100 mg",
  route: "IM",
  site: "R thigh per active order",
  intervalKey: "q4wk",
  reason: "scheduled",
  priorDoseDate: "2026-01-02",
  administrationDate: "2026-01-30",
  nextDoseDate: "2026-02-27",
  orderingProvider: "Reference Provider",
  administeredBy: "Reference MA",
  administrationTime: "09:15",
  allergies: "NKDA reviewed",
  traceability: { ndc: "12345-6789-01", lot: "REF-LOT", expiration: "2027-12" },
  response: { kind: "well" },
  attestations: requiredAttestations,
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Reference source" },
});

const stopCodes = (result: ReturnType<typeof InjectionEngine.evaluate>): string[] =>
  result.stops.map((entry) => entry.code);

const warningCodes = (result: ReturnType<typeof InjectionEngine.evaluate>): string[] =>
  result.warnings.map((entry) => entry.code);

describe("InjectionClinicalReferenceBundle", () => {
  it("gives every supported medication auditable label facts", () => {
    for (const reference of Object.values(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications)) {
      expect(reference.source.url).toMatch(/^https:\/\//);
      expect(reference.source.url).toContain("setid=");
      expect(reference.source.labelRevision).not.toHaveLength(0);
      expect(reference.source.labelRevision).toContain("SPL v");
      expect(reference.source.reviewedOn).toBe(INJECTION_CLINICAL_REFERENCE_REVIEWED_ON);
      expect(reference.facts.length).toBeGreaterThan(0);
      for (const clinicalFact of reference.facts) {
        expect(clinicalFact.source.url).toBe(reference.source.url);
        expect(clinicalFact.classification).toMatch(
          /label constraint|order-dependent review|local policy/,
        );
      }
    }
  });

  it("uses calendar-month cadence for long-interval products", () => {
    expect(
      calculateNextInjectionDate(INJECTION_MEDICATIONS.trinza, "q12wk", "2026-01-31"),
    ).toBe("2026-04-30");
    expect(
      calculateNextInjectionDate(INJECTION_MEDICATIONS.hafyera, "q26wk", "2026-08-31"),
    ).toBe("2027-02-28");
  });

  it("maps the higher Uzedy and Aristada strengths to their labeled schedules", () => {
    const uzedy = INJECTION_MEDICATIONS.uzedy;
    const aristada = INJECTION_MEDICATIONS.aristada;

    expect(compatibleIntervalsForDose(uzedy, "150 mg")).toEqual(["q8wk"]);
    expect(compatibleIntervalsForDose(uzedy, "200 mg")).toEqual(["q8wk"]);
    expect(compatibleIntervalsForDose(uzedy, "250 mg")).toEqual(["q8wk"]);
    expect(compatibleIntervalsForDose(aristada, "1064 mg")).toEqual(["q8wk"]);
    expect(allowedDosesForInterval(uzedy, "q6wk")).toEqual([]);
    expect(preferredIntervalForDose(uzedy, "250 mg", "q4wk")).toBe("q8wk");
    expect(preferredIntervalForDose(aristada, "882 mg", "q6wk")).toBe("q6wk");
  });

  it("keeps every configured order-review scheduling window neutral and warns immediately outside it", () => {
    const orderReviewMedications = Object.values(INJECTION_MEDICATIONS).filter(
      (medication) => medication.timingMode === "orderVerify",
    );

    for (const medication of orderReviewMedications) {
      const encounter = administered(medication.key);
      const intervalKey = medication.intervalKey;
      if (!intervalKey) {
        throw new Error(`${medication.key} is missing its maintenance interval`);
      }
      encounter.dose = medication.doses[0] ?? "100 mg";
      encounter.route = medication.route;
      encounter.site = medication.defaultSite || "R deltoid per active order";
      encounter.intervalKey = intervalKey;
      const expectedDate = calculateNextInjectionDate(
        medication,
        intervalKey,
        encounter.priorDoseDate,
      );
      const window = effectiveInjectionWindow(medication, intervalKey);
      const earliestDate = addCalendarDays(expectedDate, -window.windowBefore);
      const latestDate = addCalendarDays(expectedDate, window.windowAfter);
      const evaluateAt = (administrationDate: string) => {
        encounter.administrationDate = administrationDate;
        encounter.nextDoseDate = calculateNextInjectionDate(
          medication,
          intervalKey,
          administrationDate,
        );
        return InjectionEngine.evaluate(encounter, { today: administrationDate });
      };

      for (const scheduledDate of new Set([earliestDate, expectedDate, latestDate])) {
        const result = evaluateAt(scheduledDate);
        expect(result.output.timing.state, `${medication.key} ${scheduledDate}`).toBe("ok");
        expect(warningCodes(result), `${medication.key} ${scheduledDate}`).not.toContain(
          "timing.review",
        );
      }

      const tooEarly = evaluateAt(addCalendarDays(earliestDate, -1));
      expect(tooEarly.output.timing.state, `${medication.key} early`).toBe("warning");
      expect(warningCodes(tooEarly), `${medication.key} early`).toContain("timing.review");

      const tooLate = evaluateAt(addCalendarDays(latestDate, 1));
      expect(tooLate.output.timing.state, `${medication.key} late`).toBe("warning");
      expect(tooLate.output.timing.late, `${medication.key} late`).toBe(true);
      expect(warningCodes(tooLate), `${medication.key} late`).toContain("timing.review");
    }
  });

  it("keeps provider-directed dose and interval overrides as review warnings", () => {
    const providerDirectedOrders: Array<{
      medicationKey: InjectionMedicationKey;
      dose: string;
      intervalKey: InjectionEncounter["intervalKey"];
      route: string;
      site: string;
    }> = [
      {
        medicationKey: "uzedy",
        dose: "200 mg",
        intervalKey: "q4wk",
        route: "SubQ",
        site: "Abdomen RUQ (SubQ)",
      },
      {
        medicationKey: "aristada",
        dose: "1064 mg",
        intervalKey: "q4wk",
        route: "IM",
        site: "L deltoid",
      },
    ];

    for (const order of providerDirectedOrders) {
      const encounter = administered(order.medicationKey);
      encounter.dose = order.dose;
      encounter.intervalKey = order.intervalKey;
      encounter.route = order.route;
      encounter.site = order.site;
      encounter.verifications = { resuspend: true };

      const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
      expect(stopCodes(result)).not.toContain("dose.interval-mismatch");
      expect(warningCodes(result)).toContain("dose.interval-mismatch");
    }
  });
});

describe("phase-specific Injection guidance", () => {
  it("does not block routine Aristada maintenance on an initiation-only oral pathway", () => {
    const encounter = administered("aristada");
    encounter.dose = "441 mg";
    encounter.site = "L deltoid";
    encounter.verifications = { resuspend: true };

    const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });

    expect(result.output.requiredVerifications).toEqual(["resuspend"]);
    expect(stopCodes(result)).not.toContain("verification.oralOverlap");
    expect(result.output.requirements["verifications.oralOverlap"]?.state).toBe("hidden");
    expect(result.output.timing.state).toBe("ok");
    expect(warningCodes(result)).not.toContain("timing.review");
    expect(result.output.canFinalize).toBe(true);
  });

  it("does not apply a stale initiation protocol to routine maintenance", () => {
    const encounter = administered("aristada");
    encounter.dose = "441 mg";
    encounter.site = "L deltoid";
    encounter.verifications = { resuspend: true };
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "aristada-21day",
    };

    const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });

    expect(stopCodes(result)).not.toEqual(
      expect.arrayContaining(["initiation.plan", "initiation.oral"]),
    );
    expect(result.output.requirements["initiation.protocol"]?.state).toBe("hidden");
    expect(result.output.canFinalize).toBe(true);
  });

  // Vivitrol is a true two-component reconstitution kit, unlike the
  // ready-to-use decanoates. Its kit-preparation verification and the label's
  // per-administration habitus assessment must both be completed before the
  // record can be finalized.
  it("requires Vivitrol kit preparation and habitus assessment before finalizing", () => {
    const encounter = administered("vivitrol");
    encounter.dose = "380 mg";
    encounter.site = "R ventrogluteal";
    encounter.verifications = { opioidFree: true, naltrexHS: true, suppliedNeedle: true };

    const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });

    expect(result.output.requiredVerifications).toContain("resuspend");
    expect(stopCodes(result)).toContain("verification.resuspend");
    expect(result.output.canFinalize).toBe(false);

    encounter.verifications = { ...encounter.verifications, resuspend: true };
    const preparationResolved = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    expect(stopCodes(preparationResolved)).not.toContain("verification.resuspend");
    expect(stopCodes(preparationResolved)).toContain("needle.unresolved");
    expect(preparationResolved.output.canFinalize).toBe(false);

    encounter.habitus = "average";
    const resolved = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(stopCodes(resolved)).not.toContain("needle.unresolved");
    expect(resolved.output.canFinalize).toBe(true);
  });

  it("routes ERZOFRI 351 mg through initiation/re-initiation rather than maintenance", () => {
    const routine = administered("erzofri");
    routine.dose = "351 mg";
    routine.site = "R deltoid";
    routine.verifications = { resuspend: true };
    expect(stopCodes(InjectionEngine.evaluate(routine, { today: routine.administrationDate }))).toContain(
      "erzofri.351.phase",
    );

    routine.reason = "initiation";
    routine.priorDoseDate = "";
    routine.nextDoseDate = "2026-02-27";
    routine.verifications = { resuspend: true, paliperidoneTolerability: true };
    const initiation = InjectionEngine.evaluate(routine, { today: routine.administrationDate });
    expect(stopCodes(initiation)).not.toContain("erzofri.351.phase");
    expect(initiation.output.requiredVerifications).toEqual([
      "resuspend",
      "paliperidoneTolerability",
    ]);
  });

  it("does not invent Haldol or Prolixin anatomical restrictions", () => {
    const haldol = administered("haldol");
    const haldolResult = InjectionEngine.evaluate(haldol, { today: haldol.administrationDate });
    expect(haldolResult.output.allowedRoutes).toEqual(["IM"]);
    expect(haldolResult.output.allowedSites).toEqual([]);
    expect(stopCodes(haldolResult)).not.toEqual(
      expect.arrayContaining(["site.outside-guidance", "verification.deepZtrack"]),
    );

    const prolixin = administered("prolixin");
    prolixin.route = "SubQ";
    prolixin.site = "L upper arm per active order";
    const prolixinResult = InjectionEngine.evaluate(prolixin, { today: prolixin.administrationDate });
    expect(prolixinResult.output.allowedRoutes).toEqual(["IM", "SubQ"]);
    expect(prolixinResult.output.allowedSites).toEqual([]);
    expect(stopCodes(prolixinResult)).not.toContain("route.outside-guidance");
    expect(stopCodes(prolixinResult)).not.toContain("site.outside-guidance");
  });

  it("projects requirement visibility from the active disposition", () => {
    const encounter = administered("haldol");
    encounter.disposition = {
      kind: "held",
      provider: "Reference Provider",
      time: "09:20",
      outcome: "Hold and reassess.",
    };
    const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });

    expect(result.output.requirements["traceability.ndc"]?.state).toBe("hidden");
    expect(result.output.requirements["site"]?.state).toBe("hidden");
    expect(result.output.requirements["disposition.provider"]?.state).toBe("required");
    expect(result.output.guidance.length).toBeGreaterThan(0);
  });

  it("projects compact guidance for every applicable worksheet section", () => {
    const encounter = administered("aristada");
    encounter.dose = "441 mg";
    encounter.site = "L deltoid";
    encounter.verifications = { resuspend: true };

    const result = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    const guidanceBySection = new Set(result.output.guidance.map((entry) => entry.section));

    ["order", "timing", "administration", "traceability", "safety", "disposition"].forEach(
      (section) => expect(guidanceBySection).toContain(section),
    );
  });

  it("keeps an untouched worksheet pending and hides a one-time next-due requirement", () => {
    const blank = InjectionEngine.evaluate(emptyInjectionEncounter(), {});
    expect(blank.readiness).toBe("idle");
    expect(blank.output.canFinalize).toBe(false);

    const oneTime = administered("initio");
    oneTime.dose = "675 mg";
    oneTime.intervalKey = "once";
    oneTime.site = "L deltoid";
    oneTime.nextDoseDate = "";
    const result = InjectionEngine.evaluate(oneTime, { today: oneTime.administrationDate });
    expect(result.output.requirements.nextDoseDate?.state).toBe("hidden");
    expect(stopCodes(result)).not.toContain("followup.next-dose");
  });

  it("projects the custom response detail as a real requirement", () => {
    const encounter = administered("haldol");
    encounter.response = { kind: "custom", custom: "" };

    const incomplete = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(incomplete.output.requirements.response?.state).toBe("required");
    expect(incomplete.output.requirements["response.custom"]?.state).toBe("required");
    expect(stopCodes(incomplete)).toContain("response.required");

    encounter.response.custom = "Observed and stable after administration.";
    const complete = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(stopCodes(complete)).not.toContain("response.required");
  });

  it("keeps the order-first fields usable before medication selection", () => {
    const encounter = emptyInjectionEncounter();
    encounter.patient.name = "ORDER, FIRST";
    const result = InjectionEngine.evaluate(encounter, {});

    expect(result.output.requirements.orderingProvider?.state).toBe("required");
    expect(result.output.requirements.medicationKey?.state).toBe("required");
    expect(result.output.requirements.dose?.state).toBe("hidden");
    expect(result.output.requirements["details.volume"]?.state).toBe("hidden");
  });
});
