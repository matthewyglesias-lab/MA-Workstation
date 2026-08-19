import {
  INJECTION_MEDICATIONS,
  injectionIntervalLabel,
  type InjectionMedication,
  type InjectionMedicationKey,
  type InjectionIntervalKey,
} from "./injection-catalog";
import {
  INJECTION_CLINICAL_REFERENCE_BUNDLE,
  type InjectionMedicationClinicalReference,
} from "./injection-clinical-reference";
import { formatNeedleSpec } from "./injection-needle";

/**
 * A single labeled fact within a knowledge entry. Faithfully mirrors the
 * three row shapes legacy's kbPanel()/kbList()/kbFactGrid() rendered as raw
 * HTML strings, kept here as structured data instead so the panel renders
 * it directly rather than trusting pre-built markup.
 */
export type KnowledgeRow =
  | { label: string; kind: "text"; value: string }
  | { label: string; kind: "list"; items: string[] }
  | { label: string; kind: "facts"; items: Array<{ term: string; detail: string }> };

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  sub: string;
  icon: string;
  tags: string[];
  search: string;
  rows: KnowledgeRow[];
}

export type KnowledgeCategory = "all" | "lai" | "uds" | "samples" | "labs" | "tms" | "safety" | "ops";

export const KNOWLEDGE_CATEGORIES: ReadonlyArray<{ key: KnowledgeCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "lai", label: "LAIs" },
  { key: "uds", label: "UDS" },
  { key: "samples", label: "PO samples" },
  { key: "labs", label: "Labs/levels" },
  { key: "tms", label: "TMS" },
  { key: "safety", label: "Safety" },
  { key: "ops", label: "Office ops" },
];

const text = (label: string, value: string): KnowledgeRow => ({ label, kind: "text", value });
const list = (label: string, items: string[]): KnowledgeRow => ({ label, kind: "list", items });
const facts = (label: string, items: Array<{ term: string; detail: string }>): KnowledgeRow => ({
  label,
  kind: "facts",
  items,
});

const medDoseSummary = (med: InjectionMedication): string => {
  if (med.dosesByInterval) {
    return Object.entries(med.dosesByInterval)
      .map(([key, doses]) => `${injectionIntervalLabel(key as InjectionIntervalKey)}: ${(doses ?? []).join("/")}`)
      .join(" · ");
  }
  return med.doses.join(", ") || "—";
};

const medIntervalSummary = (med: InjectionMedication): string => {
  if (med.windowsByInterval) {
    return (
      Object.keys(med.windowsByInterval)
        .map((key) => injectionIntervalLabel(key as InjectionIntervalKey))
        .join(" or ") + " (set per order)"
    );
  }
  return injectionIntervalLabel(med.intervalKey);
};

const windowSummary = (med: InjectionMedication): string => {
  if (med.timingMode === "orderVerify") return "verify active order / current PI";
  if (med.windowsByInterval) {
    return Object.entries(med.windowsByInterval)
      .map(([key, w]) => {
        const before = w?.windowBefore ?? 0;
        const after = w?.windowAfter ?? 0;
        return `${injectionIntervalLabel(key as InjectionIntervalKey)} ±${before === after ? before : `${before}/${after}`}d`;
      })
      .join(" · ");
  }
  return med.windowBefore === med.windowAfter
    ? `±${med.windowBefore} days`
    : `${med.windowBefore}/${med.windowAfter} days`;
};

/**
 * Renders the product's needle table for the reference panel, reading the same
 * administration block the evaluator resolves against so this cannot drift
 * into a second hand-maintained needle list.
 */
const needleSummary = (reference: InjectionMedicationClinicalReference): string => {
  const rules = reference.administration.needleRules;
  if (!rules.length) return "—";
  return rules
    .map((rule) => {
      const scope = [
        rule.siteGroups?.length ? rule.siteGroups.join("/") : "",
        rule.doses?.length ? rule.doses.join("/") : "",
        rule.weightKg
          ? `${rule.weightKg.kind === "below" ? "<" : "≥"}${rule.weightKg.kg} kg`
          : "",
        rule.habitus?.length ? rule.habitus.join("/") : "",
      ]
        .filter(Boolean)
        .join(" ");
      const needle = [formatNeedleSpec(rule.needle), rule.alternate ? `or ${formatNeedleSpec(rule.alternate)}` : ""]
        .filter(Boolean)
        .join(" ");
      return scope ? `${scope}: ${needle}` : needle;
    })
    .join(" · ");
};

