import { createContext, Fragment, type ComponentChildren, type Ref } from "preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DesktopIcon } from "../../DesktopIcon";
import { ModalDialog } from "../../ModalDialog";
import { SiteIcon } from "../../SiteIcon";
import {
  INJECTION_ATTESTATION_OPTIONS,
  INJECTION_DEPARTURE_STATUS_OPTIONS,
  INJECTION_REASON_OPTIONS,
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  InjectionEngine,
  emptyInjectionInitiation,
  hasCompleteManualNextDoseProvenance,
  findInjectionResponseOption,
  hasCurrentInjectionAdministrationReview,
  hasCurrentLateDoseReview,
  injectionAdministrationReviewFingerprint,
  injectionAttestationRequired,
  injectionInitiationConfig,
  injectionInitiationOptions,
  injectionInitiationSecondarySites,
  injectionTimingReviewFingerprint,
  isMedicationPreparationVerification,
  medicationPreparationGuidance,
  medicationVerificationLabel,
  type InjectionAdministrationDetails,
  type InjectionDisposition,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
  type InjectionInitiationProtocol,
  type InjectionNeedleProjection,
  type InjectionReason,
  type InjectionResponse,
} from "../../../domain/injection";
import {
  ALL_INJECTION_SITES,
  INJECTION_INTERVAL_OPTIONS,
  INJECTION_MEDICATIONS,
  injectionSiteGroup,
  preferredIntervalForDose,
  type InjectionIntervalKey,
  type InjectionMedication,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "../../../domain/injection-catalog";
import { formatNeedleSpec } from "../../../domain/injection-needle";
import type { InjectionHabitusBand } from "../../../domain/injection-clinical-reference";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { firstActionableClinicalIssue } from "../../../application/readiness-projection";
import {
  projectCarriedFieldSource,
  projectWorkflowLedgerState,
  projectWorkflowTransactionStatus,
  type WorkflowFieldState,
} from "../../../application/workstation-projection";
import { isValidIsoDate, weekendSnapDates } from "../../../domain/dates";
import {
  createNdcOptionResolver,
  formatNdcPackageOption,
  resolveNdcEntry,
  selectionForNdcInput,
  type InjectionDocumentationMetadata,
  type InjectionNdcSelection,
  type NdcOptionQuery,
  type NdcOptionsLookup,
} from "../../../domain/injection-ndc";
import { notifyLegacyFieldInput, setLegacyFieldValue } from "../legacy-mirror";
import { DocumentationEngine } from "../../../documentation";
import { injectionEncounterToDocumentationInput } from "../../../documentation/adapters/injection-from-encounter";
import { countStopsByTab, OutstandingRequirements } from "../OutstandingRequirements";
import { StatusFlag } from "../StatusFlag";
import { ScheduleRegister } from "../ScheduleRegister";
import {
  injectionTimingDayFlag,
  injectionTimingTone,
  injectionTimingVerdict,
} from "./timing-register";
import { formatWorkstationDate } from "../WorkstationDateField";
import { RegisterMarkers, WorkflowSummaryFact, TransactionLine, type ClinicalFieldSource } from "../ClinicalRegister";
import { hasProviderRegister } from "../../../domain/provider-register";
import { ProviderField } from "../ProviderField";
import { OptionList, WorkflowField } from "../WorkflowField";
import { WorkstationDateField } from "../WorkstationDateField";
import {
  workflowLedgerPanelId,
  workflowLedgerTabId,
  WorkflowLedgerTabs,
} from "../WorkflowLedgerTabs";
import { requestClinicalPrint } from "../clinical-print";
import {
  mirrorInjectionEncounterToLegacyDom,
  type InjectionLegacyMirrorOptions,
} from "./injection-legacy-mirror";
import { SiteHistoryRepository } from "../../../persistence/site-history";
import { browserSafeStorage } from "../../../persistence/storage";
import type { PatientContext } from "../../types";
import { formatDobAsTyped } from "../../format-dob";
import {
  canBuildInjectionPatientScreenDocument,
  type PatientScreenLanguage,
} from "../../../domain/injection-patient-screening";
import {
  INJECTION_PATIENT_SCREENING_ENABLED,
  printInjectionPatientScreening,
} from "./patient-screening-print";

// Four transaction pages match how staff actually complete the MAR: establish
// order/timing, identify the physical product, administer and verify, review.
type InjectionTab = "order" | "product" | "administration" | "review";

const INJECTION_TABS: Array<[InjectionTab, string]> = [
  ["order", "Order & Timing"],
  ["product", "Product"],
  ["administration", "Administration"],
  ["review", "Review"],
];

const INJECTION_TAB_LABELS = Object.fromEntries(INJECTION_TABS) as Record<InjectionTab, string>;

const currentAdministrationTimestamp = (): { administrationDate: string; administrationTime: string } => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString();
  return { administrationDate: local.slice(0, 10), administrationTime: local.slice(11, 16) };
};

const LATE_DOSE_REVIEW_OPTIONS: ReadonlyArray<{
  key: "provider-authorized" | "other";
  label: string;
}> = [
  { key: "provider-authorized", label: "Provider approved this administration" },
  { key: "other", label: "Other review / plan (does not state approval)" },
];

/**
 * Reading order for the four abdomen quadrants, so they always sit
 * top-left/top-right/bottom-left/bottom-right in a fixed 2-column block
 * that mirrors their real spatial layout - independent of whatever order
 * the catalog lists them in, and independent of viewport width (an
 * auto-fill grid would happily wrap them 1, 3, or 4-wide and scramble
 * that spatial meaning).
 */
const ABDOMEN_QUADRANT_ORDER = [
  "Abdomen RUQ (SubQ)",
  "Abdomen LUQ (SubQ)",
  "Abdomen RLQ (SubQ)",
  "Abdomen LLQ (SubQ)",
];

interface SiteGroup {
  label: string;
  sites: string[];
  quadrants: string[];
}

/**
 * Splits the site list by route (every SubQ site's label carries a
 * "(SubQ)" suffix already) so an intramuscular medication's sites and a
 * subcutaneous medication's sites aren't presented as one undifferentiated
 * list. Pulled out of a SubQ group's `sites` into its own `quadrants` list
 * whenever all four abdomen quadrants are present, so the tile grid can lay
 * just those out as a fixed 2x2 block; a partial/custom site list falls
 * back to the flat list untouched.
 */
function groupSitesByRoute(sites: string[]): SiteGroup[] {
  const im = sites.filter((site) => !site.includes("(SubQ)"));
  const subq = sites.filter((site) => site.includes("(SubQ)"));
  const groups: SiteGroup[] = [];
  if (im.length) groups.push({ label: "Intramuscular", sites: im, quadrants: [] });
  if (subq.length) {
    const hasAllQuadrants = ABDOMEN_QUADRANT_ORDER.every((site) => subq.includes(site));
    const quadrants = hasAllQuadrants ? ABDOMEN_QUADRANT_ORDER : [];
    const rest = hasAllQuadrants ? subq.filter((site) => !quadrants.includes(site)) : subq;
    groups.push({ label: "Subcutaneous", sites: rest, quadrants });
  }
  return groups;
}

/**
 * The evaluator owns which fields are required, optional, or not relevant to
 * this encounter. The presentation layer consumes this projection instead of
 * inferring clinical requirements from label copy. `requirements` stays
 * optional while an older stored/evaluated encounter is still supported.
 */
type InjectionRequirementState = "pending" | "required" | "optional" | "hidden";

interface InjectionRequirementPresentation {
  state: InjectionRequirementState;
  section?: string;
  reason?: string;
}

interface InjectionGuidancePresentation {
  key: string;
  section: string;
  title: string;
  message: string;
  classification: "label constraint" | "order-dependent review" | "local policy";
  action?: string;
}

type InjectionOutputWithPresentation = InjectionEvaluationOutput & {
  requirements?: Record<string, InjectionRequirementPresentation>;
  guidance?: InjectionGuidancePresentation[];
  clinicalReferenceVersion?: string;
};

const InjectionRequirementsContext = createContext<Record<string, InjectionRequirementPresentation>>({});
const InjectionIncompleteFieldsContext = createContext<ReadonlySet<string>>(new Set());

const requirement = (
  state: InjectionRequirementState,
  section: string,
  reason?: string,
): InjectionRequirementPresentation => ({ state, section, ...(reason ? { reason } : {}) });

/**
 * Compatibility projection for an older stored/evaluated encounter. The
 * evaluator projection, when present, is spread over this map and is the
 * authoritative state. Keeping this fallback means an older local draft can
 * remain usable without turning a label hint into a clinical requirement.
 */
function legacyRequirementFallback(
  encounter: InjectionEncounter,
  nonAdministration: boolean,
): Record<string, InjectionRequirementPresentation> {
  const scheduled = encounter.reason === "scheduled";
  const activeAdministration = !nonAdministration;
  const recurring = Boolean(encounter.intervalKey && encounter.intervalKey !== "once");
  return {
    "patient.name": requirement("required", "order"),
    "patient.dob": requirement("required", "order"),
    orderingProvider: requirement("required", "order"),
    reason: requirement("required", "order"),
    medicationKey: requirement("required", "order"),
    customMedication: requirement(encounter.medicationKey === "other" ? "required" : "hidden", "order"),
    dose: requirement("required", "order"),
    route: requirement("required", "order"),
    intervalKey: requirement("required", "order"),
    technique: requirement("optional", "order"),
    "details.purpose": requirement("optional", "order"),
    priorDoseDate: requirement(scheduled ? "required" : "optional", "timing"),
    priorSite: requirement("optional", "timing"),
    administrationDate: requirement(activeAdministration ? "required" : "hidden", "timing"),
    nextDoseDate: requirement(
      activeAdministration && recurring ? "required" : "hidden",
      "timing",
    ),
    site: requirement(activeAdministration ? "required" : "hidden", "administration"),
    administeredBy: requirement(activeAdministration ? "required" : "hidden", "administration"),
    administrationTime: requirement(activeAdministration ? "required" : "hidden", "administration"),
    "traceability.ndc": requirement(activeAdministration ? "required" : "hidden", "traceability"),
    "traceability.lot": requirement(activeAdministration ? "required" : "hidden", "traceability"),
    "traceability.expiration": requirement(
      activeAdministration ? "required" : "hidden",
      "traceability",
    ),
    allergies: requirement("required", "safety"),
    "details.volume": requirement("optional", "administration"),
    "details.device": requirement("optional", "administration"),
    "details.siteCondition": requirement("optional", "administration"),
    "details.productSource": requirement("required", "traceability"),
    "details.wasteAmount": requirement(
      encounter.details?.waste ? "required" : "hidden",
      "traceability",
    ),
    "details.wasteWitness": requirement(
      encounter.details?.waste ? "required" : "hidden",
      "traceability",
    ),
    "details.deviceOther": requirement(
      encounter.details?.device === "Other" ? "required" : "hidden",
      "administration",
    ),
    "details.siteConditionOther": requirement(
      encounter.details?.siteCondition === "Other" ? "required" : "hidden",
      "administration",
    ),
    "details.exceptionSummary": requirement(
      encounter.details?.administrationException ? "required" : "hidden",
      "disposition",
    ),
    "details.exceptionRecipient": requirement(
      encounter.details?.administrationException ? "required" : "hidden",
      "disposition",
    ),
    "details.exceptionTime": requirement(
      encounter.details?.administrationException ? "required" : "hidden",
      "disposition",
    ),
    "details.exceptionOutcome": requirement(
      encounter.details?.administrationException ? "required" : "hidden",
      "disposition",
    ),
    "disposition.provider": requirement(nonAdministration ? "required" : "hidden", "disposition"),
    "disposition.time": requirement(nonAdministration ? "required" : "hidden", "disposition"),
    "disposition.outcome": requirement(nonAdministration ? "required" : "hidden", "disposition"),
  };
}

const pairedMedicationKeyFor = (
  protocol: InjectionInitiationProtocol | undefined,
  primary: InjectionMedicationKey | "",
): InjectionMedicationKey | "" => {
  if (protocol === "maintena-1day" && primary === "maintena") return "maintena";
  if (protocol === "asimtufii-1day" && primary === "asimtufii") return "maintena";
  if (protocol === "aristada-initio-sameday") {
    if (primary === "aristada") return "initio";
    if (primary === "initio") return "aristada";
  }
  return "";
};

// "details.*" is the one field prefix that doesn't map to a single tab - its
// sub-fields are split across Product (source/prep/waste/product issue),
// Administration (volume/device/site condition and administration
// exception). Everything else maps by top-level field name/prefix alone.
const INJECTION_DETAILS_FIELD_TAB: Record<string, InjectionTab> = {
  purpose: "order",
  productSource: "product",
  waste: "product",
  wasteAmount: "product",
  wasteWitness: "product",
  productIssue: "product",
  productIssueDetail: "product",
  productIssueAction: "product",
  productIssueRecipient: "product",
  productIssueNotificationTime: "product",
  productIssueDirection: "product",
  productIssueNextStep: "product",
  // Dose actually delivered and the device it came through are part of the
  // administration event, not the outcome of it.
  volume: "administration",
  volumeUnit: "administration",
  device: "administration",
  deviceOther: "administration",
  siteCondition: "administration",
  siteConditionOther: "administration",
  administrationException: "administration",
  exceptionSummary: "administration",
  exceptionRecipient: "administration",
  exceptionTime: "administration",
  exceptionOutcome: "administration",
};

/**
 * Maps a ClinicalIssue's dot-path `field` back to the tab that actually
 * edits it, so an outstanding stop can be surfaced as a direct "go here"
 * link instead of leaving staff to hunt across all four tabs for whichever
 * field is still blank.
 */
function tabForInjectionField(field?: string): InjectionTab {
  const [head, sub] = (field ?? "").split(".");
  switch (head) {
    // What authorises this dose: who ordered it, why, and the exact product,
    // dose, route and interval the order specifies.
    case "patient":
    case "orderingProvider":
    case "reason":
    case "medicationKey":
    case "customMedication":
    case "dose":
    case "route":
    case "intervalKey":
    case "technique":
      return "order";
    // Timing is part of the active order context, not a separate transaction.
    case "priorDoseDate":
    case "priorSite":
    case "nextDoseDate":
    case "initiation":
    case "administrationDate":
      return "order";
    // The administration event itself: where, by whom, and when.
    case "site":
    case "administeredBy":
    case "administrationTime":
    case "secondAdministrationTime":
      return "administration";
    case "traceability":
      return "product";
    case "attestations":
    case "verifications":
    case "vitals":
    case "allergies":
    case "acuteSafetyScreenConfirmed":
    case "activeSafetyConcerns":
      return "administration";
    case "response":
    case "disposition":
      return "review";
    case "details":
      return (sub && INJECTION_DETAILS_FIELD_TAB[sub]) || "review";
    default:
      return "order";
  }
}

interface InjectionPanelProps {
  initialEncounter: InjectionEncounter;
  activePatient: PatientContext;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
  /** True once the record has been completed and locked (read-only) via the
   * records workspace. Matches legacy's #panel-administer.record-readonly. */
  locked?: boolean;
  onWorkflowStateChange?: (
    encounter: InjectionEncounter,
    evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
  ) => void;
}

