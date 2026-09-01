/**
 * Patient-facing After Visit Summary content for the Injection workflow.
 *
 * This module owns *what the patient is told*, separately from how it is
 * printed. Everything here is a pure function of the encounter values, so the
 * clinical wording can be reviewed in one file and unit-tested without a
 * browser or the legacy print pipeline.
 *
 * Clinical statements below are drawn from current FDA labeling for each
 * product (DailyMed / accessdata.fda.gov). They are written at a patient
 * reading level rather than quoted verbatim. The specific label points this
 * file encodes:
 *
 *  - INVEGA SUSTENNA: initiation is 234 mg on day 1 and 156 mg one week later,
 *    both deltoid, with the second dose allowed 4 days either side of the
 *    one-week point. Monthly maintenance may be given up to 7 days either side
 *    of the monthly point and may use deltoid or gluteal.
 *  - VIVITROL: 380 mg deep gluteal IM every 4 weeks, alternating buttocks.
 *    Opioid tolerance is reduced and patients are vulnerable to potentially
 *    fatal overdose at the end of a dosing interval, after a missed dose, or
 *    after stopping. Injection-site reactions may be very severe.
 *  - UZEDY: subcutaneous, abdomen or upper arm only; do not inject skin that
 *    is tender, red, bruised, hard, callused, or tattooed. Must reach room
 *    temperature before administration, which is why the clinic asks patients
 *    to call ahead.
 *  - ABILIFY MAINTENA: 14 consecutive days of oral aripiprazole after the
 *    first injection.
 *  - ARISTADA: either ARISTADA INITIO plus one oral aripiprazole 30 mg dose,
 *    or 21 consecutive days of oral aripiprazole.
 *
 * Nothing here decides whether an injection may be given. The evaluator in
 * injection.ts owns clinical gating; this module only describes what already
 * happened and what the patient should do next.
 */

/** Anatomical region a documented site string falls into. */
export type AvsSiteRegion =
  | "deltoid"
  | "ventrogluteal"
  | "dorsogluteal"
  | "abdomen"
  | "upper-arm"
  | "unspecified";

/** How hard the sheet pushes the patient to hit the exact due date. */
export type AvsDateFirmness = "standard" | "firm" | "call-first";

export interface InjectionAvsInput {
  patientName: string;
  patientDob: string;
  recordNumber: string;
  orderingProvider: string;
  administeredBy: string;
  /** Catalog key ("sustenna", "vivitrol", ...) or "other"/"" when uncatalogued. */
  medicationKey: string;
  medicationName: string;
  genericName: string;
  dose: string;
  route: string;
  site: string;
  intervalKey: string;
  /** ISO yyyy-mm-dd. */
  administrationDate: string;
  administrationTime: string;
  /** ISO yyyy-mm-dd; empty when the clinic has not set one. */
  nextDoseDate: string;
  lot: string;
  expiration: string;
  responseLabel: string;
  /** scheduled | initiation | reinit | loading | prn */
  reason: string;
  /** Initiation protocol id from injection.ts, or "". */
  initiationProtocol: string;
  /** Day 1 date for the Invega Sustenna day-8 protocol. */
  day1Date: string;
  clinicPhone: string;
  /**
   * Clinical disposition: "" | "administered" | "held" | "escalated" |
   * "provider". The AVS is printable before a disposition is chosen so staff
   * can preview it, so an empty value must behave exactly like "administered".
   * Only an explicit non-administration choice neutralises the sheet.
   */
  dispositionKind?: string;
  /**
   * Explicit preview/final rendering mode, independent of dispositionKind.
   * When true, documentStatus is always "STAFF PREVIEW - NOT FINAL" —
   * administered, held, escalated, and provider previews alike — so a
   * not-yet-finalized preview can never visually read as a finalized
   * "PATIENT COPY" or "CARE HANDOFF" document. Leave unset/false for the
   * one true finalization render.
   */
  previewMode?: boolean;
  /**
   * The paired second injection, for the one-day dual protocols that give two
   * injections in different muscles at the same visit. Component 2 is the same
   * product as the primary on every protocol that populates it, so it needs no
   * separate medication name. `secondGiven` gates the whole thing: a
   * part-filled paired protocol must never have the sheet claim a second
   * injection that was not administered.
   */
  secondDose?: string;
  secondSite?: string;
  secondLot?: string;
  secondExpiration?: string;
  secondGiven?: boolean;
  /** "administered" | "verified" | "" - the oral dose these protocols require. */
  oralStatus?: string;
}

export interface AvsDataRow {
  label: string;
  value: string;
}

export type AvsSectionKind =
  | "timing"
  | "site-care"
  | "expected-effects"
  | "medication-reminder"
  | "call-clinic"
  | "emergency"
  | "contact"
  | "critical-alert";

export interface AvsBlock {
  /** Stable presentation and pagination key; never infer this from copy. */
  kind: AvsSectionKind;
  heading: string;
  /** Renders as an inverse-video banner rather than a plain ruled heading. */
  emphasis?: boolean;
  paragraphs?: string[];
  items?: string[];
  rows?: AvsDataRow[];
}

export interface AvsScheduleRow {
  label: string;
  date: string;
  dose: string;
  site: string;
  status: string;
  due?: boolean;
}

/**
 * How a timeline step is marked on the printed spine: something already done,
 * something the patient must keep doing in the meantime, the next thing due, or
 * the pattern the schedule settles into afterwards.
 */
export type AvsTimelineState = "given" | "action" | "due" | "ongoing";

export interface AvsTimelineStep {
  /** Gutter date, e.g. "Aug 12". Empty when the step has no fixed date. */
  when: string;
  /** Small-caps qualifier under the date: "Today", "Through", "Next". */
  whenNote: string;
  title: string;
  /**
   * Full weekday-and-year date, restated in the step body. Set only where the
   * compact gutter date is not enough on its own - the next dose, which is the
   * one date the patient has to act on and the only one the sheet would
   * otherwise print without a year or a weekday.
   */
  dateLong?: string;
  detail: string[];
  state: AvsTimelineState;
}

