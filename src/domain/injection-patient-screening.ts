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
 * This module deliberately models a paper-only draft. It never changes the
 * clinical evaluator or records a patient answer, signature, or consent.
 * Product labels are retained as source traceability for later clinical review;
 * they are not treated as approved patient-consent language.
 */
export type PatientScreenLanguage = "en" | "es";

export type InjectionPatientScreenReviewStatus = "draft";

export type InjectionPatientScreenSectionKind =
  | "screening"
  | "plan"
  | "additional";

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
}

export type InjectionPatientScreenRuleProvenance =
  | {
      kind: "product-label";
      source: ClinicalReferenceSource;
      labelRevision: string;
    }
  | {
      kind: "local-draft";
      labelRevision: string;
    };

export interface InjectionPatientScreenRule {
  id: string;
  section: InjectionPatientScreenSectionKind;
  selector: InjectionPatientScreenRuleSelector;
  copy: Record<PatientScreenLanguage, InjectionPatientScreenRuleCopy>;
  provenance: InjectionPatientScreenRuleProvenance;
  reviewStatus: InjectionPatientScreenReviewStatus;
}

export interface InjectionPatientScreenItem {
  id: string;
  prompt: string;
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
  draftMarker: string;
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
  discuss: string;
  details: string;
  consentPlaceholderTitle: string;
  consentPlaceholderBody: string;
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
  source?: ClinicalReferenceSource;
  hasProductSpecificContent: boolean;
}

const LOCAL_DRAFT_PROVENANCE: InjectionPatientScreenRuleProvenance = {
  kind: "local-draft",
  labelRevision: "Draft patient-screening framework; clinic approval pending",
};

const universalRules: InjectionPatientScreenRule[] = [
  {
    id: "universal-allergy-or-reaction",
    section: "screening",
    selector: {},
    copy: {
      en: {
        sectionTitle: "Patient check-in",
        prompt:
          "Do you have an allergy, reaction, or concern about a medicine or injection that you want to tell the care team about today?",
      },
      es: {
        sectionTitle: "Revisión con el paciente",
        prompt:
          "¿Tiene una alergia, reacción o inquietud sobre un medicamento o inyección que quiera comunicar al equipo de atención hoy?",
      },
    },
    provenance: LOCAL_DRAFT_PROVENANCE,
    reviewStatus: "draft",
  },
  {
    id: "universal-health-or-medication-change",
    section: "screening",
    selector: {},
    copy: {
      en: {
        sectionTitle: "Patient check-in",
        prompt:
          "Have there been changes in your health, medicines, or treatment plan that you want the care team to know about before this injection?",
      },
      es: {
        sectionTitle: "Revisión con el paciente",
        prompt:
          "¿Ha habido cambios en su salud, medicamentos o plan de tratamiento que quiera comunicar al equipo de atención antes de esta inyección?",
      },
    },
    provenance: LOCAL_DRAFT_PROVENANCE,
    reviewStatus: "draft",
  },
  {
    id: "universal-questions",
    section: "screening",
    selector: {},
    copy: {
      en: {
        sectionTitle: "Patient check-in",
        prompt:
          "Do you have questions or concerns that you would like to discuss with the care team before the injection?",
      },
      es: {
        sectionTitle: "Revisión con el paciente",
        prompt:
          "¿Tiene preguntas o inquietudes que quisiera hablar con el equipo de atención antes de la inyección?",
      },
    },
    provenance: LOCAL_DRAFT_PROVENANCE,
    reviewStatus: "draft",
  },
];

const medicationKeys = Object.keys(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications) as Array<
  Exclude<InjectionMedicationKey, "other">
>;

const medicationRules: InjectionPatientScreenRule[] = medicationKeys.map((medicationKey) => {
  const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey];
  return {
    id: `medication-${medicationKey}-plan-review`,
    section: "plan",
    selector: { medicationKeys: [medicationKey] },
    copy: {
      en: {
        sectionTitle: "Planned medication review",
        prompt:
          "Please verify that the medication, dose, route, and schedule shown above match what you expect today. Tell the care team before the injection if anything is different.",
      },
      es: {
        sectionTitle: "Revisión del medicamento planificado",
        prompt:
          "Verifique que el medicamento, la dosis, la vía y el horario indicados arriba coincidan con lo que espera hoy. Informe al equipo de atención antes de la inyección si algo es diferente.",
      },
    },
    provenance: {
      kind: "product-label",
      source: reference.source,
      labelRevision: reference.source.labelRevision,
    },
    reviewStatus: "draft",
  };
});