const medicationKnowledgeEntries = (): KnowledgeEntry[] =>
  (Object.keys(INJECTION_MEDICATIONS) as InjectionMedicationKey[])
    .filter((key): key is Exclude<InjectionMedicationKey, "other"> => key !== "other")
    .map((key) => {
      const med = INJECTION_MEDICATIONS[key];
      // Keep the reference panel on the same versioned source as evaluation.
      const reference = INJECTION_CLINICAL_REFERENCE_BUNDLE.medications[key];
      const supplement = {
        cls: reference.knowledge.className,
        tech: reference.knowledge.technique,
        recon: reference.knowledge.preparation,
        storage: reference.knowledge.storage,
        caution: reference.knowledge.staffGuardrail,
      };
      // Preparation was independently re-reviewed from the broader clinical
      // reference bundle. Keep that provenance visible here too: this panel
      // renders the same preparation synopsis as the Injection workspace,
      // and its older general-reference date must not look like the prep
      // instruction's review date.
      const preparationSource = reference.administration.notes.find(
        (note) => note.phase === "preparation",
      )?.source;
      return {
        id: `lai-${key}`,
        category: "lai",
        title: med.name,
        sub: `${med.generic} · ${supplement.cls}`,
        icon: "LAI",
        tags: ["Injection", "Safety", "AVS"],
        search: [med.name, med.generic, supplement.cls, med.key, "injection LAI long acting"].join(" "),
        rows: [
          text("Doses", medDoseSummary(med)),
          text(
            "Route/site",
            `${med.route || "—"} · ${med.defaultSite || "—"} · interval ${medIntervalSummary(med)} · window ${windowSummary(med)}`,
          ),
          text("Technique", supplement.tech || "—"),
          text("Needle", needleSummary(reference)),
          text("Prep/storage", `${supplement.recon || "—"} ${supplement.storage || "—"}`.trim()),
          ...(preparationSource
            ? [
                text(
                  "Preparation source",
                  `${preparationSource.title}; ${preparationSource.labelRevision}; reviewed ${preparationSource.reviewedOn}.`,
                ),
              ]
            : []),
          text("Late/missed", med.missedDoseGuidance || "Verify against current PI and prescriber direction."),
          text(
            "MA guardrail",
            supplement.caution ||
              "Verify active order, tolerability, lot/exp/NDC, and site/route before documenting.",
          ),
          text(
            "Reference",
            `${reference.source.title}; ${reference.source.labelRevision}; reviewed ${reference.source.reviewedOn}.`,
          ),
        ],
      };
    });

