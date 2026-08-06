import type { InjectionEncounter } from "./injection";
import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  injectionClinicalPhaseForReason,
  type ClinicalReferenceSource,
  type InjectionClinicalPhase,
} from "./injection-clinical-reference";
import {
  injectionIntervalLabel,
  type InjectionIntervalKey,
  type InjectionMedicationKey,
} from "./injection-catalog";

/**
 * This paper-only patient form never changes the clinical evaluator or records
 * patient answers, signatures, or consent. Product labels provide source
 * traceability for medication-specific content; the clinic-approved bilingual
 * consent acknowledgement below remains the patient-facing consent wording.
 */
export type PatientScreenLanguage = "en" | "es";

export type InjectionPatientScreenReviewStatus = "approved";

export type InjectionPatientScreenSectionKind =
  | "screening"
  | "plan"
  | "additional"
  | "consent";

/** All prompts use the same compact, patient-facing paper response pattern. */
export type InjectionPatientScreenResponseType = "yes-no-not-sure";

type CatalogMedicationKey = Exclude<InjectionMedicationKey, "other">;

export interface InjectionPatientScreenRuleSelector {
  medicationKeys?: readonly InjectionMedicationKey[];
  doses?: readonly string[];
  routes?: readonly string[];
  intervalKeys?: readonly InjectionIntervalKey[];
  phases?: readonly InjectionClinicalPhase[];
}

export interface InjectionPatientScreenRuleCopy {
  sectionTitle: string;
  prompt: string;
  /**
   * Internal catalog guidance for staff. It explains what a Yes / Not sure
   * response should trigger, but is never used to clear, stop, or
   * persist an encounter.
   */
  staffInterpretation: string;
}

export type InjectionPatientScreenRuleProvenance =
  | {
      kind: "product-label";
      source: ClinicalReferenceSource;
      labelRevision: string;
    }
  | {
      kind: "clinic-approved";
      labelRevision: string;
    };

export interface InjectionPatientScreenRule {
  id: string;
  section: InjectionPatientScreenSectionKind;
  selector: InjectionPatientScreenRuleSelector;
  responseType: InjectionPatientScreenResponseType;
  copy: Record<PatientScreenLanguage, InjectionPatientScreenRuleCopy>;
  provenance: InjectionPatientScreenRuleProvenance;
  reviewStatus: InjectionPatientScreenReviewStatus;
}

export interface InjectionPatientScreenItem {
  id: string;
  prompt: string;
  responseType: InjectionPatientScreenResponseType;
  staffInterpretation: string;
  provenance: InjectionPatientScreenRuleProvenance;
  reviewStatus: InjectionPatientScreenReviewStatus;
}

export interface InjectionPatientScreenSection {
  id: InjectionPatientScreenSectionKind;
  title: string;
  items: InjectionPatientScreenItem[];
}

export interface InjectionPatientScreenLabels {
  title: string;
  subtitle: string;
  workstation: string;
  formLabel: string;
  orderInformation: string;
  patientCheckIn: string;
  responseInstruction: string;
  staffResponseNote: string;
  patient: string;
  dateOfBirth: string;
  medication: string;
  dose: string;
  route: string;
  schedule: string;
  phase: string;
  date: string;
  yes: string;
  no: string;
  notSure: string;
  consentTitle: string;
  consentBody: string;
  patientSignature: string;
  patientDate: string;
  staffReviewer: string;
  staffDate: string;
  followUp: string;
  source: string;
  noProductSource: string;
}

export interface InjectionPatientScreenDocument {
  language: PatientScreenLanguage;
  reviewStatus: InjectionPatientScreenReviewStatus;
  labels: InjectionPatientScreenLabels;
  metadata: {
    patientName: string;
    patientDob: string;
    medication: string;
    dose: string;
    route: string;
    interval: string;
    phase: string;
    administrationDate: string;
  };
  sections: InjectionPatientScreenSection[];
  /** True only for initiation-like forms; maintenance forms omit consent. */
  showsConsent: boolean;
  source?: ClinicalReferenceSource;
  hasProductSpecificContent: boolean;
}

export const INJECTION_PATIENT_SCREENING_CONTENT_VERSION = "2026.08.06.1";
export const INJECTION_PATIENT_SCREENING_APPROVED_ON = "2026-08-06";

const CLINIC_APPROVED_PROVENANCE: InjectionPatientScreenRuleProvenance = {
  kind: "clinic-approved",
  labelRevision:
    "Clinic-approved bilingual patient-screening and consent content 2026-08-06",
};

const responseType: InjectionPatientScreenResponseType = "yes-no-not-sure";

const medicationKeys = Object.keys(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications) as CatalogMedicationKey[];

const normalizeStaffInterpretation = (
  value: string,
  language: PatientScreenLanguage,
): string =>
  language === "es"
    ? value
        .replaceAll("Necesito hablarlo", "No estoy seguro/a")
        .replaceAll("Si responde Si", "Si responde S\u00ed")
    : value.replaceAll("Need to discuss", "Not sure");

const normalizedCopy = (
  copy: InjectionPatientScreenRuleCopy,
  language: PatientScreenLanguage,
): InjectionPatientScreenRuleCopy => ({
  ...copy,
  staffInterpretation: normalizeStaffInterpretation(copy.staffInterpretation, language),
});

const bilingualCopy = (
  en: InjectionPatientScreenRuleCopy,
  es: InjectionPatientScreenRuleCopy,
): Record<PatientScreenLanguage, InjectionPatientScreenRuleCopy> => ({
  en: normalizedCopy(en, "en"),
  es: normalizedCopy(es, "es"),
});

const clinicApprovedRule = (
  id: string,
  section: InjectionPatientScreenSectionKind,
  copy: Record<PatientScreenLanguage, InjectionPatientScreenRuleCopy>,
  selector: InjectionPatientScreenRuleSelector = {},
): InjectionPatientScreenRule => ({
  id,
  section,
  selector,
  responseType,
  copy,
  provenance: CLINIC_APPROVED_PROVENANCE,
  reviewStatus: "approved",
});

const productLabelRule = (
  medicationKey: CatalogMedicationKey,
  id: string,
  section: InjectionPatientScreenSectionKind,
  copy: Record<PatientScreenLanguage, InjectionPatientScreenRuleCopy>,
  selector: Omit<InjectionPatientScreenRuleSelector, "medicationKeys"> = {},
): InjectionPatientScreenRule => {
  const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey];
  return {
    id,
    section,
    selector: { ...selector, medicationKeys: [medicationKey] },
    responseType,
    copy,
    provenance: {
      kind: "product-label",
      source: reference.source,
      labelRevision: reference.source.labelRevision,
    },
    reviewStatus: "approved",
  };
};