const conditionalRules: InjectionPatientScreenRule[] = medicationKeys.flatMap((medicationKey) => {
  const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[medicationKey];
  return (reference.conditionalRequirements ?? []).map((requirement) => ({
    id: `conditional-${medicationKey}-${requirement.id}`,
    section: "additional" as const,
    selector: {
      medicationKeys: [medicationKey],
      ...(requirement.doses?.length ? { doses: requirement.doses } : {}),
      ...(requirement.phases?.length ? { phases: requirement.phases } : {}),
    },
    copy: {
      en: {
        sectionTitle: "Additional planned-dose review",
        prompt:
          "An additional product-plan review applies to the dose or treatment phase selected today. Please tell staff if the plan or instructions differ from what you discussed with your clinician.",
      },
      es: {
        sectionTitle: "Revisión adicional de la dosis planificada",
        prompt:
          "Se aplica una revisión adicional del plan del producto a la dosis o fase de tratamiento seleccionada hoy. Informe al personal si el plan o las instrucciones difieren de lo que habló con su profesional clínico.",
      },
    },
    provenance: {
      kind: "product-label" as const,
      source: reference.source,
      labelRevision: reference.source.labelRevision,
    },
    reviewStatus: "draft" as const,
  }));
});

const otherMedicationRule: InjectionPatientScreenRule = {
  id: "other-medication-approved-form-required",
  section: "additional",
  selector: { medicationKeys: ["other"] },
  copy: {
    en: {
      sectionTitle: "Medication-specific form required",
      prompt:
        "No product-specific screening or consent content is available for a medication entered as Other. Staff must use the clinic-approved medication-specific form before relying on any screening or consent documentation.",
    },
    es: {
      sectionTitle: "Se requiere un formulario específico del medicamento",
      prompt:
        "No hay contenido específico de evaluación o consentimiento para un medicamento registrado como Otro. El personal debe usar el formulario específico del medicamento aprobado por la clínica antes de basarse en cualquier documentación de evaluación o consentimiento.",
    },
  },
  provenance: LOCAL_DRAFT_PROVENANCE,
  reviewStatus: "draft",
};

/**
 * Explicit bilingual content inventory. Future approved wording replaces the
 * draft strings here; no runtime translation or external lookup is used.
 */
export const INJECTION_PATIENT_SCREEN_RULES: readonly InjectionPatientScreenRule[] = [
  ...universalRules,
  ...medicationRules,
  ...conditionalRules,
  otherMedicationRule,
];

const labelsFor = (language: PatientScreenLanguage): InjectionPatientScreenLabels =>
  language === "es"
    ? {
        title: "Evaluación y consentimiento previos a la inyección",
        subtitle: "Formulario en papel para pacientes — prototipo en borrador solo para revisión",
        draftMarker: "BORRADOR — NO APTO PARA USO CLÍNICO",
        patient: "Paciente",
        dateOfBirth: "Fecha de nacimiento",
        medication: "Medicamento",
        dose: "Dosis",
        route: "Vía",
        schedule: "Horario",
        phase: "Fase",
        date: "Fecha",
        yes: "Sí",
        no: "No",
        discuss: "Necesito hablarlo",
        details: "Detalles / comentarios",
        consentPlaceholderTitle: "Se requiere texto de consentimiento aprobado por la clínica",
        consentPlaceholderBody:
          "BORRADOR SOLAMENTE: este prototipo no documenta consentimiento. El texto clínico/legal aprobado y la traducción final al español deben reemplazar este recuadro antes del uso clínico.",
        patientSignature: "Firma del paciente",
        patientDate: "Fecha",
        staffReviewer: "Revisor/a del personal",
        staffDate: "Fecha",
        followUp: "Seguimiento o acción del personal",
        source: "Fuente de referencia del producto",
        noProductSource: "No hay fuente de producto para un medicamento registrado como Otro.",
      }
    : {
        title: "Pre-Injection Screening & Consent",
        subtitle: "Patient paper form — draft prototype for review only",
        draftMarker: "DRAFT — NOT FOR CLINICAL USE",
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
        discuss: "Need to discuss",
        details: "Details / comments",
        consentPlaceholderTitle: "Clinic-approved consent language required",
        consentPlaceholderBody:
          "DRAFT ONLY: this prototype does not document consent. Approved clinical/legal language and final Spanish translation must replace this box before clinical use.",
        patientSignature: "Patient signature",
        patientDate: "Date",
        staffReviewer: "Staff reviewer",
        staffDate: "Date",
        followUp: "Staff follow-up / action",
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
    prn: "PRN / según orden",
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
  Boolean(
    encounter.medicationKey &&
      (encounter.medicationKey === "other" || encounter.dose.trim()),
  );

export const buildInjectionPatientScreenDocument = (
  encounter: InjectionEncounter,
  language: PatientScreenLanguage,
): InjectionPatientScreenDocument => {
  const labels = labelsFor(language);
  const phase = injectionClinicalPhaseForReason(encounter.reason);
  const medicationKey = encounter.medicationKey;
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
      provenance: rule.provenance,
      reviewStatus: rule.reviewStatus,
    });
    sections.set(rule.section, section);
  }

  return {
    language,
    reviewStatus: "draft",
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
    sections: [...sections.values()],
    ...(reference ? { source: reference.source } : {}),
    hasProductSpecificContent: Boolean(reference),
  };
};