export interface InjectionAvsModel {
  documentTitle: string;
  /** Second title line, e.g. the starting-series marker. Empty when routine. */
  documentSubtitle: string;
  /** Makes the release state explicit without allowing a preview to look final. */
  documentStatus: "PATIENT COPY" | "STAFF PREVIEW - NOT FINAL" | "CARE HANDOFF";
  identity: AvsDataRow[];
  nextDose: {
    /** Long form, e.g. "Wednesday, September 2, 2026". Empty when unscheduled. */
    dateLong: string;
    heading: string;
    instruction: string;
    firmness: AvsDateFirmness;
    /** Sentences under the date explaining the call-if-you-cannot-make-it path. */
    notes: string[];
    contactLines: AvsDataRow[];
  };
  /** Shown above the next-dose block when the medication needs a call first. */
  leadAlerts: AvsBlock[];
  /**
   * Ordered steps the printed spine draws. Initiation encounters legitimately
   * produce more steps than routine ones - that difference is the point, and
   * the print stylesheet must never cap or truncate it.
   */
  timeline: AvsTimelineStep[];
  schedule: AvsScheduleRow[];
  scheduleNote: string;
  administration: AvsDataRow[];
  administrationNote: string;
  /** Ordered instruction blocks between the record and the emergency banner. */
  blocks: AvsBlock[];
  emergency: AvsBlock;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const isoParts = (iso: string): [number, number, number] | null => {
  const parts = String(iso ?? "").trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts as [number, number, number];
  // The year bound rejects two-digit input like "26-08-05", which otherwise
  // parses as year 26 and prints as "Aug 5, 26".
  if (!y || !m || !d || y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return [y, m, d];
};

/** "2026-09-02" -> "Wednesday, September 2, 2026". Empty input yields "". */
export const formatLongDate = (iso: string): string => {
  const parts = isoParts(iso);
  if (!parts) return "";
  const [y, m, d] = parts;
  // Construct in UTC so the weekday never shifts with the runner's timezone.
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${day}, ${MONTHS[m - 1]} ${d}, ${y}`;
};

/** "2026-09-02" -> "09/02/2026". Empty input yields "". */
export const formatShortDate = (iso: string): string => {
  const parts = isoParts(iso);
  if (!parts) return "";
  const [y, m, d] = parts;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
};

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "2026-08-12" -> "Aug 12". Used for the printed timeline's date gutter, where
 * the year is already established by the visit date and would only add width.
 */
export const formatGutterDate = (iso: string, referenceIso = ""): string => {
  const parts = isoParts(iso);
  if (!parts) return "";
  const [year, m, d] = parts;
  const reference = isoParts(referenceIso);
  // The year is dropped only when it matches the visit's, where repeating it
  // would be noise. It is kept whenever they differ - Trinza is dosed q12wk and
  // Hafyera q26wk, so their next dose routinely lands in the following calendar
  // year, and a bare "Feb 3" on the sheet's single most important fact is
  // genuinely ambiguous. With no reference date to compare against, keep the
  // year rather than guess.
  const sameYear = reference ? reference[0] === year : false;
  return `${MONTH_ABBR[m - 1]} ${d}${sameYear ? "" : `, ${year}`}`;
};

/** "2027-11" -> "11/2027"; passes anything else through untouched. */
export const formatExpiration = (value: string): string => {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : trimmed;
};

const shiftDays = (iso: string, days: number): string => {
  const parts = isoParts(iso);
  if (!parts) return "";
  const [y, m, d] = parts;
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate(),
  ).padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/* Site handling                                                       */
/* ------------------------------------------------------------------ */

/** Maps a documented site string onto the region its aftercare depends on. */
export const siteRegion = (site: string): AvsSiteRegion => {
  const value = String(site ?? "").toLowerCase();
  if (!value.trim()) return "unspecified";
  if (value.includes("ventrogluteal")) return "ventrogluteal";
  if (value.includes("dorsogluteal")) return "dorsogluteal";
  if (value.includes("gluteal") || value.includes("buttock")) return "ventrogluteal";
  if (value.includes("deltoid")) return "deltoid";
  if (value.includes("abdomen") || value.includes("abdominal")) return "abdomen";
  if (value.includes("arm")) return "upper-arm";
  return "unspecified";
};

/** Plain-language site name, e.g. "right deltoid (upper arm)". */
export const describeSite = (site: string, route: string): string => {
  const raw = String(site ?? "").trim();
  if (!raw) return "";
  const side = /^\s*R\b/i.test(raw) ? "Right" : /^\s*L\b/i.test(raw) ? "Left" : "";
  const region = siteRegion(raw);
  const plain: Record<AvsSiteRegion, string> = {
    deltoid: "deltoid (upper arm)",
    ventrogluteal: "hip (ventrogluteal)",
    dorsogluteal: "upper outer buttock (dorsogluteal)",
    abdomen: "abdomen",
    "upper-arm": "upper arm",
    unspecified: "",
  };
  const routeWord = /subq|subcut/i.test(String(route ?? "")) ? "subcutaneous" : "intramuscular";
  if (region === "abdomen") {
    // Abdomen sites carry their own quadrant wording already (e.g. "LUQ").
    const quadrant = /luq/i.test(raw)
      ? "left upper"
      : /ruq/i.test(raw)
        ? "right upper"
        : /llq/i.test(raw)
          ? "left lower"
          : /rlq/i.test(raw)
            ? "right lower"
            : "";
    const label = quadrant ? `${quadrant} abdomen` : "abdomen";
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${routeWord}`;
  }
  if (!plain[region]) return `${raw}, ${routeWord}`;
  const label = side ? `${side} ${plain[region]}` : plain[region];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${routeWord}`;
};

/** Baseline aftercare for the region, before medication-specific additions. */
const siteCareForRegion = (region: AvsSiteRegion, subcutaneous: boolean): string[] => {
  if (subcutaneous) {
    return [
      region === "abdomen"
        ? "Some tenderness, redness, or a small bump where the needle went in is normal for a day or two. A cool pack helps."
        : "Some tenderness, redness, or a small bump in the upper arm is normal for a day or two. A cool pack helps.",
      "Do not rub or scratch the area. Leave it uncovered and keep it clean and dry.",
      "Your next injection should go in a different spot than today's, so the same patch of skin is not used twice in a row.",
    ];
  }
  switch (region) {
    case "deltoid":
      return [
        "Soreness, redness, or a small firm lump in the arm is normal for a few days. A cool pack helps.",
        "Do not rub or massage the site - rubbing can change how the medication is absorbed.",
        "Go easy on heavy lifting and overhead work with that arm for the rest of today.",
      ];
    case "ventrogluteal":
      return [
        "Soreness or a firm lump at the hip is normal for a few days, and it may ache when you sit or walk at first. A cool pack helps.",
        "Do not rub or massage the site.",
        "Gentle walking is fine and usually helps the ache settle faster than sitting still.",
      ];
    case "dorsogluteal":
      return [
        "Soreness or a firm lump in the upper outer buttock is normal for a few days, and sitting may be uncomfortable at first. A cool pack helps.",
        "Do not rub or massage the site.",
        "Gentle walking is fine and usually helps the ache settle faster than sitting still.",
      ];
    default:
      return [
        "Soreness, redness, or a small firm lump at the injection site is normal for a few days. A cool pack helps.",
        "Do not rub or massage the site.",
      ];
  }
};

/* ------------------------------------------------------------------ */
/* Medication profiles                                                 */
/* ------------------------------------------------------------------ */

interface MedProfile {
  /** Why this particular medication needs the date kept. */
  timingReason: string[];
  /** Refrigerated products the clinic must pull and warm before the visit. */
  coldChain?: boolean;
  /** Extra site-care lines appended after the region baseline. */
  siteCareExtra?: string[];
  expect?: string[];
  callClinic?: string[];
  emergency?: string[];
  /** Rendered above the next-dose block, e.g. Vivitrol's overdose warning. */
  leadAlert?: AvsBlock;
}

const ANTIPSYCHOTIC_EXPECT = [
  "Follow the oral medication plan from your clinician. Do not stop or change a medicine unless they tell you to.",
  "Mild drowsiness or restlessness can happen in the first few days.",
  "Get up slowly from sitting or lying down for the first day or two.",
];

const ANTIPSYCHOTIC_CALL = [
  "You develop new stiffness, tremor, or unusual movements you have not had before.",
  "You feel very restless and cannot sit still.",
];

const ANTIPSYCHOTIC_ER = [
  "Trouble breathing, chest tightness, or severe dizziness.",
  "Swelling of the face, lips, tongue, or throat.",
  "High fever with muscle stiffness, confusion, or a racing heartbeat.",
];

const PALIPERIDONE_TIMING = [
  "This medication is released slowly out of the muscle between injections. The amount in your body is lowest right before your next dose is due.",
  "A late injection lets that level keep falling, and symptoms can return before the next dose has time to take hold.",
];

const ARIPIPRAZOLE_TIMING = [
  "This medication builds up to a steady level over the first few months and is then held there by each injection.",
  "A late injection lets that level drop, and it takes time to build back up again once you restart.",
];

const MED_PROFILES: Record<string, MedProfile> = {
  sustenna: {
    timingReason: [
      ...PALIPERIDONE_TIMING,
      "If you fall far enough behind, your provider may have to restart you on two injections a week apart instead of simply continuing monthly.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  erzofri: {
    timingReason: [
      ...PALIPERIDONE_TIMING,
      "If you fall far enough behind, your provider may have to restart the starting series instead of simply continuing monthly.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  trinza: {
    timingReason: [
      "This is a 3-month injection. It only works this way because you were already steady on the monthly form first.",
      "If it is given too late, your provider may have to put you back on monthly injections and build up again before you can return to the 3-month schedule.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  hafyera: {
    timingReason: [
      "This is a 6-month injection. It only works this way because you were already steady on a shorter-acting form first.",
      "Because doses are so far apart, a missed one is harder to recover from - your provider may have to restart you on more frequent injections.",
      "Put the next date somewhere you will see it. Six months is a long time to remember on your own.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  maintena: {
    timingReason: ARIPIPRAZOLE_TIMING,
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  asimtufii: {
    timingReason: [
      "This is a 2-month injection that holds a steady level of aripiprazole between doses.",
      "Because the doses are further apart, a late one leaves a longer gap than it would with a monthly injection.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  aristada: {
    timingReason: ARIPIPRAZOLE_TIMING,
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  initio: {
    timingReason: [
      "This was a one-time starting injection. It is used to get your medication level up quickly at the beginning and is not repeated.",
      "From here on, your regular Aristada injections are what keep that level steady - so the next date matters.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  uzedy: {
    coldChain: true,
    timingReason: [
      "This medication is released slowly from just under the skin between injections. The amount in your body is lowest right before your next dose is due.",
      "A late injection lets that level keep falling, and symptoms can return before the next dose takes hold.",
    ],
    siteCareExtra: [
      "Do not let anyone inject into skin that is sore, red, bruised, hard, callused, or tattooed. Point that out to the nurse if it applies to you.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  vivitrol: {
    coldChain: true,
    timingReason: [
      "The opioid-blocking effect fades toward the end of the month. A late injection leaves a gap where you are no longer protected but your tolerance is still low.",
      "That gap is the highest-risk time. Coming in on your due date closes it.",
    ],
    siteCareExtra: [
      "Your next injection goes in the other side, so the same muscle is not used twice in a row.",
      "Injection-site reactions to this medication can become serious. Look at the site once a day for the first two weeks.",
    ],
    expect: [
      "Nausea, tiredness, or headache can happen in the first few days and usually settles.",
      "Carry your naloxone (Narcan) if you have it, and make sure someone close to you knows where it is and how to use it.",
      "Tell any doctor, dentist, or emergency crew treating you that you are on Vivitrol - it changes which pain medications will work.",
    ],
    callClinic: [
      "The injection site develops intense pain, a hard lump that keeps growing, large swelling, blisters, an open sore, or a dark scab.",
      "The injection site is not getting better after two weeks.",
      "You have nausea, vomiting, stomach pain, unusual tiredness, dark urine, or your eyes or skin look yellow.",
      "You feel unusually down, or have thoughts of hurting yourself.",
    ],
    emergency: [
      "You suspect an opioid overdose in yourself or someone else - give naloxone and call 911.",
      "Trouble breathing, chest tightness, or severe dizziness.",
      "Swelling of the face, lips, tongue, or throat.",
    ],
    leadAlert: {
      kind: "critical-alert",
      heading: "Important: opioid tolerance and overdose risk",
      emphasis: true,
      paragraphs: [
        "Vivitrol blocks the effect of opioids. Your body's tolerance to opioids is now much LOWER than it was before you started.",
        "You are most at risk near the end of the month as the block wears off, if you miss a dose, and after you stop Vivitrol altogether. At those times the amount of an opioid you used to take can cause an overdose or death.",
        "Do not try to override the block by taking a large amount of an opioid. Keep naloxone (Narcan) on hand and make sure the people around you know how to use it.",
      ],
    },
  },
  haldol: {
    timingReason: [
      "This medication is released slowly out of the muscle over the weeks between injections, keeping a steady level in your body.",
      "Your provider sets the exact interval for you, so keep the date you were given even if it is not a neat calendar month.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
  prolixin: {
    timingReason: [
      "This medication is released slowly out of the muscle over the weeks between injections, keeping a steady level in your body.",
      "Your provider sets the exact interval for you, so keep the date you were given even if it is not a neat calendar month.",
    ],
    expect: ANTIPSYCHOTIC_EXPECT,
    callClinic: ANTIPSYCHOTIC_CALL,
    emergency: ANTIPSYCHOTIC_ER,
  },
};

const DEFAULT_PROFILE: MedProfile = {
  timingReason: [
    "This is a long-acting injection. It works by holding a steady level of medication in your body between visits.",
    "A late injection lets that level fall, so keeping your next date is what keeps the medication working the way it should.",
  ],
  expect: [
    "Follow the oral medication plan from your clinician. Do not stop or change a medicine unless they tell you to.",
  ],
  callClinic: [],
  emergency: ANTIPSYCHOTIC_ER,
};

const profileFor = (key: string): MedProfile => MED_PROFILES[key] ?? DEFAULT_PROFILE;

/** Products the clinic must take out of the refrigerator and warm first. */
export const requiresColdChainCall = (medicationKey: string): boolean =>
  Boolean(profileFor(medicationKey).coldChain);

/* ------------------------------------------------------------------ */
/* Dose- and phase-specific notes                                      */
/* ------------------------------------------------------------------ */

const normalizeDose = (dose: string): string =>
  String(dose ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Notes that depend on the exact strength given. These exist because several
 * strengths are starting-only doses, and two strengths are ambiguous unless
 * the interval is read alongside them.
 */
export const doseNote = (
  medicationKey: string,
  dose: string,
  intervalKey: string,
): string => {
  const value = normalizeDose(dose);
  if (medicationKey === "sustenna" && value === "234 mg") {
    return "The 234 mg strength is a starting dose. It is larger than your regular monthly dose will be.";
  }
  if (medicationKey === "erzofri" && value === "351 mg") {
    return "The 351 mg strength is the first-day starting dose and is given in the arm. Your regular monthly doses will be smaller.";
  }
  if (medicationKey === "initio") {
    return "This is a one-time starting injection. It will not be repeated.";
  }
  if (medicationKey === "uzedy" && value === "100 mg") {
    if (intervalKey === "q8wk") {
      return "This strength is part of the every-2-month schedule. Some Uzedy strengths look similar but belong to the monthly schedule, so go by the date on this sheet.";
    }
    if (intervalKey === "q4wk") {
      return "This strength is part of the monthly schedule. Some Uzedy strengths look similar but belong to the every-2-month schedule, so go by the date on this sheet.";
    }
    return "The 100 mg strength can be given monthly or every 2 months. Follow the interval and date on this sheet.";
  }
  if (
    medicationKey === "uzedy" &&
    ["50 mg", "75 mg", "125 mg"].includes(value)
  ) {
    return "At this strength, your Uzedy injections are scheduled monthly. Go by the date on this sheet.";
  }
  if (
    medicationKey === "uzedy" &&
    ["150 mg", "200 mg", "250 mg"].includes(value)
  ) {
    return "At this strength, your Uzedy injections are scheduled every 2 months. Go by the date on this sheet.";
  }
  if (medicationKey === "aristada" && value === "882 mg") {
    if (intervalKey === "q6wk") {
      return "At this strength your injections are every 6 weeks rather than monthly. Go by the date on this sheet.";
    }
    if (intervalKey === "q4wk") {
      return "At this strength your injections are monthly. Go by the date on this sheet.";
    }
    return "The 882 mg strength can be given monthly or every 6 weeks. Follow the interval and date on this sheet.";
  }
  if (medicationKey === "aristada" && ["441 mg", "662 mg"].includes(value)) {
    return "At this strength your Aristada injections are scheduled monthly. Go by the date on this sheet.";
  }
  if (medicationKey === "aristada" && value === "1064 mg") {
    return "At this strength your Aristada injections are every 2 months and are given in a gluteal muscle. Go by the date on this sheet.";
  }
  return "";
};

interface InitiationPlan {
  subtitle: string;
  firm: boolean;
  /**
   * The date the patient must actually return, when that is not the encounter's
   * ordinary next-dose date. During a two-step start the encounter still
   * carries the *monthly* projection, but the next thing due is the second
   * starting injection - printing the monthly date under a "come back for your
   * second injection" banner would send the patient back weeks late.
   */
  nextDoseDateOverride?: string;
  /** Banner shown above the next-dose block. */
  alert?: AvsBlock;
  /** Extra instruction block, e.g. the oral-overlap countdown. */
  block?: AvsBlock;
  /**
   * Oral-overlap length and its last day, when the protocol has one. The alert
   * block spells these out in prose; the timeline reuses the same values so the
   * date the patient must remember is stated once and drawn once.
   */
  oralDays?: number;
  oralLastDay?: string;
  /** Overrides the next-dose heading, e.g. the day-8 return. */
  nextHeading?: string;
  schedule?: AvsScheduleRow[];
  scheduleNote?: string;
}

/**
 * Turns an initiation protocol into the patient-facing starting instructions.
 * These are deliberately more detailed than maintenance wording: the starting
 * period is where a missed step costs the most and where patients have the
 * least context.
 */
const initiationPlan = (input: InjectionAvsInput): InitiationPlan | null => {
  const protocol = String(input.initiationProtocol ?? "").trim();
  if (!protocol) return null;
  const phone = input.clinicPhone;

  if (protocol === "sustenna-day1") {
    const day8 = shiftDays(input.administrationDate, 7);
    return {
      subtitle: "Starting series - dose 1 of 2",
      firm: true,
      nextDoseDateOverride: day8,
      nextHeading: "Come back for your second starting injection",
      schedule: [
        {
          label: "DOSE 1 (TODAY)",
          date: formatShortDate(input.administrationDate),
          dose: input.dose || "-",
          site: (input.site || "DELTOID").toUpperCase(),
          status: "GIVEN",
        },
        {
          label: "DOSE 2 (DAY 8)",
          date: formatShortDate(day8),
          dose: "per your order",
          site: "DELTOID",
          status: "DUE",
          due: true,
        },
      ],
      scheduleNote:
        "Your regular monthly schedule is set from the day you come in for dose 2, so coming in on time also gives you a clean date going forward.",
      block: {
        kind: "medication-reminder",
        heading: "Why the second starting injection matters",
        paragraphs: [
          "These first two injections work together to build the medication up to a steady level. Today's injection on its own does not get you there.",
          `If the second dose is missed or given very late, the starting series may have to begin again from dose 1 - meaning today's injection would not count. Coming in on ${formatShortDate(day8)} is the single most important thing you can do for this medication right now.`,
          "Both starting injections are given in the arm. Tell the nurse which arm was used today so the second dose can go in the other one.",
        ],
      },
    };
  }

  if (protocol === "sustenna-day8") {
    return {
      subtitle: "Starting series - dose 2 of 2",
      firm: false,
      block: {
        kind: "medication-reminder",
        heading: "You have finished the starting series",
        paragraphs: [
          "That was the second of your two starting injections. From here you move onto a regular monthly schedule.",
          "Your next injection is the first of those monthly doses. It can be given in the arm or the hip - the starting doses had to be in the arm, but the monthly ones do not.",
        ],
      },
    };
  }

  if (protocol === "aristada-initio-sameday") {
    return {
      subtitle: "Starting day - Initio plus first regular dose",
      firm: false,
      block: {
        kind: "medication-reminder",
        heading: "What happened today and what comes next",
        paragraphs: [
          "Today you received a one-time starting injection (Aristada Initio) together with your first regular Aristada injection, plus a single dose of oral aripiprazole by mouth.",
          "The starting injection is not repeated. You do not need to keep taking oral aripiprazole after today's single dose unless your provider specifically told you to.",
          "From here, the regular Aristada injection on the date below is what keeps your level steady.",
        ],
      },
    };
  }

  if (protocol === "aristada-21day" || protocol === "maintena-14day" || protocol === "asimtufii-14day") {
    const days = protocol === "aristada-21day" ? 21 : 14;
    const lastDay = shiftDays(input.administrationDate, days - 1);
    const lastDayLong = formatLongDate(lastDay);
    return {
      subtitle: "Starting dose - oral medication continues",
      firm: false,
      oralDays: days,
      oralLastDay: lastDay,
      alert: {
        kind: "critical-alert",
        heading: `Keep taking your oral medication for ${days} days`,
        emphasis: true,
        paragraphs: [
          `Take your oral medication every day through ${lastDayLong || `${days} days from today`}. That is ${days} days in a row counting today.`,
          "Today's injection is not yet at full strength. The oral doses cover you while it builds up - stopping early leaves you without enough medication.",
          `If you run out, lose them, or are not sure how many days you have left, call ${phone} rather than stopping.`,
        ],
      },
    };
  }

  if (
    protocol === "maintena-1day" ||
    protocol === "asimtufii-1day"
  ) {
    return {
      subtitle: "Starting day - two injections given",
      firm: false,
      block: {
        kind: "medication-reminder",
        heading: "What happened today and what comes next",
        paragraphs: [
          "Today you received two injections in different muscles, plus a single dose of medication by mouth. This is the one-day way of starting, and it is done in a single visit.",
          "You do not need to keep taking oral medication after today's single dose unless your provider specifically told you to.",
          "Soreness in both spots is normal. Treat each site the same way as described below.",
        ],
      },
    };
  }

  if (protocol.endsWith("-provider")) {
    return {
      subtitle: "Starting dose - provider-directed plan",
      firm: false,
      block: {
        kind: "medication-reminder",
        heading: "Your provider made a plan just for you",
        paragraphs: [
          "Your starting plan was written specifically for you rather than following one of the standard schedules.",
          `Follow exactly what your provider told you about oral medication and timing. If you are unsure about any part of it, call ${phone} before changing anything.`,
        ],
      },
    };
  }

  return null;
};

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * What the next step is called, per protocol. These are deliberately sentence
 * case rather than the shouted headings the rest of this file carries: the
 * timeline is read as a sequence of plain statements, and "COME BACK FOR A
 * SECOND STARTING INJECTION" set beside a date reads as alarm rather than
 * instruction.
 */