const universalRules: InjectionPatientScreenRule[] = [
  clinicApprovedRule(
    "universal-plan-confirmation",
    "plan",
    bilingualCopy(
      {
        sectionTitle: "Medication / plan check",
        prompt:
          "Is anything about the medication, dose, route, or schedule shown above different from what you expected to receive today?",
        staffInterpretation:
          "If Yes or Not sure: verify the active order and resolve the mismatch or question with authorized staff before administration.",
      },
      {
        sectionTitle: "Revisi\u00f3n del medicamento / plan",
        prompt:
          "\u00bfHay algo sobre el medicamento, la dosis, la v\u00eda o el horario indicados arriba que sea diferente de lo que esperaba recibir hoy?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: verifique la orden activa y resuelva la diferencia o pregunta con personal autorizado antes de administrar.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-unwell-or-new-illness",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you felt unwell today - for example, fever, infection, or anything new that concerns you?",
        staffInterpretation:
          "If Yes or Not sure: review current symptoms and route concerns to authorized staff or a clinician as indicated. Do not use this paper answer as a diagnosis or independent clearance.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfse ha sentido mal hoy, por ejemplo con fiebre, una infecci\u00f3n o algo nuevo que le preocupe?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: revise los s\u00edntomas actuales y dirija las inquietudes a personal autorizado o a un profesional cl\u00ednico seg\u00fan corresponda. No use esta respuesta en papel como diagn\u00f3stico ni autorizaci\u00f3n independiente.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-dizziness-fainting-or-fall",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you felt dizzy or lightheaded, fainted, or had a fall or near-fall?",
        staffInterpretation:
          "If Yes or Not sure: have authorized staff assess the reported event and obtain clinician direction when indicated before proceeding.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfse ha sentido mareado/a o aturdido/a, se ha desmayado o ha tenido una ca\u00edda o casi-ca\u00edda?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: haga que personal autorizado eval\u00fae el evento informado y obtenga indicaciones cl\u00ednicas cuando corresponda antes de continuar.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-chest-breathing-or-heart-symptoms",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you had chest pain, trouble breathing, or a racing, pounding, or irregular heartbeat?",
        staffInterpretation:
          "If Yes or Not sure: use the clinic's urgent safety process and obtain clinician assessment. Do not rely on this paper form alone.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfha tenido dolor en el pecho, dificultad para respirar o latidos cardiacos r\u00e1pidos, fuertes o irregulares?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: use el proceso urgente de seguridad de la cl\u00ednica y obtenga una evaluaci\u00f3n cl\u00ednica. No se base solo en este formulario en papel.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-injection-site-concern",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "At the site of your last injection, have you had pain, swelling, warmth, drainage, a growing lump, or a reaction that is getting worse or not getting better?",
        staffInterpretation:
          "If Yes or Not sure: have authorized staff inspect the reported site and route concerning or severe findings to a clinician.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "En el sitio de su \u00faltima inyecci\u00f3n, \u00bfha tenido dolor, hinchaz\u00f3n, calor, drenaje, un bulto que crece o una reacci\u00f3n que empeora o no mejora?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: haga que personal autorizado examine el sitio informado y dirija los hallazgos preocupantes o graves a un profesional cl\u00ednico.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-other-post-injection-problem",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you had any other problem that you think may be related to the medicine or injection?",
        staffInterpretation:
          "If Yes or Not sure: capture the concern and route it to authorized staff or a clinician for review before proceeding as indicated.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfha tenido alg\u00fan otro problema que cree que puede estar relacionado con el medicamento o la inyecci\u00f3n?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: registre la inquietud y dir\u00edjala a personal autorizado o a un profesional cl\u00ednico para su revisi\u00f3n antes de continuar, seg\u00fan corresponda.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-allergy-or-reaction",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Have you had a new allergy, an allergic reaction, or a change in your allergies?",
        staffInterpretation:
          "If Yes or Not sure: review the reported allergy or reaction and obtain clinician direction when indicated.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "\u00bfHa tenido una alergia nueva, una reacci\u00f3n al\u00e9rgica o un cambio en sus alergias?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: revise la alergia o reacci\u00f3n informada y obtenga indicaciones cl\u00ednicas cuando corresponda.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-medication-change",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you started, stopped, or changed any prescription medicines, non-prescription medicines, vitamins, or supplements?",
        staffInterpretation:
          "If Yes or Not sure: review the change for active-order, interaction, contraindication, or monitoring implications.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfha comenzado, suspendido o cambiado alg\u00fan medicamento con receta, sin receta, vitamina o suplemento?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: revise el cambio por sus implicaciones para la orden activa, interacciones, contraindicaciones o seguimiento.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-new-health-event",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Since your last injection, have you had an emergency visit, hospital stay, new diagnosis, or other health change that you have not already discussed with the care team?",
        staffInterpretation:
          "If Yes or Not sure: review the health change for active-order, contraindication, or monitoring implications with the appropriate clinician.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n, \u00bfha tenido una visita de emergencia, hospitalizaci\u00f3n, diagn\u00f3stico nuevo u otro cambio de salud que todav\u00eda no ha hablado con el equipo de atenci\u00f3n?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: revise el cambio de salud con el profesional adecuado por sus implicaciones para la orden activa, contraindicaciones o seguimiento.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-pregnancy-or-lactation",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "If this applies to you, are you pregnant, could you be pregnant, trying to become pregnant, or breastfeeding?",
        staffInterpretation:
          "If Yes or Not sure: route to a clinician for medication-specific counseling and active-plan review.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "Si corresponde, \u00bfest\u00e1 embarazada, podr\u00eda estar embarazada, est\u00e1 intentando quedar embarazada o est\u00e1 amamantando?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: dirija al paciente a un profesional cl\u00ednico para orientaci\u00f3n espec\u00edfica del medicamento y revisi\u00f3n del plan activo.",
      },
    ),
  ),
  clinicApprovedRule(
    "universal-questions",
    "screening",
    bilingualCopy(
      {
        sectionTitle: "Since your last injection",
        prompt:
          "Do you have any questions or concerns you would like to discuss before the injection?",
        staffInterpretation:
          "If Yes or Not sure: address the question or route it to the appropriate clinician before proceeding as needed.",
      },
      {
        sectionTitle: "Desde su \u00faltima inyecci\u00f3n",
        prompt:
          "\u00bfTiene preguntas o inquietudes que quisiera hablar antes de la inyecci\u00f3n?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: responda la pregunta o dir\u00edjala al profesional adecuado antes de continuar, seg\u00fan corresponda.",
      },
    ),
  ),
];

/**
 * These prompts are deliberately paired to each product's own source record.
 * They are screening questions, not diagnostic tests and not automatic hold
 * rules. The typed staff interpretation is the catalog's review cue.
 */
