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
  emptyInjectionInitiation,
  emptySamplesEncounter,
  emptyUdsEncounter,
  type InjectionEncounter,
  type SamplesEncounter,
  type UdsEncounter,
} from "../../src/domain";

const routineAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const validInjection = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "PATIENT, TEST", dob: "01/01/1990" },
  medicationKey: "sustenna",
  dose: "156 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "initiation",
  administrationDate: "2026-01-08",
  nextDoseDate: "2026-02-05",
  orderingProvider: "Dr Test",
  administeredBy: "MA",
  administrationTime: "09:15",
  allergies: "NKDA",
  traceability: { ndc: "12345-6789-01", lot: "LOT-A", expiration: "2027-12" },
  response: { kind: "well" },
  attestations: routineAttestations,
  verifications: { resuspend: true, invegaInit: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
});

describe("InjectionEngine", () => {
  it("calculates Sustenna Day 8 and monthly dates without deciding the dose", () => {
    const encounter = validInjection();
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "sustenna-day8",
      planVerified: true,
      sustennaOrder: "standard",
      day1Date: "2026-01-01",
    };

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });

    expect(result.stops).toEqual([]);
    expect(result.calculatedDates).toMatchObject({
      sustennaDay8Target: "2026-01-08",
      sustennaDay8Early: "2026-01-04",
      sustennaDay8Late: "2026-01-12",
      sustennaMonthlyTarget: "2026-02-05",
    });
    expect(result.output.administrationDocumented).toBe(true);
  });

  it("warns but does not block a Day 8 date outside the displayed ±4-day window", () => {
    const encounter = validInjection();
    encounter.administrationDate = "2026-01-13";
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "sustenna-day8",
      planVerified: true,
      sustennaOrder: "standard",
      day1Date: "2026-01-01",
    };

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-13" });

    expect(result.stops.map((entry) => entry.code)).not.toContain(
      "initiation.sustenna.outside-window",
    );
    expect(result.warnings.map((entry) => entry.code)).toContain(
      "initiation.sustenna.outside-window",
    );
    expect(result.output.administrationDocumented).toBe(true);
    // 2026-01-13 is after the ±4-day window's late edge (2026-01-12) - the
    // late-dose review prompt should trigger for this administration date.
    expect(result.output.lateDoseWarning).toBe(true);
  });

  it("targets the Day 8 date for a Sustenna Day 1 initiation, not the ordered maintenance interval", () => {
    const encounter = validInjection();
    encounter.administrationDate = "2026-01-01";
    encounter.nextDoseDate = "2026-01-08";
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "sustenna-day1",
      planVerified: true,
      sustennaOrder: "standard",
    };

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-01" });

    // q4wk (the ordered maintenance interval) would put this 28 days out;
    // the actual next dose in the loading regimen is Day 8, 7 days out.
    expect(result.calculatedDates.expectedNextDoseDate).toBe("2026-01-08");
    expect(result.output.expectedNextDoseDate).toBe("2026-01-08");
    expect(result.stops).toEqual([]);
  });

  it("does not auto-calculate a follow-up date on a provider-directed re-initiation path", () => {
    const encounter = validInjection();
    encounter.initiation = {
      ...emptyInjectionInitiation(),
      protocol: "sustenna-provider",
      planVerified: true,
      providerNote: "Provider-directed restart per current PI; see order.",
    };

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });

    expect(result.calculatedDates.expectedNextDoseDate).toBeUndefined();
    expect(result.output.expectedNextDoseDate).toBe("");
  });

  it.each(["im", "IM ", " im", "Im"])(
    "does not block a re-typed route that only differs in case or whitespace (%j)",
    (route) => {
      const encounter = validInjection();
      encounter.route = route;

      const result = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });

      expect(result.stops.map((entry) => entry.code)).not.toContain(
        "route.outside-guidance",
      );
      expect(result.output.administrationDocumented).toBe(true);
    },
  );

  it("still blocks a genuinely unlisted route", () => {
    const encounter = validInjection();
    encounter.route = "PO";

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });

    expect(result.stops.map((entry) => entry.code)).toContain("route.outside-guidance");
  });

  it("keeps paired aripiprazole injections separately traceable and in separate muscles", () => {
    const encounter: InjectionEncounter = {
      ...validInjection(),
      medicationKey: "maintena",
      dose: "400 mg",
      site: "R deltoid",
      verifications: { resuspend: true },
      secondAdministrationTime: "09:18",
      initiation: {
        ...emptyInjectionInitiation(),
        protocol: "maintena-1day",
        planVerified: true,
        oralStatus: "administered",
        second: {
          dose: "400 mg",
          site: "R deltoid",
          ndc: "22222-3333-01",
          lot: "LOT-B",
          expiration: "2027-11",
          given: true,
          orderVerified: true,
        },
      },
    };

    const blocked = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });
    expect(blocked.stops.map((entry) => entry.code)).toContain(
      "initiation.second.same-muscle",
    );

    encounter.initiation!.second.site = "L deltoid";
    const separate = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });
    expect(separate.stops.map((entry) => entry.code)).not.toContain(
      "initiation.second.same-muscle",
    );
  });

  it("uses prior site context to recommend an alternate site", () => {
    const encounter = validInjection();
    encounter.reason = "scheduled";
    encounter.priorDoseDate = "2025-12-11";
    encounter.priorSite = "R deltoid";
    encounter.initiation = emptyInjectionInitiation();

    const result = InjectionEngine.evaluate(encounter, { today: "2026-01-08" });

    expect(result.output.recommendedSite).toBe("L deltoid");
  });
});

