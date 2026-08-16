import {
  issue,
  readinessFrom,
  uniqueIssues,
  type ClinicalEngine,
  type ClinicalEvaluation,
  type ClinicalIssue,
  type PatientIdentity,
} from "./contracts";
import {
  isExpiredMonth,
  isValidExpirationMonth,
  isValidLocalDateTime,
  localIsoDate,
} from "./dates";

export const UDS_PANELS = [
  "BUP",
  "MTD",
  "MOP",
  "OXY",
  "PPX",
  "BZO",
  "BAR",
  "TCA",
  "AMP",
  "MET",
  "COC",
  "MDMA",
  "PCP",
  "THC",
] as const;

export type UdsPanel = (typeof UDS_PANELS)[number];
export type UdsResultState = "neg" | "pos" | "invalid" | "nt";
export type UdsControlState = "not documented" | "valid" | "invalid";
export type UdsTemperatureState = "acceptable" | "not documented" | "not acceptable";

export const UDS_PANEL_INFO: Record<
  UdsPanel,
  { name: string; patientName: string; group: string }
> = {
  BUP: { name: "Buprenorphine", patientName: "buprenorphine medication screen", group: "Opioid / medication-assisted treatment" },
  MTD: { name: "Methadone", patientName: "methadone medication screen", group: "Opioid / medication-assisted treatment" },
  MOP: { name: "Morphine / opiate", patientName: "opiate pain medicine screen", group: "Opioid / medication-assisted treatment" },
  OXY: { name: "Oxycodone", patientName: "oxycodone pain medicine screen", group: "Opioid / medication-assisted treatment" },
  PPX: { name: "Propoxyphene", patientName: "propoxyphene pain medicine screen", group: "Opioid / medication-assisted treatment" },
  BZO: { name: "Benzodiazepines", patientName: "benzodiazepine medicine screen", group: "Sedative / psychiatric relevance" },
  BAR: { name: "Barbiturates", patientName: "barbiturate medicine screen", group: "Sedative / psychiatric relevance" },
  TCA: { name: "Tricyclic antidepressants", patientName: "tricyclic antidepressant medicine screen", group: "Sedative / psychiatric relevance" },
  AMP: { name: "Amphetamines", patientName: "amphetamine stimulant screen", group: "Stimulant / other substances" },
  MET: { name: "Methamphetamine", patientName: "methamphetamine stimulant screen", group: "Stimulant / other substances" },
  COC: { name: "Cocaine metabolite", patientName: "cocaine screen", group: "Stimulant / other substances" },
  MDMA: { name: "MDMA / ecstasy", patientName: "ecstasy-related substance screen", group: "Stimulant / other substances" },
  PCP: { name: "Phencyclidine", patientName: "phencyclidine screen", group: "Stimulant / other substances" },
  THC: { name: "Cannabinoids / THC", patientName: "cannabis or marijuana screen", group: "Cannabis" },
};

export const UDS_GROUPS: ReadonlyArray<{
  key: string;
  label: string;
  sub: string;
  panels: readonly UdsPanel[];
}> = [
  { key: "opioid", label: "Opioid / MAT-related", sub: "Medication-assisted treatment and opioid panels", panels: ["BUP", "MTD", "MOP", "OXY", "PPX"] },
  { key: "sedative", label: "Sedative / psychiatric relevance", sub: "Benzodiazepine, barbiturate, and TCA panels", panels: ["BZO", "BAR", "TCA"] },
  { key: "stimulant", label: "Stimulant / illicit", sub: "Amphetamine, methamphetamine, cocaine, MDMA, PCP", panels: ["AMP", "MET", "COC", "MDMA", "PCP"] },
  { key: "cannabis", label: "Cannabis", sub: "THC panel", panels: ["THC"] },
];

export const UDS_REASON_OPTIONS: ReadonlyArray<{ key: UdsEncounter["reason"]; label: string }> = [
  { key: "routine", label: "Routine monitoring" },
  { key: "medmgmt", label: "Medication management" },
  { key: "preinj", label: "Pre-injection" },
  { key: "ordered", label: "Provider ordered" },
  { key: "other", label: "Other" },
];

export const UDS_TEMP_OPTIONS: ReadonlyArray<{ key: UdsTemperatureState; label: string }> = [
  { key: "acceptable", label: "Acceptable" },
  { key: "not documented", label: "Not documented" },
  { key: "not acceptable", label: "Not acceptable" },
];

