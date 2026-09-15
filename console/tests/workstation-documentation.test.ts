import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient, Product } from "../src/shared/contracts.js";
import type {
  InjectionCase,
  InjectionReview,
} from "../src/shared/injections.js";
import { injectionInput } from "../src/shared/injections.js";
import { createInjectionCase } from "../src/server/modules/injections.js";
import { emptyWorkstationState } from "../src/shared/workstation-contracts.js";
import {
  getWorkstationAvsModel,
  getWorkstationNote,
} from "../src/shared/workstation-documentation.js";
import { lightfullyAvsText } from "../src/web/LightfullyInjectionAvs.js";
const timezone = "America/Los_Angeles";
beforeEach(() =>
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-16T18:00:00Z")),
);
afterEach(() => vi.restoreAllMocks());
const patient: Patient = {
  id: "11111111-1111-4111-8111-111111111111",
  tebraId: "TEST-1",
  displayName: "TEST, WORKSTATION",
  dob: "1990-01-01",
  verifiedAt: "2026-09-15T15:00:00Z",
  verifiedBy: "test",
};
const product: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Invega Sustenna",
  strength: "156 mg",
  unit: "kit",
  ndc: "50458-564-01",
};
function fixture(): InjectionCase {
  const workstation = emptyWorkstationState();
  workstation.intervalKey = "q4wk";
  workstation.reason = "scheduled";
  workstation.attestations = {
    id2: true,
    rights: true,
    allergy: true,
    consent: true,
    screen: true,
    hygiene: true,
    prior: true,
  };
  workstation.verifications = { resuspend: true };
  workstation.acuteSafetyScreenConfirmed = true;
  workstation.response = { kind: "well" };
  const input = injectionInput.parse({
    patientId: patient.id,
    productId: product.id,
    tebraOrderReference: "TEST-ORDER",
    orderingProvider: "Test Provider, MD",
    dose: 156,
    doseUnit: "mg",
    route: "IM",
    site: "Left deltoid",
    plannedOn: "2026-09-15",
    lastAdministrationAt: null,
    lastAdministrationOn: "2026-08-18",
    timingCategory: "scheduled",
    timingPlan: "Continue active order.",
    nextDueOn: "2026-10-13",
    clinicalContext: {
      phase: "maintenance",
      indication: "Schizophrenia",
      schedule: { every: 4, unit: "weeks" },
      historySource: null,
      priorProduct: null,
      priorDose: null,
      linkedPlan: null,
    },
    workstation,
  });
  const record = createInjectionCase(input);
  const review: InjectionReview = {
    lotId: "33333333-3333-4333-8333-333333333333",
    stockUnits: 1,
    checks: {
      identity: true,
      order: true,
      allergy: true,
      medication: true,
      timing: true,
      consent: true,
    },
    allergyReview: "NKDA",
    clinicalReview: "Prior response reviewed.",
    preparation: "Prepared per verified product instructions.",
    siteAssessment: "Skin examined.",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Patient declined measurements.",
    },
    observationPlan: "Per active order.",
    assessment: {
      screening: [
        {
          id: "current_symptoms",
          label: "Current symptoms",
          result: "no_concern",
          detail: null,
        },
      ],
      weightKg: null,
      needle: null,
      providerCommunication: null,
      education: [],
    },
    workstation,
    reviewedAt: "2026-09-15T16:00:00Z",
    reviewedBy: "test",
    patientSnapshot: patient,
    productSnapshot: product,
    lotSnapshot: {
      lotNumber: "TEST-LOT",
      expiresOn: "2028-01-01",
      location: "Test shelf",
      ownership: "sample",
      ownerPatientId: null,
    },
    reservationMovementId: "reservation",
  };
  record.status = "administered";
  record.review = review;
  record.administration = {
    id: "test-administration",
    administeredAt: "2026-09-15T16:10:00Z",
    administeredByName: "Test MA",
    tolerance:
      "Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.",
    observation: "Patient remained seated after injection.",
    delivery: "complete",
    actualDose: 156,
    actualRoute: "IM",
    actualSite: "Left deltoid",
    issueAction: null,
    recordedAt: "2026-09-15T16:11:00Z",
    actorId: "test",
    stockMovementId: "test-move",
    orderSnapshot: input,
    reviewSnapshot: review,
    workstation: structuredClone(workstation),
  };
  return record;
}
const note = (record: InjectionCase) =>
  getWorkstationNote(record, patient, product, timezone);
