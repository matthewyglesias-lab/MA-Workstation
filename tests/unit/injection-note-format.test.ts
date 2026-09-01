import { describe, expect, it } from "vitest";

import {
  InjectionEngine,
  emptyInjectionEncounter,
  injectionTimingReviewFingerprint,
  type InjectionEncounter,
} from "../../src/domain/injection";
import { injectionEncounterToDocumentationInput } from "../../src/documentation/adapters/injection-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

// The RC6.1 fast injection workflow note rhythm's own sample scenario -
// same patient/product/dates as the approved plan's "SAMPLE TARGET NOTE".
const requiredInjectionAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
  prior: true,
};

const sustennaAdministered = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "Doe, Jane", dob: "05/12/1980" },
  medicationKey: "sustenna",
  dose: "156 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "scheduled",
  priorDoseDate: "2026-07-10",
  administrationDate: "2026-08-07",
  administrationTime: "17:50",
  nextDoseDate: "2026-09-04",
  orderingProvider: "Jane Doe, MD",
  administeredBy: "Matthew Y.",
  allergies: "NKDA",
  traceability: { ndc: "50458-564-01", lot: "PAB1234", expiration: "2027-10" },
  response: { kind: "well" },
  attestations: requiredInjectionAttestations,
  verifications: { resuspend: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Clinic sample" },
});

const formatFor = (encounter: InjectionEncounter) => {
  const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
  const input = injectionEncounterToDocumentationInput(encounter, evaluation);
  if (!input) throw new Error("expected a documentation input");
  return DocumentationEngine.format("injection", input, evaluation);
};

