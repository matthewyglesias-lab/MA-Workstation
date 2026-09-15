import { describe, expect, it } from "vitest";
import {
  evaluateWorkstationClinical,
  hasCurrentWorkstationPolicyReview,
  workstationDocumentationEncounter,
  workstationNextDate,
  workstationPolicyReviewFingerprint,
  workstationSchedule,
  type WorkstationClinicalContext,
} from "../src/shared/workstation-clinical-policy.js";
import {
  emptyInjectionEncounter,
  injectionAdministrationReviewFingerprint,
  injectionTimingReviewFingerprint,
  hasCurrentInjectionAdministrationReview,
  type InjectionEncounter,
} from "../src/shared/workstation/domain/injection.js";
import { addCalendarDays } from "../src/shared/workstation/domain/dates.js";

function encounter(
  overrides: Partial<InjectionEncounter> = {},
): InjectionEncounter {
  return {
    ...emptyInjectionEncounter(),
    medicationKey: "sustenna",
    dose: "156 mg",
    route: "IM",
    site: "R gluteal",
    intervalKey: "q4wk",
    reason: "scheduled",
    priorDoseDate: "2026-01-01",
    administrationDate: "2026-01-29",
    ...overrides,
  };
}
const policyCodes = (
  e: InjectionEncounter,
  c: WorkstationClinicalContext = {},
) =>
  evaluateWorkstationClinical(e, c)
    .stops.map((x) => x.code)
    .filter((x) => x.startsWith("policy."));
function review(e: InjectionEncounter, c: WorkstationClinicalContext = {}) {
  e.details = {
    ...e.details,
    lateDoseReview: "provider-authorized",
    lateDoseReviewProvider: "Test prescriber",
    lateDoseReviewTime: "10:15",
    lateDoseReviewNote:
      "Verified active order and product-specific plan in chart.",
  };
  e.details.lateDoseReviewFingerprint = workstationPolicyReviewFingerprint(
    e,
    c,
  );
  return e;
}

describe("calendar and source-specific cadence overlay", () => {
  it.each([
    ["trinza", "q12wk", "2026-01-31", "2026-04-30", 3, "months"],
    ["hafyera", "q26wk", "2024-08-31", "2025-02-28", 6, "months"],
    ["uzedy", "q4wk", "2024-01-31", "2024-02-29", 1, "months"],
    ["uzedy", "q8wk", "2026-12-31", "2027-02-28", 2, "months"],
    ["aristada", "q8wk", "2026-07-31", "2026-09-30", 2, "months"],
    ["asimtufii", "q8wk", "2026-01-31", "2026-03-28", 56, "days"],
  ] as const)(
    "%s preserves its actual label cadence",
    (medicationKey, intervalKey, administrationDate, due, every, unit) => {
      const e = encounter({ medicationKey, intervalKey, administrationDate });
      expect(workstationSchedule(e)).toEqual({ every, unit });
      expect(workstationNextDate(e)).toBe(due);
    },
  );
  it("never calculates for Other, one-time Initio, or provider-directed restart", () => {
    expect(workstationNextDate(encounter({ medicationKey: "other" }))).toBe("");
    expect(
      workstationNextDate(
        encounter({ medicationKey: "initio", intervalKey: "once" }),
      ),
    ).toBe("");
    const e = encounter({ reason: "reinit" });
    e.initiation!.protocol = "sustenna-provider";
    expect(workstationNextDate(e)).toBe("");
  });
  it.each([
    [-14, false],
    [14, false],
    [-15, true],
    [15, true],
  ])("Trinza calendar range boundary %i days", (offset, blocked) => {
    const e = encounter({
      medicationKey: "trinza",
      dose: "546 mg",
      intervalKey: "q12wk",
      priorDoseDate: "2026-01-31",
      administrationDate: addCalendarDays("2026-04-30", offset),
    });
    const result = evaluateWorkstationClinical(e);
    expect(result.output.timing.expectedDate).toBe("2026-04-30");
    expect(policyCodes(e).includes("policy.timing.review")).toBe(blocked);
    expect(
      result.output.guidance.some((x) => x.message.includes("fixed 84")),
    ).toBe(false);
  });
  it("anchors Sustenna Day8 and first maintenance to Day1, not the actual Day8 date", () => {
    const e = encounter({
      reason: "initiation",
      administrationDate: "2026-01-12",
      site: "R deltoid",
    });
    Object.assign(e.initiation!, {
      protocol: "sustenna-day8",
      day1Date: "2026-01-01",
      sustennaOrder: "standard",
    });
    const result = evaluateWorkstationClinical(e);
    expect(result.output.timing.earliestDate).toBe("2026-01-04");
    expect(result.output.timing.latestDate).toBe("2026-01-12");
    expect(result.output.expectedNextDoseDate).toBe("2026-02-05");
    expect(policyCodes(e)).not.toContain("policy.sustenna.day8");
    e.administrationDate = "2026-01-13";
    expect(policyCodes(e)).toContain("policy.sustenna.day8");
    expect(workstationNextDate(e)).toBe("2026-02-05");
  });
});