const avs = (record: InjectionCase) =>
  getWorkstationAvsModel(record, patient, product, timezone);
const copy = (record: InjectionCase) => lightfullyAvsText(avs(record));
function medication(record: InjectionCase, name: string, dose: number) {
  record.administration!.reviewSnapshot.productSnapshot = {
    ...product,
    name,
    strength: `${dose} mg`,
  };
  record.administration!.actualDose = dose;
  record.administration!.orderSnapshot.dose = dose;
}
function initiation(
  record: InjectionCase,
  protocol:
    | "sustenna-day1"
    | "maintena-1day"
    | "maintena-14day"
    | "aristada-initio-sameday",
) {
  record.administration!.orderSnapshot.clinicalContext!.phase = "initiation";
  record.administration!.workstation!.initiation.protocol = protocol;
  record.administration!.workstation!.initiation.planVerified = true;
  record.administration!.workstation!.reason = "initiation";
  record.administration!.orderSnapshot.lastAdministrationOn = null;
}

describe("workstation Tebra note integration", () => {
  it("keeps the original compact note while preserving additional recorded review facts", () => {
    const result = note(fixture());
    expect(result.cc).toBe(
      "Scheduled LAI — Invega Sustenna 156 mg IM, L deltoid; tolerated well; next due 10/13/26.\nPt presents today for scheduled LAI administration.",
    );
    expect(result.plan).toContain(
      "Administration: Invega Sustenna 156 mg IM administered to L deltoid using aseptic technique.",
    );
    expect(result.plan).toContain("Date/time: 9/15/26 0910.");
    expect(result.assessment).toContain("Prior response reviewed.");
    expect(result.assessment).toContain("Patient declined measurements.");
    expect(result.sections.map((s) => s.destination)).toEqual([
      "CC",
      "Assessment",
      "Plan",
    ]);
    expect(result.text).toBe(result.all);
  });
  it("uses frozen identity/product/order and never current mutable labels", () => {
    const record = fixture();
    record.dose = 999;
    const result = getWorkstationNote(
      record,
      { ...patient, displayName: "Changed patient" },
      { ...product, name: "Changed product" },
      timezone,
    );
    expect(result.text).toContain("156 mg");
    expect(result.text).not.toContain("999");
    expect(result.text).not.toContain("Changed product");
    expect(avs(record).identity.find((r) => r.label === "PATIENT")?.value).toBe(
      patient.displayName,
    );
  });
  it("does not manufacture normal or performed-care facts from an empty state", () => {
    const record = fixture();
    record.administration!.workstation = emptyWorkstationState();
    record.administration!.tolerance =
      "Nausea reported; provider evaluated patient.";
    const result = note(record).text;
    expect(result).not.toContain("Hand hygiene performed");
    expect(result).not.toContain("no acute s/e or contraindications");
    expect(result).not.toContain("Post-inj education provided");
    expect(result).not.toContain("tolerated well");
    expect(result).toContain("Nausea reported");
    expect(result).toContain("Administration:");
  });
  it("keeps persisted actual events chartable with concerns and unresolved review findings", () => {
    const record = fixture();
    record.administration!.reviewSnapshot.assessment!.screening = [
      {
        id: "current_symptoms",
        label: "Current symptoms",
        result: "concern",
        detail: "Dizziness reported before the visit.",
      },
    ];
    record.administration!.reviewSnapshot.assessment!.providerCommunication = {
      provider: "Test Provider",
      contactedAt: "2026-09-15T16:01:00Z",
      decision: "hold",
      instructions: "Return for provider assessment.",
      reference: "Tebra plan 15",
    };
    record.administration!.engineFindings = [
      {
        code: "example",
        message: "Recorded order/site mismatch requires review.",
      },
    ];
    const result = note(record).text;
    expect(result).toContain("Dizziness reported before the visit.");
    expect(result).toContain("Hold. Return for provider assessment.");
    expect(result).toContain("Recorded order/site mismatch requires review.");
    expect(result).toContain("Administration:");
  });
  it("documents unknown partial delivery without substituting the ordered dose or a routine due date", () => {
    const record = fixture();
    record.administration!.delivery = "partial";
    record.administration!.actualDose = null;
    record.administration!.issueAction =
      "Provider contacted; next plan pending.";
    const result = note(record).text;
    expect(result).toContain("Partial injection");
    expect(result).toContain("actual dose unknown");
    expect(result).toContain("Ordered dose / route / site: 156 mg");
    expect(result).not.toContain("156 mg IM administered");
    expect(result).not.toContain("Next dose due 10/13/26");
    const patientCopy = copy(record);
    expect(patientCopy).toContain("Actual amount received: unknown.");
    expect(patientCopy).not.toContain("October 13");
    expect(patientCopy).toContain("before another injection");
  });
  it("records route/site errors and historical unknown actual sites truthfully", () => {
    const record = fixture();
    record.administration!.delivery = "error";
    record.administration!.actualRoute = "SC";
    record.administration!.actualSite = "Right upper arm";
    record.administration!.issueAction =
      "Provider assessed actual route and site.";
    expect(note(record).text).toContain(
      "actual route SC; actual site Right upper arm",
    );
    delete record.administration!.actualRoute;
    delete record.administration!.actualSite;
    expect(note(record).text).toContain(
      "actual route not separately recorded; actual site not separately recorded",
    );
    expect(note(record).text).not.toContain("administered to L deltoid");
  });
  it("preserves observation details, education, follow-up and appended amendments", () => {
    const record = fixture();
    record.administration!.followUp = {
      instructions: "Call tomorrow for the provider plan.",
      educationProvided: ["Reviewed signs requiring urgent attention."],
      observationMinutes: 12,
      observationOutcome: "transferred",
      observationNote: "Transferred to provider for additional assessment.",
    };
    record.amendments = [
      {
        id: "a1",
        actorId: "staff2",
        createdAt: "2026-09-15T17:00:00Z",
        reason: "Additional observed fact",
        text: "Patient left with family after assessment.",
      },
    ];
    const result = note(record).text;
    expect(result).toContain("12 minutes");
    expect(result).toContain("Transferred to provider");
    expect(result).toContain("Reviewed signs requiring urgent attention.");
    expect(result).toContain("Additional observed fact");
    expect(result).toContain("Patient left with family");
  });
  it("labels retrospective charting with event time, recording time and later review", () => {
    const record = fixture();
    record.administration!.workstation!.recordingMode = "retrospective";
    record.administration!.workstation!.retrospectiveReason =
      "Downtime paper record reconciled.";
    record.administration!.recordedAt = "2026-09-16T16:11:00Z";
    record.administration!.reviewSnapshot.reviewedAt = "2026-09-16T16:00:00Z";
    const result = note(record).text;
    expect(result).toContain("Retrospective documentation");
    expect(result).toContain("Downtime paper record reconciled.");
    expect(result).toContain("does not establish pre-dose clearance");
    expect(result).toContain("Sep 16, 2026");
  });
});

