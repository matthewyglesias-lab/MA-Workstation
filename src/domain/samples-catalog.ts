/**
 * Typed port of legacy-runtime.js's SAMPLE_MEDS/SAMPLE_INTENTS oral-sample
 * medication catalog. Faithful transcription - the sig-option guidance,
 * titration notes, and patient watch/reminder text are clinical content,
 * not decorative copy, so this stays byte-for-byte with the legacy source
 * rather than being paraphrased.
 */

export type SampleMedicationKey =
  | "trintellix"
  | "austedo"
  | "ingrezza"
  | "aplenzin"
  | "auvelity"
  | "vraylar"
  | "caplyta"
  | "cobenfy"
  | "fanapt"
  | "lybalvi"
  | "rexulti"
  | "other";

export interface SampleDoseEntry {
  strength: string;
  qty: string;
  sig: string;
}

export interface SampleSigOption {
  label: string;
  strength: string;
  qty: string;
  sig: string;
  titration?: string;
  /** When selected, these additional dose/package rows are auto-added (e.g. Vraylar's 1.5mg -> 3mg step-up). */
  multiDose?: SampleDoseEntry[];
}

export interface SampleMedication {
  key: SampleMedicationKey;
  label: string;
  generic: string;
  className: string;
  strengths: string[];
  defaultSig: string;
  food: string;
  purpose: string;
  guard?: string;
  sigOptions: SampleSigOption[];
  watch: string[];
  reminders: string[];
}

