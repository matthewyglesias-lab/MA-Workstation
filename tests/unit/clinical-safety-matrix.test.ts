import { describe, expect, it } from "vitest";

import {
  FormsEngine,
  InjectionEngine,
  SamplesEngine,
  UDS_PANELS,
  UdsEngine,
  confirmSampleReview,
  emptyFormsEncounter,
  emptyInjectionEncounter,
  emptySamplesEncounter,
  emptyUdsEncounter,
  type InjectionEncounter,
  type SamplesEncounter,
  type UdsEncounter,
} from "../../src/domain";

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
  patient: { name: "SAFETY, MATRIX", dob: "01/01/1990" },
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
  orderingProvider: "Safety Provider",
  administeredBy: "Safety MA",
  administrationTime: "09:15",
  allergies: "NKDA verified in active record",
  traceability: {
    ndc: "12345-6789-01",
    lot: "SAFETY-LOT",
    expiration: "2027-12",
  },
  response: { kind: "well" },
  attestations: requiredInjectionAttestations,
  verifications: { deepZtrack: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
});

const issueCodes = (
  evaluation: ReturnType<typeof InjectionEngine.evaluate>,
  kind: "stops" | "warnings",
) => evaluation[kind].map((entry) => entry.code);

describe("InjectionEngine safety matrix", () => {
  it("distinguishes an early review window from a late stop", () => {
    const early = routineInjection();
    // Haldol timing is now an order-dependent review rather than an invented
    // fixed window. ERZOFRI retains a label-supported monthly timing window.
    early.medicationKey = "erzofri";
    early.dose = "117 mg";
    early.verifications = { resuspend: true };
    early.administrationDate = "2026-01-19";
    early.nextDoseDate = "2026-02-16";
    const earlyResult = InjectionEngine.evaluate(early, {
      today: early.administrationDate,
    });
    expect(earlyResult.output.timing.state).toBe("warning");
    expect(issueCodes(earlyResult, "warnings")).toContain("timing.review");
    expect(issueCodes(earlyResult, "stops")).not.toContain(
      "timing.outside-window",
    );

    const late = routineInjection();
    late.medicationKey = "erzofri";
    late.dose = "117 mg";
    late.verifications = { resuspend: true };
    late.administrationDate = "2026-02-10";
    late.nextDoseDate = "2026-03-10";
    const lateResult = InjectionEngine.evaluate(late, {
      today: late.administrationDate,
    });
    expect(lateResult.output.timing.state).toBe("stop");
    expect(issueCodes(lateResult, "stops")).toContain("timing.outside-window");
    expect(lateResult.output.canFinalize).toBe(false);
  });

  it.each([
    [{ bp: "180/120" }, "vitals.bp.urgent"],
    [{ bp: "88/48" }, "vitals.bp.low"],
    [{ hr: "120" }, "vitals.hr.review"],
    [{ temperature: "100.4 F" }, "vitals.temperature.fever"],
  ])("blocks an administered encounter for %j", (vitals, code) => {
    const encounter = routineInjection();
    encounter.vitals = vitals;
    const result = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    expect(issueCodes(result, "stops")).toContain(code);
    expect(result.output.administrationDocumented).toBe(false);
  });

  it("keeps Vivitrol fever review as a warning while preserving its medication gates", () => {
    const encounter = routineInjection();
    encounter.medicationKey = "vivitrol";
    encounter.dose = "380 mg";
    encounter.site = "L ventrogluteal";
    encounter.reason = "prn";
    encounter.priorDoseDate = "";
    encounter.verifications = {
      opioidFree: true,
      naltrexHS: true,
      suppliedNeedle: true,
    };
    encounter.vitals = { temperature: "100.4 F" };
    const result = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    expect(issueCodes(result, "stops")).not.toContain(
      "vitals.temperature.fever",
    );
    expect(issueCodes(result, "warnings")).toContain(
      "vitals.temperature.fever",
    );
  });

  it("blocks active safety concerns, expired product, and route/site mismatches", () => {
    const encounter = routineInjection();
    encounter.activeSafetyConcerns = ["acute neurologic change"];
    encounter.traceability.expiration = "2025-12";
    encounter.route = "SubQ";
    const result = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    expect(issueCodes(result, "stops")).toEqual(
      expect.arrayContaining([
        "safety.concern.acute neurologic change",
        "trace.expired",
        "route.outside-guidance",
      ]),
    );
    expect(result.output.canFinalize).toBe(false);
  });

  it("keeps a non-administration disposition from becoming an administration", () => {
    const encounter = routineInjection();
    encounter.disposition = {
      kind: "held",
      provider: "Safety Provider",
      time: "09:20",
      outcome: "Hold today; provider will reassess.",
    };
    const result = InjectionEngine.evaluate(encounter, {
      today: encounter.administrationDate,
    });
    expect(result.output.administrationDocumented).toBe(false);
    expect(result.output.recordStatus).toBe("handoff-ready");
    expect(result.output.canFinalize).toBe(true);
    expect(issueCodes(result, "warnings")).toContain(
      "disposition.non-administration",
    );
  });
});

const routineUds = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "SAFETY, UDS", dob: "02/02/1991" },
  collectionDateTime: "2026-07-30T09:00",
  device: "SAFE life 14-Panel Cup",
  physicalReadingsVerified: true,
  lot: "UDS-SAFETY",
  expiration: "2027-06",
  collector: "Safety MA",
  results: Object.fromEntries(
    UDS_PANELS.map((panel) => [panel, "neg"]),
  ) as UdsEncounter["results"],
});