const antipsychoticMedicationKeys: readonly CatalogMedicationKey[] = [
  "aristada",
  "initio",
  "sustenna",
  "erzofri",
  "trinza",
  "hafyera",
  "uzedy",
  "maintena",
  "asimtufii",
  "haldol",
  "prolixin",
];

const antipsychoticNmsSafetyCopy = bilingualCopy(
  {
    sectionTitle: "Medication-specific check-in",
    prompt:
      "Since your last dose, have you had fever together with severe muscle stiffness, confusion, or heavy sweating?",
    staffInterpretation:
      "If Yes or Not sure: use the clinic's urgent safety process and obtain clinician assessment for potentially serious symptoms. Do not rely on this paper form alone.",
  },
  {
    sectionTitle: "Control espec\u00edfico del medicamento",
    prompt:
      "Desde su \u00faltima dosis, \u00bfha tenido fiebre junto con rigidez muscular intensa, confusi\u00f3n o sudoraci\u00f3n intensa?",
    staffInterpretation:
      "Si responde S\u00ed o No estoy seguro/a: use el proceso urgente de seguridad de la cl\u00ednica y obtenga una evaluaci\u00f3n cl\u00ednica de s\u00edntomas potencialmente graves. No se base solo en este formulario en papel.",
  },
);

const antipsychoticMovementSafetyCopy = bilingualCopy(
  {
    sectionTitle: "Medication-specific check-in",
    prompt:
      "Since your last dose, have you had new or worse uncontrolled movements, shaking or tremor, severe restlessness, stiffness, or trouble swallowing?",
    staffInterpretation:
      "If Yes or Not sure: route to a clinician or authorized staff member for review of potentially serious movement, neurologic, or swallowing symptoms.",
  },
  {
    sectionTitle: "Control espec\u00edfico del medicamento",
    prompt:
      "Desde su \u00faltima dosis, \u00bfha tenido movimientos incontrolables, temblor, inquietud intensa, rigidez o dificultad para tragar que sean nuevos o peores?",
    staffInterpretation:
      "Si responde S\u00ed o No estoy seguro/a: dirija al paciente a un profesional cl\u00ednico o personal autorizado para revisar s\u00edntomas de movimiento, neurol\u00f3gicos o de degluci\u00f3n potencialmente graves.",
  },
);

const antipsychoticSafetyRules = antipsychoticMedicationKeys.flatMap((medicationKey) => [
  productLabelRule(
    medicationKey,
    `medication-${medicationKey}-fever-stiffness-or-confusion`,
    "additional",
    antipsychoticNmsSafetyCopy,
  ),
  productLabelRule(
    medicationKey,
    `medication-${medicationKey}-movement-or-swallowing`,
    "additional",
    antipsychoticMovementSafetyCopy,
  ),
]);

