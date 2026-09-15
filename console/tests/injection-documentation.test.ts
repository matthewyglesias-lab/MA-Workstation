import { describe, expect, it } from "vitest";
import {
  injectionAvs,
  injectionNote,
} from "../src/shared/injection-documentation.js";
import { injectionInput } from "../src/shared/injections.js";
import { createInjectionCase } from "../src/server/modules/injections.js";
import type {
  InjectionCase,
  InjectionReview,
} from "../src/shared/injections.js";
import type { Patient, Product } from "../src/shared/contracts.js";
const patient: Patient = {
  id: "11111111-1111-4111-8111-111111111111",
  tebraId: "DEMO1",
  displayName: "Synthetic Patient",
  dob: "1990-01-01",
  verifiedAt: "2026-09-15T15:00:00Z",
  verifiedBy: "demo",
};
const product: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Training injection",
  strength: "Synthetic",
  unit: "kit",
  ndc: null,
};
function fixture(): InjectionCase {
  const input = injectionInput.parse({
    patientId: patient.id,
    productId: product.id,
    tebraOrderReference: "DEMO-ORDER",
    orderingProvider: "Demo provider",
    dose: 100,
    doseUnit: "mg",
    route: "IM",
    site: "Left deltoid",
    plannedOn: "2026-09-15",
    lastAdministrationAt: null,
    timingCategory: "initiation",
    timingPlan: "Synthetic provider plan",
    nextDueOn: "2026-10-15",
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
    allergyReview: "Reviewed example",
    clinicalReview: "Reviewed example",
    preparation: "Prepared example",
    siteAssessment: "Example assessment",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Example reason",
    },
    observationPlan: "Ordered example",
    reviewedAt: "2026-09-15T16:00:00Z",
    reviewedBy: "demo",
    patientSnapshot: patient,
    productSnapshot: product,
    lotSnapshot: {
      lotNumber: "DEMOLOT",
      expiresOn: "2028-01-01",
      location: "Demo",
      ownership: "sample",
      ownerPatientId: null,
    },
    reservationMovementId: "reservation",
  };
  record.status = "administered";
  record.review = review;
  record.administration = {
    id: "demo-admin",
    administeredAt: "2026-09-15T16:10:00Z",
    administeredByName: "Demo staff",
    tolerance: "Recorded example",
    observation: "Observed example",
    delivery: "complete",
    actualDose: 100,
    issueAction: null,
    recordedAt: "2026-09-15T16:11:00Z",
    actorId: "demo",
    stockMovementId: "demo-move",
    orderSnapshot: input,
    reviewSnapshot: review,
  };
  return record;
}
describe("factual injection documentation", () => {
  it("uses frozen identity/product and preserves actual vs recorded time", () => {
    const note = injectionNote(
      fixture(),
      { ...patient, displayName: "Changed name" },
      { ...product, name: "Changed product" },
      undefined,
      "America/Los_Angeles",
    );
    expect(note).toContain("Synthetic Patient");
    expect(note).not.toContain("Changed name");
    expect(note).toContain("Training injection");
    expect(note).not.toContain("Changed product");
    expect(note).toContain("9:10 AM");
    expect(note).toContain("9:11 AM");
    expect(note).toContain("Vitals not recorded: Example reason");
  });
  it("does not turn unknown partial delivery into a completed dose or scheduled return", () => {
    const r = fixture();
    r.administration!.delivery = "partial";
    r.administration!.actualDose = null;
    r.administration!.issueAction = "Provider contacted; plan pending.";
    const note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    const avs = injectionAvs(r, patient, product, "America/Los_Angeles");
    expect(note).toContain("Actual dose: Unknown");
    expect(avs).toContain("Dose received: Unknown");
    expect(avs).not.toContain("October 15");
    expect(avs).toContain("before another dose");
  });
  it("held encounter never states administration or gives a routine return date", () => {
    const r = fixture();
    r.status = "held";
    r.administration = null;
    r.review = null;
    r.disposition = {
      status: "held",
      reason: "Awaiting provider",
      actorId: "demo",
      at: "2026-09-15T16:10:00Z",
      reviewSnapshot: null,
    };
    const note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    const avs = injectionAvs(r, patient, product, "America/Los_Angeles", "es");
    expect(note).toContain("Medication not administered.");
    expect(note).not.toContain("Actual administration / attempt:");
    expect(avs).toContain("No se administró la inyección.");
    expect(avs).not.toContain("15 de octubre");
  });
});