const UDS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "uds-wording",
    category: "uds",
    title: "UDS result language",
    sub: "How to document point-of-care screens without over-interpreting",
    icon: "UDS",
    tags: ["UDS", "Handoff", "Language"],
    search:
      "urine drug screen point of care immunoassay preliminary positive negative invalid confirmation",
    rows: [
      list("Best wording", [
        "Use “preliminary positive” rather than “positive” for office immunoassay results.",
        "Use “not readily explained by available medication list” rather than “inconsistent” when staff are handing off to a clinician.",
        "Use “provider to review in clinical context” for the final interpretation.",
      ]),
      list("Validity first", [
        "Control line present = result can be read.",
        "Control line missing/invalid = do not interpret; repeat or outside lab confirmation per provider direction.",
        "Document not-tested panels separately from invalid/unreadable panels.",
      ]),
      text(
        "Confirmatory testing",
        "Point-of-care results are screening results. Outside lab confirmation may be ordered if clinically indicated or required by provider/policy.",
      ),
      list("Thumbnail examples", [
        "UDS handoff — all tested panels negative; validity acceptable; FYI only.",
        "UDS handoff — +THC/+BZO; not readily explained by available medication list; provider review requested.",
        "UDS handoff — invalid control line; do not interpret; repeat/confirmation needed.",
      ]),
    ],
  },
  {
    id: "uds-panel-map",
    category: "uds",
    title: "UDS panel map",
    sub: "Common cup abbreviations translated for staff and patient handouts",
    icon: "MAP",
    tags: ["UDS", "Panels", "Patient language"],
    search: "AMP BAR BUP BZO COC MDMA MET MOP MTD OXY PCP PPX TCA THC meaning",
    rows: [
      facts("Opioid / MAT-related", [
        { term: "BUP", detail: "Buprenorphine screen" },
        { term: "MTD", detail: "Methadone screen" },
        { term: "MOP/OPI", detail: "Morphine/opiate screen" },
        { term: "OXY", detail: "Oxycodone screen" },
        { term: "PPX", detail: "Propoxyphene screen" },
      ]),
      facts("Sedative / psych", [
        { term: "BZO", detail: "Benzodiazepine screen" },
        { term: "BAR", detail: "Barbiturate screen" },
        { term: "TCA", detail: "Tricyclic antidepressant screen" },
      ]),
      facts("Stimulant / illicit", [
        { term: "AMP", detail: "Amphetamine screen" },
        { term: "MET", detail: "Methamphetamine screen" },
        { term: "COC", detail: "Cocaine screen" },
        { term: "MDMA", detail: "MDMA/ecstasy screen" },
        { term: "PCP", detail: "Phencyclidine screen" },
      ]),
      facts("Cannabis", [{ term: "THC", detail: "Cannabis/marijuana screen" }]),
    ],
  },
  {
    id: "uds-checklist",
    category: "uds",
    title: "UDS workflow checklist",
    sub: "What the MA should complete before routing to provider",
    icon: "CHK",
    tags: ["UDS", "Workflow", "Provider review"],
    search:
      "UDS workflow checklist provider review outside lab specimen validity medication list patient explanation",
    rows: [
      list("Before logging", [
        "Patient and DOB entered.",
        "Collection date/time and collected by completed.",
        "Device, lot, and expiration documented.",
        "Control line/result validity selected.",
        "Panels marked negative/preliminary positive/invalid/not tested.",
      ]),
      list("If preliminary positive", [
        "Move positive panels to clinician attention.",
        "Document patient comment if offered; do not argue or interpret.",
        "Mark medication alignment as a handoff, not a final conclusion.",
        "Choose provider action: FYI, review, review before controlled-med decision, or consider outside lab confirmation.",
      ]),
      text(
        "Patient summary",
        "Use plain-language names such as “cannabis/marijuana screen” instead of unexplained panel codes like THC/BZO.",
      ),
    ],
  },
];