export const SAMPLE_MEDICATIONS: SampleMedication[] = [
  {
    key: "trintellix",
    label: "Trintellix",
    generic: "vortioxetine",
    className: "antidepressant",
    strengths: ["5 mg tablet", "10 mg tablet", "20 mg tablet"],
    defaultSig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Medication sample start",
    sigOptions: [
      {
        label: "5 mg start",
        strength: "5 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Use the strength and duration selected by the prescriber. Do not change dose unless instructed.",
      },
      {
        label: "10 mg daily",
        strength: "10 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "20 mg daily",
        strength: "20 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
      },
    ],
    watch: [
      "Nausea or stomach upset can happen when starting.",
      "Call the clinic right away for new or worsening mood changes, suicidal thoughts, agitation, or unusual behavior.",
      "Tell the prescriber if taking other antidepressants, migraine medicines, blood thinners, or NSAIDs.",
    ],
    reminders: [
      "Do not change the dose or stop unless the prescriber tells you.",
      "It may take time to notice the full benefit.",
    ],
  },
  {
    key: "austedo",
    label: "Austedo / Austedo XR",
    generic: "deutetrabenazine",
    className: "VMAT2 inhibitor",
    strengths: ["6 mg tablet", "9 mg tablet", "12 mg tablet", "24 mg XR tablet", "Starter / titration pack"],
    defaultSig: "Take exactly as prescribed. Swallow tablets whole.",
    food: "with food",
    purpose: "Titration / starter pack",
    sigOptions: [
      {
        label: "Starter/titration pack",
        strength: "Starter / titration pack",
        qty: "starter pack",
        sig: "Take exactly as directed on the prescriber’s titration schedule. Swallow tablets whole.",
        titration: "Document the prescriber schedule here before printing, including dose changes and timing.",
      },
      {
        label: "Austedo BID",
        strength: "6 mg / 9 mg / 12 mg tablet",
        qty: "sample card",
        sig: "Take by mouth exactly as prescribed with food. Follow the written titration schedule.",
        titration: "Usually titration-sensitive. Confirm exact morning/evening instructions with prescriber.",
      },
      {
        label: "Austedo XR daily",
        strength: "Austedo XR tablet",
        qty: "sample card",
        sig: "Take by mouth once daily with food as prescribed. Swallow whole.",
        titration: "Confirm the exact XR strength and titration schedule before dispensing.",
      },
    ],
    watch: [
      "May cause sleepiness, fatigue, restlessness, or mood changes.",
      "Call the clinic for new or worsening depression, suicidal thoughts, severe restlessness, stiffness, or trouble swallowing.",
      "Avoid driving or risky activities until you know how it affects you.",
    ],
    reminders: [
      "Follow the prescriber’s titration schedule carefully.",
      "Do not crush, chew, or break tablets.",
    ],
  },
  {
    key: "ingrezza",
    label: "Ingrezza",
    generic: "valbenazine",
    className: "VMAT2 inhibitor",
    strengths: ["40 mg capsule", "60 mg capsule", "80 mg capsule", "Starter pack"],
    defaultSig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Medication sample start",
    sigOptions: [
      {
        label: "40 mg start",
        strength: "40 mg capsule",
        qty: "7–14 capsules or starter pack",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "80 mg target",
        strength: "80 mg capsule",
        qty: "7–14 capsules or sample card",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "Starter pack",
        strength: "Starter pack",
        qty: "starter pack",
        sig: "Take exactly as directed by the prescriber on the starter schedule. May be taken with or without food.",
        titration: "Confirm which capsules are used on each day/week before dispensing.",
      },
    ],
    watch: [
      "May cause sleepiness or tiredness.",
      "Call the clinic for severe sleepiness, fainting, fast/irregular heartbeat, allergic reaction, or unusual mood changes.",
      "Avoid driving or risky activities until you know how it affects you.",
    ],
    reminders: ["Take at the same time each day.", "Do not change dose unless the prescriber tells you."],
  },
  {
    key: "aplenzin",
    label: "Aplenzin",
    generic: "bupropion hydrobromide ER",
    className: "antidepressant",
    strengths: ["174 mg ER tablet", "348 mg ER tablet", "522 mg ER tablet"],
    defaultSig: "Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole.",
    food: "with or without food",
    purpose: "Medication sample start",
    sigOptions: [
      {
        label: "174 mg start",
        strength: "174 mg ER tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole.",
      },
      {
        label: "348 mg daily",
        strength: "348 mg ER tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole.",
      },
      {
        label: "522 mg daily",
        strength: "522 mg ER tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily in the morning as prescribed. Swallow whole.",
      },
    ],
    watch: [
      "May cause insomnia, dry mouth, headache, or anxiety when starting.",
      "Call the clinic right away for seizure, severe allergic reaction, very high blood pressure symptoms, or new/worsening mood changes.",
      "Avoid taking late in the day unless instructed.",
    ],
    reminders: [
      "Do not crush, split, or chew extended-release tablets.",
      "Avoid combining with other bupropion products unless the prescriber instructed it.",
    ],
  },
  {
    key: "auvelity",
    label: "Auvelity",
    generic: "dextromethorphan HBr / bupropion HCl ER",
    className: "antidepressant / NMDA antagonist",
    strengths: ["45 mg/105 mg ER tablet", "30 mg/105 mg ER tablet", "Sample titration pack"],
    defaultSig:
      "Take 1 tablet by mouth each morning for 3 days. Starting day 4, take 1 tablet twice daily at least 8 hours apart if prescriber instructed. Swallow whole.",
    food: "with or without food",
    purpose: "Titration / starter pack",
    guard: "Confirm no duplicate bupropion product, seizure-risk concern, MAOI use, or prescriber restriction before dispensing.",
    sigOptions: [
      {
        label: "MDD starter 45/105",
        strength: "45 mg/105 mg ER tablet",
        qty: "starter card or 7–14 tablets",
        sig: "Take 1 tablet by mouth each morning for 3 days. Starting day 4, take 1 tablet twice daily at least 8 hours apart if prescriber instructed. Swallow whole.",
        titration: "Do not take more than 2 tablets in 24 hours. Do not crush, chew, split, or divide.",
      },
      {
        label: "Once-daily 45/105",
        strength: "45 mg/105 mg ER tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth each morning as prescribed. Swallow whole.",
        titration: "Use once-daily schedule only when selected by prescriber; do not increase unless instructed.",
      },
      {
        label: "Sample titration pack",
        strength: "30 mg/105 mg + 45 mg/105 mg titration pack",
        qty: "sample titration pack",
        sig: "Use the sample titration pack exactly as directed by the prescriber. Take doses at least 8 hours apart when taking twice daily. Swallow tablets whole.",
        titration: "Write the prescriber’s day-by-day schedule here before printing.",
      },
    ],
    watch: [
      "Call right away for seizure, severe allergic reaction, confusion, hallucinations, very high blood pressure symptoms, or new/worsening mood changes.",
      "Tell the clinic/pharmacist about other bupropion products, antidepressants, migraine medicines, MAOIs, cough/cold medicines, or seizure history.",
      "Avoid taking extra doses if a dose is missed.",
    ],
    reminders: [
      "Swallow tablets whole. Do not crush, chew, split, or divide.",
      "Do not take more than 2 tablets in 24 hours.",
      "Avoid duplicate bupropion products unless the prescriber specifically instructed it.",
    ],
  },
  {
    key: "vraylar",
    label: "Vraylar",
    generic: "cariprazine",
    className: "atypical antipsychotic",
    strengths: ["1.5 mg capsule", "3 mg capsule", "4.5 mg capsule", "6 mg capsule", "Starter pack"],
    defaultSig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Titration / starter pack",
    sigOptions: [
      {
        label: "1.5 mg start",
        strength: "1.5 mg capsule",
        qty: "7–14 capsules or starter pack",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "3 mg daily",
        strength: "3 mg capsule",
        qty: "7–14 capsules or sample card",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "Starter pack",
        strength: "Starter pack",
        qty: "starter pack",
        sig: "Follow the prescriber’s starter pack schedule exactly. Take once daily as directed, with or without food.",
        titration: "Document the selected titration schedule before dispensing.",
      },
      {
        label: "1.5 mg → 3 mg",
        strength: "1.5 mg capsule",
        qty: "per prescriber (see titration)",
        sig: "Take 1 capsule by mouth once daily, then follow the prescriber’s next-step instructions.",
        titration:
          "Timing is indication-specific per PI: schizophrenia or bipolar mania — increase to 3 mg on Day 2 if tolerated; bipolar depression (adjunctive) — increase to 3 mg on Day 15. Confirm the treated indication and exact day with the prescriber before dispensing.",
        multiDose: [
          {
            strength: "Vraylar 3 mg capsule",
            qty: "per prescriber",
            sig: "Then take 1 capsule by mouth once daily as directed by the prescriber.",
          },
        ],
      },
    ],
    watch: [
      "Call for severe restlessness, stiffness, tremor, fever/confusion, fainting, or uncontrolled movements.",
      "May cause sleepiness, dizziness, nausea, or restlessness.",
      "Dose changes may take several weeks to fully show effect.",
    ],
    reminders: ["Take at the same time each day.", "Do not increase dose faster than the prescriber instructed."],
  },
  {
    key: "caplyta",
    label: "Caplyta",
    generic: "lumateperone",
    className: "atypical antipsychotic",
    strengths: ["42 mg capsule", "21 mg capsule", "10.5 mg capsule"],
    defaultSig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Medication sample start",
    guard:
      "Standard adult dose is usually 42 mg once daily; lower strengths are used for specific interaction or hepatic-impairment situations per prescriber.",
    sigOptions: [
      {
        label: "42 mg daily",
        strength: "42 mg capsule",
        qty: "7–14 capsules or sample card",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
      },
      {
        label: "21 mg daily",
        strength: "21 mg capsule",
        qty: "7–14 capsules or sample card",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Use this lower-strength option only when selected by the prescriber.",
      },
      {
        label: "10.5 mg daily",
        strength: "10.5 mg capsule",
        qty: "7–14 capsules or sample card",
        sig: "Take 1 capsule by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Use this reduced-dose option only when selected by the prescriber.",
      },
    ],
    watch: [
      "May cause sleepiness, dizziness, nausea, dry mouth, or diarrhea.",
      "Call the clinic right away for fever/confusion/stiffness, uncontrolled movements, fainting, severe allergic reaction, or new/worsening mood changes.",
      "Avoid driving or risky activities until you know how it affects you.",
    ],
    reminders: [
      "Take once daily at the time of day chosen by the prescriber.",
      "Dose titration is generally not needed unless the prescriber gives special instructions.",
    ],
  },
  {
    key: "cobenfy",
    label: "Cobenfy",
    generic: "xanomeline / trospium chloride",
    className: "muscarinic agonist / anticholinergic combination",
    strengths: ["50 mg/20 mg capsule", "100 mg/20 mg capsule", "125 mg/30 mg capsule", "Starter / titration pack"],
    defaultSig:
      "Take 1 capsule by mouth twice daily as prescribed on an empty stomach: at least 1 hour before food or at least 2 hours after food. Do not open capsules.",
    food: "empty stomach",
    purpose: "Titration / starter pack",
    guard:
      "Provider/order verification required before dispensing: active adult-schizophrenia plan; baseline liver enzymes/bilirubin and heart rate assessed; current-PI renal/hepatic, urinary-retention, gastric-retention, and narrow-angle-glaucoma considerations reviewed.",
    sigOptions: [
      {
        label: "Starter 50/20 BID",
        strength: "50 mg/20 mg capsule",
        qty: "starter pack or sample card",
        sig: "Take 1 capsule by mouth twice daily on an empty stomach: at least 1 hour before food or at least 2 hours after food. Do not open capsules.",
        titration:
          "PI: 50 mg/20 mg BID for ≥ 2 days, then 100 mg/20 mg BID for ≥ 5 days, then may increase to 125 mg/30 mg BID based on tolerability. Geriatric patients: start 50 mg/20 mg BID, consider slower titration, max 100 mg/20 mg BID. Confirm the exact schedule with the prescriber before dispensing.",
      },
      {
        label: "100/20 BID",
        strength: "100 mg/20 mg capsule",
        qty: "sample card",
        sig: "Take 1 capsule by mouth twice daily on an empty stomach as prescribed. Do not open capsules.",
      },
      {
        label: "125/30 BID",
        strength: "125 mg/30 mg capsule",
        qty: "sample card",
        sig: "Take 1 capsule by mouth twice daily on an empty stomach as prescribed. Do not open capsules.",
      },
    ],
    watch: [
      "Common issues may include nausea, constipation, dry mouth, indigestion, or dizziness.",
      "Call the clinic for trouble urinating, severe constipation, fainting, fast heart rate, severe stomach pain, yellowing skin/eyes, or dark urine.",
      "Tell the prescriber about liver, kidney, urinary, or stomach-emptying problems.",
    ],
    reminders: [
      "Take exactly on the titration schedule provided by the prescriber.",
      "Do not open, crush, or chew capsules.",
    ],
  },
  {
    key: "fanapt",
    label: "Fanapt",
    generic: "iloperidone",
    className: "atypical antipsychotic",
    strengths: [
      "1 mg tablet",
      "2 mg tablet",
      "4 mg tablet",
      "6 mg tablet",
      "8 mg tablet",
      "10 mg tablet",
      "12 mg tablet",
      "Titration pack",
    ],
    defaultSig: "Take by mouth twice daily as prescribed. Follow the titration schedule carefully.",
    food: "with or without food",
    purpose: "Titration / starter pack",
    guard:
      "Provider/order verification required before dispensing or restart: indication, current titration plan, QT-risk/interaction review, and any CYP2D6/CYP3A4 dose-adjustment plan verified.",
    sigOptions: [
      {
        label: "Titration pack",
        strength: "Titration pack",
        qty: "titration pack",
        sig: "Follow the prescriber’s Fanapt titration pack schedule exactly. Take twice daily as directed.",
        titration:
          "Document the prescriber’s titration schedule here before printing. If FANAPT has been stopped for more than 3 days, confirm the prescriber’s re-initiation titration plan before restarting.",
      },
      {
        label: "Titration strength",
        strength: "1 mg / 2 mg tablets",
        qty: "sample card",
        sig: "Take by mouth twice daily as prescribed. Follow the written titration schedule.",
      },
      {
        label: "Maintenance strength",
        strength: "6 mg / 8 mg / 10 mg / 12 mg tablet",
        qty: "sample card",
        sig: "Take 1 tablet by mouth twice daily as prescribed.",
      },
    ],
    watch: [
      "May cause dizziness or lightheadedness, especially when standing during titration.",
      "Call for fainting, racing/irregular heartbeat, severe dizziness, fever/confusion/stiffness, or uncontrolled movements.",
      "Stand up slowly until you know how it affects you.",
    ],
    reminders: [
      "Fanapt usually requires gradual titration before reaching the target dose.",
      "If FANAPT has been stopped for more than 3 days, confirm the prescriber’s re-initiation titration plan before restarting.",
    ],
  },
  {
    key: "lybalvi",
    label: "Lybalvi",
    generic: "olanzapine / samidorphan",
    className: "atypical antipsychotic with opioid antagonist",
    strengths: ["5 mg/10 mg tablet", "10 mg/10 mg tablet", "15 mg/10 mg tablet", "20 mg/10 mg tablet"],
    defaultSig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Medication sample start",
    guard:
      "Opioid safety check required: Lybalvi must not be used with opioids or during acute opioid withdrawal. Prescriber should confirm opioid-free status before start.",
    sigOptions: [
      {
        label: "5/10 sensitive start",
        strength: "5 mg/10 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Lower starting option. Confirm opioid-free status and prescriber plan before dispensing.",
      },
      {
        label: "10/10 start",
        strength: "10 mg/10 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Confirm opioid-free status and prescriber plan before dispensing.",
      },
      {
        label: "15/10 start",
        strength: "15 mg/10 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Often used when prescriber selects higher starting dose. Confirm opioid-free status before dispensing.",
      },
      {
        label: "20/10 daily",
        strength: "20 mg/10 mg tablet",
        qty: "7–14 tablets or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Target/highest listed strength. Use only if prescriber selected this strength.",
      },
    ],
    watch: [
      "Do not take with opioid pain medicines, opioid cough medicines, or opioid withdrawal treatment unless prescriber specifically reviewed it.",
      "Call right away for severe sleepiness, dizziness/fainting, confusion, fever/stiffness, uncontrolled movements, or allergic reaction.",
      "Tell providers and emergency clinicians that this medication contains an opioid-blocking component.",
    ],
    reminders: [
      "Be honest with the prescriber about any opioid use before starting.",
      "Take once daily as prescribed; do not change dose unless instructed.",
      "May cause sleepiness, dizziness, weight/metabolic changes, or dry mouth.",
    ],
  },
  {
    key: "rexulti",
    label: "Rexulti",
    generic: "brexpiprazole",
    className: "atypical antipsychotic",
    strengths: [
      "0.25 mg tablet",
      "0.5 mg tablet",
      "1 mg tablet",
      "2 mg tablet",
      "3 mg tablet",
      "4 mg tablet",
      "Starter pack",
    ],
    defaultSig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
    food: "with or without food",
    purpose: "Titration / starter pack",
    guard:
      "Provider/order verification required: indication-specific active dose and current renal/hepatic/CYP adjustment plan verified. REXULTI is not PRN for agitation associated with dementia due to Alzheimer's disease.",
    sigOptions: [
      {
        label: "0.25 mg start",
        strength: "0.25 mg tablet",
        qty: "7–14 tablets or starter pack",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration: "Use only when it matches the active provider plan/PI adjustment.",
      },
      {
        label: "0.5–1 mg titration",
        strength: "0.5 mg / 1 mg tablet",
        qty: "starter pack or sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. Follow the written titration schedule.",
      },
      {
        label: "Provider-selected 2–4 mg",
        strength: "2 mg / 3 mg / 4 mg tablet",
        qty: "sample card",
        sig: "Take 1 tablet by mouth once daily as prescribed. May be taken with or without food.",
        titration:
          "Confirm indication and active order; 4 mg is schizophrenia dosing, while MDD adjunctive therapy and agitation associated with dementia due to Alzheimer's disease are capped at 3 mg/day.",
      },
    ],
    watch: [
      "May cause sleepiness, restlessness, weight/metabolic changes, or dizziness.",
      "Call for severe restlessness, uncontrolled movements, fever/confusion/stiffness, fainting, or new/worsening mood changes.",
      "Tell the clinic about new or increased urges to gamble, shop, eat, or have sex.",
      "Avoid driving or risky activities until you know how it affects you.",
    ],
    reminders: ["Follow the prescriber’s titration schedule.", "Do not change dose unless instructed."],
  },
  {
    key: "other",
    label: "Other",
    generic: "",
    className: "manual entry",
    strengths: [""],
    defaultSig: "Take exactly as prescribed by your provider.",
    food: "custom",
    purpose: "Medication sample start",
    sigOptions: [
      {
        label: "Manual directions",
        strength: "",
        qty: "",
        sig: "Take exactly as prescribed by your provider.",
        titration: "Enter the prescriber’s complete directions before printing.",
      },
    ],
    watch: ["Call the clinic or pharmacist with questions about side effects or how to take this medication."],
    reminders: ["Follow the written prescriber instructions on this handout."],
  },
];