const productSpecificRules: InjectionPatientScreenRule[] = [
  productLabelRule(
    "aristada",
    "medication-aristada-compulsive-urges",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Have you noticed a new or hard-to-control urge to gamble, spend money, eat or binge eat, have sex, or do another impulsive behavior?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for review of possible aripiprazole-related compulsive or impulsive behavior.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfHa notado un impulso nuevo o dif\u00edcil de controlar para apostar, gastar dinero, comer o darse atracones, tener relaciones sexuales u otro comportamiento impulsivo?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija al paciente al profesional cl\u00ednico para revisar una posible conducta compulsiva o impulsiva relacionada con aripiprazol.",
      },
    ),
  ),
  productLabelRule(
    "initio",
    "medication-initio-one-time-plan",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Today's ARISTADA INITIO is a one-time start or restart component. Is anything about that plan, including any companion medicine, different from what was explained to you?",
        staffInterpretation:
          "If Yes or Need to discuss: verify the active initiation or re-initiation plan, including any companion ARISTADA or oral aripiprazole order.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "El ARISTADA INITIO de hoy es un componente de inicio o reinicio de una sola vez. \u00bfHay algo sobre ese plan, incluido cualquier medicamento acompa\u00f1ante, que sea diferente de lo que le explicaron?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el plan activo de inicio o reinicio, incluida cualquier orden de ARISTADA o aripiprazol oral acompa\u00f1ante.",
      },
    ),
  ),
  productLabelRule(
    "sustenna",
    "medication-sustenna-kidney-change",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Has a clinician told you that you have a new or worsening kidney problem, or that you are now receiving dialysis?",
        staffInterpretation:
          "If Yes or Need to discuss: verify renal status and the active product-specific plan with a clinician before administration.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfUn profesional le ha dicho que tiene un problema renal nuevo o que ha empeorado, o que ahora recibe di\u00e1lisis?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el estado renal y el plan activo espec\u00edfico del producto con un profesional antes de administrar.",
      },
    ),
  ),
  productLabelRule(
    "erzofri",
    "medication-erzofri-kidney-change",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Has a clinician told you that you have a new or worsening kidney problem, or that you are now receiving dialysis?",
        staffInterpretation:
          "If Yes or Need to discuss: verify renal status and the active product-specific plan with a clinician before administration.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfUn profesional le ha dicho que tiene un problema renal nuevo o que ha empeorado, o que ahora recibe di\u00e1lisis?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el estado renal y el plan activo espec\u00edfico del producto con un profesional antes de administrar.",
      },
    ),
  ),
  productLabelRule(
    "trinza",
    "medication-trinza-transition-change",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Has this become a start, restart, or change from another long-acting injection since you last discussed the plan?",
        staffInterpretation:
          "If Yes or Need to discuss: verify the active stabilization, transition, or restart plan against current product guidance.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfEste tratamiento se ha convertido en un inicio, reinicio o cambio desde otra inyecci\u00f3n de acci\u00f3n prolongada desde que habl\u00f3 del plan por \u00faltima vez?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el plan activo de estabilizaci\u00f3n, transici\u00f3n o reinicio con la gu\u00eda actual del producto.",
      },
    ),
  ),
  productLabelRule(
    "hafyera",
    "medication-hafyera-transition-change",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Has this become a start, restart, or change from another long-acting injection since you last discussed the plan?",
        staffInterpretation:
          "If Yes or Need to discuss: verify the active stabilization, transition, or restart plan against current product guidance.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfEste tratamiento se ha convertido en un inicio, reinicio o cambio desde otra inyecci\u00f3n de acci\u00f3n prolongada desde que habl\u00f3 del plan por \u00faltima vez?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el plan activo de estabilizaci\u00f3n, transici\u00f3n o reinicio con la gu\u00eda actual del producto.",
      },
    ),
  ),
  productLabelRule(
    "uzedy",
    "medication-uzedy-injection-site-reaction",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Since your last UZEDY injection, have you had a painful, spreading, open, or otherwise concerning injection-site reaction, such as a lump, itching, redness, or swelling?",
        staffInterpretation:
          "If Yes or Need to discuss: have authorized staff review the injection site and route concerning or severe findings to a clinician.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n de UZEDY, \u00bfha tenido una reacci\u00f3n dolorosa, que se extiende, abierta o preocupante en el sitio de inyecci\u00f3n, como un bulto, picaz\u00f3n, enrojecimiento o hinchaz\u00f3n?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: haga que personal autorizado revise el sitio de inyecci\u00f3n y dirija los hallazgos preocupantes o graves a un profesional cl\u00ednico.",
      },
    ),
  ),
  productLabelRule(
    "maintena",
    "medication-maintena-compulsive-urges",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Have you noticed a new or hard-to-control urge to gamble, spend money, eat or binge eat, have sex, or do another impulsive behavior?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for review of possible aripiprazole-related compulsive or impulsive behavior.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfHa notado un impulso nuevo o dif\u00edcil de controlar para apostar, gastar dinero, comer o darse atracones, tener relaciones sexuales u otro comportamiento impulsivo?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija al paciente al profesional cl\u00ednico para revisar una posible conducta compulsiva o impulsiva relacionada con aripiprazol.",
      },
    ),
  ),
  productLabelRule(
    "asimtufii",
    "medication-asimtufii-compulsive-urges",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Have you noticed a new or hard-to-control urge to gamble, spend money, eat or binge eat, have sex, or do another impulsive behavior?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for review of possible aripiprazole-related compulsive or impulsive behavior.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfHa notado un impulso nuevo o dif\u00edcil de controlar para apostar, gastar dinero, comer o darse atracones, tener relaciones sexuales u otro comportamiento impulsivo?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija al paciente al profesional cl\u00ednico para revisar una posible conducta compulsiva o impulsiva relacionada con aripiprazol.",
      },
    ),
  ),
  productLabelRule(
    "vivitrol",
    "medication-vivitrol-opioid-exposure",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Before this VIVITROL dose, have you used any opioid, including prescription pain medicine, cough, cold, or diarrhea medicine, street opioids, buprenorphine, or methadone?",
        staffInterpretation:
          "If Yes or Need to discuss: do not treat the response as clearance. Route to the clinician for active opioid-risk and order review before administration.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "Antes de esta dosis de VIVITROL, \u00bfha usado alg\u00fan opioide, incluidos medicamentos recetados para el dolor, medicamentos para tos, resfriado o diarrea, opioides de la calle, buprenorfina o metadona?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: no use la respuesta como autorizaci\u00f3n. Dirija al paciente al profesional cl\u00ednico para revisar el riesgo actual de opioides y la orden antes de administrar.",
      },
    ),
  ),
  productLabelRule(
    "vivitrol",
    "medication-vivitrol-withdrawal-symptoms",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Do you have symptoms that might be opioid withdrawal, such as sweating, runny nose, goose bumps, shakiness, nausea, vomiting, diarrhea, or stomach cramps?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for prompt opioid-withdrawal and active-plan review before administration.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfTiene s\u00edntomas que puedan ser abstinencia de opioides, como sudoraci\u00f3n, secreci\u00f3n nasal, piel de gallina, temblores, n\u00e1useas, v\u00f3mitos, diarrea o c\u00f3licos estomacales?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija al paciente al profesional cl\u00ednico para una revisi\u00f3n r\u00e1pida de abstinencia de opioides y del plan activo antes de administrar.",
      },
    ),
  ),
  productLabelRule(
    "vivitrol",
    "medication-vivitrol-liver-symptoms",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Have you had yellowing of the skin or eyes, dark urine, new severe stomach pain, or another symptom that makes you worried about your liver?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for liver-symptom review and active-plan direction.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfHa tenido color amarillo en la piel o los ojos, orina oscura, dolor abdominal intenso nuevo u otro s\u00edntoma que le preocupe sobre el h\u00edgado?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija al paciente al profesional cl\u00ednico para revisar los s\u00edntomas hep\u00e1ticos y recibir indicaciones sobre el plan activo.",
      },
    ),
  ),
  productLabelRule(
    "vivitrol",
    "medication-vivitrol-mood-or-self-harm",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Have you had new or worse depression, or thoughts of harming yourself, that you want the care team to know about today?",
        staffInterpretation:
          "If Yes or Need to discuss: route immediately to the clinician or the clinic's urgent safety process; do not rely on this paper form alone.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "\u00bfHa tenido depresi\u00f3n nueva o peor, o pensamientos de hacerse da\u00f1o, que quiera comunicar al equipo de atenci\u00f3n hoy?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija de inmediato al profesional cl\u00ednico o al proceso urgente de seguridad de la cl\u00ednica; no se base solo en este formulario en papel.",
      },
    ),
  ),
  productLabelRule(
    "vivitrol",
    "medication-vivitrol-injection-site-reaction",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Since your last VIVITROL injection, have you had increasing pain, swelling, redness, warmth, a lump, an open wound, or drainage at the injection site?",
        staffInterpretation:
          "If Yes or Need to discuss: have authorized staff review the site and route concerning or severe findings to a clinician promptly.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n de VIVITROL, \u00bfha tenido aumento de dolor, hinchaz\u00f3n, enrojecimiento, calor, un bulto, una herida abierta o drenaje en el sitio de inyecci\u00f3n?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: haga que personal autorizado revise el sitio y dirija de inmediato los hallazgos preocupantes o graves a un profesional cl\u00ednico.",
      },
    ),
  ),
  productLabelRule(
    "haldol",
    "medication-haldol-cardiac-or-movement-symptoms",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Since your last HALDOL DECANOATE injection, have you had fainting, a racing or irregular heartbeat, chest discomfort, or new uncontrolled movements?",
        staffInterpretation:
          "If Yes or Need to discuss: route promptly to a clinician for cardiac-risk and movement-symptom review before administration.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "Desde su \u00faltima inyecci\u00f3n de HALDOL DECANOATE, \u00bfha tenido desmayos, latidos cardiacos r\u00e1pidos o irregulares, molestia en el pecho o movimientos nuevos incontrolables?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija de inmediato al profesional cl\u00ednico para revisar el riesgo cardiaco y los s\u00edntomas de movimiento antes de administrar.",
      },
    ),
  ),
  productLabelRule(
    "prolixin",
    "medication-prolixin-movement-or-nms-symptoms",
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Medication-specific check-in",
        prompt:
          "Since your last PROLIXIN DECANOATE dose, have you had new or worsening uncontrolled movements, fever with severe stiffness or confusion, or a fast or irregular heartbeat?",
        staffInterpretation:
          "If Yes or Need to discuss: route promptly to a clinician for movement, neuroleptic-malignant-syndrome, and cardiac-symptom review.",
      },
      {
        sectionTitle: "Control espec\u00edfico del medicamento",
        prompt:
          "Desde su \u00faltima dosis de PROLIXIN DECANOATE, \u00bfha tenido movimientos incontrolables nuevos o peores, fiebre con rigidez intensa o confusi\u00f3n, o latidos cardiacos r\u00e1pidos o irregulares?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: dirija de inmediato al profesional cl\u00ednico para revisar s\u00edntomas de movimiento, s\u00edndrome neurol\u00e9ptico maligno y s\u00edntomas cardiacos.",
      },
    ),
  ),
];

