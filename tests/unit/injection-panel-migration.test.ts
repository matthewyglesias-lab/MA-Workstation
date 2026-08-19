import { describe, expect, it } from "vitest";

import {
  InjectionEngine,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  injectionAdministrationReviewFingerprint,
  injectionInitiationConfig,
  injectionInitiationOptions,
  type InjectionEncounter,
} from "../../src/domain/injection";
import { injectionEncounterToDocumentationInput } from "../../src/documentation/adapters/injection-from-encounter";
import { DocumentationEngine } from "../../src/documentation";
import { INJECTION_MEDICATIONS, preferredIntervalForDose } from "../../src/domain/injection-catalog";
import type { ClinicalEvaluation } from "../../src/domain/contracts";
import type { InjectionEvaluationOutput } from "../../src/domain/injection";
import {
  applyCalculatedNextDosePatch,
  applyManualNextDosePatch,
  applyPairedNdcPatch,
  applyPrimaryNdcPatch,
  doseChangePatch,
  intervalChangePatch,
  lateDoseReviewConfirmationPatch,
  medicationChangePatch,
  nextDoseProvenanceDecision,
  selectDispositionPatch,
  validatedNextDoseOverride,
} from "../../src/domain/injection-panel-actions";

const requiredInjectionAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const routineInjection = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "MIGRATION, DRAFT", dob: "01/01/1990" },
  medicationKey: "haldol",
  dose: "100 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "scheduled",
  priorDoseDate: "2026-01-02",
  priorSite: "R deltoid",
  administrationDate: "2026-01-30",
  nextDoseDate: "2026-02-27",
  orderingProvider: "Draft Provider",
  administeredBy: "Draft MA",
  administrationTime: "09:15",
  allergies: "NKDA verified in active record",
  traceability: {
    ndc: "12345-6789-01",
    lot: "DRAFT-LOT",
    expiration: "2027-12",
  },
  response: { kind: "well" },
  attestations: requiredInjectionAttestations,
  verifications: { visualInspection: true, deepZtrack: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Clinic sample", volume: "1", volumeUnit: "mL" },
});

describe("injectionEncounterToDocumentationInput", () => {
  it("returns null when no clinical disposition has been chosen yet", () => {
    const encounter = routineInjection();
    encounter.disposition = { kind: "" };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(injectionEncounterToDocumentationInput(encounter, evaluation)).toBeNull();
  });

  it("returns null for an administered disposition the engine hasn't cleared (unresolved stops)", () => {
    const encounter = routineInjection();
    encounter.traceability.expiration = "";
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(evaluation.output.administrationDocumented).toBe(false);
    expect(injectionEncounterToDocumentationInput(encounter, evaluation)).toBeNull();
  });

  it("invalidates a newly attributed administration review when a material fact changes", () => {
    const encounter = routineInjection();
    encounter.disposition = { kind: "" };
    encounter.disposition = {
      kind: "administered",
      reviewedBy: "Draft MA",
      reviewedAt: "2026-01-30T09:20:00.000Z",
      reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
    };
    const reviewed = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(injectionEncounterToDocumentationInput(encounter, reviewed)).not.toBeNull();

    encounter.site = "R deltoid";
    const changed = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(injectionEncounterToDocumentationInput(encounter, changed)).toBeNull();
  });

  it("maps a fully-documented administered encounter into the documentation input shape", () => {
    const encounter = routineInjection();
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(evaluation.output.administrationDocumented).toBe(true);

    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input).not.toBeNull();
    expect(input!.disposition?.kind).toBe("administered");
    expect(input!.components?.[0]).toMatchObject({
      medication: "Haldol Dec.",
      dose: "100 mg",
      route: "IM",
      site: "L deltoid",
      administeredBy: "Draft MA",
      ndc: "12345-6789-01",
      lot: "DRAFT-LOT",
    });
    expect(input!.preAdministration?.vitals).toEqual({});
    expect(input!.followUp?.nextDoseDate).toBeTruthy();

    const note = DocumentationEngine.format("injection", input!, evaluation);
    expect(note.text).toBeTruthy();
  });

  it("does not put a stale initiation payload into a routine-maintenance note", () => {
    const encounter = routineInjection();
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "aristada-21day",
      oralStatus: "verified",
    };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });

    expect(evaluation.output.administrationDocumented).toBe(true);
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input?.initiation).toBeUndefined();
    expect(input?.components).toHaveLength(1);
  });

  it("removes the generic allergy-review fact once explicit allergy text is documented", () => {
    const encounter = routineInjection();
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input!.preAdministration?.reviewItems ?? []).not.toContain(
      "Allergy review completed as documented.",
    );
    expect(input!.preAdministration?.allergiesReview).toBe("NKDA verified in active record");
  });

  it("surfaces active safety concerns for clinician attention on a non-administration handoff", () => {
    // An active safety concern always blocks administration (it's a hard
    // engine stop), so this scenario is a "held" handoff rather than a
    // documented administration.
    const encounter = routineInjection();
    encounter.activeSafetyConcerns = ["cardiac"];
    encounter.disposition = {
      kind: "held",
      provider: "Dr. Draft",
      time: "2026-01-30T09:20",
      outcome: "Held for cardiac concern review.",
    };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input).not.toBeNull();
    expect(input!.preAdministration?.clinicianAttention?.length).toBeGreaterThan(0);
  });

  it("maps a non-administration (held) disposition with handoff detail instead of components", () => {
    const encounter = routineInjection();
    encounter.disposition = {
      kind: "held",
      provider: "Dr. Draft",
      time: "2026-01-30T09:20",
      outcome: "Held pending provider callback.",
    };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input).not.toBeNull();
    expect(input!.disposition).toMatchObject({
      kind: "held",
      label: "Held",
      notified: "Dr. Draft",
      direction: "Held pending provider callback.",
    });
    expect(input!.components?.[0]?.administrationDate).toBeUndefined();
  });
});

