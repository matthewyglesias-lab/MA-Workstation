import type {
  InjectionIntervalKey,
  InjectionMedicationKey,
  MedicationVerificationKey,
} from "./injection-catalog";

/**
 * This is the clinical-reference boundary for the Injection workflow.  It is
 * deliberately data-only: the evaluator decides what is required for the
 * documented encounter, while this bundle records the product facts and the
 * provenance behind those decisions.  It also keeps the Knowledge Center from
 * becoming a second, hand-maintained medication catalog.
 */
export const INJECTION_CLINICAL_REFERENCE_VERSION = "2026.08.05.1";
export const INJECTION_CLINICAL_REFERENCE_REVIEWED_ON = "2026-08-05";

export type ClinicalReferenceClassification =
  | "label constraint"
  | "order-dependent review"
  | "local policy";

export interface ClinicalReferenceSource {
  title: string;
  url: string;
  /** The publisher's label revision when captured; keep this visible for audit. */
  labelRevision: string;
  reviewedOn: string;
}

export interface InjectionClinicalReferenceFact {
  id: string;
  classification: ClinicalReferenceClassification;
  statement: string;
  source: ClinicalReferenceSource;
}

export type InjectionClinicalPhase =
  | "maintenance"
  | "initiation"
  | "reinitiation"
  | "loading"
  | "prn";

export type InjectionCadence =
  | { kind: "days"; days: number; label: string }
  | { kind: "calendarMonths"; months: number; label: string }
  | { kind: "oneTime"; label: string };

export type InjectionSiteGuidance =
  | "all-im"
  | "gluteal-im"
  | "subq"
  | "aristada-dose"
  | "erzofri-dose"
  | "order-directed";

export interface InjectionConditionalRequirement {
  id: string;
  code: string;
  severity: "stop" | "warning";
  field: string;
  section: string;
  message: string;
  classification: ClinicalReferenceClassification;
  /** Empty selectors mean the rule applies whenever the medication is selected. */
  doses?: string[];
  phases?: InjectionClinicalPhase[];
}

export interface InjectionMedicationReferenceCatalog {
  label: string;
  name: string;
  generic: string;
  route: string;
  /** Used when a label permits more than the displayed/default route. */
  allowedRoutes?: string[];
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
  cadenceByInterval?: Partial<Record<InjectionIntervalKey, InjectionCadence>>;
  /** Union of all potentially-applicable checks, used to render the checklist. */
  verifications: MedicationVerificationKey[];
  /** Checks are evaluated only for the current clinical phase. */
  verificationRequirements?: Partial<
    Record<InjectionClinicalPhase, MedicationVerificationKey[]>
  >;
  missedDoseGuidance: string;
  siteGuidance: InjectionSiteGuidance;
}

export interface InjectionMedicationKnowledge {
  className: string;
  technique: string;
  preparation: string;
  storage: string;
  staffGuardrail: string;
}

export interface InjectionMedicationClinicalReference {
  key: Exclude<InjectionMedicationKey, "other">;
  source: ClinicalReferenceSource;
  facts: InjectionClinicalReferenceFact[];
  catalog: InjectionMedicationReferenceCatalog;
  knowledge: InjectionMedicationKnowledge;
  conditionalRequirements?: InjectionConditionalRequirement[];
}

export interface InjectionClinicalReferenceBundle {
  version: string;
  reviewedOn: string;
  medications: Record<
    Exclude<InjectionMedicationKey, "other">,
    InjectionMedicationClinicalReference
  >;
}

const labelSource = (
  title: string,
  url: string,
  labelRevision: string,
): ClinicalReferenceSource => ({
  title,
  url,
  labelRevision,
  reviewedOn: INJECTION_CLINICAL_REFERENCE_REVIEWED_ON,
});

const fact = (
  id: string,
  classification: ClinicalReferenceClassification,
  statement: string,
  source: ClinicalReferenceSource,
): InjectionClinicalReferenceFact => ({ id, classification, statement, source });

