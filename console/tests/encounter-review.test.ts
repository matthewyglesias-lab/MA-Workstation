import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { administerInjectionCase } from "../src/server/modules/injections.js";
import { clinicDate, readConfig } from "../src/server/platform/config.js";
import { DemoRepository } from "../src/server/platform/demo-repository.js";
import type { Actor } from "../src/shared/contracts.js";
import { getInjectionGuidance } from "../src/shared/injection-guidance.js";
import { injectionNote } from "../src/shared/injection-documentation.js";
import { getInjectionReviewChecks } from "../src/shared/injection-readiness.js";
import type {
  InjectionAssessment,
  InjectionCase,
  InjectionClinicalContext,
  InjectionReviewInput,
} from "../src/shared/injections.js";

const actor: Actor = {
  id: "synthetic-reviewer",
  roles: ["Console.Operator", "Inventory.Manager"],
};
const command = () => ({ actor, key: randomUUID() });
const context = (
  phase: InjectionClinicalContext["phase"] = "maintenance",
): InjectionClinicalContext => ({
  phase,
  indication: null,
  schedule: { every: 1, unit: "months" },
  historySource: null,
  priorProduct: null,
  priorDose: null,
  linkedPlan: null,
});
const communication = (): NonNullable<
  InjectionAssessment["providerCommunication"]