const readyUds = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "PATIENT, TEST", dob: "01/01/1990" },
  collectionDateTime: "2026-07-30T09:00",
  device: "SAFE life 14-Panel Cup",
  physicalReadingsVerified: true,
  lot: "CUP-1",
  expiration: "2027-06",
  collector: "MA",
  results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "neg"])),
});

describe("UdsEngine", () => {
  it("finalizes a verified named cup profile", () => {
    const result = UdsEngine.evaluate(readyUds(), { today: "2026-07-30" });
    expect(result.stops).toEqual([]);
    expect(result.output.testedCount).toBe(14);
    expect(result.output.activityStatus).toBe("completed");
  });

  it("keeps preliminary positives in clinician-review status without blocking completion", () => {
    const encounter = readyUds();
    encounter.results.THC = "pos";
    const result = UdsEngine.evaluate(encounter, { today: "2026-07-30" });
    expect(result.warnings.map((entry) => entry.code)).toContain(
      "results.preliminary-positive",
    );
    expect(result.output.activityStatus).toBe("needs_review");
    // A preliminary positive is a genuine finding, not something staff can
    // resolve away - it must never become a stop, or the screen could never
    // be attested and locked.
    expect(result.stops).toEqual([]);
    expect(result.readiness).toBe("review");
  });

  it("requires the omitted panel on a 13-panel cup to remain not tested", () => {
    const encounter = readyUds();
    encounter.device = "SAFE life 13-Panel Cup";
    encounter.omittedPanel = "PPX";
    const invalid = UdsEngine.evaluate(encounter, { today: "2026-07-30" });
    expect(invalid.stops.map((entry) => entry.code)).toContain(
      "device.13.omitted-result",
    );

    encounter.results.PPX = "nt";
    const valid = UdsEngine.evaluate(encounter, { today: "2026-07-30" });
    expect(valid.stops.map((entry) => entry.code)).not.toContain(
      "device.13.omitted-result",
    );
  });
});

const reviewableSample = (): SamplesEncounter => ({
  ...emptySamplesEncounter(),
  patient: { name: "PATIENT, TEST", dob: "01/01/1990" },
  prescriber: "Dr Test",
  staff: "MA",
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

describe("SamplesEngine", () => {
  it("requires an explicit current fingerprinted final review", () => {
    const draft = reviewableSample();
    const before = SamplesEngine.evaluate(draft, { today: "2026-07-30" });
    expect(before.output.reviewEligible).toBe(true);
    expect(before.stops.map((entry) => entry.code)).toContain("samples.review-today");

    const confirmed = confirmSampleReview(draft, "2026-07-30T10:00:00");
    const after = SamplesEngine.evaluate(confirmed, { today: "2026-07-30" });
    expect(after.stops).toEqual([]);
    expect(after.output.reviewCurrent).toBe(true);

    confirmed.packages[0]!.lot = "SAMPLE-B";
    const stale = SamplesEngine.evaluate(confirmed, { today: "2026-07-30" });
    expect(stale.output.reviewCurrent).toBe(false);
    expect(stale.stops.map((entry) => entry.code)).toContain("samples.review-today");
  });
});

describe("FormsEngine", () => {
  it("does not permit release-ready wording without explicit provider approval", () => {
    const encounter = {
      ...emptyFormsEncounter(),
      patient: { name: "PATIENT, TEST", dob: "01/01/1990" },
      provider: "Dr Test",
      staff: "MA",
      status: "ready" as const,
      diagnosisWording: "Provider-approved wording",
    };
    const blocked = FormsEngine.evaluate(encounter, {});
    expect(blocked.stops.map((entry) => entry.code)).toContain(
      "forms.provider-approval",
    );

    encounter.providerApprovalConfirmed = true;
    const approved = FormsEngine.evaluate(encounter, {});
    expect(approved.output.releaseAllowed).toBe(true);
  });
});
