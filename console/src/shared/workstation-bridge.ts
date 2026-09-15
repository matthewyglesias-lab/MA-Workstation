import type { Patient, Product } from "./contracts.js";
import type { InjectionCase, InjectionInput } from "./injections.js";
import { getInjectionReference } from "./injection-catalog.js";
import {
  emptyWorkstationState,
  type WorkstationState,
  WORKSTATION_ENGINE_VERSION,
} from "./workstation-contracts.js";
import {
  emptyInjectionEncounter,
  type InjectionEncounter,
} from "./workstation/domain/injection.js";
import type {
  InjectionMedicationKey,
  InjectionIntervalKey,
} from "./workstation/domain/injection-catalog.js";
import { evaluateWorkstationClinical } from "./workstation-clinical-policy.js";

const medicationKeys: Record<string, InjectionMedicationKey> = {
  "Aristada Initio": "initio",
  Aristada: "aristada",
  "Invega Sustenna": "sustenna",
  "Invega Trinza": "trinza",
  "Invega Hafyera": "hafyera",
  Erzofri: "erzofri",
  "Abilify Maintena": "maintena",
  "Abilify Asimtufii": "asimtufii",
  Uzedy: "uzedy",
  Vivitrol: "vivitrol",
  "Haloperidol decanoate": "haldol",
  "Fluphenazine decanoate": "prolixin",
};
/** Matches the verified formulary name once. Ambiguous and unsupported names
 * never inherit another product's engine or bypass the general review. */
export function resolveWorkstationMedication(
  productName: string,
): InjectionMedicationKey | undefined {
  const reference = getInjectionReference(productName);
  return reference ? medicationKeys[reference.name] : undefined;
}
export function workstationOrderForRecord(
  record: InjectionCase,
): InjectionInput {
  return (
    record.administration?.orderSnapshot ??
    record.disposition?.orderSnapshot ??
    record
  );
}
export function workstationStateForRecord(
  record: InjectionCase,
): WorkstationState | undefined {
  return (
    record.administration?.workstation ??
    record.administration?.reviewSnapshot.workstation ??
    record.disposition?.reviewSnapshot?.workstation ??
    record.review?.workstation ??
    workstationOrderForRecord(record).workstation
  );
}
export function hasCurrentWorkstationReview(record: InjectionCase): boolean {
  return (
    !!record.review?.workstation &&
    record.review.engineVersion === WORKSTATION_ENGINE_VERSION
  );
}
export function workstationLocalDate(
  instant: string,
  timezone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const p = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}
function localTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}
export function canonicalWorkstationSite(site: string): string {
  return site
    .trim()
    .replace(/^Right\b/i, "R")
    .replace(/^Left\b/i, "L")
    .replace(/\(SC\)/gi, "(SubQ)");
}
function orderReason(
  order: InjectionInput,
  state: WorkstationState,
): InjectionEncounter["reason"] {
  const phase = order.clinicalContext?.phase;
  if (phase === "maintenance")
    return state.reason === "prn" ? "prn" : "scheduled";
  if (phase === "restart") return "reinit";
  if (phase === "day_1" || phase === "day_8") return "loading";
  if (phase === "initiation" || phase === "switching") return "initiation";
  if (order.timingCategory === "scheduled") return "scheduled";
  if (order.timingCategory === "initiation") return "initiation";
  if (order.timingCategory === "late_or_missed")
    return state.reason === "reinit" ? "reinit" : "scheduled";
  return "";
}
export function workstationIntervalForOrder(
  order: InjectionInput,
): InjectionIntervalKey | "" {
  const schedule = order.clinicalContext?.schedule;
  if (!schedule) return order.workstation?.intervalKey ?? "";
  const values: Record<string, InjectionIntervalKey> = {
    "days:7": "q1wk",
    "days:14": "q2wk",
    "days:21": "q3wk",
    "days:28": "q4wk",
    "days:42": "q6wk",
    "days:56": "q8wk",
    "days:84": "q12wk",
    "days:182": "q26wk",
    "weeks:1": "q1wk",
    "weeks:2": "q2wk",
    "weeks:3": "q3wk",
    "weeks:4": "q4wk",
    "weeks:6": "q6wk",
    "weeks:8": "q8wk",
    "weeks:12": "q12wk",
    "weeks:26": "q26wk",
    "months:1": "q4wk",
    "months:2": "q8wk",
    "months:3": "q12wk",
    "months:6": "q26wk",
  };
  return values[`${schedule.unit}:${schedule.every}`] ?? "";
}
export const pairedProtocols = new Set([
  "maintena-1day",
  "asimtufii-1day",
  "aristada-initio-sameday",
]);
export function expectedPairedProduct(
  protocol: string,
  primary: InjectionMedicationKey | undefined,
): InjectionMedicationKey | undefined {
  if (protocol === "maintena-1day" && primary === "maintena") return "maintena";
  if (protocol === "asimtufii-1day" && primary === "asimtufii")
    return "maintena";
  if (protocol === "aristada-initio-sameday")
    return primary === "aristada"
      ? "initio"
      : primary === "initio"
        ? "aristada"
        : undefined;
}
/** Project canonical snapshots onto the exact original engine/document contract.
 * No default allergy status, normal response, verification, or second dose is
 * manufactured by this adapter. */