describe("UdsEngine control and reconciliation matrix", () => {
  it("prevents final output for an invalid control or expired device", () => {
    const invalid = routineUds();
    invalid.control = "invalid";
    const invalidResult = UdsEngine.evaluate(invalid, {
      today: "2026-07-30",
    });
    expect(invalidResult.stops.map((entry) => entry.code)).toContain(
      "control.invalid",
    );
    expect(invalidResult.output.finalizedOutputAllowed).toBe(false);

    const expired = routineUds();
    expired.expiration = "2026-06";
    const expiredResult = UdsEngine.evaluate(expired, {
      today: "2026-07-30",
    });
    expect(expiredResult.stops.map((entry) => entry.code)).toContain(
      "trace.expired",
    );
    expect(expiredResult.output.finalizedOutputAllowed).toBe(false);
  });

  it("routes positives, invalid panels, and reconciliation mismatches to review", () => {
    const encounter = routineUds();
    encounter.results.THC = "pos";
    encounter.results.BZO = "invalid";
    encounter.medicationAlignment = "needs review";
    const result = UdsEngine.evaluate(encounter, {
      today: "2026-07-30",
    });
    expect(result.warnings.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "results.preliminary-positive",
        "results.invalid-panels",
        "reconciliation.review",
      ]),
    );
    expect(result.output.activityStatus).toBe("needs_review");
    expect(result.recommendations.map((entry) => entry.code)).toContain(
      "uds.provider-review",
    );
  });
});

const routineSample = (): SamplesEncounter => ({
  ...emptySamplesEncounter(),
  patient: { name: "SAFETY, SAMPLE", dob: "03/03/1992" },
  prescriber: "Safety Provider",
  staff: "Safety MA",
  dispenseDate: "2026-07-30",
  startDate: "2026-07-30",
  medicationKey: "vraylar",
  medicationLabel: "Vraylar 1.5 mg",
  quantity: "1 package",
  directions: "Take one capsule daily as directed.",
  purpose: "Starter supply",
  medicationReview: "Prescriber reviewed / ok to dispense",
  education: "Reviewed with patient",
  packages: [
    {
      id: "primary",
      medicationStrength: "Vraylar 1.5 mg",
      quantity: "1 package",
      lot: "SAMPLE-A",
      expiration: "2027-10",
    },
  ],
  plan: [],
});

describe("SamplesEngine package and final-review matrix", () => {
  it("requires every physical package to have independent in-date traceability", () => {
    const encounter = routineSample();
    encounter.packages.push({
      id: "added",
      medicationStrength: "Vraylar 1.5 mg",
      quantity: "1 package",
      lot: "",
      expiration: "2026-06",
    });
    const result = SamplesEngine.evaluate(encounter, {
      today: "2026-07-30",
    });
    expect(result.stops.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "samples.package.added.lot",
        "samples.package.added.expired",
        "samples.review-today",
      ]),
    );
    expect(result.output.reviewEligible).toBe(false);
  });

  it("invalidates a confirmed review after an identity or package change and on the next day", () => {
    const confirmed = confirmSampleReview(
      routineSample(),
      "2026-07-30T10:00:00",
    );
    expect(
      SamplesEngine.evaluate(confirmed, { today: "2026-07-30" }).output
        .reviewCurrent,
    ).toBe(true);

    confirmed.patient.name = "CHANGED, PATIENT";
    expect(
      SamplesEngine.evaluate(confirmed, { today: "2026-07-30" }).output
        .reviewCurrent,
    ).toBe(false);

    const nextDay = confirmSampleReview(
      routineSample(),
      "2026-07-30T10:00:00",
    );
    expect(
      SamplesEngine.evaluate(nextDay, { today: "2026-07-31" }).output
        .reviewCurrent,
    ).toBe(false);
  });
});

describe("FormsEngine release matrix", () => {
  it("keeps provider-review work active until target tracking is documented", () => {
    const encounter = {
      ...emptyFormsEncounter(),
      patient: { name: "SAFETY, FORMS", dob: "04/04/1993" },
      provider: "Safety Provider",
      staff: "Safety MA",
      status: "provider_review" as const,
      diagnosisWording: "Provider-approved clinical wording.",
    };
    const result = FormsEngine.evaluate(encounter, {});
    expect(result.warnings.map((entry) => entry.code)).toContain(
      "forms.target-date",
    );
    expect(result.output.requiresTargetDate).toBe(true);
    expect(result.output.activityStatus).toBe("needs_review");
  });

  it("requires explicit provider approval before a release-ready state", () => {
    const encounter = {
      ...emptyFormsEncounter(),
      patient: { name: "SAFETY, FORMS", dob: "04/04/1993" },
      provider: "Safety Provider",
      staff: "Safety MA",
      status: "ready" as const,
      diagnosisWording: "Provider-approved clinical wording.",
    };
    const blocked = FormsEngine.evaluate(encounter, {});
    expect(blocked.stops.map((entry) => entry.code)).toContain(
      "forms.provider-approval",
    );
    expect(blocked.output.releaseAllowed).toBe(false);

    encounter.providerApprovalConfirmed = true;
    const approved = FormsEngine.evaluate(encounter, {});
    expect(approved.stops).toEqual([]);
    expect(approved.output.releaseAllowed).toBe(true);
  });
});
