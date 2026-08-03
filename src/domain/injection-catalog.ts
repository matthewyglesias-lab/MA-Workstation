import { addCalendarDays, addCalendarMonths } from "./dates";
import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  type InjectionCadence,
  type InjectionClinicalPhase,
  type InjectionMedicationClinicalReference,
  type InjectionSiteGuidance,
} from "./injection-clinical-reference";

export type InjectionIntervalKey =
  | "q1wk"
  | "q2wk"
  | "q3wk"
  | "q4wk"
  | "q6wk"
  | "q8wk"
  | "q12wk"
  | "q26wk"
  | "once";

export const INJECTION_INTERVAL_DAYS: Record<InjectionIntervalKey, number> = {
  q1wk: 7,
  q2wk: 14,
  q3wk: 21,
  q4wk: 28,
  q6wk: 42,
  q8wk: 56,
  q12wk: 84,
  q26wk: 182,
  once: 0,
};

export const INJECTION_INTERVAL_OPTIONS: ReadonlyArray<{
  key: InjectionIntervalKey;
  label: string;
}> = [
  { key: "q1wk", label: "q1 wk" },
  { key: "q2wk", label: "q2 wk" },
  { key: "q3wk", label: "q3 wk" },
  { key: "q4wk", label: "q4 wk" },
  { key: "q6wk", label: "q6 wk" },
  { key: "q8wk", label: "q8 wk" },
  { key: "q12wk", label: "q3 mo" },
  { key: "q26wk", label: "q6 mo" },
  { key: "once", label: "one-time" },
];

export const injectionIntervalLabel = (key: InjectionIntervalKey): string =>
  INJECTION_INTERVAL_OPTIONS.find((option) => option.key === key)?.label ?? key;

export const IM_SITES = [
  "R deltoid",
  "L deltoid",
  "R ventrogluteal",
  "L ventrogluteal",
  "R dorsogluteal",
  "L dorsogluteal",
] as const;

export const GLUTEAL_SITES = [
  "R ventrogluteal",
  "L ventrogluteal",
  "R dorsogluteal",
  "L dorsogluteal",
] as const;

export const SUBQ_SITES = [
  "Abdomen LUQ (SubQ)",
  "Abdomen RUQ (SubQ)",
  "Abdomen LLQ (SubQ)",
  "Abdomen RLQ (SubQ)",
  "R upper arm (SubQ)",
  "L upper arm (SubQ)",
] as const;

export const ALL_INJECTION_SITES = [...IM_SITES, ...SUBQ_SITES] as const;

export type InjectionMedicationKey =
  | "aristada"
  | "initio"
  | "sustenna"
  | "erzofri"
  | "trinza"
  | "hafyera"
  | "uzedy"
  | "maintena"
  | "asimtufii"
  | "vivitrol"
  | "haldol"
  | "prolixin"
  | "other";

export type MedicationVerificationKey =
  | "opioidFree"
  | "naltrexHS"
  | "suppliedNeedle"
  | "resuspend"
  | "invegaInit"
  | "oralOverlap"
  | "stabilized"
  | "paliperidoneTolerability"
  | "aripiprazoleTolerability"
  | "glutealOnly"
  | "noMassage"
  | "deepZtrack";

export interface AdministrationRule {
  routes: string[];
  sites: string[];
}

export interface InjectionMedication {
  key: InjectionMedicationKey;
  label: string;
  name: string;
  generic: string;
  route: string;
  defaultSite: string;
  intervalKey: InjectionIntervalKey;
  doses: string[];
  dosesByInterval?: Partial<Record<InjectionIntervalKey, string[]>>;
  windowBefore: number;
  windowAfter: number;
  windowsByInterval?: Partial<
    Record<InjectionIntervalKey, { windowBefore: number; windowAfter: number }>
  >;
  timingMode?: "orderVerify";
  verifications: MedicationVerificationKey[];
  verificationRequirements?: Partial<
    Record<InjectionClinicalPhase, MedicationVerificationKey[]>
  >;
  missedDoseGuidance: string;
  administrationRule: (dose: string) => AdministrationRule;
  cadenceByInterval?: Partial<Record<InjectionIntervalKey, InjectionCadence>>;
  /** Present for supported products; `other` intentionally has no reference. */
  clinicalReference?: InjectionMedicationClinicalReference;
}

const allIm = (): AdministrationRule => ({ routes: ["IM"], sites: [...IM_SITES] });
const gluteal = (): AdministrationRule => ({ routes: ["IM"], sites: [...GLUTEAL_SITES] });
const ruleForSiteGuidance = (
  siteGuidance: InjectionSiteGuidance,
  dose: string,
  allowedRoutes: string[],
): AdministrationRule => {
  switch (siteGuidance) {
    case "all-im":
      return allIm();
    case "gluteal-im":
      return gluteal();
    case "subq":
      return { routes: ["SubQ"], sites: [...SUBQ_SITES] };
    case "aristada-dose":
      return dose === "441 mg" ? allIm() : gluteal();
    case "erzofri-dose":
      return dose === "351 mg"
        ? { routes: ["IM"], sites: ["R deltoid", "L deltoid"] }
        : allIm();
    case "order-directed":
      // The label permits a route but does not name anatomical sites. An empty
      // list means "document the actual ordered site" rather than "any site is
      // a product-approved default". The evaluator still requires site text.
      return {
        routes: [...allowedRoutes],
        sites: [],
      };
  }
};

