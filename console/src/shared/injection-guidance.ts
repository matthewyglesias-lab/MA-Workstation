import { getInjectionReference } from "./injection-catalog.js";

/** Review prompts only. Never selects a dose, restart regimen, or clearance. */
export const INJECTION_GUIDANCE_VERSION = "2026-09-15.1";
export const INJECTION_GUIDANCE_REVIEWED_ON = "2026-09-15";
export interface InjectionGuidanceCheck {
  /** Stable within the product; persist with guide id and version. */
  id: string;
  label: string;
  prompt: string;
}
export interface InjectionGuidance {
  id: string;
  productName: string;
  version: string;
  reviewedOn: string;
  source: { title: string; url: string; sections: string };
  routeAndSite: string;
  preparation: string[];
  needleGuidance: string[];
  clinicalChecks: InjectionGuidanceCheck[];
  incompleteDelivery: string;
  counseling: string[];
  /** Instructions only, never evidence of counseling performed. */
  aftercare: { en: string[]; es: string[] };
  requiresSpecialistSetting?: boolean;
}
type GuideContent = Omit<
  InjectionGuidance,
  "productName" | "version" | "reviewedOn" | "source" | "counseling"
> & { sections: string };
// Shared patient actions reflect the warning/counseling sections linked by each
// antipsychotic guide. They are instructions, not recorded findings or education.
const antipsychoticUrgentAftercare = {
  en: [
    "Call 911 for breathing trouble, throat swelling, or fever with severe stiffness or confusion.",
    "Call the clinic promptly for new uncontrolled movements.",
  ],
  es: [
    "Llame al 911 por dificultad respiratoria, hinchazón de garganta o fiebre con rigidez intensa o confusión.",
    "Avise pronto a la clínica sobre nuevos movimientos involuntarios.",
  ],
};
const antipsychoticAftercare = {
  en: [
    ...antipsychoticUrgentAftercare.en,
    "Rise slowly; sit if dizzy. Avoid driving until effects are known.",
  ],
  es: [
    ...antipsychoticUrgentAftercare.es,
    "Levántese despacio; si se marea, siéntese. Evite conducir hasta conocer los efectos.",
  ],
};
const incompleteReview =
  "Record actual delivery, uncertainty, device issue, and provider response. Do not infer a full dose or automatically replace it.";
const noPaliperidoneReplacement =
  "Do not re-inject the remainder or give another dose of this product. Record actual delivery and obtain the prescriber's monitoring and supplementation plan.";