describe("RC6.1 injection note format", () => {
  it("matches the approved plan's sample note for a routine administered dose", () => {
    const note = formatFor(sustennaAdministered());

    expect(note.cc).toBe(
      "Scheduled LAI — Invega Sustenna 156 mg IM, L deltoid; tolerated well; next due 9/4/26.\n" +
        "Pt presents today for scheduled LAI administration.",
    );
    expect(note.assessment).toContain(
      "Verification: Pt identity verified using two identifiers (full name & DOB). " +
        "Med verified against active order — right pt, drug, dose, route, time, and documentation.",
    );
    expect(note.assessment).toContain("Allergies reviewed — NKDA.");
    expect(note.assessment).toContain(
      "Clinical review: Prior dose tolerated well per pt report; no new or unresolved s/e. " +
        "No acute s/e or contraindications to administration noted on pre-inj screening.",
    );
    expect(note.assessment).toContain(
      "Product preparation: INVEGA SUSTENNA 156 mg (1 mL) syringe shaken vigorously ≥10 sec; " +
        "suspension homogeneous, no foreign matter or discoloration observed.",
    );
    expect(note.assessment).toContain(
      "Timing: 28 days since prior inj (7/10/26–8/7/26); within expected maintenance interval.",
    );
    expect(note.plan).toContain(
      "Administration: Invega Sustenna 156 mg IM administered to L deltoid using aseptic technique.\n" +
        "Date/time: 8/7/26 1750.",
    );
    expect(note.plan).toContain(
      "Hand hygiene performed; inj site cleansed w/ alcohol and allowed to dry prior to administration.",
    );
    expect(note.plan).toContain(
      "Response: Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.",
    );
    expect(note.plan).toContain("Traceability: NDC 50458-564-01 · Lot PAB1234 · Exp 10/2027.");
    expect(note.plan).toContain("Follow-up: Next dose due 9/4/26.");
    expect(note.plan).toContain("Ordering provider: Jane Doe, MD.\nAdministered by: Matthew Y.");
    // A value that already ends in punctuation ("Matthew Y.") must not be
    // double-punctuated by the label formatter.
    expect(note.plan).not.toContain("Matthew Y..");
  });

  it("hides every optional one-tap label when its control was never touched", () => {
    const note = formatFor(sustennaAdministered());

    expect(note.assessment).not.toContain("Site assessment:");
    expect(note.plan).not.toContain("Pt observed post-inj");
    expect(note.plan).not.toContain("Disposition:");
    expect(note.plan).not.toContain("Post-inj education provided");
  });

  it("documents an intentional return-target override and its authority", () => {
    const encounter = sustennaAdministered();
    encounter.nextDoseDate = "2026-09-11";
    encounter.details = {
      ...encounter.details,
      nextDose: {
        value: "2026-09-11",
        source: "manual",
        calculatedFrom: "2026-08-07|q4wk",
        overrideKind: "provider-direction",
        overrideProvider: "Jane Doe, MD",
        overrideReason: "Return in five weeks per active treatment plan",
        recordedAt: "2026-08-07T18:00:00.000Z",
      },
    };

    const note = formatFor(encounter);
    expect(note.plan).toContain("Next dose due 9/11/26.");
    expect(note.plan).toContain(
      "Return target override documented per provider direction (Jane Doe, MD): Return in five weeks per active treatment plan.",
    );
  });

  it("includes each optional one-tap line only once its control is selected", () => {
    const encounter = sustennaAdministered();
    encounter.details = {
      ...encounter.details,
      siteAssessed: true,
      postInjectionObservation: true,
      educationProvided: true,
      departureStatus: "ambulatory",
    };
    encounter.vitals = { bp: "124/78", hr: "72", temperature: "98.6" };
    const note = formatFor(encounter);

    expect(note.assessment).toContain(
      "Site assessment: Inj site assessed prior to administration; " +
        "no local finding precluding use of selected site.",
    );
    expect(note.assessment).toContain("Vitals: BP 124/78 · HR 72 · Temp 98.6");
    expect(note.assessment.indexOf("Site assessment:")).toBeLessThan(
      note.assessment.indexOf("Vitals:"),
    );
    expect(note.assessment.indexOf("Vitals:")).toBeLessThan(
      note.assessment.indexOf("Timing:"),
    );
    expect(note.plan).toContain("Response: Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.\nPt observed post-inj w/o adverse reaction.");
    expect(note.plan).toContain("Disposition: Pt departed clinic ambulatory w/o difficulty.");
    expect(note.plan).toContain(
      "Follow-up: Post-inj education provided re: expected effects, s/e to report, and adherence to next dose. " +
      "Next dose due 9/4/26.",
    );
  });

  it("keeps every assessment topic on a dedicated line in clinical read order", () => {
    const note = DocumentationEngine.format("injection", {
      disposition: { kind: "administered" },
      noteFacts: {
        verification: "Identity and order verified.",
        clinicalReview: "Clinical screening completed.",
        productPreparation: "Product preparation completed; normal appearance confirmed.",
        siteAssessment: "Selected site assessed.",
        vitals: "BP 124/78 · HR 72",
        clinicianAttention: "Dizzy / faint / fall concern",
        timing: "Provider timing review documented.",
      },
    });

    expect(note.assessment).toBe(
      "Verification: Identity and order verified.\n\n" +
        "Clinical review: Clinical screening completed.\n\n" +
        "Product preparation: Product preparation completed; normal appearance confirmed.\n\n" +
        "Site assessment: Selected site assessed.\n\n" +
        "Vitals: BP 124/78 · HR 72\n\n" +
        "Clinician attention: Dizzy / faint / fall concern\n\n" +
        "Timing: Provider timing review documented.",
    );
  });

  it("does not infer an allergy review from a populated allergy status", () => {
    const unconfirmed = DocumentationEngine.format("injection", {
      disposition: { kind: "administered" },
      preAdministration: {
        verification: "Identity verified.",
        allergyReviewed: false,
        allergiesReview: "NKDA",
      },
    });
    const confirmed = DocumentationEngine.format("injection", {
      disposition: { kind: "administered" },
      preAdministration: {
        verification: "Identity verified.",
        allergyReviewed: true,
        allergiesReview: "NKDA",
      },
    });

    expect(unconfirmed.assessment).toBe("Verification: Identity verified.");
    expect(unconfirmed.assessment).not.toContain("Allergies reviewed");
    expect(confirmed.assessment).toBe(
      "Verification: Identity verified. Allergies reviewed — NKDA.",
    );
  });

  it("omits an unconfirmed allergy value from a non-administration fallback", () => {
    const note = DocumentationEngine.format("injection", {
      disposition: { kind: "held" },
      preAdministration: {
        allergyReviewed: false,
        allergiesReview: "NKDA",
      },
    });

    expect(note.assessment).not.toContain("NKDA");
    expect(note.assessment).not.toContain("Allergies");
  });

  it("does not gate finalizing and records context-bound provider approval for a late dose", () => {
    const encounter = sustennaAdministered();
    encounter.administrationDate = "2026-08-25"; // well beyond the q4wk window
    encounter.details = {
      ...encounter.details,
      lateDoseReview: "provider-authorized",
      lateDoseReviewProvider: "A. Provider, PMHNP",
      lateDoseReviewTime: "2026-08-25T09:05",
      lateDoseReviewNote: "Proceed today per active order.",
      lateDoseReviewFingerprint: injectionTimingReviewFingerprint(encounter),
    };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(evaluation.stops).toEqual([]);
    expect(evaluation.output.lateDoseWarning).toBe(true);

    const note = formatFor(encounter);
    expect(note.assessment).toMatch(/outside routine maintenance interval/);
    expect(note.assessment).toContain(
      "Provider approval documented: A. Provider, PMHNP; decision Aug 25, 2026 at 9:05 AM; direction: Proceed today per active order.",
    );

    // A later date edit invalidates the prior approval instead of silently
    // carrying it into the regenerated note.
    encounter.administrationDate = "2026-08-26";
    const regenerated = formatFor(encounter);
    expect(regenerated.assessment).not.toContain("Provider approval documented:");
  });

  it("formats a re-initiation encounter into discrete assessment lines and chart-ready completion facts", () => {
    const encounter: InjectionEncounter = {
      ...sustennaAdministered(),
      medicationKey: "sustenna",
      dose: "234 mg",
      site: "R deltoid",
      reason: "reinit",
      priorDoseDate: "2026-07-03",
      administrationDate: "2026-08-18",
      administrationTime: "15:30",
      nextDoseDate: "2026-09-15",
      orderingProvider: "amoako-samuel",
      administeredBy: "Matthew Yglesias, MA",
      technique: '23G 1", deltoid IM at 90°',
      traceability: { ndc: "50458-564-01", lot: "QJB1A00", expiration: "2027-09" },
      verifications: { resuspend: true, invegaInit: true },
    };
    encounter.details = {
      productSource: "Clinic sample",
      lateDoseReview: "provider-authorized",
      lateDoseReviewProvider: "Samuel Amoako",
      lateDoseReviewTime: "2026-08-18T13:15",
      lateDoseReviewNote: "MAY GIVE 234 MG TODAY PER PROVIDER AND NATALIE L. ON TEAMS.",
      lateDoseReviewFingerprint: injectionTimingReviewFingerprint(encounter),
    };

    const note = formatFor(encounter);

    expect(note.cc).toBe(
      "Re-initiation LAI — Invega Sustenna 234 mg IM, R deltoid; tolerated well; next due 9/15/26.\n" +
        "Pt presents today for LAI re-initiation.",
    );
    expect(note.assessment).toBe(
      "Verification: Pt identity verified using two identifiers (full name & DOB). " +
        "Med verified against active order — right pt, drug, dose, route, time, and documentation. " +
        "Consent for injection obtained and reaffirmed before administration. Allergies reviewed — NKDA.\n\n" +
        "Clinical review: Prior dose tolerated well per pt report; no new or unresolved s/e. " +
        "No acute s/e or contraindications to administration noted on pre-inj screening. " +
        "Active order and product-specific initiation / re-initiation plan verified.\n\n" +
        "Product preparation: INVEGA SUSTENNA 234 mg (1.5 mL) syringe shaken vigorously ≥10 sec; " +
        "suspension homogeneous, no foreign matter or discoloration observed.\n\n" +
        "Timing: 46 days since prior inj; outside routine maintenance interval. " +
        "Med-specific missed-dose guidance reviewed. Provider approval documented: Samuel Amoako; " +
        "decision Aug 18, 2026 at 1:15 PM; direction: MAY GIVE 234 MG TODAY PER PROVIDER AND NATALIE L. ON TEAMS.",
    );
    expect(note.plan).toBe(
      "Administration: Invega Sustenna 234 mg IM administered to R deltoid using aseptic technique.\n" +
        "Date/time: 8/18/26 1530.\n\n" +
        "Hand hygiene performed; inj site cleansed w/ alcohol and allowed to dry prior to administration.\n\n" +
        "Needle / technique: 23G 1\", deltoid IM at 90°.\n\n" +
        "Response: Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.\n\n" +
        "Product source: Clinic sample\n\n" +
        "Traceability: NDC 50458-564-01 · Lot QJB1A00 · Exp 09/2027.\n\n" +
        "Follow-up: Next dose due 9/15/26.\n\n" +
        "Ordering provider: Amoako, Samuel, PMHNP.\nAdministered by: Matthew Yglesias, MA.",
    );
  });

  it("preserves custom departure-status text verbatim", () => {
    const encounter = sustennaAdministered();
    encounter.details = {
      ...encounter.details,
      departureStatus: "custom",
      departureStatusNote: "Pt departed with case manager for a scheduled follow-up visit.",
    };
    const note = formatFor(encounter);

    expect(note.plan).toContain(
      "Disposition: Pt departed with case manager for a scheduled follow-up visit.",
    );
  });

  it("places completed medication-specific preparation facts after clinical review", () => {
    const note = formatFor(sustennaAdministered());
    expect(note.assessment).toContain(
      "Product preparation: INVEGA SUSTENNA 156 mg (1 mL) syringe shaken vigorously ≥10 sec; " +
        "suspension homogeneous, no foreign matter or discoloration observed.",
    );
    expect(note.assessment.indexOf("Clinical review:")).toBeLessThan(
      note.assessment.indexOf("Product preparation:"),
    );
    expect(note.assessment.indexOf("Product preparation:")).toBeLessThan(
      note.assessment.indexOf("Timing:"),
    );
    expect(note.plan).not.toContain("INVEGA SUSTENNA syringe shaken");
  });

  it("states Vivitrol's completed reconstitution and normal suspension result in Product preparation", () => {
    const encounter: InjectionEncounter = {
      ...sustennaAdministered(),
      medicationKey: "vivitrol",
      dose: "380 mg",
      site: "R ventrogluteal",
      intervalKey: "q4wk",
      nextDoseDate: "2026-09-04",
      habitus: "average",
      verifications: { resuspend: true, opioidFree: true, naltrexHS: true, suppliedNeedle: true },
    };
    const note = formatFor(encounter);
    expect(note.assessment).toContain(
      "Product preparation: VIVITROL reached room temperature and was reconstituted with supplied diluent; " +
        "milky-white, clump-free suspension confirmed moving freely down the vial walls, 4 mL prepared for immediate administration.",
    );
    expect(note.assessment).not.toContain("foreign matter or discoloration");
    expect(note.plan).not.toContain("VIVITROL reached room temperature");
  });

  it("never produces a second, independent preparation clause", () => {
    const note = formatFor(sustennaAdministered());
    expect(note.plan).not.toContain("Preparation / reconstitution");
    expect(note.plan).not.toContain("PRODUCT HANDLING");
    const occurrences = (note.all.match(/INVEGA SUSTENNA 156 mg \(1 mL\) syringe shaken/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

// These lock a defect fixed alongside the needle-guidance work: the adapter
// assembled needle/technique wording into a `plan` array that no caller ever
// read, so the technique field and every technique verification produced no
// note text at all.
describe("RC6.1 injection note — needle / technique", () => {
  const asimtufiiAdministered = (): InjectionEncounter => ({
    ...sustennaAdministered(),
    medicationKey: "asimtufii",
    dose: "960 mg",
    site: "R ventrogluteal",
    intervalKey: "q8wk",
    nextDoseDate: "2026-10-07",
    traceability: { ndc: "59148-100-70", lot: "AB1234", expiration: "2027-10" },
    verifications: { resuspend: true, glutealOnly: true, noMassage: true },
  });

  it("states the staff-entered needle / technique in the plan", () => {
    const encounter = sustennaAdministered();
    encounter.technique = '23G 1" deltoid';
    const note = formatFor(encounter);

    expect(note.plan).toContain('Needle / technique: 23G 1" deltoid.');
  });

  it("does not double-punctuate technique text that already ends in a period", () => {
    const encounter = sustennaAdministered();
    encounter.technique = 'Kit needle, 22G 1.5".';
    const note = formatFor(encounter);

    expect(note.plan).toContain('Needle / technique: Kit needle, 22G 1.5".');
    expect(note.plan).not.toContain('1.5"..');
  });

  it("states the gluteal-only and no-massage verifications that previously vanished", () => {
    const note = formatFor(asimtufiiAdministered());

    expect(note.plan).toContain(
      "Gluteal-only route requirement verified against the actual administration site.",
    );
    expect(note.plan).toContain(
      "Injection site was not massaged after administration per product instructions.",
    );
  });

  it("states the Vivitrol supplied-needle / body-habitus verification", () => {
    const encounter: InjectionEncounter = {
      ...asimtufiiAdministered(),
      medicationKey: "vivitrol",
      dose: "380 mg",
      intervalKey: "q4wk",
      nextDoseDate: "2026-09-04",
      habitus: "average",
      verifications: { resuspend: true, opioidFree: true, naltrexHS: true, suppliedNeedle: true },
    };
    const note = formatFor(encounter);

    expect(note.plan).toContain(
      "Kit-supplied needle and body-habitus selection verified; " +
        "ordered deep gluteal IM route/site documented.",
    );
  });

  it("keeps technique wording out of the assessment review block", () => {
    const encounter = asimtufiiAdministered();
    encounter.technique = '21G 2" gluteal';
    const note = formatFor(encounter);

    expect(note.assessment).not.toContain("Needle / technique:");
    expect(note.assessment).not.toContain("Gluteal-only route requirement");
  });

  it("does not carry stale product-specific technique checks into a different medication's note", () => {
    const encounter = sustennaAdministered();
    // These can remain in an older draft after staff change products. They
    // are not Sustenna checks and must not become charted facts.
    encounter.verifications = { resuspend: true, noMassage: true, deepZtrack: true };

    const note = formatFor(encounter);
    expect(note.plan).not.toContain("was not massaged");
    expect(note.plan).not.toContain("Ordered route, site, and product-specific technique verified");
  });

  it("emits no technique label when nothing was documented", () => {
    const note = formatFor(sustennaAdministered());

    expect(note.plan).not.toContain("Needle / technique:");
  });

  it("does not chart a Vivitrol needle recommendation until staff documents the actual technique", () => {
    const encounter: InjectionEncounter = {
      ...sustennaAdministered(),
      medicationKey: "vivitrol",
      dose: "380 mg",
      site: "R ventrogluteal",
      habitus: "average",
      verifications: { resuspend: true, opioidFree: true, naltrexHS: true, suppliedNeedle: true },
    };

    const noTechnique = formatFor(encounter);
    expect(noTechnique.plan).not.toContain("Needle / technique:");

    encounter.technique = 'Supplied 20G 1½-inch needle used for deep gluteal IM.';
    const documentedTechnique = formatFor(encounter);
    expect(documentedTechnique.plan).toContain(
      "Needle / technique: Supplied 20G 1½-inch needle used for deep gluteal IM.",
    );
  });
});