describe("original AVS integration and narrowly audited corrections", () => {
  it("never claims administration in a draft, held, or zero-delivery handout", () => {
    const record = fixture();
    record.administration!.delivery = "not_delivered";
    record.administration!.actualDose = 0;
    record.administration!.issueAction = "Replacement plan pending.";
    expect(avs(record).administration).toEqual([]);
    expect(avs(record).timeline.some((s) => s.state === "given")).toBe(false);
    expect(copy(record)).not.toContain("Caring for your injection site");
    expect(note(record).text).toContain("Medication not delivered");
    record.administration = null;
    record.status = "draft";
    expect(avs(record).documentStatus).toBe("STAFF PREVIEW - NOT FINAL");
    expect(copy(record)).toContain("Administration has not been recorded");
    expect(avs(record).timeline.some((s) => s.state === "given")).toBe(false);
    record.status = "held";
    record.disposition = {
      status: "held",
      reason: "Provider review needed.",
      at: "2026-09-15T16:00:00Z",
      actorId: "test",
      reviewSnapshot: record.review,
      orderSnapshot: { ...record },
    };
    expect(avs(record).documentStatus).toBe("CARE HANDOFF");
    expect(copy(record)).toContain("Provider review needed.");
    expect(copy(record)).not.toContain("October 13");
  });
  it("does not label a 234 mg Sustenna maintenance dose as starting-only", () => {
    const record = fixture();
    medication(record, "Invega Sustenna", 234);
    expect(copy(record)).not.toContain("234 mg strength is a starting dose");
    expect(copy(record)).not.toContain("regular monthly dose will be");
  });
  it("corrects Day 1 maintenance timing and preserves an explicit provider return date", () => {
    const record = fixture();
    medication(record, "Invega Sustenna", 234);
    initiation(record, "sustenna-day1");
    record.administration!.orderSnapshot.nextDueOn = "2026-09-24";
    const model = avs(record);
    const patientCopy = lightfullyAvsText(model);
    expect(patientCopy).toContain(
      "five weeks after the first starting injection",
    );
    expect(patientCopy).not.toContain("would not count");
    expect(patientCopy).not.toContain(
      "set from the day you come in for dose 2",
    );
    expect(model.nextDose.dateLong).toContain("September 24");
    expect(model.timeline.find((s) => s.state === "due")?.when).toBe("Sep 24");
    record.administration!.orderSnapshot.nextDueOn = null;
    expect(avs(record).nextDose.dateLong).toBe("");
  });
  it("does not assert a paired or oral dose solely from selected initiation controls", () => {
    const record = fixture();
    medication(record, "Abilify Maintena", 400);
    initiation(record, "maintena-1day");
    record.administration!.workstation!.initiation.oralStatus = "verified";
    record.administration!.workstation!.oral = {
      product: "Aripiprazole",
      dose: "20 mg",
      status: "verified",
      source: "Active medication list",
    };
    const patientCopy = copy(record);
    expect(patientCopy).not.toContain("Today you received two injections");
    expect(patientCopy).not.toContain("An oral dose was also given today");
    expect(patientCopy).toContain("an oral dose is not recorded as given here");
  });
  it("does not invent oral overlap dates from injection time", () => {
    const record = fixture();
    medication(record, "Abilify Maintena", 400);
    initiation(record, "maintena-14day");
    record.administration!.workstation!.oral = {
      product: "Aripiprazole",
      dose: "10 mg daily",
      status: "verified",
      source: "Provider's oral plan",
    };
    const patientCopy = copy(record);
    expect(patientCopy).not.toContain("every day through");
    expect(patientCopy).not.toContain("14 days in a row");
    expect(patientCopy).toContain("does not confirm doses taken on other days");
  });
  it("freezes a proven paired dose and displays the second medication correctly", () => {
    const record = fixture();
    medication(record, "Aristada", 882);
    initiation(record, "aristada-initio-sameday");
    const pair = fixture();
    pair.id = "44444444-4444-4444-8444-444444444444";
    medication(pair, "Aristada Initio", 675);
    pair.administration!.actualSite = "Right deltoid";
    pair.administration!.reviewSnapshot.lotSnapshot = {
      ...pair.administration!.reviewSnapshot.lotSnapshot,
      lotNumber: "FROZEN-SECOND",
    };
    record.administration!.workstation!.pairedCaseId = pair.id;
    record.administration!.pairedCaseSnapshot = structuredClone(pair);
    record.administration!.workstation!.oral = {
      product: "Aripiprazole",
      dose: "30 mg",
      status: "administered",
      administeredAt: "2026-09-15T16:00:00Z",
      source: "Oral dose administration record",
    };
    const before = getWorkstationNote(
      record,
      patient,
      product,
      timezone,
      pair,
    ).text;
    const beforeAvs = getWorkstationAvsModel(
      record,
      patient,
      product,
      timezone,
      pair,
    );
    pair.administration!.actualDose = 999;
    pair.administration!.reviewSnapshot.lotSnapshot.lotNumber = "CHANGED";
    expect(
      getWorkstationNote(record, patient, product, timezone, pair).text,
    ).toBe(before);
    expect(
      getWorkstationAvsModel(record, patient, product, timezone, pair),
    ).toEqual(beforeAvs);
    expect(before).toContain("FROZEN-SECOND");
    expect(lightfullyAvsText(beforeAvs)).toContain(
      "Second injection: Aristada Initio, 675 mg",
    );
    expect(lightfullyAvsText(beforeAvs)).toContain(
      "An oral dose was also given today.",
    );
  });
  it.each([
    ["Benztropine", "1 mg"],
    ["Aripiprazole", "20 mg"],
  ])(
    "preserves historical oral %s %s without standard Aristada initiation or stop-overlap claims",
    (oralProduct, oralDose) => {
      const record = fixture();
      medication(record, "Aristada", 882);
      initiation(record, "aristada-initio-sameday");
      const pair = fixture();
      pair.id = "44444444-4444-4444-8444-444444444444";
      medication(pair, "Aristada Initio", 675);
      pair.administration!.actualSite = "Right deltoid";
      record.administration!.workstation!.pairedCaseId = pair.id;
      record.administration!.pairedCaseSnapshot = structuredClone(pair);
      record.administration!.workstation!.initiation.oralStatus =
        "administered";
      record.administration!.workstation!.oral = {
        product: oralProduct,
        dose: oralDose,
        status: "administered",
        administeredAt: "2026-09-15T16:00:00Z",
        source: "Historical oral dose record",
      };
      const patientCopy = copy(record);
      expect(patientCopy).toContain(`${oralProduct} ${oralDose}`);
      expect(patientCopy).not.toContain(
        "plus a single dose of oral aripiprazole by mouth",
      );
      expect(patientCopy).not.toContain("You do not need to keep taking oral");
      expect(patientCopy).toContain(
        "Follow the starting plan confirmed by your provider",
      );
      expect(note(record).text).toContain(`${oralProduct} ${oralDose}`);
    },
  );
  it("shows the actual oral product and dose even when all standard protocol facts are compatible", () => {
    const record = fixture();
    medication(record, "Abilify Maintena", 400);
    initiation(record, "maintena-1day");
    const pair = fixture();
    pair.id = "44444444-4444-4444-8444-444444444444";
    medication(pair, "Abilify Maintena", 400);
    pair.administration!.actualSite = "Right deltoid";
    record.administration!.workstation!.pairedCaseId = pair.id;
    record.administration!.pairedCaseSnapshot = structuredClone(pair);
    record.administration!.workstation!.initiation.oralStatus = "administered";
    record.administration!.workstation!.oral = {
      product: "Aripiprazole",
      dose: "20 mg",
      status: "administered",
      administeredAt: "2026-09-15T16:00:00Z",
      source: "Oral administration record",
    };
    const patientCopy = copy(record);
    expect(patientCopy).toContain(
      "Today you received two injections in different muscles",
    );
    expect(patientCopy).toContain("Aripiprazole 20 mg");
  });
  it("does not carry deferred pre-administration empty-field findings into a completed note", () => {
    const record = fixture();
    record.administration!.reviewSnapshot.engineFindings = [
      { code: "disposition.required", message: "DEFERRED select disposition" },
      {
        code: "administration.staff",
        message: "DEFERRED administration staff",
      },
      { code: "administration.time", message: "DEFERRED actual time" },
      { code: "response.required", message: "DEFERRED response" },
      { code: "site.route-mismatch", message: "CLINICAL discrepancy retained" },
    ];
    const result = note(record).text;
    expect(result).not.toContain("DEFERRED");
    expect(result).toContain("CLINICAL discrepancy retained");
    record.administration!.administeredByName = "";
    expect(note(record).text).toContain("DEFERRED administration staff");
  });
  it("keeps every generated instruction available to Lightfully copy and print content", () => {
    const record = fixture();
    medication(record, "Vivitrol", 380);
    record.administration!.actualSite = "Right ventrogluteal";
    const model = avs(record);
    const patientCopy = lightfullyAvsText(model);
    for (const block of [
      ...model.leadAlerts,
      ...model.blocks,
      model.emergency,
    ]) {
      expect(patientCopy).toContain(block.heading);
      for (const line of [...(block.paragraphs ?? []), ...(block.items ?? [])])
        expect(patientCopy).toContain(line);
      for (const row of block.rows ?? []) {
        expect(patientCopy).toContain(row.label);
        expect(patientCopy).toContain(row.value);
      }
    }
    for (const step of model.timeline)
      for (const line of step.detail) expect(patientCopy).toContain(line);
  });
});