describe("injectionInitiationOptions / injectionInitiationConfig", () => {
  it("returns no initiation options for an unselected or unrecognized medication", () => {
    expect(injectionInitiationOptions("")).toEqual([]);
    expect(injectionInitiationOptions("haldol")).toEqual([]);
  });

  it("returns the paired-dose 1-day initiation option for Abilify Maintena", () => {
    const options = injectionInitiationOptions("maintena");
    expect(options.map((option) => option.id)).toContain("maintena-1day");
  });

  it("configures the Abilify Maintena 1-day protocol as a dual-component initiation", () => {
    const config = injectionInitiationConfig("maintena-1day", "maintena");
    expect(config).not.toBeNull();
    expect(config!.kind).toBe("dual");
    expect(config!.secondaryProduct).toBe("Injection 2 — Abilify Maintena");
  });

  it("configures the 14-day oral pathways as oral-only, with no paired component", () => {
    const config = injectionInitiationConfig("maintena-14day", "maintena");
    expect(config!.kind).toBe("oral");
  });

  it("configures Sustenna Day 1 and Day 8 as distinct calculated kinds", () => {
    expect(injectionInitiationConfig("sustenna-day1", "sustenna")!.kind).toBe("sustenna-day1");
    expect(injectionInitiationConfig("sustenna-day8", "sustenna")!.kind).toBe("sustenna-day8");
  });

  it("falls back to a provider-directed plan with a title sourced from its own option list", () => {
    const config = injectionInitiationConfig("maintena-provider", "maintena");
    expect(config!.kind).toBe("provider");
    expect(config!.title).toBe("Restart / provider plan");
  });
});