export const UDS_CONTROL_OPTIONS: ReadonlyArray<{ key: UdsControlState; label: string }> = [
  { key: "not documented", label: "Not documented" },
  { key: "valid", label: "Valid control line" },
  { key: "invalid", label: "Invalid / missing control" },
];

export const UDS_RESULT_LABEL: Record<UdsResultState, string> = {
  neg: "Negative",
  pos: "Preliminary positive",
  invalid: "Invalid / unreadable",
  nt: "Not tested",
};

export const UDS_RESULT_CYCLE: readonly UdsResultState[] = ["nt", "neg", "pos", "invalid"];

export interface UdsDeviceProfileDefinition {
  id: "safe-life-13" | "safe-life-14";
  label: string;
  orderedPanels: readonly UdsPanel[];
}

/** The result worksheet follows the audited physical cup order. */
export const UDS_DEVICE_PROFILES: readonly UdsDeviceProfileDefinition[] = [
  { id: "safe-life-13", label: "SAFE life 13-Panel Cup", orderedPanels: UDS_PANELS },
  { id: "safe-life-14", label: "SAFE life 14-Panel Cup", orderedPanels: UDS_PANELS },
];

const isUdsPanel = (value: string): value is UdsPanel =>
  (UDS_PANELS as readonly string[]).includes(value);

export const normalizeUdsPanelSequence = (
  panels: readonly (UdsPanel | string)[] | undefined,
): UdsPanel[] => {
  const seen = new Set<UdsPanel>();
  const normalized: UdsPanel[] = [];
  for (const panel of panels ?? []) {
    if (!isUdsPanel(panel) || seen.has(panel)) continue;
    seen.add(panel);
    normalized.push(panel);
  }
  return normalized;
};

/** One deliberate keyboard/click action advances one result through the same
 * compact cycle used by the worksheet cell. */
export const nextUdsResultState = (value: UdsResultState): UdsResultState => {
  const index = UDS_RESULT_CYCLE.indexOf(value);
  return UDS_RESULT_CYCLE[(index + 1) % UDS_RESULT_CYCLE.length] ?? "nt";
};

export const udsPanelName = (panel: UdsPanel): string => UDS_PANEL_INFO[panel]?.name ?? panel;
export const udsReasonLabel = (key: UdsEncounter["reason"]): string =>
  UDS_REASON_OPTIONS.find((option) => option.key === key)?.label ?? key;
export const udsTempLabel = (key: UdsTemperatureState): string =>
  UDS_TEMP_OPTIONS.find((option) => option.key === key)?.label ?? key;
export const udsControlLabel = (key: UdsControlState): string =>
  UDS_CONTROL_OPTIONS.find((option) => option.key === key)?.label ?? key;

/**
 * Selecting a physical device identifies the panel profile, but never invents
 * readings. A new device requires an explicit QC review and explicit results.
 */
export function applyUdsDeviceProfileDefaults(encounter: UdsEncounter): UdsEncounter {
  const results = Object.fromEntries(
    UDS_PANELS.map((panel) => [panel, "nt"]),
  ) as Record<UdsPanel, UdsResultState>;
  return {
    ...encounter,
    results,
    physicalReadingsVerified: false,
    control: "not documented",
    validity: "not documented",
  };
}

export interface UdsEncounter {
  patient: PatientIdentity;
  collectionDateTime: string;
  reason: "" | "routine" | "medmgmt" | "preinj" | "ordered" | "other";
  reasonDetail?: string;
  device: string;
  omittedPanel?: UdsPanel | "";
  physicalReadingsVerified: boolean;
  customDeviceName?: string;
  customPanels?: UdsPanel[];
  /** Legacy compatibility only; new custom devices capture exact panels. */
  customPanelSetVerified?: boolean;
  lot: string;
  expiration: string;
  collector: string;
  temperature: UdsTemperatureState;
  control: UdsControlState;
  validity: "acceptable" | "needs review" | "not documented";
  medicationAlignment:
    | ""
    | "no unexpected"
    | "not aligned"
    | "needs review"
    | "patient explanation"
    | "unavailable";
  results: Partial<Record<UdsPanel, UdsResultState>>;
  labPlan?: string;
  comment?: string;
}

export interface UdsEngineContext {
  today?: string;
}

export type UdsRequirementState = "pending" | "required" | "optional" | "hidden";

export interface UdsRequirement {
  state: UdsRequirementState;
  section: "specimen" | "results" | "review";
  reason?: string;
}

