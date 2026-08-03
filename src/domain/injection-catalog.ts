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
  missedDoseGuidance: string;
  administrationRule: (dose: string) => AdministrationRule;
}

const allIm = (): AdministrationRule => ({ routes: ["IM"], sites: [...IM_SITES] });
const gluteal = (): AdministrationRule => ({ routes: ["IM"], sites: [...GLUTEAL_SITES] });

export const INJECTION_MEDICATIONS: Record<InjectionMedicationKey, InjectionMedication> = {
  aristada: {
    key: "aristada",
    label: "Aristada",
    name: "Aristada",
    generic: "aripiprazole lauroxil",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q4wk",
    doses: ["441 mg", "662 mg", "882 mg", "1064 mg"],
    dosesByInterval: {
      q4wk: ["441 mg", "662 mg", "882 mg"],
      q6wk: ["882 mg"],
      q8wk: ["1064 mg"],
    },
    windowBefore: 7,
    windowAfter: 7,
    windowsByInterval: {
      q4wk: { windowBefore: 7, windowAfter: 7 },
      q6wk: { windowBefore: 14, windowAfter: 14 },
      q8wk: { windowBefore: 14, windowAfter: 14 },
    },
    timingMode: "orderVerify",
    verifications: ["resuspend", "oralOverlap"],
    missedDoseGuidance:
      "Use the current product-specific re-initiation table and active provider/pharmacist plan.",
    administrationRule: (dose) =>
      dose === "441 mg" ? allIm() : { routes: ["IM"], sites: [...GLUTEAL_SITES] },
  },
  initio: {
    key: "initio",
    label: "Aristada Initio",
    name: "Aristada Initio",
    generic: "aripiprazole lauroxil",
    route: "IM",
    defaultSite: "R deltoid",
    intervalKey: "once",
    doses: ["675 mg"],
    windowBefore: 0,
    windowAfter: 0,
    verifications: ["resuspend"],
    missedDoseGuidance: "One-time initiation component; follow the active initiation plan.",
    administrationRule: allIm,
  },
  sustenna: {
    key: "sustenna",
    label: "Invega Sustenna",
    name: "Invega Sustenna",
    generic: "paliperidone palmitate",
    route: "IM",
    defaultSite: "R deltoid",
    intervalKey: "q4wk",
    doses: ["39 mg", "78 mg", "117 mg", "156 mg", "234 mg"],
    windowBefore: 7,
    windowAfter: 7,
    verifications: ["resuspend", "invegaInit"],
    missedDoseGuidance:
      "Use the current product-specific missed-dose table and active provider/pharmacist plan.",
    administrationRule: allIm,
  },
  erzofri: {
    key: "erzofri",
    label: "Erzofri",
    name: "Erzofri",
    generic: "paliperidone palmitate",
    route: "IM",
    defaultSite: "R deltoid",
    intervalKey: "q4wk",
    doses: ["39 mg", "78 mg", "117 mg", "156 mg", "234 mg", "351 mg"],
    windowBefore: 7,
    windowAfter: 7,
    verifications: ["resuspend", "paliperidoneTolerability"],
    missedDoseGuidance:
      "Use the current ERZOFRI missed-dose table and active provider/pharmacist plan.",
    administrationRule: (dose) =>
      dose === "351 mg"
        ? { routes: ["IM"], sites: ["R deltoid", "L deltoid"] }
        : allIm(),
  },
  trinza: {
    key: "trinza",
    label: "Invega Trinza",
    name: "Invega Trinza",
    generic: "paliperidone palmitate",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q12wk",
    doses: ["273 mg", "410 mg", "546 mg", "819 mg"],
    windowBefore: 14,
    windowAfter: 14,
    verifications: ["resuspend", "stabilized"],
    missedDoseGuidance:
      "Use the current dose-specific INVEGA TRINZA missed-dose table and active provider/pharmacist plan.",
    administrationRule: allIm,
  },
  hafyera: {
    key: "hafyera",
    label: "Invega Hafyera",
    name: "Invega Hafyera",
    generic: "paliperidone palmitate",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q26wk",
    doses: ["1092 mg", "1560 mg"],
    windowBefore: 14,
    windowAfter: 21,
    verifications: ["resuspend", "stabilized"],
    missedDoseGuidance:
      "Use the current dose-specific INVEGA HAFYERA missed-dose table and active provider/pharmacist plan.",
    administrationRule: gluteal,
  },
  uzedy: {
    key: "uzedy",
    label: "Uzedy",
    name: "Uzedy",
    generic: "risperidone ER",
    route: "SubQ",
    defaultSite: "Abdomen RUQ (SubQ)",
    intervalKey: "q4wk",
    doses: ["50 mg", "75 mg", "100 mg", "125 mg", "150 mg", "200 mg", "250 mg"],
    dosesByInterval: {
      q4wk: ["50 mg", "75 mg", "100 mg", "125 mg"],
      q8wk: ["100 mg", "150 mg", "200 mg", "250 mg"],
    },
    windowBefore: 7,
    windowAfter: 7,
    windowsByInterval: {
      q4wk: { windowBefore: 7, windowAfter: 7 },
      q8wk: { windowBefore: 14, windowAfter: 14 },
    },
    timingMode: "orderVerify",
    verifications: ["resuspend"],
    missedDoseGuidance:
      "Give the next injection as soon as possible per the active order and current product information.",
    administrationRule: () => ({ routes: ["SubQ"], sites: [...SUBQ_SITES] }),
  },
  maintena: {
    key: "maintena",
    label: "Abilify Maintena",
    name: "Abilify Maintena",
    generic: "aripiprazole",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q4wk",
    doses: ["300 mg", "400 mg"],
    windowBefore: 2,
    windowAfter: 7,
    timingMode: "orderVerify",
    verifications: ["resuspend", "oralOverlap"],
    missedDoseGuidance:
      "Verify the prescribed initiation or re-initiation plan against the active order and current product information.",
    administrationRule: allIm,
  },
  asimtufii: {
    key: "asimtufii",
    label: "Abilify Asimtufii",
    name: "Abilify Asimtufii",
    generic: "aripiprazole",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q8wk",
    doses: ["720 mg", "960 mg"],
    windowBefore: 14,
    windowAfter: 14,
    verifications: [
      "resuspend",
      "aripiprazoleTolerability",
      "glutealOnly",
      "noMassage",
    ],
    missedDoseGuidance:
      "Verify restart timing against the active order and current product information.",
    administrationRule: gluteal,
  },
  vivitrol: {
    key: "vivitrol",
    label: "Vivitrol",
    name: "Vivitrol",
    generic: "naltrexone ER",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q4wk",
    doses: ["380 mg"],
    windowBefore: 3,
    windowAfter: 7,
    timingMode: "orderVerify",
    verifications: ["opioidFree", "naltrexHS", "suppliedNeedle"],
    missedDoseGuidance:
      "Use the active provider order and current product information; reassess current opioid-risk status.",
    administrationRule: gluteal,
  },
  haldol: {
    key: "haldol",
    label: "Haldol Dec.",
    name: "Haldol Decanoate",
    generic: "haloperidol decanoate",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q4wk",
    doses: ["50 mg", "100 mg", "150 mg", "200 mg", "300 mg"],
    windowBefore: 7,
    windowAfter: 7,
    verifications: ["deepZtrack"],
    missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
    administrationRule: allIm,
  },
  prolixin: {
    key: "prolixin",
    label: "Prolixin Dec.",
    name: "Prolixin Decanoate",
    generic: "fluphenazine decanoate",
    route: "IM",
    defaultSite: "R ventrogluteal",
    intervalKey: "q3wk",
    doses: ["12.5 mg", "25 mg", "37.5 mg", "50 mg"],
    windowBefore: 7,
    windowAfter: 7,
    verifications: ["deepZtrack"],
    missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
    administrationRule: allIm,
  },
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