/**
 * Dispositions that mean the injection was not administered. The clinical
 * disposition panel says as much in its own footer: "If medication was not
 * given, select Held, Escalated, or Provider-directed plan."
 */
const NON_ADMINISTERED_KINDS = new Set(["held", "escalated", "provider"]);

/**
 * A paired second injection only counts once it is both documented and marked
 * given. Anything less and the sheet would assert an injection the record does
 * not support.
 */
/**
 * Collapses guidance lines that open with the same instruction, keeping the
 * fullest wording of each.
 *
 * A paired injection in two regions pulls in both regions' aftercare, and those
 * lists deliberately overlap - the deltoid list says "Do not rub or massage the
 * site - rubbing can change how the medication is absorbed" where the gluteal
 * list just says "Do not rub or massage the site." Exact-match de-duplication
 * misses that pair and the patient reads the same instruction twice, so lines
 * are keyed on their first clause instead.
 */
const dedupeGuidance = (lines: readonly string[]): string[] => {
  const keyOf = (line: string) =>
    line
      .split(/[.]|\s-\s/)[0]!
      .trim()
      .toLowerCase();
  const best = new Map<string, string>();
  for (const line of lines) {
    const key = keyOf(line);
    const existing = best.get(key);
    if (!existing || line.length > existing.length) best.set(key, line);
  }
  return [...best.values()];
};