export interface UdsEvaluationOutput {
  negative: UdsPanel[];
  preliminaryPositive: UdsPanel[];
  invalid: UdsPanel[];
  notTested: UdsPanel[];
  testedCount: number;
  interpretationAllowed: boolean;
  finalizedOutputAllowed: boolean;
  activityStatus: "completed" | "needs_review";
  deviceProfile: "14" | "13" | "other" | "none";
  requirements: Record<string, UdsRequirement>;
}

export type UdsReportStatusState =
  | "not-started"
  | "incomplete"
  | "all-negative"
  | "review-required"
  | "invalid"
  | "locked";

export interface UdsReportStatus {
  state: UdsReportStatusState;
  label: string;
  marker: "PENDING" | "STOP" | "REVIEW" | "PRELIM" | "INVALID" | "LOCKED";
  tone: "neutral" | "attention" | "success" | "danger";
  detail: string;
}

const resultGroups = (encounter: UdsEncounter) => {
  const panels = displayedUdsPanels(encounter);
  const by = (state: UdsResultState): UdsPanel[] =>
    panels.filter((panel) => (encounter.results[panel] ?? "nt") === state);
  return {
    negative: by("neg"),
    preliminaryPositive: by("pos"),
    invalid: by("invalid"),
    notTested: by("nt"),
  };
};

export const profileFor = (device: string): UdsEvaluationOutput["deviceProfile"] => {
  if (device === "SAFE life 14-Panel Cup") return "14";
  if (device === "SAFE life 13-Panel Cup") return "13";
  return device.trim() ? "other" : "none";
};

export const displayedUdsPanels = (encounter: UdsEncounter): UdsPanel[] => {
  const profile = profileFor(encounter.device);
  if (profile === "13" && encounter.omittedPanel) {
    return UDS_PANELS.filter((panel) => panel !== encounter.omittedPanel);
  }
  if (profile === "other") {
    return normalizeUdsPanelSequence(encounter.customPanels);
  }
  return [...UDS_PANELS];
};

const hasStarted = (encounter: UdsEncounter): boolean => {
  const anyResult = UDS_PANELS.some((panel) => (encounter.results[panel] ?? "nt") !== "nt");
  return Boolean(
    encounter.patient.name.trim() ||
      encounter.patient.dob.trim() ||
      encounter.reason ||
      encounter.reasonDetail?.trim() ||
      encounter.collector.trim() ||
      encounter.collectionDateTime.trim() ||
      encounter.device.trim() ||
      encounter.lot.trim() ||
      encounter.expiration.trim() ||
      encounter.temperature !== "not documented" ||
      encounter.control !== "not documented" ||
      encounter.validity !== "not documented" ||
      encounter.medicationAlignment ||
      (encounter.labPlan?.trim() && encounter.labPlan !== "provider to decide") ||
      encounter.comment?.trim() ||
      anyResult,
  );
};

const buildUdsRequirementProjection = (
  encounter: UdsEncounter,
  started: boolean,
  profile: UdsEvaluationOutput["deviceProfile"],
): Record<string, UdsRequirement> => {
  const contextState: UdsRequirementState = started ? "required" : "pending";
  const requirement = (
    state: UdsRequirementState,
    section: UdsRequirement["section"],
    reason?: string,
  ): UdsRequirement => ({ state, section, ...(reason ? { reason } : {}) });

  return {
    "patient.name": requirement(contextState, "specimen"),
    "patient.dob": requirement(contextState, "specimen"),
    collector: requirement(contextState, "specimen"),
    collectionDateTime: requirement(contextState, "specimen"),
    temperature: requirement(contextState, "specimen"),
    // Encounter type is deliberately the one required choice on an untouched
    // screen. It establishes why the transaction exists and activates the
    // rest of the context-dependent requirements.
    reason: requirement("required", "specimen"),
    reasonDetail: requirement(
      encounter.reason === "other" ? "required" : "hidden",
      "specimen",
      "Required when encounter type is Other.",
    ),
    device: requirement(contextState, "specimen"),
    omittedPanel: requirement(
      profile === "13" ? "required" : "hidden",
      "specimen",
      "Required for a 13-panel device.",
    ),
    customDeviceName: requirement(
      profile === "other" ? "required" : "hidden",
      "specimen",
      "Required for an unlisted device.",
    ),
    customPanels: requirement(
      profile === "other" ? "required" : "hidden",
      "specimen",
      "Required for an unlisted device.",
    ),
    lot: requirement(contextState, "specimen"),
    expiration: requirement(contextState, "specimen"),
    control: requirement(contextState, "specimen"),
    validity: requirement(contextState, "specimen"),
    physicalReadingsVerified: requirement(contextState, "specimen"),
    results: requirement(contextState, "results"),
    medicationAlignment: requirement(contextState, "review"),
    labPlan: requirement("optional", "review"),
    comment: requirement("optional", "review"),
    devicePhoto: requirement("optional", "specimen"),
  };
};