export const SAMPLE_MEDICATIONS_BY_KEY: Record<SampleMedicationKey, SampleMedication> = Object.fromEntries(
  SAMPLE_MEDICATIONS.map((medication) => [medication.key, medication]),
) as Record<SampleMedicationKey, SampleMedication>;

export interface SampleIntent {
  value: string;
  label: string;
  note: string;
}

export const SAMPLE_INTENTS: SampleIntent[] = [
  {
    value: "Medication sample start",
    label: "Start medication",
    note: "This sample is intended to help you start the medication exactly as your prescriber directed.",
  },
  {
    value: "Titration / starter pack",
    label: "Titration / starter",
    note: "This sample includes step-by-step dosing. Follow the sequence written by your prescriber.",
  },
  {
    value: "Bridge until pharmacy fill",
    label: "Bridge to pharmacy",
    note: "This sample is intended to help cover you while the pharmacy prescription is being processed.",
  },
  {
    value: "Dose change sample",
    label: "Dose change",
    note: "This sample supports a dose change. Use only the strength and schedule your prescriber directed.",
  },
  {
    value: "Tolerability trial",
    label: "Tolerability trial",
    note: "This sample is intended as a short trial so your provider can see how you tolerate the medication.",
  },
  {
    value: "Continuation sample",
    label: "Continuation",
    note: "This sample is intended to help you continue treatment while follow-up medication access is arranged.",
  },
];

/** Faithful port of legacy's selectSampleMed() auto-fill (label/purpose/sig/titration/food/qty), for the first sig option. */
export function sampleMedicationDefaults(
  medication: SampleMedication,
  sigOptionIndex = 0,
): {
  medicationLabel: string;
  purpose: string;
  directions: string;
  titration: string;
  foodInstructions: string;
  quantity: string;
} {
  const first = medication.sigOptions[sigOptionIndex];
  const strength = first?.strength || medication.strengths[0] || "";
  return {
    medicationLabel: medication.label + (strength ? ` ${strength}` : "") + (medication.generic ? ` (${medication.generic})` : ""),
    purpose: medication.purpose || "Medication sample start",
    directions: first?.sig || medication.defaultSig || "",
    titration: first?.titration || "",
    foodInstructions: "auto",
    quantity: first?.qty || medication.strengths[0] || "",
  };
}