const hasSecondInjection = (input: InjectionAvsInput): boolean =>
  Boolean(
    input.secondGiven &&
      String(input.secondDose ?? "").trim() &&
      String(input.secondSite ?? "").trim(),
  );

const DUE_TITLES: Record<string, string> = {
  "sustenna-day1": "Come back for your second starting injection",
  "sustenna-day8": "Your first monthly injection",
  "aristada-initio-sameday": "Your next regular Aristada injection",
  "maintena-1day": "Your next injection",
  "asimtufii-1day": "Your next injection",
};

const dueTitleFor = (protocol: string): string => {
  if (protocol.endsWith("-provider")) {
    return "Your next dose, as your provider directed";
  }
  return DUE_TITLES[protocol] ?? "Your next injection";
};

/**
 * Turns the encounter into the ordered steps the printed spine draws: what was
 * given today, anything that must continue in between, what is due next, and
 * where the schedule settles afterwards.
 *
 * Only the steps that genuinely exist are emitted - no filler is invented to
 * pad an initiation sheet. Initiation encounters come out longer because they
 * really do have more happening, which is exactly the distinction the printed
 * sheet needs to show.
 */
const buildTimeline = (
  input: InjectionAvsInput,
  plan: InitiationPlan | null,
  nextDose: InjectionAvsModel["nextDose"],
  nextDoseIso: string,
  medicationLabel: string,
  notGiven: boolean,
): AvsTimelineStep[] => {
  const protocol = String(input.initiationProtocol ?? "").trim();
  const phone = input.clinicPhone;
  const steps: AvsTimelineStep[] = [];

  /* ---- what happened today ---- */
  const visitWhen = formatGutterDate(
    input.administrationDate,
    input.administrationDate,
  );
  // Without a documented date the qualifier would sit alone over an empty
  // gutter, claiming "TODAY" with nothing beside it.
  const visitNote = visitWhen ? "Today" : "";

  if (notGiven) {
    // Nothing was administered, so this step says that and nothing more: no
    // medication headline, no site, no lot or expiry. Printing product
    // traceability for a dose that never left the vial would read as a record
    // of administration.
    steps.push({
      when: visitWhen,
      whenNote: visitNote,
      title: "This injection was not given today",
      detail: [
        "Your care team will explain what happens next and when to come back.",
      ],
      state: "action",
    });
  } else {
    // The headline carries the brand name and strength only. The generic name
    // is real information but it is not what the patient recognises the
    // injection by, so it drops to the supporting line rather than diluting the
    // one piece of type the sheet most wants read.
    const givenDetail: string[] = [];
    if (input.genericName) givenDetail.push(input.genericName);
    const siteText = describeSite(input.site, input.route);
    if (siteText) givenDetail.push(siteText);
    const expiration = formatExpiration(input.expiration);
    const trace = [
      input.lot && `Lot ${input.lot}`,
      expiration && `exp ${expiration}`,
    ]
      .filter(Boolean)
      .join(", ");
    if (trace) givenDetail.push(trace);

    // The one-day dual protocols give a second injection in a different muscle
    // at the same visit. It belongs in this step rather than its own node: both
    // happened now, and a second node on the same date would imply a sequence
    // that does not exist. Naming its site matters because the patient has two
    // sites to look after, not one.
    if (hasSecondInjection(input)) {
      const secondSite = describeSite(
        String(input.secondSite ?? ""),
        input.route,
      );
      givenDetail.push(
        `Second injection: ${String(input.secondDose ?? "").trim()}${
          secondSite ? `, ${secondSite.toLowerCase()}` : ""
        }`,
      );
    }
    if (String(input.oralStatus ?? "").trim() === "administered") {
      givenDetail.push("An oral dose was also given today.");
    }

    steps.push({
      when: visitWhen,
      whenNote: visitNote,
      title:
        [medicationLabel, input.dose].filter(Boolean).join(", ") ||
        "Injection given",
      detail: givenDetail,
      state: "given",
    });
  }

  /* ---- anything that has to continue in between ---- */
  if (plan?.oralDays && plan.oralLastDay && !notGiven) {
    // Deliberately terse. The gutter already carries the last day and the alert
    // block above carries the reasoning and the what-if-you-run-out line, so
    // restating either here would read as padding rather than emphasis.
    steps.push({
      when: formatGutterDate(plan.oralLastDay, input.administrationDate),
      whenNote: "Through",
      title: "Keep taking your oral medication",
      detail: [`${plan.oralDays} days in a row, counting today.`],
      state: "action",
    });
  }

  /* ---- what is due next ---- */
  steps.push({
    when: formatGutterDate(nextDoseIso, input.administrationDate),
    whenNote: nextDoseIso ? "Next" : "",
    title: dueTitleFor(protocol),
    // The gutter is a compact index; this is the authoritative statement of the
    // date, and the only place the sheet carries its weekday and year.
    dateLong: nextDose.dateLong,
    detail: nextDose.notes,
    state: "due",
  });

  /* ---- where the schedule settles afterwards ---- */
  if (plan?.scheduleNote) {
    steps.push({
      when: "",
      whenNote: "Ongoing",
      title: "Then your regular schedule",
      detail: [plan.scheduleNote],
      state: "ongoing",
    });
  }

  return steps;
};