const aripiprazoleStartPlanRules = (["aristada", "maintena", "asimtufii"] as const).map(
  (medicationKey) =>
    productLabelRule(
      medicationKey,
      `phase-${medicationKey}-start-or-restart-plan`,
      "additional",
      bilingualCopy(
        {
          sectionTitle: "Additional medication review",
          prompt:
            "If this is a start or restart, is there anything about the active oral or one-day initiation plan that you still need to review with a clinician or staff member today?",
          staffInterpretation:
            "If Yes or Need to discuss: verify the active initiation or re-initiation pathway against the product label and the current order.",
        },
        {
          sectionTitle: "Revisi\u00f3n adicional del medicamento",
          prompt:
            "Si este es un inicio o reinicio, \u00bfhay algo sobre el plan activo de inicio oral o de un d\u00eda que todav\u00eda necesite revisar con un profesional cl\u00ednico o miembro del personal hoy?",
          staffInterpretation:
            "Si responde S\u00ed o Necesito hablarlo: verifique la v\u00eda activa de inicio o reinicio con la etiqueta del producto y la orden actual.",
        },
      ),
      { phases: ["initiation", "reinitiation"] },
    ),
);

const paliperidoneStartPlanRules = (["sustenna", "erzofri"] as const).map((medicationKey) =>
  productLabelRule(
    medicationKey,
    `phase-${medicationKey}-start-or-restart-plan`,
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Additional medication review",
        prompt:
          "If this is a start or restart, is there anything about the product-specific start or restart plan that you still need to review with a clinician or staff member today?",
        staffInterpretation:
          "If Yes or Need to discuss: verify the active initiation or re-initiation pathway and any tolerability requirements with authorized staff.",
      },
      {
        sectionTitle: "Revisi\u00f3n adicional del medicamento",
        prompt:
          "Si este es un inicio o reinicio, \u00bfhay algo sobre el plan espec\u00edfico de inicio o reinicio que todav\u00eda necesite revisar con un profesional cl\u00ednico o miembro del personal hoy?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique la v\u00eda activa de inicio o reinicio y cualquier requisito de tolerabilidad con personal autorizado.",
      },
    ),
    { phases: ["initiation", "reinitiation"] },
  ),
);

const longerIntervalStartPlanRules = (["trinza", "hafyera"] as const).map((medicationKey) =>
  productLabelRule(
    medicationKey,
    `phase-${medicationKey}-transition-plan`,
    "additional",
    bilingualCopy(
      {
        sectionTitle: "Additional medication review",
        prompt:
          "If this is a start or restart, is there anything about the stabilization or transition plan for this longer-interval medication that you still need to review with a clinician or staff member today?",
        staffInterpretation:
          "If Yes or Need to discuss: verify the active stabilization, transition, or restart plan against current product guidance and the active order.",
      },
      {
        sectionTitle: "Revisi\u00f3n adicional del medicamento",
        prompt:
          "Si este es un inicio o reinicio, \u00bfhay algo sobre el plan de estabilizaci\u00f3n o transici\u00f3n para este medicamento de intervalo m\u00e1s largo que todav\u00eda necesite revisar con un profesional cl\u00ednico o miembro del personal hoy?",
        staffInterpretation:
          "Si responde S\u00ed o Necesito hablarlo: verifique el plan activo de estabilizaci\u00f3n, transici\u00f3n o reinicio con la gu\u00eda actual del producto y la orden activa.",
      },
    ),
    { phases: ["initiation", "reinitiation"] },
  ),
);

const uzedyStartPlanRule = productLabelRule(
  "uzedy",
  "phase-uzedy-start-or-restart-plan",
  "additional",
  bilingualCopy(
    {
      sectionTitle: "Additional medication review",
      prompt:
        "If this is a start, restart, or schedule change, is there anything about the active UZEDY plan that you still need to review with a clinician or staff member today?",
      staffInterpretation:
        "If Yes or Need to discuss: verify the active start, restart, or schedule-change plan against the current order and product guidance.",
    },
    {
      sectionTitle: "Revisi\u00f3n adicional del medicamento",
      prompt:
        "Si este es un inicio, reinicio o cambio de horario, \u00bfhay algo sobre el plan activo de UZEDY que todav\u00eda necesite revisar con un profesional cl\u00ednico o miembro del personal hoy?",
      staffInterpretation:
        "Si responde S\u00ed o Necesito hablarlo: verifique el plan activo de inicio, reinicio o cambio de horario con la orden actual y la gu\u00eda del producto.",
    },
  ),
  { phases: ["initiation", "reinitiation"] },
);

const initiationLikePhases: readonly InjectionClinicalPhase[] = [
  "initiation",
  "reinitiation",
  "loading",
];

/**
 * These label-informed discussion prompts supplement the clinic-approved
 * informed-consent acknowledgement for a new or restarted treatment. They
 * support, but never replace, the clinician's medication-specific discussion.
 */
