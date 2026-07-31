import {
  issue,
  readinessFrom,
  uniqueIssues,
  type ClinicalEngine,
  type ClinicalEvaluation,
  type ClinicalIssue,
  type PatientIdentity,
} from "./contracts";
import { isExpiredMonth, localDayFromTimestamp, localIsoDate } from "./dates";

export interface SamplePackage {
  id: string;
  label?: string;
  medicationStrength: string;
  quantity: string;
  lot: string;
  expiration: string;
}

export interface SamplePlanStep {
  id: string;
  strength: string;
  quantity: string;
  days?: string;
  directions: string;
}

export interface SampleReviewConfirmation {
  confirmedAt: string;
  fingerprint: string;
}

export interface SamplesEncounter {
  patient: PatientIdentity;
  prescriber: string;
  staff: string;
  dispenseDate: string;
  startDate: string;
  medicationKey: string;
  medicationLabel: string;
  quantity: string;
  directions: string;
  purpose: string;
  foodInstructions?: string;
  titration?: string;
  medicationReview:
    | "Prescriber reviewed / ok to dispense"
    | "Pending provider confirmation"
    | "Medication list not available"
    | "Patient counseled to ask pharmacist before starting"
    | "not documented"
    | "";
  education: "Reviewed with patient" | "not documented" | string;
  packages: SamplePackage[];
  plan: SamplePlanStep[];
  extra?: string;
  review: SampleReviewConfirmation;
}

export interface SamplesEngineContext {
  today?: string;
}

export interface SamplesEvaluationOutput {
  reviewCurrent: boolean;
  reviewEligible: boolean;
  currentFingerprint: string;
  packageCount: number;
  traceManifest: Array<{
    id: string;
    label: string;
    medicationStrength: string;
    quantity: string;
    lot: string;
    expiration: string;
  }>;
  finalizedOutputAllowed: boolean;
}

export const SAMPLE_MEDICATIONS_REQUIRING_EXPLICIT_PRESCRIBER_REVIEW = new Set([
  "lybalvi",
  "cobenfy",
  "fanapt",
  "rexulti",
]);

const normalizedPackages = (encounter: SamplesEncounter) =>
  encounter.packages.map((entry, index) => ({
    id: entry.id || `package-${index + 1}`,
    label: entry.label || (index === 0 ? "Primary package" : `Added package ${index + 1}`),
    medicationStrength: entry.medicationStrength.trim(),
    quantity: entry.quantity.trim(),
    lot: entry.lot.trim(),
    expiration: entry.expiration.trim(),
  }));

export const sampleReviewFingerprint = (encounter: SamplesEncounter): string =>
  JSON.stringify({
    patient: encounter.patient.name.trim(),
    dob: encounter.patient.dob.trim(),
    prescriber: encounter.prescriber.trim(),
    staff: encounter.staff.trim(),
    date: encounter.dispenseDate,
    start: encounter.startDate,
    medication: encounter.medicationKey || encounter.medicationLabel.trim(),
    medicationLabel: encounter.medicationLabel.trim(),
    quantity: encounter.quantity.trim(),
    directions: encounter.directions.trim(),
    purpose: encounter.purpose.trim(),
    foodInstructions: encounter.foodInstructions?.trim() ?? "",
    titration: encounter.titration?.trim() ?? "",
    medicationReview: encounter.medicationReview,
    education: encounter.education,
    extra: encounter.extra?.trim() ?? "",
    plan: encounter.plan.map((step) => ({
      id: step.id,
      strength: step.strength.trim(),
      quantity: step.quantity.trim(),
      days: step.days?.trim() ?? "",
      directions: step.directions.trim(),
    })),
    packages: normalizedPackages(encounter).map(
      ({ id, medicationStrength, quantity, lot, expiration }) => ({
        id,
        medicationStrength,
        quantity,
        lot,
        expiration,
      }),
    ),
  });

export const sampleReviewIsCurrent = (
  encounter: SamplesEncounter,
  today: string,
): boolean =>
  Boolean(
    encounter.review.confirmedAt &&
      localDayFromTimestamp(encounter.review.confirmedAt) === today &&
      encounter.review.fingerprint &&
      encounter.review.fingerprint === sampleReviewFingerprint(encounter),
  );

export const confirmSampleReview = (
  encounter: SamplesEncounter,
  confirmedAt: string,
): SamplesEncounter => ({
  ...encounter,
  review: {
    confirmedAt,
    fingerprint: sampleReviewFingerprint(encounter),
  },
});

const hasStarted = (encounter: SamplesEncounter): boolean =>
  Boolean(
    encounter.patient.name.trim() ||
      encounter.medicationKey ||
      encounter.medicationLabel.trim() ||
      encounter.quantity.trim() ||
      encounter.packages.length,
  );

export const SamplesEngine: ClinicalEngine<
  SamplesEncounter,
  SamplesEngineContext,
  SamplesEvaluationOutput
