import { createContext, Fragment, type ComponentChildren, type Ref } from "preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import "../workflow-panels.css";
import { DesktopIcon } from "../../DesktopIcon";
import { ModalDialog } from "../../ModalDialog";
import { SiteIcon } from "../../SiteIcon";
import {
  INJECTION_ATTESTATION_OPTIONS,
  INJECTION_DEPARTURE_STATUS_OPTIONS,
  INJECTION_REASON_OPTIONS,
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  emptyInjectionInitiation,
  injectionInitiationConfig,
  injectionInitiationOptions,
  injectionInitiationSecondarySites,
  verificationLabels,
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
import {
  formatNeedleSpec,
  formatTechniquePrefill,
} from "../../../domain/injection-needle";
import type { InjectionHabitusBand } from "../../../domain/injection-clinical-reference";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { firstActionableClinicalIssue } from "../../../application/readiness-projection";
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
import { clickLegacyControl, setLegacyFieldValue } from "../legacy-mirror";
import { DocumentationEngine } from "../../../documentation";
import { injectionEncounterToDocumentationInput } from "../../../documentation/adapters/injection-from-encounter";
import { countStopsByTab, OutstandingRequirements } from "../OutstandingRequirements";
import { StatusFlag } from "../StatusFlag";
import { mirrorInjectionEncounterToLegacyDom } from "./injection-legacy-mirror";
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

// The tabs are the blocks of a medication administration record, not a
// decomposition of the form. A MAR is organised around the administration
// event: what authorises this dose, when it is due, what was actually given,
// what product it came from, what was verified first, and what happened after.
type InjectionTab =
  | "order"
  | "schedule"
  | "administration"
  | "product"
  | "verification"
  | "outcome";

const INJECTION_TABS: Array<[InjectionTab, string]> = [
  ["order", "Order"],
  ["schedule", "Schedule"],
  ["administration", "Administration"],
  ["product", "Product"],
  ["verification", "Verification"],
  ["outcome", "Outcome"],
];

const INJECTION_TAB_LABELS = Object.fromEntries(INJECTION_TABS) as Record<InjectionTab, string>;

const LATE_DOSE_REVIEW_OPTIONS: ReadonlyArray<{
  key: "provider-authorized" | "other";
  label: string;
}> = [
  { key: "provider-authorized", label: "Reviewed with provider — administration authorized" },
  { key: "other", label: "Other" },
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
type InjectionRequirementState = "required" | "optional" | "hidden";

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
    "details.productSource": requirement("optional", "traceability"),
    "details.preparation": requirement("optional", "traceability"),
    "details.wasteAmount": requirement(
      encounter.details?.waste ? "required" : "hidden",
      "traceability",
    ),
    "details.wasteWitness": requirement(
      encounter.details?.waste ? "required" : "hidden",
      "traceability",
    ),
    "details.preparationOther": requirement(
      encounter.details?.preparation === "Other" ? "required" : "hidden",
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
// Administration (volume/device/site condition) and Outcome (administration
// exception). Everything else maps by top-level field name/prefix alone.
const INJECTION_DETAILS_FIELD_TAB: Record<string, InjectionTab> = {
  purpose: "order",
  productSource: "product",
  preparation: "product",
  preparationOther: "product",
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
  administrationException: "outcome",
  exceptionSummary: "outcome",
  exceptionRecipient: "outcome",
  exceptionTime: "outcome",
  exceptionOutcome: "outcome",
};

/**
 * Maps a ClinicalIssue's dot-path `field` back to the tab that actually
 * edits it, so an outstanding stop can be surfaced as a direct "go here"
 * link instead of leaving staff to hunt across all six tabs for whichever
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
    // When it is due, and the multi-dose protocol that sets the schedule.
    case "priorDoseDate":
    case "priorSite":
    case "nextDoseDate":
    case "initiation":
      return "schedule";
    // The administration event itself: where, by whom, and when.
    case "site":
    case "administeredBy":
    case "administrationDate":
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
      return "verification";
    case "response":
    case "disposition":
      return "outcome";
    case "details":
      return (sub && INJECTION_DETAILS_FIELD_TAB[sub]) || "outcome";
    default:
      return "order";
  }
}

interface InjectionPanelProps {
  initialEncounter: InjectionEncounter;
  activePatient: PatientContext;
  evaluation?: ClinicalEvaluation<InjectionEvaluationOutput>;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
  /** True once the record has been completed and locked (read-only) via the
   * records workspace. Matches legacy's #panel-administer.record-readonly. */
  locked?: boolean;
}

const patientIsEmpty = (patient: InjectionEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

interface OptionListProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string; description?: string }>;
  inline?: boolean;
}

function OptionList<T extends string>({ name, value, onChange, options, inline }: OptionListProps<T>) {
  // Native <select> rather than a custom radio-row list: the OS draws the
  // popup, keyboard type-ahead comes for free, and a closed control costs one
  // line instead of one per option. The selected option's description stays
  // visible beneath it - clinical guidance should not hide inside a tooltip.
  const selected = options.find((option) => option.key === value);
  return (
    <div class={`wfp-select-group ${inline ? "wfp-select-group-inline" : ""}`}>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description && (
        <small class="wfp-select-desc">{selected.description}</small>
      )}
    </div>
  );
}

