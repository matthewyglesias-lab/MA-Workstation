import {
  INJECTION_DEPARTURE_STATUS_OPTIONS,
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  hasCurrentLateDoseReview,
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
import type { InjectionComponent, InjectionDocumentationInput, InjectionNoteFacts } from "../types";

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

const lateDoseReviewDocumentationText = (
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  encounter: InjectionEncounter,
): string => {
  if (!evaluation.output.lateDoseWarning || !hasCurrentLateDoseReview(encounter)) {
    return "";
  }
  const details = encounter.details ?? {};
  if (details.lateDoseReview === "provider-authorized") {
    const provider = trimmed(details.lateDoseReviewProvider);
    const decisionTime = formatDateTime(details.lateDoseReviewTime);
    const direction = trimmed(details.lateDoseReviewNote);
    return [
      `Provider approval documented: ${provider}`,
      decisionTime ? `decision ${decisionTime}` : "",
      direction ? `direction: ${direction}` : "",
    ]
      .filter(Boolean)
      .join("; ") + ".";
  }
  return `Late-dose review documented: ${trimmed(details.lateDoseReviewNote)} (does not state provider approval).`;
};

// Compact military-style charting (RC6.1 note format): "8/7/26 1750" for a
// date + separate HH:MM field, and "8/7/26" alone when only the date exists.
// Used everywhere administration date/time appears in the generated note so
// the CC headline, Date/time line, and any other reference stay consistent.
const formatCompactDate = (raw?: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed(raw));
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}/${(match[1] ?? "").slice(2)}`;
};

const formatMilitaryTime = (raw?: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed(raw));
  if (!match) return "";
  return `${(match[1] ?? "").padStart(2, "0")}${match[2]}`;
};

const formatCompactDateTime = (date?: string, time?: string): string =>
  [formatCompactDate(date), formatMilitaryTime(time)].filter(Boolean).join(" ");

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

// RC6.1 compact note wording for the core verification/clinical-review
// attestations - deliberately distinct from ATTESTATION_ASSESSMENT_FACTS
// above (which stays as the source for the legacy verbose block format).
// "hygiene" is not here: it gets its own Aseptic technique line.
const VERIFICATION_NOTE_TEXT: Partial<
  Record<keyof InjectionEncounter["attestations"], string>
> = {
  id2: "Pt identity verified using two identifiers (full name & DOB).",
  rights: "Med verified against active order — right pt, drug, dose, route, time, and documentation.",
  consent: "Consent for injection obtained and reaffirmed before administration.",
};

const CLINICAL_REVIEW_NOTE_TEXT: Partial<
  Record<keyof InjectionEncounter["attestations"], string>
> = {
  prior: "Prior dose tolerated well per pt report; no new or unresolved s/e.",
  screen: "No acute s/e or contraindications to administration noted on pre-inj screening.",
};

const RESPONSE_NOTE_TEXT: Partial<Record<Exclude<InjectionEncounter["response"]["kind"], "">, string>> = {
  well: "Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.",
  bleed: "Minor bleeding noted post-inj; controlled w/ pressure. No persistent bleeding or significant swelling.",
  disc: "Mild transient site discomfort reported; no acute reaction noted.",
};

// Fixed clinical read order, independent of which order staff happened to
// tap the attestation checkboxes in - the same encounter must produce the
// same note wording regardless of click order. Matches
// INJECTION_ATTESTATION_OPTIONS's order.
const ATTESTATION_NOTE_ORDER: ReadonlyArray<keyof InjectionEncounter["attestations"]> = [
  "id2",
  "rights",
  "allergy",
  "consent",
  "prior",
  "screen",
  "hygiene",
];

/** Compact verification / clinical-review sentences for the RC6.1 note
 * format. Medication-specific verification facts (opioid screen, resuspend,
 * Invega initiation plan, etc.) are preserved from the existing catalog and
 * folded into Clinical review rather than dropped. */
const compactReviewFacts = (
  encounter: InjectionEncounter,
): { verification: string; clinicalReview: string } => {
  const verification: string[] = [];
  const clinicalReview: string[] = [];
  ATTESTATION_NOTE_ORDER.forEach(
    (key) => {
      if (!encounter.attestations[key]) return;
      const verificationText = VERIFICATION_NOTE_TEXT[key];
      if (verificationText) verification.push(verificationText);
      const reviewText = CLINICAL_REVIEW_NOTE_TEXT[key];
      if (reviewText) clinicalReview.push(reviewText);
    },
  );
  if (encounter.attestations.allergy) {
    const allergies = trimmed(encounter.allergies);
    if (allergies) verification.push(`Allergies reviewed — ${allergies}.`);
  }
  (Object.keys(encounter.verifications) as MedicationVerificationKey[]).forEach((key) => {
    if (!encounter.verifications[key]) return;
    const fact = VERIFICATION_ASSESSMENT_FACTS[key];
    if (fact) clinicalReview.push(fact);
  });
  const vitals = formatVitalsLine(encounter);
  if (vitals) clinicalReview.push(vitals);
  return {
    verification: unique(verification).join(" "),
    clinicalReview: unique(clinicalReview).join(" "),
  };
};

const formatVitalsLine = (encounter: InjectionEncounter): string => {
  const vitals = encounter.vitals;
  if (!vitals) return "";
  const parts = [
    vitals.bp ? `BP ${trimmed(vitals.bp)}` : "",
    vitals.hr ? `HR ${trimmed(vitals.hr)}` : "",
    vitals.temperature ? `Temp ${trimmed(vitals.temperature)}` : "",
  ].filter(Boolean);
  return parts.length ? `Vitals: ${parts.join(" · ")}.` : "";
};

/** Compact Timing sentence. Never states an interval as acceptable unless
 * the engine's own timing evaluation already reached that conclusion -
 * this only re-words `timing`/`phase`, it does not re-derive the judgment.
 * A late dose (routine window or the Sustenna Day 8 window) carries the
 * structured review only when it is complete and still bound to the current
 * timing facts; stale approval must never leak into a generated note. */
const timingNoteText = (
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  encounter: InjectionEncounter,
): string => {
  const timing = evaluation.output.timing;
  const phase = evaluation.output.phase;
  const reviewDocumentation = lateDoseReviewDocumentationText(evaluation, encounter);
  const lateDoseReviewText = reviewDocumentation ? ` ${reviewDocumentation}` : "";
  if (timing.state === "idle") {
    if (!evaluation.output.lateDoseWarning) return "";
    // The Sustenna Day 8 window check runs independently of the routine
    // interval evaluator above (there is no prior-dose day count during
    // initiation), so its own warning message is the only source for what
    // was actually out of window - never invent day-count wording for it.
    const sustennaMessage = evaluation.warnings.find(
      (item) => item.code === "initiation.sustenna.outside-window",
    )?.message;
    return sustennaMessage ? `${sustennaMessage}${lateDoseReviewText}` : "";
  }
  if (timing.cadenceLabel === "one-time") {
    return "One-time initiation/loading dose; routine interval spacing does not apply.";
  }
  const days = timing.daysSincePrior;
  const daysPhrase = days === null ? "" : `${days} day${days === 1 ? "" : "s"} since prior inj`;
  if (timing.state === "ok") {
    // The actual prior-dose -> administration span, not the theoretical
    // permitted window - a chart reviewer wants to see what happened, and
    // "within expected maintenance interval" already says it was on time.
    const range =
      encounter.priorDoseDate && encounter.administrationDate
        ? ` (${formatCompactDate(encounter.priorDoseDate)}–${formatCompactDate(encounter.administrationDate)})`
        : "";
    return `${daysPhrase || "Timing reviewed"}${range}; within expected maintenance interval.`;
  }
  if (timing.late) {
    return `${daysPhrase || "Timing reviewed"}; outside routine maintenance interval. Med-specific missed-dose guidance reviewed.${lateDoseReviewText}`;
  }
  if (timing.relativeToExpected) {
    const cadencePosition =
      timing.relativeToExpected === "on"
        ? "matched the calculated expected cadence date"
        : "was before the calculated expected cadence date";
    return `${daysPhrase || "Timing reviewed"}; administration date ${cadencePosition}. Active-order timing reviewed.`;
  }
  const reinit = phase === "reinitiation" ? "Re-initiation interval" : "Interval";
  return daysPhrase
    ? `${daysPhrase}; ${reinit.toLowerCase()} reviewed per med-specific guidance.`
    : `${reinit} reviewed per med-specific guidance.`;
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

const PHASE_HEADLINE_WORD: Record<InjectionEvaluationOutput["phase"], string> = {
  maintenance: "Scheduled",
  initiation: "Initiation",
  reinitiation: "Re-initiation",
  loading: "Loading dose",
  prn: "PRN",
};

const PHASE_PRESENTATION_TEXT: Record<InjectionEvaluationOutput["phase"], string> = {
  maintenance: "Pt presents today for scheduled LAI administration.",
  initiation: "Pt presents today for LAI initiation.",
  reinitiation: "Pt presents today for LAI re-initiation.",
  loading: "Pt presents today for a loading dose.",
  prn: "Pt presents today for a provider-ordered injection.",
};

const headlineResponseText = (encounter: InjectionEncounter): string => {
  const custom = trimmed(encounter.response.custom);
  if (custom) return custom;
  const label = INJECTION_RESPONSE_OPTIONS.find((item) => item.key === encounter.response.kind)?.label;
  return label ? label.charAt(0).toLowerCase() + label.slice(1) : "";
};

/** CC headline + presentation sentence for a completed administration. */
const headlineAndPresentation = (
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  medicationLabel: string,
): { headline: string; presentation: string } => {
  const phase = evaluation.output.phase;
  const isCatalogProduct = encounter.medicationKey !== "other" && encounter.medicationKey !== "";
  const kindWord = isCatalogProduct
    ? `${PHASE_HEADLINE_WORD[phase]} LAI`
    : phase === "maintenance"
      ? "Scheduled injection"
      : `${PHASE_HEADLINE_WORD[phase]} injection`;
  const productLine = [medicationLabel, trimmed(encounter.dose), trimmed(encounter.route)]
    .filter(Boolean)
    .join(" ");
  const site = trimmed(encounter.site);
  const response = headlineResponseText(encounter);
  const nextDose = encounter.nextDoseDate ? formatCompactDate(encounter.nextDoseDate) : "";
  const headline = `${kindWord}${productLine ? ` — ${productLine}` : ""}${site ? `, ${site}` : ""}${
    response ? `; ${response}` : ""
  }${nextDose ? `; next due ${nextDose}` : ""}.`;
  return { headline, presentation: PHASE_PRESENTATION_TEXT[phase] };
};

const componentTraceabilitySummary = (
  ndc?: string,
  lot?: string,
  expiration?: string,
): string => {
  const parts = [
    trimmed(ndc) && `NDC ${trimmed(ndc)}`,
    trimmed(lot) && `Lot ${trimmed(lot)}`,
    formatMonth(expiration) && `Exp ${formatMonth(expiration)}`,
  ].filter(Boolean);
  return parts.join(" · ");
};

/** A paired-injection protocol (Maintena/Asimtufii 1-day, Aristada INITIO
 * same-day) physically administers two products - the compact note still
 * has to carry both products' lot/NDC/expiration for traceability, not just
 * the primary component's, even though it stays a single terse line. */
const traceabilityLine = (
  encounter: InjectionEncounter,
  secondComponent?: InjectionComponent,
): string => {
  const primary = componentTraceabilitySummary(
    encounter.traceability.ndc,
    encounter.traceability.lot,
    encounter.traceability.expiration,
  );
  const secondSummary = secondComponent
    ? componentTraceabilitySummary(
        secondComponent.ndc,
        secondComponent.lot,
        secondComponent.expiration,
      )
    : "";
  if (!secondSummary) return primary;
  return [primary, `Component 2 — ${secondSummary}`].filter(Boolean).join(". ");
};

const followUpLine = (encounter: InjectionEncounter): string => {
  const details = encounter.details ?? {};
  const nextDose = encounter.nextDoseDate ? formatCompactDate(encounter.nextDoseDate) : "";
  const nextDueText = nextDose ? `Next dose due ${nextDose}.` : "";
  if (!details.educationProvided) return nextDueText;
  const eduText =
    "Post-inj education provided re: expected effects, s/e to report, and adherence to next dose.";
  return [eduText, nextDueText].filter(Boolean).join(" ");
};

/** Preserves custom response text as-is rather than prefixing it with a
 * "tolerated well" framing that might not be accurate for what was typed. */
const responseNoteText = (encounter: InjectionEncounter): string => {
  if (encounter.response.kind === "custom") return trimmed(encounter.response.custom);
  if (!encounter.response.kind) return "";
  return RESPONSE_NOTE_TEXT[encounter.response.kind] ?? "";
};

const departureStatusLine = (encounter: InjectionEncounter): string => {
  const details = encounter.details ?? {};
  if (!details.departureStatus) return "";
  if (details.departureStatus === "custom") return trimmed(details.departureStatusNote);
  return (
    INJECTION_DEPARTURE_STATUS_OPTIONS.find((option) => option.key === details.departureStatus)?.note ?? ""
  );
};

/** Compact RC6.1 note facts for a completed administration. Every field is
 * optional and hidden downstream when empty - a one-tap control left
 * untouched produces no label in the note at all. */
const buildInjectionNoteFacts = (
  encounter: InjectionEncounter,
  evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  medicationLabel: string,
  secondComponent?: InjectionComponent,
): InjectionNoteFacts => {
  const details = encounter.details ?? {};
  const { verification, clinicalReview } = compactReviewFacts(encounter);
  const { headline, presentation } = headlineAndPresentation(encounter, evaluation, medicationLabel);
  const asepticSentence = encounter.attestations.hygiene
    ? "Hand hygiene performed; inj site cleansed w/ alcohol and allowed to dry prior to administration."
    : "";
  const administrationLine = [medicationLabel, trimmed(encounter.dose), trimmed(encounter.route)]
    .filter(Boolean)
    .join(" ");
  const primaryAdministration = administrationLine
    ? `${administrationLine} administered to ${trimmed(encounter.site) || "the documented site"}${
        encounter.attestations.hygiene ? " using aseptic technique" : ""
      }.`
    : "";
  // A paired-injection protocol physically administers a second product at a
  // separate site - the note has to say where, not just that a second
  // component happened, matching the level of detail the primary sentence
  // gets.
  const secondAdministrationLine = [
    trimmed(secondComponent?.medication),
    trimmed(secondComponent?.dose),
    trimmed(secondComponent?.route) || "IM",
  ]
    .filter(Boolean)
    .join(" ");
  const secondAdministration =
    secondComponent && secondAdministrationLine && trimmed(secondComponent.site)
      ? `Component 2 — ${secondAdministrationLine} administered to ${trimmed(secondComponent.site)}.`
      : "";
  const administration = [primaryAdministration, secondAdministration].filter(Boolean).join(" ");

  return {
    headline,
    presentation,
    verification: verification || undefined,
    clinicalReview: clinicalReview || undefined,
    siteAssessment: details.siteAssessed
      ? "Inj site assessed prior to administration; no local finding precluding use of selected site."
      : undefined,
    timing: encounter.priorDoseDate || evaluation.output.lateDoseWarning
      ? timingNoteText(evaluation, encounter) || undefined
      : undefined,
    administration: administration || undefined,
    dateTime: formatCompactDateTime(encounter.administrationDate, encounter.administrationTime) || undefined,
    asepticTechnique: asepticSentence || undefined,
    response: responseNoteText(encounter) || undefined,
    observation: details.postInjectionObservation
      ? "Pt observed post-inj w/o adverse reaction."
      : undefined,
    departureStatus: departureStatusLine(encounter) || undefined,
    traceability: traceabilityLine(encounter, secondComponent) || undefined,
    followUp: followUpLine(encounter) || undefined,
    orderingProvider: trimmed(encounter.orderingProvider) || undefined,
    administeredBy: trimmed(encounter.administeredBy) || undefined,
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
  const productSource = trimmed(details.productSource);
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
  // Gated on the dose still being late, not merely on the field being set -
  // an edited-back-to-on-time date must not carry a stale "reviewed as late"
  // note forward into the chart.
  const lateDoseReviewText = lateDoseReviewDocumentationText(evaluation, encounter);

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
    noteFacts: administered
      ? buildInjectionNoteFacts(encounter, evaluation, primaryMedicationName, initiation.secondComponent)
      : undefined,
  };
}
