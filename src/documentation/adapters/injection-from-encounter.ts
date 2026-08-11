import {
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  injectionReasonLabel,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
} from "../../domain/injection";
import type { MedicationVerificationKey } from "../../domain/injection-catalog";
import type { ClinicalEvaluation } from "../../domain/contracts";
import {
  mapLegacyInitiationProtocol,
  type LegacyInitiationSnapshot,
} from "../../legacy/documentation-adapter";
import type { InjectionComponent, InjectionDocumentationInput } from "../types";

const trimmed = (value?: string): string => (value ?? "").trim();
const unique = (items: string[]): string[] => [...new Set(items.filter(Boolean))];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const formatIsoDate = (raw?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(raw));
  if (!match) return trimmed(raw);
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : trimmed(raw);
};

const formatMonth = (raw?: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed(raw));
  return match ? `${match[2]}/${match[1]}` : trimmed(raw);
};

const formatTime = (raw?: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed(raw));
  if (!match) return trimmed(raw);
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const formatDateTime = (raw?: string): string => {
  const [date = "", time = ""] = trimmed(raw).split("T");
  if (!date) return "";
  const dateLabel = formatIsoDate(date);
  const timeLabel = formatTime(time);
  return [dateLabel, timeLabel].filter(Boolean).join(" at ");
};

// Faithful port of legacy-runtime.js's <select> option value -> display-text
// pairs where the visible text is shorter than the stored value (documented
// only where they actually differ; all other option values are self-labeled).
const PREPARATION_LABELS: Record<string, string> = {
  "Preparation/reconstitution verified per current product instructions":
    "Verified per current product instructions",
};
const VOLUME_UNIT_LABELS: Record<string, string> = {
  mL: "mL (volume)",
  mg: "mg (dose amount)",
};

// Faithful port of documentation-adapter.ts's INJECTION_REVIEW_FACTS /
// INJECTION_PLAN_FACTS, keyed by the typed attestation/verification id
// instead of the legacy chip's rendered label text. Legacy's three
// optional ATTEST chips ("twoperson", "observe", "education") aren't part
// of the typed attestations union and have no entry here.
const ATTESTATION_ASSESSMENT_FACTS: Partial<
  Record<keyof InjectionEncounter["attestations"], string>
> = {
  id2: "Patient identity verified using two identifiers (full name and DOB).",
  rights:
    "Medication verified against the active order — right patient, drug, dose, route, time, and documentation.",
  allergy: "Allergy review completed as documented.",
  consent: "Consent for injection obtained and reaffirmed before administration.",
  prior: "Prior-dose response reviewed with the patient as documented.",
  screen: "Pre-injection contraindication and acute side-effect screen completed.",
};

const ATTESTATION_PLAN_FACTS: Partial<
  Record<keyof InjectionEncounter["attestations"], string>
> = {
  hygiene: "Hand hygiene performed; injection site cleansed with alcohol and allowed to dry.",
};

const VERIFICATION_ASSESSMENT_FACTS: Partial<Record<MedicationVerificationKey, string>> = {
  opioidFree:
    "Current opioid-risk screen and provider plan verified, including relevant opioid, buprenorphine, methadone, or tramadol exposure and current product contraindications.",
  naltrexHS:
    "Naltrexone/excipient hypersensitivity and hepatic-risk review verified against the active order and current product information.",
  resuspend: "Medication inspected and mixed/resuspended per product instructions.",
  invegaInit: "Active order and product-specific initiation / re-initiation plan verified.",
  oralOverlap:
    "Ordered oral aripiprazole initiation or overlap plan verified against the active order.",
  stabilized: "Prerequisite LAI stabilization reviewed before transition to the selected interval.",
  paliperidoneTolerability: "Paliperidone or risperidone tolerability reviewed when applicable.",
  aripiprazoleTolerability:
    "Aripiprazole tolerability and initiation / transition plan reviewed when applicable.",
};