const SAMPLES_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "samples-principles",
    category: "samples",
    title: "Sample dispensing principles",
    sub: "Patient-friendly, prescriber-first sample workflow",
    icon: "RX",
    tags: ["Samples", "Handout", "Traceability"],
    search: "oral medication samples quantity lot expiration prescriber instructions patient handout",
    rows: [
      text("Source of truth", "The prescriber’s sig and titration intent override any quick-fill suggestion."),
      list("Always capture", [
        "Medication and strength.",
        "Quantity/package, including packs/kits/boxes.",
        "Lot and expiration.",
        "Prescriber and dispensed by.",
        "Patient instructions and whether more than one strength was provided.",
      ]),
      text(
        "Multi-strength guardrail",
        "When multiple strengths are dispensed, the handout should clearly say which strength to take first and that the patient should not take more than one strength together unless the prescriber specifically instructed it.",
      ),
      text(
        "Common intents",
        "Start medication · titration/starter · bridge to pharmacy fill · dose change · tolerability trial · continuation",
      ),
    ],
  },
  {
    id: "samples-auvelity",
    category: "samples",
    title: "Auvelity sample guardrails",
    sub: "Dextromethorphan/bupropion ER",
    icon: "AUV",
    tags: ["Samples", "MDD", "Safety"],
    search: "Auvelity dextromethorphan bupropion sample sig seizure duplicate bupropion MAOI",
    rows: [
      list("Common sample sigs", [
        "45/105 mg ER: take 1 tablet by mouth in the morning as directed.",
        "If prescriber directs BID: take doses at least 8 hours apart.",
        "Do not crush, cut, or chew ER tablets.",
      ]),
      list("MA safety prompts", [
        "Ask/flag duplicate bupropion products.",
        "Flag seizure history, eating-disorder history, or MAOI concern for provider review.",
        "Do not change dose without prescriber direction.",
      ]),
      text(
        "Handout phrasing",
        "“This sample is to help you start or bridge treatment exactly as your provider directed. Do not take extra tablets if you miss a dose unless your provider tells you to.”",
      ),
    ],
  },
  {
    id: "samples-caplyta",
    category: "samples",
    title: "Caplyta sample guardrails",
    sub: "Lumateperone",
    icon: "CAP",
    tags: ["Samples", "Antipsychotic", "Safety"],
    search: "Caplyta lumateperone sample 42 mg 21 mg 10.5 mg sleepiness orthostatic falls",
    rows: [
      text(
        "Common strengths",
        "42 mg capsule is the standard adult strength; 21 mg and 10.5 mg are lower-strength options for specific prescriber-selected situations.",
      ),
      list("Patient reminders", [
        "Take once daily as directed, with or without food.",
        "May cause sleepiness, dizziness, or lightheadedness.",
        "Rise slowly and use caution with driving until the patient knows how it affects them.",
      ]),
      text(
        "MA guardrail",
        "Lower strengths should not be treated as casual starter doses; use exactly as prescribed, especially with interaction/hepatic considerations.",
      ),
    ],
  },
  {
    id: "samples-lybalvi",
    category: "samples",
    title: "Lybalvi sample guardrails",
    sub: "Olanzapine/samidorphan",
    icon: "LYB",
    tags: ["Samples", "Opioid warning", "Safety"],
    search: "Lybalvi olanzapine samidorphan opioid contraindication acute withdrawal sample handout",
    rows: [
      text(
        "Hard stop prompt",
        "Flag for provider review if the patient is using opioids, recently used opioids, may need opioid pain treatment, or is in/at risk for opioid withdrawal.",
      ),
      list("Patient reminders", [
        "Take once daily as directed, with or without food.",
        "Do not start opioid medicines unless the provider knows the patient takes Lybalvi.",
        "Seek urgent help for severe sedation, allergic symptoms, or symptoms concerning for opioid withdrawal/overdose.",
      ]),
      text(
        "Handoff wording",
        "“Opioid-safety review completed/needs provider review” should be obvious in the sample note and readiness panel.",
      ),
    ],
  },
  {
    id: "samples-titration",
    category: "samples",
    title: "Titration-sensitive samples",
    sub: "Fanapt, Vraylar, Austedo, Cobenfy, and similar meds",
    icon: "TIT",
    tags: ["Samples", "Titration", "Safety"],
    search: "Fanapt titration Vraylar long half life Austedo titration Cobenfy empty stomach sample workflow",
    rows: [
      text(
        "Fanapt",
        "Titration should stay front-and-center because rapid titration can increase orthostatic hypotension/syncope risk.",
      ),
      text(
        "Vraylar",
        "Dose changes can take time to show full effect due to long half-life/active metabolites; handout should avoid implying immediate dose-response.",
      ),
      text(
        "Austedo",
        "Titration kit instructions should be explicit; remind patient to take exactly as directed and not to double doses unless prescribed.",
      ),
      text(
        "Cobenfy",
        "Handout should emphasize empty-stomach timing and “do not open capsules.” MA should flag urinary retention, narrow-angle glaucoma, significant hepatic/renal concerns, and gallbladder/liver symptoms per protocol.",
      ),
    ],
  },
];