const sources = {
  aristada: labelSource(
    "ARISTADA prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=17a8d11b-73b0-4833-a0b4-cf1ef85edefb",
    "Revised 1/2025; SPL v32 (effective 2025-01-28; DailyMed published 2025-02-10)",
  ),
  initio: labelSource(
    "ARISTADA INITIO prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b18fdfd9-31cd-4a2f-9f1c-ebc70d7a9403",
    "Revised 1/2025; SPL v16 (effective 2025-01-28; DailyMed published 2025-02-10)",
  ),
  sustenna: labelSource(
    "INVEGA SUSTENNA prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1af14e42-951d-414d-8564-5d5fce138554",
    "Revised 1/2025; SPL v41 (effective 2025-02-14; DailyMed published 2025-02-17)",
  ),
  erzofri: labelSource(
    "ERZOFRI prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=492bf9dd-868e-421a-92db-8cca8973aac1",
    "Revised 3/2025; SPL v7 (effective 2026-03-09; DailyMed published 2026-03-10)",
  ),
  trinza: labelSource(
    "INVEGA TRINZA prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c39e65d7-fa44-4e4c-8b12-a654d3ed0eae",
    "Revised 1/2025; SPL v25 (effective 2025-02-14; DailyMed published 2025-02-17)",
  ),
  hafyera: labelSource(
    "INVEGA HAFYERA prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6cd61892-d2cb-434d-83ed-5c1b2c4e7a0b",
    "Revised 1/2025; SPL v8 (effective 2025-02-18; DailyMed published 2025-02-21)",
  ),
  uzedy: labelSource(
    "UZEDY prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=734eb776-4be0-4808-834b-0d8b0f9e021e",
    "Revised 10/2025; SPL v7 (effective 2025-10-09; DailyMed published 2025-11-17)",
  ),
  maintena: labelSource(
    "ABILIFY MAINTENA prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee49f3b1-1650-47ff-9fb1-ea53fe0b92b6",
    "Revised 2/2026; SPL v27 (effective 2026-03-24; DailyMed published 2026-03-30)",
  ),
  asimtufii: labelSource(
    "ABILIFY ASIMTUFII prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=da4c07fd-1130-4341-bb44-63acfa4162be",
    "Revised 3/2025; SPL v6 (effective 2025-04-04; DailyMed published 2025-04-10)",
  ),
  vivitrol: labelSource(
    "VIVITROL prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd11c435-b0f0-4bb9-ae78-60f101f3703f",
    "Revised 5/2026; SPL v39 (effective 2026-05-31; DailyMed published 2026-07-24)",
  ),
  haldol: labelSource(
    "HALDOL DECANOATE prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=af0159a8-dff5-449a-aa2b-a0c430081e21",
    "Revised 10/2025; SPL v25 (effective 2025-11-11; DailyMed published 2025-11-17)",
  ),
  prolixin: labelSource(
    "Fluphenazine Decanoate Injection prescribing information (DailyMed)",
    "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=8caa3896-cde1-4cb1-9332-2e92bcf5c1f6",
    "SPL v5 (effective 2024-12-12; DailyMed published 2024-12-16)",
  ),
} as const;

/**
 * Medication facts that power both typed evaluation and Knowledge Center.
 * Statements classified as order-dependent never create a numeric dosing rule
 * or a false "within window" clearance on their own.
 */