/* ------------------------------------------------------------------ */
/* Model builder                                                       */
/* ------------------------------------------------------------------ */

const REASON_SUBTITLE: Record<string, string> = {
  reinit: "Restarting after a gap",
  loading: "Loading dose",
};

/**
 * Builds the full patient-facing model. Every branch degrades to something
 * printable: an uncatalogued medication, a missing next date, and a missing
 * site all still produce a usable sheet rather than a blank one.
 */
export const buildInjectionAvsModel = (input: InjectionAvsInput): InjectionAvsModel => {
  const profile = profileFor(input.medicationKey);
  const phone = input.clinicPhone;
  const plan = initiationPlan(input);
  // Held, escalated, and provider-directed all mean the injection was not
  // given. An empty kind is the ordinary mid-documentation preview state and
  // must keep rendering the full sheet, or the deliberately loosened AVS gate
  // stops working.
  const notGiven = NON_ADMINISTERED_KINDS.has(
    String(input.dispositionKind ?? "").trim(),
  );
  const subcutaneous = /subq|subcut/i.test(input.route ?? "");
  const region = siteRegion(input.site);
  const coldChain = Boolean(profile.coldChain);

  /* ---- next dose ---- */
  const nextDoseIso = plan?.nextDoseDateOverride || input.nextDoseDate;
  const dateLong = formatLongDate(nextDoseIso);
  const firmness: AvsDateFirmness = plan?.firm ? "firm" : coldChain ? "call-first" : "standard";

  const notes: string[] = [];
  if (!dateLong) {
    notes.push(
      `Your next injection has not been scheduled yet. Call ${phone} before you leave or as soon as you can, and we will help you set it up.`,
    );
  } else if (firmness === "firm") {
    notes.push(
      "This is your due date, not a scheduled appointment. This starting dose has very little room to move. If the date will not work, call us that same day and we will help keep your start on track.",
    );
  } else if (firmness === "call-first") {
    notes.push(
      "This is your due date, not a scheduled appointment. Call ahead so the medication can be prepared. If the date will not work, tell us on that call and we will help you plan the visit.",
    );
  } else {
    notes.push(
      `This is your due date, not a scheduled appointment. Call ${phone} to schedule or change your visit, and we will help you stay on track.`,
    );
  }

  const contactLines: AvsDataRow[] = coldChain
    ? [
        { label: "APPOINTMENTS & QUESTIONS", value: `${phone} - call before coming in` },
        { label: "CLINIC HOURS", value: "Monday-Friday, 9:30 AM - 4:30 PM (appointments preferred)" },
        { label: "AFTER HOURS", value: "For concerns that cannot wait, use urgent care. Call 911 for emergencies." },
      ]
    : [
        { label: "APPOINTMENTS & QUESTIONS", value: phone },
        { label: "CLINIC HOURS", value: "Monday-Friday, 9:30 AM - 4:30 PM (appointments preferred)" },
        { label: "AFTER HOURS", value: "For concerns that cannot wait, use urgent care. Call 911 for emergencies." },
      ];

  /* ---- lead alerts ---- */
  const leadAlerts: AvsBlock[] = [];
  // Both of these assert a consequence of having been dosed - Vivitrol's alert
  // says opioid tolerance "is now much LOWER", and the oral-overlap alert
  // counts days from an injection. Printing either after a held encounter would
  // be actively wrong, so they are gated. The cold-chain alert is about the
  // next visit and stays either way.
  if (profile.leadAlert && !notGiven) leadAlerts.push(profile.leadAlert);
  if (plan?.alert && !notGiven) leadAlerts.push(plan.alert);
  if (coldChain) {
    leadAlerts.push({
      kind: "critical-alert",
      heading: `Call before you come in - ${phone}`,
      emphasis: true,
      paragraphs: [
        `${input.medicationName || "This medication"} is kept refrigerated and has to be taken out and brought to room temperature before it can be given. Please call ahead so your dose is ready when you arrive. If you walk in without calling, expect a wait.`,
      ],
    });
  }

  /* ---- administration record ---- */
  // Left empty when nothing was administered. The spine already stops claiming
  // a dose, but this field is the model's assertion that one was given, and a
  // consumer other than the printed sheet would read it that way.
  const administration: AvsDataRow[] = [];
  const medLine = input.genericName
    ? `${input.medicationName} (${input.genericName})`
    : input.medicationName || "Not documented";
  administration.push({ label: "MEDICATION", value: medLine });
  if (input.dose) administration.push({ label: "DOSE", value: input.dose });
  const siteText = describeSite(input.site, input.route);
  if (siteText) administration.push({ label: "ROUTE / SITE", value: siteText });
  const when = [formatShortDate(input.administrationDate), input.administrationTime]
    .filter(Boolean)
    .join("  ");
  if (when) administration.push({ label: "DATE / TIME", value: when });
  const traceParts = [input.lot, formatExpiration(input.expiration)].filter(Boolean);
  if (traceParts.length) {
    administration.push({ label: "LOT / EXPIRATION", value: traceParts.join(" / ") });
  }
  if (hasSecondInjection(input)) {
    const secondTrace = [
      String(input.secondDose ?? "").trim(),
      describeSite(String(input.secondSite ?? ""), input.route),
      input.secondLot && `lot ${input.secondLot}`,
      input.secondExpiration && `exp ${formatExpiration(input.secondExpiration)}`,
    ]
      .filter(Boolean)
      .join(" - ");
    if (secondTrace) administration.push({ label: "SECOND INJECTION", value: secondTrace });
  }
  if (String(input.oralStatus ?? "").trim() === "administered") {
    administration.push({ label: "ORAL DOSE", value: "Administered today" });
  }
  /* ---- instruction blocks ---- */
  const blocks: AvsBlock[] = [];
  // Protocol narration ("today you received two injections...") presumes the
  // dose landed.
  if (plan?.block && !notGiven) blocks.push(plan.block);

  blocks.push({
    kind: "timing",
    heading: "Why timing matters",
    paragraphs: profile.timingReason,
  });

  // When a paired protocol used two different regions the patient has two sets
  // of aftercare to follow, so both are emitted. The de-duplication matters:
  // every region shares lines like "Do not rub or massage the site."
  const secondRegion = hasSecondInjection(input)
    ? siteRegion(String(input.secondSite ?? ""))
    : "unspecified";
  const regionCare =
    secondRegion !== "unspecified" && secondRegion !== region
      ? [
          ...siteCareForRegion(region, subcutaneous),
          ...siteCareForRegion(secondRegion, subcutaneous),
        ]
      : siteCareForRegion(region, subcutaneous);
  const siteCare = dedupeGuidance([
    ...regionCare,
    ...(profile.siteCareExtra ?? []),
  ]);
  // No site was used and nothing was absorbed, so neither aftercare nor
  // what-to-expect applies to a visit where the injection was not given.
  if (siteCare.length && !notGiven) {
    blocks.push({
      kind: "site-care",
      heading: "Caring for your injection site",
      paragraphs: siteCare,
    });
  }

  if (profile.expect?.length && !notGiven) {
    blocks.push({
      kind: "expected-effects",
      heading: "What you may notice",
      items: profile.expect,
    });
  }

  // Products whose profile already spells out its own site-reaction warning
  // (Vivitrol's, for example) should not also carry the generic one - the
  // specific wording is strictly more useful and the pair reads as padding.
  const profileCallItems = profile.callClinic ?? [];
  const hasOwnSiteWarning = profileCallItems.some((item) =>
    /injection site|the site/i.test(item),
  );
  const callItems = [
    ...(notGiven
      ? profileCallItems.filter((item) => !/injection site|the site/i.test(item))
      : profileCallItems),
    ...(hasOwnSiteWarning || notGiven
      ? []
      : ["Pain, swelling, warmth, drainage, or a rash at the injection site gets worse."]),
    dateLong
      ? "You cannot make your due date - call before that day, not after."
      : "You still do not have your next injection scheduled.",
    "Anything feels unusual or worries you.",
  ];
  blocks.push({
    kind: "call-clinic",
    heading: `Call the clinic at ${phone} if`,
    items: callItems,
  });

  /* ---- subtitle ---- */
  // Overrides any initiation subtitle: "STARTING SERIES - DOSE 1 OF 2" on a
  // sheet where dose 1 was never given would be actively misleading.
  const documentSubtitle = notGiven
    ? "Injection not given today"
    : plan?.subtitle ?? REASON_SUBTITLE[String(input.reason ?? "").trim()] ?? "";

  const nextDose = {
    dateLong,
    heading: plan?.nextHeading ?? "Your next injection",
    instruction: dateLong
      ? "Due date - call us to schedule or reschedule"
      : "Call to schedule your next injection",
    firmness,
    notes,
    contactLines,
  };

  return {
    documentTitle: "After Visit Summary - Long-acting injection",
    documentSubtitle,
    documentStatus: input.previewMode
      ? "STAFF PREVIEW - NOT FINAL"
      : String(input.dispositionKind ?? "").trim() === "administered"
        ? "PATIENT COPY"
        : notGiven
          ? "CARE HANDOFF"
          : "STAFF PREVIEW - NOT FINAL",
    identity: [
      { label: "PATIENT", value: input.patientName || "Not documented" },
      { label: "DOB", value: formatShortDate(input.patientDob) || input.patientDob || "-" },
      { label: "PROVIDER", value: input.orderingProvider || "-" },
      { label: "RECORD NO", value: input.recordNumber || "-" },
      { label: "VISIT DATE", value: formatShortDate(input.administrationDate) || "-" },
      { label: "GIVEN BY", value: input.administeredBy || "-" },
    ],
    nextDose,
    leadAlerts,
    timeline: buildTimeline(
      input,
      plan,
      nextDose,
      nextDoseIso,
      input.medicationName,
      notGiven,
    ),
    schedule: plan?.schedule ?? [],
    scheduleNote: plan?.scheduleNote ?? "",
    administration: notGiven ? [] : administration,
    administrationNote: notGiven
      ? ""
      : doseNote(input.medicationKey, input.dose, input.intervalKey),
    blocks,
    emergency: {
      kind: "emergency",
      heading: "Call 911 now or go to the nearest emergency room if",
      emphasis: true,
      items: profile.emergency ?? ANTIPSYCHOTIC_ER,
    },
  };
};