describe("clinical encounter detail and patient instructions", () => {
  it("keeps ordered and actual administration distinct without inventing missing legacy details", () => {
    const r = fixture();
    r.administration!.actualRoute = "SC";
    r.administration!.actualSite = "Right upper arm";
    const note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    const avs = injectionAvs(r, patient, product, "America/Los_Angeles");
    expect(note).toContain(
      "Ordered dose: 100 mg | IM | Planned site: Left deltoid",
    );
    expect(note).toContain("Actual route: SC | Actual site: Right upper arm");
    expect(avs).toContain("Subcutaneous · Right upper arm");
    expect(avs).not.toContain("Left deltoid");
    delete r.administration!.actualSite;
    delete r.administration!.actualRoute;
    const legacy = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    expect(legacy).toContain(
      "Actual route: Not separately recorded | Actual site: Not separately recorded",
    );
    expect(legacy).not.toContain("Observation disposition: Completed");
    expect(legacy).not.toContain("Education documented");
    expect(legacy).not.toContain("stable");
    expect(legacy).not.toContain("tolerated well");
  });
  it("includes entered clinical context, flagged findings, provider contact and measured facts", () => {
    const r = fixture();
    const a = r.administration!;
    a.orderSnapshot.clinicalContext = {
      phase: "restart",
      indication: "Indication documented in Tebra",
      schedule: { every: 4, unit: "weeks" },
      historySource: "Tebra MAR verified",
      priorProduct: "Prior injection",
      priorDose: "100 mg",
      linkedPlan: "Follow prescriber restart order REF-2",
    };
    a.reviewSnapshot.assessment = {
      screening: [
        {
          id: "reaction",
          label: "Prior injection reaction",
          result: "concern",
          detail: "Patient reports prolonged soreness; provider notified",
        },
        {
          id: "symptoms",
          label: "Current symptoms",
          result: "no_concern",
          detail: null,
        },
      ],
      weightKg: 76.4,
      needle: "Recorded kit needle",
      providerCommunication: {
        provider: "Test provider",
        contactedAt: "2026-09-15T16:05:00Z",
        decision: "proceed_as_ordered",
        instructions: "Proceed per order after review",
        reference: "REF-2",
      },
      education: ["Site care discussed"],
    };
    a.reviewSnapshot.guidanceVersion = "source-v1";
    a.followUp = {
      instructions: "Call the clinic to confirm the next plan",
      educationProvided: ["Return precautions reviewed"],
      observationMinutes: 12,
      observationOutcome: "declined",
      observationNote:
        "Patient declined remaining observation; provider informed",
    };
    const note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    for (const text of [
      "Treatment phase: restart",
      "Ordered interval: Every 4 weeks",
      "Tebra MAR verified",
      "Prior injection · 100 mg",
      "REF-2",
      "Prior injection reaction: CONCERN — Patient reports prolonged soreness; provider notified",
      "Test provider | Contacted Sep 15, 2026, 9:05 AM",
      "Measured weight: 76.4 kg",
      "Needle recorded at preparation: Recorded kit needle",
      "Observation disposition: Declined",
      "Observation duration recorded: 12 minutes",
      "Education documented during review: Site care discussed",
      "Education documented after encounter: Return precautions reviewed",
      "Clinical reference version at review: source-v1",
    ])
      expect(note).toContain(text);
    expect(note).not.toContain("Observation disposition: Completed");
    const avs = injectionAvs(r, patient, product, "America/Los_Angeles");
    expect(avs).toContain("Proceed per order after review");
    expect(avs).toContain("Follow prescriber restart order REF-2");
    a.delivery = "partial";
    a.issueAction = "Pause and await revised provider instructions";
    const partialAvs = injectionAvs(r, patient, product, "America/Los_Angeles");
    expect(partialAvs).toContain(
      "Pause and await revised provider instructions",
    );
    expect(partialAvs).not.toContain("Proceed per order after review");
    expect(partialAvs).not.toContain("Follow prescriber restart order REF-2");
  });
  it("uses disposition snapshots for held documentation and avoids a routine next-dose date", () => {
    const r = fixture();
    const original = r.administration!;
    r.status = "held";
    r.administration = null;
    r.review = null;
    r.dose = 999;
    r.nextDueOn = "2029-01-01";
    r.disposition = {
      status: "held",
      reason: "Await provider clarification",
      actorId: "demo",
      at: "2026-09-15T16:10:00Z",
      reviewSnapshot: original.reviewSnapshot,
      orderSnapshot: original.orderSnapshot,
    };
    const note = injectionNote(
      r,
      { ...patient, displayName: "Changed" },
      { ...product, name: "Changed" },
      undefined,
      "America/Los_Angeles",
    );
    const avs = injectionAvs(
      r,
      { ...patient, displayName: "Changed" },
      { ...product, name: "Changed" },
      "America/Los_Angeles",
      "es",
    );
    expect(note).toContain("Ordered dose: 100 mg");
    expect(note).not.toContain("Ordered dose: 999 mg");
    expect(note).toContain("PRODUCT REVIEWED / RESERVED");
    expect(note).not.toContain("Provider-confirmed next date:");
    expect(avs).toContain("Synthetic Patient");
    expect(avs).toContain("Training injection");
    expect(avs).not.toContain("Changed");
    expect(avs).not.toContain("Dosis recibida");
    expect(avs).not.toContain("Cuidados e indicaciones generales");
    expect(avs).not.toContain("octubre");
  });
  it.each(["error", "not_delivered"] as const)(
    "represents %s honestly and retains the provider's plan",
    (delivery) => {
      const r = fixture();
      r.administration!.delivery = delivery;
      r.administration!.actualDose = delivery === "not_delivered" ? 0 : null;
      r.administration!.issueAction =
        "Provider notified. Follow revised order in Tebra.";
      const note = injectionNote(
        r,
        patient,
        product,
        undefined,
        "America/Los_Angeles",
      );
      const avs = injectionAvs(
        r,
        patient,
        product,
        "America/Los_Angeles",
        "es",
      );
      expect(note).toContain(
        delivery === "error"
          ? "Outcome: Administration error"
          : "Outcome: Not delivered",
      );
      expect(note).not.toContain("Outcome: Administered");
      expect(avs).toContain(
        delivery === "error"
          ? "Error de administración"
          : "No se administró la inyección.",
      );
      expect(avs).toContain(
        "Provider notified. Follow revised order in Tebra.",
      );
      expect(avs).not.toContain("15 de octubre");
    },
  );
  it("uses a conservative elapsed-time description with time-zone-aware date-only history", () => {
    const r = fixture();
    r.administration!.orderSnapshot.lastAdministrationOn = "2026-09-01";
    let note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    expect(note).toContain("14 calendar days (prior time not recorded)");
    r.administration!.orderSnapshot.lastAdministrationAt =
      "2026-09-01T16:10:00Z";
    note = injectionNote(r, patient, product, undefined, "America/Los_Angeles");
    expect(note).toContain("14 days, 0 hours (elapsed time)");
    r.administration!.administeredAt = "2026-09-15T01:00:00Z";
    r.administration!.orderSnapshot.lastAdministrationAt = null;
    note = injectionNote(r, patient, product, undefined, "America/Los_Angeles");
    expect(note).toContain("13 calendar days (prior time not recorded)");
  });
  it("preserves authored instructions as plain text and does not claim Tebra filing", () => {
    const r = fixture();
    r.administration!.followUp = {
      instructions: "<script>unsafe markup</script> & provider text",
      educationProvided: [],
      observationMinutes: null,
      observationOutcome: null,
      observationNote: null,
    };
    r.amendments.push({
      id: "demo-amendment",
      actorId: "demo",
      createdAt: "2026-09-15T17:00:00Z",
      reason: "Clarify documentation",
      text: "Corrected fact",
    });
    const note = injectionNote(
      r,
      patient,
      product,
      undefined,
      "America/Los_Angeles",
    );
    const avs = injectionAvs(r, patient, product, "America/Los_Angeles");
    expect(note).toContain("<script>unsafe markup</script> & provider text");
    expect(note).toContain("AMENDMENT");
    expect(note).toContain("Corrected fact");
    expect(note).toContain("not a clinician signature");
    expect(note).not.toContain("Filed in Tebra");
    expect(avs).toContain("This record has an amendment");
  });
});

