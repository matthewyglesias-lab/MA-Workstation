import { describe, expect, it } from "vitest";
import {
  injectionInput,
  type InjectionCase,
} from "../src/shared/injections.js";
import {
  createInjectionCase,
  disposeInjection,
} from "../src/server/modules/injections.js";
import { relatedInjectionCases } from "../src/web/InjectionClinicalSummary.js";
import { injectionStatus } from "../src/web/InjectionWorkspace.js";

const patientId = "11111111-1111-4111-8111-111111111111";
function encounter(
  linkedPlan: string | null,
  changes: Partial<InjectionCase> = {},
) {
  return {
    ...createInjectionCase(
      injectionInput.parse({
        patientId,
        productId: "22222222-2222-4222-8222-222222222222",
        tebraOrderReference: "SYNTHETIC-ORDER",
        orderingProvider: "Test provider",
        dose: 100,
        doseUnit: "mg",
        route: "IM",
        site: "Left deltoid",
        plannedOn: "2026-09-15",
        lastAdministrationAt: null,
        timingCategory: "initiation",
        timingPlan: "Synthetic plan",
        nextDueOn: null,
        clinicalContext: {
          phase: "initiation",
          indication: null,
          schedule: null,
          historySource: null,
          priorProduct: null,
          priorDose: null,
          linkedPlan,
        },
      }),
    ),
    ...changes,
  };
}

describe("injection encounter context", () => {
  it("groups only the same patient and exact documented plan", () => {
    const selected = encounter("PLAN-A");
    const paired = encounter("PLAN-A", { doseSequence: 2 });
    const otherPatient = encounter("PLAN-A", {
      patientId: "33333333-3333-4333-8333-333333333333",
    });
    const differentPlan = encounter("PLAN-B");
    const similarPlan = encounter("plan-a");
    const unlinked = encounter(null);
    const records = [
      otherPatient,
      paired,
      differentPlan,
      similarPlan,
      selected,
      unlinked,
    ];
    expect(
      relatedInjectionCases(selected, records).map((item) => item.id),
    ).toEqual([selected.id, paired.id]);
    expect(relatedInjectionCases(unlinked, records)).toEqual([]);
  });

  it("retains held components and reads their frozen order reference", () => {
    const selected = encounter("PLAN-A");
    const paired = encounter("PLAN-A", { doseSequence: 2 });
    const held = disposeInjection(
      paired,
      { expectedVersion: 1, status: "held", reason: "Awaiting clarification" },
      { id: "test-operator", roles: ["Console.Operator"] },
    );
    held.clinicalContext = {
      ...held.clinicalContext!,
      linkedPlan: "Later unrelated value",
    };
    const matches = relatedInjectionCases(selected, [selected, held]);
    expect(matches[1]).toBe(held);
    expect(matches[1]?.status).toBe("held");
    expect(matches[1]?.administration).toBeNull();
  });

  it("labels delivery outcomes independently of the completed encounter state", () => {
    expect(
      injectionStatus({
        status: "administered",
        administration: { delivery: "error" },
      }),
    ).toBe("Administration error");
    expect(
      injectionStatus({
        status: "administered",
        administration: { delivery: "not_delivered" },
      }),
    ).toBe("Not delivered");
    expect(
      injectionStatus({
        status: "administered",
        administration: { delivery: "partial" },
      }),
    ).toBe("Partial dose");
    expect(
      injectionStatus({
        status: "administered",
        administration: { delivery: "complete" },
      }),
    ).toBe("Administered");
    expect(injectionStatus({ status: "held", administration: null })).toBe(
      "On hold",
    );
  });

  it("directs an earlier reviewed encounter back to the current checklist", () => {
    expect(injectionStatus({ status: "reviewed", review: null })).toBe(
      "Review update needed",
    );
    // Historical completed administrations remain factual even without new fields.
    expect(
      injectionStatus({
        status: "administered",
        review: null,
        administration: { delivery: "complete" },
      }),
    ).toBe("Administered");
  });
});
