/** Local component-test adapter. No account system, credentials, or network. */
import { seededDemo } from "../../../src/server/platform/demo-repository.js";
import { clinicDate } from "../../../src/server/platform/config.js";
import {
  activityInput,
  activityUpdate,
  lotInput,
  movementInput,
  patientInput,
  productInput,
  uuid,
  type Actor,
  type Overview,
} from "../../../src/shared/contracts.js";
import {
  injectionInput,
  injectionUpdate,
  injectionReview,
  injectionAdministration,
  injectionDisposition,
  injectionAmendment,
  injectionFiling,
  type InjectionCase,
} from "../../../src/shared/injections.js";
import { getInjectionReviewChecks } from "../../../src/shared/injection-readiness.js";

export const fixtureTimezone = "America/Los_Angeles";
export const fixtureActor: Actor = {
  id: "clinical-component-test-operator",
  displayName: "Clinical fixture operator",
  roles: ["Console.Operator", "Inventory.Manager"],
};
let repository: Awaited<ReturnType<typeof seededDemo>>;
const command = () => ({
  actor: fixtureActor,
  key: globalThis.crypto.randomUUID(),
});
function relativeDate(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function initializeFixture() {
  repository = await seededDemo(fixtureTimezone);
  const today = clinicDate(fixtureTimezone);
  const product = await repository.createProduct(
    productInput.parse({
      name: "Invega Sustenna",
      strength: "156 mg",
      unit: "syringe",
      ndc: null,
    }),
    command(),
  );
  const lot = await repository.createLot(
    lotInput.parse({
      productId: product.id,
      lotNumber: "FIXTURE-SUSTENNA-001",
      expiresOn: `${Number(today.slice(0, 4)) + 2}-12-31`,
      location: "Synthetic test medication cabinet",
      ownership: "sample",
      ownerPatientId: null,
    }),
    command(),
  );
  await repository.postMovement(
    movementInput.parse({
      lotId: lot.id,
      kind: "receive",
      quantity: 12,
      patientId: null,
      reason: "Component test stock; no physical inventory",
      reversesId: null,
    }),
    command(),
  );

  for (const [name, tebraId, completed] of [
    ["Avery Chen (synthetic)", "FIXTURE-MAINTENANCE", false],
    ["Riley Bennett (synthetic)", "FIXTURE-DOCUMENTS", true],
  ] as const) {
    const patient = await repository.createPatient(
      patientInput.parse({
        displayName: name,
        tebraId,
        dob: "1990-04-17",
        verifiedInTebra: true,
      }),
      command(),
    );
    const draft = await repository.createInjection(
      injectionInput.parse({
        patientId: patient.id,
        productId: product.id,
        doseSequence: 1,
        tebraOrderReference: `${tebraId}-ORDER`,
        orderingProvider: "Synthetic test prescriber",
        dose: 156,
        doseUnit: "mg",
        route: "IM",
        site: "Left deltoid",
        plannedOn: today,
        lastAdministrationAt: null,
        lastAdministrationOn: relativeDate(today, -28),
        timingCategory: "scheduled",
        timingPlan:
          "Synthetic verified maintenance order; review the prior documented injection and current patient findings.",
        nextDueOn: relativeDate(today, 28),
        clinicalContext: {
          phase: "maintenance",
          indication: "Synthetic maintenance scenario",
          schedule: { every: 4, unit: "weeks" },
          historySource:
            "Synthetic fixture MAR; all dates and findings are fictional",
          priorProduct: "Invega Sustenna",
          priorDose: "156 mg",
          linkedPlan: `${tebraId}-PLAN`,
        },
      }),
      command(),
    );
    if (!completed) continue;
    const reviewed = await repository.reviewInjection(
      draft.id,
      injectionReview.parse({
        expectedVersion: draft.version,
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
        allergyReview:
          "Synthetic fixture: no allergies reported during review.",
        clinicalReview:
          "Synthetic fixture: maintenance history, prior tolerability, and current order reviewed.",
        preparation:
          "Synthetic fixture: supplied syringe and kit preparation checked.",
        siteAssessment:
          "Synthetic fixture: left deltoid site assessed before administration.",
        vitals: {
          status: "recorded",
          bpSystolic: 118,
          bpDiastolic: 76,
          pulse: 72,
          temperatureC: null,
          oxygenSaturation: null,
          reason: null,
        },
        observationPlan: "Synthetic fixture observation plan verified.",
        assessment: {
          screening: getInjectionReviewChecks(product.name).map((check) => ({
            id: check.id,
            label: check.label,
            result: "no_concern",
            detail: "Synthetic fixture finding only",
          })),
          weightKg: 82,
          needle: "Synthetic fixture: supplied 23G × 1-inch needle",
          providerCommunication: null,
          education: [],
        },
      }),
      command(),
    );
    await repository.administerInjection(
      draft.id,
      injectionAdministration.parse({
        expectedVersion: reviewed.version,
        administeredAt: reviewed.review!.reviewedAt,
        administeredByName: "Clinical fixture operator",
        delivery: "complete",
        actualDose: 156,
        actualSite: "Left deltoid",
        actualRoute: "IM",
        issueAction: null,
        tolerance: "Synthetic fixture: no immediate reaction observed.",
        observation: "Synthetic fixture observation completed.",
        followUp: {
          instructions:
            "Confirm the provider-ordered return date with the test clinic.",
          educationProvided: [
            "Synthetic fixture: next appointment and when to call the clinic discussed.",
          ],
          observationMinutes: 15,
          observationOutcome: "completed",
          observationNote: "Synthetic fixture observation only.",
        },
      }),
      command(),
    );
  }
}

export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  if (!repository)
    throw new Error("The clinical component fixture has not loaded.");
  if (method === "GET" && path === "/overview")
    return (await repository.overview(fixtureActor)) as T;
  if (method === "GET" && path === "/injections")
    return (await repository.listInjections(fixtureActor)) as T;
  const c = { key: uuid.parse(key), actor: fixtureActor };
  if (method === "POST") {
    switch (path) {
      case "/injections":
        return (await repository.createInjection(
          injectionInput.parse(body),
          c,
        )) as T;
      case "/patients":
        return (await repository.createPatient(
          patientInput.parse(body),
          c,
        )) as T;
      case "/products":
        return (await repository.createProduct(
          productInput.parse(body),
          c,
        )) as T;
      case "/lots":
        return (await repository.createLot(lotInput.parse(body), c)) as T;
      case "/movements":
        return (await repository.postMovement(
          movementInput.parse(body),
          c,
        )) as T;
      case "/activities":
        return (await repository.createActivity(
          activityInput.parse(body),
          c,
        )) as T;
    }
  }
  const match =
    /^\/injections\/([^/]+)(?:\/(review|administer|disposition|amend|file))?$/.exec(
      path,
    );
  if (match) {
    const id = uuid.parse(match[1]);
    if (method === "PATCH" && !match[2])
      return (await repository.updateInjection(
        id,
        injectionUpdate.parse(body),
        c,
      )) as T;
    if (method === "POST")
      switch (match[2]) {
        case "review":
          return (await repository.reviewInjection(
            id,
            injectionReview.parse(body),
            c,
          )) as T;
        case "administer":
          return (await repository.administerInjection(
            id,
            injectionAdministration.parse(body),
            c,
          )) as T;
        case "disposition":
          return (await repository.dispositionInjection(
            id,
            injectionDisposition.parse(body),
            c,
          )) as T;
        case "amend":
          return (await repository.amendInjection(
            id,
            injectionAmendment.parse(body),
            c,
          )) as T;
        case "file":
          return (await repository.fileInjection(
            id,
            injectionFiling.parse(body),
            c,
          )) as T;
      }
  }
  const activity = /^\/activities\/([^/]+)$/.exec(path);
  if (method === "PATCH" && activity)
    return (await repository.updateActivity(
      uuid.parse(activity[1]),
      activityUpdate.parse(body),
      c,
    )) as T;
  throw new Error("Unsupported component fixture action.");
}
export const getOverview = () => request<Overview>("/overview");
export const getInjections = () => request<InjectionCase[]>("/injections");