const LABS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "labs-snapshot",
    category: "labs",
    title: "Psych lab monitoring snapshot",
    sub: "What MAs should know when routing routine labs and med-monitoring results",
    icon: "LAB",
    tags: ["Labs", "Monitoring", "Psych meds"],
    search:
      "psychiatry lab monitoring antipsychotic mood stabilizer metabolic CBC CMP TSH A1c lipid prolactin pregnancy ECG",
    rows: [
      list("Core principle", [
        "Labs support provider decision-making; staff should not interpret or change treatment plans.",
        "Use lab reference ranges, ordering provider instructions, and clinic protocol first.",
        "Flag clearly abnormal, missing, late, or wrong-timing labs for provider review.",
      ]),
      facts("Common psych lab buckets", [
        { term: "Metabolic", detail: "Weight/BMI, blood pressure, HbA1c or glucose, lipid panel" },
        { term: "Safety", detail: "CBC, CMP/LFTs, renal function, electrolytes" },
        { term: "Endocrine", detail: "TSH, prolactin when clinically indicated" },
        { term: "Medication levels", detail: "Lithium, valproate, carbamazepine, clozapine/norclozapine when ordered" },
        { term: "Other", detail: "Pregnancy test, ECG, UDS, or disease-specific labs per order" },
      ]),
      text(
        "MA handoff phrase",
        "“Lab/level received or pending; provider review requested. Timing, reference range, and current medication context should be reviewed by provider.”",
      ),
      list("Avoid", [
        "Do not tell a patient a medication level is “safe,” “toxic,” or “therapeutic” without provider direction.",
        "Do not assume a level is useful if it was not drawn at the correct time.",
        "Do not omit timing details when documenting drug levels.",
      ]),
    ],
  },
  {
    id: "labs-metabolic",
    category: "labs",
    title: "Antipsychotic metabolic monitoring",
    sub: "Weight, BP, blood sugar, and lipids for SGAs/LAIs",
    icon: "META",
    tags: ["Labs", "Antipsychotics", "Metabolic", "Safety"],
    search:
      "antipsychotic metabolic monitoring weight BMI blood pressure A1c glucose lipids baseline 12 weeks annually",
    rows: [
      text(
        "Why it matters",
        "Second-generation antipsychotics and many LAIs can be associated with weight, glucose, and lipid changes; providers commonly monitor weight/BMI, blood pressure, HbA1c or glucose, and lipid panel.",
      ),
      list("Common schedule concept", [
        "Baseline before or near start when possible.",
        "Early follow-up around 12 weeks / 3 months after start or major change.",
        "Ongoing annual monitoring, or more often if abnormal/high-risk per provider.",
        "Weight/BMI and BP may be checked more often because they are easy office measures.",
      ]),
      list("Useful MA flags", [
        "No recent A1c/glucose or lipid panel on chart when starting/changing antipsychotic.",
        "Rapid weight gain or patient reports new excessive thirst/urination.",
        "Very abnormal BP/vitals or symptoms.",
        "Patient asks why labs are needed: explain they help the provider monitor medication safety.",
      ]),
      text(
        "Patient-friendly wording",
        "“These labs help your provider watch for medication-related changes in blood sugar, cholesterol, weight, and overall safety.”",
      ),
    ],
  },
  {
    id: "labs-lithium",
    category: "labs",
    title: "Lithium level handoff",
    sub: "Timing and safety items to route clearly",
    icon: "Li",
    tags: ["Labs", "Drug levels", "Lithium", "Mood stabilizer"],
    search: "lithium level trough 8 12 hours renal thyroid calcium toxicity dehydration NSAID ACE diuretic",
    rows: [
      text(
        "Timing",
        "Lithium levels are commonly drawn as a trough about 8–12 hours after the most recent dose. Document when the patient last took lithium and when the blood was drawn if known.",
      ),
      list("Usual monitoring context", [
        "Kidney function and thyroid function are commonly monitored with lithium.",
        "Calcium may also be monitored because lithium can be associated with hypercalcemia/hyperparathyroidism.",
        "Levels are often checked after dose changes, adherence concerns, side effects, dehydration/illness, or interacting medication changes.",
      ]),
      list("Provider-review flags", [
        "Nausea/vomiting, diarrhea, worsening tremor, confusion, weakness, trouble walking, severe sedation.",
        "Dehydration, fever, heavy sweating, acute illness, or major sodium/fluid change.",
        "New NSAID, ACE inhibitor/ARB, diuretic, or other interacting medication reported.",
        "Level not drawn as trough or timing unknown.",
      ]),
      text(
        "Handoff note",
        "“Lithium level/labs available or pending. Last dose time: __. Draw time: __. Symptoms/concerns: __. Provider review requested.”",
      ),
    ],
  },
  {
    id: "labs-valproate",
    category: "labs",
    title: "Valproate / divalproex level handoff",
    sub: "Trough timing, liver/CBC context, and symptom flags",
    icon: "VPA",
    tags: ["Labs", "Drug levels", "Valproate", "Mood stabilizer"],
    search: "valproate valproic acid divalproex level trough LFT CBC platelets ammonia pregnancy symptoms toxicity",
    rows: [
      text(
        "Timing",
        "Valproate levels are usually most useful as a trough, commonly just before the next dose. Document last dose and draw time when possible.",
      ),
      list("Common associated labs", [
        "Liver function/CMP.",
        "CBC with platelets.",
        "Pregnancy-related considerations when applicable.",
        "Ammonia may be ordered if symptoms suggest encephalopathy, per provider judgment.",
      ]),
      list("Provider-review flags", [
        "Extreme sedation, confusion, vomiting, abdominal pain, jaundice, unusual bruising/bleeding.",
        "Pregnancy or possible pregnancy.",
        "Level drawn at wrong/unclear time.",
        "Reported missed doses or extra doses.",
      ]),
      text(
        "Handoff note",
        "“Valproate/divalproex level available or pending. Last dose time: __. Draw time: __. CBC/CMP status: __. Symptoms/concerns: __.”",
      ),
    ],
  },
  {
    id: "labs-carbamazepine",
    category: "labs",
    title: "Carbamazepine / oxcarbazepine labs",
    sub: "Levels, sodium, CBC/CMP, and rash precautions",
    icon: "CBZ",
    tags: ["Labs", "Drug levels", "Carbamazepine", "Oxcarbazepine", "Mood stabilizer"],
    search: "carbamazepine level trough CBC CMP sodium oxcarbazepine hyponatremia rash Stevens Johnson",
    rows: [
      text(
        "Timing",
        "Carbamazepine levels are typically interpreted as troughs; document last dose and draw time. Oxcarbazepine monitoring often emphasizes sodium and clinical status rather than a routine serum level.",
      ),
      list("Common associated labs", [
        "CBC and CMP/LFTs for carbamazepine.",
        "Sodium level especially for oxcarbazepine or symptoms of hyponatremia.",
        "Pregnancy and interaction considerations per provider.",
      ]),
      list("Provider-review flags", [
        "Rash, mouth sores, fever, sore throat, or flu-like symptoms.",
        "Dizziness, ataxia, diplopia, confusion, severe sedation.",
        "Low sodium symptoms: headache, confusion, weakness, seizures.",
        "Level timing unclear or recent interacting medication change.",
      ]),
      text(
        "Handoff note",
        "“Carbamazepine/oxcarbazepine monitoring result available or pending. Last dose/draw timing: __. Sodium/CBC/CMP status: __. Symptoms/concerns: __.”",
      ),
    ],
  },
  {
    id: "labs-clozapine",
    category: "labs",
    title: "Clozapine ANC and level handoff",
    sub: "ANC schedule concepts, clozapine/norclozapine levels, and urgent symptoms",
    icon: "CLZ",
    tags: ["Labs", "Drug levels", "Clozapine", "ANC", "Safety"],
    search:
      "clozapine ANC monitoring weekly every two weeks monthly clozapine level norclozapine smoking infection seizure myocarditis constipation",
    rows: [
      list("ANC schedule concept", [
        "Baseline ANC is required before starting.",
        "Common product-label schedule: weekly for first 6 months, every 2 weeks for months 7–12, then monthly if acceptable ANC is maintained.",
        "BEN/Duffy-null associated neutrophil count has different ANC thresholds; provider/pharmacy protocol should direct.",
      ]),
      list("Clozapine level context", [
        "Clozapine/norclozapine levels may help evaluate adherence, toxicity, smoking changes, infection/inflammation, interactions, or nonresponse.",
        "Timing matters; document last dose and draw time.",
        "Smoking changes can affect clozapine exposure and should be routed to provider.",
      ]),
      list("Provider-review flags", [
        "Fever, sore throat, flu-like illness, signs of infection.",
        "Chest pain, shortness of breath, marked tachycardia, severe fatigue.",
        "Seizure, severe sedation, confusion.",
        "Severe constipation, abdominal pain, vomiting, or no bowel movement.",
        "Smoking stopped/started/changed significantly.",
      ]),
      text(
        "Handoff note",
        "“Clozapine ANC/level available or pending. ANC schedule stage: __. Last dose/draw timing: __. Smoking/infection/constipation concerns: __. Provider review requested.”",
      ),
    ],
  },
  {
    id: "labs-stimulant",
    category: "labs",
    title: "Stimulant / ADHD monitoring cues",
    sub: "Vitals, growth/appetite, and when labs are not the main monitor",
    icon: "ADHD",
    tags: ["Labs", "Vitals", "ADHD", "Safety"],
    search: "stimulant ADHD monitoring blood pressure heart rate weight appetite growth labs ECG",
    rows: [
      text(
        "Core monitoring",
        "For stimulant and some non-stimulant ADHD medications, BP/HR, weight, appetite, sleep, and symptom response are often more relevant than routine drug levels.",
      ),
      list("MA prompts", [
        "BP/HR obtained if clinic protocol requires.",
        "Weight/appetite/sleep concerns documented.",
        "Chest pain, fainting, palpitations, severe anxiety/agitation, or new tics routed to provider.",
        "For children/adolescents, growth/appetite concerns should be routed.",
      ]),
      text(
        "ECG/labs",
        "ECG or labs are not universal for every ADHD medication; they should follow provider order, cardiac history, symptoms, and clinic protocol.",
      ),
      text(
        "Handoff note",
        "“ADHD medication monitoring: BP __ HR __ weight __. Patient reports: __. Provider review requested for: __.”",
      ),
    ],
  },
  {
    id: "labs-workflow",
    category: "labs",
    title: "Lab-result workflow for MAs",
    sub: "How to document, route, and close the loop without over-interpreting",
    icon: "FLOW",
    tags: ["Labs", "Office ops", "Provider review"],
    search: "lab result workflow route provider review patient notified psychiatry office close loop",
    rows: [
      list("Intake checklist", [
        "Result type and date.",
        "Ordering provider.",
        "Medication it relates to.",
        "Whether timing was correct or unknown.",
        "Patient symptoms/comments if they called about the result.",
        "Whether outside lab/fax result is uploaded to Tebra.",
      ]),
      list("Routing status", [
        "FYI only.",
        "Provider review requested.",
        "Urgent provider review.",
        "Patient asking for results.",
        "Repeat lab/order needed per provider direction.",
      ]),
      text(
        "Patient communication",
        "Avoid giving detailed interpretation unless a provider has reviewed and documented instructions. Use “Your provider will review the result and the office will follow up if any action is needed,” unless clinic policy says otherwise.",
      ),
      text(
        "Closeout phrase",
        "“Lab result routed to provider. Patient notified per provider direction: __. Follow-up/repeat lab status: __.”",
      ),
    ],
  },
];