describe("medicationChangePatch", () => {
  it("prefills dose, route, and interval when switching to a single-dose medication", () => {
    const encounter = routineInjection(); // starts on "haldol"
    const result = medicationChangePatch(encounter, "vivitrol");
    expect(result.invalidated).toBe(true);
    expect(result.encounter).toMatchObject({
      medicationKey: "vivitrol",
      customMedication: "",
      dose: "380 mg",
      site: "",
      route: INJECTION_MEDICATIONS.vivitrol.route,
      intervalKey: INJECTION_MEDICATIONS.vivitrol.intervalKey,
      nextDoseDate: "",
      verifications: {},
    });
    expect(result.encounter.traceability?.ndc).toBe("");
    expect(result.encounter.initiation).toEqual(emptyInjectionInitiation());
  });

  it("leaves dose and interval unresolved when switching to a multi-dose medication with no prior selection", () => {
    const encounter = emptyInjectionEncounter();
    const result = medicationChangePatch(encounter, "haldol");
    expect(result.invalidated).toBe(false);
    expect(result.encounter.dose).toBe("");
    expect(result.encounter.intervalKey).toBe(INJECTION_MEDICATIONS.haldol.intervalKey);
  });

  it("clears route, dose, and interval without crashing when switching to Other", () => {
    const encounter = routineInjection();
    const result = medicationChangePatch(encounter, "other");
    expect(result.invalidated).toBe(true);
    expect(result.encounter).toMatchObject({ route: "", dose: "", intervalKey: "" });
  });

  it("clears both NDC selections and the next-dose override on a medication change", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      details: {
        ndcSelection: { primary: { ndc: "0000-000-00" }, pairedSecond: { ndc: "1111-111-11" } },
        nextDose: { value: "2026-03-01", source: "manual" },
      },
    };
    const result = medicationChangePatch(encounter, "vivitrol");
    expect(result.details.ndcSelection).toMatchObject({ primary: undefined, pairedSecond: undefined });
    expect(result.details.nextDose).toBeUndefined();
  });
});

describe("doseChangePatch", () => {
  it("recalculates the preferred interval for the catalog medication and clears the NDC and primary selection only", () => {
    const encounter = routineInjection(); // haldol, dose "100 mg", intervalKey "q4wk"
    const result = doseChangePatch(encounter, "300 mg");
    expect(result.invalidated).toBe(true);
    expect(result.encounter.dose).toBe("300 mg");
    expect(result.encounter.intervalKey).toBe(
      preferredIntervalForDose(INJECTION_MEDICATIONS.haldol, "300 mg", encounter.intervalKey),
    );
    expect(result.encounter.traceability?.ndc).toBe("");
    expect(result.details.ndcSelection).toMatchObject({ primary: undefined });
    // Unlike a medication change, a dose change does not touch the paired
    // component's NDC or the next-dose override.
    expect(result.details).not.toHaveProperty("nextDose");
  });

  it("is not flagged as invalidating the first time a dose is entered", () => {
    const encounter: InjectionEncounter = { ...routineInjection(), dose: "" };
    const result = doseChangePatch(encounter, "100 mg");
    expect(result.invalidated).toBe(false);
  });

  it("keeps the current interval unchanged when no catalog medication is selected", () => {
    const encounter: InjectionEncounter = { ...routineInjection(), medicationKey: "other" };
    const result = doseChangePatch(encounter, "custom 50 mg");
    expect(result.encounter.intervalKey).toBe(encounter.intervalKey);
  });
});

describe("intervalChangePatch", () => {
  it("returns a patch containing only the new interval", () => {
    expect(intervalChangePatch("q6wk")).toEqual({ intervalKey: "q6wk" });
  });
});

const fakeEvaluation = (
  overrides: Partial<{ calculatedDates: Record<string, string>; cadenceLabel: string }> = {},
): ClinicalEvaluation<InjectionEvaluationOutput> =>
  ({
    workflow: "injection",
    readiness: "ready",
    stops: [],
    warnings: [],
    recommendations: [],
    calculatedDates: overrides.calculatedDates ?? { expectedNextDoseDate: "2026-02-27" },
    output: { timing: { cadenceLabel: overrides.cadenceLabel ?? "q4wk" } },
  }) as unknown as ClinicalEvaluation<InjectionEvaluationOutput>;

