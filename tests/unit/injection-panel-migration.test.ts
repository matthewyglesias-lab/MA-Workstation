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