export const INJECTION_CLINICAL_REFERENCE_BUNDLE: InjectionClinicalReferenceBundle = {
  version: INJECTION_CLINICAL_REFERENCE_VERSION,
  reviewedOn: INJECTION_CLINICAL_REFERENCE_REVIEWED_ON,
  medications: {
    aristada: {
      key: "aristada",
      source: sources.aristada,
      facts: [
        fact(
          "aristada-site-dose",
          "label constraint",
          "ARISTADA 441 mg may be deltoid or gluteal; higher listed strengths are gluteal only.",
          sources.aristada,
        ),
        fact(
          "aristada-restart",
          "order-dependent review",
          "Missed-dose and re-initiation management must follow the active order and current product-specific table.",
          sources.aristada,
        ),
      ],
      catalog: {
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
        cadenceByInterval: {
          q8wk: { kind: "calendarMonths", months: 2, label: "every 2 months" },
        },
        timingMode: "orderVerify",
        verifications: ["resuspend", "oralOverlap"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "oralOverlap"],
          reinitiation: ["resuspend", "oralOverlap"],
        },
        missedDoseGuidance:
          "Use the current product-specific re-initiation table and active provider/pharmacist plan.",
        siteGuidance: "aristada-dose",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI",
        technique:
          "Use the product kit and the dose/site-specific needle. Follow the current label preparation steps.",
        preparation: "Prefilled syringe; prepare and inspect according to the current product instructions.",
        storage: "Use the current carton and label storage instructions.",
        staffGuardrail:
          "Confirm the selected interval matches the ordered dose. Initiation or restart requires the active oral/re-initiation plan; maintenance does not.",
      },
    },
    initio: {
      key: "initio",
      source: sources.initio,
      facts: [
        fact(
          "initio-one-time",
          "label constraint",
          "ARISTADA INITIO is a one-time initiation/re-initiation component, not a maintenance interval product.",
          sources.initio,
        ),
        fact(
          "initio-plan",
          "order-dependent review",
          "Use the selected provider-directed initiation or re-initiation pathway for accompanying ARISTADA and oral aripiprazole documentation.",
          sources.initio,
        ),
      ],
      catalog: {
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
        verificationRequirements: { maintenance: ["resuspend"], initiation: ["resuspend"], reinitiation: ["resuspend"] },
        missedDoseGuidance: "One-time initiation component; follow the active initiation plan.",
        siteGuidance: "all-im",
      },
      knowledge: {
        className: "LAI initiation component",
        technique: "Use the product kit and current label instructions.",
        preparation: "Prefilled syringe; prepare per product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Not a maintenance dose. Document it only with the active initiation/re-initiation plan.",
      },
    },
    sustenna: {
      key: "sustenna",
      source: sources.sustenna,
      facts: [
        fact(
          "sustenna-initiation",
          "label constraint",
          "Day 1 and Day 8 initiation injections use deltoid administration; the typed initiation pathway documents this separately from routine maintenance.",
          sources.sustenna,
        ),
        fact(
          "sustenna-restart",
          "order-dependent review",
          "Missed-dose and re-initiation regimens require the current product-specific table and provider/pharmacist direction.",
          sources.sustenna,
        ),
      ],
      catalog: {
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
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "invegaInit"],
          reinitiation: ["resuspend", "invegaInit"],
        },
        missedDoseGuidance:
          "Use the current product-specific missed-dose table and active provider/pharmacist plan.",
        siteGuidance: "all-im",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (monthly)",
        technique: "Use the kit needle and preparation steps appropriate to the selected site and current label.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Initiation/re-initiation checks are needed only when that phase is documented; routine maintenance still requires order, product, and administration verification.",
      },
    },
    erzofri: {
      key: "erzofri",
      source: sources.erzofri,
      facts: [
        fact(
          "erzofri-351-day1",
          "label constraint",
          "ERZOFRI 351 mg is the initial Day 1 dose and is administered in the deltoid. Subsequent monthly maintenance strengths are 39 mg through 234 mg and may use deltoid or gluteal administration.",
          sources.erzofri,
        ),
        fact(
          "erzofri-restart",
          "order-dependent review",
          "A missed-dose restart may require a product-specific re-initiation regimen; use the active order and current label table.",
          sources.erzofri,
        ),
      ],
      catalog: {
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
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "paliperidoneTolerability"],
          reinitiation: ["resuspend", "paliperidoneTolerability"],
        },
        missedDoseGuidance:
          "Use the current ERZOFRI missed-dose table and active provider/pharmacist plan.",
        siteGuidance: "erzofri-dose",
      },
      conditionalRequirements: [
        {
          id: "erzofri-351-phase",
          code: "erzofri.351.phase",
          severity: "stop",
          field: "reason",
          section: "initiation",
          message:
            "ERZOFRI 351 mg is a Day 1/re-initiation pathway. Select initiation or re-initiation and document the active provider plan; do not file it as routine maintenance.",
          classification: "label constraint",
          doses: ["351 mg"],
          phases: ["maintenance", "loading", "prn"],
        },
      ],
      knowledge: {
        className: "Atypical antipsychotic LAI (monthly)",
        technique: "Use the product kit and current label preparation instructions; initial 351 mg is deltoid only.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "351 mg is not a routine maintenance selection. Maintenance 39-234 mg is a distinct monthly pathway.",
      },
    },
    trinza: {
      key: "trinza",
      source: sources.trinza,
      facts: [
        fact(
          "trinza-calendar-cadence",
          "label constraint",
          "INVEGA TRINZA is described as an every-3-month product; due-date calculations use calendar months rather than a generic 84-day approximation.",
          sources.trinza,
        ),
        fact(
          "trinza-transition",
          "order-dependent review",
          "Confirm the active transition/stabilization and missed-dose plan against the current label and provider direction.",
          sources.trinza,
        ),
      ],
      catalog: {
        label: "Invega Trinza",
        name: "Invega Trinza",
        generic: "paliperidone palmitate",
        route: "IM",
        defaultSite: "R ventrogluteal",
        intervalKey: "q12wk",
        doses: ["273 mg", "410 mg", "546 mg", "819 mg"],
        windowBefore: 14,
        windowAfter: 14,
        cadenceByInterval: { q12wk: { kind: "calendarMonths", months: 3, label: "every 3 months" } },
        verifications: ["resuspend", "stabilized"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "stabilized"],
          reinitiation: ["resuspend", "stabilized"],
        },
        missedDoseGuidance:
          "Use the current dose-specific INVEGA TRINZA missed-dose table and active provider/pharmacist plan.",
        siteGuidance: "all-im",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (every 3 months)",
        technique: "Use the product kit and the current site-specific preparation instructions.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Calendar cadence is a scheduling aid. Transition, re-initiation, and missed-dose decisions remain provider/product-table review.",
      },
    },
    hafyera: {
      key: "hafyera",
      source: sources.hafyera,
      facts: [
        fact(
          "hafyera-calendar-cadence",
          "label constraint",
          "INVEGA HAFYERA is an every-6-month product; due-date calculations use calendar months rather than a generic 182-day approximation.",
          sources.hafyera,
        ),
        fact(
          "hafyera-transition",
          "order-dependent review",
          "Confirm the documented stabilization/transition and any missed-dose plan against the current label and provider direction.",
          sources.hafyera,
        ),
      ],
      catalog: {
        label: "Invega Hafyera",
        name: "Invega Hafyera",
        generic: "paliperidone palmitate",
        route: "IM",
        defaultSite: "R ventrogluteal",
        intervalKey: "q26wk",
        doses: ["1092 mg", "1560 mg"],
        windowBefore: 14,
        windowAfter: 21,
        cadenceByInterval: { q26wk: { kind: "calendarMonths", months: 6, label: "every 6 months" } },
        verifications: ["resuspend", "stabilized"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "stabilized"],
          reinitiation: ["resuspend", "stabilized"],
        },
        missedDoseGuidance:
          "Use the current dose-specific INVEGA HAFYERA missed-dose table and active provider/pharmacist plan.",
        siteGuidance: "gluteal-im",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (every 6 months)",
        technique: "Use the product kit and current gluteal administration instructions.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Calendar cadence is a scheduling aid. Transition, re-initiation, and missed-dose decisions remain provider/product-table review.",
      },
    },
    uzedy: {
      key: "uzedy",
      source: sources.uzedy,
      facts: [
        fact(
          "uzedy-route",
          "label constraint",
          "UZEDY is administered subcutaneously in the abdomen or upper arm; the selected interval must match the ordered strength.",
          sources.uzedy,
        ),
        fact(
          "uzedy-timing",
          "order-dependent review",
          "Use the active order and current product information for late or missed-dose handling rather than treating a generic date window as clearance.",
          sources.uzedy,
        ),
      ],
      catalog: {
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
        cadenceByInterval: { q8wk: { kind: "calendarMonths", months: 2, label: "every 2 months" } },
        timingMode: "orderVerify",
        verifications: ["resuspend"],
        verificationRequirements: { maintenance: ["resuspend"], initiation: ["resuspend"], reinitiation: ["resuspend"] },
        missedDoseGuidance:
          "Give the next injection as soon as possible per the active order and current product information.",
        siteGuidance: "subq",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (subcutaneous)",
        technique: "Use the supplied device and current label site/preparation instructions.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Once-monthly and every-2-month regimens use distinct strengths. Verify the active order before documenting a late or missed dose.",
      },
    },
    maintena: {
      key: "maintena",
      source: sources.maintena,
      facts: [
        fact(
          "maintena-initiation",
          "label constraint",
          "ABILIFY MAINTENA initiation/re-initiation requires a documented product-specific oral or one-day pathway; routine maintenance does not recreate that initiation checklist.",
          sources.maintena,
        ),
        fact(
          "maintena-timing",
          "order-dependent review",
          "Use the active order and current product information for timing and restart decisions.",
          sources.maintena,
        ),
      ],
      catalog: {
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
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "oralOverlap"],
          reinitiation: ["resuspend", "oralOverlap"],
        },
        missedDoseGuidance:
          "Verify the prescribed initiation or re-initiation plan against the active order and current product information.",
        siteGuidance: "all-im",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (monthly)",
        technique: "Use the ordered presentation and current label preparation/site instructions.",
        preparation: "Prepare the selected vial or prefilled presentation according to current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Document an oral/one-day pathway only when this encounter is initiation or re-initiation; verify timing and restart decisions against the active order.",
      },
    },
    asimtufii: {
      key: "asimtufii",
      source: sources.asimtufii,
      facts: [
        fact(
          "asimtufii-route",
          "label constraint",
          "ABILIFY ASIMTUFII is administered by gluteal intramuscular injection; do not massage the site after administration.",
          sources.asimtufii,
        ),
        fact(
          "asimtufii-initiation",
          "order-dependent review",
          "Initiation, transition, or re-initiation requires the active provider plan and current product information.",
          sources.asimtufii,
        ),
      ],
      catalog: {
        label: "Abilify Asimtufii",
        name: "Abilify Asimtufii",
        generic: "aripiprazole",
        route: "IM",
        defaultSite: "R ventrogluteal",
        intervalKey: "q8wk",
        doses: ["720 mg", "960 mg"],
        windowBefore: 14,
        windowAfter: 14,
        cadenceByInterval: { q8wk: { kind: "calendarMonths", months: 2, label: "every 2 months" } },
        timingMode: "orderVerify",
        verifications: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
        verificationRequirements: {
          maintenance: ["resuspend", "glutealOnly", "noMassage"],
          initiation: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
          reinitiation: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
        },
        missedDoseGuidance:
          "Verify restart timing against the active order and current product information.",
        siteGuidance: "gluteal-im",
      },
      knowledge: {
        className: "Atypical antipsychotic LAI (every 2 months)",
        technique: "Use the supplied syringe and current gluteal preparation instructions; do not massage after injection.",
        preparation: "Prefilled syringe; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Gluteal-only and no-massage checks apply to every administration. Tolerability/transition review applies to initiation or re-initiation.",
      },
    },
    vivitrol: {
      key: "vivitrol",
      source: sources.vivitrol,
      facts: [
        fact(
          "vivitrol-route",
          "label constraint",
          "VIVITROL is a deep gluteal intramuscular injection using the supplied needle selected for body habitus.",
          sources.vivitrol,
        ),
        fact(
          "vivitrol-safety",
          "order-dependent review",
          "Current opioid-risk and contraindication review must be confirmed against the active order and current product information before administration.",
          sources.vivitrol,
        ),
      ],
      catalog: {
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
        verificationRequirements: {
          maintenance: ["opioidFree", "naltrexHS", "suppliedNeedle"],
          initiation: ["opioidFree", "naltrexHS", "suppliedNeedle"],
          reinitiation: ["opioidFree", "naltrexHS", "suppliedNeedle"],
          loading: ["opioidFree", "naltrexHS", "suppliedNeedle"],
          prn: ["opioidFree", "naltrexHS", "suppliedNeedle"],
        },
        missedDoseGuidance:
          "Use the active provider order and current product information; reassess current opioid-risk status.",
        siteGuidance: "gluteal-im",
      },
      knowledge: {
        className: "Opioid antagonist LAI (monthly)",
        technique: "Use the supplied needle selected for body habitus and current deep-gluteal administration instructions.",
        preparation: "Prepare and administer according to the supplied kit and current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Do not treat a generic timing calculation as clinical clearance; opioid-risk and contraindication review remain required for each administration.",
      },
    },
    haldol: {
      key: "haldol",
      source: sources.haldol,
      facts: [
        fact(
          "haldol-route",
          "label constraint",
          "HALDOL DECANOATE is administered by deep intramuscular injection every 4 weeks; the label specifies a 21-gauge needle and a maximum 3 mL per injection site.",
          sources.haldol,
        ),
        fact(
          "haldol-technique",
          "order-dependent review",
          "The label source does not prescribe a gluteal-only site or a Z-track requirement. Document the actual site and follow the active order/local policy for technique.",
          sources.haldol,
        ),
      ],
      catalog: {
        label: "Haldol Dec.",
        name: "Haldol Decanoate",
        generic: "haloperidol decanoate",
        route: "IM",
        defaultSite: "",
        intervalKey: "q4wk",
        doses: ["50 mg", "100 mg", "150 mg", "200 mg", "300 mg"],
        windowBefore: 0,
        windowAfter: 0,
        timingMode: "orderVerify",
        verifications: [],
        missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
        siteGuidance: "order-directed",
      },
      knowledge: {
        className: "Typical antipsychotic LAI",
        technique: "Deep IM; label specifies a 21-gauge needle and maximum 3 mL per injection site. Actual site/technique follows the active order and local policy.",
        preparation: "Oil solution; inspect and prepare per current product instructions.",
        storage: "Store and protect from light according to the current carton and label.",
        staffGuardrail: "Do not imply a gluteal-only or Z-track requirement. Verify initial-dose splitting, exact dose, and technique against the active order.",
      },
    },
    prolixin: {
      key: "prolixin",
      source: sources.prolixin,
      facts: [
        fact(
          "prolixin-route",
          "label constraint",
          "Fluphenazine decanoate may be administered intramuscularly or subcutaneously; the source specifies a dry syringe and a needle of at least 21 gauge.",
          sources.prolixin,
        ),
        fact(
          "prolixin-site",
          "order-dependent review",
          "The label source does not define an anatomical default site. Document the actual ordered route/site and technique.",
          sources.prolixin,
        ),
      ],
      catalog: {
        label: "Prolixin Dec.",
        name: "Prolixin Decanoate",
        generic: "fluphenazine decanoate",
        route: "IM",
        allowedRoutes: ["IM", "SubQ"],
        defaultSite: "",
        intervalKey: "q3wk",
        doses: ["12.5 mg", "25 mg", "37.5 mg", "50 mg"],
        windowBefore: 0,
        windowAfter: 0,
        timingMode: "orderVerify",
        verifications: [],
        missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
        siteGuidance: "order-directed",
      },
      knowledge: {
        className: "Typical antipsychotic LAI",
        technique: "IM or subcutaneous administration; use a dry syringe and needle of at least 21 gauge per the current label.",
        preparation: "Oil solution; inspect and prepare per current product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Do not invent an anatomical default. Record the actual ordered route/site and follow provider/local technique direction.",
      },
    },
  },
};

export const injectionClinicalPhaseForReason = (reason: string): InjectionClinicalPhase => {
  switch (reason) {
    case "initiation":
      return "initiation";
    case "reinit":
      return "reinitiation";
    case "loading":
      return "loading";
    case "prn":
      return "prn";
    default:
      return "maintenance";
  }
};

export const medicationVerificationsForPhase = (
  reference: InjectionMedicationClinicalReference,
  phase: InjectionClinicalPhase,
): MedicationVerificationKey[] =>
  reference.catalog.verificationRequirements?.[phase] ??
  reference.catalog.verificationRequirements?.maintenance ??
  reference.catalog.verifications;

export const conditionalRequirementsForEncounter = (
  reference: InjectionMedicationClinicalReference,
  phase: InjectionClinicalPhase,
  dose: string,
): InjectionConditionalRequirement[] =>
  (reference.conditionalRequirements ?? []).filter(
    (requirement) =>
      (!requirement.doses?.length || requirement.doses.includes(dose.trim())) &&
      (!requirement.phases?.length || requirement.phases.includes(phase)),
  );
