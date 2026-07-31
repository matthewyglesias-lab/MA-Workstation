import {
  issue,
  readinessFrom,
  uniqueIssues,
  type ClinicalEngine,
  type ClinicalEvaluation,
  type ClinicalIssue,
  type PatientIdentity,
} from "./contracts";
import { isExpiredMonth, localIsoDate } from "./dates";

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

export const udsPanelName = (panel: UdsPanel): string => UDS_PANEL_INFO[panel]?.name ?? panel;
export const udsReasonLabel = (key: UdsEncounter["reason"]): string =>
  UDS_REASON_OPTIONS.find((option) => option.key === key)?.label ?? key;
export const udsTempLabel = (key: UdsTemperatureState): string =>
  UDS_TEMP_OPTIONS.find((option) => option.key === key)?.label ?? key;
export const udsControlLabel = (key: UdsControlState): string =>
  UDS_CONTROL_OPTIONS.find((option) => option.key === key)?.label ?? key;

/**
 * Faithful port of legacy-runtime.js's applyUdsDeviceProfile() default-fill
 * behavior: selecting a named cup device pre-fills all its panels as
 * negative (13-panel cups leave the omitted panel not-tested), so staff
 * only need to mark exceptions. Device profile changes always reset
 * physicalReadingsVerified — a fresh cup needs a fresh confirmation.
 */
export function applyUdsDeviceProfileDefaults(encounter: UdsEncounter): UdsEncounter {
  const profile = profileFor(encounter.device);
  const results: Partial<Record<UdsPanel, UdsResultState>> = {};
  if (profile === "14") {
    UDS_PANELS.forEach((panel) => {
      results[panel] = "neg";
    });
  } else if (profile === "13" && encounter.omittedPanel) {
    UDS_PANELS.forEach((panel) => {
      results[panel] = panel === encounter.omittedPanel ? "nt" : "neg";
    });
  } else {
    UDS_PANELS.forEach((panel) => {
      results[panel] = "nt";
    });
  }
  return { ...encounter, results, physicalReadingsVerified: false };
}

export interface UdsEncounter {
  patient: PatientIdentity;
  collectionDateTime: string;
  reason: "routine" | "medmgmt" | "preinj" | "ordered" | "other";
  device: string;
  omittedPanel?: UdsPanel | "";
  physicalReadingsVerified: boolean;
  customPanelSetVerified?: boolean;
  lot: string;
  expiration: string;
  collector: string;
  temperature: UdsTemperatureState;
  control: UdsControlState;
  validity: "acceptable" | "needs review" | "not documented";
  medicationAlignment:
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
}

const resultGroups = (encounter: UdsEncounter) => {
  const by = (state: UdsResultState): UdsPanel[] =>
    UDS_PANELS.filter((panel) => (encounter.results[panel] ?? "nt") === state);
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

const hasStarted = (encounter: UdsEncounter): boolean => {
  const anyResult = UDS_PANELS.some((panel) => (encounter.results[panel] ?? "nt") !== "nt");
  return Boolean(
    encounter.patient.name.trim() ||
      encounter.patient.dob.trim() ||
      encounter.device.trim() ||
      encounter.lot.trim() ||
      anyResult,
  );
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
    const groups = resultGroups(encounter);
    const testedCount = UDS_PANELS.length - groups.notTested.length;
    const profile = profileFor(encounter.device);
    const expirationReference =
      encounter.collectionDateTime.slice(0, 10) ||
      context.today ||
      localIsoDate();
    const expirationMonthVerified = /^\d{4}-(0[1-9]|1[0-2])$/.test(
      encounter.expiration.trim(),
    );
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
    if (profile === "other" && !encounter.customPanelSetVerified) {
      stops.push(
        issue(
          "stop",
          "device.other.profile",
          "Verify the exact panel set visible on the selected device.",
          "customPanelSetVerified",
          "device",
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
      (profile === "other" && Boolean(encounter.customPanelSetVerified));
    const interpretationAllowed =
      started &&
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
      },
    };
  },
};

export const emptyUdsEncounter = (): UdsEncounter => ({
  patient: { name: "", dob: "" },
  collectionDateTime: "",
  reason: "routine",
  device: "",
  omittedPanel: "",
  physicalReadingsVerified: false,
  customPanelSetVerified: false,
  lot: "",
  expiration: "",
  collector: "",
  temperature: "acceptable",
  control: "valid",
  validity: "acceptable",
  medicationAlignment: "no unexpected",
  results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "nt"])) as Record<
    UdsPanel,
    UdsResultState
  >,
  labPlan: "provider to decide",
  comment: "",
});