describe("product-specific missed-dose review", () => {
  it("does not interpret the console component doseSequence as Maintena history", () => {
    const e = encounter({
      medicationKey: "maintena",
      dose: "400 mg",
      administrationDate: "2026-02-08",
    });
    expect(policyCodes(e, { doseSequence: 5 })).toContain(
      "policy.maintena.history",
    );
    expect(policyCodes(e, { priorMaintenanceDoses: 1 })).toContain(
      "policy.maintena.restart",
    );
    expect(policyCodes(e, { priorMaintenanceDoses: 3 })).toContain(
      "policy.maintena.missed",
    );
  });
  it.each([
    [25, "early"],
    [35, "boundary"],
    [36, "restart"],
  ])("Maintena early/second-dose boundary at %i days", (days, code) => {
    expect(
      policyCodes(
        encounter({
          medicationKey: "maintena",
          dose: "400 mg",
          administrationDate: addCalendarDays("2026-01-01", days),
        }),
        { priorMaintenanceDoses: 1 },
      ),
    ).toContain(`policy.maintena.${code}`);
  });
  it.each([
    ["441 mg", 42, null],
    ["441 mg", 43, "supplement"],
    ["441 mg", 49, "supplement"],
    ["441 mg", 50, "restart"],
    ["662 mg", 56, null],
    ["662 mg", 57, "supplement"],
    ["882 mg", 84, "supplement"],
    ["882 mg", 85, "restart"],
    ["1064 mg", 70, null],
    ["1064 mg", 71, "supplement"],
    ["1064 mg", 85, "restart"],
  ])("Aristada previous strength %s, elapsed %i", (priorDose, days, tier) => {
    const codes = policyCodes(
      encounter({
        medicationKey: "aristada",
        dose: "441 mg",
        administrationDate: addCalendarDays("2026-01-01", Number(days)),
      }),
      { priorDose: String(priorDose) },
    );
    if (tier) expect(codes).toContain(`policy.aristada.${tier}`);
    else
      expect(codes.some((x) => /aristada\.(supplement|restart)/.test(x))).toBe(
        false,
      );
  });
  it("requires prior Aristada strength rather than using current dose", () => {
    expect(
      policyCodes(
        encounter({
          medicationKey: "aristada",
          dose: "1064 mg",
          administrationDate: "2026-02-20",
        }),
      ),
    ).toContain("policy.aristada.history");
  });
  it.each([
    ["trinza", "q12wk", "2026-05-01", "trinza.reinitiation"],
    ["trinza", "q12wk", "2026-10-02", "trinza.restart"],
    ["hafyera", "q26wk", "2026-07-23", "hafyera.reinitiation-one"],
    ["hafyera", "q26wk", "2026-09-01", "hafyera.reinitiation-two"],
    ["hafyera", "q26wk", "2026-12-02", "hafyera.restart"],
    ["asimtufii", "q8wk", "2026-04-09", "asimtufii.boundary"],
    ["asimtufii", "q8wk", "2026-04-10", "asimtufii.restart"],
    ["sustenna", "q4wk", "2026-02-13", "sustenna.reinitiation"],
    ["sustenna", "q4wk", "2026-07-02", "sustenna.restart"],
  ] as const)(
    "%s %s at %s selects review %s",
    (medicationKey, intervalKey, administrationDate, code) => {
      expect(
        policyCodes(
          encounter({ medicationKey, intervalKey, administrationDate }),
        ),
      ).toContain(`policy.${code}`);
    },
  );
  it("late acknowledgement alone cannot clear a restart requiring a new plan", () => {
    const e = review(
      encounter({
        medicationKey: "trinza",
        intervalKey: "q12wk",
        administrationDate: "2026-05-01",
      }),
    );
    expect(policyCodes(e)).toContain("policy.trinza.reinitiation");
    e.reason = "reinit";
    e.initiation!.planVerified = true;
    e.initiation!.providerNote =
      "Verified separate re-initiation components in chart.";
    review(e);
    expect(policyCodes(e)).not.toContain("policy.trinza.reinitiation");
    expect(e.dose).toBe("156 mg"); // The policy never selects or changes a dose.
  });
  it("does not apply a same-product missed-dose table to a different previous product", () => {
    const e = encounter({
      medicationKey: "trinza",
      intervalKey: "q12wk",
      administrationDate: "2026-05-01",
    });
    const codes = policyCodes(e, { priorProduct: "Invega Sustenna" });
    expect(codes).toContain("policy.transition.history");
    expect(codes).not.toContain("policy.trinza.reinitiation");
  });
  it("never invents a grace window for a nonstandard interval", () => {
    const e = encounter({ medicationKey: "trinza", intervalKey: "q1wk" });
    expect(workstationSchedule(e)).toBeNull();
    expect(workstationNextDate(e)).toBe("");
    expect(evaluateWorkstationClinical(e).output.timing.earliestDate).toBe("");
    expect(policyCodes(e)).toContain("policy.interval.provider-plan");
  });
});