const initiationConsentRules: InjectionPatientScreenRule[] = [
  clinicApprovedRule(
    "consent-initiation-discussion-request",
    "consent",
    bilingualCopy(
      {
        sectionTitle: "Consent discussion",
        prompt:
          "Before you decide, do you need a clinician to review why this medication is being started or restarted, expected benefits, important risks, reasonable alternatives (including no treatment), and your right to ask questions or decline today?",
        staffInterpretation:
          "If Yes or Not sure: arrange the requested clinician discussion. A No response never completes consent; use only clinic-approved consent language and process.",
      },
      {
        sectionTitle: "Conversaci\u00f3n de consentimiento",
        prompt:
          "Antes de decidir, \u00bfnecesita que un profesional cl\u00ednico revise por qu\u00e9 se inicia o reinicia este medicamento, beneficios esperados, riesgos importantes, alternativas razonables (incluido no recibir tratamiento) y su derecho a hacer preguntas o rechazarlo hoy?",
        staffInterpretation:
          "Si responde S\u00ed o No estoy seguro/a: organice la conversaci\u00f3n cl\u00ednica solicitada. Una respuesta No nunca completa el consentimiento; use solamente el texto y proceso de consentimiento aprobados por la cl\u00ednica.",
      },
    ),
    { medicationKeys, phases: initiationLikePhases },
  ),
  ...antipsychoticMedicationKeys.map((medicationKey) =>
    productLabelRule(
      medicationKey,
      `consent-${medicationKey}-antipsychotic-safety-review`,
      "consent",
      bilingualCopy(
        {
          sectionTitle: "Consent discussion",
          prompt:
            "Before deciding about this start or restart, would you like a clinician to review possible sleepiness or dizziness, falls or fainting, weight or blood-sugar changes, movement symptoms, fever with severe stiffness or confusion, and what to report after treatment?",
          staffInterpretation:
            "If Yes or Need to discuss: route to the clinician for a medication-specific risk discussion. Do not substitute this checklist for approved informed-consent language.",
        },
        {
          sectionTitle: "Conversacion de consentimiento",
          prompt:
            "Antes de decidir sobre este inicio o reinicio, \u00bfdesea que un profesional clinico revise posible sueno o mareo, caidas o desmayos, cambios de peso o azucar en la sangre, sintomas de movimiento, fiebre con rigidez intensa o confusion, y que informar despues del tratamiento?",
          staffInterpretation:
            "Si responde Si o Necesito hablarlo: dirija al paciente al profesional clinico para una conversacion sobre riesgos especificos del medicamento. No sustituya el texto de consentimiento informado aprobado por esta lista.",
        },
      ),
      { phases: initiationLikePhases },
    ),
  ),
  ...(["aristada", "initio", "maintena", "asimtufii"] as const).map((medicationKey) =>
    productLabelRule(
      medicationKey,
      `consent-${medicationKey}-compulsive-urges-review`,
      "consent",
      bilingualCopy(
        {
          sectionTitle: "Consent discussion",
          prompt:
            "Would you like a clinician to specifically review the possibility of new or hard-to-control urges, such as gambling, spending money, eating or binge eating, sexual urges, or other impulsive behavior?",
          staffInterpretation:
            "If Yes or Need to discuss: include aripiprazole-related compulsive or impulsive behavior in the clinician's medication-specific discussion.",
        },
        {
          sectionTitle: "Conversacion de consentimiento",
          prompt:
            "\u00bfDesea que un profesional clinico revise especificamente la posibilidad de impulsos nuevos o dificiles de controlar, como apostar, gastar dinero, comer o darse atracones, impulsos sexuales u otro comportamiento impulsivo?",
          staffInterpretation:
            "Si responde Si o Necesito hablarlo: incluya conducta compulsiva o impulsiva relacionada con aripiprazol en la conversacion clinica especifica del medicamento.",
        },
      ),
      { phases: initiationLikePhases },
    ),
  ),
  ...(["sustenna", "erzofri", "trinza", "hafyera"] as const).map((medicationKey) =>
    productLabelRule(
      medicationKey,
      `consent-${medicationKey}-paliperidone-plan-review`,
      "consent",
      bilingualCopy(
        {
          sectionTitle: "Consent discussion",
          prompt:
            "Would you like a clinician to review the product-specific start, restart, stabilization, or transition plan, including movement symptoms, dizziness or fainting, metabolic changes, and any kidney-related considerations?",
          staffInterpretation:
            "If Yes or Need to discuss: route to a clinician for the relevant paliperidone product discussion and active-plan verification.",
        },
        {
          sectionTitle: "Conversacion de consentimiento",
          prompt:
            "\u00bfDesea que un profesional clinico revise el plan especifico de inicio, reinicio, estabilizacion o transicion del producto, incluidos sintomas de movimiento, mareo o desmayo, cambios metabolicos y consideraciones relacionadas con los rinones?",
          staffInterpretation:
            "Si responde Si o Necesito hablarlo: dirija al paciente a un profesional clinico para la conversacion correspondiente sobre el producto de paliperidona y la verificacion del plan activo.",
        },
      ),
      { phases: initiationLikePhases },
    ),
  ),
  productLabelRule(
    "uzedy",
    "consent-uzedy-detailed-review",
    "consent",
    bilingualCopy(
      {
        sectionTitle: "Consent discussion",
        prompt:
          "Would you like a clinician to review the UZEDY schedule and injection sites, possible injection-site lumps or itching, movement and metabolic changes, and pregnancy or breastfeeding considerations that may apply to you?",
        staffInterpretation:
          "If Yes or Need to discuss: route to a clinician for the UZEDY-specific discussion and active-plan verification.",
      },
      {
        sectionTitle: "Conversacion de consentimiento",
        prompt:
          "\u00bfDesea que un profesional clinico revise el horario y los sitios de inyeccion de UZEDY, posibles bultos o picazon en el sitio de inyeccion, cambios de movimiento y metabolicos, y consideraciones de embarazo o lactancia que se le puedan aplicar?",
        staffInterpretation:
          "Si responde Si o Necesito hablarlo: dirija al paciente a un profesional clinico para la conversacion especifica de UZEDY y la verificacion del plan activo.",
      },
    ),
    { phases: initiationLikePhases },
  ),
  productLabelRule(
    "vivitrol",
    "consent-vivitrol-detailed-review",
    "consent",
    bilingualCopy(
      {
        sectionTitle: "Consent discussion",
        prompt:
          "Would you like a clinician to review the opioid-free requirement, sudden withdrawal risk, reduced opioid tolerance and overdose risk, serious injection-site reactions, liver symptoms, depression or suicidal thoughts, and what to do if pain treatment is needed?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for a VIVITROL-specific discussion and active opioid-risk review before administration.",
      },
      {
        sectionTitle: "Conversacion de consentimiento",
        prompt:
          "\u00bfDesea que un profesional clinico revise el requisito de no usar opioides, el riesgo de abstinencia repentina, menor tolerancia a opioides y riesgo de sobredosis, reacciones graves en el sitio de inyeccion, sintomas hepaticos, depresion o pensamientos suicidas, y que hacer si se necesita tratamiento para el dolor?",
        staffInterpretation:
          "Si responde Si o Necesito hablarlo: dirija al paciente al profesional clinico para una conversacion especifica de VIVITROL y una revision activa del riesgo de opioides antes de administrar.",
      },
    ),
    { phases: initiationLikePhases },
  ),
  productLabelRule(
    "haldol",
    "consent-haldol-detailed-review",
    "consent",
    bilingualCopy(
      {
        sectionTitle: "Consent discussion",
        prompt:
          "Would you like a clinician to review heart-rhythm symptoms such as fainting or palpitations, movement symptoms, fever with severe stiffness or confusion, and what to report after HALDOL DECANOATE?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for a HALDOL DECANOATE-specific risk discussion and active-plan review.",
        },
      {
        sectionTitle: "Conversacion de consentimiento",
        prompt:
          "\u00bfDesea que un profesional clinico revise sintomas de ritmo cardiaco como desmayos o palpitaciones, sintomas de movimiento, fiebre con rigidez intensa o confusion, y que informar despues de HALDOL DECANOATE?",
        staffInterpretation:
          "Si responde Si o Necesito hablarlo: dirija al paciente al profesional clinico para una conversacion de riesgos especifica de HALDOL DECANOATE y revision del plan activo.",
      },
    ),
    { phases: initiationLikePhases },
  ),
  productLabelRule(
    "prolixin",
    "consent-prolixin-detailed-review",
    "consent",
    bilingualCopy(
      {
        sectionTitle: "Consent discussion",
        prompt:
          "Would you like a clinician to review possible uncontrolled movements, fever with severe stiffness or confusion, blood-pressure or heart symptoms, and what to report after PROLIXIN DECANOATE?",
        staffInterpretation:
          "If Yes or Need to discuss: route to the clinician for a PROLIXIN DECANOATE-specific risk discussion and active-plan review.",
      },
      {
        sectionTitle: "Conversacion de consentimiento",
        prompt:
          "\u00bfDesea que un profesional clinico revise posibles movimientos incontrolables, fiebre con rigidez intensa o confusion, sintomas de presion arterial o cardiacos, y que informar despues de PROLIXIN DECANOATE?",
        staffInterpretation:
          "Si responde Si o Necesito hablarlo: dirija al paciente al profesional clinico para una conversacion de riesgos especifica de PROLIXIN DECANOATE y revision del plan activo.",
      },
    ),
    { phases: initiationLikePhases },
  ),
];

