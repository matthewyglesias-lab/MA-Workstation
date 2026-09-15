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