const VERIFICATION_PLAN_FACTS: Partial<Record<MedicationVerificationKey, string>> = {
  suppliedNeedle:
    "Kit-supplied needle and body-habitus selection verified; ordered deep gluteal IM route/site documented.",
  glutealOnly: "Gluteal-only route requirement verified against the actual administration site.",
  noMassage: "Injection site was not massaged after administration per product instructions.",
  deepZtrack:
    "Ordered route, site, and product-specific technique verified against the actual administration.",
};

const documentedFacts = (
  encounter: InjectionEncounter,
): { assessment: string[]; plan: string[] } => {
  const assessment: string[] = [];
  const plan: string[] = [];
  (Object.keys(encounter.attestations) as Array<keyof InjectionEncounter["attestations"]>).forEach(
    (key) => {
      if (!encounter.attestations[key]) return;
      const planFact = ATTESTATION_PLAN_FACTS[key];
      if (planFact) {
        plan.push(planFact);
        return;
      }
      const fact = ATTESTATION_ASSESSMENT_FACTS[key];
      if (fact) assessment.push(fact);
    },
  );
  if (trimmed(encounter.allergies)) {
    const generic = ATTESTATION_ASSESSMENT_FACTS.allergy;
    const index = generic ? assessment.indexOf(generic) : -1;
    if (index >= 0) assessment.splice(index, 1);
  }
  (Object.keys(encounter.verifications) as MedicationVerificationKey[]).forEach((key) => {
    if (!encounter.verifications[key]) return;
    const planFact = VERIFICATION_PLAN_FACTS[key];
    if (planFact) {
      plan.push(planFact);
      return;
    }
    const fact = VERIFICATION_ASSESSMENT_FACTS[key];
    if (fact) assessment.push(fact);
  });
  if (trimmed(encounter.technique)) {
    plan.push(`Needle / technique: ${trimmed(encounter.technique)}`);
  }
  return { assessment: unique(assessment), plan: unique(plan) };
};

const responseFact = (encounter: InjectionEncounter): string => {
  const custom = trimmed(encounter.response.custom);
  if (custom) return custom;
  const option = INJECTION_RESPONSE_OPTIONS.find((item) => item.key === encounter.response.kind);
  return option?.label ?? "";
};

const primaryMedicationComponent = (
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  administered: boolean,
): InjectionComponent | undefined => {
  const medication =
    encounter.medicationKey === "other"
      ? trimmed(encounter.customMedication) || "Other"
      : evaluation.output.medication?.label ?? "";
  const dose = trimmed(encounter.dose);
  const route = trimmed(encounter.route);
  const site = trimmed(encounter.site);
  const details = encounter.details ?? {};
  const hasProduct = Boolean(
    medication ||
      dose ||
      route ||
      site ||
      encounter.traceability.ndc.trim() ||
      encounter.traceability.lot.trim() ||
      encounter.traceability.expiration.trim(),
  );
  if (!hasProduct) return undefined;

  const device =
    details.device === "Other" ? trimmed(details.deviceOther) : trimmed(details.device);
  const siteCondition =
    details.siteCondition === "Other"
      ? trimmed(details.siteConditionOther)
      : trimmed(details.siteCondition);
  const volumeUnitLabel = details.volumeUnit
    ? VOLUME_UNIT_LABELS[details.volumeUnit] ?? details.volumeUnit
    : "";
  const amount = [trimmed(details.volume), volumeUnitLabel].filter(Boolean).join(" ");

  return {
    label: "Injection component 1",
    medication: medication || undefined,
    dose: dose || undefined,
    route: route || undefined,
    site: site || undefined,
    administrationDate:
      administered && encounter.administrationDate
        ? formatIsoDate(encounter.administrationDate)
        : undefined,
    administrationTime:
      administered && encounter.administrationTime
        ? formatTime(encounter.administrationTime)
        : undefined,
    administeredBy: administered ? trimmed(encounter.administeredBy) || undefined : undefined,
    amount: administered && amount ? amount : undefined,
    device: administered && device ? device : undefined,
    siteCondition: administered && siteCondition ? siteCondition : undefined,
    response: administered ? responseFact(encounter) || undefined : undefined,
    ndc: trimmed(encounter.traceability.ndc) || undefined,
    lot: trimmed(encounter.traceability.lot) || undefined,
    expiration: formatMonth(encounter.traceability.expiration) || undefined,
  };
};

