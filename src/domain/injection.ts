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
  addCalendarDays,
  calculateSustennaDay8Window,
  differenceInCalendarDays,
  isExpiredMonth,
  localIsoDate,
} from "./dates";
import {
  INJECTION_INTERVAL_DAYS,
  INJECTION_MEDICATIONS,
  allowedDosesForInterval,
  calculateNextInjectionDate,
  effectiveInjectionCadence,
  effectiveInjectionWindow,
  injectionMuscleKey,
  normalizeInjectionSite,
  recommendAlternateSite,
  type InjectionIntervalKey,
  type InjectionMedication,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "./injection-catalog";
import {
  INJECTION_CLINICAL_REFERENCE_VERSION,
  conditionalRequirementsForEncounter,
  injectionClinicalPhaseForReason,
  medicationVerificationsForPhase,
  type ClinicalReferenceClassification,
  type InjectionClinicalPhase,
} from "./injection-clinical-reference";
import type {
  InjectionNdcSelectionMetadata,
  InjectionNextDoseProvenance,
} from "./injection-ndc";

export type InjectionReason = "scheduled" | "initiation" | "reinit" | "loading" | "prn";
export type InjectionDispositionKind = "" | "administered" | "held" | "escalated" | "provider";

export interface InjectionTraceability {
  ndc: string;
  lot: string;
  expiration: string;
}

export interface InjectionVitals {
  bp?: string;
  hr?: string;
  temperature?: string;
  rr?: string;
  spo2?: string;
}

export interface InjectionResponse {
  kind: "well" | "bleed" | "disc" | "custom" | "";
  custom?: string;
}

export interface InjectionDisposition {
  kind: InjectionDispositionKind;
  provider?: string;
  time?: string;
  outcome?: string;
}

export type InjectionInitiationProtocol =
  | ""
  | "maintena-1day"
  | "maintena-14day"
  | "maintena-provider"
  | "asimtufii-1day"
  | "asimtufii-14day"
  | "asimtufii-provider"
  | "aristada-initio-sameday"
  | "aristada-21day"
  | "aristada-provider"
  | "sustenna-day1"
  | "sustenna-day8"
  | "sustenna-provider";

export interface PairedInjectionComponent {
  /**
   * Optional for historical snapshots because the selected protocol already
   * implies the component-2 product. New typed callers may provide it so a
   * mismatched product can be rejected before finalization.
   */
  productKey?: InjectionMedicationKey;
  dose: string;
  site: string;
  ndc: string;
  lot: string;
  expiration: string;
  given: boolean;
  orderVerified: boolean;
  note?: string;
}

export interface InjectionInitiationState {
  version?: number;
  protocol: InjectionInitiationProtocol;
  planVerified: boolean;
  oralStatus: "" | "administered" | "verified";
  providerNote: string;
  sustennaOrder: "" | "standard" | "mild" | "other";
  day1Date: string;
  second: PairedInjectionComponent;
}

export interface InjectionAdministrationDetails {
  purpose?: string;
  productSource?: string;
  productSourceOther?: string;
  preparation?: string;
  preparationOther?: string;
  volume?: string;
  volumeUnit?: string;
  device?: string;
  deviceOther?: string;
  siteCondition?: string;
  siteConditionOther?: string;
  waste?: boolean;
  wasteAmount?: string;
  wasteWitness?: string;
  productIssue?: boolean;
  productIssueDetail?: string;
  productIssueAction?: string;
  productIssueRecipient?: string;
  productIssueNotificationTime?: string;
  productIssueDirection?: string;
  productIssueNextStep?: string;
  administrationException?: boolean;
  exceptionSummary?: string;
  exceptionRecipient?: string;
  exceptionTime?: string;
  exceptionOutcome?: string;
  /** Product-reference provenance; the plain traceability NDC remains canonical documentation. */
  ndcSelection?: InjectionNdcSelectionMetadata;
  /** Calculated/manual origin of the editable next-dose date. */
  nextDose?: InjectionNextDoseProvenance;
  /** Version of the deterministic, locally bundled clinical reference shown to staff. */
  clinicalReferenceVersion?: string;
}

export interface InjectionEncounter {
  patient: PatientIdentity;
  medicationKey: InjectionMedicationKey | "";
  customMedication?: string;
  dose: string;
  route: string;
  site: string;
  intervalKey: InjectionIntervalKey | "";
  reason: InjectionReason;
  priorDoseDate: string;
  priorSite?: string;
  administrationDate: string;
  nextDoseDate: string;
  orderingProvider: string;
  administeredBy: string;
  administrationTime: string;
  secondAdministrationTime?: string;
  allergies: string;
  technique?: string;
  traceability: InjectionTraceability;
  vitals?: InjectionVitals;
  response: InjectionResponse;
  attestations: Partial<
    Record<"id2" | "rights" | "allergy" | "consent" | "prior" | "screen" | "hygiene", boolean>
  >;
  verifications: Partial<Record<MedicationVerificationKey, boolean>>;
  acuteSafetyScreenConfirmed: boolean;
  activeSafetyConcerns?: string[];
  disposition: InjectionDisposition;
  initiation?: InjectionInitiationState;
  details?: InjectionAdministrationDetails;
}

export interface InjectionEngineContext {
  today?: string;
  previousSite?: string;
}

export interface InjectionTimingEvaluation {
  state: "idle" | "ok" | "warning" | "stop";
  daysSincePrior: number | null;
  earliestDay: number | null;
  latestDay: number | null;
  expectedDate?: string;
  earliestDate?: string;
  latestDate?: string;
  cadenceLabel?: string;
  message: string;
}

export type InjectionRequirementState = "required" | "optional" | "hidden";

export interface InjectionRequirement {
  state: InjectionRequirementState;
  section: string;
  /** Brief explanation for a visible marker; never a clinical conclusion. */
  reason?: string;
}

export interface InjectionGuidanceCard {
  key: string;
  section: string;
  title: string;
  message: string;
  classification: ClinicalReferenceClassification;
  action?: string;
}

export interface InjectionEvaluationOutput {
  medication: InjectionMedication | null;
  timing: InjectionTimingEvaluation;
  allowedRoutes: string[];
  allowedSites: string[];
  recommendedSite: string;
  repeatsPreviousSite: boolean;
  administrationDocumented: boolean;
  canFinalize: boolean;
  recordStatus: "draft" | "ready-to-lock" | "handoff-ready";
  initiationProtocol: InjectionInitiationProtocol;
  phase: InjectionClinicalPhase;
  requiredVerifications: MedicationVerificationKey[];
  requirements: Record<string, InjectionRequirement>;
  guidance: InjectionGuidanceCard[];
  expectedNextDoseDate: string;
  clinicalReferenceVersion?: string;
}

const pairedProtocols = new Set<InjectionInitiationProtocol>([
  "maintena-1day",
  "asimtufii-1day",
  "aristada-initio-sameday",
]);

const pairedProtocolProduct = (
  protocol: InjectionInitiationProtocol,
  primary: InjectionMedicationKey | "",
): { primaryAllowed: boolean; secondKey: InjectionMedicationKey | null } => {
  if (protocol === "maintena-1day") {
    return {
      primaryAllowed: primary === "maintena",
      secondKey: primary === "maintena" ? "maintena" : null,
    };
  }
  if (protocol === "asimtufii-1day") {
    return {
      primaryAllowed: primary === "asimtufii",
      secondKey: primary === "asimtufii" ? "maintena" : null,
    };
  }
  if (protocol === "aristada-initio-sameday") {
    const primaryAllowed = primary === "aristada" || primary === "initio";
    return {
      primaryAllowed,
      secondKey:
        primary === "aristada"
          ? "initio"
          : primary === "initio"
            ? "aristada"
            : null,
    };
  }
  return { primaryAllowed: false, secondKey: null };
};

const requiredAttestations: Array<
  [keyof InjectionEncounter["attestations"], string, string]
> = [
  ["id2", "attestation.id2", "Document two-identifier verification."],
  ["rights", "attestation.rights", "Document medication/order verification."],
  ["allergy", "attestation.allergy", "Document allergy review."],
  ["consent", "attestation.consent", "Document consent/reaffirmation."],
  ["screen", "attestation.screen", "Document the pre-injection contraindication screen."],
  ["hygiene", "attestation.hygiene", "Document aseptic technique."],
];

const REQUIRED_ATTESTATION_KEYS = new Set(
  requiredAttestations.map(([key]) => key),
);

/**
 * UI-facing catalogs matching legacy's REASONS/ATTEST/RESP/INJ_SAFETY arrays
 * (legacy-runtime.js), scoped to the fields the typed InjectionEncounter
 * actually captures. Legacy's three optional ATTEST chips ("twoperson",
 * "observe", "education") aren't part of the typed attestations union and
 * are intentionally not ported here.
 */
export const INJECTION_REASON_OPTIONS: ReadonlyArray<{
  key: InjectionReason;
  label: string;
}> = [
  { key: "scheduled", label: "Scheduled" },
  { key: "initiation", label: "Initiation" },
  { key: "reinit", label: "Re-initiation" },
  { key: "loading", label: "Loading dose" },
  { key: "prn", label: "PRN / ordered" },
];

export const INJECTION_ATTESTATION_OPTIONS: ReadonlyArray<{
  key: keyof InjectionEncounter["attestations"];
  label: string;
  description: string;
}> = [
  {
    key: "id2",
    label: "Two-identifier ID",
    description: "Pt identity verified using two identifiers (full name & DOB).",
  },
  {
    key: "rights",
    label: "Medication ‘rights’",
    description:
      "Med verified against active order — right pt, right drug, right dose, right route, right time, right documentation.",
  },
  {
    key: "allergy",
    label: "Allergies reviewed",
    description: "Verified allergy status is documented in the Safety section.",
  },
  {
    key: "consent",
    label: "Consent reaffirmed",
    description: "Consent for injection obtained and reaffirmed prior to administration.",
  },
  {
    key: "prior",
    label: "Prior dose tolerated",
    description: "Prior dose tolerated well per pt report; no new or unresolved s/e.",
  },
  {
    key: "screen",
    label: "No contraindications",
    description:
      "No acute s/e or contraindications to administration noted on pre-injection screening.",
  },
  {
    key: "hygiene",
    label: "Aseptic technique",
    description:
      "Hand hygiene performed and gloves donned; injection site cleansed w/ alcohol and allowed to dry.",
  },
];

export const INJECTION_RESPONSE_OPTIONS: ReadonlyArray<{
  key: Exclude<InjectionResponse["kind"], "">;
  label: string;
  description: string;
}> = [
  {
    key: "well",
    label: "Tolerated well",
    description: "no immediate complication, no bleeding or swelling at site",
  },
  {
    key: "bleed",
    label: "Minor bleeding, controlled",
    description: "minor bleeding controlled with pressure, no swelling",
  },
  { key: "disc", label: "Mild site discomfort", description: "mild transient site discomfort, no acute reaction" },
  { key: "custom", label: "Custom…", description: "" },
];

export const INJECTION_SAFETY_TRIGGERS: ReadonlyArray<{
  key: string;
  label: string;
  level: "warn" | "danger";
  description: string;
  medications?: InjectionMedicationKey[];
}> = [
  {
    key: "dizzy",
    label: "Dizzy / faint / fall concern",
    level: "warn",
    description:
      "Patient reports dizziness, lightheadedness, syncope, or acute fall-risk concern; provider review requested before administration.",
  },
  {
    key: "cardiac",
    label: "Chest pain / SOB / palpitations",
    level: "danger",
    description:
      "Patient reports chest pain, shortness of breath, palpitations, or acute cardiac symptoms; provider review requested before administration.",
  },
  {
    key: "nms",
    label: "Fever + rigidity/confusion",
    level: "danger",
    description:
      "Patient reports fever with muscle rigidity, confusion, diaphoresis, or autonomic instability; provider review requested for possible serious antipsychotic reaction.",
  },
  {
    key: "eps",
    label: "Severe EPS / akathisia",
    level: "warn",
    description:
      "Patient reports severe restlessness, stiffness, abnormal movements, tremor, or extrapyramidal symptoms; provider review requested.",
  },
  {
    key: "site",
    label: "Severe injection-site reaction",
    level: "warn",
    description:
      "Patient reports severe or worsening injection-site pain, swelling, warmth, drainage, skin changes, or a rapidly enlarging lump; provider review requested.",
  },
  {
    key: "opioid",
    label: "Recent opioid / withdrawal concern",
    level: "danger",
    medications: ["vivitrol"],
    description:
      "Recent opioid use, possible opioid exposure, or withdrawal symptoms reported; provider review requested before Vivitrol administration.",
  },
  {
    key: "liver",
    label: "Possible liver symptoms",
    level: "warn",
    medications: ["vivitrol"],
    description:
      "Patient reports possible liver-related symptoms such as right upper-quadrant pain, dark urine, jaundice, or unusual fatigue; provider review requested before Vivitrol administration.",
  },
];

export const injectionReasonLabel = (key: InjectionReason): string =>
  INJECTION_REASON_OPTIONS.find((option) => option.key === key)?.label ?? key;

export const injectionAttestationRequired = (
  key: keyof InjectionEncounter["attestations"],
): boolean => REQUIRED_ATTESTATION_KEYS.has(key);

/**
 * Faithful port of legacy-runtime.js's protocolOptions()/config() — the
 * per-medication paired-injection/oral-overlap/Sustenna Day-1/Day-8
 * initiation pathways. aristada and initio share the same options set
 * (legacy: key==='aristada'||key==='initio').
 */
export interface InjectionInitiationOption {
  id: InjectionInitiationProtocol;
  title: string;
  sub: string;
}

const ARISTADA_INITIO_OPTIONS: readonly InjectionInitiationOption[] = [
  {
    id: "aristada-initio-sameday",
    title: "INITIO + first ARISTADA today",
    sub: "Two same-encounter IM components plus one oral aripiprazole dose.",
  },
  {
    id: "aristada-21day",
    title: "21-day oral plan",
    sub: "First ARISTADA injection with the ordered 21-day oral continuation.",
  },
  {
    id: "aristada-provider",
    title: "Staged / re-initiation plan",
    sub: "Use if components are on different dates or the provider has a specific restart plan.",
  },
];

export const INJECTION_INITIATION_OPTIONS_BY_MEDICATION: Partial<
  Record<InjectionMedicationKey, readonly InjectionInitiationOption[]>
> = {
  maintena: [
    {
      id: "maintena-1day",
      title: "1-day initiation",
      sub: "Two separate IM injections today plus a single oral aripiprazole dose.",
    },
    {
      id: "maintena-14day",
      title: "14-day oral plan",
      sub: "One injection today with the ordered 14-day oral continuation.",
    },
    {
      id: "maintena-provider",
      title: "Restart / provider plan",
      sub: "Use for a provider-directed or nonstandard initiation/restart plan.",
    },
  ],
  asimtufii: [
    {
      id: "asimtufii-1day",
      title: "1-day initiation",
      sub: "Asimtufii plus separate Maintena IM component and one oral dose.",
    },
    {
      id: "asimtufii-14day",
      title: "14-day oral plan",
      sub: "One Asimtufii injection with the ordered 14-day oral continuation.",
    },
    {
      id: "asimtufii-provider",
      title: "Restart / transition plan",
      sub: "Use for provider-directed restart, transition, or adjusted initiation.",
    },
  ],
  aristada: ARISTADA_INITIO_OPTIONS,
  initio: ARISTADA_INITIO_OPTIONS,
  sustenna: [
    {
      id: "sustenna-day1",
      title: "Day 1 initiation",
      sub: "Sets a staff-facing Day 8 scheduling target from today's recorded date.",
    },
    {
      id: "sustenna-day8",
      title: "Day 8 initiation",
      sub: "Calculates the Day 8 target and the permitted ±4-day timing window.",
    },
    {
      id: "sustenna-provider",
      title: "Re-initiation / provider plan",
      sub: "For missed-dose or nonstandard pathways; no regimen is calculated.",
    },
  ],
};

export const injectionInitiationOptions = (
  medicationKey: InjectionMedicationKey | "",
): readonly InjectionInitiationOption[] =>
  (medicationKey && INJECTION_INITIATION_OPTIONS_BY_MEDICATION[medicationKey]) || [];

export type InjectionInitiationConfigKind = "dual" | "oral" | "provider" | "sustenna-day1" | "sustenna-day8";

export interface InjectionInitiationConfig {
  kind: InjectionInitiationConfigKind;
  title: string;
  summary: string;
  oralLabel: string;
  primaryLabel?: string;
  secondaryProduct?: string;
  secondaryGuide?: string;
}

const ALL_IM_SITES = ["R deltoid", "L deltoid", "R ventrogluteal", "L ventrogluteal", "R dorsogluteal", "L dorsogluteal"];

/** Faithful port of legacy-runtime.js's config() from the RC5.39 initiation-protocol module. */
export function injectionInitiationConfig(
  protocol: InjectionInitiationProtocol,
  medicationKey: InjectionMedicationKey | "",
): InjectionInitiationConfig | null {
  if (protocol === "maintena-1day") {
    return {
      kind: "dual",
      title: "Abilify Maintena 1-day initiation",
      summary:
        "Label reference: two separate ABILIFY MAINTENA IM injections on Day 1 plus one oral aripiprazole 20 mg dose. Do not use the same muscle for both injections.",
      primaryLabel: "Injection 1 — Abilify Maintena (main medication fields)",
      secondaryProduct: "Injection 2 — Abilify Maintena",
      secondaryGuide:
        "Use the matching ordered pair: 400 mg + 400 mg, or the adjusted 300 mg + 300 mg pathway.",
      oralLabel: "Single oral aripiprazole 20 mg dose",
    };
  }
  if (protocol === "asimtufii-1day") {
    return {
      kind: "dual",
      title: "Abilify Asimtufii 1-day initiation",
      summary:
        "Label reference: one gluteal ASIMTUFII injection, a separate Maintena injection, and one oral aripiprazole 20 mg dose. Do not use the same muscle.",
      primaryLabel: "Injection 1 — Abilify Asimtufii (main medication fields)",
      secondaryProduct: "Injection 2 — Abilify Maintena",
      secondaryGuide: "Use the ordered pair: 960 mg + Maintena 400 mg, or adjusted 720 mg + Maintena 300 mg.",
      oralLabel: "Single oral aripiprazole 20 mg dose",
    };
  }
  if (protocol === "aristada-initio-sameday") {
    const initioFirst = medicationKey === "initio";
    return {
      kind: "dual",
      title: "Aristada INITIO + first ARISTADA, same encounter",
      summary:
        "Label reference: ARISTADA INITIO 675 mg, one oral aripiprazole 30 mg dose, and the first ARISTADA injection. When concomitant, do not use the same deltoid or gluteal muscle.",
      primaryLabel: initioFirst
        ? "Injection 1 — ARISTADA INITIO (main medication fields)"
        : "Injection 1 — first ARISTADA (main medication fields)",
      secondaryProduct: initioFirst
        ? "Injection 2 — first ARISTADA maintenance dose"
        : "Injection 2 — ARISTADA INITIO",
      secondaryGuide: initioFirst
        ? "Enter the exact ordered ARISTADA maintenance dose."
        : "Label reference is INITIO 675 mg; enter the actual product/dose used.",
      oralLabel: "Single oral aripiprazole 30 mg dose",
    };
  }
  if (protocol === "maintena-14day") {
    return {
      kind: "oral",
      title: "Abilify Maintena 14-day oral initiation",
      summary:
        "One Abilify Maintena injection with the ordered 14 consecutive days of oral aripiprazole or the current oral antipsychotic.",
      oralLabel: "14-day oral continuation documented",
    };
  }
  if (protocol === "asimtufii-14day") {
    return {
      kind: "oral",
      title: "Abilify Asimtufii 14-day oral initiation",
      summary:
        "One gluteal Asimtufii injection with the ordered 14 consecutive days of oral aripiprazole or current oral antipsychotic.",
      oralLabel: "14-day oral continuation documented",
    };
  }
  if (protocol === "aristada-21day") {
    return {
      kind: "oral",
      title: "Aristada 21-day oral initiation",
      summary: "First ARISTADA injection with the ordered 21 consecutive days of oral aripiprazole.",
      oralLabel: "21-day oral continuation documented",
    };
  }
  if (
    protocol === "maintena-provider" ||
    protocol === "asimtufii-provider" ||
    protocol === "aristada-provider" ||
    protocol === "sustenna-provider"
  ) {
    return {
      kind: "provider",
      title:
        injectionInitiationOptions(medicationKey).find((option) => option.id === protocol)?.title ??
        "Provider-directed plan",
      summary:
        "This is a non-calculating path. Record the active provider direction and verify it against the current PI and clinic policy.",
      oralLabel: "",
    };
  }
  if (protocol === "sustenna-day1") {
    return {
      kind: "sustenna-day1",
      title: "Invega Sustenna Day 1 initiation",
      summary:
        "Day 1 uses the documented administration date to set a staff-facing Day 8 target. Both initiation injections are deltoid per the current label.",
      oralLabel: "",
    };
  }
  if (protocol === "sustenna-day8") {
    return {
      kind: "sustenna-day8",
      title: "Invega Sustenna Day 8 initiation",
      summary:
        "Uses the recorded Day 1 date to calculate the Day 8 target and ±4-day timing window. It does not calculate doses, renal assessment, or missed-dose re-initiation.",
      oralLabel: "",
    };
  }
  return null;
}

export const injectionInitiationSecondarySites = (): readonly string[] => ALL_IM_SITES;

export const verificationLabels: Record<MedicationVerificationKey, string> = {
  opioidFree: "Current opioid-risk / provider plan verified",
  naltrexHS: "Naltrexone/hepatic review verified",
  suppliedNeedle: "Supplied needle / body-habitus check",
  resuspend: "Suspension inspected and mixed",
  invegaInit: "Initiation / re-initiation plan verified",
  oralOverlap: "Ordered oral initiation plan documented",
  stabilized: "Stabilized on prerequisite LAI",
  paliperidoneTolerability: "Paliperidone/risperidone tolerability reviewed",
  aripiprazoleTolerability: "Aripiprazole tolerability / transition reviewed",
  glutealOnly: "Gluteal-only administration",
  noMassage: "No massage after injection",
  deepZtrack: "Ordered route / technique verified",
};

const parseBp = (value = ""): { systolic: number; diastolic: number } | null => {
  const match = value.trim().match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return match ? { systolic: Number(match[1]), diastolic: Number(match[2]) } : null;
};

const parseNumber = (value = ""): number | null => {
  const match = value.trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const parseTemperatureF = (value = ""): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return /c/i.test(value) || parsed < 45 ? (parsed * 9) / 5 + 32 : parsed;
};

const medicationFamily = (
  key: InjectionMedicationKey,
): "vivitrol" | "typical" | "antipsychotic" => {
  if (key === "vivitrol") return "vivitrol";
  if (key === "haldol" || key === "prolixin") return "typical";
  return "antipsychotic";
};

const evaluateVitals = (
  encounter: InjectionEncounter,
): { stops: ClinicalIssue[]; warnings: ClinicalIssue[] } => {
  const stops: ClinicalIssue[] = [];
  const warnings: ClinicalIssue[] = [];
  const vitals = encounter.vitals ?? {};
  const bpText = vitals.bp?.trim() ?? "";
  const bp = parseBp(bpText);
  if (bp) {
    if (bp.systolic >= 180 || bp.diastolic >= 120) {
      stops.push(
        issue(
          "stop",
          "vitals.bp.urgent",
          `BP ${bp.systolic}/${bp.diastolic} — urgent provider review.`,
          "vitals.bp",
          "safety",
        ),
      );
    } else if (bp.systolic >= 160 || bp.diastolic >= 100) {
      warnings.push(
        issue(
          "warning",
          "vitals.bp.elevated",
          `BP ${bp.systolic}/${bp.diastolic} elevated — review before giving.`,
          "vitals.bp",
          "safety",
        ),
      );
    } else if (bp.systolic < 90 || bp.diastolic < 50) {
      stops.push(
        issue(
          "stop",
          "vitals.bp.low",
          `BP ${bp.systolic}/${bp.diastolic} low — provider review.`,
          "vitals.bp",
          "safety",
        ),
      );
    }
  } else if (bpText) {
    warnings.push(
      issue(
        "warning",
        "vitals.bp.format",
        "BP format not recognized.",
        "vitals.bp",
        "safety",
      ),
    );
  }

  const hrText = vitals.hr?.trim() ?? "";
  const hr = parseNumber(hrText);
  if (hr !== null) {
    if (hr >= 120 || hr <= 50) {
      stops.push(
        issue(
          "stop",
          "vitals.hr.review",
          `HR ${hr} — provider review.`,
          "vitals.hr",
          "safety",
        ),
      );
    } else if (hr >= 100) {
      warnings.push(
        issue(
          "warning",
          "vitals.hr.elevated",
          `HR ${hr} elevated — review if symptomatic.`,
          "vitals.hr",
          "safety",
        ),
      );
    }
  } else if (hrText) {
    warnings.push(
      issue(
        "warning",
        "vitals.hr.format",
        "HR format not recognized.",
        "vitals.hr",
        "safety",
      ),
    );
  }

  const temperatureText = vitals.temperature?.trim() ?? "";
  const temperature = parseTemperatureF(temperatureText);
  if (temperature !== null && temperature >= 100.4) {
    const feverIssue = issue(
      medicationFamily(encounter.medicationKey || "other") === "vivitrol" ? "warning" : "stop",
      "vitals.temperature.fever",
      `Temp ${temperature.toFixed(1)}°F — fever screen/provider review.`,
      "vitals.temperature",
      "safety",
    );
    (feverIssue.severity === "stop" ? stops : warnings).push(feverIssue);
  } else if (temperatureText && temperature === null) {
    warnings.push(
      issue(
        "warning",
        "vitals.temperature.format",
        "Temperature format not recognized.",
        "vitals.temperature",
        "safety",
      ),
    );
  }
  return { stops, warnings };
};

const evaluateTiming = (
  encounter: InjectionEncounter,
  medication: InjectionMedication,
): InjectionTimingEvaluation => {
  if (encounter.intervalKey === "once" || medication.intervalKey === "once") {
    return {
      state: "ok",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      message: "One-time initiation/loading dose — routine interval spacing does not apply.",
    };
  }
  if (!encounter.intervalKey || !INJECTION_INTERVAL_DAYS[encounter.intervalKey]) {
    return {
      state: "idle",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      message: "Set a dosing interval to evaluate timing.",
    };
  }
  if (!encounter.priorDoseDate) {
    return {
      state: "idle",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      message:
        medication.timingMode === "orderVerify"
          ? "Enter the prior injection date and verify timing against the active order and current product information."
          : "Enter the prior injection date to evaluate the dosing window.",
    };
  }
  const daysSincePrior = differenceInCalendarDays(
    encounter.priorDoseDate,
    encounter.administrationDate,
  );
  if (daysSincePrior === null) {
    return {
      state: "warning",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      message: "Verify the prior-dose and administration dates.",
    };
  }
  if (daysSincePrior < 0) {
    return {
      state: "stop",
      daysSincePrior,
      earliestDay: null,
      latestDay: null,
      message: "The administration date is before the prior-dose date — verify the dates.",
    };
  }
  if (medication.timingMode === "orderVerify") {
    return {
      state: "warning",
      daysSincePrior,
      earliestDay: null,
      latestDay: null,
      message: `${daysSincePrior} day(s) since the prior dose. Verify timing and any re-initiation decision against the active provider order and current product information.`,
    };
  }
  const intervalDays = INJECTION_INTERVAL_DAYS[encounter.intervalKey];
  const window = effectiveInjectionWindow(medication, encounter.intervalKey);
  const earliestDay = intervalDays - window.windowBefore;
  const latestDay = intervalDays + window.windowAfter;
  if (daysSincePrior < earliestDay) {
    return {
      state: "warning",
      daysSincePrior,
      earliestDay,
      latestDay,
      message: `Given ${daysSincePrior} day(s) after the prior dose — earlier than the displayed window (about ${earliestDay}–${latestDay} days). Confirm provider direction.`,
    };
  }
  if (daysSincePrior <= latestDay) {
    return {
      state: "ok",
      daysSincePrior,
      earliestDay,
      latestDay,
      message: `Given ${daysSincePrior} day(s) after the prior dose — within the displayed window (about ${earliestDay}–${latestDay} days).`,
    };
  }
  const farLate = daysSincePrior > Math.round(intervalDays * 1.5);
  return {
    state: "stop",
    daysSincePrior,
    earliestDay,
    latestDay,
    message: `Given ${daysSincePrior} day(s) after the prior dose — beyond the displayed window (about ${earliestDay}–${latestDay} days).${
      farLate ? " A gap this long may require re-initiation/loading." : ""
    } Confirm timing and dosing with the provider.`,
  };
};

/**
 * Product-aware timing.  Order-verification products receive an expected date
 * as an operational aid but deliberately never get an automatic within-window
 * clearance.  Calendar-month products calculate from calendar dates instead
 * of 84/182-day approximations.
 */
const evaluateTimingWithCadence = (
  encounter: InjectionEncounter,
  medication: InjectionMedication,
): InjectionTimingEvaluation => {
  if (encounter.intervalKey === "once" || medication.intervalKey === "once") {
    return {
      state: "ok",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      expectedDate: "",
      earliestDate: "",
      latestDate: "",
      cadenceLabel: "one-time",
      message: "One-time initiation/loading dose; routine interval spacing does not apply.",
    };
  }
  if (!encounter.intervalKey) {
    return {
      state: "idle",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      expectedDate: "",
      earliestDate: "",
      latestDate: "",
      cadenceLabel: "",
      message: "Set a dosing interval to evaluate timing.",
    };
  }

  const cadence = effectiveInjectionCadence(medication, encounter.intervalKey);
  if (!encounter.priorDoseDate) {
    return {
      state: "idle",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      expectedDate: "",
      earliestDate: "",
      latestDate: "",
      cadenceLabel: cadence.label,
      message:
        medication.timingMode === "orderVerify"
          ? "Enter the prior injection date and verify timing against the active order and current product information."
          : "Enter the prior injection date to evaluate the dosing window.",
    };
  }

  const daysSincePrior = differenceInCalendarDays(
    encounter.priorDoseDate,
    encounter.administrationDate,
  );
  const expectedDate = calculateNextInjectionDate(
    medication,
    encounter.intervalKey,
    encounter.priorDoseDate,
  );
  if (daysSincePrior === null || !expectedDate) {
    return {
      state: "warning",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      expectedDate,
      earliestDate: "",
      latestDate: "",
      cadenceLabel: cadence.label,
      message: "Verify the prior-dose and administration dates.",
    };
  }
  if (daysSincePrior < 0) {
    return {
      state: "stop",
      daysSincePrior,
      earliestDay: null,
      latestDay: null,
      expectedDate,
      earliestDate: "",
      latestDate: "",
      cadenceLabel: cadence.label,
      message: "The administration date is before the prior-dose date; verify the dates.",
    };
  }
  if (medication.timingMode === "orderVerify") {
    return {
      state: "warning",
      daysSincePrior,
      earliestDay: null,
      latestDay: null,
      expectedDate,
      earliestDate: "",
      latestDate: "",
      cadenceLabel: cadence.label,
      message: `${daysSincePrior} day(s) since the prior dose. Expected ${cadence.label} date: ${expectedDate}. Verify timing and any re-initiation decision against the active provider order and current product information.`,
    };
  }

  const window = effectiveInjectionWindow(medication, encounter.intervalKey);
  const earliestDate = addCalendarDays(expectedDate, -window.windowBefore);
  const latestDate = addCalendarDays(expectedDate, window.windowAfter);
  const earliestDay = differenceInCalendarDays(encounter.priorDoseDate, earliestDate);
  const latestDay = differenceInCalendarDays(encounter.priorDoseDate, latestDate);
  if (earliestDay === null || latestDay === null) {
    return {
      state: "warning",
      daysSincePrior,
      earliestDay: null,
      latestDay: null,
      expectedDate,
      earliestDate,
      latestDate,
      cadenceLabel: cadence.label,
      message: "Verify the prior-dose date before using displayed timing guidance.",
    };
  }
  if (encounter.administrationDate < earliestDate) {
    return {
      state: "warning",
      daysSincePrior,
      earliestDay,
      latestDay,
      expectedDate,
      earliestDate,
      latestDate,
      cadenceLabel: cadence.label,
      message: `Given ${daysSincePrior} day(s) after the prior dose; earlier than the displayed window (${earliestDate} to ${latestDate}; expected ${expectedDate}). Confirm provider direction.`,
    };
  }
  if (encounter.administrationDate <= latestDate) {
    return {
      state: "ok",
      daysSincePrior,
      earliestDay,
      latestDay,
      expectedDate,
      earliestDate,
      latestDate,
      cadenceLabel: cadence.label,
      message: `Given ${daysSincePrior} day(s) after the prior dose; within the displayed window (${earliestDate} to ${latestDate}; expected ${expectedDate}).`,
    };
  }
  const daysPastExpected = differenceInCalendarDays(expectedDate, encounter.administrationDate) ?? 0;
  const farLate = daysPastExpected > Math.max(window.windowAfter * 2, 28);
  return {
    state: "stop",
    daysSincePrior,
    earliestDay,
    latestDay,
    expectedDate,
    earliestDate,
    latestDate,
    cadenceLabel: cadence.label,
    message: `Given ${daysSincePrior} day(s) after the prior dose; beyond the displayed window (${earliestDate} to ${latestDate}; expected ${expectedDate}).${
      farLate ? " A gap this long may require re-initiation/loading." : ""
    } Confirm timing and dosing with the provider.`,
  };
};

const initiationOralSatisfied = (encounter: InjectionEncounter): boolean =>
  Boolean(encounter.initiation?.oralStatus || encounter.verifications.oralOverlap);

const verificationSatisfied = (
  encounter: InjectionEncounter,
  key: MedicationVerificationKey,
): boolean => {
  if (key === "oralOverlap") return initiationOralSatisfied(encounter);
  if (key === "invegaInit") {
    return Boolean(encounter.verifications.invegaInit || encounter.initiation?.planVerified);
  }
  return Boolean(encounter.verifications[key]);
};

const evaluateInitiation = (
  encounter: InjectionEncounter,
  stops: ClinicalIssue[],
  calculatedDates: Record<string, string>,
  referenceDate: string,
): void => {
  const initiation = encounter.initiation;
  if (!initiation?.protocol) return;
  if (!initiation.planVerified) {
    stops.push(
      issue(
        "stop",
        "initiation.plan",
        "Confirm the active provider initiation/re-initiation order and current product information.",
        "initiation.planVerified",
        "initiation",
      ),
    );
  }

  if (pairedProtocols.has(initiation.protocol)) {
    const second = initiation.second;
    const protocolProduct = pairedProtocolProduct(
      initiation.protocol,
      encounter.medicationKey,
    );
    if (!protocolProduct.primaryAllowed) {
      stops.push(
        issue(
          "stop",
          "initiation.protocol.medication",
          "The selected paired-injection protocol does not match the primary medication.",
          "medicationKey",
          "initiation",
        ),
      );
    }
    if (!initiation.oralStatus) {
      stops.push(
        issue(
          "stop",
          "initiation.oral",
          "Document the required oral aripiprazole dose as administered today or verified in the active record.",
          "initiation.oralStatus",
          "initiation",
        ),
      );
    }
    if (!second.given) {
      stops.push(
        issue(
          "stop",
          "initiation.second.given",
          "Confirm injection component 2 was administered today, or use the staged/provider-directed pathway.",
          "initiation.second.given",
          "initiation",
        ),
      );
    }
    if (!second.orderVerified) {
      stops.push(
        issue(
          "stop",
          "initiation.second.order",
          "Confirm component 2 product and exact dose against the active order.",
          "initiation.second.orderVerified",
          "initiation",
        ),
      );
    }
    const requiredSecond: Array<[keyof PairedInjectionComponent, string, string]> = [
      ["dose", "initiation.second.dose", "Document the exact dose for injection component 2."],
      ["site", "initiation.second.site", "Select the actual site for injection component 2."],
      ["ndc", "initiation.second.ndc", "Document the NDC for injection component 2."],
      ["lot", "initiation.second.lot", "Document the lot for injection component 2."],
      [
        "expiration",
        "initiation.second.expiration",
        "Document the expiration for injection component 2.",
      ],
    ];
    requiredSecond.forEach(([field, code, message]) => {
      if (!String(second[field] ?? "").trim()) {
        stops.push(issue("stop", code, message, `initiation.second.${String(field)}`, "initiation"));
      }
    });

    const secondMedication = protocolProduct.secondKey
      ? INJECTION_MEDICATIONS[protocolProduct.secondKey]
      : null;
    if (
      secondMedication &&
      second.productKey &&
      second.productKey !== secondMedication.key
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.second.product",
          `Injection component 2 must use the ${secondMedication.label} product defined by the selected protocol.`,
          "initiation.second.productKey",
          "initiation",
        ),
      );
    }
    const secondDose = second.dose.trim();
    const secondDoseRecognized = Boolean(
      secondMedication &&
        secondDose &&
        secondMedication.doses.includes(secondDose),
    );
    if (secondMedication && secondDose && !secondDoseRecognized) {
      stops.push(
        issue(
          "stop",
          "initiation.second.dose-guidance",
          `Injection component 2 dose is outside the cataloged ${secondMedication.label} dose options; verify the active order and selected protocol.`,
          "initiation.second.dose",
          "initiation",
        ),
      );
    }
    const primaryDose = encounter.dose.trim();
    if (
      initiation.protocol === "maintena-1day" &&
      primaryDose &&
      secondDose &&
      primaryDose !== secondDose
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.paired-dose-regimen",
          "The Abilify Maintena 1-day pathway requires matching paired doses: 400 mg + 400 mg, or the ordered adjusted 300 mg + 300 mg pathway. Verify the active order and current product information.",
          "initiation.second.dose",
          "initiation",
        ),
      );
    }
    if (
      initiation.protocol === "asimtufii-1day" &&
      primaryDose &&
      secondDose &&
      !(
        (primaryDose === "960 mg" && secondDose === "400 mg") ||
        (primaryDose === "720 mg" && secondDose === "300 mg")
      )
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.paired-dose-regimen",
          "The Abilify Asimtufii 1-day pathway requires Asimtufii 960 mg + Abilify Maintena 400 mg, or the ordered adjusted 720 mg + 300 mg pathway. Verify the active order and current product information.",
          "initiation.second.dose",
          "initiation",
        ),
      );
    }
    const secondarySite = normalizeInjectionSite(second.site);
    if (
      secondMedication &&
      secondDoseRecognized &&
      secondarySite &&
      !secondMedication.administrationRule(secondDose).sites.includes(secondarySite)
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.second.site-guidance",
          `Injection component 2 site is outside the cataloged ${secondMedication.label} guidance for the documented dose.`,
          "initiation.second.site",
          "initiation",
        ),
      );
    }
    if (
      second.expiration.trim() &&
      isExpiredMonth(second.expiration, referenceDate)
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.second.expired",
          "Injection component 2 expiration appears past; obtain in-date product before documenting administration.",
          "initiation.second.expiration",
          "initiation",
        ),
      );
    }

    const primaryMuscle = injectionMuscleKey(encounter.site);
    const secondaryMuscle = injectionMuscleKey(secondarySite);
    if (primaryMuscle && primaryMuscle === secondaryMuscle) {
      stops.push(
        issue(
          "stop",
          "initiation.second.same-muscle",
          "Paired injection components are assigned to the same muscle. Select a separate muscle/site for component 2.",
          "initiation.second.site",
          "initiation",
        ),
      );
    }
  } else if (
    ["maintena-14day", "asimtufii-14day", "aristada-21day"].includes(initiation.protocol) &&
    !initiation.oralStatus
  ) {
    stops.push(
      issue(
        "stop",
        "initiation.oral",
        "Document the ordered oral continuation as administered or verified in the active record.",
        "initiation.oralStatus",
        "initiation",
      ),
    );
  }

  if (
    ["maintena-provider", "asimtufii-provider", "aristada-provider", "sustenna-provider"].includes(
      initiation.protocol,
    ) &&
    !initiation.providerNote.trim()
  ) {
    stops.push(
      issue(
        "stop",
        "initiation.provider-plan",
        "Document the provider-directed initiation/re-initiation instruction or timing plan.",
        "initiation.providerNote",
        "initiation",
      ),
    );
  }

  if (initiation.protocol === "sustenna-day1" || initiation.protocol === "sustenna-day8") {
    if (!initiation.sustennaOrder) {
      stops.push(
        issue(
          "stop",
          "initiation.sustenna.order",
          "Select the ordered Invega Sustenna initiation category.",
          "initiation.sustennaOrder",
          "initiation",
        ),
      );
    }
    if (!/deltoid/i.test(encounter.site)) {
      stops.push(
        issue(
          "stop",
          "initiation.sustenna.site",
          "Invega Sustenna Day 1 and Day 8 initiation require a documented deltoid site.",
          "site",
          "initiation",
        ),
      );
    }
  }

  if (initiation.protocol === "sustenna-day1" && encounter.administrationDate) {
    calculatedDates.sustennaDay8Target = addCalendarDays(encounter.administrationDate, 7);
  }

  if (initiation.protocol === "sustenna-day8") {
    if (!initiation.day1Date) {
      stops.push(
        issue(
          "stop",
          "initiation.sustenna.day1",
          "Enter the documented Invega Sustenna Day 1 date.",
          "initiation.day1Date",
          "initiation",
        ),
      );
      return;
    }
    const window = calculateSustennaDay8Window(initiation.day1Date);
    if (!window) {
      stops.push(
        issue(
          "stop",
          "initiation.sustenna.day1-invalid",
          "Verify the documented Invega Sustenna Day 1 date.",
          "initiation.day1Date",
          "initiation",
        ),
      );
      return;
    }
    calculatedDates.sustennaDay8Target = window.target;
    calculatedDates.sustennaDay8Early = window.early;
    calculatedDates.sustennaDay8Late = window.late;
    calculatedDates.sustennaMonthlyTarget = window.monthly;
    if (
      encounter.administrationDate &&
      (encounter.administrationDate < window.early || encounter.administrationDate > window.late)
    ) {
      stops.push(
        issue(
          "stop",
          "initiation.sustenna.outside-window",
          "This Day 8 administration date is outside the calculated ±4-day window. Use the current missed-dose/re-initiation plan and provider/pharmacist direction.",
          "administrationDate",
          "initiation",
        ),
      );
    }
  }
};

