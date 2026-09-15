/**
 * Optional review prompts, checked against primary labeling on 2026-09-15.
 * These are neither a formulary nor an order validator. A match does not
 * establish that a product, dose, patient, setting, or timing is appropriate.
 * Do not use name matching to select a drug, clear an encounter, or prescribe.
 */
export interface InjectionReference {
  name: string;
  url: string;
  reviewPoints: string[];
  requiresSpecialistSetting?: boolean;
}

interface ReferenceEntry extends InjectionReference {
  match: RegExp;
}

const references: ReferenceEntry[] = [
  {
    name: "Aristada Initio",
    match: /\b(?:aristada\s+)?initio\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=b18fdfd9-31cd-4a2f-9f1c-ebc70d7a9403",
    reviewPoints: [
      "Confirm the provider's initiation or restart plan; Initio is a separate product from maintenance Aristada.",
      "Verify any ordered oral and injectable components. Record each actual administration separately.",
      "Review product-specific site and preparation instructions before use.",
    ],
  },
  {
    name: "Aristada",
    match: /\baristada\b(?!\s+initio\b)/i,
    url: "https://labeling.alkermes.com/uspi_aristada.pdf",
    reviewPoints: [
      "Confirm the ordered strength, interval, and permitted injection site together.",
      "For early, missed, or first doses, verify the provider's product-specific plan and any required oral or Initio component.",
      "Follow the supplied-kit preparation instructions; document a blocked or incomplete delivery instead of assuming a full dose.",
    ],
  },
  {
    name: "Invega Sustenna",
    match: /\b(?:invega\s+)?sustenna\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1af14e42-951d-414d-8564-5d5fce138554",
    reviewPoints: [
      "Distinguish Day 1, Day 8, maintenance, and restart; verify the actual previous administration and provider order.",
      "Confirm route, site, supplied needle, and any weight-dependent needle selection.",
      "Refer renal adjustment, uncertain history, and missed-dose decisions to the prescriber.",
    ],
  },
  {
    name: "Invega Trinza",
    match: /\b(?:invega\s+)?trinza\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c39e65d7-fa44-4e4c-8b12-a654d3ed0eae",
    reviewPoints: [
      "Verify prior Sustenna treatment and the provider's transition or maintenance order.",
      "Use the ordered three-month date; an overdue dose may need a different re-initiation formulation.",
      "Follow shaking and supplied-needle instructions. An incomplete dose requires provider review; do not automatically replace it.",
    ],
  },
  {
    name: "Invega Hafyera",
    match: /\b(?:invega\s+)?hafyera\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6cd61892-d2cb-434d-83ed-5c1b2c4e7a0b",
    reviewPoints: [
      "Verify qualifying prior treatment and the provider's transition or six-month maintenance order.",
      "Confirm gluteal IM administration and the supplied preparation instructions.",
      "Review missed doses with the prescriber; a generic grace period cannot establish eligibility.",
    ],
  },
  {
    name: "Erzofri",
    match: /\berzofri\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=492bf9dd-868e-421a-92db-8cca8973aac1",
    reviewPoints: [
      "Verify the exact formulation; do not apply Sustenna's initiation pathway to Erzofri.",
      "Confirm the provider's initiation, maintenance, or restart plan and any renal adjustment.",
      "Check the ordered site and supplied needle against the current product instructions.",
    ],
  },
  {
    name: "Abilify Maintena",
    match: /\b(?:abilify\s+)?maintena\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee49f3b1-1650-47ff-9fb1-ea53fe0b92b6",
    reviewPoints: [
      "Confirm maintenance versus the provider's one-day or fourteen-day initiation plan.",
      "Missed-dose review depends on the number of previous doses as well as elapsed time.",
      "Verify every ordered injectable and oral component; record each given component and its actual site independently.",
    ],
  },
  {
    name: "Abilify Asimtufii",
    match: /\b(?:abilify\s+)?asimtufii\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=da4c07fd-1130-4341-bb44-63acfa4162be",
    reviewPoints: [
      "Distinguish an ordered transition from Maintena from initiation after oral treatment.",
      "Confirm gluteal IM administration and the ordered two-month date.",
      "Verify missed-dose plans and any paired Maintena or oral component with the prescriber.",
    ],
  },
  {
    name: "Uzedy",
    match: /\buzedy\b/i,
    url: "https://www.uzedy.com/globalassets/uzedy/prescribing-information.pdf",
    reviewPoints: [
      "Confirm indication and interval: bipolar-I maintenance uses a monthly regimen; the two-month regimen is not recommended for that indication.",
      "Confirm subcutaneous abdomen or upper-arm administration; verify room-temperature preparation, appearance, supplied needle, and bubble handling.",
      "Review early or missed doses against the order and label; no generic grace window establishes clearance.",
    ],
  },
  {
    name: "Vivitrol",
    match: /\bvivitrol\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=cd11c435-b0f0-4bb9-ae78-60f101f3703f",
    reviewPoints: [
      "Verify the provider's opioid-use and withdrawal assessment, including recent buprenorphine, methadone, or tramadol; a negative urine screen alone does not establish safety.",
      "Assess current body habitus and confirm deep gluteal IM administration using the supplied customized needle.",
      "Confirm preparation and the provider's observation and overdose-prevention counseling plan.",
    ],
  },
  {
    name: "Haloperidol decanoate",
    match: /\b(?:haldol|haloperidol)\s+decanoate\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=af0159a8-dff5-449a-aa2b-a0c430081e21",
    reviewPoints: [
      "Verify decanoate formulation, concentration, ordered dose, volume, and any provider-directed split dosing.",
      "Confirm deep IM administration, needle selection, and the label's per-site volume limit.",
      "Keep consumed stock units separate from the clinical dose and documented waste.",
    ],
  },
  {
    name: "Fluphenazine decanoate",
    match: /\b(?:prolixin|fluphenazine)\s+decanoate\b/i,
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=8caa3896-cde1-4cb1-9332-2e92bcf5c1f6",
    reviewPoints: [
      "Verify the exact decanoate product and the provider's individualized dose, route, and interval.",
      "Confirm the dry syringe and needle preparation requirement in the product labeling.",
      "Use a documented provider plan for late or uncertain dosing history.",
    ],
  },
  {
    name: "Zyprexa Relprevv",
    match: /\b(?:zyprexa\s+)?relprevv\b/i,
    url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/022173s043lbl022173s040lbl.pdf",
    requiresSpecialistSetting: true,
    reviewPoints: [
      "This product requires a certified healthcare setting and the current Zyprexa Relprevv REMS process.",
      "Confirm continuous observation for at least three hours, emergency-response access, and an accompanied departure.",
      "Do not treat this as routine clinic injection clearance; the console does not verify REMS eligibility or fulfill its monitoring requirements.",
    ],
  },
];

/** Returns no reference for an unknown, incomplete, or multi-product name. */
export function getInjectionReference(
  productName: string,
): InjectionReference | undefined {
  const normalized = productName.replace(/[®™]/g, " ").normalize("NFKC");
  const matches = references.filter((entry) => entry.match.test(normalized));
  if (matches.length !== 1) return undefined;
  const { match: _, ...reference } = matches[0]!;
  return { ...reference, reviewPoints: [...reference.reviewPoints] };
}