export const UdsEngine: ClinicalEngine<UdsEncounter, UdsEngineContext, UdsEvaluationOutput> = {
  evaluate(
    encounter: UdsEncounter,
    context: UdsEngineContext = {},
  ): ClinicalEvaluation<UdsEvaluationOutput> {
    const stops: ClinicalIssue[] = [];
    const warnings: ClinicalIssue[] = [];
    const recommendations = [];
    const calculatedDates: Record<string, string> = {};
    const started = hasStarted(encounter);
    const displayedPanels = displayedUdsPanels(encounter);
    const allGroups = resultGroups(encounter);
    const inDisplayedSet = (panel: UdsPanel) => displayedPanels.includes(panel);
    const groups = allGroups;
    const testedCount = displayedPanels.length - groups.notTested.length;
    const profile = profileFor(encounter.device);
    const requirements = buildUdsRequirementProjection(encounter, started, profile);
    const expirationReference = isValidLocalDateTime(encounter.collectionDateTime)
      ? encounter.collectionDateTime.slice(0, 10)
      : context.today || localIsoDate();
    const expirationMonthVerified = isValidExpirationMonth(encounter.expiration);
    const deviceExpired = Boolean(
      expirationMonthVerified &&
        isExpiredMonth(encounter.expiration, expirationReference),
    );

    if (started && !encounter.patient.name.trim()) {
      stops.push(
        issue("stop", "patient.name", "Document the patient name.", "patient.name", "patient"),
      );
    }
    if (started && !encounter.patient.dob.trim()) {
      stops.push(
        issue("stop", "patient.dob", "Document the patient date of birth.", "patient.dob", "patient"),
      );
    }
    if (started && !encounter.reason) {
      stops.push(
        issue(
          "stop",
          "reason.required",
          "Select the UDS encounter type.",
          "reason",
          "collection",
        ),
      );
    }
    if (started && !encounter.collectionDateTime.trim()) {
      stops.push(
        issue(
          "stop",
          "collection.datetime",
          "Document the collection date and time.",
          "collectionDateTime",
          "collection",
        ),
      );
    } else if (started && !isValidLocalDateTime(encounter.collectionDateTime)) {
      stops.push(
        issue(
          "stop",
          "collection.datetime-invalid",
          "Verify the collection date and time; use a real local calendar date and time.",
          "collectionDateTime",
          "collection",
        ),
      );
    }
    if (started && encounter.reason === "other" && !encounter.reasonDetail?.trim()) {
      stops.push(
        issue(
          "stop",
          "reason.other-detail",
          "Describe the provider-directed or other screening reason.",
          "reasonDetail",
          "collection",
        ),
      );
    }
    if (started && profile === "none") {
      stops.push(
        issue(
          "stop",
          "device.required",
          "Identify the physical point-of-care cup/device.",
          "device",
          "device",
        ),
      );
    }
    if (profile === "13") {
      if (!encounter.omittedPanel) {
        stops.push(
          issue(
            "stop",
            "device.13.omitted",
            "Identify the one displayed panel that is not on this 13-panel cup.",
            "omittedPanel",
            "device",
          ),
        );
      } else if ((encounter.results[encounter.omittedPanel] ?? "nt") !== "nt") {
        stops.push(
          issue(
            "stop",
            "device.13.omitted-result",
            "The panel omitted from the physical 13-panel cup must remain Not tested.",
            `results.${encounter.omittedPanel}`,
            "results",
          ),
        );
      }
    }
    if (profile === "other" && !encounter.customDeviceName?.trim()) {
      stops.push(
        issue(
          "stop",
          "device.other.name",
          "Enter the device name shown on the package.",
          "customDeviceName",
          "device",
        ),
      );
    }
    if (profile === "other" && displayedPanels.length === 0) {
      stops.push(
        issue(
          "stop",
          "device.other.profile",
          "Build the exact panel sequence shown on the physical device.",
          "customPanels",
          "device",
        ),
      );
    }
    const resultsOutsideProfile = UDS_PANELS.filter(
      (panel) => !inDisplayedSet(panel) && (encounter.results[panel] ?? "nt") !== "nt",
    );
    if (profile === "other" && resultsOutsideProfile.length) {
      stops.push(
        issue(
          "stop",
          "results.outside-profile",
          `Clear result(s) not present on this device: ${resultsOutsideProfile.join(", ")}.`,
          "results",
          "results",
        ),
      );
    }
    if (started && profile !== "none" && !encounter.physicalReadingsVerified) {
      stops.push(
        issue(
          "stop",
          "device.readings",
          "Confirm the physical cup and displayed panel readings were verified.",
          "physicalReadingsVerified",
          "device",
        ),
      );
    }
    if (started && !encounter.lot.trim()) {
      stops.push(
        issue("stop", "trace.lot", "Document the device lot.", "lot", "traceability"),
      );
    }
    if (started && !encounter.expiration.trim()) {
      stops.push(
        issue(
          "stop",
          "trace.expiration",
          "Document the device expiration.",
          "expiration",
          "traceability",
        ),
      );
    } else if (started && !expirationMonthVerified) {
      stops.push(
        issue(
          "stop",
          "trace.expiration-invalid",
          "Verify the device expiration month.",
          "expiration",
          "traceability",
        ),
      );
    } else if (deviceExpired) {
      stops.push(
        issue(
          "stop",
          "trace.expired",
          "The documented cup/device is expired; use an in-date device.",
          "expiration",
          "traceability",
        ),
      );
    }
    if (started && !encounter.collector.trim()) {
      stops.push(
        issue(
          "stop",
          "collector.required",
          "Document the collector/operator.",
          "collector",
          "traceability",
        ),
      );
    }
    if (started && testedCount === 0) {
      stops.push(
        issue(
          "stop",
          "results.required",
          "Document at least one result from the physical device.",
          "results",
          "results",
        ),
      );
    }
    if (started && encounter.control !== "valid") {
      stops.push(
        issue(
          "stop",
          "control.invalid",
          encounter.control === "invalid"
            ? "Control line is absent or unreadable; do not interpret the result."
            : "Control line is not documented; do not interpret until verified.",
          "control",
          "validity",
        ),
      );
    }
    if (started && encounter.temperature !== "acceptable") {
      stops.push(
        issue(
          "stop",
          "temperature.review",
          encounter.temperature === "not acceptable"
            ? "Specimen temperature is not acceptable; provider review is required."
            : "Specimen temperature is not documented.",
          "temperature",
          "validity",
        ),
      );
    }
    if (started && encounter.validity !== "acceptable") {
      stops.push(
        issue(
          "stop",
          "validity.review",
          "Document acceptable validity markers before finalizing the point-of-care screen.",
          "validity",
          "validity",
        ),
      );
    }

    if (groups.invalid.length) {
      warnings.push(
        issue(
          "warning",
          "results.invalid-panels",
          `Do not interpret invalid/unreadable panel(s): ${groups.invalid.join(", ")}.`,
          "results",
          "results",
        ),
      );
    }
    if (groups.preliminaryPositive.length) {
      warnings.push(
        issue(
          "warning",
          "results.preliminary-positive",
          `Preliminary positive panel(s) require clinician review: ${groups.preliminaryPositive.join(", ")}.`,
          "results",
          "results",
        ),
      );
    }
    if (started && !encounter.medicationAlignment) {
      stops.push(
        issue(
          "stop",
          "reconciliation.required",
          "Review medication alignment or document that the medication list is unavailable.",
          "medicationAlignment",
          "reconciliation",
        ),
      );
    }
    if (
      encounter.medicationAlignment === "not aligned" ||
      encounter.medicationAlignment === "needs review"
    ) {
      warnings.push(
        issue(
          "warning",
          "reconciliation.review",
          "Medication alignment requires clinician handoff.",
          "medicationAlignment",
          "reconciliation",
        ),
      );
    } else if (encounter.medicationAlignment === "unavailable") {
      warnings.push(
        issue(
          "warning",
          "reconciliation.unavailable",
          "Medication list was unavailable or not reviewed; interpret in clinical context.",
          "medicationAlignment",
          "reconciliation",
        ),
      );
    }
    if (groups.preliminaryPositive.length || groups.invalid.length) {
      recommendations.push({
        code: "uds.provider-review",
        message: "Route the screen to the clinician for contextual review and follow-up direction.",
        action: "open-handoff",
      });
    }

    const uniqueStops = uniqueIssues(stops);
    const uniqueWarnings = uniqueIssues(warnings);
    const finalizedOutputAllowed = started && uniqueStops.length === 0;
    const requiresReview =
      uniqueStops.length > 0 ||
      uniqueWarnings.length > 0 ||
      encounter.medicationAlignment !== "no unexpected";
    const profileVerified =
      profile === "14" ||
      (profile === "13" &&
        Boolean(encounter.omittedPanel) &&
        (encounter.results[encounter.omittedPanel as UdsPanel] ?? "nt") === "nt") ||
      (profile === "other" &&
        Boolean(encounter.customDeviceName?.trim()) &&
        displayedPanels.length > 0);
    const interpretationAllowed =
      started &&
      isValidLocalDateTime(encounter.collectionDateTime) &&
      profileVerified &&
      encounter.physicalReadingsVerified &&
      expirationMonthVerified &&
      !deviceExpired &&
      testedCount > 0 &&
      groups.invalid.length === 0 &&
      encounter.control === "valid" &&
      encounter.temperature === "acceptable" &&
      encounter.validity === "acceptable";

    return {
      workflow: "uds",
      readiness: readinessFrom(started, uniqueStops, uniqueWarnings),
      stops: uniqueStops,
      warnings: uniqueWarnings,
      recommendations,
      calculatedDates,
      output: {
        ...groups,
        testedCount,
        interpretationAllowed,
        finalizedOutputAllowed,
        activityStatus: requiresReview ? "needs_review" : "completed",
        deviceProfile: profile,
        requirements,
      },
    };
  },
};