const evaluateDetails = (
  encounter: InjectionEncounter,
  requireAdministrationDetails: boolean,
  stops: ClinicalIssue[],
): void => {
  const details = encounter.details ?? {};
  if (requireAdministrationDetails && !encounter.administrationTime.trim()) {
    stops.push(
      issue(
        "stop",
        "administration.time",
        "Document the actual administration time.",
        "administrationTime",
        "administration",
      ),
    );
  }
  if (
    requireAdministrationDetails &&
    pairedProtocols.has(encounter.initiation?.protocol ?? "") &&
    !encounter.secondAdministrationTime?.trim()
  ) {
    stops.push(
      issue(
        "stop",
        "administration.second-time",
        "Document the actual administration time for paired injection component 2.",
        "secondAdministrationTime",
        "administration",
      ),
    );
  }
  const partialPairs: Array<[string | undefined, string | undefined, string, string]> = [
    [
      details.volume,
      details.volumeUnit,
      "administration.volume",
      "Document both the administration amount and unit, or clear the partial value.",
    ],
  ];
  partialPairs.forEach(([first, second, code, message]) => {
    if (Boolean(first?.trim()) !== Boolean(second?.trim())) {
      stops.push(issue("stop", code, message, "details.volume", "administration"));
    }
  });
  if (details.device === "Other" && !details.deviceOther?.trim()) {
    stops.push(
      issue(
        "stop",
        "administration.device-other",
        "Describe the other delivery device selected.",
        "details.deviceOther",
        "administration",
      ),
    );
  }
  if (details.siteCondition === "Other" && !details.siteConditionOther?.trim()) {
    stops.push(
      issue(
        "stop",
        "administration.site-condition-other",
        "Describe the documented site condition.",
        "details.siteConditionOther",
        "administration",
      ),
    );
  }
  if (details.productSource === "Other" && !details.productSourceOther?.trim()) {
    stops.push(
      issue(
        "stop",
        "trace.source-other",
        "Document the other medication source.",
        "details.productSourceOther",
        "traceability",
      ),
    );
  }
  if (details.preparation === "Other" && !details.preparationOther?.trim()) {
    stops.push(
      issue(
        "stop",
        "trace.preparation-other",
        "Document the preparation or reconstitution detail.",
        "details.preparationOther",
        "traceability",
      ),
    );
  }
  if (details.waste) {
    if (!details.wasteAmount?.trim()) {
      stops.push(
        issue(
          "stop",
          "trace.waste-amount",
          "Document the medication waste amount and unit.",
          "details.wasteAmount",
          "traceability",
        ),
      );
    }
    if (!details.wasteWitness?.trim()) {
      stops.push(
        issue(
          "stop",
          "trace.waste-witness",
          "Document the waste witness.",
          "details.wasteWitness",
          "traceability",
        ),
      );
    }
  }
  if (details.productIssue) {
    if (!details.productIssueDetail?.trim()) {
      stops.push(
        issue(
          "stop",
          "trace.product-issue",
          "Describe the product or device issue.",
          "details.productIssueDetail",
          "traceability",
        ),
      );
    }
    if (!details.productIssueAction?.trim()) {
      stops.push(
        issue(
          "stop",
          "trace.product-issue-action",
          "Document the action or disposition for the product/device issue.",
          "details.productIssueAction",
          "traceability",
        ),
      );
    }
    const structuredFollowUp: Array<
      [keyof InjectionAdministrationDetails, string, string]
    > = [
        [
          "productIssueRecipient",
          "trace.product-issue-recipient",
          "Document who was notified about the product/device issue, or why notification was not needed.",
        ],
        [
          "productIssueNotificationTime",
          "trace.product-issue-time",
          "Document the product/device issue notification or decision time.",
        ],
        [
          "productIssueDirection",
          "trace.product-issue-direction",
          "Document the direction received for the product/device issue.",
        ],
        [
          "productIssueNextStep",
          "trace.product-issue-next-step",
          "Document the next step for the product/device issue.",
        ],
    ];
    structuredFollowUp.forEach(([field, code, message]) => {
      if (!String(details[field] ?? "").trim()) {
        stops.push(
          issue(
            "stop",
            code,
            message,
            `details.${String(field)}`,
            "traceability",
          ),
        );
      }
    });
  }
  if (details.administrationException && !requireAdministrationDetails) {
    stops.push(
      issue(
        "stop",
        "administration.exception-on-handoff",
        "Administration exception details apply only to an administered encounter. Clear them before documenting a non-administration handoff.",
        "details.administrationException",
        "administration",
      ),
    );
  } else if (details.administrationException) {
    const required: Array<[keyof InjectionAdministrationDetails, string, string]> = [
      [
        "exceptionSummary",
        "administration.exception-summary",
        "Describe what changed or was observed.",
      ],
      [
        "exceptionRecipient",
        "administration.exception-recipient",
        "Document who was notified, or why notification was not needed.",
      ],
      [
        "exceptionTime",
        "administration.exception-time",
        "Document the notification or decision time.",
      ],
      [
        "exceptionOutcome",
        "administration.exception-outcome",
        "Document the direction, action, and next step.",
      ],
    ];
    required.forEach(([field, code, message]) => {
      if (!String(details[field] ?? "").trim()) {
        stops.push(issue("stop", code, message, `details.${String(field)}`, "administration"));
      }
    });
  }
};

