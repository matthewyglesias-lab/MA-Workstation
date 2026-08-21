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
export const INJECTION_CLINICAL_REFERENCE_VERSION = "2026.08.20.2";
export const INJECTION_CLINICAL_REFERENCE_REVIEWED_ON = "2026-08-05";

/**
 * Needle-selection and technique content was reviewed separately from, and
 * later than, the scheduling facts above. Keeping the two dates distinct is
 * deliberate: bumping the bundle-wide date would assert that every existing
 * dosing/window fact was re-verified on this date, which it was not.
 */
export const INJECTION_ADMINISTRATION_REVIEWED_ON = "2026-08-14";

/**
 * Preparation instructions are reviewed independently from the scheduling
 * facts and administration mechanics. This lets the application show the
 * source date for product handling without claiming the whole reference
 * bundle was re-reviewed on the same day.
 */
export const INJECTION_PREPARATION_REVIEWED_ON = "2026-08-18";

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
  /** Product-specific wording for a persisted verification key. */
  verificationDetails?: Partial<
    Record<MedicationVerificationKey, InjectionMedicationVerificationDetail>
  >;
  missedDoseGuidance: string;
  siteGuidance: InjectionSiteGuidance;
}

/**
 * The verifier stores only a stable boolean key. Its visible and documented
 * meaning must still be specific to the product rather than assuming every
 * preparation is a reconstitution or every product needs the same inspection.
 */
export interface InjectionMedicationVerificationDetail {
  label: string;
  /**
   * The charted "Product preparation" / "Product visual inspection" fact.
   *
   * Two templates only:
   *   1. "<PRODUCT> <action clause>; <result clause>." for a real prep
   *      action (tap/shake/reconstitute). The result clause says "confirmed"
   *      or "observed" only where the label documents an affirmative visual
   *      check (e.g. TRINZA, HAFYERA, ASIMTUFII, VIVITROL, MAINTENA); a
   *      product whose label states no such check (ARISTADA, INITIO,
   *      ERZOFRI, UZEDY) states the achieved state flatly, with no
   *      confirm/observe verb invented for it.
   *   2. "<PRODUCT> solution visually inspected: <findings>." for a
   *      ready-to-use solution with no mixing step (HALDOL, PROLIXIN).
   *
   * Every numeric minimum reads "≥N", never "at least N". Verbs the label
   * itself uses ("shaken vigorously", "tapped") are kept verbatim rather
   * than swapped for fancier synonyms - fidelity to the source, not
   * vocabulary, is what makes this read as mature clinical documentation.
   *
   * When a function is supplied instead of a plain string, it may use the
   * selected dose/resolved NDC presentation to state the actual prepared
   * volume - but only a volume this file has itself sourced from the
   * label, never one read out of the NDC package-listing data (that data
   * is package/billing metadata and is documented elsewhere as never
   * driving a clinical fact). A prefilled, non-drawn-up product states its
   * labeled dose/volume up front ("<PRODUCT> <dose> (<volume> mL) ..."); a
   * product actually reconstituted or drawn up states the volume as a
   * trailing prepared-for-injection fact instead.
   */
  documentation: string | ((context: InjectionPreparationDocumentationContext) => string);
  classification: ClinicalReferenceClassification;
  source: ClinicalReferenceSource;
}

export interface InjectionPreparationDocumentationContext {
  dose: string;
  /** The resolved NDC catalog presentation (e.g. "single-dose vial kit" vs
   * "prefilled dual-chamber syringe"), when the documented NDC matches a
   * known package. Undefined whenever it does not - never guessed from an
   * unrelated field such as the generic delivery-device selector. */
  presentation?: string;
}

export interface InjectionMedicationKnowledge {
  className: string;
  technique: string;
  preparation: string;
  storage: string;
  staffGuardrail: string;
}

/** Anatomical family a documented site belongs to. Needle selection is keyed
 * to this rather than to the individual site, because every label expresses
 * needle choice as "deltoid vs gluteal", never per-side. */
export type InjectionSiteGroup = "deltoid" | "gluteal" | "subq";

/**
 * Tissue depth over the injection site. Deliberately three coarse bands
 * rather than a computed BMI: the aripiprazole labels say "non-obese/obese",
 * the VIVITROL label says "very lean" and "larger amount of subcutaneous
 * tissue", and neither is a number this app is entitled to derive. `lean` and
 * `average` both satisfy a "non-obese" rule for aripiprazole products; VIVITROL
 * offers either supplied administration needle for an average habitus.
 */
export type InjectionHabitusBand = "lean" | "average" | "larger";

/** Both measurements are optional because some labels specify only one: the
 * decanoates name a gauge but leave length to the ordered site and depth. At
 * least one of `gauge` or `length` is always present. */
export interface NeedleSpec {
  gauge?: string;
  length?: string;
  /** "thin wall", "black pack", "customized kit needle", etc. */
  descriptor?: string;
}

/**
 * One row of a label's needle table. Selectors are conjunctive and an absent
 * selector means "applies to any". Rules are evaluated in array order and the
 * first match wins, so narrower rules must be listed before broader ones.
 */
export interface NeedleRecommendationRule {
  siteGroups?: InjectionSiteGroup[];
  doses?: string[];
  /** Paliperidone products key deltoid needle length to a hard kg threshold. */
  weightKg?: { kind: "below" | "atOrAbove"; kg: number };
  habitus?: InjectionHabitusBand[];
  needle: NeedleSpec;
  /** Set only where the label offers a documented choice between two needles. */
  alternate?: NeedleSpec;
  rationale: string;
}