const check = (
  id: string,
  label: string,
  prompt: string,
): InjectionGuidanceCheck => ({ id, label, prompt });
const guides: Record<string, GuideContent> = {
  "Aristada Initio": {
    id: "aristada-initio",
    sections: "2.1–2.4, 5, 17",
    routeAndSite:
      "IM: deltoid or gluteal. Keep paired Aristada injections in a different muscle.",
    preparation: [
      "Tap at least 10 times; shake vigorously for at least 30 seconds. Repeat shaking if unused for 15 minutes.",
      "Prime according to the kit instructions; deliver with rapid, continuous pressure.",
    ],
    needleGuidance: [
      "Supplied needles: deltoid 21G × 1 inch or 20G × 1½ inches; gluteal 20G × 1½ or 2 inches. More overlying tissue requires the longer supplied option.",
    ],
    clinicalChecks: [
      check(
        "initiation-components",
        "Initiation or restart components",
        "Verify ordered oral and maintenance components, tolerability, interactions, and separate administration records. Initio is not maintenance stock.",
      ),
      check(
        "kit-preparation",
        "Kit, mixing, and needle",
        "Record actual mixing, selected supplied needle, and inspection.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  Aristada: {
    id: "aristada",
    sections: "2.1–2.5, 5, 17",
    routeAndSite:
      "IM: 441 mg permits deltoid or gluteal; 662, 882, and 1064 mg are gluteal only.",
    preparation: [
      "Tap at least 10 times; shake vigorously for at least 30 seconds. Repeat shaking if unused for 15 minutes.",
      "Prime using the kit instructions. Inject rapidly and continuously; avoid pauses.",
    ],
    needleGuidance: [
      "Supplied needles: deltoid 21G × 1 inch or 20G × 1½ inches; gluteal 20G × 1½ or 2 inches. Select length for overlying tissue.",
    ],
    clinicalChecks: [
      check(
        "strength-site-plan",
        "Strength, site, and treatment phase",
        "Verify strength/site combination and prescriber's initiation, early, or missed-dose plan, including oral or Initio components.",
      ),
      check(
        "kit-preparation",
        "Mixing and delivery technique",
        "Document kit inspection, mixing, and supplied needle selection.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Invega Sustenna": {
    id: "invega-sustenna",
    sections: "2.1–2.7, 5, 17",
    routeAndSite:
      "Deep IM: initiation doses use deltoid; maintenance permits deltoid or gluteal. Use one injection, not divided injections.",
    preparation: [
      "Shake vigorously for at least 10 seconds to resuspend. Inspect, prime, and inject slowly according to the kit instructions.",
    ],
    needleGuidance: [
      "Supplied needles only. Deltoid: below 90 kg, 23G × 1 inch; at least 90 kg, 22G × 1½ inches. Gluteal: 22G × 1½ inches.",
    ],
    clinicalChecks: [
      check(
        "phase-history",
        "Initiation stage and actual history",
        "Distinguish first dose, second initiation dose, maintenance, and restart; verify actual previous administration and renal-related prescriber direction.",
      ),
      check(
        "weight-needle",
        "Weight, site, and kit preparation",
        "Document weight when selecting a deltoid needle, supplied needle choice, mixing, and inspection.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Invega Trinza": {
    id: "invega-trinza",
    sections: "2.1–2.8, 5, 17",
    routeAndSite: "Deep IM: deltoid or gluteal; single injection.",
    preparation: [
      "Shake vigorously for at least 15 seconds. Administer within 5 minutes of shaking; inspect for a uniform suspension.",
    ],
    needleGuidance: [
      "Use this product's supplied thin-wall needles. Deltoid: below 90 kg, 22G × 1 inch; at least 90 kg, 22G × 1½ inches. Gluteal: 22G × 1½ inches. Sustenna needles are not substitutes.",
    ],
    clinicalChecks: [
      check(
        "transition-history",
        "Prior treatment and due date",
        "Verify qualifying Sustenna history, three-month order, renal considerations, and any missed-dose prescriber plan.",
      ),
      check(
        "mixing-needle",
        "Mixing interval and supplied needle",
        "Document mixing, injection timing, site, and supplied thin-wall needle selection.",
      ),
    ],
    incompleteDelivery: noPaliperidoneReplacement,
    aftercare: antipsychoticAftercare,
  },
  "Invega Hafyera": {
    id: "invega-hafyera",
    sections: "2.1–2.5, 5, 17",
    routeAndSite: "Deep gluteal IM only; single injection. Alternate buttocks.",
    preparation: [
      "With cap up, shake very fast for 15 seconds, pause briefly, then repeat for 15 seconds. Confirm thick, uniformly milky suspension; repeat if solids remain.",
      "Proceed immediately; deliver slowly over approximately 30 seconds. Follow the full preparation sequence.",
    ],
    needleGuidance: [
      "Use only the supplied 20G × 1½-inch thin-wall needle; other paliperidone kit needles are not interchangeable.",
    ],
    clinicalChecks: [
      check(
        "transition-history",
        "Qualifying treatment and six-month plan",
        "Verify previous formulation, renal considerations, and provider-directed transition or missed-dose plan.",
      ),
      check(
        "resuspension",
        "Resuspension and gluteal delivery",
        "Document preparation, suspension appearance, supplied needle, and site.",
      ),
    ],
    incompleteDelivery: noPaliperidoneReplacement,
    aftercare: {
      en: [...antipsychoticAftercare.en, "Do not rub the injection site."],
      es: [...antipsychoticAftercare.es, "No frote el lugar de la inyección."],
    },
  },
  Erzofri: {
    id: "erzofri",
    sections: "2.1–2.7, 5, 17",
    routeAndSite:
      "IM: initial dose uses deltoid; subsequent monthly doses permit deltoid or gluteal.",
    preparation: [
      "Shake vigorously for at least 10 seconds; inspect, remove air, and deliver slowly using the supplied kit instructions.",
    ],
    needleGuidance: [
      "Supplied needles: deltoid below 90 kg, 23G × 1 inch; at least 90 kg, 22G × 1½ inches. Gluteal: 22G × 1½ inches.",
    ],
    clinicalChecks: [
      check(
        "formulation-plan",
        "Exact formulation and initiation plan",
        "Verify the Erzofri order and renal considerations. Do not copy Sustenna's second-initiation-dose pathway.",
      ),
      check(
        "weight-preparation",
        "Weight, site, and preparation",
        "Record weight when needed for deltoid needle choice, supplied needle selection, and mixing.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Abilify Maintena": {
    id: "abilify-maintena",
    sections: "2.1–2.7, 5, 17",
    routeAndSite:
      "Deep IM: deltoid or gluteal. Paired initiation injections need different muscles and separate records.",
    preparation: [
      "Identify dual-chamber syringe versus vial kit; follow that presentation's reconstitution instructions.",
      "Dual-chamber syringe: shake vertically for 20 seconds. Vial: shake 30 seconds; if delayed, resuspend for at least 60 seconds. Inspect for uniform milky suspension.",
    ],
    needleGuidance: [
      "Deltoid: non-obese 23G × 1 inch; obese 22G × 1½ inches. Gluteal: non-obese 22G × 1½ inches; obese 21G × 2 inches. Use supplied administration needles.",
    ],
    clinicalChecks: [
      check(
        "regimen-components",
        "Initiation, maintenance, or restart",
        "Verify ordered initiation strategy, oral components, actual previous doses, and relevant interactions.",
      ),
      check(
        "presentation-preparation",
        "Presentation and body habitus",
        "Document kit presentation, reconstitution, inspection, site, and needle selection.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Abilify Asimtufii": {
    id: "abilify-asimtufii",
    sections: "2.1–2.5, 5, 17",
    routeAndSite:
      "Gluteal IM only. Any paired Maintena injection uses a different muscle and separate record.",
    preparation: [
      "Tap at least 10 times; shake vigorously for at least 10 seconds until uniformly milky. Inspect, expel air as instructed, and inject slowly. Do not massage the site.",
    ],
    needleGuidance: [
      "Supplied gluteal needles: non-obese 22G × 1½ inches; obese 21G × 2 inches. Record assessed body habitus; do not assume.",
    ],
    clinicalChecks: [
      check(
        "regimen-components",
        "Transition or initiation components",
        "Verify two-month order, previous Maintena treatment or initiation components, interactions, and missed-dose plan.",
      ),
      check(
        "preparation-habitus",
        "Preparation and body habitus",
        "Document mixing, appearance, gluteal site, and supplied needle choice.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: {
      en: [...antipsychoticAftercare.en, "Do not massage the injection site."],
      es: [
        ...antipsychoticAftercare.es,
        "No masajee el lugar de la inyección.",
      ],
    },
  },
  Uzedy: {
    id: "uzedy",
    sections: "2.1–2.7, 5, 17",
    routeAndSite:
      "SC only: abdomen or back/outer upper arm; assess skin suitability.",
    preparation: [
      "Let the package reach room temperature for at least 30 minutes; do not use another warming method. Inspect the opaque white/off-white product.",
      "Follow the three forceful downward flicks to move the bubble to the cap. Attach the supplied needle; do not expel the bubble.",
      "Deliver slowly without interruption; wait 2–3 seconds after completion before withdrawal. Follow the illustrated instructions.",
    ],
    needleGuidance: [
      "Use the supplied 21G × ⅝-inch needle; do not substitute components.",
    ],
    clinicalChecks: [
      check(
        "indication-interval",
        "Indication and interval",
        "Confirm prescribed indication and interval; bipolar-I maintenance uses monthly dosing.",
      ),
      check(
        "temperature-bubble",
        "Temperature, bubble, and skin",
        "Document warming, inspection, bubble position, and selected skin site.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  Vivitrol: {
    id: "vivitrol",
    sections: "2.1–2.6, 4, 5.1–5.3, 17.1",
    routeAndSite: "Deep gluteal IM only; alternate buttocks.",
    preparation: [
      "Allow approximately 45 minutes at room temperature. Use supplied diluent and full illustrated reconstitution/transfer instructions; inject immediately after transfer.",
    ],
    needleGuidance: [
      "Assess body habitus each visit. Use only supplied customized 1½- or 2-inch administration needles; escalate if neither reaches muscle.",
    ],
    clinicalChecks: [
      check(
        "opioid-withdrawal",
        "Opioids and withdrawal",
        "Document recent opioids, tramadol, buprenorphine/methadone, withdrawal concerns, and provider eligibility plan. Negative urine testing alone cannot establish safety.",
      ),
      check(
        "habitus-preparation",
        "Habitus and preparation",
        "Record needle suitability, reconstitution, and inspection.",
      ),
      check(
        "overdose-plan",
        "Overdose prevention",
        "Record counseling and opioid reversal-agent access.",
      ),
    ],
    incompleteDelivery:
      "For clogging, follow the label's spare-needle/adjacent-gluteal-site process with repeat aspiration. Record actual delivery; do not automatically open another dose.",
    aftercare: {
      en: [
        "Missed or stopped doses increase opioid overdose risk. Never try to overcome the opioid blockade. Ask about naloxone; call 911 for suspected overdose.",
        "Report worsening injection-site pain or skin breakdown promptly.",
      ],
      es: [
        "Omitir o suspender dosis aumenta el riesgo de sobredosis. Nunca intente superar el bloqueo de los opioides. Pregunte por naloxona; llame al 911 ante una posible sobredosis.",
        "Informe pronto si empeora el dolor o se lesiona la piel donde recibió la inyección.",
      ],
    },
  },
  "Haloperidol decanoate": {
    id: "haloperidol-decanoate",
    sections: "2.1–2.3, 5, 17",
    routeAndSite:
      "Deep IM. The cited label does not prescribe a gluteal-only site or require Z-track technique.",
    preparation: [
      "Verify decanoate formulation and concentration. Inspect for clear yellow-to-light-amber solution without debris; verify the specific manufacturer's presentation instructions.",
    ],
    needleGuidance: [
      "The cited label specifies 21G and no more than 3 mL per injection site. Select needle length for the ordered site and tissue depth.",
    ],
    clinicalChecks: [
      check(
        "concentration-volume",
        "Concentration, volume, and sites",
        "Verify dose versus concentration, volume per site, and any prescriber-directed split administration.",
      ),
      check(
        "adverse-effects",
        "Movement symptoms and clinical changes",
        "Record reported movement symptoms, fainting/palpitations, new medicines, and provider review when indicated.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Fluphenazine decanoate": {
    id: "fluphenazine-decanoate",
    sections: "Dosage and Administration; Warnings; Precautions",
    routeAndSite:
      "IM or SC as ordered. The cited label does not specify an anatomical default site.",
    preparation: [
      "Use dry preparation equipment; moisture can cloud the solution. Inspect when the solution and container permit; follow the exact manufacturer's labeling.",
    ],
    needleGuidance: [
      "The label calls for a dry syringe and a needle of at least 21 gauge; select appropriate length for ordered route/site.",
    ],
    clinicalChecks: [
      check(
        "route-individual-plan",
        "Route and individualized plan",
        "Verify exact decanoate formulation, ordered route, dose, and interval; obtain direction for uncertain or late history.",
      ),
      check(
        "dry-equipment-effects",
        "Preparation and adverse effects",
        "Record dry equipment, inspection, reported movement symptoms, and relevant clinical changes.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    aftercare: antipsychoticAftercare,
  },
  "Zyprexa Relprevv": {
    id: "zyprexa-relprevv",
    sections: "2.1–2.2, 5.1–5.2, 17; REMS",
    routeAndSite:
      "Deep gluteal IM only, in a certified setting with emergency-response access.",
    preparation: [
      "Use supplied diluent and full reconstitution instructions. This helper does not implement REMS monitoring.",
    ],
    needleGuidance: [
      "Label: 19G × 1½ inches; for obese patients, 2-inch 19G or larger may be used. Follow product-specific aspiration instructions.",
    ],
    clinicalChecks: [
      check(
        "rems-setting",
        "Certified setting and REMS",
        "Verify current setting, prescriber, patient, and pharmacy requirements outside this console.",
      ),
      check(
        "observation-departure",
        "Observation and accompanied departure",
        "Confirm at least three hours of continuous observation, discharge assessment, and an accompanying person.",
      ),
    ],
    incompleteDelivery: incompleteReview,
    requiresSpecialistSetting: true,
    aftercare: {
      en: [
        ...antipsychoticUrgentAftercare.en,
        "Stay for required observation; leave with an accompanying person. Do not drive today. Seek emergency help for severe sleepiness, confusion, or trouble walking.",
      ],
      es: [
        ...antipsychoticUrgentAftercare.es,
        "Permanezca durante la observación; salga con un acompañante. No conduzca hoy. Busque ayuda de emergencia por somnolencia intensa, confusión o dificultad para caminar.",
      ],
    },
  },
};

/** Name recognition surfaces a reference only; it cannot verify physical stock. */
export function getInjectionGuidance(
  productName: string,
): InjectionGuidance | undefined {
  const reference = getInjectionReference(productName);
  if (!reference) return undefined;
  const content = guides[reference.name];
  if (!content) return undefined;
  const { sections, ...guide } = structuredClone(content);
  return {
    ...guide,
    productName: reference.name,
    version: `${INJECTION_GUIDANCE_VERSION}:${guide.id}`,
    reviewedOn: INJECTION_GUIDANCE_REVIEWED_ON,
    source: {
      title: `${reference.name} prescribing information`,
      url: reference.url,
      sections,
    },
    counseling: [...guide.aftercare.en],
  };
}