const hasStarted = (encounter: InjectionEncounter): boolean =>
  Boolean(
    encounter.patient.name.trim() ||
      encounter.patient.dob.trim() ||
      encounter.disposition.kind ||
      encounter.medicationKey ||
      encounter.dose.trim() ||
      encounter.traceability.lot.trim(),
  );

const buildRequirementProjection = (
  encounter: InjectionEncounter,
  medication: InjectionMedication | null,
  administrationPath: boolean,
  phase: InjectionClinicalPhase,
  requiredVerifications: readonly MedicationVerificationKey[],
): Record<string, InjectionRequirement> => {
  const requirements: Record<string, InjectionRequirement> = {};
  const set = (
    field: string,
    state: InjectionRequirementState,
    section: string,
    reason?: string,
  ) => {
    requirements[field] = { state, section, ...(reason ? { reason } : {}) };
  };
  const started = hasStarted(encounter);
  // The order workspace must be usable before staff select the medication.
  // Product-dependent controls stay out of the way until then, while core
  // patient/order fields remain visible and become required as soon as the
  // local record has meaningful documentation.
  const administrationDocumented = administrationPath && Boolean(medication);
  const orderDocumentStarted = administrationPath && started;
  // A stored protocol is meaningful only for an encounter explicitly marked
  // as initiation or re-initiation.  This keeps a stale legacy protocol from
  // turning an otherwise routine maintenance administration into a second,
  // unrelated checklist.
  const initiationPath =
    administrationDocumented && (phase === "initiation" || phase === "reinitiation");

  set("patient.name", started ? "required" : "optional", "patient");
  set("patient.dob", started ? "required" : "optional", "patient");
  set("disposition.kind", started ? "required" : "optional", "disposition");
  set("orderingProvider", orderDocumentStarted ? "required" : "optional", "order");
  set("details.purpose", "optional", "order");
  set("reason", "optional", "order");
  set("medicationKey", started ? "required" : "optional", "medication");
  set(
    "customMedication",
    medication?.key === "other" && administrationDocumented ? "required" : "hidden",
    "medication",
  );
  set("dose", administrationDocumented ? "required" : "hidden", "medication");
  set("route", administrationDocumented ? "required" : "hidden", "administration");
  set("intervalKey", administrationDocumented ? "required" : "hidden", "medication");
  set("technique", administrationDocumented ? "optional" : "hidden", "administration");
  set(
    "priorDoseDate",
    administrationDocumented
      ? encounter.reason === "scheduled"
        ? "required"
        : "optional"
      : "hidden",
    "timing",
  );
  set("priorSite", administrationDocumented ? "optional" : "hidden", "timing");
  set("administrationDate", administrationDocumented ? "required" : "hidden", "administration");
  set(
    "nextDoseDate",
    administrationDocumented && encounter.intervalKey && encounter.intervalKey !== "once" ? "required" : "hidden",
    "follow-up",
    encounter.intervalKey === "once" ? "One-time product; no routine follow-up date is required." : undefined,
  );
  set("site", administrationDocumented ? "required" : "hidden", "administration");
  set("administeredBy", administrationDocumented ? "required" : "hidden", "administration");
  set("administrationTime", administrationDocumented ? "required" : "hidden", "administration");
  set("response", administrationDocumented ? "required" : "hidden", "response");
  set(
    "response.custom",
    administrationDocumented && encounter.response.kind === "custom" ? "required" : "hidden",
    "response",
  );
  set("traceability.ndc", administrationDocumented ? "required" : "hidden", "traceability");
  set("traceability.lot", administrationDocumented ? "required" : "hidden", "traceability");
  set("traceability.expiration", administrationDocumented ? "required" : "hidden", "traceability");
  set("allergies", administrationDocumented ? "required" : "hidden", "safety");
  set("acuteSafetyScreenConfirmed", administrationDocumented ? "required" : "hidden", "safety");
  set("activeSafetyConcerns", administrationDocumented ? "optional" : "hidden", "safety");
  requiredAttestations.forEach(([key]) =>
    set(`attestations.${String(key)}`, administrationDocumented ? "required" : "hidden", "safety"),
  );
  set("attestations.prior", administrationDocumented ? "optional" : "hidden", "safety");

  (medication?.verifications ?? []).forEach((key) => {
    set(
      `verifications.${key}`,
      administrationDocumented && requiredVerifications.includes(key) ? "required" : "hidden",
      "medication",
    );
  });

  const hasInitiationOptions = Boolean(medication && injectionInitiationOptions(medication.key).length);
  set(
    "initiation.protocol",
    initiationPath && hasInitiationOptions ? "optional" : "hidden",
    "initiation",
    "Select only when the active plan uses a structured initiation/re-initiation pathway.",
  );
  const protocol = encounter.initiation?.protocol ?? "";
  const structuredInitiation = initiationPath && Boolean(protocol);
  set("initiation.planVerified", structuredInitiation ? "required" : "hidden", "initiation");
  const oralProtocol =
    pairedProtocols.has(protocol) ||
    ["maintena-14day", "asimtufii-14day", "aristada-21day"].includes(protocol);
  const providerProtocol = [
    "maintena-provider",
    "asimtufii-provider",
    "aristada-provider",
    "sustenna-provider",
  ].includes(protocol);
  const sustennaProtocol = protocol === "sustenna-day1" || protocol === "sustenna-day8";
  set("initiation.oralStatus", oralProtocol ? "required" : "hidden", "initiation");
  set("initiation.providerNote", providerProtocol ? "required" : "hidden", "initiation");
  set("initiation.sustennaOrder", sustennaProtocol ? "required" : "hidden", "initiation");
  set("initiation.day1Date", protocol === "sustenna-day8" ? "required" : "hidden", "initiation");
  const paired = structuredInitiation && pairedProtocols.has(protocol);
  ["dose", "site", "ndc", "lot", "expiration", "given", "orderVerified"].forEach((field) =>
    set(`initiation.second.${field}`, paired ? "required" : "hidden", "initiation"),
  );
  set("secondAdministrationTime", paired ? "required" : "hidden", "administration");

  set("details.volume", administrationDocumented ? "optional" : "hidden", "administration");
  set("details.volumeUnit", administrationDocumented ? "optional" : "hidden", "administration");
  set("details.device", administrationDocumented ? "optional" : "hidden", "administration");
  set(
    "details.deviceOther",
    administrationDocumented && encounter.details?.device === "Other" ? "required" : "hidden",
    "administration",
  );
  set("details.siteCondition", administrationDocumented ? "optional" : "hidden", "administration");
  set(
    "details.siteConditionOther",
    administrationDocumented && encounter.details?.siteCondition === "Other" ? "required" : "hidden",
    "administration",
  );
  set("details.productSource", administrationDocumented ? "optional" : "hidden", "traceability");
  set(
    "details.productSourceOther",
    administrationDocumented && encounter.details?.productSource === "Other" ? "required" : "hidden",
    "traceability",
  );
  set("details.preparation", administrationDocumented ? "optional" : "hidden", "traceability");
  set(
    "details.preparationOther",
    administrationDocumented && encounter.details?.preparation === "Other" ? "required" : "hidden",
    "traceability",
  );
  set("details.waste", administrationDocumented ? "optional" : "hidden", "traceability");
  set(
    "details.wasteAmount",
    administrationDocumented && encounter.details?.waste ? "required" : "hidden",
    "traceability",
  );
  set(
    "details.wasteWitness",
    administrationDocumented && encounter.details?.waste ? "required" : "hidden",
    "traceability",
  );
  set("details.productIssue", administrationDocumented ? "optional" : "hidden", "traceability");
  [
    "productIssueDetail",
    "productIssueAction",
    "productIssueRecipient",
    "productIssueNotificationTime",
    "productIssueDirection",
    "productIssueNextStep",
  ].forEach((field) =>
    set(
      `details.${field}`,
      administrationDocumented && encounter.details?.productIssue ? "required" : "hidden",
      "traceability",
    ),
  );
  set("details.administrationException", administrationDocumented ? "optional" : "hidden", "administration");
  ["exceptionSummary", "exceptionRecipient", "exceptionTime", "exceptionOutcome"].forEach((field) =>
    set(
      `details.${field}`,
      administrationDocumented && encounter.details?.administrationException ? "required" : "hidden",
      "administration",
    ),
  );

  const nonAdministration = Boolean(encounter.disposition.kind && encounter.disposition.kind !== "administered");
  set("disposition.provider", nonAdministration ? "required" : "hidden", "disposition");
  set("disposition.time", nonAdministration ? "required" : "hidden", "disposition");
  set("disposition.outcome", nonAdministration ? "required" : "hidden", "disposition");
  return requirements;
};