export type InjectionTechniquePhase =
  | "preparation"
  | "needle"
  | "mechanics"
  | "aftercare";

/** Extends the fact shape so technique guidance carries the same provenance
 * discipline as every other statement in this bundle. */
export interface InjectionTechniqueNote extends InjectionClinicalReferenceFact {
  phase: InjectionTechniquePhase;
  severity: "info" | "caution";
  doses?: string[];
  siteGroups?: InjectionSiteGroup[];
}

export interface InjectionAdministrationReference {
  needleRules: NeedleRecommendationRule[];
  /** Shown when a rule needs habitus or weight that is not yet documented.
   * Never a guessed default - an unresolved recommendation says so. */
  needleUnresolved: string;
  /**
   * Set only where the label itself requires body habitus be assessed before
   * administration, which makes an undocumented habitus a stop rather than
   * merely an unresolved recommendation.
   *
   * Deliberately narrow. Every product's needle guidance is shown in the
   * panel, but a hard requirement is reserved for a stated label requirement
   * rather than applied wherever a rule happens to need input.
   */
  requiresHabitusAssessment?: boolean;
  /** Omitted when the label does not prescribe a numeric angle. */
  angle?: { degrees: string; note: string };
  maxVolumePerSite?: {
    milliliters: number;
    classification: ClinicalReferenceClassification;
    note: string;
  };
  /** Stated inline the moment the site grid renders, so a filtered-out site
   * reads as a named restriction instead of a silently missing tile. */
  siteRestriction?: { headline: string; detail: string };
  notes: InjectionTechniqueNote[];
}