const conditionalRules: InjectionPatientScreenRule[] = medicationKeys.flatMap((medicationKey) => {
  const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey];
  return (reference.conditionalRequirements ?? []).map((requirement) =>
    productLabelRule(
      medicationKey,
      `conditional-${medicationKey}-${requirement.id}`,
      "additional",
      bilingualCopy(
        {
          sectionTitle: "Additional medication review",
          prompt:
            "The selected dose or treatment phase needs an additional plan review. Is anything about the plan shown above different from what you and your clinician discussed?",
          staffInterpretation:
            "Review the selected dose and phase against the active order and current product-specific plan. This paper response never overrides existing validation.",
        },
        {
          sectionTitle: "Revisi\u00f3n adicional del medicamento",
          prompt:
            "La dosis o fase de tratamiento seleccionada necesita una revisi\u00f3n adicional del plan. \u00bfHay algo sobre el plan indicado arriba que sea diferente de lo que habl\u00f3 con su profesional cl\u00ednico?",
          staffInterpretation:
            "Revise la dosis y fase seleccionadas con la orden activa y el plan actual espec\u00edfico del producto. Esta respuesta en papel nunca reemplaza la validaci\u00f3n existente.",
        },
      ),
      {
        ...(requirement.doses?.length ? { doses: requirement.doses } : {}),
        ...(requirement.phases?.length ? { phases: requirement.phases } : {}),
      },
    ),
  );
});

const otherMedicationRule: InjectionPatientScreenRule = clinicApprovedRule(
  "other-medication-approved-form-required",
  "additional",
  bilingualCopy(
    {
      sectionTitle: "Medication-specific form required",
      prompt:
        "No product-specific screening or consent content is available for a medication entered as Other. Staff must use the clinic-approved medication-specific form before using this universal form for clinical screening or consent.",
      staffInterpretation:
        "Do not use this universal form as product-specific clinical screening or consent. Obtain the approved external form and follow the active order.",
    },
    {
      sectionTitle: "Se requiere un formulario espec\u00edfico del medicamento",
      prompt:
        "No hay contenido espec\u00edfico de evaluaci\u00f3n o consentimiento para un medicamento registrado como Otro. El personal debe usar el formulario espec\u00edfico del medicamento aprobado por la cl\u00ednica antes de usar este formulario universal para evaluaci\u00f3n cl\u00ednica o consentimiento.",
      staffInterpretation:
        "No use este formulario universal como evaluaci\u00f3n cl\u00ednica o consentimiento espec\u00edfico del producto. Obtenga el formulario externo aprobado y siga la orden activa.",
    },
  ),
  { medicationKeys: ["other"] },
);

/**
 * Explicit bilingual content inventory. Every rule contains its source,
 * revision, response pattern, and staff interpretation. No runtime
 * translation or external lookup is used.
 */
export const INJECTION_PATIENT_SCREEN_RULES: readonly InjectionPatientScreenRule[] = [
  ...universalRules,
  ...antipsychoticSafetyRules,
  ...productSpecificRules,
  ...aripiprazoleStartPlanRules,
  ...paliperidoneStartPlanRules,
  ...longerIntervalStartPlanRules,
  uzedyStartPlanRule,
  ...initiationConsentRules,
  ...conditionalRules,
  otherMedicationRule,
];