describe("indication, needle and review provenance", () => {
  it("gates unknown Uzedy indication and unsupported bipolar regimen", () => {
    const e = encounter({
      medicationKey: "uzedy",
      dose: "150 mg",
      intervalKey: "q8wk",
      route: "SubQ",
      site: "Abdomen RUQ (SubQ)",
    });
    expect(policyCodes(e)).toContain("policy.uzedy.indication");
    expect(policyCodes(e, { indication: "bipolar_i" })).toContain(
      "policy.uzedy.provider-plan",
    );
    expect(policyCodes(e, { indication: "schizophrenia" })).not.toContain(
      "policy.uzedy.provider-plan",
    );
  });
  it("applies deltoid requirement to renal-adjusted Erzofri initiation", () => {
    expect(
      policyCodes(
        encounter({
          medicationKey: "erzofri",
          dose: "234 mg",
          reason: "initiation",
        }),
      ),
    ).toContain("policy.erzofri.initiation-site");
  });
  it("leaves weight-dependent needle unresolved instead of guessing", () => {
    const e = encounter({ site: "R deltoid" });
    expect(policyCodes(e)).toContain("policy.needle.inputs");
    e.vitals = { weight: "198.416", weightUnit: "lb" };
    expect(policyCodes(e)).not.toContain("policy.needle.inputs");
  });
  it("binds review to indication, previous dose count, previous strength, and plan", () => {
    const e = review(encounter(), {
      indication: "schizophrenia",
      priorMaintenanceDoses: 3,
      priorDose: "156 mg",
    });
    expect(
      hasCurrentWorkstationPolicyReview(e, {
        indication: "schizophrenia",
        priorMaintenanceDoses: 3,
        priorDose: "156 mg",
      }),
    ).toBe(true);
    expect(
      hasCurrentWorkstationPolicyReview(e, {
        indication: "bipolar_i",
        priorMaintenanceDoses: 3,
        priorDose: "156 mg",
      }),
    ).toBe(false);
    expect(
      hasCurrentWorkstationPolicyReview(e, {
        indication: "schizophrenia",
        priorMaintenanceDoses: 2,
        priorDose: "156 mg",
      }),
    ).toBe(false);
    e.details!.lateDoseReview = "other";
    expect(
      hasCurrentWorkstationPolicyReview(e, {
        indication: "schizophrenia",
        priorMaintenanceDoses: 3,
        priorDose: "156 mg",
      }),
    ).toBe(false);
  });
  it("translates reviewed prose without repairing stale final review or mutating input", () => {
    const e = review(encounter());
    e.disposition = {
      kind: "administered",
      reviewedBy: "Test MA",
      reviewedAt: "2026-01-29T18:00:00Z",
    };
    e.disposition.reviewFingerprint =
      injectionAdministrationReviewFingerprint(e);
    const stored = JSON.stringify(e);
    const copy = workstationDocumentationEncounter(e);
    expect(copy.details?.lateDoseReviewFingerprint).toBe(
      injectionTimingReviewFingerprint(copy),
    );
    expect(hasCurrentInjectionAdministrationReview(copy)).toBe(true);
    expect(JSON.stringify(e)).toBe(stored);
    e.allergies = "Changed after final review";
    expect(
      hasCurrentInjectionAdministrationReview(
        workstationDocumentationEncounter(e),
      ),
    ).toBe(false);
  });
  it("does not erase unrelated safety stops or mutate the vendored reference", () => {
    const e = encounter({
      medicationKey: "trinza",
      intervalKey: "q12wk",
      activeSafetyConcerns: ["nms"],
    });
    expect(
      evaluateWorkstationClinical(e).stops.some(
        (x) => x.code === "safety.concern.nms",
      ),
    ).toBe(true);
    const first =
      evaluateWorkstationClinical(e).output.medication?.clinicalReference
        ?.facts;
    evaluateWorkstationClinical(e);
    expect(
      evaluateWorkstationClinical(e).output.medication?.clinicalReference
        ?.facts,
    ).toEqual(first);
  });
});