const buildGuidanceProjection = (
  medication: InjectionMedication | null,
  timing: InjectionTimingEvaluation,
  requiredVerifications: readonly MedicationVerificationKey[],
  allowedRoutes: readonly string[],
  allowedSites: readonly string[],
  expectedNextDoseDate: string,
  nonAdministration: boolean,
): InjectionGuidanceCard[] => {
  if (!medication?.clinicalReference) return [];
  const reference = medication.clinicalReference;
  const cards: InjectionGuidanceCard[] = [
    {
      key: `${medication.key}-active-order`,
      section: "order",
      title: "Active order",
      message:
        "Document the exact ordered strength, route, and cadence. Reference defaults do not replace the active order.",
      classification: "order-dependent review",
    },
    {
      key: `${medication.key}-schedule`,
      section: "timing",
      title: "Expected next due",
      message: expectedNextDoseDate
        ? `${expectedNextDoseDate} is calculated from the documented administration date and selected cadence. Confirm or revise it for the actual follow-up plan.`
        : "Enter the actual administration date and ordered cadence to calculate an expected next due date.",
      classification: "local policy",
    },
    {
      key: `${medication.key}-administration`,
      section: "administration",
      title: "Route / location",
      message:
        allowedSites.length > 0
          ? `Reference route${allowedRoutes.length > 1 ? "s" : ""}: ${allowedRoutes.join(" / ")}. Select the actual site after checking the active order.`
          : "Document the actual route and administration location from the active order; this product has no cataloged anatomical default.",
      classification: "label constraint",
    },
    {
      key: `${medication.key}-product`,
      section: "traceability",
      title: "Product traceability",
      message:
        "Choose the scanned or known package NDC when available, then document the dispensed lot and expiration. A different package NDC remains valid documentation and needs package verification.",
      classification: "local policy",
    },
    {
      key: `${medication.key}-disposition`,
      section: "disposition",
      title: nonAdministration ? "Handoff documentation" : "Final documentation choice",
      message: nonAdministration
        ? "No medication administration is being documented. Record the recipient, decision time, and concise direction; administration and product details are not applicable."
        : "Select administration only after the actual event is documented. Use a handoff disposition when medication was not administered.",
      classification: "local policy",
    },
  ];
  cards.push(...reference.facts.map((entry, index) => ({
    key: `${medication.key}-${entry.id}`,
    section: entry.classification === "label constraint" ? "administration" : "timing",
    title: index === 0 ? "Product guidance" : "Order review",
    message: entry.statement,
    classification: entry.classification,
  })));
  if (timing.message && timing.state !== "idle") {
    cards.push({
      key: `${medication.key}-timing`,
      section: "timing",
      title: "Schedule",
      message: timing.message,
      classification:
        medication.timingMode === "orderVerify" ? "order-dependent review" : "label constraint",
    });
  }
  cards.push({
    key: `${medication.key}-verification`,
    section: "safety",
    title: requiredVerifications.length ? "Required medication checks" : "Safety review",
    message: requiredVerifications.length
      ? requiredVerifications.map((key) => verificationLabels[key]).join("; ")
      : "Complete the applicable safety review and record an exception only when it is actually present.",
    classification: "label constraint",
  });
  return cards;
};