const labelsFor = (language: PatientScreenLanguage): InjectionPatientScreenLabels =>
  language === "es"
    ? {
        title: "EVALUACI\u00d3N PREVIA A LA INYECCI\u00d3N Y CONSENTIMIENTO",
        subtitle: "Formulario en papel de evaluaci\u00f3n y consentimiento del paciente",
        workstation: "IPMG MA WORKSTATION / COPIA DE CL\u00cdNICA",
        formLabel: "FORMULARIO DEL PACIENTE",
        orderInformation: "PACIENTE / INFORMACI\u00d3N DE LA ORDEN",
        patientCheckIn: "DESDE SU \u00daLTIMA INYECCI\u00d3N",
        responseInstruction:
          "MARQUE UNA RESPUESTA PARA CADA PREGUNTA. SI NO EST\u00c1 SEGURO/A, MARQUE NO ESTOY SEGURO/A. UNA RESPUESTA S\u00cd O NO ESTOY SEGURO/A SIGNIFICA QUE EL PERSONAL LA REVISAR\u00c1; POR S\u00cd SOLA NO DECIDE SI SE ADMINISTRA EL TRATAMIENTO.",
        staffResponseNote:
          "Una respuesta S\u00cd o No estoy seguro/a requiere revisi\u00f3n del personal. No aprueba ni suspende la inyecci\u00f3n por s\u00ed sola.",
        patient: "Paciente",
        dateOfBirth: "Fecha de nacimiento",
        medication: "Medicamento",
        dose: "Dosis",
        route: "V\u00eda",
        schedule: "Horario",
        phase: "Fase",
        date: "Fecha",
        yes: "S\u00ed",
        no: "No",
        notSure: "No estoy seguro/a",
        consentTitle: "CONSENTIMIENTO INFORMADO",
        consentBody:
          "He tenido la oportunidad de hablar sobre el motivo del medicamento, los beneficios esperados, los riesgos y efectos secundarios importantes, las alternativas razonables (incluido no recibir tratamiento) y la dosis, v\u00eda y horario planificados. Tuve la oportunidad de hacer preguntas y recib\u00ed respuestas que entiendo. Puedo rechazar o posponer el tratamiento hoy. Acepto voluntariamente recibir el medicamento descrito arriba.",
        patientSignature: "Firma del paciente / representante legal",
        patientDate: "Fecha",
        staffReviewer: "Firma del revisor del personal",
        staffDate: "Fecha",
        followUp: "SEGUIMIENTO / ACCI\u00d3N DEL PERSONAL",
        source: "Fuente de referencia del producto",
        noProductSource: "No hay fuente de producto para un medicamento registrado como Otro.",
      }
    : {
        title: "PRE-INJECTION SCREENING & CONSENT",
        subtitle: "Patient screening and consent paper form",
        workstation: "IPMG MA WORKSTATION / CLINIC COPY",
        formLabel: "PATIENT FORM",
        orderInformation: "PATIENT / ORDER INFORMATION",
        patientCheckIn: "SINCE YOUR LAST INJECTION",
        responseInstruction:
          "MARK ONE RESPONSE FOR EACH QUESTION. IF YOU ARE UNSURE, MARK NOT SURE. A YES OR NOT SURE ANSWER MEANS STAFF WILL REVIEW IT; IT DOES NOT BY ITSELF DECIDE WHETHER TREATMENT IS GIVEN.",
        staffResponseNote:
          "A Yes or Not sure response requires staff review. It does not independently approve or stop the injection.",
        patient: "Patient",
        dateOfBirth: "Date of birth",
        medication: "Medication",
        dose: "Dose",
        route: "Route",
        schedule: "Schedule",
        phase: "Phase",
        date: "Date",
        yes: "Yes",
        no: "No",
        notSure: "Not sure",
        consentTitle: "INFORMED CONSENT",
        consentBody:
          "I have had the opportunity to discuss the reason for the medication, expected benefits, important risks and side effects, reasonable alternatives (including no treatment), and the planned dose, route, and schedule. I had an opportunity to ask questions and received answers I understand. I may decline or postpone treatment today. I voluntarily agree to receive the medication described above.",
        patientSignature: "Patient / legal representative signature",
        patientDate: "Date",
        staffReviewer: "Staff reviewer signature",
        staffDate: "Date",
        followUp: "STAFF FOLLOW-UP / ACTION",
        source: "Product reference source",
        noProductSource: "No product source is available for a medication entered as Other.",
      };

const phaseLabels: Record<PatientScreenLanguage, Record<InjectionClinicalPhase, string>> = {
  en: {
    maintenance: "Maintenance",
    initiation: "Initiation",
    reinitiation: "Re-initiation",
    loading: "Loading",
    prn: "PRN / ordered",
  },
  es: {
    maintenance: "Mantenimiento",
    initiation: "Inicio",
    reinitiation: "Reinicio",
    loading: "Carga",
    prn: "PRN / seg\u00fan orden",
  },
};

const blank = (value: string | undefined): string => value?.trim() || "________________";

const matchesRule = (
  rule: InjectionPatientScreenRule,
  encounter: InjectionEncounter,
  phase: InjectionClinicalPhase,
): boolean => {
  const selector = rule.selector;
  const medicationKey = encounter.medicationKey;
  if (selector.medicationKeys?.length && !selector.medicationKeys.includes(medicationKey as InjectionMedicationKey)) {
    return false;
  }
  if (selector.doses?.length && !selector.doses.includes(encounter.dose.trim())) return false;
  if (selector.routes?.length && !selector.routes.includes(encounter.route.trim())) return false;
  if (
    selector.intervalKeys?.length &&
    (!encounter.intervalKey || !selector.intervalKeys.includes(encounter.intervalKey))
  ) {
    return false;
  }
  return !(selector.phases?.length && !selector.phases.includes(phase));
};

/** A catalog item needs an exact dose; Other intentionally permits a universal form. */
export const canBuildInjectionPatientScreenDocument = (encounter: InjectionEncounter): boolean =>
  Boolean(encounter.medicationKey && (encounter.medicationKey === "other" || encounter.dose.trim()));

const sectionOrder: readonly InjectionPatientScreenSectionKind[] = [
  "plan",
  "screening",
  "additional",
  "consent",
];

export const buildInjectionPatientScreenDocument = (
  encounter: InjectionEncounter,
  language: PatientScreenLanguage,
): InjectionPatientScreenDocument => {
  const labels = labelsFor(language);
  const phase = injectionClinicalPhaseForReason(encounter.reason);
  const medicationKey = encounter.medicationKey;
  const showsConsent = medicationKey !== "other" && initiationLikePhases.includes(phase);
  const reference =
    medicationKey && medicationKey !== "other"
      ? INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey]
      : undefined;
  const medication = (reference?.catalog.label ?? encounter.customMedication?.trim()) || "Other";
  const sections = new Map<InjectionPatientScreenSectionKind, InjectionPatientScreenSection>();

  for (const rule of INJECTION_PATIENT_SCREEN_RULES) {
    if (!matchesRule(rule, encounter, phase)) continue;
    const copy = rule.copy[language];
    const section = sections.get(rule.section) ?? {
      id: rule.section,
      title: copy.sectionTitle,
      items: [],
    };
    section.items.push({
      id: rule.id,
      prompt: copy.prompt,
      responseType: rule.responseType,
      staffInterpretation: copy.staffInterpretation,
      provenance: rule.provenance,
      reviewStatus: rule.reviewStatus,
    });
    sections.set(rule.section, section);
  }

  return {
    language,
    reviewStatus: "approved",
    labels,
    metadata: {
      patientName: blank(encounter.patient.name),
      patientDob: blank(encounter.patient.dob),
      medication: blank(medication),
      dose: blank(encounter.dose),
      route: blank(encounter.route),
      interval: encounter.intervalKey ? injectionIntervalLabel(encounter.intervalKey) : "________________",
      phase: phaseLabels[language][phase],
      administrationDate: blank(encounter.administrationDate),
    },
    sections: sectionOrder.flatMap((sectionId) => {
      const section = sections.get(sectionId);
      return section ? [section] : [];
    }),
    showsConsent,
    ...(reference ? { source: reference.source } : {}),
    hasProductSpecificContent: Boolean(reference),
  };
};
