import { workstationPolicyReviewFingerprint } from "../src/shared/workstation-clinical-policy.js";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DemoRepository } from "../src/server/platform/demo-repository.js";
import { clinicDate } from "../src/server/platform/config.js";
import {
  emptyWorkstationState,
  workstationState,
  workstationOralComponentIssue,
  WORKSTATION_ENGINE_VERSION,
  type WorkstationState,
} from "../src/shared/workstation-contracts.js";
import {
  buildWorkstationEncounter,
  resolveWorkstationMedication,
} from "../src/shared/workstation-bridge.js";
import {
  getInjectionReviewChecks,
  hasCurrentInjectionReview,
} from "../src/shared/injection-readiness.js";
import type {
  InjectionInput,
  InjectionReviewInput,
  InjectionAdministrationInput,
  InjectionCase,
} from "../src/shared/injections.js";
import type { Actor } from "../src/shared/contracts.js";
const actor: Actor = {
  id: "engine-test-staff",
  roles: ["Console.Operator", "Inventory.Manager"],
};
const command = () => ({ key: randomUUID(), actor });
const day = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export function syntheticWorkstation(): WorkstationState {
  return {
    ...emptyWorkstationState(),
    intervalKey: "q4wk",
    reason: "scheduled",
    habitus: "average",
    acuteSafetyScreenConfirmed: true,
    attestations: {
      id2: true,
      rights: true,
      allergy: true,
      consent: true,
      screen: true,
      hygiene: true,
    },
    verifications: {
      opioidFree: true,
      naltrexHS: true,
      suppliedNeedle: true,
      resuspend: true,
      visualInspection: true,
      invegaInit: true,
      oralOverlap: true,
      stabilized: true,
      paliperidoneTolerability: true,
      aripiprazoleTolerability: true,
      glutealOnly: true,
      noMassage: true,
      deepZtrack: true,
    },
  };
}
async function fixture(name = "Invega Sustenna", dose = 156) {
  const repo = new DemoRepository("UTC");
  const patient = await repo.createPatient(
    {
      tebraId: `SYNTHETIC-${randomUUID()}`,
      displayName: "Synthetic engine patient",
      dob: "1980-01-01",
      verifiedInTebra: true,
    },
    command(),
  );
  const product = await repo.createProduct(
    { name, strength: `${dose} mg`, unit: "kit", ndc: "00000-0000-00" },
    command(),
  );
  const lot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "SYNTHETIC-ONLY",
      expiresOn: "2035-01-01",
      location: "Training cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    command(),
  );
  await repo.postMovement(
    {
      lotId: lot.id,
      kind: "receive",
      quantity: 4,
      patientId: null,
      reason: "Synthetic fixture",
      reversesId: null,
    },
    command(),
  );
  const order: InjectionInput = {
    patientId: patient.id,
    productId: product.id,
    doseSequence: 1,
    tebraOrderReference: "SYNTHETIC-ORDER",
    orderingProvider: "Synthetic prescriber",
    dose,
    doseUnit: "mg",
    route: "IM",
    site: "Left deltoid",
    plannedOn: clinicDate("UTC"),
    lastAdministrationAt: null,
    lastAdministrationOn: day(-28),
    timingCategory: "scheduled",
    timingPlan: "Verified synthetic maintenance order",
    nextDueOn: day(28),
    clinicalContext: {
      phase: "maintenance",
      indication: "Schizophrenia",
      schedule: { every: 4, unit: "weeks" },
      historySource: "Synthetic prior MAR",
      priorProduct: name,
      priorDose: `${dose} mg`,
      linkedPlan: null,
    },
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
    allergyReview: "Allergy status explicitly reviewed in synthetic source",
    clinicalReview: "Synthetic assessment",
    preparation: "Synthetic preparation verified",
    siteAssessment: "Synthetic site review",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Synthetic exercise",
    },
    observationPlan: "Synthetic observation plan",
    assessment: {
      screening: getInjectionReviewChecks(name).map(({ id, label }) => ({
        id,
        label,
        result: "no_concern",
        detail: null,
      })),
      weightKg: 72,
      needle: "Synthetic supplied needle selection",
      providerCommunication: null,
      education: [],
    },
    workstation: syntheticWorkstation(),
  };
  const administration = (
    expectedVersion = 2,
  ): InjectionAdministrationInput => ({
    expectedVersion,
    administeredAt: new Date().toISOString(),
    administeredByName: "Synthetic nurse",
    tolerance: "Observed synthetic response",
    observation: "Synthetic observation",
    delivery: "complete",
    actualDose: dose,
    actualRoute: "IM",
    actualSite: "Left deltoid",
    issueAction: null,
  });
  return { repo, patient, product, lot, order, review, administration };
}
async function pairedFixture(
  oralOverride: Partial<NonNullable<WorkstationState["oral"]>> = {},
) {
  const f = await fixture("Abilify Maintena", 400);
  const secondLot = await f.repo.createLot(
    {
      productId: f.product.id,
      lotNumber: "SECOND-SYNTHETIC",
      expiresOn: "2035-01-01",
      location: "Training cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    command(),
  );
  await f.repo.postMovement(
    {
      lotId: secondLot.id,
      kind: "receive",
      quantity: 1,
      patientId: null,
      reason: "Synthetic paired component",
      reversesId: null,
    },
    command(),
  );
  const communication = {
    provider: "Synthetic prescriber",
    contactedAt: new Date(Date.now() - 60000).toISOString(),
    decision: "proceed_as_ordered" as const,
    instructions:
      "Synthetic verified one-day Maintena 400 mg in each separate muscle and oral aripiprazole 20 mg order",
    reference: "SYNTHETIC-PAIRED-ORDER",
  };
  const oral = {
    product: "Aripiprazole",
    dose: "20 mg",
    status: "verified" as const,
    source: "Synthetic active oral administration record",
    ...oralOverride,
  };
  const state: WorkstationState = {
    ...syntheticWorkstation(),
    reason: "initiation",
    oral,
    initiation: {
      ...emptyWorkstationState().initiation,
      protocol: "maintena-1day",
      planVerified: true,
      oralStatus: "verified",
      providerNote: communication.instructions,
    },
  };
  const order: InjectionInput = {
    ...f.order,
    lastAdministrationOn: null,
    timingCategory: "initiation",
    clinicalContext: { ...f.order.clinicalContext!, phase: "initiation" },
    workstation: state,
  };
  const primaryDraft = await f.repo.createInjection(order, command());
  const secondaryState = { ...state, pairedCaseId: primaryDraft.id };
  const secondary = await f.repo.createInjection(
    {
      ...order,
      doseSequence: 2,
      site: "Right deltoid",
      workstation: secondaryState,
    },
    command(),
  );
  const primaryState = { ...state, pairedCaseId: secondary.id };
  const primary = await f.repo.updateInjection(
    primaryDraft.id,
    { ...order, workstation: primaryState, expectedVersion: 1 },
    command(),
  );
  const primaryReview = await f.repo.reviewInjection(
    primary.id,
    {
      ...f.review,
      expectedVersion: 2,
      assessment: {
        ...f.review.assessment,
        providerCommunication: communication,
      },
      workstation: primaryState,
    },
    command(),
  );
  const secondaryReview = await f.repo.reviewInjection(
    secondary.id,
    {
      ...f.review,
      lotId: secondLot.id,
      assessment: {
        ...f.review.assessment,
        providerCommunication: communication,
      },
      workstation: secondaryState,
    },
    command(),
  );
  return {
    ...f,
    primary,
    primaryReview,
    secondary,
    secondaryReview,
    primaryState,
    administration: () => f.administration(3),
    secondaryAdministration: () => ({
      ...f.administration(),
      actualSite: "Right deltoid",
    }),
  };
}
describe("persistent original clinical engine integration", () => {
  it("strictly separates supplemental staff facts from identity, stock and invented second doses", () => {
    const state = syntheticWorkstation();
    for (const change of [
      { patient: { name: "Override", dob: "2000-01-01" } },
      { medicationKey: "other" },
      { canFinalize: true },
      { traceability: { lot: "FAKE" } },
    ])
      expect(workstationState.safeParse({ ...state, ...change }).success).toBe(
        false,
      );
    expect(
      workstationState.safeParse({
        ...state,
        initiation: {
          ...state.initiation,
          second: { ...state.initiation.second, given: true },
        },
      }).success,
    ).toBe(false);
    expect(resolveWorkstationMedication("Aristada Initio 675 mg")).toBe(
      "initio",
    );
    expect(
      resolveWorkstationMedication("Aristada and Vivitrol"),
    ).toBeUndefined();
  });
  it("requires a current full engine review before reserving a supported product, without partial stock writes", async () => {
    const f = await fixture();
    const current = await f.repo.createInjection(f.order, command());
    const { workstation: _, ...oldReview } = f.review;
    await expect(
      f.repo.reviewInjection(current.id, oldReview, command()),
    ).rejects.toThrow("full medication engine");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    const incomplete = {
      ...f.review,
      workstation: { ...f.review.workstation!, verifications: {} },
    };
    await expect(
      f.repo.reviewInjection(current.id, incomplete, command()),
    ).rejects.toThrow("verification");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    const reviewed = await f.repo.reviewInjection(
      current.id,
      f.review,
      command(),
    );
    expect(reviewed.review!.engineVersion).toBe(WORKSTATION_ENGINE_VERSION);
    expect(hasCurrentInjectionReview(reviewed.review)).toBe(true);
    delete reviewed.review!.engineVersion;
    expect(hasCurrentInjectionReview(reviewed.review)).toBe(false);
  });
  it("derives canonical identity, traceability and actual facts and rejects changed pre-dose checks atomically", async () => {
    const f = await fixture();
    const current = await f.repo.createInjection(f.order, command());
    const reviewed = await f.repo.reviewInjection(
      current.id,
      f.review,
      command(),
    );
    const preview = buildWorkstationEncounter(
      reviewed,
      { ...f.patient, displayName: "Changed caller" },
      { ...f.product, name: "Vivitrol" },
      "UTC",
    );
    expect(preview.patient.name).toBe(f.patient.displayName);
    expect(preview.medicationKey).toBe("sustenna");
    expect(preview.traceability.lot).toBe(f.lot.lotNumber);
    expect(preview.response.kind).toBe("");
    await expect(
      f.repo.administerInjection(
        current.id,
        {
          ...f.administration(),
          workstation: {
            ...f.review.workstation!,
            acuteSafetyScreenConfirmed: false,
          },
        },
        command(),
      ),
    ).rejects.toThrow("facts changed");
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(4);
    const c = command();
    const input = f.administration();
    const completed = await f.repo.administerInjection(current.id, input, c);
    const retry = await f.repo.administerInjection(current.id, input, c);
    expect(retry.administration!.id).toBe(completed.administration!.id);
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(3);
    expect(completed.administration!.engineReviewFingerprint).toBeTruthy();
    const actual = buildWorkstationEncounter(
      completed,
      undefined,
      undefined,
      "UTC",
    );
    expect(actual.response).toEqual({
      kind: "custom",
      custom: input.tolerance,
    });
    expect(actual.dose).toBe("156 mg");
  });
  it("records a real post-review route error and its unresolved engine findings without inventing clearance", async () => {
    const f = await fixture();
    const current = await f.repo.createInjection(f.order, command());
    await f.repo.reviewInjection(current.id, f.review, command());
    const completed = await f.repo.administerInjection(
      current.id,
      {
        ...f.administration(),
        delivery: "error",
        actualRoute: "SC",
        actualSite: "Documented incorrect site",
        actualDose: 100,
        issueAction:
          "Synthetic route error: provider notified, assessment and follow-up recorded.",
      },
      command(),
    );
    expect(
      completed.administration!.engineFindings?.some(
        (finding) => finding.code === "route.outside-guidance",
      ),
    ).toBe(true);
    expect(
      buildWorkstationEncounter(completed, undefined, undefined, "UTC").route,
    ).toBe("SubQ");
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(3);
  });
  it("accepts deliberate retrospective actual events with post-event review attribution, keeping unresolved facts and audit time", async () => {
    const f = await fixture();
    const historicalOn = day(-7);
    const state: WorkstationState = {
      ...emptyWorkstationState(),
      recordingMode: "retrospective",
      retrospectiveReason:
        "Late entry from the original synthetic administration record",
      stockNotPreviouslyRecorded: true,
    };
    const current = await f.repo.createInjection(
      {
        ...f.order,
        plannedOn: historicalOn,
        lastAdministrationOn: null,
        timingCategory: "unknown",
        nextDueOn: null,
        workstation: state,
      },
      command(),
    );
    const reviewed = await f.repo.reviewInjection(
      current.id,
      {
        ...f.review,
        workstation: state,
        assessment: {
          ...f.review.assessment,
          screening: f.review.assessment.screening.map((check) => ({
            ...check,
            result: "concern",
            detail: "Historical assessment not documented in available source",
          })),
        },
      },
      command(),
    );
    expect(
      reviewed.review!.engineFindings?.some(
        (finding) => finding.code === "provider_plan_required",
      ),
    ).toBe(true);
    const actualTime = `${historicalOn}T12:00:00Z`;
    const recorded = await f.repo.administerInjection(
      current.id,
      { ...f.administration(), administeredAt: actualTime },
      command(),
    );
    expect(recorded.administration!.administeredAt).toBe(actualTime);
    expect(recorded.administration!.recordedAt.slice(0, 10)).toBe(day());
    expect(recorded.review!.reviewedAt.slice(0, 10)).toBe(day());
    expect(
      recorded.administration!.engineFindings?.some(
        (finding) => finding.code === "safety.screen",
      ),
    ).toBe(true);
    expect(
      buildWorkstationEncounter(recorded, undefined, undefined, "UTC")
        .attestations,
    ).toEqual({});
    expect((await f.repo.overview(actor)).lots[0]!.onHand).toBe(3);
  });
  it("rejects retrospective shortcuts for today and missing inventory reconciliation attestation", async () => {
    const f = await fixture();
    const state = {
      ...syntheticWorkstation(),
      recordingMode: "retrospective" as const,
      retrospectiveReason: "Synthetic late entry",
      stockNotPreviouslyRecorded: true,
    };
    const current = await f.repo.createInjection(f.order, command());
    await expect(
      f.repo.reviewInjection(
        current.id,
        { ...f.review, workstation: state },
        command(),
      ),
    ).rejects.toThrow("past clinic date");
    const historical = await f.repo.createInjection(
      { ...f.order, plannedOn: day(-1), lastAdministrationOn: null },
      command(),
    );
    await expect(
      f.repo.reviewInjection(
        historical.id,
        {
          ...f.review,
          workstation: { ...state, stockNotPreviouslyRecorded: false },
        },
        command(),
      ),
    ).rejects.toThrow("already been recorded");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
  });
  it("keeps paired injections independently stocked, requires a pending plan, and never fabricates the second administration", async () => {
    const f = await pairedFixture();
    expect(
      buildWorkstationEncounter(f.primaryReview, undefined, undefined, "UTC")
        .initiation!.second.given,
    ).toBe(false);
    await expect(
      f.repo.administerInjection(f.primary.id, f.administration(), command()),
    ).rejects.toThrow("follow-up instructions");
    const first = await f.repo.administerInjection(
      f.primary.id,
      {
        ...f.administration(),
        followUp: {
          instructions:
            "Record the separately reviewed Initio component under its independent order after administration.",
          educationProvided: [],
          observationMinutes: null,
          observationOutcome: null,
          observationNote: null,
        },
      },
      command(),
    );
    expect(
      first.administration!.engineFindings?.some(
        (finding) => finding.code === "workstation.pair-pending",
      ),
    ).toBe(true);
    const second = await f.repo.administerInjection(
      f.secondary.id,
      {
        ...f.secondaryAdministration(),
        followUp: {
          instructions:
            "Complete the linked independent Maintena component after administration.",
          educationProvided: [],
          observationMinutes: null,
          observationOutcome: null,
          observationNote: null,
        },
      },
      command(),
    );
    const frozenFirst = buildWorkstationEncounter(
      first,
      undefined,
      undefined,
      "UTC",
      second,
    );
    expect(frozenFirst.initiation!.second.given).toBe(false);
    const stock = (await f.repo.overview(actor)).lots;
    expect(stock.find((lot) => lot.id === f.lot.id)!.onHand).toBe(3);
    expect(stock.find((lot) => lot.id !== f.lot.id)!.onHand).toBe(0);
  });
  it("freezes actual component proof without recursive paired snapshots or later note mutation", async () => {
    const f = await pairedFixture();
    const second = await f.repo.administerInjection(
      f.secondary.id,
      {
        ...f.secondaryAdministration(),
        followUp: {
          instructions:
            "Complete the linked independent Maintena component after administration.",
          educationProvided: [],
          observationMinutes: null,
          observationOutcome: null,
          observationNote: null,
        },
      },
      command(),
    );
    // A historical linkage chain must not be copied recursively into a new receipt.
    const stored = (
      f.repo as unknown as { injections: InjectionCase[] }
    ).injections.find((record) => record.id === second.id)!;
    stored.administration!.pairedCaseSnapshot = structuredClone(
      f.primaryReview,
    );
    stored.administration!.reviewSnapshot.pairedCaseSnapshot = structuredClone(
      f.primaryReview,
    );
    const completed = await f.repo.administerInjection(
      f.primary.id,
      f.administration(),
      command(),
    );
    const paired = completed.administration!.pairedCaseSnapshot!;
    expect(paired.administration!.pairedCaseSnapshot).toBeUndefined();
    expect(
      paired.administration!.reviewSnapshot.pairedCaseSnapshot,
    ).toBeUndefined();
    const encounter = buildWorkstationEncounter(
      completed,
      undefined,
      undefined,
      "UTC",
    );
    expect(encounter.initiation!.second.given).toBe(true);
    expect(encounter.initiation!.second.lot).toBe("SECOND-SYNTHETIC");
    expect(encounter.initiation!.second.dose).toBe("400 mg");
    expect(encounter.secondAdministrationTime).toBeTruthy();
    stored.administration!.actualDose = 10;
    expect(
      buildWorkstationEncounter(completed, undefined, undefined, "UTC")
        .initiation!.second.dose,
    ).toBe("400 mg");
  });
  it("binds timing authorization to validated provider communication and rejects forged or future claims", async () => {
    const f = await fixture();
    const current = await f.repo.createInjection(f.order, command());
    const state = structuredClone(f.review.workstation!);
    const communication = {
      provider: "Synthetic prescriber",
      contactedAt: new Date(Date.now() - 60000).toISOString(),
      decision: "proceed_as_ordered" as const,
      instructions:
        "Proceed with this exact synthetic medication, dose and timing.",
      reference: "SYNTHETIC-CONSULT",
    };
    state.details = {
      lateDoseReview: "provider-authorized",
      lateDoseReviewProvider: communication.provider,
      lateDoseReviewTime: communication.contactedAt,
      lateDoseReviewNote: communication.instructions,
    };
    const review = {
      ...f.review,
      workstation: state,
      assessment: {
        ...f.review.assessment,
        providerCommunication: communication,
      },
    };
    const preview: InjectionCase = {
      ...current,
      review: {
        ...review,
        reviewedAt: new Date().toISOString(),
        reviewedBy: actor.id,
        patientSnapshot: f.patient,
        productSnapshot: f.product,
        lotSnapshot: {
          lotNumber: f.lot.lotNumber,
          expiresOn: f.lot.expiresOn,
          location: f.lot.location,
          ownership: f.lot.ownership,
          ownerPatientId: f.lot.ownerPatientId,
        },
        reservationMovementId: "",
      },
    };
    state.details.lateDoseReviewFingerprint =
      workstationPolicyReviewFingerprint(
        buildWorkstationEncounter(preview, undefined, undefined, "UTC"),
        {
          indication: f.order.clinicalContext?.indication,
          priorDose: f.order.clinicalContext?.priorDose,
          priorProduct: f.order.clinicalContext?.priorProduct,
        },
      );
    await expect(
      f.repo.reviewInjection(
        current.id,
        {
          ...review,
          assessment: { ...review.assessment, providerCommunication: null },
        },
        command(),
      ),
    ).rejects.toThrow("valid documented provider communication");
    await expect(
      f.repo.reviewInjection(
        current.id,
        {
          ...review,
          workstation: {
            ...state,
            details: {
              ...state.details,
              lateDoseReviewProvider: "Another provider",
            },
          },
        },
        command(),
      ),
    ).rejects.toThrow("must match");
    await expect(
      f.repo.reviewInjection(
        current.id,
        {
          ...review,
          workstation: {
            ...state,
            details: { ...state.details, lateDoseReviewTime: "tomorrow" },
          },
        },
        command(),
      ),
    ).rejects.toThrow("must match");
    await expect(
      f.repo.reviewInjection(
        current.id,
        {
          ...review,
          assessment: {
            ...review.assessment,
            providerCommunication: {
              ...communication,
              contactedAt: new Date(Date.now() + 86400000).toISOString(),
            },
          },
        },
        command(),
      ),
    ).rejects.toThrow("future");
    await expect(
      f.repo.reviewInjection(
        current.id,
        {
          ...review,
          workstation: {
            ...state,
            details: { ...state.details, lateDoseReviewFingerprint: "unbound" },
          },
        },
        command(),
      ),
    ).rejects.toThrow("no longer matches");
    expect((await f.repo.overview(actor)).lots[0]!.reserved).toBe(0);
    const saved = await f.repo.reviewInjection(current.id, review, command());
    expect(saved.review!.workstation!.details.lateDoseReviewTime).toBe(
      communication.contactedAt,
    );
    const completed = await f.repo.administerInjection(
      current.id,
      { ...f.administration(), workstation: saved.review!.workstation },
      command(),
    );
    expect(
      completed.administration!.workstation!.details.lateDoseReviewTime,
    ).toBe(communication.contactedAt);
    expect(
      saved.review!.engineFindings?.some((finding) =>
        [
          "administration.staff",
          "administration.time",
          "response.required",
          "disposition.required",
        ].includes(finding.code),
      ),
    ).toBe(false);
  });

  it("enforces exact named oral components and the same clinic day before either paired stock reservation", async () => {
    await expect(pairedFixture({ product: "Vitamin D" })).rejects.toThrow(
      "oral aripiprazole 20 mg",
    );
    await expect(pairedFixture({ dose: "30 mg" })).rejects.toThrow(
      "oral aripiprazole 20 mg",
    );
    await expect(
      pairedFixture({
        status: "administered",
        administeredAt: `${day(-1)}T12:00:00Z`,
      }),
    ).rejects.toThrow("component");
    const state = {
      ...syntheticWorkstation(),
      oral: {
        product: "Aripiprazole",
        dose: "30.0mg",
        status: "verified" as const,
        source: "Synthetic verified record",
      },
      initiation: {
        ...emptyWorkstationState().initiation,
        protocol: "aristada-initio-sameday" as const,
        oralStatus: "verified" as const,
      },
    };
    expect(workstationOralComponentIssue(state, day(), "UTC")).toBeUndefined();
    expect(
      workstationOralComponentIssue(
        {
          ...state,
          oral: {
            ...state.oral,
            status: "administered",
            administeredAt: `${day(-1)}T12:00:00Z`,
          },
          initiation: { ...state.initiation, oralStatus: "administered" },
        },
        day(),
        "UTC",
      ),
    ).toContain("same clinic date");
    expect(
      workstationOralComponentIssue(
        { ...state, oral: { ...state.oral, dose: "20mg" } },
        day(),
        "UTC",
      ),
    ).toContain("30 mg");
    expect(
      workstationOralComponentIssue(
        {
          ...state,
          initiation: { ...state.initiation, protocol: "aristada-provider" },
        },
        day(),
        "UTC",
      ),
    ).toBeUndefined();
  });
});