const patientIsEmpty = (patient: InjectionEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

// A short status stamp for the timing banner - "what does this number mean"
// answered in three words before staff read the full sentence below it.
// Sentence case with a period, matching the app's own posted/error stamp
// captions (.cd2004-post-stamp/.cd2004-post-error) rather than an all-caps
// alert-box convention borrowed from elsewhere.
function injectionTimingStatusLabel(timing: InjectionEvaluationOutput["timing"]): string {
  switch (timing.state) {
    case "ok":
      return "On schedule.";
    case "stop":
      return "Dates don't add up — check them.";
    case "warning":
      if (timing.late) return "Late — needs provider review.";
      if (
        timing.daysSincePrior !== null &&
        timing.earliestDay !== null &&
        timing.daysSincePrior < timing.earliestDay
      ) {
        return "Early — confirm with provider.";
      }
      return "Review timing before administering.";
    case "idle":
    default:
      return "Timing not yet evaluated.";
  }
}

// The icon column matches the app's own posted/error stamps: a fixed-color
// pictogram, not a color recolored per state, from the same 16-bit-style set
// used across the workstation.
function injectionTimingStatusIcon(
  timing: InjectionEvaluationOutput["timing"],
): "check" | "alert" | "note" {
  switch (timing.state) {
    case "ok":
      return "check";
    case "warning":
    case "stop":
      return "alert";
    case "idle":
    default:
      return "note";
  }
}

function formatReviewDateTime(value: string): string {
  return value.trim().replace("T", " at ");
}

/**
 * Register display format. Deliberately the same MM/DD/YY the typed date fields
 * render, so a date read out of a calculation and a date typed into a field are
 * never shown two different ways on one screen. `formatClinicalDate` keeps its
 * MM/DD/YYYY for the override dialog's prose.
 */
function registerDate(value: string): string {
  return formatWorkstationDate(value, "date") || "—";
}

function formatClinicalDate(value: string): string {
  if (!isValidIsoDate(value)) return value || "—";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function CheckList({
  items,
  checked,
  onToggle,
  requirementFor,
  reviewStateFor,
  quiet,
}: {
  items: ReadonlyArray<{ key: string; label: string; description?: string }>;
  checked: (key: string) => boolean;
  onToggle: (key: string, value: boolean) => void;
  /** The evaluator owns checklist visibility and required markers. */
  requirementFor?: (key: string) => string;
  /** Review-by-exception semantics for routine preselected items. */
  reviewStateFor?: (key: string) => "expected" | "confirmed" | "exception" | undefined;
  /** The app-wide "selected" amber fill means "this needs attention" (a
      raised hold, an active exception). A routine attestation that's
      pre-checked by default isn't that - it's the expected state - so this
      skips the amber fill and shows only the checkmark. */
  quiet?: boolean;
}) {
  const requirements = useContext(InjectionRequirementsContext);
  return (
    <div class={`wfp-option-list ${quiet ? "wfp-option-list-quiet" : ""}`}>
      {items.map((item) => {
        const projected = requirementFor ? requirements[requirementFor(item.key)] : undefined;
        if (projected?.state === "hidden") return null;
        const required = projected?.state === "required";
        const optional = projected?.state === "optional";
        const reviewState = reviewStateFor?.(item.key);
        return (
          <label
            key={item.key}
            class={`wfp-option-row ${checked(item.key) ? "is-selected" : ""} ${required ? "is-required" : ""}`}
            data-requirement={projected?.state ?? "unprojected"}
          >
            <input
              type="checkbox"
              aria-required={required || undefined}
              checked={checked(item.key)}
              onChange={(event) => onToggle(item.key, event.currentTarget.checked)}
            />
            <span>
              <span class="wfp-option-title">
                {item.label}
                {required && <abbr class="wfp-req" title="Required">*</abbr>}
                {reviewState ? (
                  <span class={`wfp-review-state is-${reviewState}`}>
                    {reviewState.toUpperCase()}
                  </span>
                ) : (
                  optional && <span class="wfp-opt">optional</span>
                )}
              </span>
              {item.description && <div class="wfp-option-desc">{item.description}</div>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

const guidanceSectionForTab: Record<InjectionTab, string> = {
  order: "order",
  product: "traceability",
  administration: "administration",
  review: "disposition",
};

function fallbackGuidance({
  tab,
  medication,
  allowedSites,
  recommendedSite,
  suggestedNextDose,
  nonAdministration,
}: {
  tab: InjectionTab;
  medication: NonNullable<InjectionEvaluationOutput["medication"]>;
  allowedSites: readonly string[];
  recommendedSite: string;
  suggestedNextDose: string;
  nonAdministration: boolean;
}): InjectionGuidancePresentation[] {
  if (nonAdministration) {
    return [
      {
        key: "handoff",
        section: "disposition",
        title: "Handoff documentation",
        message:
          "No medication administration is being documented. Enter the recipient, decision time, and concise direction; product and administration details stay out of this record.",
        classification: "local policy",
      },
    ];
  }

  switch (tab) {
    case "order":
      return [
        {
          key: "active-order",
          section: "order",
          title: "Active order",
          message:
            "Document the exact ordered strength, route, and cadence. Defaults are reference-only and do not replace the active order.",
          classification: "order-dependent review",
        },
        ...(medication.key === "other"
          ? [
              {
                key: "order-timing",
                section: "order",
                title: "Timing review",
                message:
                  "Other has no product-specific timing guidance. Document the return date from the active order or provider direction.",
                classification: "order-dependent review" as const,
              },
            ]
          : medication.timingMode === "orderVerify"
          ? [
              {
                key: "order-timing",
                section: "order",
                title: "Timing review",
                message:
                  "This product’s schedule or re-initiation path must be verified against the active order and current product information.",
                classification: "order-dependent review" as const,
              },
            ]
          : []),
        {
          key: "next-due",
          section: "timing",
          title: "Expected next due",
          message: suggestedNextDose
            ? `${suggestedNextDose} is calculated from the documented administration date and selected cadence. Use an explicit exception only when the active order or provider direction changes that target.`
            : medication.key === "other"
              ? "No product-specific calculation applies. Enter the return date from the active order or provider direction."
              : "Enter the actual administration date and ordered cadence to calculate an expected next due date.",
          classification: "local policy",
        },
        {
          key: "missed-dose",
          section: "timing",
          title: "Late / missed dose",
          message: medication.missedDoseGuidance,
          classification: "order-dependent review",
        },
      ];
    case "administration":
      return [
        {
          key: "route-site",
          section: "administration",
          title: "Route / location",
          message:
            allowedSites.length > 0
              ? `${medication.route} reference path. Select the actual site after checking the order.${recommendedSite ? ` ${recommendedSite} is the local rotation suggestion.` : ""}`
              : "Document the actual administration location from the active order. This product has no cataloged anatomical default.",
          classification: "label constraint",
        },
        {
          key: "safety-checks",
          section: "safety",
          title: "Safety review",
          message:
            medication.verifications.length > 0
              ? `Complete the applicable ${medication.label} verification items below. Record an exception only when it is actually present.`
              : "Complete the applicable safety review and record an exception only when it is actually present.",
          classification: "label constraint",
        },
      ];
    case "product":
      return [
        {
          key: "product-trace",
          section: "traceability",
          title: "Product traceability",
          message:
            "Choose the scanned or known package NDC when available, then document the dispensed lot and expiration. A different package NDC remains allowed but needs package verification.",
          classification: "local policy",
        },
      ];
    case "review":
      return [
        {
          key: "disposition",
          section: "disposition",
          title: "Final documentation choice",
          message:
            "Choose administration only after the actual event is fully documented. Use a handoff disposition when medication was not administered.",
          classification: "local policy",
        },
      ];
  }
}

function OperatorGuidance({
  tab,
  medication,
  evaluation,
  allowedSites,
  recommendedSite,
  suggestedNextDose,
  nonAdministration,
  onNavigate,
}: {
  tab: InjectionTab;
  medication: NonNullable<InjectionEvaluationOutput["medication"]> | null;
  evaluation?: ClinicalEvaluation<InjectionEvaluationOutput>;
  allowedSites: readonly string[];
  recommendedSite: string;
  suggestedNextDose: string;
  nonAdministration: boolean;
  onNavigate: (tab: InjectionTab) => void;
}) {
  if (!medication) return null;

  const presentedOutput = evaluation?.output as InjectionOutputWithPresentation | undefined;
  const matchingGuidance = (presentedOutput?.guidance ?? []).filter(
    (entry) => entry.section === guidanceSectionForTab[tab],
  );
  const items = matchingGuidance.length
    ? matchingGuidance
    : fallbackGuidance({
        tab,
        medication,
        allowedSites,
        recommendedSite,
        suggestedNextDose,
        nonAdministration,
      });
  const referenceItems = [
    ...items.slice(1),
    ...(presentedOutput?.guidance ?? []).filter(
      (entry) => !items.some((current) => current.key === entry.key),
    ),
  ];
  const clinicalReference = medication.clinicalReference;
  // Preparation content is reviewed independently from the broader
  // scheduling/reference bundle. Show its own dated source beside the
  // product handling guidance rather than implying the older bundle review
  // date attests a newly revised preparation instruction.
  const preparationSource = clinicalReference?.administration.notes.find(
    (note) => note.phase === "preparation",
  )?.source;
  const firstStop = firstActionableClinicalIssue("administer", evaluation);
  const blockerTab = firstStop ? tabForInjectionField(firstStop.field) : null;
  const primaryItem = items[0];
  // A provider-directed cadence is allowed, but its review notice needs to be
  // visible at the exact point where the MA selects the order. Keep this
  // deliberately narrow so ordinary engine warnings do not crowd the panel.
  const intervalReviewWarning =
    tab === "order"
      ? evaluation?.warnings.find((entry) => entry.code === "dose.interval-mismatch")
      : undefined;

  return (
    <section class="wfp-operator-guidance" aria-label="Operator guidance" data-operator-guidance>
      <div class="wfp-operator-guidance-head">
        <strong>Operator guidance</strong>
        <span>{INJECTION_TAB_LABELS[tab]} — {medication.label}</span>
        {presentedOutput?.clinicalReferenceVersion && (
          <small>REF {presentedOutput.clinicalReferenceVersion}</small>
        )}
      </div>
      {(primaryItem || intervalReviewWarning) && (
        <div class="wfp-operator-guidance-list">
          {primaryItem && (
            <div class="wfp-operator-guidance-row">
              <strong>{primaryItem.title}:</strong>
              <span>{primaryItem.message}</span>
              {primaryItem.action && <em>{primaryItem.action}</em>}
            </div>
          )}
          {intervalReviewWarning && (
            <div class="wfp-operator-guidance-row is-warning" data-interval-review-warning>
              <strong>Order review:</strong>
              <span>{intervalReviewWarning.message}</span>
            </div>
          )}
        </div>
      )}
      {firstStop && blockerTab && (
        <button
          type="button"
          class="wfp-operator-guidance-action"
          onClick={() => onNavigate(blockerTab)}
        >
          Next required: {firstStop.message} — go to {INJECTION_TAB_LABELS[blockerTab]}
        </button>
      )}
      <details class="wfp-reference">
        <summary>Reference — product, schedule, and technique</summary>
        <div class="wfp-reference-body">
          <dl class="wfp-report-meta">
            <dt>Medication</dt>
            <dd>{medication.name} ({medication.generic})</dd>
            <dt>Reference route</dt>
            <dd>{medication.route || "Verify active order"}</dd>
            <dt>Reference cadence</dt>
            <dd>{medication.intervalKey === "once" ? "One-time pathway" : "Set per active order"}</dd>
            <dt>Late / missed dose</dt>
            <dd>{medication.missedDoseGuidance}</dd>
            {clinicalReference && (
              <>
                <dt>Technique</dt>
                <dd>{clinicalReference.knowledge.technique}</dd>
                <dt>Preparation</dt>
                <dd>{clinicalReference.knowledge.preparation}</dd>
                {preparationSource && (
                  <>
                    <dt>Preparation source</dt>
                    <dd>
                      <a href={preparationSource.url} target="_blank" rel="noreferrer">
                        {preparationSource.title}
                      </a>{" "}
                      — {preparationSource.labelRevision}; reviewed {preparationSource.reviewedOn}
                    </dd>
                  </>
                )}
                <dt>Storage</dt>
                <dd>{clinicalReference.knowledge.storage}</dd>
                <dt>Staff guardrail</dt>
                <dd>{clinicalReference.knowledge.staffGuardrail}</dd>
                <dt>Source</dt>
                <dd>
                  <a href={clinicalReference.source.url} target="_blank" rel="noreferrer">
                    {clinicalReference.source.title}
                  </a>{" "}
                  — {clinicalReference.source.labelRevision}; reviewed {clinicalReference.source.reviewedOn}
                </dd>
              </>
            )}
            {referenceItems.slice(0, 8).map((item) => (
              <Fragment key={item.key}>
                <dt key={`${item.key}-term`}>{item.title}</dt>
                <dd key={`${item.key}-detail`}>{item.message}</dd>
              </Fragment>
            ))}
            {presentedOutput?.clinicalReferenceVersion && (
              <>
                <dt>Reference</dt>
                <dd>{presentedOutput.clinicalReferenceVersion}</dd>
              </>
            )}
          </dl>
          <p class="wfp-field-hint">
            Reference content supports the administration workflow. It does not replace the active order,
            current product information, or local policy.
          </p>
        </div>
      </details>
    </section>
  );
}

const HABITUS_OPTIONS: ReadonlyArray<{ key: InjectionHabitusBand; label: string; hint: string }> = [
  { key: "lean", label: "Lean", hint: "Little subcutaneous tissue over the muscle" },
  { key: "average", label: "Average", hint: "Typical tissue depth" },
  { key: "larger", label: "Larger SubQ", hint: "Greater subcutaneous tissue over the muscle" },
];

/** A dotted-leader readout row, the way a MAGIC report prints a field. The
 * leader is drawn in CSS so it stretches to the panel width instead of being
 * a fixed run of periods that wraps badly at narrow widths. */
function NeedleReadout({ label, value }: { label: string; value: string }) {
  return (
    <div class="wfp-needle-readout">
      <span class="wfp-needle-readout-label">{label}</span>
      <span class="wfp-needle-readout-dots" aria-hidden="true" />
      <span class="wfp-needle-readout-value">{value}</span>
    </div>
  );
}

/**
 * Tissue-layer diagram. Drawn flat in the --cd-* palette rather than ported
 * from the legacy runtime, which carried its own colors. Straight edges and
 * hatched bands only, so it reads as terminal graphics and survives the
 * greyscale print path the AVS renderer already holds the line on.
 */
function NeedleDiagram({
  subcutaneous,
  angle,
}: {
  subcutaneous: boolean;
  /** Display only a product-sourced numeric angle; a generic anatomy sketch
   * must not turn into unsupported technique guidance. */
  angle?: string;
}) {
  // A SubQ needle stops in the fatty layer at a shallower angle; an IM needle
  // passes through it into muscle at 90°.
  const needlePath = subcutaneous ? "M 96 14 L 150 68" : "M 120 12 L 120 104";
  return (
    <svg
      class="wfp-needle-diagram"
      viewBox="0 0 240 132"
      role="img"
      aria-label={
        subcutaneous
          ? "Cross-section: needle entering the subcutaneous layer at an angle"
          : "Cross-section: needle passing through skin and subcutaneous tissue into muscle"
      }
    >
      <rect x="8" y="16" width="224" height="20" class="wfp-needle-layer-skin" />
      <rect x="8" y="36" width="224" height="34" class="wfp-needle-layer-subq" />
      <rect x="8" y="70" width="224" height="46" class="wfp-needle-layer-muscle" />
      <text class="wfp-needle-layer-label" x="14" y="30">SKIN</text>
      <text class="wfp-needle-layer-label" x="14" y="57">SUBQ</text>
      <text class="wfp-needle-layer-label" x="14" y="97">MUSCLE</text>
      <path d={needlePath} class="wfp-needle-shaft" />
      {angle && (
        <text class="wfp-needle-depth-label" x={subcutaneous ? 158 : 128} y={subcutaneous ? 76 : 112}>
          {`${angle}°`}
        </text>
      )}
    </svg>
  );
}

function NeedleTechniquePanel({
  needle,
  medication,
  encounter,
  patch,
  referenceVersion,
}: {
  needle: InjectionNeedleProjection;
  medication: InjectionMedication | null;
  encounter: InjectionEncounter;
  patch: (partial: Partial<InjectionEncounter>) => void;
  referenceVersion?: string;
}) {
  if (!medication?.clinicalReference) return null;

  const { resolution, angle, maxVolumePerSite } = needle;
  const primary = resolution.needle ? formatNeedleSpec(resolution.needle) : "";
  const alternate = resolution.alternate ? formatNeedleSpec(resolution.alternate) : "";
  // Fall back to the group the resolver used, so a gluteal-only product reads
  // correctly before a specific side has been chosen.
  const placement = injectionSiteGroup(encounter.site) || resolution.siteGroup;
  const subcutaneous =
    placement === "subq" ||
    encounter.route.trim().toLowerCase() === "subq" ||
    encounter.route.trim().toLowerCase().includes("subcut");
  const placementLabel =
    placement === "deltoid"
      ? "Deltoid IM"
      : placement === "gluteal"
        ? "Gluteal IM"
        : placement === "subq"
          ? "Subcutaneous"
          : "Per active order";
  // Cautions earn the alarm treatment; the rest stay in the reference list so
  // a genuinely binding instruction is not buried among routine ones.
  const cautions = needle.notes.filter((note) => note.severity === "caution");
  const informational = needle.notes.filter((note) => note.severity === "info");

  return (
    <div class="wfp-section wfp-needle-section" role="group" aria-label="Needle and technique">
      <h2 class="wfp-section-head">
        Needle &amp; technique
        {referenceVersion && <span class="wfp-needle-ref">REF {referenceVersion}</span>}
      </h2>
      <div class="wfp-section-body">
        <div class="wfp-needle-inputs">
          <div class="wfp-needle-input-group">
            <span class="wfp-needle-input-caption">Body habitus</span>
            <div class="wfp-needle-band">
              {HABITUS_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  class={`wfp-needle-band-option ${
                    encounter.habitus === option.key ? "is-selected" : ""
                  }`}
                  title={option.hint}
                >
                  <input
                    type="radio"
                    name="inj-habitus"
                    checked={encounter.habitus === option.key}
                    onChange={() => patch({ habitus: option.key })}
                  />
                  <span class="wfp-needle-band-mark" aria-hidden="true">
                    {encounter.habitus === option.key ? "X" : "\u00a0"}
                  </span>
                  <span class="wfp-needle-band-label">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div class="wfp-needle-input-group">
            <span class="wfp-needle-input-caption">Weight</span>
            <div class="wfp-needle-weight">
              <input
                class="wfp-needle-weight-value"
                inputMode="decimal"
                value={encounter.vitals?.weight ?? ""}
                placeholder="—"
                aria-label="Patient weight"
                onInput={(event) =>
                  patch({
                    vitals: { ...encounter.vitals, weight: event.currentTarget.value },
                  })
                }
              />
              {(["kg", "lb"] as const).map((unit) => (
                <label
                  key={unit}
                  class={`wfp-needle-band-option ${
                    (encounter.vitals?.weightUnit ?? "kg") === unit ? "is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="inj-weight-unit"
                    checked={(encounter.vitals?.weightUnit ?? "kg") === unit}
                    onChange={() =>
                      patch({ vitals: { ...encounter.vitals, weightUnit: unit } })
                    }
                  />
                  <span class="wfp-needle-band-mark" aria-hidden="true">
                    {(encounter.vitals?.weightUnit ?? "kg") === unit ? "X" : "\u00a0"}
                  </span>
                  <span class="wfp-needle-band-label">{unit.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div class="wfp-needle-panel">
          <div class="wfp-needle-readouts">
            <NeedleReadout label="Needle" value={primary || "Not resolved"} />
            {alternate && <NeedleReadout label="Or" value={alternate} />}
            <NeedleReadout label="Route" value={placementLabel} />
            {angle && <NeedleReadout label="Angle" value={`${angle.degrees}°`} />}
            {maxVolumePerSite !== undefined && (
              <NeedleReadout label="Max vol" value={`${maxVolumePerSite} mL / site`} />
            )}
          </div>
          <NeedleDiagram subcutaneous={subcutaneous} angle={angle?.degrees} />
        </div>

        {resolution.unresolved && resolution.unresolvedReason && (
          <div class="wfp-operator-guidance-row is-warning" data-needle-unresolved>
            <strong>! Needle not resolved:</strong>
            <span>{resolution.unresolvedReason}</span>
          </div>
        )}
        {resolution.rationale && !resolution.unresolved && (
          <p class="wfp-field-hint">{resolution.rationale}</p>
        )}

        {cautions.map((note) => (
          <div key={note.id} class="wfp-operator-guidance-row is-warning" data-needle-caution>
            <strong>!</strong>
            <span>{note.statement}</span>
          </div>
        ))}

        {informational.length > 0 && (
          <details class="wfp-reference wfp-needle-reference">
            <summary>
              Technique reference — {informational.length}{" "}
              {informational.length === 1 ? "item" : "items"}
            </summary>
            <div class="wfp-reference-body">
              <dl class="wfp-report-meta">
                {informational.map((note) => (
                  <Fragment key={note.id}>
                    <dt key={`${note.id}-term`}>{note.phase}</dt>
                    <dd key={`${note.id}-detail`}>{note.statement}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function NdcPicker({
  inputId,
  query,
  value,
  lookup,
  onChange,
  required = false,
}: {
  inputId: string;
  query: NdcOptionQuery;
  value: string;
  lookup: NdcOptionsLookup;
  onChange: (value: string, selection?: InjectionNdcSelection) => void;
  required?: boolean;
}) {
  const customInput = useRef<HTMLInputElement>(null);
  // Package lookup is exact medication + exact documented strength. A bare
  // medication must not surface NDCs from every strength as a plausible
  // selection.
  const hasQuery = Boolean(query.medicationKey && query.dose);
  const options = hasQuery ? lookup.options : [];
  const resolution = resolveNdcEntry(value, options);
  const selectedId = resolution.option?.id ?? (value ? "__custom__" : "");
  const remoteLabel = hasQuery ? {
    "not-applicable": "No package list for an uncataloged medication.",
    bundled: "Local audited package list",
    cached: "FDA-listed package choices cached locally",
    refreshed: "FDA-listed package choices refreshed locally",
    fallback: "FDA lookup unavailable — using local audited package list",
  }[lookup.remoteStatus] : "Select the medication and exact strength to list known packages.";

  const apply = (raw: string) => {
    const next = resolveNdcEntry(raw, options);
    onChange(next.value, selectionForNdcInput(next.value, query, options));
  };

  return (
    <div class="wfp-ndc-picker" data-ndc-picker>
      <select
        aria-label="Known NDC package"
        value={selectedId}
        disabled={!hasQuery || options.length === 0}
        onChange={(event) => {
          const selection = event.currentTarget.value;
          if (selection === "__custom__") {
            window.setTimeout(() => customInput.current?.focus(), 0);
            return;
          }
          const option = options.find((entry) => entry.id === selection);
          if (option) apply(option.ndc);
        }}
      >
        <option value="">Select known package</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {formatNdcPackageOption(option)}{option.source === "remote" ? " — FDA-listed; verify package" : ""}
          </option>
        ))}
        <option value="__custom__">Different package NDC…</option>
      </select>
      <input
        ref={customInput}
        id={inputId}
        class="mono"
        aria-label="Scan or enter a different package NDC"
        aria-required={required || undefined}
        value={value}
        placeholder="00000-0000-00"
        title="Scan or enter a different package NDC"
        onInput={(event) => apply(event.currentTarget.value)}
      />
      {value && (
        <span class={`wfp-ndc-status is-${resolution.source}`}>
          {resolution.source === "custom"
            ? "Custom NDC — verify package"
            : resolution.option
              ? `Known ${resolution.option.source === "remote" ? "FDA-listed" : "local"} package`
              : ""}
        </span>
      )}
      {resolution.option && (
        <span class="wfp-ndc-source">
          {resolution.option.packageKind === "sample" ? "Sample — not for resale" : "Commercial package"}
          {" · "}{resolution.option.package} · {resolution.option.labeler}
        </span>
      )}
      <span class="wfp-ndc-source">{remoteLabel}</span>
    </div>
  );
}

// OptionList renders `description` as the gloss under the control; the catalog
// calls that same short clause `fragment` because the note pipelines consume it
// too. Derived once - the kind list is a constant.
const RESPONSE_OPTIONS = INJECTION_RESPONSE_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
  description: option.fragment,
}));

function Field({
  label,
  hint,
  field,
  width,
  source = "ENTRY",
  state,
  prompt,
  children,
}: {
  label: string;
  hint?: string;
  /** Encounter dot path used by the evaluator's requirement projection. */
  field?: string;
  /** Sizes the control to its content. Free-text fields that hold a fixed
   * shape - a date typed as MM/DD/YYYY, a short code - should not stretch to
   * a full grid column just because the grid offers one. */
  width?: "date" | "short";
  source?: ClinicalFieldSource;
  /** Explicit state for command-dialog fields that are not encounter facts. */
  state?: WorkflowFieldState;
  prompt?: string;
  children: ComponentChildren;
}) {
  const requirements = useContext(InjectionRequirementsContext);
  const incompleteFields = useContext(InjectionIncompleteFieldsContext);
  const projected = field ? requirements[field] : undefined;
  const required = projected?.state === "required";
  const incomplete = Boolean(field && incompleteFields.has(field));
  const optional = projected?.state === "optional";
  // Legacy hints can carry contextual copy, but are never used to decide a
  // clinical requirement. That decision comes only from the projection.
  const detail =
    hint && hint !== "required" && hint !== "optional"
      ? hint.replace(/^(required|optional)[;:,]?\s*/i, "")
      : projected?.reason ?? "";
  const code = `INJ-${field?.replace(/[^a-z0-9]+/gi, "-").toUpperCase() ?? label.replace(/[^a-z0-9]+/gi, "-").toUpperCase()}`;
  return (
    <WorkflowField
      label={label}
      hint={detail}
      field={field}
      width={width}
      prompt={prompt}
      presentation={{
        state: state ?? (
          projected?.state === "hidden"
            ? "not-applicable"
            : projected?.state === "pending"
              ? "pending-context"
            : required
              ? "required"
              : optional
                ? "optional"
                : "pending-context"),
        source,
        fieldCode: code,
        ...(projected?.reason ? { detail: projected.reason } : {}),
      }}
      incomplete={incomplete}
    >
      {children}
    </WorkflowField>
  );
}

const emptyDetails = (): InjectionAdministrationDetails => ({});

export function InjectionPanel({
  initialEncounter,
  activePatient,
  staffSignInValue,
  previewRef,
  locked,
  onWorkflowStateChange,
}: InjectionPanelProps) {
  const [encounter, setEncounter] = useState<InjectionEncounter>(initialEncounter);
  // The typed encounter is the workflow authority. Mirroring to the legacy
  // document remains a compatibility path for records and print output, but
  // readiness and commands must update synchronously with the field edit that
  // caused them rather than after a MutationObserver polling cycle.
  const evaluation = useMemo(() => InjectionEngine.evaluate(encounter, {}), [encounter]);
  useEffect(() => {
    onWorkflowStateChange?.(encounter, evaluation);
    // The callback is a notification boundary, not an input to evaluation.
    // Re-notifying on a parent render would create a shell/panel render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, evaluation]);
  const [tab, setTab] = useState<InjectionTab>("order");
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [patientScreeningDialogOpen, setPatientScreeningDialogOpen] = useState(false);
  const [lateDoseDialogOpen, setLateDoseDialogOpen] = useState(false);
  const [lateDoseReviewChoice, setLateDoseReviewChoice] = useState<"provider-authorized" | "other">(
    "provider-authorized",
  );
  const [lateDoseReviewNoteDraft, setLateDoseReviewNoteDraft] = useState("");
  const [lateDoseReviewProviderDraft, setLateDoseReviewProviderDraft] = useState("");
  const [lateDoseReviewTimeDraft, setLateDoseReviewTimeDraft] = useState("");
  const [invalidationReceipt, setInvalidationReceipt] = useState<string | null>(null);

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ workflow?: string; tab?: InjectionTab; field?: string }>).detail;
      if (detail?.workflow !== "administer" || !detail.tab) return;
      setTab(detail.tab);
      if (detail.field) window.setTimeout(() => (document.querySelector(`[data-field-path="${detail.field}"] input, [data-field-path="${detail.field}"] select, [data-field-path="${detail.field}"] textarea, [data-field-path="${detail.field}"] button`) as HTMLElement | null)?.focus(), 0);
    };
    window.addEventListener("ipmg:navigate-workflow-source", navigate);
    return () => window.removeEventListener("ipmg:navigate-workflow-source", navigate);
  }, []);
  const [nextDoseOverrideOpen, setNextDoseOverrideOpen] = useState(false);
  const [nextDoseOverrideDate, setNextDoseOverrideDate] = useState("");
  const [nextDoseOverrideKind, setNextDoseOverrideKind] = useState<
    "active-order" | "provider-direction"
  >("active-order");
  const [nextDoseOverrideReason, setNextDoseOverrideReason] = useState("");
  const [nextDoseOverrideProvider, setNextDoseOverrideProvider] = useState("");
  // Prompt once per exact set of timing facts, not on every render while the
  // dialog is open or after staff already reviewed this same context.
  const lateDosePromptedFor = useRef("");
  // Vitals are optional and rarely used for a routine maintenance dose - stay
  // out of the way by default, but a reopened record that already carries a
  // vitals value starts expanded so nothing entered is hidden from view.
  const [vitalsOpen, setVitalsOpen] = useState(
    () =>
      !!(
        initialEncounter.vitals?.bp ||
        initialEncounter.vitals?.hr ||
        initialEncounter.vitals?.temperature ||
        initialEncounter.vitals?.rr ||
        initialEncounter.vitals?.spo2
      ),
  );
  // Once staff confirm "no acute concerns today", the review-trigger checklist
  // is asking about things that were already just ruled out - collapse it out
  // of the way. It stays reachable via a link, and if any trigger is already
  // ticked it never auto-collapses, since that combination needs eyes on it.
  const [safetyTriggersOpen, setSafetyTriggersOpen] = useState(
    () => (initialEncounter.activeSafetyConcerns?.length ?? 0) > 0,
  );
  const mirroredOnMount = useRef(false);
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  const patientIdentityMirrorTimer = useRef<number | null>(null);
  const patientIdentityLegacySyncPending = useRef(false);
  const autoCalculatedNextDue = useRef("");
  const ndcResolver = useMemo(() => createNdcOptionResolver(), []);
  const [primaryNdcLookup, setPrimaryNdcLookup] = useState<NdcOptionsLookup>(() =>
    ndcResolver.lookup({ medicationKey: "", dose: "" }),
  );
  const [pairedNdcLookup, setPairedNdcLookup] = useState<NdcOptionsLookup>(() =>
    ndcResolver.lookup({ medicationKey: "", dose: "" }),
  );
  // Addenda are a record-lifecycle concept, not part of the typed
  // InjectionEncounter - staffSignInValue seeds the author field, then this
  // drives the hidden legacy #injAddendumAuthor/#injAddendumText/
  // [data-inj-addendum] the same one-way-mirror way as everything else.
  const [addendumAuthor, setAddendumAuthor] = useState(staffSignInValue);
  const [addendumText, setAddendumText] = useState("");
  const [addenda, setAddenda] = useState<Array<{ author: string; text: string; stamp: string }>>([]);
  const nonAdministration = Boolean(
    encounter.disposition.kind && encounter.disposition.kind !== "administered",
  );

  const readAddenda = () =>
    [...document.querySelectorAll<HTMLElement>(".record-addenda-item")].map((node) => ({
      author: node.querySelector("b")?.textContent ?? "",
      text: (node.textContent ?? "").replace(node.querySelector("b")?.textContent ?? "", "").trim(),
      stamp: "",
    }));

  useEffect(() => {
    if (!locked) return;
    setAddenda(readAddenda());
    setLegacyFieldValue("injAddendumAuthor", addendumAuthor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorInjectionEncounterToLegacyDom(encounter, { forceChipState: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const updateEncounter = (
    updater: (previous: InjectionEncounter) => InjectionEncounter,
    mirrorOptions?: InjectionLegacyMirrorOptions,
  ) => {
    setEncounter((previous) => {
      const candidate = updater(previous);
      const materialFactsChanged =
        injectionAdministrationReviewFingerprint(previous) !==
        injectionAdministrationReviewFingerprint(candidate);
      const next =
        materialFactsChanged && previous.disposition.kind
          ? {
              ...candidate,
              disposition: {
                kind: "" as const,
                provider: "",
                time: "",
                outcome: "",
                reviewedBy: "",
                reviewedAt: "",
                reviewFingerprint: "",
              },
            }
          : candidate;
      encounterRef.current = next;
      mirrorInjectionEncounterToLegacyDom(next, mirrorOptions);
      return next;
    });
  };

  const patch = (partial: Partial<InjectionEncounter>) => {
    updateEncounter((previous) => ({ ...previous, ...partial }));
  };

  const flushPatientIdentityLegacySync = () => {
    if (patientIdentityMirrorTimer.current !== null) {
      window.clearTimeout(patientIdentityMirrorTimer.current);
      patientIdentityMirrorTimer.current = null;
    }
    if (!patientIdentityLegacySyncPending.current) return;
    patientIdentityLegacySyncPending.current = false;
    mirrorInjectionEncounterToLegacyDom(encounterRef.current);
    // Both identity controls have already been updated silently. A single
    // legacy input event lets its print/save machinery read them together.
    notifyLegacyFieldInput("ptName");
  };

  const schedulePatientIdentityLegacySync = () => {
    patientIdentityLegacySyncPending.current = true;
    if (patientIdentityMirrorTimer.current !== null) {
      window.clearTimeout(patientIdentityMirrorTimer.current);
    }
    // Leave a realistic typing pause before waking the heavy compatibility
    // runtime; blur still flushes immediately when staff move on.
    patientIdentityMirrorTimer.current = window.setTimeout(() => {
      patientIdentityMirrorTimer.current = null;
      flushPatientIdentityLegacySync();
    }, 500);
  };

  useEffect(
    () => () => {
      if (patientIdentityMirrorTimer.current !== null) {
        window.clearTimeout(patientIdentityMirrorTimer.current);
      }
      patientIdentityLegacySyncPending.current = false;
    },
    [],
  );

  // A workstation sign-in is a useful default, not an attestation. Only fill
  // the empty field; once staff edits the value, their documentation wins.
  useEffect(() => {
    const sessionStaff = staffSignInValue.trim();
    if (locked || !sessionStaff || encounter.administeredBy.trim()) return;
    patch({ administeredBy: sessionStaff });
    // `patch` is intentionally a render-local bridge to the legacy mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffSignInValue, locked, encounter.administeredBy]);

  const patchPatient = (partial: Partial<InjectionEncounter["patient"]>) => {
    updateEncounter(
      (previous) => ({
        ...previous,
        patient: { ...previous.patient, ...partial },
      }),
      { silentPatientIdentity: true },
    );
    schedulePatientIdentityLegacySync();
  };

  const patchDetails = (
    partial: Partial<InjectionAdministrationDetails & InjectionDocumentationMetadata>,
  ) => {
    updateEncounter((previous) => ({
      ...previous,
      details: {
        ...(previous.details ?? emptyDetails()),
        ...partial,
      } as InjectionAdministrationDetails,
    }));
  };

  const patchDisposition = (partial: Partial<InjectionDisposition>) => {
    updateEncounter((previous) => ({
      ...previous,
      disposition: { ...previous.disposition, ...partial },
    }));
  };

  const onMedicationChange = (key: InjectionMedicationKey | "") => {
    // A different product starts a different order context. Do not carry a
    // prior package choice or follow-up suggestion into it.
    autoCalculatedNextDue.current = "";
    if (encounter.medicationKey && encounter.medicationKey !== key) {
      setInvalidationReceipt("ORDER CHANGED · cleared dose-dependent package, site, verification, initiation, and calculated follow-up facts");
    }
    // "Other" has no real per-product route/cadence in the catalog - its
    // entry is a generic placeholder for site/route UI plumbing, not a
    // labeled fact, so it stays staff-entered like before.
    const catalogMedication = key && key !== "other" ? INJECTION_MEDICATIONS[key] : null;
    const defaultDose =
      catalogMedication?.doses.length === 1 ? (catalogMedication.doses[0] ?? "") : "";
    const defaultIntervalKey =
      catalogMedication && defaultDose
        ? preferredIntervalForDose(catalogMedication, defaultDose, catalogMedication.intervalKey)
        : (catalogMedication?.intervalKey ?? "");
    patch({
      medicationKey: key,
      customMedication: "",
      // A product with one available strength has no strength choice to make.
      // Keep the usual cadence as a starting point, just as we do after a
      // staff-selected dose.
      dose: defaultDose,
      site: "",
      // Pre-fill the reference catalog's usual route/cadence as a starting
      // point - staff still see and can change both before the order is
      // documented, this just saves re-typing what the label already says.
      route: catalogMedication?.route ?? "",
      intervalKey: defaultIntervalKey,
      nextDoseDate: "",
      traceability: { ...encounter.traceability, ndc: "" },
      verifications: {},
      initiation: emptyInjectionInitiation(),
    });
    patchDetails({
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
        pairedSecond: undefined,
      },
      nextDose: undefined,
    });
  };

  const onDoseChange = (dose: string) => {
    if (encounter.dose && encounter.dose !== dose) {
      setInvalidationReceipt("DOSE CHANGED · cleared the prior package match and recalculated cadence-dependent facts");
    }
    const catalogMedication =
      encounter.medicationKey && encounter.medicationKey !== "other"
        ? INJECTION_MEDICATIONS[encounter.medicationKey]
        : null;
    patch({
      dose,
      intervalKey: catalogMedication
        ? preferredIntervalForDose(catalogMedication, dose, encounter.intervalKey)
        : encounter.intervalKey,
      traceability: { ...encounter.traceability, ndc: "" },
    });
    patchDetails({
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
      },
    });
  };

  const onIntervalChange = (intervalKey: InjectionIntervalKey | "") => {
    // A different cadence can be a provider-directed active order. Preserve
    // the exact dose and package selection; the engine will flag an unusual
    // combination for review without turning it into a hard stop.
    patch({ intervalKey });
  };

  const toggleAttestation = (key: string, value: boolean) => {
    updateEncounter((previous) => ({
      ...previous,
      attestations: {
        ...previous.attestations,
        [key]: value,
      } as InjectionEncounter["attestations"],
    }));
  };

  const toggleVerification = (key: string, value: boolean) => {
    updateEncounter((previous) => ({
      ...previous,
      verifications: {
        ...previous.verifications,
        [key]: value,
      } as InjectionEncounter["verifications"],
    }));
  };

  const toggleSafetyConcern = (key: string, value: boolean) => {
    updateEncounter((previous) => {
      const current = new Set(previous.activeSafetyConcerns ?? []);
      if (value) current.add(key);
      else current.delete(key);
      return { ...previous, activeSafetyConcerns: [...current] };
    });
  };

  const patchInitiation = (partial: Partial<NonNullable<InjectionEncounter["initiation"]>>) => {
    patch({ initiation: { ...(encounter.initiation ?? emptyInjectionInitiation()), ...partial } });
  };

  const patchInitiationSecond = (
    partial: Partial<NonNullable<InjectionEncounter["initiation"]>["second"]>,
  ) => {
    const initiation = encounter.initiation ?? emptyInjectionInitiation();
    patch({ initiation: { ...initiation, second: { ...initiation.second, ...partial } } });
  };

  const onInitiationProtocolChange = (protocol: InjectionInitiationProtocol) => {
    patch({ initiation: { ...emptyInjectionInitiation(), protocol } });
    patchDetails({
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        pairedSecond: undefined,
      },
    });
  };

  const onPairedDoseChange = (dose: string) => {
    patchInitiationSecond({ dose, ndc: "" });
    patchDetails({
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        pairedSecond: undefined,
      },
    });
  };

  const onAddendumAuthorChange = (value: string) => {
    setAddendumAuthor(value);
    setLegacyFieldValue("injAddendumAuthor", value);
  };

  const onAddendumTextChange = (value: string) => {
    setAddendumText(value);
    setLegacyFieldValue("injAddendumText", value);
  };

  const saveAddendum = () => {
    document.querySelector<HTMLButtonElement>("[data-inj-addendum]")?.click();
    setAddendumText("");
    window.setTimeout(() => setAddenda(readAddenda()), 60);
  };

  const presentationOutput = evaluation?.output as InjectionOutputWithPresentation | undefined;
  const medication = encounter.medicationKey ? INJECTION_MEDICATIONS[encounter.medicationKey] : null;
  const initiationOptions = injectionInitiationOptions(encounter.medicationKey);
  const initiationConfig = encounter.initiation?.protocol
    ? injectionInitiationConfig(encounter.initiation.protocol, encounter.medicationKey)
    : null;
  // Show every labeled strength. Selecting a strength with only one compatible
  // cadence fills that cadence below, rather than hiding the strength because a
  // default interval was pre-filled when the medication was chosen.
  const doseOptions = medication?.doses ?? [];
  const primaryNdcQuery: NdcOptionQuery = {
    medicationKey: encounter.medicationKey,
    dose: encounter.dose,
  };
  const pairedMedicationKey =
    encounter.initiation?.second.productKey ??
    pairedMedicationKeyFor(encounter.initiation?.protocol, encounter.medicationKey);
  const pairedMedication = pairedMedicationKey ? INJECTION_MEDICATIONS[pairedMedicationKey] : null;
  // Component 2's dose must match the paired product's labeled strength
  // exactly (see injection.ts's secondDoseRecognized check), so it is offered
  // as a picker rather than free text - typed variants like "675 MG" pass a
  // human reading the label but fail that catalog-membership test.
  const pairedDoseOptions = pairedMedication?.doses ?? [];
  const pairedNdcQuery: NdcOptionQuery = {
    medicationKey: pairedMedicationKey,
    dose: encounter.initiation?.second.dose ?? "",
  };
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
  const packageState = !encounter.traceability.ndc.trim()
    ? "INCOMPLETE"
    : documentationMetadata?.ndcSelection?.primary?.source === "custom"
      ? "MANUAL"
      : documentationMetadata?.ndcSelection?.primary
        ? "MATCH"
        : "ENTERED";
  // An explicit empty list means the catalog intentionally does not impose a
  // product-specific anatomic default (for example, an active-order site
  // path). It must not silently turn into a generic radio list.
  const evaluatedSites = presentationOutput?.allowedSites;
  const siteRequiresActiveOrderEntry = Boolean(medication && Array.isArray(evaluatedSites) && !evaluatedSites.length);
  const allowedSites = medication
    ? Array.isArray(evaluatedSites)
      ? evaluatedSites
      : [...ALL_INJECTION_SITES]
    : [...ALL_INJECTION_SITES];
  const recommendedSite = presentationOutput?.recommendedSite ?? "";

  useEffect(() => {
    // A rotation suggestion is already constrained to the active product's
    // allowed sites. When the current order has no site yet, select that
    // alternate for the MA; any explicit site selection remains untouched.
    if (
      locked ||
      nonAdministration ||
      siteRequiresActiveOrderEntry ||
      !recommendedSite ||
      encounter.site.trim()
    ) {
      return;
    }
    patch({ site: recommendedSite });
    // `patch` is intentionally render-local; using the value dependencies
    // prevents a manual site choice from being overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.site, locked, nonAdministration, recommendedSite, siteRequiresActiveOrderEntry]);

  const needleProjection = presentationOutput?.needle;

  // The dose-history grid — the most recognisably-MAR artifact, and the one
  // that makes LAI site rotation legible at a glance. Read-only, and read
  // through the typed repository rather than reaching into localStorage: it
  // is the same store the live app already writes on every completed
  // administration, so this shows real history, not a placeholder.
  const doseHistory = useMemo(() => {
    const result = new SiteHistoryRepository(browserSafeStorage()).list(
      encounter.patient.name,
      encounter.patient.dob,
    );
    return result.ok ? [...result.value].reverse() : [];
  }, [encounter.patient.name, encounter.patient.dob]);
  const repeatsPreviousSite = presentationOutput?.repeatsPreviousSite ?? false;
  const safetyTriggers = INJECTION_SAFETY_TRIGGERS.filter(
    (trigger) =>
      !trigger.medications ||
      (encounter.medicationKey !== "" && trigger.medications.includes(encounter.medicationKey)),
  );
  const activeSafetyConcerns = new Set(encounter.activeSafetyConcerns ?? []);
  const activePatientName = activePatient.name?.trim() ?? "";
  const activePatientDob = activePatient.dob?.trim() ?? "";
  const localPatientAvailable = Boolean(activePatientName || activePatientDob);
  const patientNeedsRestore =
    localPatientAvailable &&
    (encounter.patient.name.trim() !== activePatientName ||
      encounter.patient.dob.trim() !== activePatientDob);
  const sessionStaff = staffSignInValue.trim();
  const staffNeedsRestore = Boolean(
    sessionStaff && encounter.administeredBy.trim() !== sessionStaff,
  );

  const administered = encounter.disposition.kind === "administered";
  // AVS is deliberately gated separately from `administered`: it only needs
  // enough to describe what was given, not the final disposition choice or
  // complete safety record. The legacy engine's own AVS-availability check
  // (`canPrintAvs()` in the RC535 clinical-safety module) mirrors this same,
  // narrower set of fields.
  const hasAdministrationDetailsForAvs = Boolean(
    encounter.medicationKey &&
      encounter.dose.trim() &&
      encounter.route.trim() &&
      encounter.site.trim() &&
      encounter.administrationDate.trim(),
  );
  const patientScreeningReady = canBuildInjectionPatientScreenDocument(encounter);
  const patientScreeningDisabledReason =
    encounter.medicationKey === "other"
      ? undefined
      : "Choose the exact medication dose before printing the patient screening form.";
  const stagePatientScreeningPrint = (language: PatientScreenLanguage) => {
    // The native dialog is rendered outside the shell, so let it unmount before
    // the dedicated print class hides the rest of the workstation.
    setPatientScreeningDialogOpen(false);
    window.requestAnimationFrame(() => {
      printInjectionPatientScreening(encounter, language);
    });
  };
  const noteInput = evaluation ? injectionEncounterToDocumentationInput(encounter, evaluation) : null;
  const noteText = noteInput ? DocumentationEngine.format("injection", noteInput).text : "";
  const stops = evaluation?.stops ?? [];
  const administrationReviewCurrent = hasCurrentInjectionAdministrationReview(encounter);
  const administrationReviewEvaluation = useMemo(
    () =>
      InjectionEngine.evaluate(
        {
          ...encounter,
          disposition: { kind: "" },
        },
        {},
      ),
    [encounter],
  );
  const administrationReviewStops = administrationReviewEvaluation.stops.filter(
    (item) => item.code !== "disposition.required",
  );
  const canConfirmAdministration =
    administrationReviewEvaluation.readiness !== "idle" && administrationReviewStops.length === 0;
  const administrationReviewBlocker = administrationReviewStops[0]?.message;
  // The routine timing warning and the Sustenna Day 8 window warning are
  // different checks with different messages - the timing readout's own
  // message only covers the former, so the late-dose dialog needs to look up
  // whichever warning is actually driving lateDoseWarning to explain itself.
  const lateDoseWarningMessage = evaluation?.warnings.find(
    (item) => item.code === "timing.review" || item.code === "initiation.sustenna.outside-window",
  )?.message;
  const currentLateDoseReview = Boolean(
    evaluation?.output.lateDoseWarning && hasCurrentLateDoseReview(encounter),
  );
  const lateDoseReviewFingerprint = injectionTimingReviewFingerprint(encounter);
  const incompleteFields = useMemo(
    () => new Set(stops.flatMap((item) => (item.field ? [item.field] : []))),
    [stops],
  );
  const stopsByTab = countStopsByTab(stops, tabForInjectionField);
  const warningsByTab = countStopsByTab(
    evaluation?.warnings ?? [],
    tabForInjectionField,
  );
  const transactionStatus = projectWorkflowTransactionStatus({ evaluation, locked });

  const requirements = useMemo(
    () => ({
      ...legacyRequirementFallback(encounter, nonAdministration),
      ...(presentationOutput?.requirements ?? {}),
    }),
    [encounter, nonAdministration, presentationOutput?.requirements],
  );

  // The ordering provider is a register when the site has a roster and free
  // text when it does not, so the prompt has to describe whichever is on screen
  // while still saying where the name comes from.
  const orderingProviderPrompt = hasProviderRegister(undefined, { prescribersOnly: true })
    ? "Select the ordering provider named on the active order — F9 lists the register"
    : "Enter the ordering provider from the active order";

  const responseDetailOptions = useMemo(() => {
    const details = findInjectionResponseOption(encounter.response.kind)?.details ?? [];
    return details.map((detail) => ({
      key: detail.key,
      label: detail.label,
      description: detail.fragment,
    }));
  }, [encounter.response.kind]);

  const showInitiationPath =
    !nonAdministration &&
    initiationOptions.length > 0 &&
    requirements["initiation.protocol"]?.state !== "hidden";
  const visibleMedicationVerifications = (presentationOutput?.requiredVerifications ?? medication?.verifications ?? []).filter(
    (key) => requirements[`verifications.${key}`]?.state !== "hidden",
  );

  const visibleTabs = nonAdministration
    ? INJECTION_TABS.filter(([key]) => key !== "administration" && key !== "product")
    : INJECTION_TABS;
  const activePage = Math.max(
    1,
    visibleTabs.findIndex(([key]) => key === tab) + 1,
  );

  // The evaluator owns cadence semantics (including calendar-month
  // products).  The worksheet only projects its calculated value; it does
  // not keep a second day-count calculation that could drift from the engine.
  const calculatedNextDue =
    evaluation?.calculatedDates.expectedNextDoseDate ??
    evaluation?.calculatedDates.nextDoseDate ??
    evaluation?.calculatedDates.expectedNextDue ??
    "";
  const suggestedNextDose = calculatedNextDue;
  // Legacy warned staff and offered a same-week snap whenever the displayed
  // return date - calculated or manually entered - landed on a Saturday or
  // Sunday. `weekendSnapDates` is null for a weekday or an empty/invalid
  // date, so this doubles as the "is it a weekend" check.
  const nextDoseWeekendSnap = weekendSnapDates(encounter.nextDoseDate || suggestedNextDose);
  const manualReturnDate = medication?.key === "other";
  const oneTimeOtherWithoutReturn = Boolean(
    manualReturnDate && encounter.intervalKey === "once" && !encounter.nextDoseDate,
  );
  const nextDoseMetadata = documentationMetadata?.nextDose;
  const nextDoseIsCalculated = nextDoseMetadata?.source === "calculated";
  const nextDoseIsManual = nextDoseMetadata?.source === "manual";
  // Drafts created before return-date provenance was introduced can carry a
  // visible custom-medication date with no authority/reason metadata. Keep
  // that date rather than inventing a q4wk replacement, but make its unknown
  // provenance impossible to mistake for a verified active-order return.
  const legacyOtherReturnDateNeedsReview = Boolean(
    manualReturnDate && encounter.nextDoseDate && !nextDoseMetadata?.source,
  );
  const nextDoseOverrideComplete = hasCompleteManualNextDoseProvenance(
    nextDoseMetadata,
    encounter.nextDoseDate,
  );
  const transactionStarted = evaluation?.readiness !== "idle";
  const injectionLedgerTabs = visibleTabs.map(([key, label]) => {
    const stopCount = stopsByTab.get(key) ?? 0;
    const warningCount = warningsByTab.get(key) ?? 0;
    const complete = {
      order: Boolean(
        encounter.patient.name.trim() &&
          encounter.patient.dob.trim() &&
          encounter.reason &&
          encounter.orderingProvider.trim(),
      ),
      product: Boolean(
        encounter.medicationKey &&
          encounter.traceability.ndc.trim() &&
          encounter.traceability.lot.trim() &&
          encounter.traceability.expiration.trim(),
      ),
      administration: Boolean(
        encounter.administrationDate &&
          encounter.administrationTime &&
          encounter.administeredBy.trim() &&
          encounter.route.trim() &&
          encounter.site.trim() &&
          encounter.response.kind,
      ),
      review: Boolean(encounter.disposition.kind && stopCount === 0),
    }[key];
    return {
      key,
      label,
      stopCount,
      state: projectWorkflowLedgerState({
        locked,
        started: transactionStarted,
        active: tab === key,
        stopCount,
        warningCount,
        complete,
      }),
      detail:
        stopCount > 0
          ? `${stopCount} unresolved requirement${stopCount === 1 ? "" : "s"}`
          : warningCount > 0
            ? `${warningCount} review item${warningCount === 1 ? "" : "s"}`
            : complete
              ? "Transaction page complete"
              : "Transaction page pending",
    };
  });
  const legacyManualNextDoseNeedsReview =
    legacyOtherReturnDateNeedsReview || (nextDoseIsManual && !nextDoseOverrideComplete);
  const nextDoseCalculationInput = `${encounter.administrationDate}|${encounter.intervalKey}`;

  /**
   * Where the return target came from, as the register's trailing note.
   *
   * The order of these branches is the point. A Day 1 initiation is followed
   * by Day 8, not by the ordered maintenance interval, so naming the cadence
   * beside a Day 8 date would state a provenance the date does not have - and
   * an overridden date follows neither, so it carries the recorded reason
   * instead. A wrong provenance line is worse than none: it invites staff to
   * re-derive the date from a rule that never produced it.
   */
  const nextDoseProvenanceNote = (): string | undefined => {
    if (legacyOtherReturnDateNeedsReview) {
      return "· legacy return date — verify against the active order";
    }
    if (nextDoseIsManual) {
      return `· ${nextDoseMetadata?.overrideReason || "manual date requires review"}`;
    }
    if (!suggestedNextDose) {
      return medication?.key === "other"
        ? oneTimeOtherWithoutReturn
          ? "· one-time order — no routine return date is required"
          : "· enter the return date from the active order"
        : "· enter the administration date and order interval";
    }
    if (encounter.initiation?.protocol === "sustenna-day1") {
      return `· Day 8 target, 7 days from ${registerDate(encounter.administrationDate)}`;
    }
    const cadence = evaluation?.output.timing.cadenceLabel || encounter.intervalKey;
    return `· ${cadence} from ${registerDate(encounter.administrationDate)}`;
  };

  const applyCalculatedNextDose = (value: string) => {
    autoCalculatedNextDue.current = value;
    patch({ nextDoseDate: value });
    patchDetails({
      nextDose: {
        value,
        source: "calculated",
        calculatedFrom: nextDoseCalculationInput,
      },
    });
  };

  const applyManualNextDose = (
    value: string,
    override: {
      kind: "active-order" | "provider-direction";
      reason: string;
      provider?: string;
    },
  ) => {
    autoCalculatedNextDue.current = "";
    patch({ nextDoseDate: value });
    patchDetails({
      nextDose: {
        value,
        source: "manual",
        calculatedFrom: nextDoseCalculationInput,
        overrideKind: override.kind,
        overrideReason: override.reason.trim(),
        overrideProvider:
          override.kind === "provider-direction" ? override.provider?.trim() : undefined,
        recordedAt: new Date().toISOString(),
      },
    });
  };

  /** One-click version of the manual override, for the weekend snap
   * suggestions - it still records real override provenance rather than
   * quietly moving the date the way the legacy snap chips did. */
  const applyWeekendSnap = (value: string) => {
    applyManualNextDose(value, {
      kind: "active-order",
      reason: "Weekend-adjusted from the calculated return date",
    });
  };

  const selectDisposition = (kind: InjectionDisposition["kind"]) => {
    if (kind === "administered") {
      patchDisposition({
        kind,
        provider: "",
        time: "",
        outcome: "",
        reviewedBy: staffSignInValue.trim() || encounter.administeredBy.trim(),
        reviewedAt: new Date().toISOString(),
        reviewFingerprint: injectionAdministrationReviewFingerprint(encounter),
      });
      return;
    }
    patchDisposition({
      kind,
      reviewedBy: "",
      reviewedAt: "",
      reviewFingerprint: "",
    });
  };

  const openNextDoseOverride = () => {
    setNextDoseOverrideDate(
      (nextDoseIsManual || legacyOtherReturnDateNeedsReview) && isValidIsoDate(encounter.nextDoseDate)
        ? encounter.nextDoseDate
        : suggestedNextDose,
    );
    setNextDoseOverrideKind(nextDoseMetadata?.overrideKind ?? "active-order");
    setNextDoseOverrideReason(nextDoseMetadata?.overrideReason ?? "");
    setNextDoseOverrideProvider(nextDoseMetadata?.overrideProvider ?? "");
    setNextDoseOverrideOpen(true);
  };

  const confirmNextDoseOverride = () => {
    if (!isValidIsoDate(nextDoseOverrideDate) || !nextDoseOverrideReason.trim()) return;
    if (nextDoseOverrideKind === "provider-direction" && !nextDoseOverrideProvider.trim()) return;
    applyManualNextDose(nextDoseOverrideDate, {
      kind: nextDoseOverrideKind,
      reason: nextDoseOverrideReason,
      provider: nextDoseOverrideProvider,
    });
    setNextDoseOverrideOpen(false);
  };

  const applyPrimaryNdc = (value: string, selection?: InjectionNdcSelection) => {
    patch({ traceability: { ...encounter.traceability, ndc: value } });
    patchDetails({
      clinicalReferenceVersion:
        presentationOutput?.clinicalReferenceVersion ?? documentationMetadata?.clinicalReferenceVersion,
      ndcSelection: {
        ...(documentationMetadata?.ndcSelection ?? {}),
        primary: selection,
      },
    });
  };

  const applyPairedNdc = (value: string, selection?: InjectionNdcSelection) => {
    patchInitiationSecond({ ndc: value });
    patchDetails({
      clinicalReferenceVersion:
        presentationOutput?.clinicalReferenceVersion ?? documentationMetadata?.clinicalReferenceVersion,
      ndcSelection: {
        ...(documentationMetadata?.ndcSelection ?? {}),
        pairedSecond: selection,
      },
    });
  };

  useEffect(() => {
    if (!primaryNdcQuery.medicationKey || !primaryNdcQuery.dose) {
      setPrimaryNdcLookup({ options: [], remoteStatus: "not-applicable" });
      return;
    }
    const baseline = ndcResolver.lookup(primaryNdcQuery);
    setPrimaryNdcLookup(baseline);
    let active = true;
    void ndcResolver.refreshIfStale(primaryNdcQuery).then((result) => {
      if (active) setPrimaryNdcLookup(result);
    });
    return () => {
      active = false;
    };
  }, [ndcResolver, primaryNdcQuery.medicationKey, primaryNdcQuery.dose]);

  useEffect(() => {
    if (!pairedNdcQuery.medicationKey || !pairedNdcQuery.dose) {
      setPairedNdcLookup({ options: [], remoteStatus: "not-applicable" });
      return;
    }
    const baseline = ndcResolver.lookup(pairedNdcQuery);
    setPairedNdcLookup(baseline);
    let active = true;
    void ndcResolver.refreshIfStale(pairedNdcQuery).then((result) => {
      if (active) setPairedNdcLookup(result);
    });
    return () => {
      active = false;
    };
  }, [ndcResolver, pairedNdcQuery.medicationKey, pairedNdcQuery.dose]);

  // Fill an expected next due date once its two real inputs exist. A later
  // staff change is preserved: only an empty value or the last calculation is
  // replaced when the date/cadence changes.
  useEffect(() => {
    if (locked || nonAdministration) return;
    const current = encounter.nextDoseDate;
    if (!suggestedNextDose) {
      // No calculated date currently applies (e.g. switching onto a
      // provider-directed, non-calculating initiation path). Clear a
      // leftover auto-calculated value so staff aren't looking at a stale
      // date computed under a different protocol/interval - but never touch
      // a date staff actually typed in themselves.
      const wasAutoCalculated =
        current && (current === autoCalculatedNextDue.current || nextDoseMetadata?.source === "calculated");
      if (wasAutoCalculated) {
        autoCalculatedNextDue.current = "";
        patch({ nextDoseDate: "" });
        patchDetails({ nextDose: undefined });
      }
      return;
    }
    const canReplace =
      !current ||
      current === autoCalculatedNextDue.current ||
      nextDoseMetadata?.source === "calculated";
    if (!canReplace) return;
    if (current === suggestedNextDose) {
      autoCalculatedNextDue.current = suggestedNextDose;
      if (nextDoseMetadata?.source !== "calculated") {
        patchDetails({
          nextDose: {
            value: suggestedNextDose,
            source: "calculated",
            calculatedFrom: nextDoseCalculationInput,
          },
        });
      }
      return;
    }
    applyCalculatedNextDose(suggestedNextDose);
    // `patch` mirrors the same value to legacy and is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.nextDoseDate, locked, nextDoseMetadata?.source, nonAdministration, suggestedNextDose]);

  useEffect(() => {
    if (!nonAdministration) return;
    if (tab === "administration" || tab === "product") setTab("review");
  }, [nonAdministration, tab]);

  // Seeds the dialog's editable fields from whatever is actually stored on
  // the encounter, not from whatever the fields happened to hold last time
  // the dialog was open - otherwise "Edit" on an already-reviewed record (or
  // one just reopened from a saved draft) would show a stale/default choice
  // instead of what staff actually recorded.
  const openLateDoseDialog = () => {
    const stored = currentLateDoseReview ? encounter.details?.lateDoseReview : undefined;
    setLateDoseReviewChoice(stored === "other" ? "other" : "provider-authorized");
    setLateDoseReviewNoteDraft(currentLateDoseReview ? encounter.details?.lateDoseReviewNote ?? "" : "");
    setLateDoseReviewProviderDraft(
      stored === "provider-authorized" ? encounter.details?.lateDoseReviewProvider ?? "" : "",
    );
    setLateDoseReviewTimeDraft(
      stored === "provider-authorized" ? encounter.details?.lateDoseReviewTime ?? "" : "",
    );
    setLateDoseDialogOpen(true);
  };

  // A dose documented after its expected/window boundary gets a brief
  // MEDITECH-style review prompt. It records provider approval or another
  // documented plan, but it never overrides an unrelated clinical stop. It
  // fires on arrival at Review, the
  // last tab, rather than the instant the fields read as late: administration
  // date defaults to today, so entering an old prior-dose date alone (before
  // the actual administration date is even typed) would otherwise read as
  // "40 days late" and pop a modal that blocks staff mid-entry, on a value
  // nobody has finished typing yet. By Review the real dates are in.
  useEffect(() => {
    if (locked || tab !== "review" || !evaluation?.output.lateDoseWarning) return;
    if (currentLateDoseReview) return;
    if (lateDosePromptedFor.current === lateDoseReviewFingerprint) return;
    lateDosePromptedFor.current = lateDoseReviewFingerprint;
    openLateDoseDialog();
    // `openLateDoseDialog` reads current encounter/details by closure and is
    // recreated each render; including it would refire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    currentLateDoseReview,
    lateDoseReviewFingerprint,
    evaluation?.output.lateDoseWarning,
    locked,
  ]);

  const confirmLateDoseReview = () => {
    patchDetails({
      lateDoseReview: lateDoseReviewChoice,
      lateDoseReviewNote: lateDoseReviewNoteDraft.trim(),
      lateDoseReviewProvider:
        lateDoseReviewChoice === "provider-authorized"
          ? lateDoseReviewProviderDraft.trim()
          : "",
      lateDoseReviewTime:
        lateDoseReviewChoice === "provider-authorized"
          ? lateDoseReviewTimeDraft.trim()
          : "",
      lateDoseReviewFingerprint,
    });
    setLateDoseDialogOpen(false);
  };

  const administrationExceptionEditor =
    nonAdministration ? null : (
      <TransactionLine
        label="ADMINISTRATION EXCEPTION — Something changed during or after administration"
        documented={encounter.details?.administrationException ?? false}
        open={encounter.details?.administrationException ?? false}
        onToggle={() => patchDetails({ administrationException: !encounter.details?.administrationException })}
      >
          {encounter.details?.administrationException && (
            <>
              <Field label="What changed / what was observed" field="details.exceptionSummary">
                <textarea
                  value={encounter.details?.exceptionSummary ?? ""}
                  onInput={(event) => patchDetails({ exceptionSummary: event.currentTarget.value })}
                />
              </Field>
              <div class="wfp-row">
                <Field label="Recipient notified" field="details.exceptionRecipient">
                  <input
                    value={encounter.details?.exceptionRecipient ?? ""}
                    onInput={(event) =>
                      patchDetails({ exceptionRecipient: event.currentTarget.value })
                    }
                  />
                </Field>
                <Field label="Notification / decision time" field="details.exceptionTime">
                  <WorkstationDateField
                    mode="datetime"
                    value={encounter.details?.exceptionTime ?? ""}
                    onCommit={(next) => patchDetails({ exceptionTime: next })}
                  />
                </Field>
              </div>
              <Field label="Direction, action, and next step" field="details.exceptionOutcome">
                <textarea
                  value={encounter.details?.exceptionOutcome ?? ""}
                  onInput={(event) => patchDetails({ exceptionOutcome: event.currentTarget.value })}
                />
              </Field>
            </>
          )}
      </TransactionLine>
    );

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <InjectionRequirementsContext.Provider value={requirements}>
        <InjectionIncompleteFieldsContext.Provider value={incompleteFields}>
          <div class="wfp-transaction-chrome">
            <div class="wfp-summary-bar wfp-injection-context">
              <h1 class="wfp-workflow-title"><strong>Injection worksheet</strong></h1>
              {locked ? (
                <span class="wfp-status-flag is-idle">Read only</span>
              ) : (
                <StatusFlag
                  idle={(evaluation?.readiness ?? "idle") === "idle"}
                  stopCount={stops.length}
                  warningCount={evaluation?.warnings.length ?? 0}
                  onOpenRequirements={() => setRequirementsOpen(true)}
                />
              )}
              <WorkflowSummaryFact
                label="DUE"
                value={suggestedNextDose || "PENDING"}
                tone={suggestedNextDose ? "normal" : "attention"}
              />
              <WorkflowSummaryFact
                label="PKG"
                value={packageState}
                tone={packageState === "INCOMPLETE" ? "attention" : "normal"}
              />
              {INJECTION_PATIENT_SCREENING_ENABLED && encounter.medicationKey && (
                <button
                  type="button"
                  class="cd2004-link-button wfp-summary-print-avs"
                  data-patient-screening-print="summary"
                  aria-haspopup="dialog"
                  onClick={() => setPatientScreeningDialogOpen(true)}
                  disabled={!patientScreeningReady}
                  title={
                    patientScreeningReady
                      ? "Print the patient screening and consent form."
                      : patientScreeningDisabledReason
                  }
                >
                  <DesktopIcon name="print" />
                  Print patient screening
                </button>
              )}
              <span class="wfp-summary-spacer" />
              <span
                class="wfp-transaction-readout"
                aria-label={`Worksheet page ${activePage} of ${visibleTabs.length}`}
              >
                <b>{transactionStatus.label}</b>
                <span>PG {activePage}/{visibleTabs.length}</span>
              </span>
              {!locked && patientNeedsRestore && (
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() =>
                    patch({ patient: { name: activePatientName, dob: activePatientDob } })
                  }
                >
                  Use selected local patient
                </button>
              )}
              {!locked && staffNeedsRestore && (
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => patch({ administeredBy: sessionStaff })}
                >
                  Restore session staff
                </button>
              )}
            </div>

            <WorkflowLedgerTabs
              tabs={injectionLedgerTabs}
              activeTab={tab}
              onChange={setTab}
              ariaLabel="Injection transaction pages and state"
              idPrefix="injection-ledger"
            />
          </div>

      <div
        class="wfp-transaction-page"
        role="region"
        aria-label="Injection clinical page"
        tabIndex={0}
      >
      {invalidationReceipt && (
        <div class="wfp-invalidation-receipt" role="status">
          <strong>INVALIDATION RECEIPT</strong><span>{invalidationReceipt}</span>
          <button type="button" class="cd2004-link-button" aria-label="Dismiss invalidation receipt" onClick={() => setInvalidationReceipt(null)}>×</button>
        </div>
      )}

      <OperatorGuidance
        tab={tab}
        medication={medication}
        evaluation={evaluation}
        allowedSites={allowedSites}
        recommendedSite={recommendedSite}
        suggestedNextDose={suggestedNextDose}
        nonAdministration={nonAdministration}
        onNavigate={setTab}
      />

      {/* A locked record is read-only, so there is nothing to act on. */}
      {!locked && (
        <OutstandingRequirements<InjectionTab>
          open={requirementsOpen}
          onClose={() => setRequirementsOpen(false)}
          stops={stops}
          tabForField={tabForInjectionField}
          tabLabels={INJECTION_TAB_LABELS}
          onNavigate={(target) =>
            setTab(nonAdministration && (target === "administration" || target === "product") ? "review" : target)
          }
        />
      )}

      <fieldset disabled={locked} style="border:none;padding:0;margin:0;display:contents">

      {tab === "order" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("injection-ledger", "order")}
          aria-labelledby={workflowLedgerTabId("injection-ledger", "order")}
        >
          <div class="wfp-section" role="group" aria-label="Patient & ordering provider">
            <h2 class="wfp-section-head">Patient &amp; ordering provider</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Patient name" field="patient.name" source={projectCarriedFieldSource(encounter.patient.name, activePatientName, "CHART")}>
                  <input
                    value={encounter.patient.name}
                    placeholder="Last, First"
                    onInput={(event) => patchPatient({ name: event.currentTarget.value })}
                    onBlur={flushPatientIdentityLegacySync}
                  />
                </Field>
                <Field label="DOB" field="patient.dob" width="date" source={projectCarriedFieldSource(encounter.patient.dob, activePatientDob, "CHART")}>
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    inputMode="numeric"
                    onInput={(event) =>
                      patchPatient({ dob: formatDobAsTyped(event.currentTarget.value) })
                    }
                    onBlur={flushPatientIdentityLegacySync}
                  />
                </Field>
                <Field
                  label="Ordering provider"
                  field="orderingProvider"
                  prompt={orderingProviderPrompt}
                >
                  <ProviderField
                    prescribersOnly
                    value={encounter.orderingProvider}
                    onChange={(next) => patch({ orderingProvider: next })}
                  />
                </Field>
              </div>
              <Field
                label="Verified active-order purpose"
                field="details.purpose"
                hint="Do not enter a diagnosis unless ordered/documented"
              >
                <input
                  value={encounter.details?.purpose ?? ""}
                  placeholder="Encounter context from the active order"
                  onInput={(event) => patchDetails({ purpose: event.currentTarget.value })}
                />
              </Field>
              <Field label="Encounter type" field="reason">
                <OptionList<InjectionReason>
                  name="inj-reason"
                  value={encounter.reason}
                  onChange={(value) => patch({ reason: value })}
                  options={INJECTION_REASON_OPTIONS}
                  placeholder="Select encounter type"
                  inline
                />
              </Field>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Ordered medication">
            <h2 class="wfp-section-head">Ordered medication</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Drug" field="medicationKey">
                  <select
                    name="inj-medication"
                    value={encounter.medicationKey}
                    onChange={(event) =>
                      onMedicationChange(event.currentTarget.value as InjectionMedicationKey | "")
                    }
                  >
                    <option value="">Select medication</option>
                    {Object.values(INJECTION_MEDICATIONS).map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {encounter.medicationKey === "other" && (
                  <Field label="Medication name" field="customMedication" hint="Required for Other">
                    <input
                      value={encounter.customMedication ?? ""}
                      placeholder="Drug name"
                      onInput={(event) => patch({ customMedication: event.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field
                  label="Dose"
                  field="dose"
                  hint={
                    medication?.dosesByInterval
                      ? "All labeled strengths are shown. Selecting a strength fills its usual interval; provider-directed schedules remain available for review."
                      : undefined
                  }
                >
                  {encounter.medicationKey === "other" ? (
                    <input
                      name="inj-dose"
                      value={encounter.dose}
                      placeholder="Exact ordered dose"
                      onInput={(event) => onDoseChange(event.currentTarget.value)}
                    />
                  ) : (
                    <select
                      name="inj-dose"
                      value={encounter.dose}
                      onChange={(event) => onDoseChange(event.currentTarget.value)}
                    >
                      <option value="">Select dose</option>
                      {doseOptions.map((dose) => (
                        <option key={dose} value={dose}>
                          {dose}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Route" field="route">
                  <input
                    name="inj-route"
                    value={encounter.route}
                    placeholder="IM / SubQ"
                    onInput={(event) => patch({ route: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Interval" field="intervalKey">
                  <select
                    name="inj-interval"
                    value={encounter.intervalKey}
                    onChange={(event) =>
                      onIntervalChange(event.currentTarget.value as InjectionIntervalKey | "")
                    }
                  >
                    <option value="">Select interval</option>
                    {INJECTION_INTERVAL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Needle / technique"
                field="technique"
                hint="Record the actual needle and technique used; the nearby readout is reference guidance only."
              >
                <input
                  value={encounter.technique ?? ""}
                  placeholder="Document actual needle gauge, length, and technique"
                  onInput={(event) => patch({ technique: event.currentTarget.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "order" && (
        <div class="wfp-tabpanel wfp-tabpanel-continuation">
          <div class="wfp-section" role="group" aria-label="Schedule & next dose">
            <h2 class="wfp-section-head">Schedule &amp; next dose</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Prior dose" field="priorDoseDate">
                  <WorkstationDateField
                    value={encounter.priorDoseDate}
                    onCommit={(next) => patch({ priorDoseDate: next })}
                  />
                </Field>
                <Field label="Prior site" field="priorSite">
                  <select
                    value={encounter.priorSite ?? ""}
                    onChange={(event) => patch({ priorSite: event.currentTarget.value })}
                  >
                    <option value="">—</option>
                    {ALL_INJECTION_SITES.map((site) => (
                      <option key={site} value={site}>
                        {site}
                      </option>
                    ))}
                  </select>
                </Field>
                {!nonAdministration && (
                  <Field label="Administration date" field="administrationDate">
                    <WorkstationDateField
                      value={encounter.administrationDate}
                      onCommit={(next) => patch({ administrationDate: next })}
                    />
                  </Field>
                )}
                {!nonAdministration && (
                  <div class="wfp-field-action">
                    <button type="button" class="cd2004-command-button" onClick={() => patch(currentAdministrationTimestamp())}>Use current date/time</button>
                    <small>Captures both fields once; it will not refresh automatically.</small>
                  </div>
                )}
              </div>
              {/* One register replaces the old readout card and the tinted
                  banner beside it. Every value is read straight off the
                  engine's own timing evaluation - this surfaces what it
                  already computed and adds no gating of its own. The window
                  dates come from the evaluation's structured fields rather
                  than its prose message, which is what keeps every date on
                  this screen in one format. */}
              <ScheduleRegister
                title="SCHEDULE — NEXT DOSE"
                marker={
                  oneTimeOtherWithoutReturn
                    ? "N/A"
                    : legacyManualNextDoseNeedsReview
                    ? "REVIEW"
                    : nextDoseOverrideComplete
                      ? "OVR"
                      : suggestedNextDose
                        ? "CALC"
                        : "PENDING"
                }
                verdict={
                  legacyManualNextDoseNeedsReview
                    ? "NEEDS REVIEW"
                    : nonAdministration || !evaluation
                      ? undefined
                      : injectionTimingVerdict(evaluation.output.timing)
                }
                tone={
                  legacyManualNextDoseNeedsReview
                    ? "warning"
                    : nonAdministration || !evaluation
                      ? "neutral"
                      : injectionTimingTone(evaluation.output.timing)
                }
                rows={[
                  {
                    label: "Next dose due",
                    value: registerDate(encounter.nextDoseDate || suggestedNextDose),
                    // Built from the parts rather than the persisted
                    // `calculatedFrom` string, which stores ISO on purpose and
                    // must keep doing so.
                    note: nextDoseProvenanceNote(),
                    flag: nextDoseWeekendSnap ? "WEEKEND" : undefined,
                    flagTone: nextDoseWeekendSnap ? "warning" : undefined,
                  },
                  ...(nonAdministration || !evaluation
                    ? []
                    : [
                        {
                          label: "Days since prior",
                          value:
                            evaluation.output.timing.daysSincePrior === null
                              ? "—"
                              : String(evaluation.output.timing.daysSincePrior),
                          note:
                            evaluation.output.timing.earliestDay !== null &&
                            evaluation.output.timing.latestDay !== null
                              ? `· window day ${evaluation.output.timing.earliestDay}–${evaluation.output.timing.latestDay}`
                              : undefined,
                          flag: injectionTimingDayFlag(evaluation.output.timing),
                        },
                      ]),
                  ...(nonAdministration ||
                  !evaluation?.output.timing.earliestDate ||
                  !evaluation.output.timing.latestDate
                    ? []
                    : [
                        {
                          label: "Window",
                          value: `${registerDate(evaluation.output.timing.earliestDate)} – ${registerDate(evaluation.output.timing.latestDate)}`,
                          note: evaluation.output.timing.expectedDate
                            ? `· expected ${registerDate(evaluation.output.timing.expectedDate)}`
                            : undefined,
                        },
                      ]),
                ]}
                bandTitle={
                  nonAdministration || !evaluation
                    ? undefined
                    : injectionTimingStatusLabel(evaluation.output.timing)
                }
                bandDetail={
                  nonAdministration || !evaluation
                    ? undefined
                    : medication &&
                        evaluation.output.timing.state === "warning" &&
                        medication.missedDoseGuidance.trim()
                      ? `${medication.label} guidance: ${medication.missedDoseGuidance}`
                      : evaluation.output.timing.state === "ok"
                        ? "Continue the required active-order and product-specific safety checks."
                        : undefined
                }
                actions={
                  <>
                    <button
                      type="button"
                      class="cd2004-command-button"
                      onClick={openNextDoseOverride}
                    >
                      {manualReturnDate
                        ? "Set return date…"
                        : nextDoseIsManual
                          ? "Review override…"
                          : "Override…"}
                    </button>
                    {suggestedNextDose && nextDoseIsManual && (
                      <button
                        type="button"
                        class="cd2004-link-button"
                        onClick={() => applyCalculatedNextDose(suggestedNextDose)}
                      >
                        Reset to calculated
                      </button>
                    )}
                  </>
                }
              />
              {nextDoseWeekendSnap && (
                <p class="wfp-field-hint">
                  Next dose lands on a weekend.
                  {!locked && (
                    <>
                      {" "}
                      Move to{" "}
                      <button
                        type="button"
                        class="cd2004-link-button"
                        onClick={() => applyWeekendSnap(nextDoseWeekendSnap.friday)}
                      >
                        Fri {registerDate(nextDoseWeekendSnap.friday)}
                      </button>{" "}
                      or{" "}
                      <button
                        type="button"
                        class="cd2004-link-button"
                        onClick={() => applyWeekendSnap(nextDoseWeekendSnap.monday)}
                      >
                        Mon {registerDate(nextDoseWeekendSnap.monday)}
                      </button>
                      .
                    </>
                  )}
                </p>
              )}
              {!nonAdministration && evaluation?.output.lateDoseWarning && (
                <p class="wfp-field-hint">
                  {currentLateDoseReview ? (
                    <>
                      Late-dose review:{" "}
                      {encounter.details?.lateDoseReview === "provider-authorized"
                        ? `provider approval documented — ${encounter.details?.lateDoseReviewProvider} · ${formatReviewDateTime(encounter.details?.lateDoseReviewTime ?? "")}.`
                        : `${encounter.details?.lateDoseReviewNote || "Other review documented"} (does not state provider approval).`}{" "}
                      {!locked && (
                        <button
                          type="button"
                          class="cd2004-link-button"
                          onClick={openLateDoseDialog}
                        >
                          Edit
                        </button>
                      )}
                    </>
                  ) : (
                    !locked && (
                      <button
                        type="button"
                        class="cd2004-link-button"
                        onClick={openLateDoseDialog}
                      >
                        Document provider approval / late-dose review
                      </button>
                    )
                  )}
                </p>
              )}
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Dose history">
            <h2 class="wfp-section-head">
              Dose history
              {doseHistory.length > 0 && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">{doseHistory.length}</span>
              )}
            </h2>
            <div class="wfp-section-body">
              {doseHistory.length === 0 ? (
                <p class="wfp-field-hint">
                  No prior administrations recorded for this patient on this workstation.
                </p>
              ) : (
                <div class="wfp-grid wfp-grid-mar">
                  <div class="wfp-grid-head">
                    <span>Date</span>
                    <span>Medication</span>
                    <span>Route</span>
                    <span>Site</span>
                  </div>
                  {doseHistory.map((entry) => (
                    <div class="wfp-grid-row" key={`${entry.fingerprint}${entry.storedAt}`}>
                      <span class="wfp-grid-cell mono">{entry.date}</span>
                      <span class="wfp-grid-cell">
                        {INJECTION_MEDICATIONS[entry.medKey as InjectionMedicationKey]?.label ??
                          entry.medKey}
                      </span>
                      <span class="wfp-grid-cell">{entry.route}</span>
                      <span class="wfp-grid-cell">{entry.site}</span>
                    </div>
                  ))}
                </div>
              )}
              <p class="wfp-field-hint">
                Read-only rotation history from this workstation's local records. It informs site
                selection; it never gates it.
              </p>
            </div>
          </div>

          {showInitiationPath && (
            <div class="wfp-section" role="group" aria-label="Initiation & paired-injection path">
              <h2 class="wfp-section-head">Initiation &amp; paired-injection path</h2>
              <div class="wfp-section-body">
                <p class="wfp-field-hint">
                  Select a path only when today is an initiation, restart, or Day 8 initiation encounter. Leaving
                  it unselected preserves the routine-maintenance workflow.
                </p>
                <div class="wfp-option-list">
                  {initiationOptions.map((option) => (
                    <label
                      key={option.id}
                      class={`wfp-option-row ${encounter.initiation?.protocol === option.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="inj-initiation"
                        checked={encounter.initiation?.protocol === option.id}
                        onChange={() => onInitiationProtocolChange(option.id)}
                      />
                      <span>
                        <span class="wfp-option-title">{option.title}</span>
                        <div class="wfp-option-desc">{option.sub}</div>
                      </span>
                    </label>
                  ))}
                </div>
                {encounter.initiation?.protocol && (
                  <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => onInitiationProtocolChange("")}
                  >
                    Clear initiation selection
                  </button>
                )}

                {initiationConfig && (
                  <div class="wfp-section" role="group" aria-label="Initiation component">
                    <h2 class="wfp-section-head">{initiationConfig.title}</h2>
                    <div class="wfp-section-body">
                      <p class="wfp-field-hint">{initiationConfig.summary}</p>
                      <div
                        class={`wfp-checkbox-row ${requirements["initiation.planVerified"]?.state === "required" ? "is-required" : ""}`}
                        data-requirement={requirements["initiation.planVerified"]?.state ?? "unprojected"}
                      >
                        <input
                          type="checkbox"
                          id="init-plan-verified"
                          aria-required={requirements["initiation.planVerified"]?.state === "required" || undefined}
                          checked={encounter.initiation?.planVerified ?? false}
                          onChange={(event) => patchInitiation({ planVerified: event.currentTarget.checked })}
                        />
                        <label for="init-plan-verified">
                          Active provider initiation/re-initiation order and current product information verified
                          for this encounter
                          {requirements["initiation.planVerified"]?.state === "required" && (
                            <abbr class="wfp-req" title="Required">*</abbr>
                          )}
                        </label>
                      </div>

                      {initiationConfig.kind === "dual" && (
                        <>
                          {initiationConfig.secondaryProduct && (
                            <p class="wfp-field-hint">
                              <strong>Component 2 — {initiationConfig.secondaryProduct.replace(/^Injection 2\s*—\s*/, "")}</strong>
                            </p>
                          )}
                          <div class="wfp-row">
                            <Field label="Component 2 — dose" field="initiation.second.dose">
                              {pairedDoseOptions.length ? (
                                <select
                                  value={encounter.initiation?.second.dose ?? ""}
                                  onChange={(event) => onPairedDoseChange(event.currentTarget.value)}
                                >
                                  <option value="">Select dose</option>
                                  {pairedDoseOptions.map((dose) => (
                                    <option key={dose} value={dose}>
                                      {dose}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={encounter.initiation?.second.dose ?? ""}
                                  placeholder="Per active order"
                                  onInput={(event) => onPairedDoseChange(event.currentTarget.value)}
                                />
                              )}
                            </Field>
                            <Field label="Component 2 — site" field="initiation.second.site">
                              <select
                                value={encounter.initiation?.second.site ?? ""}
                                onChange={(event) => patchInitiationSecond({ site: event.currentTarget.value })}
                              >
                                <option value="">Select site</option>
                                {injectionInitiationSecondarySites().map((site) => (
                                  <option key={site} value={site}>
                                    {site}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Component 2 — NDC" field="initiation.second.ndc">
                              <NdcPicker
                                inputId="inj-component2-ndc"
                                query={pairedNdcQuery}
                                value={encounter.initiation?.second.ndc ?? ""}
                                lookup={pairedNdcLookup}
                                onChange={applyPairedNdc}
                                required
                              />
                            </Field>
                            <Field label="Component 2 — Lot" field="initiation.second.lot">
                              <input
                                class="mono"
                                value={encounter.initiation?.second.lot ?? ""}
                                onInput={(event) => patchInitiationSecond({ lot: event.currentTarget.value })}
                              />
                            </Field>
                            <Field label="Component 2 — Exp" field="initiation.second.expiration">
                              <input
                                class="mono"
                                type="month"
                                value={encounter.initiation?.second.expiration ?? ""}
                                onInput={(event) =>
                                  patchInitiationSecond({ expiration: event.currentTarget.value })
                                }
                              />
                            </Field>
                          </div>
                          <p class="wfp-field-hint">{initiationConfig.secondaryGuide}</p>
                          <div
                            class={`wfp-checkbox-row ${requirements["initiation.second.orderVerified"]?.state === "required" ? "is-required" : ""}`}
                            data-requirement={requirements["initiation.second.orderVerified"]?.state ?? "unprojected"}
                          >
                            <input
                              type="checkbox"
                              id="init-second-order"
                              aria-required={requirements["initiation.second.orderVerified"]?.state === "required" || undefined}
                              checked={encounter.initiation?.second.orderVerified ?? false}
                              onChange={(event) =>
                                patchInitiationSecond({ orderVerified: event.currentTarget.checked })
                              }
                            />
                            <label for="init-second-order">
                              Exact product and dose verified against the active order
                              {requirements["initiation.second.orderVerified"]?.state === "required" && (
                                <abbr class="wfp-req" title="Required">*</abbr>
                              )}
                            </label>
                          </div>
                          <div
                            class={`wfp-checkbox-row ${requirements["initiation.second.given"]?.state === "required" ? "is-required" : ""}`}
                            data-requirement={requirements["initiation.second.given"]?.state ?? "unprojected"}
                          >
                            <input
                              type="checkbox"
                              id="init-second-given"
                              aria-required={requirements["initiation.second.given"]?.state === "required" || undefined}
                              checked={encounter.initiation?.second.given ?? false}
                              onChange={(event) => patchInitiationSecond({ given: event.currentTarget.checked })}
                            />
                            <label for="init-second-given">
                              Injection component 2 was actually administered today
                              {requirements["initiation.second.given"]?.state === "required" && (
                                <abbr class="wfp-req" title="Required">*</abbr>
                              )}
                            </label>
                          </div>
                          <Field label="Component 2 note" field="initiation.second.note">
                            <input
                              value={encounter.initiation?.second.note ?? ""}
                              onInput={(event) => patchInitiationSecond({ note: event.currentTarget.value })}
                            />
                          </Field>
                          <Field label={initiationConfig.oralLabel} field="initiation.oralStatus">
                            <OptionList<"" | "administered" | "verified">
                              name="init-oral"
                              value={encounter.initiation?.oralStatus ?? ""}
                              onChange={(value) => patchInitiation({ oralStatus: value })}
                              options={[
                                { key: "administered", label: "Administered today" },
                                { key: "verified", label: "Reviewed for local documentation" },
                              ]}
                              inline
                            />
                          </Field>
                        </>
                      )}

                      {initiationConfig.kind === "oral" && (
                        <Field label={initiationConfig.oralLabel} field="initiation.oralStatus">
                          <OptionList<"" | "administered" | "verified">
                            name="init-oral"
                            value={encounter.initiation?.oralStatus ?? ""}
                            onChange={(value) => patchInitiation({ oralStatus: value })}
                            options={[
                              { key: "administered", label: "Administered today" },
                              { key: "verified", label: "Reviewed for local documentation" },
                            ]}
                            inline
                          />
                        </Field>
                      )}

                      {initiationConfig.kind === "provider" && (
                        <Field label="Provider-directed initiation / re-initiation instruction" field="initiation.providerNote">
                          <textarea
                            value={encounter.initiation?.providerNote ?? ""}
                            placeholder="Concise active order, timing plan, and any provider/pharmacist direction"
                            onInput={(event) => patchInitiation({ providerNote: event.currentTarget.value })}
                          />
                        </Field>
                      )}

                      {(initiationConfig.kind === "sustenna-day1" || initiationConfig.kind === "sustenna-day8") && (
                        <>
                          <Field label="Ordered initiation category" field="initiation.sustennaOrder">
                            <OptionList<"" | "standard" | "mild" | "other">
                              name="init-sustenna-order"
                              value={encounter.initiation?.sustennaOrder ?? ""}
                              onChange={(value) => patchInitiation({ sustennaOrder: value })}
                              options={[
                                { key: "standard", label: "Standard order" },
                                { key: "mild", label: "Mild renal order" },
                                { key: "other", label: "Other provider order" },
                              ]}
                              inline
                            />
                          </Field>
                          {initiationConfig.kind === "sustenna-day8" && (
                            <Field label="Documented Day 1 date" field="initiation.day1Date">
                              <WorkstationDateField
                                value={encounter.initiation?.day1Date ?? ""}
                                onCommit={(next) => patchInitiation({ day1Date: next })}
                              />
                            </Field>
                          )}
                          <p class="wfp-field-hint">
                            Order cross-check only. This tool never determines dose, renal adjustment, or
                            re-initiation regimens. Both initiation injections require a documented deltoid site.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!nonAdministration && tab === "administration" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("injection-ledger", "administration")}
          aria-labelledby={workflowLedgerTabId("injection-ledger", "administration")}
        >
          <div class="wfp-section" role="group" aria-label="Actual administration location">
            <h2 class="wfp-section-head">
              Actual administration location
              {recommendedSite && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">rotate: {recommendedSite}</span>
              )}
            </h2>
            <div class="wfp-section-body">
              {/* A filtered site list previously just showed fewer tiles. State
                  the restriction instead, so "gluteal only" reads as a named
                  label constraint rather than tiles that silently vanished. */}
              {needleProjection?.siteRestriction && (
                <div class="wfp-site-restriction" data-site-restriction>
                  <strong>! {needleProjection.siteRestriction.headline.toUpperCase()}</strong>
                  <span>{needleProjection.siteRestriction.detail}</span>
                </div>
              )}
              {repeatsPreviousSite && (
                <p class="wfp-field-hint">
                  Today's selected site repeats the prior documented site; consider rotation when clinically
                  appropriate.
                </p>
              )}
              {siteRequiresActiveOrderEntry ? (
                <Field
                  label="Actual administration site"
                  field="site"
                  hint="Enter the anatomical location documented for this active order"
                >
                  <input
                    value={encounter.site}
                    placeholder="Actual site / location per active order"
                    onInput={(event) => patch({ site: event.currentTarget.value })}
                  />
                </Field>
              ) : (
                <div
                  class="wfp-choice-field"
                  role="radiogroup"
                  aria-label="Actual administration site"
                  aria-required={requirements.site?.state === "required" || undefined}
                  data-requirement={requirements.site?.state ?? "unprojected"}
                  data-field-path="site"
                  data-field-code="INJ-SITE"
                  data-field-label="Actual administration site"
                  data-field-state={
                    incompleteFields.has("site")
                      ? "STOP"
                      : encounter.site
                        ? "OK"
                        : requirements.site?.state === "required"
                          ? "REQ"
                          : "OPT"
                  }
                  data-field-prompt="Select the actual site documented for this administration"
                >
                  <span class="wfp-choice-caption">
                    {/* The caption text carries the colon, the way WorkflowField
                        does it. Hanging it off the row instead put the colon
                        after the ENTRY/STOP badges at the far right edge. */}
                    <span class="wfp-field-caption">Actual administration site</span>
                    {requirements.site?.state === "required" && <abbr class="wfp-req" title="Required">*</abbr>}
                    {requirements.site?.state === "optional" && <span class="wfp-opt">optional</span>}
                    <RegisterMarkers
                      source="ENTRY"
                      state={incompleteFields.has("site") ? "STOP" : encounter.site ? "OK" : requirements.site?.state === "required" ? "REQ" : "OPT"}
                    />
                  </span>
                  {(() => {
                    const groups = groupSitesByRoute(allowedSites);
                    const siteTile = (site: string) => (
                      <label
                        key={site}
                        class={`wfp-site-tile ${encounter.site === site ? "is-selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="inj-site"
                          aria-required={requirements.site?.state === "required" || undefined}
                          checked={encounter.site === site}
                          onChange={() => patch({ site })}
                        />
                        <span class="wfp-site-tile-icon" aria-hidden="true">
                          <SiteIcon site={site} />
                        </span>
                        <span class="wfp-site-tile-title">{site}</span>
                        {site === recommendedSite && (
                          <span class="wfp-site-tile-badge">Suggested rotation site</span>
                        )}
                      </label>
                    );
                    return groups.map((group) => (
                      <div class="wfp-site-group" key={group.label}>
                        {groups.length > 1 && <span class="wfp-site-group-label">{group.label}</span>}
                        <div class="wfp-site-tile-grid">
                          {group.sites.map(siteTile)}
                          {group.quadrants.length > 0 && (
                            <div class="wfp-site-quadrant-block">
                              <span class="wfp-site-subgroup-label">Abdomen</span>
                              <div class="wfp-site-quadrant-grid">{group.quadrants.map(siteTile)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {recommendedSite && (
                <div class="wfp-site-suggestion">
                  <span>
                    {encounter.site === recommendedSite
                      ? "Suggested rotation site selected. Confirm it matches the actual administration site."
                      : `Suggested rotation site: ${recommendedSite}`}
                  </span>
                  {encounter.site !== recommendedSite && (
                    <button type="button" class="cd2004-link-button" onClick={() => patch({ site: recommendedSite })}>
                      Use suggested site
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {needleProjection && (
            <NeedleTechniquePanel
              needle={needleProjection}
              medication={medication}
              encounter={encounter}
              patch={patch}
              referenceVersion={presentationOutput?.clinicalReferenceVersion}
            />
          )}

          <div class="wfp-section" role="group" aria-label="Given by / time">
            <h2 class="wfp-section-head">Given by / time</h2>
            <div class="wfp-section-body">
              {!medication && (
                <div class="wfp-prerequisite-line" role="status">
                  <strong>ORDER REQUIRED</strong>
                  <span>Select the ordered medication before documenting administration details.</span>
                  <button type="button" class="cd2004-link-button" onClick={() => setTab("order")}>
                    Go to Order &amp; Timing
                  </button>
                </div>
              )}
              <div class="wfp-row">
                <Field label="Administered by" field="administeredBy" source={projectCarriedFieldSource(encounter.administeredBy, sessionStaff, "SESSION")}>
                  <input
                    value={encounter.administeredBy}
                    placeholder="J. Doe, LVN"
                    onInput={(event) => patch({ administeredBy: event.currentTarget.value })}
                  />
                  {staffSignInValue.trim() && (
                    <span class="wfp-session-default">Session-derived default; editable for the documenting staff member.</span>
                  )}
                </Field>
                <Field label="Actual administration time" field="administrationTime">
                  <input
                    type="time"
                    value={encounter.administrationTime}
                    onInput={(event) => patch({ administrationTime: event.currentTarget.value })}
                  />
                </Field>
                {encounter.initiation?.protocol && (
                  <Field label="Component 2 actual time" field="secondAdministrationTime" hint="Required for paired protocols">
                    <input
                      type="time"
                      value={encounter.secondAdministrationTime ?? ""}
                      onInput={(event) => patch({ secondAdministrationTime: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>

              {medication && <h3 class="wfp-section-head">Dose delivered &amp; device</h3>}
              <div class="wfp-row">
                <Field
                  label={medication?.key === "haldol" ? "mL administered" : "Administration amount"}
                  field="details.volume"
                >
                  <input
                    value={encounter.details?.volume ?? ""}
                    placeholder="e.g., 2"
                    onInput={(event) => patchDetails({ volume: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Unit" field="details.volumeUnit">
                  <select
                    value={encounter.details?.volumeUnit ?? ""}
                    onChange={(event) => patchDetails({ volumeUnit: event.currentTarget.value })}
                  >
                    <option value="">Select unit</option>
                    <option value="mL">mL (volume)</option>
                    <option value="mg" disabled={medication?.key === "haldol"}>
                      {medication?.key === "haldol" ? "mg (not valid for Haldol volume)" : "mg (dose amount)"}
                    </option>
                  </select>
                </Field>
                <Field label="Delivery device" field="details.device">
                  <select
                    value={encounter.details?.device ?? ""}
                    onChange={(event) => patchDetails({ device: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Needle and syringe">Needle and syringe</option>
                    <option value="Prefilled syringe">Prefilled syringe</option>
                    <option value="Autoinjector">Autoinjector</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                {encounter.details?.device === "Other" && (
                  <Field label="Device detail" field="details.deviceOther">
                    <input
                      value={encounter.details?.deviceOther ?? ""}
                      onInput={(event) => patchDetails({ deviceOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field label="Site condition" field="details.siteCondition">
                  <select
                    value={encounter.details?.siteCondition ?? ""}
                    onChange={(event) => patchDetails({ siteCondition: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Skin/site intact before administration">
                      Skin/site intact before administration
                    </option>
                    <option value="Other">Other finding / condition</option>
                  </select>
                </Field>
                {encounter.details?.siteCondition === "Other" && (
                  <Field label="Site condition detail" field="details.siteConditionOther">
                    <input
                      value={encounter.details?.siteConditionOther ?? ""}
                      onInput={(event) => patchDetails({ siteConditionOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!nonAdministration && tab === "product" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("injection-ledger", "product")}
          aria-labelledby={workflowLedgerTabId("injection-ledger", "product")}
        >
          {!medication && (
            <div class="wfp-prerequisite-line" role="status">
              <strong>ORDER REQUIRED</strong>
              <span>Select the ordered medication to load package and traceability fields.</span>
              <button type="button" class="cd2004-link-button" onClick={() => setTab("order")}>
                Go to Order &amp; Timing
              </button>
            </div>
          )}
          {medication && <div class="wfp-section" role="group" aria-label="Lot & traceability">
            <h2 class="wfp-section-head">Lot &amp; traceability</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="NDC" field="traceability.ndc">
                  <NdcPicker
                    inputId="inj-ndc"
                    query={primaryNdcQuery}
                    value={encounter.traceability.ndc}
                    lookup={primaryNdcLookup}
                    onChange={applyPrimaryNdc}
                    required
                  />
                </Field>
                <Field label="Lot #" field="traceability.lot">
                  <input
                    class="mono"
                    value={encounter.traceability.lot}
                    placeholder="LOT123"
                    onInput={(event) =>
                      patch({ traceability: { ...encounter.traceability, lot: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="Exp" field="traceability.expiration">
                  <input
                    class="mono"
                    type="month"
                    value={encounter.traceability.expiration}
                    onInput={(event) =>
                      patch({
                        traceability: { ...encounter.traceability, expiration: event.currentTarget.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>}

          {medication && <div class="wfp-section" role="group" aria-label="Product handling & trace exceptions">
            <h2 class="wfp-section-head">Product handling &amp; trace exceptions</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Medication source" field="details.productSource">
                  <select
                    value={encounter.details?.productSource ?? ""}
                    onChange={(event) => patchDetails({ productSource: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Clinic sample">Clinic sample</option>
                    <option value="Patient-specific pharmacy medication">
                      Patient-specific pharmacy medication
                    </option>
                  </select>
                </Field>
              </div>
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-waste-toggle"
                  checked={encounter.details?.waste ?? false}
                  onChange={(event) => patchDetails({ waste: event.currentTarget.checked })}
                />
                <label for="inj-waste-toggle">Document medication waste</label>
              </div>
              {encounter.details?.waste && (
                <div class="wfp-row">
                  <Field label="Waste amount / unit" field="details.wasteAmount">
                    <input
                      value={encounter.details?.wasteAmount ?? ""}
                      placeholder="e.g., 0.4 mL"
                      onInput={(event) => patchDetails({ wasteAmount: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Waste witness" field="details.wasteWitness">
                    <input
                      value={encounter.details?.wasteWitness ?? ""}
                      placeholder="Name / initials"
                      onInput={(event) => patchDetails({ wasteWitness: event.currentTarget.value })}
                    />
                  </Field>
                </div>
              )}
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-issue-toggle"
                  checked={encounter.details?.productIssue ?? false}
                  onChange={(event) => patchDetails({ productIssue: event.currentTarget.checked })}
                />
                <label for="inj-issue-toggle">Document product or device issue</label>
              </div>
              {encounter.details?.productIssue && (
                <>
                  <Field label="Product / device issue" field="details.productIssueDetail">
                    <textarea
                      value={encounter.details?.productIssueDetail ?? ""}
                      onInput={(event) => patchDetails({ productIssueDetail: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Immediate action / product disposition" field="details.productIssueAction">
                    <textarea
                      value={encounter.details?.productIssueAction ?? ""}
                      onInput={(event) => patchDetails({ productIssueAction: event.currentTarget.value })}
                    />
                  </Field>
                  <div class="wfp-row">
                    <Field label="Recipient notified" field="details.productIssueRecipient">
                      <input
                        value={encounter.details?.productIssueRecipient ?? ""}
                        onInput={(event) => patchDetails({ productIssueRecipient: event.currentTarget.value })}
                      />
                    </Field>
                    <Field label="Notification / decision time" field="details.productIssueNotificationTime">
                      <WorkstationDateField
                        mode="datetime"
                        value={encounter.details?.productIssueNotificationTime ?? ""}
                        onCommit={(next) => patchDetails({ productIssueNotificationTime: next })}
                      />
                    </Field>
                  </div>
                  <Field label="Direction received" field="details.productIssueDirection">
                    <textarea
                      value={encounter.details?.productIssueDirection ?? ""}
                      onInput={(event) => patchDetails({ productIssueDirection: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Next step / owner / timing" field="details.productIssueNextStep">
                    <textarea
                      value={encounter.details?.productIssueNextStep ?? ""}
                      onInput={(event) => patchDetails({ productIssueNextStep: event.currentTarget.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>}
        </div>
      )}

      {tab === "administration" && (
        <div class="wfp-tabpanel wfp-tabpanel-continuation">
          <div class="wfp-section" role="group" aria-label="Verification & safety">
            <h2 class="wfp-section-head">Verification &amp; safety</h2>
            <div class="wfp-section-body">
              <div
                class={`wfp-review-contract ${administrationReviewCurrent ? "is-confirmed" : "is-pending"}`}
                role="status"
              >
                <div class="wfp-review-contract-head">
                  <strong>STANDARD PRE-ADMIN SET</strong>
                  <span>
                    {administrationReviewCurrent
                      ? `CONFIRMED${encounter.disposition.reviewedBy ? ` · ${encounter.disposition.reviewedBy}` : " · HISTORICAL RECORD"}${encounter.disposition.reviewedAt ? ` · ${new Date(encounter.disposition.reviewedAt).toLocaleString()}` : ""}`
                      : `${INJECTION_ATTESTATION_OPTIONS.filter((item) => injectionAttestationRequired(item.key)).length} EXPECTED · REVIEW PENDING`}
                  </span>
                </div>
                <p>
                  Routine checks are preselected as reminders. Clear any step not completed; they
                  become confirmed only when you select the final administration disposition.
                </p>
              </div>
              <CheckList
                items={INJECTION_ATTESTATION_OPTIONS}
                checked={(key) => Boolean(encounter.attestations[key as keyof InjectionEncounter["attestations"]])}
                onToggle={toggleAttestation}
                requirementFor={(key) => `attestations.${key}`}
                reviewStateFor={(key) => {
                  const attestationKey = key as keyof InjectionEncounter["attestations"];
                  if (!injectionAttestationRequired(attestationKey)) return undefined;
                  if (!encounter.attestations[attestationKey]) return "exception";
                  return administrationReviewCurrent ? "confirmed" : "expected";
                }}
                quiet
              />
              {medication && visibleMedicationVerifications.length > 0 && (
                <>
                  <h2 class="wfp-section-head">{medication.label} safety</h2>
                  <CheckList
                    items={visibleMedicationVerifications.map((key) => ({
                      key,
                      label: medicationVerificationLabel(medication, key),
                      ...(isMedicationPreparationVerification(key)
                        ? {
                            description: medicationPreparationGuidance(
                              medication,
                              encounter.dose,
                              encounter.site,
                            ),
                          }
                        : {}),
                    }))}
                    checked={(key) =>
                      Boolean(encounter.verifications[key as MedicationVerificationKey])
                    }
                    onToggle={toggleVerification}
                    requirementFor={(key) => `verifications.${key}`}
                  />
                </>
              )}
              <div class="wfp-row">
                <Field label="Allergy status" field="allergies">
                  <input
                    value={encounter.allergies}
                    placeholder="Enter documented allergy / ADR status"
                    onInput={(event) => patch({ allergies: event.currentTarget.value })}
                  />
                </Field>
              </div>
              {vitalsOpen ? (
                <div class="wfp-row">
                  <Field label="BP" field="vitals.bp">
                    <input
                      value={encounter.vitals?.bp ?? ""}
                      placeholder="124/78"
                      onInput={(event) =>
                        patch({ vitals: { ...encounter.vitals, bp: event.currentTarget.value } })
                      }
                    />
                  </Field>
                  <Field label="HR" field="vitals.hr">
                    <input
                      value={encounter.vitals?.hr ?? ""}
                      placeholder="72"
                      onInput={(event) =>
                        patch({ vitals: { ...encounter.vitals, hr: event.currentTarget.value } })
                      }
                    />
                  </Field>
                  <Field label="Temp" field="vitals.temperature">
                    <input
                      value={encounter.vitals?.temperature ?? ""}
                      placeholder="98.6"
                      onInput={(event) =>
                        patch({ vitals: { ...encounter.vitals, temperature: event.currentTarget.value } })
                      }
                    />
                  </Field>
                  <Field label="RR" field="vitals.rr">
                    <input
                      value={encounter.vitals?.rr ?? ""}
                      onInput={(event) =>
                        patch({ vitals: { ...encounter.vitals, rr: event.currentTarget.value } })
                      }
                    />
                  </Field>
                  <Field label="SpO2" field="vitals.spo2">
                    <input
                      value={encounter.vitals?.spo2 ?? ""}
                      onInput={(event) =>
                        patch({ vitals: { ...encounter.vitals, spo2: event.currentTarget.value } })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    class="cd2004-link-button wfp-vitals-toggle"
                    onClick={() => setVitalsOpen(false)}
                  >
                    Hide vitals
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  class="cd2004-link-button wfp-vitals-toggle"
                  onClick={() => setVitalsOpen(true)}
                >
                  Show vitals (optional)
                </button>
              )}
              {requirements.acuteSafetyScreenConfirmed?.state !== "hidden" && (
                <div
                  class={`wfp-checkbox-row ${requirements.acuteSafetyScreenConfirmed?.state === "required" ? "is-required" : ""}`}
                  data-requirement={requirements.acuteSafetyScreenConfirmed?.state ?? "unprojected"}
                >
                  <input
                    type="checkbox"
                    id="inj-safety-none"
                    checked={encounter.acuteSafetyScreenConfirmed}
                    onChange={(event) => patch({ acuteSafetyScreenConfirmed: event.currentTarget.checked })}
                  />
                  <label for="inj-safety-none">
                    No acute concerns today confirmed
                    {requirements.acuteSafetyScreenConfirmed?.state === "required" && (
                      <abbr class="wfp-req" title="Required">*</abbr>
                    )}
                  </label>
                </div>
              )}
              {/* These have the opposite polarity to every other checkbox on
                  this tab: the attestations above are "confirm you did it",
                  these are "the patient reports it", and ticking one holds the
                  injection. Identical checkbox styling next to each other is
                  how staff tick one by accident and then cannot tell which box
                  is blocking them. It reads as an exception block. */}
              {requirements.activeSafetyConcerns?.state !== "hidden" &&
                safetyTriggers.length > 0 &&
                (encounter.acuteSafetyScreenConfirmed &&
                activeSafetyConcerns.size === 0 &&
                !safetyTriggersOpen ? (
                  <button
                    type="button"
                    class="cd2004-link-button wfp-vitals-toggle"
                    onClick={() => setSafetyTriggersOpen(true)}
                  >
                    Review triggers (none reported)
                  </button>
                ) : (
                  <div class="wfp-exception-block">
                    <h2 class="wfp-section-head">Provider review triggers</h2>
                    <p class="wfp-exception-lead">
                      Tick only what the patient actually reports. Any tick here holds the
                      injection for provider review — leave them clear for a routine dose.
                    </p>
                    <CheckList
                      items={safetyTriggers.map((trigger) => ({
                        key: trigger.key,
                        label: trigger.label,
                        description: trigger.description,
                      }))}
                      checked={(key) => activeSafetyConcerns.has(key)}
                      onToggle={toggleSafetyConcern}
                    />
                    {encounter.acuteSafetyScreenConfirmed && activeSafetyConcerns.size === 0 && (
                      <button
                        type="button"
                        class="cd2004-link-button wfp-vitals-toggle"
                        onClick={() => setSafetyTriggersOpen(false)}
                      >
                        Hide review triggers
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
          {administrationExceptionEditor}
        </div>
      )}

      {tab === "review" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("injection-ledger", "review")}
          aria-labelledby={workflowLedgerTabId("injection-ledger", "review")}
        >
          {!nonAdministration && (
            <ScheduleRegister
              title="RETURN TARGET"
              marker={
                oneTimeOtherWithoutReturn
                  ? "N/A"
                  : legacyManualNextDoseNeedsReview
                  ? "REVIEW"
                  : nextDoseIsManual
                    ? "OVR"
                    : suggestedNextDose
                      ? "CALC"
                      : "PENDING"
              }
              tone={
                legacyManualNextDoseNeedsReview || nextDoseIsManual ? "warning" : "neutral"
              }
              verdict={
                legacyManualNextDoseNeedsReview
                  ? "NEEDS REVIEW"
                  : nextDoseIsManual
                    ? "MANUAL"
                    : undefined
              }
              rows={[
                {
                  label: "Next dose due",
                  value: registerDate(encounter.nextDoseDate || suggestedNextDose),
                  // Same provenance the Order tab shows. Two tabs describing
                  // one date two different ways is how staff end up trusting
                  // the wrong one.
                  note: nextDoseProvenanceNote(),
                  flag: nextDoseWeekendSnap ? "WEEKEND" : undefined,
                  flagTone: nextDoseWeekendSnap ? "warning" : undefined,
                },
              ]}
              actions={
                !locked && (
                  <button type="button" class="cd2004-link-button" onClick={() => setTab("order")}>
                    Review timing
                  </button>
                )
              }
            />
          )}
          <div class="wfp-section" role="group" aria-label="Response & follow-up">
            <h2 class="wfp-section-head">Response &amp; follow-up</h2>
            <div class="wfp-section-body">
              <Field label="Patient response" field="response">
                <OptionList<InjectionResponse["kind"]>
                  name="inj-response"
                  value={encounter.response.kind}
                  onChange={(value) =>
                    patch({
                      // Changing the kind drops any sub-choice from the previous
                      // one - detail keys are only meaningful within their parent.
                      response: { ...encounter.response, kind: value, detail: "" },
                    })
                  }
                  options={RESPONSE_OPTIONS}
                  inline
                />
              </Field>
              {requirements.response?.state !== "hidden" && responseDetailOptions.length > 0 && (
                <Field
                  label="Response detail"
                  field="response.detail"
                  state="optional"
                  hint="Sharpens the note wording. Leave unset to document the response on its own."
                >
                  <OptionList<string>
                    name="inj-response-detail"
                    value={encounter.response.detail ?? ""}
                    onChange={(value) =>
                      patch({ response: { ...encounter.response, detail: value } })
                    }
                    options={responseDetailOptions}
                    placeholder="No further detail"
                    inline
                  />
                </Field>
              )}
              {requirements.response?.state !== "hidden" && encounter.response.kind === "custom" && (
                <Field label="Describe response" field="response.custom">
                  <input
                    value={encounter.response.custom ?? ""}
                    onInput={(event) =>
                      patch({ response: { ...encounter.response, custom: event.currentTarget.value } })
                    }
                  />
                </Field>
              )}

            </div>
          </div>

          {!nonAdministration && (
            <div class="wfp-section" role="group" aria-label="Additional note items">
              <h2 class="wfp-section-head">Additional note items</h2>
              <div class="wfp-section-body">
                <p class="wfp-field-hint">
                  Optional one-tap additions to the generated note. None are pre-selected or required.
                </p>
                <div class="wfp-checkbox-row">
                  <input
                    type="checkbox"
                    id="inj-site-assessed"
                    checked={encounter.details?.siteAssessed ?? false}
                    onChange={(event) => patchDetails({ siteAssessed: event.currentTarget.checked })}
                  />
                  <label for="inj-site-assessed">
                    Injection site assessed prior to administration
                  </label>
                </div>
                <div class="wfp-checkbox-row">
                  <input
                    type="checkbox"
                    id="inj-post-observation"
                    checked={encounter.details?.postInjectionObservation ?? false}
                    onChange={(event) =>
                      patchDetails({ postInjectionObservation: event.currentTarget.checked })
                    }
                  />
                  <label for="inj-post-observation">
                    Pt observed post-injection without adverse reaction
                  </label>
                </div>
                <div class="wfp-checkbox-row">
                  <input
                    type="checkbox"
                    id="inj-education-provided"
                    checked={encounter.details?.educationProvided ?? false}
                    onChange={(event) => patchDetails({ educationProvided: event.currentTarget.checked })}
                  />
                  <label for="inj-education-provided">
                    Post-injection education provided
                  </label>
                </div>
                <Field label="Disposition on departure" field="details.departureStatus" hint="optional">
                  <OptionList<NonNullable<InjectionAdministrationDetails["departureStatus"]>>
                    name="inj-departure-status"
                    value={encounter.details?.departureStatus ?? ""}
                    onChange={(value) => patchDetails({ departureStatus: value })}
                    options={[
                      { key: "", label: "Not documented" },
                      ...INJECTION_DEPARTURE_STATUS_OPTIONS,
                      { key: "custom", label: "Custom…" },
                    ]}
                  />
                </Field>
                {encounter.details?.departureStatus === "custom" && (
                  <Field label="Describe departure" field="details.departureStatusNote">
                    <input
                      value={encounter.details?.departureStatusNote ?? ""}
                      onInput={(event) => patchDetails({ departureStatusNote: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>
            </div>
          )}

          <div class="wfp-section" role="group" aria-label="Clinical disposition">
            <h2
              class="wfp-section-head"
              data-requirement={requirements["disposition.kind"]?.state ?? "unprojected"}
            >
              Clinical disposition
              {requirements["disposition.kind"]?.state === "required" && (
                <abbr class="wfp-req" title="Required">*</abbr>
              )}
            </h2>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">
                Use the checked routine review items as a fast review-by-exception sheet, then make one final
                documentation choice. An administration note remains unavailable until a complete
                administration is documented.
              </p>
              <div
                class="wfp-option-list wfp-option-list-inline wfp-disposition-list"
                role="radiogroup"
                aria-label="Clinical disposition"
                aria-required={requirements["disposition.kind"]?.state === "required" || undefined}
              >
                {(
                  [
                    ["administered", "Review complete — document administration", "ready", "check"],
                    ["held", "Held", "warning", "alert"],
                    ["escalated", "Escalated", "warning", "alert"],
                    ["provider", "Provider-directed plan", "warning", "alert"],
                  ] as Array<[InjectionDisposition["kind"], string, "ready" | "warning", "check" | "alert"]>
                ).map(([kind, label, tone, iconName]) => {
                  const administrationBlocked = kind === "administered" && !canConfirmAdministration;
                  return (
                    <label
                      key={kind}
                      class={`wfp-option-row is-${tone} ${encounter.disposition.kind === kind ? "is-selected" : ""} ${administrationBlocked ? "is-disabled" : ""}`}
                      title={administrationBlocked ? administrationReviewBlocker : undefined}
                    >
                      <input
                        type="radio"
                        name="inj-disposition"
                        aria-required={requirements["disposition.kind"]?.state === "required" || undefined}
                        checked={encounter.disposition.kind === kind}
                        disabled={administrationBlocked}
                        onChange={() => selectDisposition(kind)}
                      />
                      <span class="wfp-option-title">
                        <span class="wfp-option-icon" aria-hidden="true">
                          <DesktopIcon name={iconName} />
                        </span>
                        {label}
                      </span>
                    </label>
                  );
                })}
              </div>
              {!canConfirmAdministration && administrationReviewBlocker && (
                <p class="wfp-field-hint wfp-review-blocker">
                  Administration review pending: {administrationReviewBlocker}
                </p>
              )}
              {administrationReviewCurrent && (
                <p class="wfp-done-line">
                  <strong>Review confirmed.</strong>{" "}
                  The expected safety set is now attributed to {encounter.disposition.reviewedBy || "the historical completed record"}.
                </p>
              )}
              {encounter.disposition.kind && encounter.disposition.kind !== "administered" && (
                <div class="wfp-section" role="group" aria-label="Required handoff details">
                  <h2 class="wfp-section-head">Required handoff details</h2>
                  <div class="wfp-section-body">
                    <div class="wfp-row">
                      <Field label="Provider / recipient" field="disposition.provider">
                        <input
                          value={encounter.disposition.provider ?? ""}
                          placeholder="Name and role"
                          onInput={(event) => patchDisposition({ provider: event.currentTarget.value })}
                        />
                      </Field>
                      <Field label="Contact / decision time" field="disposition.time">
                        <WorkstationDateField
                          mode="datetime"
                          value={encounter.disposition.time ?? ""}
                          onCommit={(next) => patchDisposition({ time: next })}
                        />
                      </Field>
                    </div>
                    <Field label="Direction / outcome" field="disposition.outcome">
                      <textarea
                        value={encounter.disposition.outcome ?? ""}
                        placeholder="Concise direction, follow-up, and where responsibility was handed off"
                        onInput={(event) => patchDisposition({ outcome: event.currentTarget.value })}
                      />
                    </Field>
                  </div>
                </div>
              )}
              {/* A local administration record cannot be attested as complete
                  when no medication was administered. Keep that state explicit
                  rather than presenting a competing early completion route. */}
              {evaluation?.output.recordStatus === "handoff-ready" && (
                <p class="wfp-done-line is-info">
                  <strong>Handoff documented.</strong> No medication administration was recorded, so
                  this local administration record cannot be attested and locked.
                </p>
              )}
            </div>
          </div>

        </div>
      )}

      </fieldset>

      {/* Printing is read-only output, not an edit - it stays outside the
          locked fieldset so a completed record's AVS/worksheet remain
          reprintable instead of going dead the moment the record locks. */}
      {tab === "review" && (
        <div class="wfp-section" role="group" aria-label="Document output">
          <h2 class="wfp-section-head">Document output</h2>
          <div class="wfp-section-body">
            <p class="wfp-field-hint wfp-document-output-hint">
              Printing uses the same local encounter snapshot as Clinical Documentation, in the sidebar.
            </p>
            <div class="wfp-actions">
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => navigator.clipboard?.writeText(noteText)}
                disabled={!noteText}
              >
                <DesktopIcon name="copy" />
                Copy note
              </button>
              <span class="wfp-actions-divider" aria-hidden="true" />
              <button
                type="button"
                class="cd2004-command-button"
                onClick={() => requestClinicalPrint("injection-avs")}
                disabled={!hasAdministrationDetailsForAvs}
                title={
                  hasAdministrationDetailsForAvs
                    ? undefined
                    : "Available once medication, dose, route, site, and administration date are documented."
                }
              >
                <DesktopIcon name="print" />
                Print AVS
              </button>
              {INJECTION_PATIENT_SCREENING_ENABLED && encounter.medicationKey && (
                <button
                  type="button"
                  class="cd2004-link-button"
                  data-patient-screening-print="outcome"
                  aria-haspopup="dialog"
                  onClick={() => setPatientScreeningDialogOpen(true)}
                  disabled={!patientScreeningReady}
                  title={
                    patientScreeningReady
                      ? "Print the patient screening and consent form."
                      : patientScreeningDisabledReason
                  }
                >
                  <DesktopIcon name="print" />
                  Print patient screening
                </button>
              )}
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => requestClinicalPrint("injection-worksheet")}
                disabled={!transactionStarted}
                title={
                  transactionStarted
                    ? "Print the current injection worksheet."
                    : "Enter encounter details first, or use Blank worksheet."
                }
              >
                <DesktopIcon name="print" />
                Print current worksheet
              </button>
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => requestClinicalPrint("injection-worksheet-blank")}
              >
                <DesktopIcon name="print" />
                Blank worksheet
              </button>
            </div>
          </div>
        </div>
      )}

      {locked && (
        <div class="wfp-section" role="group" aria-label="Addendum">
          <h2 class="wfp-section-head">Addendum</h2>
          <div class="wfp-section-body">
            <p class="wfp-field-hint">
              Read-only completed record. The original encounter snapshot is locked. Add a dated addendum
              instead of changing the completed documentation.
            </p>
            {addenda.map((entry, index) => (
              <div class="wfp-preview" key={index}>
                <strong>{entry.author || "Staff"}</strong>
                <br />
                {entry.text}
              </div>
            ))}
            <Field label="Addendum entered by" state="required">
              <input
                value={addendumAuthor}
                placeholder="Current staff name or initials"
                onInput={(event) => onAddendumAuthorChange(event.currentTarget.value)}
              />
            </Field>
            <Field label="Dated addendum" state="required">
              <textarea
                data-addendum-input
                value={addendumText}
                placeholder="Clarification, correction, or follow-up. The original completed record remains unchanged."
                onInput={(event) => onAddendumTextChange(event.currentTarget.value)}
              />
            </Field>
            <div class="wfp-actions">
              <button
                type="button"
                class="cd2004-command-button"
                onClick={saveAddendum}
                disabled={!addendumText.trim()}
              >
                Save addendum
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {patientScreeningDialogOpen && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog cd2004-patient-screening-dialog"
          labelledBy="patient-screening-print-title"
          onDismiss={() => setPatientScreeningDialogOpen(false)}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="patient-screening-print-title">Print patient screening</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPatientScreeningDialogOpen(false)}
              >
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>
                This paper form does not store patient answers or signatures electronically and does not change injection readiness.
              </p>
              <p>
                Choose the language to print for {encounter.medicationKey === "other" ? "Other" : medication?.label}.
              </p>
            </div>
            <div class="cd2004-dialog-actions">
              <button type="button" onClick={() => setPatientScreeningDialogOpen(false)}>
                Cancel
              </button>
              <span />
              <button
                type="button"
                data-patient-screening-language="en"
                onClick={() => stagePatientScreeningPrint("en")}
              >
                Print English
              </button>
              <button
                type="button"
                class="is-primary"
                data-patient-screening-language="es"
                onClick={() => stagePatientScreeningPrint("es")}
              >
                Imprimir español
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {lateDoseDialogOpen && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog"
          labelledBy="late-dose-review-title"
          onDismiss={() => setLateDoseDialogOpen(false)}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="late-dose-review-title">Late-dose review</span>
              <button type="button" aria-label="Close" onClick={() => setLateDoseDialogOpen(false)}>
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>{lateDoseWarningMessage}</p>
              <p class="wfp-field-hint">
                Record the provider who approved proceeding and the decision time. This timing review
                does not override any other medication, safety, product, or documentation stop.
              </p>
              <Field label="Review outcome" state="required">
                <OptionList<"provider-authorized" | "other">
                  name="late-dose-review"
                  value={lateDoseReviewChoice}
                  onChange={setLateDoseReviewChoice}
                  options={LATE_DOSE_REVIEW_OPTIONS}
                />
              </Field>
              {lateDoseReviewChoice === "provider-authorized" && (
                <>
                  <div class="wfp-row">
                    <Field label="Approving provider" field="details.lateDoseReviewProvider" state="required" hint="Required for provider approval">
                      <input
                        aria-label="Approving provider"
                        value={lateDoseReviewProviderDraft}
                        placeholder="Name and role"
                        onInput={(event) =>
                          setLateDoseReviewProviderDraft(event.currentTarget.value)
                        }
                      />
                    </Field>
                    <Field label="Approval / decision time" field="details.lateDoseReviewTime" state="required" hint="Required for provider approval">
                      <WorkstationDateField
                        mode="datetime"
                        value={lateDoseReviewTimeDraft}
                        onCommit={(next) => setLateDoseReviewTimeDraft(next)}
                      />
                    </Field>
                  </div>
                  <Field label="Approval direction / context" state="optional" hint="Optional concise detail">
                    <textarea
                      aria-label="Approval direction / context"
                      value={lateDoseReviewNoteDraft}
                      placeholder="Optional concise direction or re-initiation context"
                      onInput={(event) => setLateDoseReviewNoteDraft(event.currentTarget.value)}
                    />
                  </Field>
                </>
              )}
              {lateDoseReviewChoice === "other" && (
                <Field label="Other review / plan" field="details.lateDoseReviewNote" state="required">
                  <textarea
                    value={lateDoseReviewNoteDraft}
                    placeholder="Describe the review or plan; this does not state provider approval"
                    onInput={(event) => setLateDoseReviewNoteDraft(event.currentTarget.value)}
                  />
                </Field>
              )}
            </div>
            <div class="cd2004-dialog-actions">
              <button type="button" onClick={() => setLateDoseDialogOpen(false)}>
                Cancel
              </button>
              <span />
              <button
                type="button"
                class="is-primary"
                disabled={
                  lateDoseReviewChoice === "provider-authorized"
                    ? !lateDoseReviewProviderDraft.trim() || !lateDoseReviewTimeDraft.trim()
                    : !lateDoseReviewNoteDraft.trim()
                }
                onClick={confirmLateDoseReview}
              >
                Record review
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {nextDoseOverrideOpen && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog"
          labelledBy="next-dose-override-title"
          onDismiss={() => setNextDoseOverrideOpen(false)}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="next-dose-override-title">
                {manualReturnDate ? "Record ordered return date" : "Override calculated return target"}
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setNextDoseOverrideOpen(false)}
              >
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>
                {manualReturnDate ? (
                  "No product-specific calculated target applies. Record the return date from the active order or documented provider direction."
                ) : (
                  <>
                    Calculated target: <strong>{formatClinicalDate(suggestedNextDose)}</strong>. Use an
                    override only when the active order or documented provider direction establishes a
                    different return target.
                  </>
                )}
              </p>
              <div class="wfp-row">
              <Field label={manualReturnDate ? "Return date" : "Override date"} state="required" hint="Required">
                  <WorkstationDateField
                    value={nextDoseOverrideDate}
                    onCommit={(next) => setNextDoseOverrideDate(next)}
                  />
                </Field>
                <Field label="Authority" state="required" hint="Required">
                  <OptionList<"active-order" | "provider-direction">
                    name="next-dose-override-authority"
                    value={nextDoseOverrideKind}
                    onChange={setNextDoseOverrideKind}
                    options={[
                      { key: "active-order", label: "Active order" },
                      { key: "provider-direction", label: "Provider direction" },
                    ]}
                  />
                </Field>
              </div>
              {nextDoseOverrideKind === "provider-direction" && (
                <Field label="Directing provider" state="required" hint="Required">
                  <input
                    aria-label="Directing provider"
                    value={nextDoseOverrideProvider}
                    placeholder="Name and role"
                    onInput={(event) => setNextDoseOverrideProvider(event.currentTarget.value)}
                  />
                </Field>
              )}
              <Field label="Reason / order context" state="required" hint="Required">
                <textarea
                  aria-label="Reason / order context"
                  value={nextDoseOverrideReason}
                  placeholder="Concise reason this date replaces the calculated target"
                  onInput={(event) => setNextDoseOverrideReason(event.currentTarget.value)}
                />
              </Field>
              <p class="wfp-field-hint">
                This changes the documented return target only. It does not override medication,
                timing, product, or safety stops.
              </p>
            </div>
            <div class="cd2004-dialog-actions">
              <button type="button" onClick={() => setNextDoseOverrideOpen(false)}>
                Cancel
              </button>
              <span />
              <button
                type="button"
                class="is-primary"
                disabled={
                  !isValidIsoDate(nextDoseOverrideDate) ||
                  !nextDoseOverrideReason.trim() ||
                  (nextDoseOverrideKind === "provider-direction" &&
                    !nextDoseOverrideProvider.trim())
                }
                onClick={confirmNextDoseOverride}
              >
                {manualReturnDate ? "Record return date" : "Record override"}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

        </InjectionIncompleteFieldsContext.Provider>
      </InjectionRequirementsContext.Provider>
    </div>
  );
}