export interface InjectionMedicationClinicalReference {
  key: Exclude<InjectionMedicationKey, "other">;
  source: ClinicalReferenceSource;
  facts: InjectionClinicalReferenceFact[];
  catalog: InjectionMedicationReferenceCatalog;
  knowledge: InjectionMedicationKnowledge;
  administration: InjectionAdministrationReference;
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

/** Same source, restated at the administration review date. */
const administrationSource = (
  source: ClinicalReferenceSource,
): ClinicalReferenceSource => ({
  ...source,
  reviewedOn: INJECTION_ADMINISTRATION_REVIEWED_ON,
});

/** Same source, restated at the preparation-content review date. */
const preparationSource = (
  source: ClinicalReferenceSource,
): ClinicalReferenceSource => ({
  ...source,
  reviewedOn: INJECTION_PREPARATION_REVIEWED_ON,
});

const verificationDetail = (
  label: string,
  documentation: InjectionMedicationVerificationDetail["documentation"],
  source: ClinicalReferenceSource,
): InjectionMedicationVerificationDetail => ({
  label,
  documentation,
  classification: "label constraint",
  source: preparationSource(source),
});

/**
 * Per-strength delivered volume, sourced from each label's own "Dosage Forms
 * and Strengths" table (DailyMed, revision matching the product's own
 * `sources.*` citation) - never from the NDC package-listing data, which is
 * package/billing metadata only. A dose absent from a table means the label
 * did not state one for this app to surface; the caller must degrade
 * gracefully rather than guess.
 */
const PREFILLED_VOLUME_ML_BY_DOSE: Partial<Record<InjectionMedicationKey, Record<string, string>>> = {
  aristada: { "441 mg": "1.6", "662 mg": "2.4", "882 mg": "3.2", "1064 mg": "3.9" },
  sustenna: { "39 mg": "0.25", "78 mg": "0.5", "117 mg": "0.75", "156 mg": "1", "234 mg": "1.5" },
  erzofri: {
    "39 mg": "0.25",
    "78 mg": "0.5",
    "117 mg": "0.75",
    "156 mg": "1",
    "234 mg": "1.5",
    "351 mg": "2.25",
  },
  trinza: { "273 mg": "0.88", "410 mg": "1.32", "546 mg": "1.75", "819 mg": "2.63" },
  hafyera: { "1092 mg": "3.5", "1560 mg": "5" },
  uzedy: {
    "50 mg": "0.14",
    "75 mg": "0.21",
    "100 mg": "0.28",
    "125 mg": "0.35",
    "150 mg": "0.42",
    "200 mg": "0.56",
    "250 mg": "0.7",
  },
  asimtufii: { "720 mg": "2.4", "960 mg": "3.2" },
};

/** "<PRODUCT> <dose> (<volume> mL)" for a prefilled, non-drawn-up product;
 * falls back to the bare dose when this file has no sourced volume for it. */
const prefilledDoseVolume = (
  medicationKey: InjectionMedicationKey,
  productLabel: string,
  dose: string,
): string => {
  const volume = PREFILLED_VOLUME_ML_BY_DOSE[medicationKey]?.[dose.trim()];
  return volume ? `${productLabel} ${dose} (${volume} mL)` : `${productLabel} ${dose}`;
};

/** ABILIFY MAINTENA's vial-for-reconstitution withdrawal volume (DailyMed
 * Table 4). The prefilled dual-chamber syringe states no separate mL figure
 * of its own - the label directs injecting its full contents. */
const MAINTENA_VIAL_VOLUME_ML_BY_DOSE: Record<string, string> = {
  "300 mg": "1.5",
  "400 mg": "2",
};

const techniqueNote = (
  id: string,
  phase: InjectionTechniquePhase,
  severity: "info" | "caution",
  classification: ClinicalReferenceClassification,
  statement: string,
  source: ClinicalReferenceSource,
  scope?: { doses?: string[]; siteGroups?: InjectionSiteGroup[] },
): InjectionTechniqueNote => ({
  id,
  phase,
  severity,
  classification,
  statement,
  source: phase === "preparation" ? preparationSource(source) : administrationSource(source),
  ...(scope?.doses ? { doses: scope.doses } : {}),
  ...(scope?.siteGroups ? { siteGroups: scope.siteGroups } : {}),
});

const IM_ANGLE = { degrees: "90", note: "Insert at 90° into the muscle." };

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
          q8wk: { kind: "days", days: 56, label: "every 2 months" },
        },
        timingMode: "orderVerify",
        verifications: ["resuspend", "oralOverlap"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "oralOverlap"],
          reinitiation: ["resuspend", "oralOverlap"],
        },
        verificationDetails: {
          resuspend: verificationDetail(
            "ARISTADA syringe preparation completed",
            ({ dose }) =>
              `${prefilledDoseVolume("aristada", "ARISTADA", dose)} syringe tapped ≥10 times, shaken vigorously ≥30 sec; suspension uniform.`,
            sources.aristada,
          ),
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
      administration: {
        // The label offers a documented choice of two needles per site rather
        // than a threshold, directing the longer one where more subcutaneous
        // tissue overlies the muscle. Habitus-scoped rules are listed first so
        // they win; otherwise both options are surfaced via `alternate`.
        needleRules: [
          {
            siteGroups: ["deltoid"],
            doses: ["441 mg"],
            habitus: ["larger"],
            needle: { gauge: "20G", length: '1½"' },
            rationale: "Longer of the two supplied deltoid needles for greater tissue depth.",
          },
          {
            siteGroups: ["deltoid"],
            doses: ["441 mg"],
            needle: { gauge: "21G", length: '1"' },
            alternate: { gauge: "20G", length: '1½"' },
            rationale: "Supplied deltoid needle options for the 441 mg strength.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["larger"],
            needle: { gauge: "20G", length: '2"' },
            rationale: "Longer of the two supplied gluteal needles for greater tissue depth.",
          },
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "20G", length: '1½"' },
            alternate: { gauge: "20G", length: '2"' },
            rationale: "Supplied gluteal needle options.",
          },
        ],
        needleUnresolved:
          "Both supplied needle options are labeled for this site; document body habitus to resolve the correct one.",
        angle: IM_ANGLE,
        siteRestriction: {
          headline: "Gluteal IM only at this strength",
          detail:
            "441 mg may be given in the deltoid or gluteal muscle. 662 mg, 882 mg, and 1064 mg are gluteal only.",
        },
        notes: [
          techniqueNote(
            "aristada-needle-length",
            "needle",
            "info",
            "label constraint",
            "Where a larger amount of subcutaneous tissue overlies the injection site muscle, use the longer of the needles provided.",
            sources.aristada,
          ),
          techniqueNote(
            "aristada-resuspend",
            "preparation",
            "info",
            "label constraint",
            "Tap the syringe at least 10 times, then shake vigorously for at least 30 seconds. If more than 15 minutes pass before injection, shake again for 30 seconds.",
            sources.aristada,
          ),
          techniqueNote(
            "aristada-rapid",
            "mechanics",
            "caution",
            "label constraint",
            "Inject rapidly and continuously. This is a suspension — hesitating mid-injection can make administration harder.",
            sources.aristada,
          ),
          techniqueNote(
            "aristada-flow-resistance",
            "mechanics",
            "caution",
            "local policy",
            "If flow resistance, sticking, or clogging occurs, do not estimate what was delivered. Document the actual dose-delivery status and notify the provider or supervisor.",
            sources.aristada,
          ),
          techniqueNote(
            "aristada-volume",
            "needle",
            "info",
            "label constraint",
            "Injection volume by strength: 441 mg = 1.6 mL, 662 mg = 2.4 mL, 882 mg = 3.2 mL, 1064 mg = 3.9 mL.",
            sources.aristada,
          ),
        ],
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
        verificationDetails: {
          resuspend: verificationDetail(
            "ARISTADA INITIO syringe preparation completed",
            "ARISTADA INITIO 675 mg (2.4 mL) syringe tapped ≥10 times, shaken vigorously ≥30 sec; suspension uniform.",
            sources.initio,
          ),
        },
        missedDoseGuidance: "One-time initiation component; follow the active initiation plan.",
        siteGuidance: "all-im",
      },
      conditionalRequirements: [
        {
          id: "initio-phase",
          code: "initio.phase",
          severity: "stop",
          field: "reason",
          section: "initiation",
          message:
            "ARISTADA INITIO is a one-time initiation or re-initiation component. Select the applicable path and document the active provider plan; do not file it as scheduled maintenance.",
          classification: "label constraint",
          phases: ["maintenance", "loading", "prn"],
        },
      ],
      knowledge: {
        className: "LAI initiation component",
        technique: "Use the product kit and current label instructions.",
        preparation: "Prefilled syringe; prepare per product instructions.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Not a maintenance dose. Document it only with the active initiation/re-initiation plan.",
      },
      administration: {
        needleRules: [
          {
            siteGroups: ["deltoid"],
            habitus: ["larger"],
            needle: { gauge: "20G", length: '1½"' },
            rationale: "Longer of the two supplied deltoid needles for greater tissue depth.",
          },
          {
            siteGroups: ["deltoid"],
            needle: { gauge: "21G", length: '1"' },
            alternate: { gauge: "20G", length: '1½"' },
            rationale: "Supplied deltoid needle options.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["larger"],
            needle: { gauge: "20G", length: '2"' },
            rationale: "Longer of the two supplied gluteal needles for greater tissue depth.",
          },
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "20G", length: '1½"' },
            alternate: { gauge: "20G", length: '2"' },
            rationale: "Supplied gluteal needle options.",
          },
        ],
        needleUnresolved:
          "Both supplied needle options are labeled for this site; document body habitus to resolve the correct one.",
        angle: IM_ANGLE,
        notes: [
          techniqueNote(
            "initio-resuspend",
            "preparation",
            "info",
            "label constraint",
            "Tap the syringe at least 10 times, then shake vigorously for at least 30 seconds. If more than 15 minutes pass before injection, shake again for 30 seconds.",
            sources.initio,
          ),
          techniqueNote(
            "initio-not-interchangeable",
            "mechanics",
            "caution",
            "label constraint",
            "Confirm ARISTADA INITIO versus maintenance ARISTADA before administration. They are not interchangeable.",
            sources.initio,
          ),
        ],
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
        verificationDetails: {
          resuspend: verificationDetail(
            "INVEGA SUSTENNA suspension shaken and visually inspected",
            ({ dose }) =>
              `${prefilledDoseVolume("sustenna", "INVEGA SUSTENNA", dose)} syringe shaken vigorously ≥10 sec; suspension homogeneous, no foreign matter or discoloration observed.`,
            sources.sustenna,
          ),
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
      administration: {
        // Deltoid needle length is keyed to a hard 90 kg threshold; gluteal is
        // weight-independent. Weight-scoped rules therefore precede the
        // gluteal catch-all, and a missing weight leaves deltoid unresolved
        // rather than defaulting to either side of the threshold.
        needleRules: [
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "below", kg: 90 },
            needle: { gauge: "23G", length: '1"' },
            rationale: "Deltoid administration under 90 kg.",
          },
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "atOrAbove", kg: 90 },
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Deltoid administration at or above 90 kg.",
          },
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Gluteal administration, regardless of patient weight.",
          },
        ],
        needleUnresolved:
          "Deltoid needle length is weight-dependent; document weight to resolve the labeled needle.",
        angle: IM_ANGLE,
        notes: [
          techniqueNote(
            "sustenna-kit-needles",
            "needle",
            "info",
            "label constraint",
            "The kit supplies two safety needles: 1½-inch 22 gauge and 1-inch 23 gauge.",
            sources.sustenna,
          ),
          techniqueNote(
            "sustenna-shake-window",
            "preparation",
            "caution",
            "label constraint",
            "Shake vigorously for at least 10 seconds to ensure a homogeneous suspension. Inspect for foreign matter or discoloration before administration when product and container permit.",
            sources.sustenna,
          ),
          techniqueNote(
            "sustenna-inject-slowly",
            "mechanics",
            "info",
            "label constraint",
            "Inject the entire contents slowly, deep into the selected deltoid or gluteal muscle.",
            sources.sustenna,
          ),
          techniqueNote(
            "sustenna-safety-device",
            "aftercare",
            "info",
            "label constraint",
            "Activate the needle protection system after injection until it clicks.",
            sources.sustenna,
          ),
        ],
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
        verificationDetails: {
          resuspend: verificationDetail(
            "ERZOFRI suspension preparation completed",
            ({ dose }) =>
              `${prefilledDoseVolume("erzofri", "ERZOFRI", dose)} syringe shaken vigorously ≥10 sec; suspension homogeneous.`,
            sources.erzofri,
          ),
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
      administration: {
        needleRules: [
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "below", kg: 90 },
            needle: { gauge: "23G", length: '1"' },
            rationale: "Deltoid administration under 90 kg.",
          },
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "atOrAbove", kg: 90 },
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Deltoid administration at or above 90 kg.",
          },
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Gluteal administration, regardless of patient weight.",
          },
        ],
        needleUnresolved:
          "Deltoid needle length is weight-dependent; document weight to resolve the labeled needle.",
        angle: IM_ANGLE,
        siteRestriction: {
          headline: "Deltoid only for the 351 mg Day 1 dose",
          detail:
            "The initial 351 mg dose is administered in the deltoid. Monthly maintenance strengths (39–234 mg) may use deltoid or gluteal.",
        },
        notes: [
          techniqueNote(
            "erzofri-kit-needles",
            "needle",
            "info",
            "label constraint",
            "The kit supplies two safety needles: 1½-inch 22 gauge and 1-inch 23 gauge.",
            sources.erzofri,
          ),
          techniqueNote(
            "erzofri-shake",
            "preparation",
            "info",
            "label constraint",
            "Shake vigorously for at least 10 seconds to ensure a homogeneous suspension. Do not mix with another product or diluent, and do not substitute kit components.",
            sources.erzofri,
          ),
          techniqueNote(
            "erzofri-inject-slowly",
            "mechanics",
            "info",
            "label constraint",
            "Inject the entire contents slowly, deep into the selected deltoid or gluteal muscle.",
            sources.erzofri,
          ),
          techniqueNote(
            "erzofri-safety-device",
            "aftercare",
            "info",
            "label constraint",
            "Activate the needle protection system after injection until it clicks.",
            sources.erzofri,
          ),
        ],
      },
    },
    trinza: {
      key: "trinza",
      source: sources.trinza,
      facts: [
        fact(
          "trinza-week-cadence",
          "label constraint",
          "INVEGA TRINZA is described as an every-3-month product; due-date calculations use a fixed 84-day (12-week) interval so the scheduled return date falls on the same day of the week each cycle.",
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
        cadenceByInterval: { q12wk: { kind: "days", days: 84, label: "every 3 months" } },
        verifications: ["resuspend", "stabilized"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "stabilized"],
          reinitiation: ["resuspend", "stabilized"],
        },
        verificationDetails: {
          resuspend: verificationDetail(
            "INVEGA TRINZA suspension shaken and visually inspected",
            ({ dose }) =>
              `${prefilledDoseVolume("trinza", "INVEGA TRINZA", dose)} syringe shaken vigorously ≥15 sec and injected within 5 min; uniform, milky-white suspension confirmed, no foreign matter or discoloration observed.`,
            sources.trinza,
          ),
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
      administration: {
        // Note the deltoid gauge does not change across the threshold here -
        // only the length does. TRINZA uses 22G thin wall on both sides of
        // 90 kg, unlike SUSTENNA/ERZOFRI which also change gauge.
        needleRules: [
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "below", kg: 90 },
            needle: { gauge: "22G", length: '1"', descriptor: "thin wall" },
            rationale: "Deltoid administration under 90 kg.",
          },
          {
            siteGroups: ["deltoid"],
            weightKg: { kind: "atOrAbove", kg: 90 },
            needle: { gauge: "22G", length: '1½"', descriptor: "thin wall" },
            rationale: "Deltoid administration at or above 90 kg.",
          },
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "22G", length: '1½"', descriptor: "thin wall" },
            rationale: "Gluteal administration, regardless of patient weight.",
          },
        ],
        needleUnresolved:
          "Deltoid needle length is weight-dependent; document weight to resolve the labeled needle.",
        angle: IM_ANGLE,
        notes: [
          techniqueNote(
            "trinza-kit-needles",
            "needle",
            "caution",
            "label constraint",
            "Thin wall safety needles are designed for this product. Use only the needles provided in the kit.",
            sources.trinza,
          ),
          techniqueNote(
            "trinza-shake-window",
            "preparation",
            "caution",
            "label constraint",
            "Inspect for foreign matter or discoloration. With the syringe tip pointing up, shake vigorously for at least 15 seconds and inject within 5 minutes. Confirm a uniform milky-white suspension; small air bubbles are normal. If more than 5 minutes pass before injection, shake again with the syringe tip pointing up for at least 15 seconds to re-suspend the medication.",
            sources.trinza,
          ),
          techniqueNote(
            "trinza-safety-device",
            "aftercare",
            "info",
            "label constraint",
            "Activate the needle protection system after injection until it clicks.",
            sources.trinza,
          ),
        ],
      },
    },
    hafyera: {
      key: "hafyera",
      source: sources.hafyera,
      facts: [
        fact(
          "hafyera-week-cadence",
          "label constraint",
          "INVEGA HAFYERA is an every-6-month product; due-date calculations use a fixed 182-day (26-week) interval so the scheduled return date falls on the same day of the week each cycle.",
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
        cadenceByInterval: { q26wk: { kind: "days", days: 182, label: "every 6 months" } },
        verifications: ["resuspend", "stabilized"],
        verificationRequirements: {
          maintenance: ["resuspend"],
          initiation: ["resuspend", "stabilized"],
          reinitiation: ["resuspend", "stabilized"],
        },
        verificationDetails: {
          resuspend: verificationDetail(
            "INVEGA HAFYERA resuspension and visual inspection completed",
            ({ dose }) =>
              `${prefilledDoseVolume("hafyera", "INVEGA HAFYERA", dose)} syringe shaken rapidly ≥15 sec, rested briefly, then shaken ≥15 sec more; uniform, thick, milky-white suspension confirmed, no particulate matter or discoloration observed.`,
            sources.hafyera,
          ),
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
      administration: {
        needleRules: [
          {
            siteGroups: ["gluteal"],
            needle: { gauge: "20G", length: '1½"', descriptor: "thin wall" },
            rationale: "Supplied gluteal needle; this product is gluteal only.",
          },
        ],
        needleUnresolved: "",
        angle: IM_ANGLE,
        siteRestriction: {
          headline: "Gluteal IM only",
          detail:
            "This product is for gluteal intramuscular injection only and must not be injected by any other route.",
        },
        notes: [
          techniqueNote(
            "hafyera-needle-cross-use",
            "needle",
            "caution",
            "label constraint",
            "Do not use needles from the 1-month or 3-month paliperidone products, or other commercially available needles. This is a highly concentrated product and substituting needles risks blockage.",
            sources.hafyera,
          ),
          techniqueNote(
            "hafyera-shake",
            "preparation",
            "info",
            "label constraint",
            "Inspect for particulate matter or discoloration. With the syringe tip cap up, shake very fast for at least 15 seconds, rest briefly, then shake again for 15 seconds. Proceed immediately and confirm a uniform, thick, milky-white suspension; small air bubbles are normal. If solids, uneven mix, or thin liquid remain, repeat the shaking sequence.",
            sources.hafyera,
          ),
          techniqueNote(
            "hafyera-safety-device",
            "aftercare",
            "info",
            "label constraint",
            "Activate the needle protection system after injection until it clicks.",
            sources.hafyera,
          ),
        ],
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
        cadenceByInterval: { q8wk: { kind: "days", days: 56, label: "every 2 months" } },
        timingMode: "orderVerify",
        verifications: ["resuspend"],
        verificationRequirements: { maintenance: ["resuspend"], initiation: ["resuspend"], reinitiation: ["resuspend"] },
        verificationDetails: {
          resuspend: verificationDetail(
            "UZEDY room-temperature, product, and bubble checks completed",
            ({ dose }) =>
              `${prefilledDoseVolume("uzedy", "UZEDY", dose)} kit reached room temperature in-package ≥30 min; suspension opaque white-to-off-white, free of non-white particles, bubble at the syringe cap.`,
            sources.uzedy,
          ),
        },
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
      administration: {
        needleRules: [
          {
            siteGroups: ["subq"],
            needle: { gauge: "21G", length: '5⁄8"', descriptor: "attached to prefilled syringe" },
            rationale: "Needle is supplied attached to the single-dose prefilled syringe.",
          },
        ],
        needleUnresolved: "",
        siteRestriction: {
          headline: "Subcutaneous only — abdomen or upper arm",
          detail:
            "This product is administered subcutaneously in the abdomen or upper arm. It is not an intramuscular product.",
        },
        notes: [
          techniqueNote(
            "uzedy-verify-needle",
            "needle",
            "info",
            "label constraint",
            'Verify the pouch label states the needle size is 21G × 5⁄8".',
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-room-temp",
            "preparation",
            "info",
            "label constraint",
            "Leave the unopened kit in its packaging and allow it to reach room temperature for at least 30 minutes. Do not warm it by another method. Confirm an opaque white-to-off-white suspension free of non-white particles and an intact kit before use.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-bubble-position",
            "preparation",
            "caution",
            "label constraint",
            "Forcefully flick the syringe downward three times to move the bubble to the cap, repeating the step if needed. Do not expel the visible bubble; failure to move it can cause incomplete dosing.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-angle-order-directed",
            "mechanics",
            "info",
            "label constraint",
            "Select the injection angle based on the amount of subcutaneous tissue, following the current product instructions.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-pinch",
            "mechanics",
            "info",
            "label constraint",
            "Pinch at least 1 inch of cleaned skin and insert into subcutaneous tissue. Release the pinch once the needle is in place.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-dwell",
            "mechanics",
            "info",
            "label constraint",
            "Wait 2–3 seconds after the full dose is delivered before withdrawing the needle.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-skin-exclusions",
            "mechanics",
            "caution",
            "label constraint",
            "Do not inject into skin that is tender, red, bruised, callused, tattooed, hard, scarred, or marked by stretch marks.",
            sources.uzedy,
          ),
          techniqueNote(
            "uzedy-no-massage",
            "aftercare",
            "caution",
            "label constraint",
            "Rotate sites and do not rub or massage the injection site.",
            sources.uzedy,
          ),
        ],
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
        verificationDetails: {
          resuspend: verificationDetail(
            "ABILIFY MAINTENA reconstitution and inspection completed",
            ({ dose, presentation }) => {
              const findings = "suspension uniform, opaque, and milky-white, no particulate matter or discoloration observed";
              if (presentation === "single-dose vial kit") {
                const volume = MAINTENA_VIAL_VOLUME_ML_BY_DOSE[dose.trim()];
                const volumeText = volume ? `, ${volume} mL prepared for injection` : "";
                return `ABILIFY MAINTENA ${dose} vial reconstituted; ${findings}${volumeText}.`;
              }
              if (presentation === "prefilled dual-chamber syringe") {
                return `ABILIFY MAINTENA ${dose} prefilled dual-chamber syringe reconstituted; ${findings}.`;
              }
              return `ABILIFY MAINTENA reconstituted per the ordered presentation; ${findings}.`;
            },
            sources.maintena,
          ),
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
      administration: {
        // Aripiprazole labels express this as non-obese/obese rather than a kg
        // threshold, so it keys to the habitus band, not weight.
        needleRules: [
          {
            siteGroups: ["deltoid"],
            habitus: ["larger"],
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Deltoid administration, obese patients.",
          },
          {
            siteGroups: ["deltoid"],
            habitus: ["lean", "average"],
            needle: { gauge: "23G", length: '1"' },
            rationale: "Deltoid administration, non-obese patients.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["larger"],
            needle: { gauge: "21G", length: '2"' },
            rationale: "Gluteal administration, obese patients.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["lean", "average"],
            needle: { gauge: "22G", length: '1½"' },
            rationale: "Gluteal administration, non-obese patients.",
          },
        ],
        needleUnresolved:
          "Needle selection depends on body habitus; document the habitus band to resolve the labeled needle.",
        angle: IM_ANGLE,
        notes: [
          techniqueNote(
            "maintena-deep-im",
            "mechanics",
            "info",
            "label constraint",
            "For deep intramuscular injection only. Do not administer by any other route.",
            sources.maintena,
          ),
          techniqueNote(
            "maintena-preparation",
            "preparation",
            "info",
            "label constraint",
            "The dual-chamber syringe and vial have different reconstitution procedures. Confirm the ordered presentation, then follow its current product instructions and inspect the reconstituted suspension before injection.",
            sources.maintena,
          ),
        ],
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
        cadenceByInterval: { q8wk: { kind: "days", days: 56, label: "every 2 months" } },
        timingMode: "orderVerify",
        verifications: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
        verificationRequirements: {
          maintenance: ["resuspend", "glutealOnly", "noMassage"],
          initiation: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
          reinitiation: ["resuspend", "aripiprazoleTolerability", "glutealOnly", "noMassage"],
        },
        verificationDetails: {
          resuspend: verificationDetail(
            "ABILIFY ASIMTUFII suspension prepared and visually inspected",
            ({ dose }) =>
              `${prefilledDoseVolume("asimtufii", "ABILIFY ASIMTUFII", dose)} syringe tapped ≥10 times, shaken vigorously ≥10 sec; uniform, opaque, milky-white suspension confirmed, no particulate matter or discoloration observed.`,
            sources.asimtufii,
          ),
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
      administration: {
        needleRules: [
          {
            siteGroups: ["gluteal"],
            habitus: ["larger"],
            needle: { gauge: "21G", length: '2"', descriptor: "green pack" },
            rationale: "Gluteal administration, obese patients.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["lean", "average"],
            needle: { gauge: "22G", length: '1½"', descriptor: "black pack" },
            rationale: "Gluteal administration, non-obese patients.",
          },
        ],
        needleUnresolved:
          "Needle selection depends on body habitus; document the habitus band to resolve the labeled needle.",
        angle: IM_ANGLE,
        siteRestriction: {
          headline: "Gluteal IM only",
          detail:
            "This product is for gluteal intramuscular injection only and must not be administered by any other route.",
        },
        notes: [
          techniqueNote(
            "asimtufii-kit-needles",
            "needle",
            "info",
            "label constraint",
            'The kit supplies two safety needles: 1½-inch 22 gauge (black packaging) and 2-inch 21 gauge (green packaging).',
            sources.asimtufii,
          ),
          techniqueNote(
            "asimtufii-resuspend",
            "preparation",
            "info",
            "label constraint",
            "Tap the syringe on the hand at least 10 times, then shake vigorously for at least 10 seconds until the medication is uniform. Inspect for particulate matter or discoloration before injection.",
            sources.asimtufii,
          ),
          techniqueNote(
            "asimtufii-no-massage",
            "aftercare",
            "caution",
            "label constraint",
            "Do not massage the injection site after administration.",
            sources.asimtufii,
          ),
        ],
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
        verifications: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
        verificationRequirements: {
          maintenance: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
          initiation: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
          reinitiation: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
          loading: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
          prn: ["resuspend", "opioidFree", "naltrexHS", "suppliedNeedle"],
        },
        verificationDetails: {
          resuspend: verificationDetail(
            "VIVITROL reconstitution and suspension check completed",
            "VIVITROL reached room temperature and was reconstituted with supplied diluent; milky-white, clump-free suspension confirmed moving freely down the vial walls, 4 mL prepared for immediate administration.",
            sources.vivitrol,
          ),
        },
        missedDoseGuidance:
          "Use the active provider order and current product information; reassess current opioid-risk status.",
        siteGuidance: "gluteal-im",
      },
      knowledge: {
        className: "Opioid antagonist LAI (monthly)",
        technique: "Use the supplied needle selected for body habitus and current deep-gluteal administration instructions.",
        preparation:
          "Powder-and-diluent kit; reconstitute only with supplied components and verify a milky-white, clump-free suspension before immediate administration.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Do not treat a generic timing calculation as clinical clearance; opioid-risk and contraindication review remain required for each administration.",
      },
      administration: {
        // The carton also contains a 20G 1-inch preparation needle. It is
        // deliberately not a rule here: it is for drawing up the suspension,
        // never for administration.
        needleRules: [
          {
            siteGroups: ["gluteal"],
            habitus: ["larger"],
            needle: { gauge: "20G", length: '2"', descriptor: "customized kit needle" },
            rationale:
              "Larger amount of subcutaneous tissue over the gluteal muscle; the longer needle helps the injectate reach muscle.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["lean"],
            needle: { gauge: "20G", length: '1½"', descriptor: "customized kit needle" },
            rationale:
              "In very lean patients, this supplied length helps avoid contacting the periosteum.",
          },
          {
            siteGroups: ["gluteal"],
            habitus: ["average"],
            needle: { gauge: "20G", length: '1½"', descriptor: "customized kit needle" },
            alternate: { gauge: "20G", length: '2"', descriptor: "customized kit needle" },
            rationale:
              "Either supplied administration needle may be used for an average amount of subcutaneous tissue; select and document the appropriate length.",
          },
        ],
        needleUnresolved:
          "This label requires body habitus assessed before each injection to confirm needle length; document the habitus band.",
        requiresHabitusAssessment: true,
        angle: IM_ANGLE,
        siteRestriction: {
          headline: "Deep gluteal IM only — never IV, subcutaneous, or into adipose tissue",
          detail:
            "Inadvertent subcutaneous injection increases the likelihood of severe injection site reactions. Take care to avoid injecting into a blood vessel.",
        },
        notes: [
          techniqueNote(
            "vivitrol-habitus-each-injection",
            "needle",
            "caution",
            "label constraint",
            "Assess body habitus before each injection to confirm the selected needle length is adequate for intramuscular administration.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-kit-needles-only",
            "needle",
            "caution",
            "label constraint",
            "The carton needles are customized. This product must not be injected using any other needle.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-habitus-precludes",
            "needle",
            "caution",
            "label constraint",
            "If body habitus precludes an intramuscular gluteal injection with one of the provided needles, alternate treatment should be considered — escalate rather than substituting a needle.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-site-reactions",
            "aftercare",
            "caution",
            "label constraint",
            "Injection site reactions including induration, cellulitis, hematoma, abscess, sterile abscess, and necrosis have been reported; some required surgical debridement. Escalate a worsening site reaction promptly.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-room-temp",
            "preparation",
            "info",
            "label constraint",
            "Allow the product to reach room temperature (approximately 45 minutes) before preparation.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-reconstitution",
            "preparation",
            "caution",
            "label constraint",
            "Using only the supplied components, inject 3.4 mL of diluent into the microsphere vial and shake vigorously for about 1 minute. Confirm a milky-white, clump-free suspension that moves freely down the vial walls.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-transfer",
            "preparation",
            "caution",
            "label constraint",
            "Immediately withdraw 4.2 mL with the supplied 1-inch preparation needle. Replace it with the selected supplied administration needle and prepare 4 mL for injection; the preparation needle is not for administration.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-administer-immediately",
            "preparation",
            "caution",
            "label constraint",
            "Administer immediately once the product has been suspended and transferred into the syringe.",
            sources.vivitrol,
          ),
          techniqueNote(
            "vivitrol-alternate-sides",
            "aftercare",
            "info",
            "label constraint",
            "Alternate buttocks between monthly injections.",
            sources.vivitrol,
          ),
        ],
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
        verifications: ["visualInspection"],
        verificationDetails: {
          visualInspection: verificationDetail(
            "HALDOL DECANOATE solution inspection completed",
            "HALDOL DECANOATE solution visually inspected: clear, yellow to light amber, free of visible debris.",
            sources.haldol,
          ),
        },
        missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
        siteGuidance: "order-directed",
      },
      knowledge: {
        className: "Typical antipsychotic LAI",
        technique: "Deep IM; label specifies a 21-gauge needle and maximum 3 mL per injection site. Actual site/technique follows the active order and local policy.",
        preparation:
          "Ready-to-use solution; inspect for debris, clarity, and the labeled yellow-to-light-amber color before use.",
        storage: "Store and protect from light according to the current carton and label.",
        staffGuardrail: "Do not imply a gluteal-only or Z-track requirement. Verify initial-dose splitting, exact dose, and technique against the active order.",
      },
      administration: {
        // No siteGroups selector: this label specifies a gauge but names no
        // anatomical site, and the fact table above explicitly warns against
        // implying one. The rule therefore applies to whatever site the order
        // directs, and there is deliberately no siteRestriction.
        needleRules: [
          {
            needle: { gauge: "21G", descriptor: "length per ordered site and depth" },
            rationale: "The label specifies a 21-gauge needle. Length follows the ordered site and tissue depth.",
          },
        ],
        needleUnresolved: "",
        maxVolumePerSite: {
          milliliters: 3,
          classification: "label constraint",
          note: "The label specifies a maximum of 3 mL per injection site.",
        },
        notes: [
          techniqueNote(
            "haldol-inspection",
            "preparation",
            "caution",
            "label constraint",
            "Inspect the solution before administration. Do not use it if debris is present or if it is not clear and yellow to light amber.",
            sources.haldol,
          ),
          techniqueNote(
            "haldol-gauge",
            "needle",
            "info",
            "label constraint",
            "The label specifies a 21-gauge needle and a maximum of 3 mL per injection site.",
            sources.haldol,
          ),
          techniqueNote(
            "haldol-deep-im",
            "mechanics",
            "info",
            "label constraint",
            "Administer by deep intramuscular injection. Do not administer intravenously.",
            sources.haldol,
          ),
          techniqueNote(
            "haldol-technique-order-directed",
            "mechanics",
            "caution",
            "order-dependent review",
            "This label does not prescribe a gluteal-only site or a Z-track requirement. Follow the active order and local policy for site and technique, and document what was actually used.",
            sources.haldol,
          ),
        ],
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
        verifications: ["visualInspection"],
        verificationDetails: {
          visualInspection: verificationDetail(
            "Dry equipment and applicable solution inspection completed",
            "Fluphenazine decanoate visually inspected when solution and container permitted, with no particulate matter or discoloration observed. Dry preparation equipment used.",
            sources.prolixin,
          ),
        },
        missedDoseGuidance: "Late-dose handling is individualized by the prescriber.",
        siteGuidance: "order-directed",
      },
      knowledge: {
        className: "Typical antipsychotic LAI",
        technique: "IM or subcutaneous administration; use a dry syringe and needle of at least 21 gauge per the current label.",
        preparation:
          "Ready-to-use oil solution; visually inspect when the solution and container permit, and use dry preparation equipment.",
        storage: "Use current carton and label storage instructions.",
        staffGuardrail: "Do not invent an anatomical default. Record the actual ordered route/site and follow provider/local technique direction.",
      },
      administration: {
        // As with haloperidol decanoate: a gauge floor but no anatomical site,
        // so no siteGroups selector and no siteRestriction.
        needleRules: [
          {
            needle: {
              gauge: "21G or larger bore",
              descriptor: "dry syringe; length per ordered site and depth",
            },
            rationale:
              "The source specifies a dry syringe and a needle of at least 21 gauge. Length follows the ordered site and tissue depth.",
          },
        ],
        needleUnresolved: "",
        notes: [
          techniqueNote(
            "prolixin-inspection",
            "preparation",
            "caution",
            "label constraint",
            "Visually inspect parenteral products for particulate matter and discoloration whenever solution and container permit.",
            sources.prolixin,
          ),
          techniqueNote(
            "prolixin-dry-syringe",
            "preparation",
            "caution",
            "label constraint",
            "Use a dry syringe and a needle of at least 21 gauge. Moisture may cause the solution to become cloudy.",
            sources.prolixin,
          ),
          techniqueNote(
            "prolixin-route",
            "mechanics",
            "info",
            "label constraint",
            "May be administered intramuscularly or subcutaneously per the active order.",
            sources.prolixin,
          ),
          techniqueNote(
            "prolixin-technique-order-directed",
            "mechanics",
            "caution",
            "order-dependent review",
            "This source defines no anatomical default site. Document the actual ordered route, site, and technique.",
            sources.prolixin,
          ),
        ],
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