/** Patient-facing/report readiness language derived from documented facts.
 * Point-of-care results remain preliminary in every interpretable state. */
export function deriveUdsReportStatus(
  encounter: UdsEncounter,
  evaluation: ClinicalEvaluation<UdsEvaluationOutput>,
  locked = false,
): UdsReportStatus {
  const anyResult = UDS_PANELS.some(
    (panel) => (encounter.results[panel] ?? "nt") !== "nt",
  );
  const started = Boolean(
    encounter.patient.name.trim() ||
      encounter.patient.dob.trim() ||
      encounter.reason ||
      encounter.device.trim() ||
      encounter.lot.trim() ||
      anyResult,
  );
  const preliminaryDetail =
    "Point-of-care immunoassay result; confirm unexpected findings by definitive laboratory method.";

  if (locked) {
    return {
      state: "locked",
      label: "LOCAL RECORD LOCKED",
      marker: "LOCKED",
      tone: "neutral",
      detail: preliminaryDetail,
    };
  }
  if (!started) {
    return {
      state: "not-started",
      label: "NOT STARTED",
      marker: "PENDING",
      tone: "neutral",
      detail: "Enter specimen facts and read the physical device before review.",
    };
  }
  if (
    evaluation.output.invalid.length > 0 ||
    encounter.control === "invalid"
  ) {
    return {
      state: "invalid",
      label: "INVALID — DO NOT INTERPRET",
      marker: "INVALID",
      tone: "danger",
      detail: "Repeat or route per clinic procedure before interpretation.",
    };
  }
  if (evaluation.stops.length > 0) {
    return {
      state: "incomplete",
      label: "INCOMPLETE",
      marker: "STOP",
      tone: "attention",
      detail: "Resolve the outstanding specimen, QC, result, or review requirements.",
    };
  }
  if (
    evaluation.output.preliminaryPositive.length > 0 ||
    evaluation.warnings.length > 0 ||
    encounter.medicationAlignment !== "no unexpected"
  ) {
    return {
      state: "review-required",
      label: "PRELIMINARY — REVIEW REQUIRED",
      marker: "REVIEW",
      tone: "attention",
      detail: preliminaryDetail,
    };
  }
  return {
    state: "all-negative",
    label: "PRELIMINARY — ALL NEGATIVE",
    marker: "PRELIM",
    tone: "success",
    detail: preliminaryDetail,
  };
}

export const emptyUdsEncounter = (): UdsEncounter => ({
  patient: { name: "", dob: "" },
  collectionDateTime: "",
  reason: "",
  reasonDetail: "",
  device: "",
  omittedPanel: "",
  physicalReadingsVerified: false,
  customDeviceName: "",
  customPanels: [],
  customPanelSetVerified: false,
  lot: "",
  expiration: "",
  collector: "",
  temperature: "not documented",
  control: "not documented",
  validity: "not documented",
  medicationAlignment: "",
  results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "nt"])) as Record<
    UdsPanel,
    UdsResultState
  >,
  labPlan: "provider to decide",
  comment: "",
});