// A short status stamp for the timing banner - "what does this number mean"
// answered in three words before staff read the full sentence below it.
// Sentence case with a period, matching the app's own posted/error stamp
// captions (.cd2004-post-stamp/.cd2004-post-error) rather than an all-caps
// alert-box convention borrowed from elsewhere.
function injectionTimingStatusLabel(timing: InjectionEvaluationOutput["timing"]): string {
  switch (timing.state) {
    case "ok":
      return "Within the permitted window.";
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

function CheckList({
  items,
  checked,
  onToggle,
  requirementFor,
  quiet,
}: {
  items: ReadonlyArray<{ key: string; label: string; description?: string }>;
  checked: (key: string) => boolean;
  onToggle: (key: string, value: boolean) => void;
  /** The evaluator owns checklist visibility and required markers. */
  requirementFor?: (key: string) => string;
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
        return (
          <label
            key={item.key}
            class={`wfp-option-row ${checked(item.key) ? "is-selected" : ""} ${required ? "is-required" : ""}`}
            data-requirement={projected?.state ?? "unprojected"}
          >
            <input
              type="checkbox"
              checked={checked(item.key)}
              onChange={(event) => onToggle(item.key, event.currentTarget.checked)}
            />
            <span>
              <span class="wfp-option-title">
                {item.label}
                {required && <abbr class="wfp-req" title="Required">*</abbr>}
                {optional && <span class="wfp-opt">optional</span>}
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
  schedule: "timing",
  administration: "administration",
  product: "traceability",
  verification: "safety",
  outcome: "disposition",
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
        ...(medication.timingMode === "orderVerify"
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
      ];
    case "schedule":
      return [
        {
          key: "next-due",
          section: "timing",
          title: "Expected next due",
          message: suggestedNextDose
            ? `${suggestedNextDose} is calculated from the documented administration date and selected cadence. Confirm or revise it for the actual follow-up plan.`
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
    case "verification":
      return [
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
    case "outcome":
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
function NeedleDiagram({ subcutaneous }: { subcutaneous: boolean }) {
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
      <text class="wfp-needle-depth-label" x={subcutaneous ? 158 : 128} y={subcutaneous ? 76 : 112}>
        {subcutaneous ? "45–90°" : "90°"}
      </text>
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
  const subcutaneous = placement === "subq";
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
      <div class="wfp-section-head">
        Needle &amp; technique
        {referenceVersion && <span class="wfp-needle-ref">REF {referenceVersion}</span>}
      </div>
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
          <NeedleDiagram subcutaneous={subcutaneous} />
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
}: {
  inputId: string;
  query: NdcOptionQuery;
  value: string;
  lookup: NdcOptionsLookup;
  onChange: (value: string, selection?: InjectionNdcSelection) => void;
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

function Field({
  label,
  hint,
  field,
  width,
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
  children: ComponentChildren;
}) {
  const requirements = useContext(InjectionRequirementsContext);
  const incompleteFields = useContext(InjectionIncompleteFieldsContext);
  const projected = field ? requirements[field] : undefined;
  if (projected?.state === "hidden") return null;
  const required = projected?.state === "required";
  const incomplete = Boolean(field && incompleteFields.has(field));
  const optional = projected?.state === "optional";
  // Legacy hints can carry contextual copy, but are never used to decide a
  // clinical requirement. That decision comes only from the projection.
  const detail =
    hint && hint !== "required" && hint !== "optional"
      ? hint.replace(/^(required|optional)[;:,]?\s*/i, "")
      : projected?.reason ?? "";
  return (
    <div
      class={`wfp-field ${required ? "is-required" : ""} ${incomplete ? "is-incomplete" : ""} ${optional ? "is-optional" : ""} ${width ? `is-w-${width}` : ""}`}
      data-requirement={projected?.state ?? "unprojected"}
    >
      <label>
        <span class="wfp-field-caption">{label}</span>
        {required && (
          <abbr class="wfp-req" title="Required">
            *
          </abbr>
        )}
        {optional && <span class="wfp-opt">optional</span>}
      </label>
      {children}
      {detail && <span class="wfp-field-hint">{detail}</span>}
    </div>
  );
}

const emptyDetails = (): InjectionAdministrationDetails => ({});

export function InjectionPanel({
  initialEncounter,
  activePatient,
  evaluation,
  staffSignInValue,
  previewRef,
  locked,
}: InjectionPanelProps) {
  const [encounter, setEncounter] = useState<InjectionEncounter>(initialEncounter);
  const [tab, setTab] = useState<InjectionTab>("order");
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [patientScreeningDialogOpen, setPatientScreeningDialogOpen] = useState(false);
  const [lateDoseDialogOpen, setLateDoseDialogOpen] = useState(false);
  const [lateDoseReviewChoice, setLateDoseReviewChoice] = useState<"provider-authorized" | "other">(
    "provider-authorized",
  );
  const [lateDoseReviewNoteDraft, setLateDoseReviewNoteDraft] = useState("");
  // Prompt once per late administration date, not on every render while the
  // dialog is open or after staff already reviewed it.
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
    mirrorInjectionEncounterToLegacyDom(encounter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const updateEncounter = (updater: (previous: InjectionEncounter) => InjectionEncounter) => {
    setEncounter((previous) => {
      const next = updater(previous);
      mirrorInjectionEncounterToLegacyDom(next);
      return next;
    });
  };

  const patch = (partial: Partial<InjectionEncounter>) => {
    updateEncounter((previous) => ({ ...previous, ...partial }));
  };

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
    updateEncounter((previous) => ({
      ...previous,
      patient: { ...previous.patient, ...partial },
    }));
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
  const pairedNdcQuery: NdcOptionQuery = {
    medicationKey: pairedMedicationKey,
    dose: encounter.initiation?.second.dose ?? "",
  };
  const documentationMetadata = encounter.details as
    | (InjectionAdministrationDetails & InjectionDocumentationMetadata)
    | undefined;
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

  // Prefill the editable Needle / technique field, the way the legacy app did
  // ($('tech').value = m.tech). Gated on the field being empty so a staff edit
  // is never overwritten — same "suggest once, never clobber" contract as the
  // rotation-site effect above.
  const techniquePrefill = medication
    ? formatTechniquePrefill(
        medication,
        needleProjection?.resolution ?? { unresolved: false },
        encounter.route,
      )
    : "";
  useEffect(() => {
    if (locked || nonAdministration || !techniquePrefill || (encounter.technique ?? "").trim()) {
      return;
    }
    patch({ technique: techniquePrefill });
    // Value dependencies only, so re-running cannot overwrite a manual edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.technique, locked, nonAdministration, techniquePrefill]);

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
  // The routine timing warning and the Sustenna Day 8 window warning are
  // different checks with different messages - the timing readout's own
  // message only covers the former, so the late-dose dialog needs to look up
  // whichever warning is actually driving lateDoseWarning to explain itself.
  const lateDoseWarningMessage = evaluation?.warnings.find(
    (item) => item.code === "timing.review" || item.code === "initiation.sustenna.outside-window",
  )?.message;
  const incompleteFields = useMemo(
    () => new Set(stops.flatMap((item) => (item.field ? [item.field] : []))),
    [stops],
  );
  const stopsByTab = countStopsByTab(stops, tabForInjectionField);

  const requirements = useMemo(
    () => ({
      ...legacyRequirementFallback(encounter, nonAdministration),
      ...(presentationOutput?.requirements ?? {}),
    }),
    [encounter, nonAdministration, presentationOutput?.requirements],
  );

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
  const nextDoseMetadata = documentationMetadata?.nextDose;
  const nextDoseIsCalculated = nextDoseMetadata?.source === "calculated";
  const nextDoseCalculationInput = `${encounter.administrationDate}|${encounter.intervalKey}`;

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

  const applyManualNextDose = (value: string) => {
    autoCalculatedNextDue.current = "";
    patch({ nextDoseDate: value });
    patchDetails({
      nextDose: {
        value,
        source: "manual",
        calculatedFrom: nextDoseCalculationInput,
      },
    });
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
    if (tab === "administration" || tab === "product") setTab("outcome");
  }, [nonAdministration, tab]);

  // Seeds the dialog's editable fields from whatever is actually stored on
  // the encounter, not from whatever the fields happened to hold last time
  // the dialog was open - otherwise "Edit" on an already-reviewed record (or
  // one just reopened from a saved draft) would show a stale/default choice
  // instead of what staff actually recorded.
  const openLateDoseDialog = () => {
    const stored = encounter.details?.lateDoseReview;
    setLateDoseReviewChoice(stored === "other" ? "other" : "provider-authorized");
    setLateDoseReviewNoteDraft(stored === "other" ? encounter.details?.lateDoseReviewNote ?? "" : "");
    setLateDoseDialogOpen(true);
  };

  // A dose given after its safe window gets a brief MEDITECH-style review
  // prompt - it records the review, it does not gate finalizing (the engine
  // only warns, never stops, on this). It fires on arrival at Outcome, the
  // last tab, rather than the instant the fields read as late: administration
  // date defaults to today, so entering an old prior-dose date alone (before
  // the actual administration date is even typed) would otherwise read as
  // "40 days late" and pop a modal that blocks staff mid-entry, on a value
  // nobody has finished typing yet. By Outcome the real dates are in.
  useEffect(() => {
    if (locked || tab !== "outcome" || !evaluation?.output.lateDoseWarning) return;
    if (encounter.details?.lateDoseReview) return;
    if (lateDosePromptedFor.current === encounter.administrationDate) return;
    lateDosePromptedFor.current = encounter.administrationDate;
    openLateDoseDialog();
    // `openLateDoseDialog` reads current encounter/details by closure and is
    // recreated each render; including it would refire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    encounter.administrationDate,
    encounter.details?.lateDoseReview,
    evaluation?.output.lateDoseWarning,
    locked,
  ]);

  const confirmLateDoseReview = () => {
    patchDetails({
      lateDoseReview: lateDoseReviewChoice,
      lateDoseReviewNote: lateDoseReviewChoice === "other" ? lateDoseReviewNoteDraft.trim() : "",
    });
    setLateDoseDialogOpen(false);
  };

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <InjectionRequirementsContext.Provider value={requirements}>
        <InjectionIncompleteFieldsContext.Provider value={incompleteFields}>
        <div class="wfp-summary-bar wfp-injection-context">
        <strong>Injection worksheet</strong>
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
        {sessionStaff && (
          <span class="wfp-session-context" title="Editable documenting-staff default">
            Session staff: {sessionStaff}
          </span>
        )}
        {/* Printing is read-only output; a quick-access copy lives here so it's
            reachable from any tab, not just Outcome's "Document output"
            section - staff shouldn't have to navigate to the last tab just to
            discover AVS is available once the minimal fields exist. */}
        <button
          type="button"
          class="cd2004-link-button wfp-summary-print-avs"
          onClick={() => clickLegacyControl("printAVS")}
          disabled={!hasAdministrationDetailsForAvs}
          title={
            hasAdministrationDetailsForAvs
              ? "Print the patient after-visit summary"
              : "Available once medication, dose, route, site, and administration date are documented."
          }
        >
          <DesktopIcon name="print" />
          Print AVS
        </button>
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
        <span class="wfp-transaction-readout" aria-label={`Worksheet page ${activePage} of ${visibleTabs.length}`}>
          <b>{locked ? "REVIEW" : "ENTRY"}</b>
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

      <div class="wfp-tabbar" role="tablist">
        {visibleTabs.map(([key, label]) => {
          const tabStopCount = stopsByTab.get(key) ?? 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              class="wfp-tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
              {tabStopCount > 0 && (
                <span class="wfp-tab-badge" aria-hidden="true">
                  {tabStopCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
            setTab(nonAdministration && (target === "administration" || target === "product") ? "outcome" : target)
          }
        />
      )}

      <fieldset disabled={locked} style="border:none;padding:0;margin:0;display:contents">

      {tab === "order" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Patient & ordering provider">
            <div class="wfp-section-head">Patient &amp; ordering provider</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Patient name" field="patient.name">
                  <input
                    value={encounter.patient.name}
                    placeholder="Last, First"
                    onInput={(event) => patchPatient({ name: event.currentTarget.value })}
                  />
                </Field>
                <Field label="DOB" field="patient.dob" width="date">
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    inputMode="numeric"
                    onInput={(event) =>
                      patchPatient({ dob: formatDobAsTyped(event.currentTarget.value) })
                    }
                  />
                </Field>
                <Field label="Ordering provider" field="orderingProvider">
                  <input
                    value={encounter.orderingProvider}
                    placeholder="Provider name"
                    onInput={(event) => patch({ orderingProvider: event.currentTarget.value })}
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
              <Field label="Visit reason" field="reason">
                <OptionList<InjectionReason>
                  name="inj-reason"
                  value={encounter.reason}
                  onChange={(value) => patch({ reason: value })}
                  options={INJECTION_REASON_OPTIONS}
                  inline
                />
              </Field>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Ordered medication">
            <div class="wfp-section-head">Ordered medication</div>
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
                hint="Auto-filled from the product's labeled needle once a site is selected — editable"
              >
                <input
                  value={encounter.technique ?? ""}
                  placeholder="Needle gauge, length, or technique note"
                  onInput={(event) => patch({ technique: event.currentTarget.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Schedule & next dose">
            <div class="wfp-section-head">Schedule &amp; next dose</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Prior dose" field="priorDoseDate">
                  <input
                    type="date"
                    value={encounter.priorDoseDate}
                    onInput={(event) => patch({ priorDoseDate: event.currentTarget.value })}
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
                <Field label="Expected next due" field="nextDoseDate">
                  <input
                    type="date"
                    value={encounter.nextDoseDate}
                    onInput={(event) => applyManualNextDose(event.currentTarget.value)}
                  />
                  {nextDoseIsCalculated && (
                    <span class="wfp-calculated-value">
                      {encounter.initiation?.protocol === "sustenna-day1"
                        ? "Calculated as the Day 8 target (Day 1 + 7 days), not the ordered interval"
                        : "Calculated from documented date + cadence"}
                    </span>
                  )}
                  {suggestedNextDose && !nextDoseIsCalculated && (
                    <button
                      type="button"
                      class="cd2004-link-button wfp-field-action"
                      onClick={() => applyCalculatedNextDose(suggestedNextDose)}
                    >
                      Reset to calculated {suggestedNextDose}
                    </button>
                  )}
                </Field>
              </div>
              {/* The due line a MAR carries: how long since the last dose and
                  what window this one falls in, stamped the way the app's
                  own posted/error banners are (.cd2004-post-stamp /
                  .cd2004-post-error) - a fixed-color 16-bit pictogram beside
                  a bold sentence-case caption, not a generic colored alert
                  box. Every value here is read straight off the engine's own
                  timing evaluation - this surfaces what it already computed
                  and adds no gating of its own. The engine raises the stop
                  or warning itself. */}
              {!nonAdministration && evaluation && (
                <div class={`wfp-timing-banner is-${evaluation.output.timing.state}`}>
                  <DesktopIcon name={injectionTimingStatusIcon(evaluation.output.timing)} />
                  <div>
                    <strong class="wfp-timing-banner-status">
                      {injectionTimingStatusLabel(evaluation.output.timing)}
                    </strong>
                    <div class="wfp-timing-banner-days">
                      {evaluation.output.timing.daysSincePrior === null
                        ? "Days since prior dose: —"
                        : `${evaluation.output.timing.daysSincePrior} day(s) since prior dose`}
                      {evaluation.output.timing.earliestDay !== null &&
                        evaluation.output.timing.latestDay !== null && (
                          <>
                            {" "}
                            · permitted window day {evaluation.output.timing.earliestDay}–
                            {evaluation.output.timing.latestDay}
                          </>
                        )}
                    </div>
                    <p class="wfp-timing-banner-message">{evaluation.output.timing.message}</p>
                    {medication &&
                      evaluation.output.timing.state === "warning" &&
                      medication.missedDoseGuidance.trim() && (
                        <p class="wfp-timing-banner-guidance">
                          <strong>{medication.label} guidance:</strong>{" "}
                          {medication.missedDoseGuidance}
                        </p>
                      )}
                  </div>
                </div>
              )}
              {!nonAdministration && evaluation?.output.lateDoseWarning && (
                <p class="wfp-field-hint">
                  {encounter.details?.lateDoseReview ? (
                    <>
                      Late-dose review:{" "}
                      {encounter.details.lateDoseReview === "provider-authorized"
                        ? "reviewed with provider, administration authorized."
                        : encounter.details.lateDoseReviewNote || "other (see note)."}{" "}
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
                        Document late-dose review
                      </button>
                    )
                  )}
                </p>
              )}
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Dose history">
            <div class="wfp-section-head">
              Dose history
              {doseHistory.length > 0 && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">{doseHistory.length}</span>
              )}
            </div>
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
              <div class="wfp-section-head">Initiation &amp; paired-injection path</div>
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
                    <div class="wfp-section-head">{initiationConfig.title}</div>
                    <div class="wfp-section-body">
                      <p class="wfp-field-hint">{initiationConfig.summary}</p>
                      <div
                        class={`wfp-checkbox-row ${requirements["initiation.planVerified"]?.state === "required" ? "is-required" : ""}`}
                        data-requirement={requirements["initiation.planVerified"]?.state ?? "unprojected"}
                      >
                        <input
                          type="checkbox"
                          id="init-plan-verified"
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
                              <input
                                value={encounter.initiation?.second.dose ?? ""}
                                placeholder="Per active order"
                                onInput={(event) => onPairedDoseChange(event.currentTarget.value)}
                              />
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
                              <input
                                type="date"
                                value={encounter.initiation?.day1Date ?? ""}
                                onInput={(event) => patchInitiation({ day1Date: event.currentTarget.value })}
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
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Actual administration location">
            <div class="wfp-section-head">
              Actual administration location
              {recommendedSite && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">rotate: {recommendedSite}</span>
              )}
            </div>
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
                <div class="wfp-choice-field" data-requirement={requirements.site?.state ?? "unprojected"}>
                  <span class="wfp-choice-caption">
                    Actual administration site
                    {requirements.site?.state === "required" && <abbr class="wfp-req" title="Required">*</abbr>}
                    {requirements.site?.state === "optional" && <span class="wfp-opt">optional</span>}
                  </span>
                  {(() => {
                    const groups = groupSitesByRoute(allowedSites);
                    const siteTile = (site: string) => (
                      <label
                        key={site}
                        class={`wfp-site-tile ${encounter.site === site ? "is-selected" : ""}`}
                      >
                        <input type="radio" name="inj-site" checked={encounter.site === site} onChange={() => patch({ site })} />
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
            <div class="wfp-section-head">Given by / time</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Administered by" field="administeredBy">
                  <input
                    value={encounter.administeredBy}
                    placeholder="J. Doe, LVN"
                    onInput={(event) => patch({ administeredBy: event.currentTarget.value })}
                  />
                  {staffSignInValue.trim() && (
                    <span class="wfp-session-default">Session-derived default; editable for the documenting staff member.</span>
                  )}
                </Field>
                <Field label="Actual administration date" field="administrationDate">
                  <input
                    type="date"
                    value={encounter.administrationDate}
                    onInput={(event) => patch({ administrationDate: event.currentTarget.value })}
                  />
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

              <div class="wfp-section-head">Dose delivered &amp; device</div>
              <div class="wfp-row">
                <Field label="Administration amount" field="details.volume">
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
                    <option value="mg">mg (dose amount)</option>
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
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Lot & traceability">
            <div class="wfp-section-head">Lot &amp; traceability</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="NDC" field="traceability.ndc">
                  <NdcPicker
                    inputId="inj-ndc"
                    query={primaryNdcQuery}
                    value={encounter.traceability.ndc}
                    lookup={primaryNdcLookup}
                    onChange={applyPrimaryNdc}
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
          </div>

          <div class="wfp-section" role="group" aria-label="Product handling & trace exceptions">
            <div class="wfp-section-head">Product handling &amp; trace exceptions</div>
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
                <Field label="Preparation / reconstitution" field="details.preparation">
                  <select
                    value={encounter.details?.preparation ?? ""}
                    onChange={(event) => patchDetails({ preparation: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Preparation/reconstitution verified per current product instructions">
                      Verified per current product instructions
                    </option>
                    <option value="Other">Other preparation / reconstitution detail</option>
                  </select>
                </Field>
                {encounter.details?.preparation === "Other" && (
                  <Field label="Preparation detail" field="details.preparationOther">
                    <input
                      value={encounter.details?.preparationOther ?? ""}
                      onInput={(event) => patchDetails({ preparationOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
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
                      <input
                        type="datetime-local"
                        value={encounter.details?.productIssueNotificationTime ?? ""}
                        onInput={(event) =>
                          patchDetails({ productIssueNotificationTime: event.currentTarget.value })
                        }
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
          </div>
        </div>
      )}

      {tab === "verification" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Verification & safety">
            <div class="wfp-section-head">Verification &amp; safety</div>
            <div class="wfp-section-body">
              <CheckList
                items={INJECTION_ATTESTATION_OPTIONS}
                checked={(key) => Boolean(encounter.attestations[key as keyof InjectionEncounter["attestations"]])}
                onToggle={toggleAttestation}
                requirementFor={(key) => `attestations.${key}`}
                quiet
              />
              {medication && visibleMedicationVerifications.length > 0 && (
                <>
                  <div class="wfp-section-head">{medication.label} safety</div>
                  <CheckList
                    items={visibleMedicationVerifications.map((key) => ({
                      key,
                      label: verificationLabels[key],
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
                    <div class="wfp-section-head">Provider review triggers</div>
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
        </div>
      )}

      {tab === "outcome" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Response & follow-up">
            <div class="wfp-section-head">Response &amp; follow-up</div>
            <div class="wfp-section-body">
              <Field label="Patient response" field="response">
                <OptionList<InjectionResponse["kind"]>
                  name="inj-response"
                  value={encounter.response.kind}
                  onChange={(value) => patch({ response: { ...encounter.response, kind: value } })}
                  options={INJECTION_RESPONSE_OPTIONS}
                  inline
                />
              </Field>
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

              {requirements["details.administrationException"]?.state !== "hidden" && (
              <div class="wfp-checkbox-row" data-requirement={requirements["details.administrationException"]?.state ?? "unprojected"}>
                <input
                  type="checkbox"
                  id="inj-exception-toggle"
                  checked={encounter.details?.administrationException ?? false}
                  onChange={(event) => patchDetails({ administrationException: event.currentTarget.checked })}
                />
                <label for="inj-exception-toggle">
                  Administration exception / escalation — use only when something changed after or during the
                  administered encounter
                </label>
              </div>
              )}
              {requirements["details.administrationException"]?.state !== "hidden" && encounter.details?.administrationException && (
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
                        onInput={(event) => patchDetails({ exceptionRecipient: event.currentTarget.value })}
                      />
                    </Field>
                    <Field label="Notification / decision time" field="details.exceptionTime">
                      <input
                        type="datetime-local"
                        value={encounter.details?.exceptionTime ?? ""}
                        onInput={(event) => patchDetails({ exceptionTime: event.currentTarget.value })}
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
            </div>
          </div>

          {!nonAdministration && (
            <div class="wfp-section" role="group" aria-label="Additional note items">
              <div class="wfp-section-head">Additional note items</div>
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
                <Field label="Disposition on departure" hint="optional">
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
                  <Field label="Describe departure">
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
            <div
              class="wfp-section-head"
              data-requirement={requirements["disposition.kind"]?.state ?? "unprojected"}
            >
              Clinical disposition
              {requirements["disposition.kind"]?.state === "required" && (
                <abbr class="wfp-req" title="Required">*</abbr>
              )}
            </div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">
                Use the checked routine review items as a fast review-by-exception sheet, then make one final
                documentation choice. An administration note remains unavailable until a complete
                administration is documented.
              </p>
              <div class="wfp-option-list wfp-option-list-inline wfp-disposition-list">
                {(
                  [
                    ["administered", "Review complete — document administration", "ready", "check"],
                    ["held", "Held", "warning", "alert"],
                    ["escalated", "Escalated", "warning", "alert"],
                    ["provider", "Provider-directed plan", "warning", "alert"],
                  ] as Array<[InjectionDisposition["kind"], string, "ready" | "warning", "check" | "alert"]>
                ).map(([kind, label, tone, iconName]) => (
                  <label
                    key={kind}
                    class={`wfp-option-row is-${tone} ${encounter.disposition.kind === kind ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="inj-disposition"
                      checked={encounter.disposition.kind === kind}
                      onChange={() => patchDisposition({ kind })}
                    />
                    <span class="wfp-option-title">
                      <span class="wfp-option-icon" aria-hidden="true">
                        <DesktopIcon name={iconName} />
                      </span>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              {encounter.disposition.kind && encounter.disposition.kind !== "administered" && (
                <div class="wfp-section" role="group" aria-label="Required handoff details">
                  <div class="wfp-section-head">Required handoff details</div>
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
                        <input
                          type="datetime-local"
                          value={encounter.disposition.time ?? ""}
                          onInput={(event) => patchDisposition({ time: event.currentTarget.value })}
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
                <p class="wfp-done-line">
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
      {tab === "outcome" && (
        <div class="wfp-section" role="group" aria-label="Document output">
          <div class="wfp-section-head">Document output</div>
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
                onClick={() => clickLegacyControl("printAVS")}
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
                onClick={() => clickLegacyControl("injWorksheetPrint")}
              >
                <DesktopIcon name="print" />
                Print injection worksheet
              </button>
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => clickLegacyControl("injWorksheetBlank")}
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
          <div class="wfp-section-head">Addendum</div>
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
            <Field label="Addendum entered by">
              <input
                value={addendumAuthor}
                placeholder="Current staff name or initials"
                onInput={(event) => onAddendumAuthorChange(event.currentTarget.value)}
              />
            </Field>
            <Field label="Dated addendum">
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
              <OptionList<"provider-authorized" | "other">
                name="late-dose-review"
                value={lateDoseReviewChoice}
                onChange={setLateDoseReviewChoice}
                options={LATE_DOSE_REVIEW_OPTIONS}
              />
              {lateDoseReviewChoice === "other" && (
                <textarea
                  value={lateDoseReviewNoteDraft}
                  placeholder="Briefly describe"
                  onInput={(event) => setLateDoseReviewNoteDraft(event.currentTarget.value)}
                />
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
                disabled={lateDoseReviewChoice === "other" && !lateDoseReviewNoteDraft.trim()}
                onClick={confirmLateDoseReview}
              >
                Confirm
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