describe("product-specific aftercare", () => {
  it("provides bilingual aftercare only following recorded exposure, without inventing performed education", () => {
    const r = fixture();
    r.administration!.reviewSnapshot = {
      ...r.administration!.reviewSnapshot,
      productSnapshot: { ...product, name: "Vivitrol" },
    };
    const en = injectionAvs(r, patient, product, "America/Los_Angeles");
    const es = injectionAvs(r, patient, product, "America/Los_Angeles", "es");
    expect(en).toContain("GENERAL CARE & PRECAUTIONS");
    expect(en).toMatch(/naloxone/i);
    expect(es).toContain("CUIDADOS E INDICACIONES GENERALES");
    expect(es).toMatch(/naloxona/i);
    expect(es).toContain("15 sept 2026");
    expect(
      injectionNote(r, patient, product, undefined, "America/Los_Angeles"),
    ).not.toContain("Education documented");
    r.administration!.delivery = "partial";
    r.administration!.actualDose = null;
    expect(injectionAvs(r, patient, product, "America/Los_Angeles")).toContain(
      "GENERAL CARE & PRECAUTIONS",
    );
    r.administration!.delivery = "not_delivered";
    r.administration!.actualDose = 0;
    expect(
      injectionAvs(r, patient, product, "America/Los_Angeles"),
    ).not.toContain("GENERAL CARE & PRECAUTIONS");
    r.administration!.delivery = "error";
    r.administration!.actualDose = null;
    expect(
      injectionAvs(r, patient, product, "America/Los_Angeles"),
    ).not.toContain("GENERAL CARE & PRECAUTIONS");
    r.administration!.actualDose = 10;
    expect(injectionAvs(r, patient, product, "America/Los_Angeles")).toContain(
      "GENERAL CARE & PRECAUTIONS",
    );
  });
});