export const InjectionEngine: ClinicalEngine<
  InjectionEncounter,
  InjectionEngineContext,
  InjectionEvaluationOutput
> = {
  evaluate(
    encounter: InjectionEncounter,
    context: InjectionEngineContext = {},
  ): ClinicalEvaluation<InjectionEvaluationOutput> {
    const stops: ClinicalIssue[] = [];
    const warnings: ClinicalIssue[] = [];
    const recommendations = [];
    const calculatedDates: Record<string, string> = {};
    const started = hasStarted(encounter);
    const medication = encounter.medicationKey
      ? INJECTION_MEDICATIONS[encounter.medicationKey]
      : null;
    const dispositionKind = encounter.disposition?.kind ?? "";
    const administrationPath = dispositionKind === "" || dispositionKind === "administered";
    const phase = injectionClinicalPhaseForReason(encounter.reason);
    let requiredVerifications: MedicationVerificationKey[] = [];
    let expectedNextDoseDate = "";

    if (!medication) {
      if (started) {
        stops.push(
          issue(
            "stop",
            "medication.required",
            "Select the medication before documenting a disposition.",
            "medicationKey",
            "medication",
          ),
        );
      }
    }

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

    if (!dispositionKind && started) {
      stops.push(
        issue(
          "stop",
          "disposition.required",
          "Select the final clinical disposition.",
          "disposition.kind",
          "disposition",
        ),
      );
    }

    if (dispositionKind && dispositionKind !== "administered") {
      if (!encounter.disposition.provider?.trim()) {
        stops.push(
          issue(
            "stop",
            "handoff.provider",
            "Document the provider or handoff recipient.",
            "disposition.provider",
            "disposition",
          ),
        );
      }
      if (!encounter.disposition.time?.trim()) {
        stops.push(
          issue(
            "stop",
            "handoff.time",
            "Document the contact or decision time.",
            "disposition.time",
            "disposition",
          ),
        );
      }
      if (!encounter.disposition.outcome?.trim()) {
        stops.push(
          issue(
            "stop",
            "handoff.outcome",
            "Document the direction, outcome, and next step.",
            "disposition.outcome",
            "disposition",
          ),
        );
      }
    }

    let timing: InjectionTimingEvaluation = {
      state: "idle",
      daysSincePrior: null,
      earliestDay: null,
      latestDay: null,
      message: "Select a medication to evaluate timing.",
    };
    let allowedRoutes: string[] = [];
    let allowedSites: string[] = [];
    let recommendedSite = "";
    let repeatsPreviousSite = false;

    if (medication) {
      requiredVerifications = medication.clinicalReference
        ? medicationVerificationsForPhase(medication.clinicalReference, phase)
        : medication.verifications;
      const rule = medication.administrationRule(encounter.dose);
      allowedRoutes = rule.routes;
      allowedSites = rule.sites;
      const normalizedSite = normalizeInjectionSite(encounter.site);
      const previousSite = normalizeInjectionSite(
        encounter.priorSite?.trim() || context.previousSite?.trim() || "",
      );
      recommendedSite = recommendAlternateSite(allowedSites, previousSite);
      repeatsPreviousSite = Boolean(previousSite && normalizedSite === previousSite);
      if (recommendedSite) {
        recommendations.push({
          code: "site.rotate",
          message: `Consider ${recommendedSite} based on the prior documented site.`,
          action: "select-site",
        });
      }
      if (repeatsPreviousSite) {
        warnings.push(
          issue(
            "warning",
            "site.repeated",
            "Today's selected site repeats the prior documented site; consider rotation when clinically appropriate.",
            "site",
            "administration",
          ),
        );
      }

      if (administrationPath) {
        if (medication.key === "other" && !encounter.customMedication?.trim()) {
          stops.push(
            issue(
              "stop",
              "medication.other-name",
              "Document the medication name for an Other medication.",
              "customMedication",
              "medication",
            ),
          );
        }
        if (!encounter.dose.trim()) {
          stops.push(
            issue("stop", "dose.required", "Select or enter the ordered dose.", "dose", "medication"),
          );
        } else if (
          medication.key !== "other" &&
          encounter.intervalKey &&
          !allowedDosesForInterval(medication, encounter.intervalKey).includes(encounter.dose)
        ) {
          stops.push(
            issue(
              "stop",
              "dose.interval-mismatch",
              "The selected dose does not match the selected product interval. Verify the active order.",
              "dose",
              "medication",
            ),
          );
        }
        if (!encounter.route.trim()) {
          stops.push(
            issue(
              "stop",
              "route.required",
              "Document the route used.",
              "route",
              "administration",
            ),
          );
        } else if (!rule.routes.includes(encounter.route)) {
          stops.push(
            issue(
              "stop",
              "route.outside-guidance",
              "The selected route is outside the medication guidance; verify provider direction.",
              "route",
              "administration",
            ),
          );
        }
        if (!normalizedSite) {
          stops.push(
            issue(
              "stop",
              "site.required",
              "Select the injection site used.",
              "site",
              "administration",
            ),
          );
        } else if (rule.sites.length > 0 && !rule.sites.includes(normalizedSite)) {
          stops.push(
            issue(
              "stop",
              "site.outside-guidance",
              "The selected site is outside the medication guidance; verify provider direction.",
              "site",
              "administration",
            ),
          );
        }
        if (!encounter.intervalKey) {
          stops.push(
            issue(
              "stop",
              "interval.required",
              "Select the ordered dosing interval.",
              "intervalKey",
              "medication",
            ),
          );
        }
        if (!encounter.orderingProvider.trim()) {
          stops.push(
            issue(
              "stop",
              "order.provider",
              "Document the ordering provider.",
              "orderingProvider",
              "order",
            ),
          );
        }
        if (!encounter.administrationDate) {
          stops.push(
            issue(
              "stop",
              "administration.date",
              "Document the administration date.",
              "administrationDate",
              "administration",
            ),
          );
        }
        if (encounter.administrationDate && encounter.intervalKey) {
          expectedNextDoseDate = calculateNextInjectionDate(
            medication,
            encounter.intervalKey,
            encounter.administrationDate,
          );
          if (expectedNextDoseDate) {
            calculatedDates.expectedNextDoseDate = expectedNextDoseDate;
          }
        }
        if (encounter.intervalKey && encounter.intervalKey !== "once" && !encounter.nextDoseDate) {
          stops.push(
            issue(
              "stop",
              "followup.next-dose",
              "Confirm the next-dose date or ordered follow-up plan.",
              "nextDoseDate",
              "follow-up",
            ),
          );
        }
        if (!encounter.administeredBy.trim()) {
          stops.push(
            issue(
              "stop",
              "administration.staff",
              "Document administering staff.",
              "administeredBy",
              "administration",
            ),
          );
        }
        if (!encounter.response.kind || (encounter.response.kind === "custom" && !encounter.response.custom?.trim())) {
          stops.push(
            issue(
              "stop",
              "response.required",
              "Select or enter the observed post-injection response.",
              "response",
              "response",
            ),
          );
        }
        if (encounter.reason === "scheduled" && !encounter.priorDoseDate) {
          stops.push(
            issue(
              "stop",
              "timing.prior-dose",
              "Document the prior-dose date for a scheduled administration.",
              "priorDoseDate",
              "timing",
            ),
          );
        }
        requiredAttestations.forEach(([field, code, message]) => {
          if (!encounter.attestations[field]) {
            stops.push(issue("stop", code, message, `attestations.${String(field)}`, "safety"));
          }
        });
        if (encounter.attestations.allergy && !encounter.allergies.trim()) {
          stops.push(
            issue(
              "stop",
              "allergy.status",
              "Enter the verified allergy status; do not use an inferred default.",
              "allergies",
              "safety",
            ),
          );
        }
        if (!encounter.acuteSafetyScreenConfirmed) {
          stops.push(
            issue(
              "stop",
              "safety.screen",
              "Confirm today's acute safety screen or document an exception for provider review.",
              "acuteSafetyScreenConfirmed",
              "safety",
            ),
          );
        }
        (encounter.activeSafetyConcerns ?? []).forEach((concern) => {
          // Name the trigger the way the checkbox names it. Interpolating the
          // raw key put "nms" / "eps" / "site" in front of staff, who then
          // cannot tell which box to clear to release the hold.
          const triggerLabel =
            INJECTION_SAFETY_TRIGGERS.find((trigger) => trigger.key === concern)?.label ?? concern;
          stops.push(
            issue(
              "stop",
              `safety.concern.${concern}`,
              `Provider-review trigger selected: ${triggerLabel}. Administration cannot be finalized while it remains active.`,
              "activeSafetyConcerns",
              "safety",
            ),
          );
        });
        requiredVerifications.forEach((verification) => {
          if (!verificationSatisfied(encounter, verification)) {
            stops.push(
              issue(
                "stop",
                `verification.${verification}`,
                `Complete medication-specific verification: ${verificationLabels[verification]}.`,
                `verifications.${verification}`,
                "medication",
              ),
            );
          }
        });
        if (!encounter.traceability.ndc.trim()) {
          stops.push(
            issue(
              "stop",
              "trace.ndc",
              "Document the medication NDC.",
              "traceability.ndc",
              "traceability",
            ),
          );
        }
        if (!encounter.traceability.lot.trim()) {
          stops.push(
            issue(
              "stop",
              "trace.lot",
              "Document the medication lot.",
              "traceability.lot",
              "traceability",
            ),
          );
        }
        if (!encounter.traceability.expiration.trim()) {
          stops.push(
            issue(
              "stop",
              "trace.expiration",
              "Document the medication expiration.",
              "traceability.expiration",
              "traceability",
            ),
          );
        } else if (
          isExpiredMonth(
            encounter.traceability.expiration,
            encounter.administrationDate || context.today || localIsoDate(),
          )
        ) {
          stops.push(
            issue(
              "stop",
              "trace.expired",
              "Medication expiration appears past; obtain in-date product before documenting administration.",
              "traceability.expiration",
              "traceability",
            ),
          );
        }

        const vitalEvaluation = evaluateVitals(encounter);
        stops.push(...vitalEvaluation.stops);
        warnings.push(...vitalEvaluation.warnings);
        timing = evaluateTimingWithCadence(encounter, medication);
        if (timing.state === "stop") {
          stops.push(issue("stop", "timing.outside-window", timing.message, "priorDoseDate", "timing"));
        } else if (timing.state === "warning") {
          warnings.push(
            issue("warning", "timing.review", timing.message, "priorDoseDate", "timing"),
          );
        }
        // The initiation state is not a generic maintenance checklist.  A
        // draft can carry an older protocol value after staff change the visit
        // reason, so run these controls only for an explicitly documented
        // initiation/re-initiation encounter.
        if (phase === "initiation" || phase === "reinitiation") {
          evaluateInitiation(
            encounter,
            stops,
            calculatedDates,
            encounter.administrationDate || context.today || localIsoDate(),
          );
        }
        if (medication.clinicalReference) {
          conditionalRequirementsForEncounter(
            medication.clinicalReference,
            phase,
            encounter.dose,
          ).forEach((requirement) => {
            const target =
              requirement.severity === "stop"
                ? stops
                : warnings;
            target.push(
              issue(
                requirement.severity,
                requirement.code,
                requirement.message,
                requirement.field,
                requirement.section,
              ),
            );
          });
        }
      }
    }

    if (started) evaluateDetails(encounter, administrationPath && Boolean(medication), stops);

    if (dispositionKind && dispositionKind !== "administered") {
      warnings.push(
        issue(
          "warning",
          "disposition.non-administration",
          "No medication administration is documented by this handoff.",
          "disposition.kind",
          "disposition",
        ),
      );
    }

    const uniqueStops = uniqueIssues(stops);
    const uniqueWarnings = uniqueIssues(warnings);
    const administrationDocumented =
      dispositionKind === "administered" && uniqueStops.length === 0;
    const handoffReady =
      Boolean(dispositionKind && dispositionKind !== "administered") && uniqueStops.length === 0;
    const canFinalize = administrationDocumented || handoffReady;
    const readiness = readinessFrom(started, uniqueStops, uniqueWarnings);
    const requirements = buildRequirementProjection(
      encounter,
      medication,
      administrationPath,
      phase,
      requiredVerifications,
    );
    const guidance = buildGuidanceProjection(
      medication,
      timing,
      requiredVerifications,
      allowedRoutes,
      allowedSites,
      expectedNextDoseDate,
      Boolean(dispositionKind && dispositionKind !== "administered"),
    );

    return {
      workflow: "injection",
      readiness,
      stops: uniqueStops,
      warnings: uniqueWarnings,
      recommendations,
      calculatedDates,
      output: {
        medication,
        timing,
        allowedRoutes,
        allowedSites,
        recommendedSite,
        repeatsPreviousSite,
        administrationDocumented,
        canFinalize,
        recordStatus: administrationDocumented
          ? "ready-to-lock"
          : handoffReady
            ? "handoff-ready"
            : "draft",
        initiationProtocol: encounter.initiation?.protocol ?? "",
        phase,
        requiredVerifications,
        requirements,
        guidance,
        expectedNextDoseDate,
        ...(medication?.clinicalReference
          ? { clinicalReferenceVersion: INJECTION_CLINICAL_REFERENCE_VERSION }
          : {}),
      },
    };
  },
};