export function buildWorkstationEncounter(
  record: InjectionCase,
  patient?: Patient,
  product?: Product,
  timezone = "America/Los_Angeles",
  pairedCase?: InjectionCase,
): InjectionEncounter {
  const order = workstationOrderForRecord(record);
  const administration = record.administration;
  const review =
    administration?.reviewSnapshot ??
    record.disposition?.reviewSnapshot ??
    record.review;
  const person = review?.patientSnapshot ?? patient;
  const medication = review?.productSnapshot ?? product;
  const state = structuredClone(
    workstationStateForRecord(record) ?? emptyWorkstationState(),
  );
  const encounter = emptyInjectionEncounter();
  const at = administration?.administeredAt;
  const details = { ...state.details };
  // Stock ownership is a ledger fact, not an independent free-text claim.
  if (review)
    details.productSource =
      review.lotSnapshot.ownership === "sample"
        ? "Sample"
        : review.lotSnapshot.ownership === "patient"
          ? "Patient supplied"
          : "Clinic stock";
  if (details.nextDose?.value !== order.nextDueOn) delete details.nextDose;
  if (details.ndcSelection?.primary?.ndc !== medication?.ndc)
    delete details.ndcSelection;
  Object.assign(encounter, {
    patient: { name: person?.displayName ?? "", dob: person?.dob ?? "" },
    medicationKey:
      resolveWorkstationMedication(medication?.name ?? "") ?? "other",
    customMedication: medication?.name ?? "",
    dose: `${administration ? (administration.actualDose === null ? "Amount unknown" : administration.actualDose) : order.dose} ${order.doseUnit}`,
    route:
      (administration ? administration.actualRoute : order.route) === "SC"
        ? "SubQ"
        : administration
          ? (administration.actualRoute ?? "")
          : order.route,
    site: canonicalWorkstationSite(
      administration ? (administration.actualSite ?? "") : order.site,
    ),
    intervalKey: workstationIntervalForOrder(order) || state.intervalKey,
    reason: orderReason(order, state),
    priorDoseDate:
      order.lastAdministrationOn ??
      (order.lastAdministrationAt
        ? workstationLocalDate(order.lastAdministrationAt, timezone)
        : ""),
    priorSite: canonicalWorkstationSite(state.priorSite),
    administrationDate: at
      ? workstationLocalDate(at, timezone)
      : order.plannedOn,
    nextDoseDate: order.nextDueOn ?? "",
    orderingProvider: order.orderingProvider,
    administeredBy: administration?.administeredByName ?? "",
    administrationTime: at ? localTime(at, timezone) : "",
    secondAdministrationTime: "",
    allergies: review?.allergyReview ?? "",
    technique: state.technique,
    habitus: state.habitus,
    traceability: {
      ndc: medication?.ndc ?? "",
      lot: review?.lotSnapshot.lotNumber ?? "",
      expiration: review?.lotSnapshot.expiresOn.slice(0, 7) ?? "",
    },
    response: administration
      ? state.response.kind
        ? state.response
        : { kind: "custom", custom: administration.tolerance }
      : { kind: "" },
    attestations: { ...state.attestations },
    verifications: { ...state.verifications },
    acuteSafetyScreenConfirmed: state.acuteSafetyScreenConfirmed,
    activeSafetyConcerns: [...state.activeSafetyConcerns],
    initiation: state.initiation,
    details,
    disposition: administration
      ? {
          kind: "administered",
          reviewedBy: administration.actorId,
          reviewedAt: administration.recordedAt,
          ...(administration.engineReviewFingerprint
            ? { reviewFingerprint: administration.engineReviewFingerprint }
            : {}),
        }
      : record.disposition
        ? {
            kind: "held",
            provider: review?.assessment?.providerCommunication?.provider ?? "",
            time: localTime(record.disposition.at, timezone),
            outcome: record.disposition.reason,
          }
        : { kind: "" },
    vitals: review
      ? {
          ...(review.vitals.bpSystolic !== null &&
          review.vitals.bpDiastolic !== null
            ? { bp: `${review.vitals.bpSystolic}/${review.vitals.bpDiastolic}` }
            : {}),
          ...(review.vitals.pulse !== null
            ? { hr: String(review.vitals.pulse) }
            : {}),
          ...(review.vitals.temperatureC !== null
            ? { temperature: `${review.vitals.temperatureC} C` }
            : {}),
          ...(review.vitals.oxygenSaturation !== null
            ? { spo2: String(review.vitals.oxygenSaturation) }
            : {}),
          ...(review.assessment?.weightKg
            ? {
                weight: String(review.assessment.weightKg),
                weightUnit: "kg" as const,
              }
            : {}),
        }
      : {},
  });
  // Raw component-2 entries are only a draft plan. Ledger snapshots determine
  // whether another injection actually occurred and its exact traceability.
  if (encounter.initiation) encounter.initiation.second.given = false;
  const frozenPair =
    administration?.pairedCaseSnapshot ?? review?.pairedCaseSnapshot;
  const pair = administration ? frozenPair : (pairedCase ?? frozenPair);
  if (
    pair &&
    pair.id === state.pairedCaseId &&
    pair.id !== record.id &&
    pair.patientId === order.patientId &&
    pair.plannedOn === order.plannedOn
  ) {
    const pa = pair.administration;
    const pr = pa?.reviewSnapshot ?? pair.review;
    const po = pa?.orderSnapshot ?? pair;
    if (encounter.initiation) {
      encounter.initiation.second = {
        ...(pr
          ? {
              productKey: resolveWorkstationMedication(pr.productSnapshot.name),
            }
          : {}),
        dose: `${pa ? (pa.actualDose === null ? "Amount unknown" : pa.actualDose) : po.dose} ${po.doseUnit}`,
        site: canonicalWorkstationSite(pa?.actualSite ?? po.site),
        ndc: pr?.productSnapshot.ndc ?? "",
        lot: pr?.lotSnapshot.lotNumber ?? "",
        expiration: pr?.lotSnapshot.expiresOn.slice(0, 7) ?? "",
        given: !!pa && pa.delivery === "complete" && !!pa.stockMovementId,
        orderVerified: !!pr,
        note: pa
          ? `Recorded injection ${pair.id}; stock movement ${pa.stockMovementId}.`
          : `Linked injection ${pair.id} remains pending.`,
      };
      if (pa)
        encounter.secondAdministrationTime = localTime(
          pa.administeredAt,
          timezone,
        );
    }
  }
  return encounter;
}
export function evaluateWorkstationInjection(
  record: InjectionCase,
  patient?: Patient,
  product?: Product,
  timezone = "America/Los_Angeles",
  pairedCase?: InjectionCase,
) {
  const encounter = buildWorkstationEncounter(
    record,
    patient,
    product,
    timezone,
    pairedCase,
  );
  const order = workstationOrderForRecord(record);
  return evaluateWorkstationClinical(encounter, {
    today: encounter.administrationDate,
    indication: order.clinicalContext?.indication ?? undefined,
    doseSequence: order.doseSequence,
    priorMaintenanceDoses:
      workstationStateForRecord(record)?.priorMaintenanceDoses,
    priorDose: order.clinicalContext?.priorDose,
    priorProduct: order.clinicalContext?.priorProduct,
  });
}