describe("nextDoseProvenanceDecision", () => {
  it("flags a legacy Other return date with no recorded provenance for review", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      medicationKey: "other",
      nextDoseDate: "2026-03-01",
      details: {},
    };
    expect(nextDoseProvenanceDecision(encounter, fakeEvaluation())).toEqual({ kind: "legacy-review" });
  });

  it("surfaces the recorded override reason for a manual next-dose value", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      details: { nextDose: { value: "2026-03-01", source: "manual", overrideReason: "Provider directed early" } },
    };
    expect(nextDoseProvenanceDecision(encounter, fakeEvaluation())).toEqual({
      kind: "manual-override",
      reason: "Provider directed early",
    });
  });

  it("falls back to a generic manual-review reason when none was recorded", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      details: { nextDose: { value: "2026-03-01", source: "manual" } },
    };
    expect(nextDoseProvenanceDecision(encounter, fakeEvaluation())).toEqual({
      kind: "manual-override",
      reason: "manual date requires review",
    });
  });

  it("prompts for a one-time Other order with no return date instead of a routine cadence", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      medicationKey: "other",
      intervalKey: "once",
      nextDoseDate: "",
      details: {},
    };
    const noSuggestion = fakeEvaluation({ calculatedDates: {} });
    expect(nextDoseProvenanceDecision(encounter, noSuggestion)).toEqual({ kind: "one-time-no-return" });
  });

  it("prompts to enter a return date for a routine Other order with no suggestion yet", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      medicationKey: "other",
      intervalKey: "q4wk",
      nextDoseDate: "",
      details: {},
    };
    const noSuggestion = fakeEvaluation({ calculatedDates: {} });
    expect(nextDoseProvenanceDecision(encounter, noSuggestion)).toEqual({ kind: "enter-return-date" });
  });

  it("prompts to enter administration date and interval for a catalog medication with no suggestion", () => {
    const encounter: InjectionEncounter = { ...routineInjection(), details: {} };
    const noSuggestion = fakeEvaluation({ calculatedDates: {} });
    expect(nextDoseProvenanceDecision(encounter, noSuggestion)).toEqual({
      kind: "enter-administration-and-interval",
    });
  });

  it("targets the Sustenna Day 8 date on a Day 1 initiation", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      medicationKey: "sustenna",
      initiation: { ...emptyInjectionInitiation(), protocol: "sustenna-day1" },
      details: {},
    };
    expect(nextDoseProvenanceDecision(encounter, fakeEvaluation())).toEqual({
      kind: "sustenna-day8",
      administrationDate: encounter.administrationDate,
    });
  });

  it("shows the evaluator's cadence label for a routine calculated suggestion", () => {
    const encounter: InjectionEncounter = { ...routineInjection(), details: {} };
    expect(nextDoseProvenanceDecision(encounter, fakeEvaluation({ cadenceLabel: "q6wk" }))).toEqual({
      kind: "cadence",
      cadence: "q6wk",
      administrationDate: encounter.administrationDate,
    });
  });
});

describe("applyCalculatedNextDosePatch / applyManualNextDosePatch", () => {
  it("records a calculated next-dose value with its calculation source", () => {
    const encounter = routineInjection();
    const result = applyCalculatedNextDosePatch(encounter, "2026-02-27");
    expect(result.encounter).toEqual({ nextDoseDate: "2026-02-27" });
    expect(result.details.nextDose).toEqual({
      value: "2026-02-27",
      source: "calculated",
      calculatedFrom: `${encounter.administrationDate}|${encounter.intervalKey}`,
    });
  });

  it("records a manual override with its provider only for a provider-direction override", () => {
    const encounter = routineInjection();
    const activeOrder = applyManualNextDosePatch(
      encounter,
      "2026-03-15",
      { kind: "active-order", reason: "Extended per active order", provider: "Dr. Ignored" },
      "2026-01-30T09:20:00.000Z",
    );
    expect(activeOrder.details.nextDose).toMatchObject({
      source: "manual",
      overrideKind: "active-order",
      overrideReason: "Extended per active order",
      overrideProvider: undefined,
      recordedAt: "2026-01-30T09:20:00.000Z",
    });

    const providerDirected = applyManualNextDosePatch(
      encounter,
      "2026-03-15",
      { kind: "provider-direction", reason: "Provider approved early", provider: " Dr. Draft " },
      "2026-01-30T09:20:00.000Z",
    );
    expect(providerDirected.details.nextDose).toMatchObject({
      overrideKind: "provider-direction",
      overrideProvider: "Dr. Draft",
    });
  });
});