export const emptyInjectionInitiation = (): InjectionInitiationState => ({
  version: 1,
  protocol: "",
  planVerified: false,
  oralStatus: "",
  providerNote: "",
  sustennaOrder: "",
  day1Date: "",
  second: {
    dose: "",
    site: "",
    ndc: "",
    lot: "",
    expiration: "",
    given: false,
    orderVerified: false,
    note: "",
  },
});

export const emptyInjectionEncounter = (): InjectionEncounter => ({
  patient: { name: "", dob: "" },
  medicationKey: "",
  customMedication: "",
  dose: "",
  route: "",
  site: "",
  intervalKey: "",
  reason: "scheduled",
  priorDoseDate: "",
  priorSite: "",
  administrationDate: "",
  nextDoseDate: "",
  orderingProvider: "",
  administeredBy: "",
  administrationTime: "",
  secondAdministrationTime: "",
  allergies: "",
  technique: "",
  traceability: { ndc: "", lot: "", expiration: "" },
  vitals: {},
  response: { kind: "", custom: "" },
  attestations: {},
  verifications: {},
  acuteSafetyScreenConfirmed: false,
  activeSafetyConcerns: [],
  disposition: { kind: "", provider: "", time: "", outcome: "" },
  initiation: emptyInjectionInitiation(),
  details: {},
});