const TMS_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "tms-scaffold",
    category: "tms",
    title: "TMS future workflow scaffold",
    sub: "Placeholder knowledge base for upcoming TMS operations",
    icon: "TMS",
    tags: ["TMS", "Coming soon", "Workflow"],
    search: "TMS rTMS depression treatment session workflow PHQ9 GAD7 technician note safety screen",
    rows: [
      list("Core session data", [
        "Patient and treatment number.",
        "Protocol/device once confirmed.",
        "Motor threshold date and treatment intensity.",
        "Session tolerance, side effects, and technician initials.",
        "Next appointment/status.",
      ]),
      text(
        "Symptom tracking",
        "Plan for PHQ-9 / GAD-7 cadence once clinic protocol is finalized. Consider baseline, periodic interval, and end-of-course summary.",
      ),
      text(
        "MA note style",
        "“TMS session #__ completed per protocol. Patient tolerated treatment without acute complication. Side effects/safety concerns: __. Next session: __.”",
      ),
    ],
  },
  {
    id: "tms-safety",
    category: "tms",
    title: "TMS safety screen concepts",
    sub: "Items to confirm with the TMS provider/protocol",
    icon: "SAFE",
    tags: ["TMS", "Safety", "Provider review"],
    search:
      "TMS safety seizure risk metal implants hearing protection headache scalp discomfort medication changes sleep alcohol",
    rows: [
      list("Provider-review triggers", [
        "New seizure, fainting, neurologic event, or head injury.",
        "Medication changes that may affect seizure threshold.",
        "Significant sleep deprivation, alcohol/substance change, or withdrawal concern.",
        "New implanted metal/electronic device concern near head/neck.",
        "Severe headache, scalp pain, hearing concern, or new mania/activation symptoms.",
      ]),
      text(
        "Common patient experience",
        "Many patients report mild headache or scalp discomfort; serious events like seizure are rare but protocol-dependent.",
      ),
      text(
        "Before go-live",
        "Confirm device-specific checklist, contraindications, hearing protection workflow, emergency process, and documentation requirements.",
      ),
    ],
  },
];