> => ({
  provider: "Synthetic ordering provider",
  contactedAt: new Date(Date.now() - 60000).toISOString(),
  decision: "proceed_as_ordered",
  instructions:
    "Proceed with the verified synthetic order after reviewing the documented finding.",
  reference: "SYNTHETIC-ORDER",
});
async function fixture(productName = "Synthetic injection kit") {
  const repo = new DemoRepository("UTC");
  const patient = await repo.createPatient(
    {
      tebraId: `TEST-${randomUUID()}`,
      displayName: "Synthetic review patient",
      dob: "1990-01-01",
      verifiedInTebra: true,
    },
    command(),
  );
  const product = await repo.createProduct(
    { name: productName, strength: "100 mg", unit: "kit", ndc: null },
    command(),
  );
  const lot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "SYNTHETIC-LOT",
      expiresOn: "2035-01-01",
      location: "Synthetic cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    command(),
  );
  await repo.postMovement(
    {
      lotId: lot.id,
      kind: "receive",
      quantity: 2,
      patientId: null,
      reason: "Synthetic stock",
      reversesId: null,
    },
    command(),
  );
  const order = {
    patientId: patient.id,
    productId: product.id,
    doseSequence: 1,
    tebraOrderReference: "SYNTHETIC-ORDER",
    orderingProvider: "Synthetic provider",
    dose: 100,
    doseUnit: "mg" as const,
    route: "IM" as const,
    site: "Left deltoid",
    plannedOn: clinicDate("UTC"),
    lastAdministrationAt: null,
    timingCategory: "scheduled" as const,
    timingPlan: "Verified ordered maintenance schedule",
    nextDueOn: null,
    clinicalContext: context(),
  };
  const current = await repo.createInjection(order, command());
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
    clinicalReview: "Synthetic review narrative",
    preparation: "Synthetic preparation verification",
    siteAssessment: "Synthetic site assessment",
    observationPlan: "Per synthetic order",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Synthetic exercise",
    },
    assessment: {
      screening: getInjectionReviewChecks(product.name).map(
        ({ id, label }) => ({ id, label, result: "no_concern", detail: null }),
      ),
      weightKg: null,
      needle: null,
      providerCommunication: null,
      education: [],
    },
  };
  const app = await buildApp(
    readConfig({
      CONSOLE_MODE: "demo",
      AUTH_MODE: "demo",
      CLINIC_ID: randomUUID(),
      CLINIC_TIMEZONE: "UTC",
    }),
    repo,
    async () => actor,
  );
  // Explicit content type is needed when testing malformed request payloads as JSON.
  const reviewRequest = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/v1/injections/${current.id}/review`,
      headers: {
        "idempotency-key": randomUUID(),
        "content-type": "application/json",
      },
      payload: JSON.stringify(payload),
    });
  return {
    repo,
    app,
    current,
    order,
    review,
    patient,
    product,
    lot,
    postReview: reviewRequest,
  };
}

describe("structured injection review at the API boundary", () => {
  it("requires new assessments and every exact current screening id without reserving stock on failure", async () => {
    const f = await fixture();
    try {
      const { assessment: _, ...legacyRequest } = f.review;
      expect((await f.postReview(legacyRequest)).statusCode).toBe(400);
      for (const screening of [
        f.review.assessment.screening.slice(1),
        [...f.review.assessment.screening, f.review.assessment.screening[0]],
        f.review.assessment.screening.map((check, index) =>
          index === 0 ? { ...check, id: "unrecognized_item" } : check,
        ),
      ]) {
        expect(
          (
            await f.postReview({
              ...f.review,
              assessment: { ...f.review.assessment, screening },
            })
          ).statusCode,
        ).toBe(400);
      }
      expect((await f.repo.listInjections(actor))[0]!.status).toBe("draft");
      expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    } finally {
      await f.app.close();
    }
  });

  it("stamps authoritative labels and guidance version while preserving only entered facts", async () => {
    const f = await fixture();
    try {
      const result = await f.postReview({
        ...f.review,
        assessment: {
          ...f.review.assessment,
          screening: f.review.assessment.screening.map((check) => ({
            ...check,
            label: "Client-supplied misleading label",
          })),
        },
      });
      expect(result.statusCode).toBe(200);
      const reviewed = result.json<InjectionCase>().review!;
      expect(reviewed.guidanceVersion).toMatch(/:general$/);
      expect(
        reviewed.assessment!.screening.map((check) => check.label),
      ).toEqual(
        getInjectionReviewChecks(f.product.name).map((check) => check.label),
      );
      expect(reviewed.assessment!.providerCommunication).toBeNull();
      expect(reviewed.assessment!.weightKg).toBeNull();
      expect(reviewed.assessment!.needle).toBeNull();
      expect(reviewed.assessment!.education).toEqual([]);
    } finally {
      await f.app.close();
    }
  });

  it("requires explanations for concerns and not-applicable responses and a resolved provider instruction for concerns", async () => {
    const f = await fixture();
    try {
      const assessment = structuredClone(f.review.assessment);
      assessment.screening[0]!.result = "concern";
      expect((await f.postReview({ ...f.review, assessment })).statusCode).toBe(
        400,
      );
      assessment.screening[0]!.detail =
        "New symptom reported in synthetic exercise.";
      const unresolved = await f.postReview({ ...f.review, assessment });
      expect(unresolved.statusCode).toBe(400);
      expect(unresolved.json().code).toBe("provider_plan_required");
      assessment.providerCommunication = communication();
      assessment.screening[1]!.result = "not_applicable";
      expect((await f.postReview({ ...f.review, assessment })).statusCode).toBe(
        400,
      );
      assessment.screening[1]!.detail =
        "No previous treatment in this synthetic scenario.";
      const result = await f.postReview({ ...f.review, assessment });
      expect(result.statusCode).toBe(200);
      expect(
        result.json<InjectionCase>().review!.assessment!.screening[0]!.result,
      ).toBe("concern");
      expect(
        result.json<InjectionCase>().review!.assessment!.providerCommunication!
          .instructions,
      ).toBe(assessment.providerCommunication.instructions);
    } finally {
      await f.app.close();
    }
  });

  it.each(["initiation", "day_1", "day_8", "restart", "switching"] as const)(
    "requires provider attribution for the %s phase even when timing is marked scheduled",
    async (phase) => {
      const f = await fixture();
      try {
        await f.repo.updateInjection(
          f.current.id,
          { ...f.order, clinicalContext: context(phase), expectedVersion: 1 },
          command(),
        );
        const result = await f.postReview({ ...f.review, expectedVersion: 2 });
        expect(result.statusCode).toBe(400);
        expect(result.json().code).toBe("provider_plan_required");
        expect(
          (
            await f.postReview({
              ...f.review,
              expectedVersion: 2,
              assessment: {
                ...f.review.assessment,
                providerCommunication: communication(),
              },
            })
          ).statusCode,
        ).toBe(200);
      } finally {
        await f.app.close();
      }
    },
  );

  it("blocks unresolved timing, held or clarification decisions and future provider contact", async () => {
    const f = await fixture();
    try {
      for (const decision of ["hold", "clarify"] as const) {
        const result = await f.postReview({
          ...f.review,
          assessment: {
            ...f.review.assessment,
            providerCommunication: { ...communication(), decision },
          },
        });
        expect(result.statusCode).toBe(400);
        expect(result.json().code).toBe("provider_plan_unresolved");
      }
      const future = await f.postReview({
        ...f.review,
        assessment: {
          ...f.review.assessment,
          providerCommunication: {
            ...communication(),
            contactedAt: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      });
      expect(future.statusCode).toBe(400);
      expect(future.json().code).toBe("future_provider_communication");
      await f.repo.updateInjection(
        f.current.id,
        { ...f.order, timingCategory: "unknown", expectedVersion: 1 },
        command(),
      );
      expect(
        (
          await f.postReview({
            ...f.review,
            expectedVersion: 2,
            assessment: {
              ...f.review.assessment,
              providerCommunication: communication(),
            },
          })
        ).json().code,
      ).toBe("timing_unresolved");
    } finally {
      await f.app.close();
    }
  });

  it("requires a source for date-only history and preserves calendar-month interval semantics", async () => {
    const f = await fixture();
    try {
      const lastAdministrationOn = "2020-01-01";
      await f.repo.updateInjection(
        f.current.id,
        { ...f.order, lastAdministrationOn, expectedVersion: 1 },
        command(),
      );
      expect(
        (await f.postReview({ ...f.review, expectedVersion: 2 })).json().code,
      ).toBe("history_source_required");
      await f.repo.updateInjection(
        f.current.id,
        {
          ...f.order,
          lastAdministrationOn,
          clinicalContext: {
            ...context(),
            historySource:
              "Synthetic Tebra administration entry, exact time unavailable",
          },
          expectedVersion: 2,
        },
        command(),
      );
      const result = await f.postReview({ ...f.review, expectedVersion: 3 });
      expect(result.statusCode).toBe(200);
      expect(result.json<InjectionCase>().clinicalContext!.schedule).toEqual({
        every: 1,
        unit: "months",
      });
      expect(result.json<InjectionCase>().lastAdministrationAt).toBeNull();
    } finally {
      await f.app.close();
    }
  });

  it("requires medication-specific screening and does not treat a provider plan as certification of a specialist setting", async () => {
    const f = await fixture("Invega Sustenna");
    try {
      expect(getInjectionGuidance(f.product.name)).toBeDefined();
      expect(f.review.assessment.screening.length).toBeGreaterThan(3);
      expect(
        (
          await f.postReview({
            ...f.review,
            assessment: {
              ...f.review.assessment,
              screening: f.review.assessment.screening.slice(0, 3),
            },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await f.app.close();
    }
    const specialist = await fixture("Zyprexa Relprevv");
    try {
      expect(
        getInjectionGuidance(specialist.product.name)
          ?.requiresSpecialistSetting,
      ).toBe(true);
      const result = await specialist.postReview({
        ...specialist.review,
        assessment: {
          ...specialist.review.assessment,
          providerCommunication: communication(),
        },
      });
      expect(result.statusCode).toBe(400);
      expect(result.json().code).toBe("specialist_setting_required");
      expect((await specialist.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    } finally {
      await specialist.app.close();
    }
  });

  it("records an administration error truthfully, preserves actual route/site and follow-up, and consumes stock once", async () => {
    const f = await fixture();
    try {
      const review = await f.postReview(f.review);
      expect(review.statusCode).toBe(200);
      const payload = {
        expectedVersion: 2,
        administeredAt: new Date().toISOString(),
        administeredByName: "Synthetic administering staff",
        tolerance: "Synthetic observation",
        observation: "Synthetic follow-up",
        delivery: "complete",
        actualDose: 200,
        issueAction: null,
        actualRoute: "SC",
        actualSite: "Abdomen",
        followUp: {
          instructions: "Follow documented provider instructions.",
          educationProvided: ["Reviewed the recorded follow-up plan."],
          observationMinutes: 15,
          observationOutcome: "completed",
          observationNote: "Recorded observation, no inferred findings.",
        },
      };
      const url = `/api/v1/injections/${f.current.id}/administer`;
      const request = (value: unknown, key = randomUUID()) =>
        f.app.inject({
          method: "POST",
          url,
          headers: { "idempotency-key": key },
          payload: value as Record<string, unknown>,
        });
      expect((await request(payload)).statusCode).toBe(400);
      const wrongRoute = await request({ ...payload, actualDose: 100 });
      expect(wrongRoute.statusCode).toBe(400);
      expect(wrongRoute.json().code).toBe("actual_route");
      expect(
        (await request({ ...payload, delivery: "error" })).statusCode,
      ).toBe(400);
      const errorPayload = {
        ...payload,
        delivery: "error",
        issueAction:
          "Actual delivery entered; synthetic provider contacted and follow-up plan documented.",
      };
      const key = randomUUID();
      const result = await request(errorPayload, key);
      expect(result.statusCode).toBe(200);
      const saved = result.json<InjectionCase>().administration!;
      expect([saved.actualDose, saved.actualRoute, saved.actualSite]).toEqual([
        200,
        "SC",
        "Abdomen",
      ]);
      expect(saved.orderSnapshot.route).toBe("IM");
      expect(saved.followUp).toEqual(errorPayload.followUp);
      expect((await request(errorPayload, key)).json()).toEqual(result.json());
      expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(1);
    } finally {
      await f.app.close();
    }
  });

  it("keeps historical review snapshots readable and freezes a held order independently from later edits", async () => {
    const f = await fixture();
    try {
      const reviewed = (await f.postReview(f.review)).json<InjectionCase>();
      const historical = structuredClone(reviewed);
      delete historical.review!.assessment;
      delete historical.review!.guidanceVersion;
      const serialized = JSON.parse(
        JSON.stringify(historical),
      ) as InjectionCase;
      expect(() =>
        administerInjectionCase(
          serialized,
          {
            expectedVersion: 2,
            administeredAt: new Date().toISOString(),
            administeredByName: "Synthetic staff",
            tolerance: "Historical fact",
            observation: "Historical fact",
            delivery: "complete",
            actualDose: null,
            issueAction: null,
          },
          actor,
          clinicDate("UTC"),
          randomUUID(),
        ),
      ).toThrow("Edit and review");
      expect(
        injectionNote(serialized, f.patient, f.product, undefined, "UTC"),
      ).toContain("Synthetic review patient");
      const held = await f.repo.dispositionInjection(
        f.current.id,
        {
          expectedVersion: 2,
          status: "held",
          reason: "Awaiting verified plan",
        },
        command(),
      );
      expect(held.disposition!.orderSnapshot!.tebraOrderReference).toBe(
        "SYNTHETIC-ORDER",
      );
      const frozen = structuredClone(held.disposition!.orderSnapshot);
      await f.repo.updateInjection(
        f.current.id,
        {
          ...f.order,
          tebraOrderReference: "REVISED-ORDER",
          expectedVersion: 3,
        },
        command(),
      );
      expect(held.disposition!.orderSnapshot).toEqual(frozen);
    } finally {
      await f.app.close();
    }
  });

  it("invalidates the review and clears omitted prior context when an order is replaced", async () => {
    const f = await fixture();
    try {
      await f.repo.updateInjection(
        f.current.id,
        {
          ...f.order,
          lastAdministrationOn: "2020-01-01",
          clinicalContext: {
            ...context(),
            historySource: "Original history source",
          },
          expectedVersion: 1,
        },
        command(),
      );
      expect(
        (await f.postReview({ ...f.review, expectedVersion: 2 })).statusCode,
      ).toBe(200);
      const { clinicalContext: _, ...replacement } = f.order;
      const revised = await f.repo.updateInjection(
        f.current.id,
        { ...replacement, expectedVersion: 3 },
        command(),
      );
      expect(revised.status).toBe("draft");
      expect(revised.review).toBeNull();
      expect(revised.clinicalContext).toBeUndefined();
      expect(revised.lastAdministrationOn).toBeUndefined();
      expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
      expect(JSON.parse(JSON.stringify(revised))).toStrictEqual(revised);
    } finally {
      await f.app.close();
    }
  });

  it.each([
    ["Synthetic injection kit", "missing_assessment"],
    ["Invega Sustenna", "earlier_guidance"],
  ] as const)(
    "reads a legacy %s review but blocks %s administration without stock changes until staff review again",
    async (productName, legacyKind) => {
      const f = await fixture(productName);
      try {
        expect((await f.postReview(f.review)).statusCode).toBe(200);
        // Simulate a reviewed payload loaded from a database written by an earlier release.
        // No production write API allows callers to alter the stored guidance stamp.
        const stored = (
          f.repo as unknown as { injections: InjectionCase[] }
        ).injections.find((record) => record.id === f.current.id)!;
        if (legacyKind === "missing_assessment")
          delete stored.review!.assessment;
        else stored.review!.guidanceVersion = "earlier-release:invega-sustenna";
        const oldRecord = structuredClone(stored);
        const reads = await f.app.inject({ url: "/api/v1/injections" });
        expect(reads.statusCode).toBe(200);
        expect(reads.json<InjectionCase[]>()[0]!.id).toBe(stored.id);
        expect(
          injectionNote(oldRecord, f.patient, f.product, undefined, "UTC"),
        ).toContain("Synthetic review patient");
        const before = await f.repo.overview(actor);
        const administration = {
          expectedVersion: 2,
          administeredAt: new Date().toISOString(),
          administeredByName: "Synthetic staff",
          tolerance: "Synthetic observation",
          observation: "Synthetic follow-up",
          delivery: "complete",
          actualDose: 100,
          issueAction: null,
        };
        const request = (expectedVersion: number) =>
          f.app.inject({
            method: "POST",
            url: `/api/v1/injections/${f.current.id}/administer`,
            headers: { "idempotency-key": randomUUID() },
            payload: {
              ...administration,
              expectedVersion,
              administeredAt: new Date().toISOString(),
            },
          });
        const blocked = await request(2);
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().code).toBe("review_outdated");
        expect(await f.repo.overview(actor)).toEqual(before);
        expect((await f.repo.listInjections(actor))[0]).toEqual(oldRecord);
        await f.repo.updateInjection(
          f.current.id,
          { ...f.order, expectedVersion: 2 },
          command(),
        );
        expect(
          (await f.postReview({ ...f.review, expectedVersion: 3 })).statusCode,
        ).toBe(200);
        const completed = await request(4);
        expect(completed.statusCode).toBe(200);
        expect(
          completed.json<InjectionCase>().administration!.reviewSnapshot
            .assessment,
        ).toBeDefined();
        expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(1);
      } finally {
        await f.app.close();
      }
    },
  );
});