const initiationSnapshotFrom = (
  encounter: InjectionEncounter,
): LegacyInitiationSnapshot | undefined => {
  const initiation = encounter.initiation;
  if (!initiation?.protocol) return undefined;
  return {
    protocol: initiation.protocol,
    planVerified: initiation.planVerified,
    oralStatus: initiation.oralStatus,
    providerNote: initiation.providerNote,
    sustennaOrder: initiation.sustennaOrder,
    day1Date: initiation.day1Date,
    second: {
      dose: initiation.second.dose,
      site: initiation.second.site,
      ndc: initiation.second.ndc,
      lot: initiation.second.lot,
      exp: initiation.second.expiration,
      given: initiation.second.given,
      orderVerified: initiation.second.orderVerified,
      note: initiation.second.note,
    },
  };
};

/**
 * Pure, DOM-free equivalent of legacy/documentation-adapter.ts's
 * readLegacyInjectionDocumentation(), for a panel bound directly to a typed
 * InjectionEncounter instead of the legacy DOM. Reuses
 * mapLegacyInitiationProtocol() directly rather than re-deriving its
 * paired-dose/Sustenna-window logic, since that function is already pure
 * and DOM-free.
 */
export function injectionEncounterToDocumentationInput(
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
): InjectionDocumentationInput | null {
  const dispositionKind = encounter.disposition.kind;
  if (!dispositionKind) return null;

  const administered = dispositionKind === "administered";
  if (administered && !evaluation.output.administrationDocumented) return null;

  const disposition = administered
    ? { kind: "administered" as const, label: "Administered" }
    : {
        kind: (dispositionKind === "provider" ? "provider-directed" : dispositionKind) as
          | "held"
          | "escalated"
          | "provider-directed",
        label:
          dispositionKind === "held"
            ? "Held"
            : dispositionKind === "escalated"
              ? "Escalated"
              : "Provider-directed plan",
        notified: trimmed(encounter.disposition.provider) || undefined,
        decisionTime: formatDateTime(encounter.disposition.time) || undefined,
        direction: trimmed(encounter.disposition.outcome) || undefined,
      };

  const primary = primaryMedicationComponent(encounter, evaluation, administered);

  // A legacy draft can retain an old initiation payload after staff switch
  // the visit back to routine maintenance. The evaluator has already decided
  // that those controls are not applicable, so do not mirror that stale
  // payload into a new clinical note or create a phantom second component.
  const initiationSnapshot =
    evaluation.output.phase === "initiation" || evaluation.output.phase === "reinitiation"
      ? initiationSnapshotFrom(encounter)
      : undefined;
  const primaryMedicationName =
    encounter.medicationKey === "other"
      ? trimmed(encounter.customMedication) || "Other"
      : evaluation.output.medication?.label ?? "";
  const initiation = mapLegacyInitiationProtocol(
    initiationSnapshot,
    primaryMedicationName,
    encounter.administrationDate,
    encounter.secondAdministrationTime ?? "",
  );

  const components = [primary, initiation.secondComponent].filter(
    (component): component is InjectionComponent => Boolean(component),
  );
  if (components.length > 1 && components[0]) {
    components[0] = { ...components[0], label: "Injection component 1" };
  } else if (components[0]) {
    components[0] = { ...components[0], label: undefined };
  }

  const visitType = injectionReasonLabel(encounter.reason);
  const medicationLine = [primaryMedicationName, trimmed(encounter.dose)]
    .filter(Boolean)
    .join(" ");
  const summary = administered
    ? `Injection visit — ${medicationLine || "medication administration"}.`
    : `Injection visit — ${medicationLine || "selected medication"}; medication not administered.`;

  const facts = documentedFacts(encounter);
  const reviewItems = unique([
    ...facts.assessment,
    ...(encounter.acuteSafetyScreenConfirmed ? ["No acute concerns today confirmed."] : []),
  ]);
  const activeSafetyConcerns = new Set(encounter.activeSafetyConcerns ?? []);
  const clinicianAttention = unique(
    INJECTION_SAFETY_TRIGGERS.filter((trigger) => activeSafetyConcerns.has(trigger.key)).map(
      (trigger) => trigger.label,
    ),
  );

  const details = encounter.details ?? {};
  const productSource =
    details.productSource === "Other"
      ? trimmed(details.productSourceOther)
      : trimmed(details.productSource);
  const preparation =
    details.preparation === "Other"
      ? trimmed(details.preparationOther)
      : details.preparation
        ? PREPARATION_LABELS[details.preparation] ?? details.preparation
        : "";
  const waste = details.waste ? trimmed(details.wasteAmount) : "";
  const wasteWitness = details.waste ? trimmed(details.wasteWitness) : "";
  const hasIssue = Boolean(details.productIssue);
  const hasException = Boolean(details.administrationException);
  const lateDoseReviewText =
    details.lateDoseReview === "provider-authorized"
      ? "Late-dose review: reviewed with provider, administration authorized."
      : details.lateDoseReview === "other"
        ? `Late-dose review: ${trimmed(details.lateDoseReviewNote) || "other"}.`
        : "";

  return {
    chiefComplaint: {
      summary,
      visitType: visitType || undefined,
      purpose: trimmed(details.purpose) || undefined,
      encounterDate: encounter.administrationDate
        ? formatIsoDate(encounter.administrationDate)
        : undefined,
    },
    disposition,
    preAdministration: {
      orderPurpose: trimmed(details.purpose) || undefined,
      allergiesReview: trimmed(encounter.allergies) || undefined,
      previousDoseDate: encounter.priorDoseDate ? formatIsoDate(encounter.priorDoseDate) : undefined,
      previousSite: trimmed(encounter.priorSite) || undefined,
      timingReview: encounter.priorDoseDate
        ? [evaluation.output.timing.message, lateDoseReviewText].filter(Boolean).join(" ") ||
          undefined
        : undefined,
      vitals: {
        bloodPressure: trimmed(encounter.vitals?.bp) || undefined,
        heartRate: trimmed(encounter.vitals?.hr) || undefined,
        temperature: trimmed(encounter.vitals?.temperature) || undefined,
      },
      reviewItems: reviewItems.length ? reviewItems : undefined,
      clinicianAttention: clinicianAttention.length ? clinicianAttention : undefined,
    },
    components: components.length ? components : undefined,
    initiation: initiation.protocol,
    handling: {
      source: productSource || undefined,
      preparation: preparation || undefined,
      waste: waste || undefined,
      wasteWitness: wasteWitness || undefined,
      productIssue: hasIssue ? trimmed(details.productIssueDetail) || undefined : undefined,
      productIssueAction: hasIssue ? trimmed(details.productIssueAction) || undefined : undefined,
      productIssueNotified: hasIssue ? trimmed(details.productIssueRecipient) || undefined : undefined,
      productIssueNotificationTime: hasIssue
        ? formatDateTime(details.productIssueNotificationTime) || undefined
        : undefined,
      productIssueDirection: hasIssue ? trimmed(details.productIssueDirection) || undefined : undefined,
      productIssueNextStep: hasIssue ? trimmed(details.productIssueNextStep) || undefined : undefined,
    },
    exception: hasException
      ? {
          summary: trimmed(details.exceptionSummary) || undefined,
          notified: trimmed(details.exceptionRecipient) || undefined,
          notificationTime: formatDateTime(details.exceptionTime) || undefined,
          direction: trimmed(details.exceptionOutcome) || undefined,
        }
      : undefined,
    followUp: {
      nextDoseDate: encounter.nextDoseDate ? formatIsoDate(encounter.nextDoseDate) : undefined,
      orderingProvider: trimmed(encounter.orderingProvider) || undefined,
    },
  };
}