const PSYCH_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "safety-vitals",
    category: "safety",
    title: "Vitals / provider-review prompts",
    sub: "Operational thresholds to route, not diagnose",
    icon: "VS",
    tags: ["Safety", "Vitals", "Injection"],
    search: "vitals blood pressure heart rate temperature provider review injection psychiatry MA",
    rows: [
      list("Urgent review examples", [
        "Very high BP, especially ≥180 systolic or ≥120 diastolic.",
        "Chest pain, shortness of breath, palpitations, syncope, severe dizziness, fall concern.",
        "Fever with rigidity/confusion or severe muscle symptoms.",
        "Severe injection-site reaction, allergic symptoms, or acute neurologic symptoms.",
      ]),
      text(
        "Documentation tone",
        "Use “provider notified / provider review requested / held per provider” rather than staff clinical conclusions.",
      ),
      text(
        "Clinic settings",
        "Consider a future protocol drawer so IPMG can set yellow/red thresholds and escalation wording by provider-approved policy.",
      ),
    ],
  },
  {
    id: "ops-handoff",
    category: "ops",
    title: "Provider handoff language",
    sub: "Useful phrases for MA documentation across modules",
    icon: "H/O",
    tags: ["Ops", "Handoff", "Tebra"],
    search: "provider handoff note language staff documentation psych clinic tebra",
    rows: [
      list("Use", [
        "“Provider review requested.”",
        "“Routed to provider for review.”",
        "“No final clinical interpretation made by staff.”",
        "“Patient comment/context documented as reported.”",
        "“Outside lab confirmation may be ordered if clinically indicated.”",
      ]),
      list("Avoid", [
        "“Patient is inconsistent.”",
        "“Patient failed UDS.”",
        "“Medication is contraindicated” unless the prescriber/policy directly determines it.",
        "Definitive diagnosis/work restriction wording without provider approval.",
      ]),
      text(
        "Thumbnail formula",
        "Task — key abnormal/important finding; action needed; status. Example: “UDS handoff — +THC/+BZO; not readily explained by available med list; provider review requested.”",
      ),
    ],
  },
  {
    id: "ops-letters",
    category: "ops",
    title: "Letters & forms guardrails",
    sub: "Draft support without overstepping provider/legal decisions",
    icon: "LTR",
    tags: ["Forms", "Letters", "Ops"],
    search: "forms letters diagnosis off work return to work provider approval psychiatry office",
    rows: [
      text(
        "Staff role",
        "Prepare drafts, track status, collect context, and route to provider. Provider determines diagnosis language, restrictions, dates, and release.",
      ),
      list("Before release", [
        "Correct patient and DOB.",
        "Recipient and purpose clear.",
        "Provider/signature selected.",
        "Fee/status handled if clinic policy applies.",
        "Diagnosis, off-work, restrictions, and return-to-work language approved by provider.",
      ]),
      text(
        "Handoff phrase",
        "“Draft prepared for provider review/signature; not released pending provider approval.”",
      ),
    ],
  },
];

export const allKnowledgeEntries = (): KnowledgeEntry[] => [
  ...medicationKnowledgeEntries(),
  ...UDS_KNOWLEDGE,
  ...SAMPLES_KNOWLEDGE,
  ...LABS_KNOWLEDGE,
  ...TMS_KNOWLEDGE,
  ...PSYCH_KNOWLEDGE,
];

export const searchKnowledgeEntries = (
  entries: readonly KnowledgeEntry[],
  category: KnowledgeCategory,
  query: string,
): KnowledgeEntry[] => {
  const byCategory = category === "all" ? entries : entries.filter((entry) => entry.category === category);
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...byCategory];
  return byCategory.filter((entry) =>
    `${entry.title} ${entry.sub} ${entry.tags.join(" ")} ${entry.search}`.toLowerCase().includes(trimmed),
  );
};