describe("validatedNextDoseOverride", () => {
  const baseDraft = { date: "2026-03-15", kind: "active-order" as const, reason: "Extended", provider: "" };

  it("accepts a complete active-order override", () => {
    expect(validatedNextDoseOverride(baseDraft)).toEqual({
      value: "2026-03-15",
      override: { kind: "active-order", reason: "Extended", provider: "" },
    });
  });

  it("rejects an invalid date, a blank reason, or a missing provider on a provider-direction override", () => {
    expect(validatedNextDoseOverride({ ...baseDraft, date: "not-a-date" })).toBeNull();
    expect(validatedNextDoseOverride({ ...baseDraft, reason: "   " })).toBeNull();
    expect(validatedNextDoseOverride({ ...baseDraft, kind: "provider-direction", provider: "  " })).toBeNull();
    expect(
      validatedNextDoseOverride({ ...baseDraft, kind: "provider-direction", provider: "Dr. Draft" }),
    ).not.toBeNull();
  });
});

describe("selectDispositionPatch", () => {
  it("stamps a fresh administration review when disposition becomes administered", () => {
    const encounter: InjectionEncounter = { ...routineInjection(), disposition: { kind: "" } };
    const result = selectDispositionPatch(encounter, "administered", "Session MA", "2026-01-30T09:20:00.000Z");
    expect(result).toMatchObject({
      kind: "administered",
      provider: "",
      time: "",
      outcome: "",
      reviewedBy: "Session MA",
      reviewedAt: "2026-01-30T09:20:00.000Z",
      reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
    });
  });

  it("falls back to the documented administeredBy when no one is signed in", () => {
    const encounter = { ...routineInjection(), administeredBy: "Charted MA" };
    const result = selectDispositionPatch(encounter, "administered", "  ", "2026-01-30T09:20:00.000Z");
    expect(result.reviewedBy).toBe("Charted MA");
  });

  it("clears review metadata for a non-administered disposition", () => {
    const result = selectDispositionPatch(routineInjection(), "held", "Session MA", "2026-01-30T09:20:00.000Z");
    expect(result).toEqual({ kind: "held", reviewedBy: "", reviewedAt: "", reviewFingerprint: "" });
  });
});

describe("applyPrimaryNdcPatch / applyPairedNdcPatch", () => {
  it("applies the primary NDC to traceability and the primary selection slot", () => {
    const encounter = routineInjection();
    const result = applyPrimaryNdcPatch(encounter, fakeEvaluation(), "12345-6789-02", {
      ndc: "12345-6789-02",
      source: "bundled",
    });
    expect(result.encounter.traceability).toEqual({ ...encounter.traceability, ndc: "12345-6789-02" });
    expect(result.details.ndcSelection).toMatchObject({ primary: { ndc: "12345-6789-02", source: "bundled" } });
  });

  it("applies the paired NDC to the initiation second component and the paired selection slot", () => {
    const encounter: InjectionEncounter = {
      ...routineInjection(),
      initiation: { ...emptyInjectionInitiation(), second: { ...emptyInjectionInitiation().second, dose: "300 mg" } },
    };
    const result = applyPairedNdcPatch(encounter, fakeEvaluation(), "98765-4321-01", {
      ndc: "98765-4321-01",
      source: "custom",
    });
    expect(result.encounter.initiation?.second).toMatchObject({ dose: "300 mg", ndc: "98765-4321-01" });
    expect(result.details.ndcSelection).toMatchObject({ pairedSecond: { ndc: "98765-4321-01", source: "custom" } });
  });
});

describe("lateDoseReviewConfirmationPatch", () => {
  it("keeps the provider and time only for a provider-authorized review", () => {
    const authorized = lateDoseReviewConfirmationPatch(
      { choice: "provider-authorized", note: " Reviewed ", provider: " Dr. Draft ", time: " 09:15 " },
      "fingerprint-1",
    );
    expect(authorized).toEqual({
      lateDoseReview: "provider-authorized",
      lateDoseReviewNote: "Reviewed",
      lateDoseReviewProvider: "Dr. Draft",
      lateDoseReviewTime: "09:15",
      lateDoseReviewFingerprint: "fingerprint-1",
    });
  });

  it("blanks the provider and time for any other review choice", () => {
    const other = lateDoseReviewConfirmationPatch(
      { choice: "other", note: "Documented elsewhere", provider: "Dr. Draft", time: "09:15" },
      "fingerprint-2",
    );
    expect(other.lateDoseReviewProvider).toBe("");
    expect(other.lateDoseReviewTime).toBe("");
  });
});
