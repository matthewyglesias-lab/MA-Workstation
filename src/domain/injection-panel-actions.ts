import {
  INJECTION_MEDICATIONS,
  preferredIntervalForDose,
  type InjectionIntervalKey,
  type InjectionMedicationKey,
} from "./injection-catalog";
import { emptyInjectionInitiation, type InjectionAdministrationDetails, type InjectionEncounter } from "./injection";
import type { InjectionDocumentationMetadata } from "./injection-ndc";

export interface InjectionFieldChangePatch {
  encounter: Partial<InjectionEncounter>;
  details: Partial<InjectionAdministrationDetails & InjectionDocumentationMetadata>;
  /** True when this change overwrites a real prior selection, not a first-ever pick. */
  invalidated: boolean;
}

export function medicationChangePatch(
  encounter: InjectionEncounter,
  key: InjectionMedicationKey | "",
): InjectionFieldChangePatch {
  const catalogMedication = key && key !== "other" ? INJECTION_MEDICATIONS[key] : null;
  const defaultDose =
    catalogMedication?.doses.length === 1 ? (catalogMedication.doses[0] ?? "") : "";
  const defaultIntervalKey =
    catalogMedication && defaultDose
      ? preferredIntervalForDose(catalogMedication, defaultDose, catalogMedication.intervalKey)
      : (catalogMedication?.intervalKey ?? "");
  return {
    invalidated: Boolean(encounter.medicationKey && encounter.medicationKey !== key),
    encounter: {
      medicationKey: key,
      customMedication: "",
      dose: defaultDose,
      site: "",
      route: catalogMedication?.route ?? "",
      intervalKey: defaultIntervalKey,
      nextDoseDate: "",
      traceability: { ...encounter.traceability, ndc: "" },
      verifications: {},
      initiation: emptyInjectionInitiation(),
    },
    details: {
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
        pairedSecond: undefined,
      },
      nextDose: undefined,
    },
  };
}

export function doseChangePatch(encounter: InjectionEncounter, dose: string): InjectionFieldChangePatch {
  const catalogMedication =
    encounter.medicationKey && encounter.medicationKey !== "other"
      ? INJECTION_MEDICATIONS[encounter.medicationKey]
      : null;
  return {
    invalidated: Boolean(encounter.dose && encounter.dose !== dose),
    encounter: {
      dose,
      intervalKey: catalogMedication
        ? preferredIntervalForDose(catalogMedication, dose, encounter.intervalKey)
        : encounter.intervalKey,
      traceability: { ...encounter.traceability, ndc: "" },
    },
    details: {
      ndcSelection: {
        ...(encounter.details?.ndcSelection ?? {}),
        primary: undefined,
      },
    },
  };
}

export function intervalChangePatch(intervalKey: InjectionIntervalKey | ""): Partial<InjectionEncounter> {
  return { intervalKey };
}