> = {
  evaluate(
    encounter: SamplesEncounter,
    context: SamplesEngineContext = {},
  ): ClinicalEvaluation<SamplesEvaluationOutput> {
    const stops: ClinicalIssue[] = [];
    const warnings: ClinicalIssue[] = [];
    const recommendations = [];
    const calculatedDates: Record<string, string> = {};
    const started = hasStarted(encounter);
    const today = context.today || localIsoDate();
    const packages = normalizedPackages(encounter);
    const fingerprint = sampleReviewFingerprint(encounter);

    const required: Array<[string, string, string]> = [
      [encounter.patient.name, "patient.name", "Document the patient name."],
      [encounter.patient.dob, "patient.dob", "Document the patient date of birth."],
      [encounter.prescriber, "prescriber", "Document the prescribing provider."],
      [encounter.staff, "staff", "Document the staff member dispensing the sample."],
      [encounter.dispenseDate, "dispenseDate", "Document the dispense date."],
      [encounter.startDate, "startDate", "Document the planned start date."],
      [
        encounter.medicationKey || encounter.medicationLabel,
        "medication",
        "Select or enter the sample medication.",
      ],
      [encounter.quantity, "quantity", "Document the primary quantity provided."],
      [encounter.directions, "directions", "Document the exact prescriber directions."],
    ];
    if (started) {
      required.forEach(([value, field, message]) => {
        if (!value.trim()) {
          stops.push(issue("stop", `samples.${field}`, message, field, "dispense"));
        }
      });
    }
    if (started && !packages.length) {
      stops.push(
        issue(
          "stop",
          "samples.packages.required",
          "Document each physical sample package.",
          "packages",
          "traceability",
        ),
      );
    }
    packages.forEach((entry, index) => {
      const label = entry.label || `Package ${index + 1}`;
      if (!entry.medicationStrength) {
        stops.push(
          issue(
            "stop",
            `samples.package.${entry.id}.strength`,
            `${label}: document the medication/strength.`,
            `packages.${index}.medicationStrength`,
            "traceability",
          ),
        );
      }
      if (!entry.quantity) {
        stops.push(
          issue(
            "stop",
            `samples.package.${entry.id}.quantity`,
            `${label}: document the quantity.`,
            `packages.${index}.quantity`,
            "traceability",
          ),
        );
      }
      if (!entry.lot) {
        stops.push(
          issue(
            "stop",
            `samples.package.${entry.id}.lot`,
            `${label}: document the lot.`,
            `packages.${index}.lot`,
            "traceability",
          ),
        );
      }
      if (!entry.expiration) {
        stops.push(
          issue(
            "stop",
            `samples.package.${entry.id}.expiration`,
            `${label}: document the expiration.`,
            `packages.${index}.expiration`,
            "traceability",
          ),
        );
      } else if (isExpiredMonth(entry.expiration, encounter.dispenseDate || today)) {
        stops.push(
          issue(
            "stop",
            `samples.package.${entry.id}.expired`,
            `${label}: expired — do not dispense.`,
            `packages.${index}.expiration`,
            "traceability",
          ),
        );
      }
    });
    if (started && (!encounter.medicationReview || encounter.medicationReview === "not documented")) {
      stops.push(
        issue(
          "stop",
          "samples.medication-review",
          "Document the medication list / interaction review.",
          "medicationReview",
          "safety",
        ),
      );
    }
    if (
      started &&
      SAMPLE_MEDICATIONS_REQUIRING_EXPLICIT_PRESCRIBER_REVIEW.has(encounter.medicationKey) &&
      encounter.medicationReview !== "Prescriber reviewed / ok to dispense"
    ) {
      stops.push(
        issue(
          "stop",
          "samples.prescriber-review",
          `${encounter.medicationLabel || encounter.medicationKey}: confirm prescriber review before dispensing.`,
          "medicationReview",
          "safety",
        ),
      );
    }
    if (started && (!encounter.education || encounter.education === "not documented")) {
      stops.push(
        issue(
          "stop",
          "samples.education",
          "Document the patient education status.",
          "education",
          "education",
        ),
      );
    }
    encounter.plan.forEach((step, index) => {
      if (!step.strength.trim() || !step.quantity.trim() || !step.directions.trim()) {
        stops.push(
          issue(
            "stop",
            `samples.plan.${step.id || index}.partial`,
            `Plan step ${index + 1}: document strength, quantity, and directions, or remove the partial step.`,
            `plan.${index}`,
            "plan",
          ),
        );
      }
    });
    if (encounter.plan.length > 1) {
      warnings.push(
        issue(
          "warning",
          "samples.multi-step",
          "Multiple strengths/steps are documented; confirm the sequence with the patient.",
          "plan",
          "plan",
        ),
      );
    }

    const baseStops = uniqueIssues(stops);
    const reviewCurrent = sampleReviewIsCurrent(encounter, today);
    const reviewEligible = started && baseStops.length === 0;
    if (started && !reviewCurrent) {
      stops.push(
        issue(
          "stop",
          "samples.review-today",
          "Complete the one-tap final dispense review for the current patient, plan, package trace, and counseling.",
          "review",
          "final-review",
        ),
      );
    }
    if (reviewEligible && !reviewCurrent) {
      recommendations.push({
        code: "samples.confirm-review",
        message: "The entry is eligible for final review; confirm it immediately before output.",
        action: "confirm-review",
      });
    }

    const uniqueStops = uniqueIssues(stops);
    const uniqueWarnings = uniqueIssues(warnings);
    return {
      workflow: "samples",
      readiness: readinessFrom(started, uniqueStops, uniqueWarnings),
      stops: uniqueStops,
      warnings: uniqueWarnings,
      recommendations,
      calculatedDates,
      output: {
        reviewCurrent,
        reviewEligible,
        currentFingerprint: fingerprint,
        packageCount: packages.length,
        traceManifest: packages,
        finalizedOutputAllowed: started && uniqueStops.length === 0,
      },
    };
  },
};

export const emptySamplesEncounter = (): SamplesEncounter => ({
  patient: { name: "", dob: "" },
  prescriber: "",
  staff: "",
  dispenseDate: "",
  startDate: "",
  medicationKey: "",
  medicationLabel: "",
  quantity: "",
  directions: "",
  purpose: "",
  foodInstructions: "",
  titration: "",
  medicationReview: "not documented",
  education: "not documented",
  packages: [],
  plan: [],
  extra: "",
  review: { confirmedAt: "", fingerprint: "" },
});
