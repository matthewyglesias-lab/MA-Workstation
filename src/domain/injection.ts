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
  effectiveInjectionWindow,
  injectionMuscleKey,
  normalizeInjectionSite,
  recommendAlternateSite,
  type InjectionIntervalKey,
  type InjectionMedication,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "./injection-catalog";

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
  message: string;
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

const verificationLabels: Record<MedicationVerificationKey, string> = {
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
      encounter.medicationKey ||
      encounter.dose.trim() ||
      encounter.traceability.lot.trim(),
  );

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
        } else if (!rule.sites.includes(normalizedSite)) {
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
          stops.push(
            issue(
              "stop",
              `safety.concern.${concern}`,
              `Provider-review trigger selected: ${concern}. Administration cannot be finalized while it remains active.`,
              "activeSafetyConcerns",
              "safety",
            ),
          );
        });
        medication.verifications.forEach((verification) => {
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
        timing = evaluateTiming(encounter, medication);
        if (timing.state === "stop") {
          stops.push(issue("stop", "timing.outside-window", timing.message, "priorDoseDate", "timing"));
        } else if (timing.state === "warning") {
          warnings.push(
            issue("warning", "timing.review", timing.message, "priorDoseDate", "timing"),
          );
        }
        evaluateInitiation(
          encounter,
          stops,
          calculatedDates,
          encounter.administrationDate || context.today || localIsoDate(),
        );
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
