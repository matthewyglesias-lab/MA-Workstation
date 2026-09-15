import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DemoRepository } from "../src/server/platform/demo-repository.js";
import { clinicDate } from "../src/server/platform/config.js";
import type { Actor, MovementInput } from "../src/shared/contracts.js";
import {
  injectionReview,
  type InjectionInput,
  type InjectionReviewInput,
  type InjectionAdministrationInput,
} from "../src/shared/injections.js";
import { getInjectionReviewChecks } from "../src/shared/injection-readiness.js";
const actor: Actor = {
  id: "injection-test-staff",
  roles: ["Console.Operator", "Inventory.Manager"],
};
const c = () => ({ key: randomUUID(), actor });
async function fixture(quantity = 4) {
  const repo = new DemoRepository("UTC");
  const patient = await repo.createPatient(
    {
      tebraId: "INJ-TEST",
      displayName: "Synthetic injection patient",
      dob: "1990-01-01",
      verifiedInTebra: true,
    },
    c(),
  );
  const product = await repo.createProduct(
    { name: "Training kit", strength: "100 mg", unit: "kit", ndc: null },
    c(),
  );
  const lot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "TEST-LOT",
      expiresOn: "2035-01-01",
      location: "Test cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    c(),
  );
  const move = (change: Partial<MovementInput>): MovementInput => ({
    lotId: lot.id,
    kind: "receive",
    quantity,
    patientId: null,
    reason: "Synthetic test",
    reversesId: null,
    ...change,
  });
  await repo.postMovement(move({}), c());
  const input: InjectionInput = {
    patientId: patient.id,
    productId: product.id,
    doseSequence: 1,
    tebraOrderReference: "TEST-ORDER",
    orderingProvider: "Synthetic provider",
    dose: 100,
    doseUnit: "mg",
    route: "IM",
    site: "Left deltoid",
    plannedOn: clinicDate("UTC"),
    lastAdministrationAt: null,
    timingCategory: "initiation",
    timingPlan: "Provider-confirmed test initiation plan",
    nextDueOn: null,
  };
  const review: InjectionReviewInput = {
    expectedVersion: 1,
    lotId: lot.id,
    stockUnits: 1,
    checks: {
      identity: true,
      order: true,
      allergy: true,
      medication: true,
      timing: true,
      consent: true,
    },
    allergyReview: "Synthetic allergy review",
    clinicalReview: "Synthetic screening per order",
    preparation: "Prepared per product instructions",
    siteAssessment: "Site reviewed",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Training only",
    },
    observationPlan: "Per test order",
    assessment: {
      screening: getInjectionReviewChecks(product.name).map(
        ({ id, label }) => ({ id, label, result: "no_concern", detail: null }),
      ),
      weightKg: null,
      needle: null,
      providerCommunication: {
        provider: "Synthetic provider",
        contactedAt: new Date(Date.now() - 60000).toISOString(),
        decision: "proceed_as_ordered",
        instructions: "Proceed with the verified synthetic initiation order.",
        reference: "TEST-ORDER",
      },
      education: [],
    },
  };
  const administration = (
    expectedVersion = 2,
  ): InjectionAdministrationInput => ({
    expectedVersion,
    administeredAt: new Date().toISOString(),
    administeredByName: "Test staff",
    tolerance: "Training only",
    observation: "Training only",
    delivery: "complete",
    actualDose: null,
    issueAction: null,
  });
  return { repo, patient, product, lot, move, input, review, administration };
}
describe("injection workflow", () => {
  it("requires all review checks and explicit measured or missing vitals", async () => {
    const { review } = await fixture();
    expect(
      injectionReview.safeParse({
        ...review,
        checks: { ...review.checks, order: false },
      }).success,
    ).toBe(false);
    expect(
      injectionReview.safeParse({
        ...review,
        vitals: { ...review.vitals, reason: null },
      }).success,
    ).toBe(false);
    expect(
      injectionReview.safeParse({
        ...review,
        vitals: { ...review.vitals, status: "recorded" },
      }).success,
    ).toBe(false);
    expect(
      injectionReview.safeParse({
        ...review,
        vitals: { ...review.vitals, status: "recorded", bpSystolic: 120 },
      }).success,
    ).toBe(false);
  });
  it("reserves and consumes once, freezes source snapshots, and preserves amendments/filings", async () => {
    const f = await fixture();
    const planned = await f.repo.createInjection(f.input, c());
    const reviewed = await f.repo.reviewInjection(planned.id, f.review, c());
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(1);
    expect(reviewed.review?.productSnapshot.name).toBe(f.product.name);
    const command = c(),
      administration = f.administration();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        f.repo.administerInjection(planned.id, administration, command),
      ),
    );
    expect(new Set(responses.map((r) => r.administration!.id)).size).toBe(1);
    const administered = responses[0]!;
    expect(JSON.parse(JSON.stringify(administered))).toStrictEqual(
      administered,
    );
    expect(administered.administration!.actualDose).toBe(100);
    const stock = (await f.repo.overview(actor)).lots[0]!;
    expect([stock.onHand, stock.reserved]).toEqual([3, 0]);
    await expect(
      f.repo.administerInjection(planned.id, f.administration(3), c()),
    ).rejects.toThrow("review");
    await expect(
      f.repo.updateInjection(
        planned.id,
        { ...f.input, expectedVersion: 3 },
        c(),
      ),
    ).rejects.toThrow("cannot be edited");
    await expect(
      f.repo.postMovement(
        f.move({
          kind: "reverse",
          quantity: 0,
          patientId: f.patient.id,
          reversesId: administered.administration!.stockMovementId,
        }),
        c(),
      ),
    ).rejects.toThrow("cannot be reversed");
    const filed = await f.repo.fileInjection(
      planned.id,
      { expectedVersion: 3, tebraReference: "Tebra test note" },
      c(),
    );
    const amended = await f.repo.amendInjection(
      planned.id,
      {
        expectedVersion: 4,
        reason: "Correction",
        text: "Additional test observation",
      },
      c(),
    );
    expect(amended.administration).toEqual(administered.administration);
    expect(amended.filings).toEqual(filed.filings);
    expect(amended.handoff).toBe("pending");
    expect(amended.amendments).toHaveLength(1);
  });
  it("protects injection reservations from generic inventory use, release, and reversal", async () => {
    const f = await fixture();
    const planned = await f.repo.createInjection(f.input, c());
    const reviewed = await f.repo.reviewInjection(planned.id, f.review, c());
    for (const kind of ["use", "release"] as const)
      await expect(
        f.repo.postMovement(
          f.move({ kind, quantity: 1, patientId: f.patient.id }),
          c(),
        ),
      ).rejects.toThrow("reserved for a reviewed injection");
    await expect(
      f.repo.postMovement(
        f.move({
          kind: "reverse",
          quantity: 0,
          patientId: f.patient.id,
          reversesId: reviewed.review!.reservationMovementId,
        }),
        c(),
      ),
    ).rejects.toThrow("cannot be reversed");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(1);
  });
  it("releases reservations on hold or revision and retains prior filing history", async () => {
    const f = await fixture();
    const planned = await f.repo.createInjection(f.input, c());
    await f.repo.reviewInjection(planned.id, f.review, c());
    await f.repo.dispositionInjection(
      planned.id,
      { expectedVersion: 2, status: "held", reason: "Provider review" },
      c(),
    );
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    await f.repo.fileInjection(
      planned.id,
      { expectedVersion: 3, tebraReference: "Tebra hold note" },
      c(),
    );
    const revised = await f.repo.updateInjection(
      planned.id,
      { ...f.input, expectedVersion: 4 },
      c(),
    );
    expect(revised.handoff).toBe("pending");
    expect(revised.filings).toHaveLength(1);
    await f.repo.reviewInjection(
      planned.id,
      { ...f.review, expectedVersion: 5 },
      c(),
    );
    await f.repo.updateInjection(
      planned.id,
      { ...f.input, site: "Right deltoid", expectedVersion: 6 },
      c(),
    );
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
  });
  it("rejects unresolved timing, stale edits, wrong products, and insufficient stock without partial changes", async () => {
    const f = await fixture(1);
    const planned = await f.repo.createInjection(
      { ...f.input, timingCategory: "unknown" },
      c(),
    );
    await expect(
      f.repo.reviewInjection(planned.id, f.review, c()),
    ).rejects.toThrow("Resolve timing");
    await f.repo.updateInjection(
      planned.id,
      { ...f.input, expectedVersion: 1 },
      c(),
    );
    await expect(
      f.repo.reviewInjection(planned.id, f.review, c()),
    ).rejects.toThrow("changed");
    await expect(
      f.repo.reviewInjection(
        planned.id,
        { ...f.review, expectedVersion: 2, stockUnits: 2 },
        c(),
      ),
    ).rejects.toThrow("stock");
    expect((await f.repo.listInjections(actor))[0]!.status).toBe("draft");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    const wrong = await f.repo.createProduct(
      { name: "Another product", strength: "50 mg", unit: "kit", ndc: null },
      c(),
    );
    await f.repo.updateInjection(
      planned.id,
      { ...f.input, productId: wrong.id, expectedVersion: 2 },
      c(),
    );
    await expect(
      f.repo.reviewInjection(
        planned.id,
        { ...f.review, expectedVersion: 3 },
        c(),
      ),
    ).rejects.toThrow("must match");
  });
  it("blocks duplicate occurrences while allowing explicit paired dose sequences", async () => {
    const f = await fixture();
    await f.repo.createInjection(f.input, c());
    await expect(f.repo.createInjection(f.input, c())).rejects.toThrow(
      "already scheduled",
    );
    await f.repo.createInjection(
      { ...f.input, doseSequence: 2, site: "Right deltoid" },
      c(),
    );
    expect(await f.repo.listInjections(actor)).toHaveLength(2);
  });
  it("blocks future and pre-review administration timestamps", async () => {
    const f = await fixture();
    const planned = await f.repo.createInjection(f.input, c());
    const reviewed = await f.repo.reviewInjection(planned.id, f.review, c());
    await expect(
      f.repo.administerInjection(
        planned.id,
        {
          ...f.administration(),
          administeredAt: new Date(Date.now() + 60000).toISOString(),
        },
        c(),
      ),
    ).rejects.toThrow("future");
    await expect(
      f.repo.administerInjection(
        planned.id,
        {
          ...f.administration(),
          administeredAt: new Date(
            Date.parse(reviewed.review!.reviewedAt) - 1,
          ).toISOString(),
        },
        c(),
      ),
    ).rejects.toThrow("follow");
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(4);
  });
  it("records unknown partial delivery with a provider plan while consuming the opened package once", async () => {
    const f = await fixture();
    const planned = await f.repo.createInjection(f.input, c());
    await f.repo.reviewInjection(planned.id, f.review, c());
    await expect(
      f.repo.administerInjection(
        planned.id,
        { ...f.administration(), delivery: "partial", issueAction: null },
        c(),
      ),
    ).rejects.toThrow("provider");
    const completed = await f.repo.administerInjection(
      planned.id,
      {
        ...f.administration(),
        delivery: "partial",
        actualDose: null,
        issueAction:
          "Device issue; provider contacted; follow confirmed plan in Tebra",
      },
      c(),
    );
    expect(completed.administration!.actualDose).toBeNull();
    expect(completed.administration!.delivery).toBe("partial");
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(3);
  });
});