const buildMedication = (
  reference: InjectionMedicationClinicalReference,
): InjectionMedication => {
  const catalog = reference.catalog;
  return {
    key: reference.key,
    label: catalog.label,
    name: catalog.name,
    generic: catalog.generic,
    route: catalog.route,
    defaultSite: catalog.defaultSite,
    intervalKey: catalog.intervalKey,
    doses: [...catalog.doses],
    ...(catalog.dosesByInterval ? { dosesByInterval: catalog.dosesByInterval } : {}),
    windowBefore: catalog.windowBefore,
    windowAfter: catalog.windowAfter,
    ...(catalog.windowsByInterval ? { windowsByInterval: catalog.windowsByInterval } : {}),
    ...(catalog.timingMode ? { timingMode: catalog.timingMode } : {}),
    verifications: [...catalog.verifications],
    ...(catalog.verificationRequirements
      ? { verificationRequirements: catalog.verificationRequirements }
      : {}),
    missedDoseGuidance: catalog.missedDoseGuidance,
    ...(catalog.cadenceByInterval ? { cadenceByInterval: catalog.cadenceByInterval } : {}),
    administrationRule: (dose) =>
      ruleForSiteGuidance(catalog.siteGuidance, dose, catalog.allowedRoutes ?? [catalog.route]),
    clinicalReference: reference,
  };
};

const catalogedMedications = Object.fromEntries(
  Object.entries(INJECTION_CLINICAL_REFERENCE_BUNDLE.medications).map(([, reference]) => [
    reference.key,
    buildMedication(reference),
  ]),
) as Record<Exclude<InjectionMedicationKey, "other">, InjectionMedication>;

export const INJECTION_MEDICATIONS: Record<InjectionMedicationKey, InjectionMedication> = {
  ...catalogedMedications,
  other: {
    key: "other",
    label: "Other",
    name: "",
    generic: "",
    route: "IM",
    defaultSite: "",
    intervalKey: "q4wk",
    doses: [],
    windowBefore: 7,
    windowAfter: 7,
    verifications: [],
    missedDoseGuidance: "",
    administrationRule: () => ({
      routes: ["IM", "SubQ"],
      sites: [...ALL_INJECTION_SITES],
    }),
  },
};

export const effectiveInjectionWindow = (
  medication: InjectionMedication,
  intervalKey: InjectionIntervalKey,
): { windowBefore: number; windowAfter: number } => {
  const specific = medication.windowsByInterval?.[intervalKey];
  if (specific) return specific;
  if (intervalKey === medication.intervalKey) {
    return {
      windowBefore: medication.windowBefore,
      windowAfter: medication.windowAfter,
    };
  }
  const days = INJECTION_INTERVAL_DAYS[intervalKey];
  return days > 28
    ? { windowBefore: 14, windowAfter: 14 }
    : { windowBefore: 7, windowAfter: 7 };
};

/**
 * Product-specific cadence overrides the generic interval-key math.  Most
 * intervals are intentionally still day based, but products described as
 * every 2/3/6 months retain their calendar-month semantics.
 */
export const effectiveInjectionCadence = (
  medication: InjectionMedication,
  intervalKey: InjectionIntervalKey,
): InjectionCadence => {
  const configured = medication.cadenceByInterval?.[intervalKey];
  if (configured) return configured;
  if (intervalKey === "once" || medication.intervalKey === "once") {
    return { kind: "oneTime", label: "one-time" };
  }
  const days = INJECTION_INTERVAL_DAYS[intervalKey];
  return { kind: "days", days, label: injectionIntervalLabel(intervalKey) };
};

export const calculateNextInjectionDate = (
  medication: InjectionMedication,
  intervalKey: InjectionIntervalKey,
  administrationDate: string,
): string => {
  const cadence = effectiveInjectionCadence(medication, intervalKey);
  if (cadence.kind === "oneTime") return "";
  if (cadence.kind === "calendarMonths") {
    return addCalendarMonths(administrationDate, cadence.months);
  }
  return addCalendarDays(administrationDate, cadence.days);
};

export const allowedDosesForInterval = (
  medication: InjectionMedication,
  intervalKey: InjectionIntervalKey,
): string[] => medication.dosesByInterval?.[intervalKey] ?? medication.doses;

export const normalizeInjectionSite = (site: string): string =>
  site === "Abdomen (SubQ)" ? "Abdomen RUQ (SubQ)" : site;

export const injectionMuscleKey = (site: string): string => {
  const normalized = normalizeInjectionSite(site).toLowerCase().trim();
  const side = normalized.startsWith("r ") ? "right" : normalized.startsWith("l ") ? "left" : "";
  if (normalized.includes("deltoid")) return `${side}-deltoid`;
  if (normalized.includes("gluteal")) return `${side}-gluteal`;
  return normalized;
};

const mirrorSite = (site: string): string => {
  if (site.startsWith("R ")) return site.replace(/^R /, "L ");
  if (site.startsWith("L ")) return site.replace(/^L /, "R ");
  const quadrants: Record<string, string> = {
    "Abdomen LUQ (SubQ)": "Abdomen RLQ (SubQ)",
    "Abdomen RUQ (SubQ)": "Abdomen LLQ (SubQ)",
    "Abdomen LLQ (SubQ)": "Abdomen RUQ (SubQ)",
    "Abdomen RLQ (SubQ)": "Abdomen LUQ (SubQ)",
  };
  return quadrants[site] ?? site;
};

export const recommendAlternateSite = (
  allowedSites: string[],
  previousSite: string,
): string => {
  const prior = normalizeInjectionSite(previousSite);
  if (!prior || !allowedSites.length) return "";
  const mirrored = mirrorSite(prior);
  if (mirrored !== prior && allowedSites.includes(mirrored)) return mirrored;
  const opposite = allowedSites.find(
    (site) =>
      site !== prior &&
      ((prior.startsWith("R ") && site.startsWith("L ")) ||
        (prior.startsWith("L ") && site.startsWith("R "))),
  );
  return opposite ?? allowedSites.find((site) => site !== prior) ?? "";
};
