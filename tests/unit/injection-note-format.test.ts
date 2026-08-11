import { describe, expect, it } from "vitest";

import { InjectionEngine, emptyInjectionEncounter, type InjectionEncounter } from "../../src/domain/injection";
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

  it("includes each optional one-tap line only once its control is selected", () => {
    const encounter = sustennaAdministered();
    encounter.details = {
      ...encounter.details,
      siteAssessed: true,
      postInjectionObservation: true,
      educationProvided: true,
      departureStatus: "ambulatory",
    };
    const note = formatFor(encounter);

    expect(note.assessment).toContain(
      "Site assessment: Inj site assessed prior to administration; " +
        "no local finding precluding use of selected site.",
    );
    expect(note.plan).toContain("Response: Pt tolerated inj well; no immediate complication, bleeding, or swelling at site.\nPt observed post-inj w/o adverse reaction.");
    expect(note.plan).toContain("Disposition: Pt departed clinic ambulatory w/o difficulty.");
    expect(note.plan).toContain(
      "Follow-up: Post-inj education provided re: expected effects, s/e to report, and adherence to next dose. " +
        "Next dose due 9/4/26.",
    );
  });

  it("does not gate finalizing and states the late-dose review when the dose was given late", () => {
    const encounter = sustennaAdministered();
    encounter.administrationDate = "2026-08-25"; // well beyond the q4wk window
    encounter.details = { ...encounter.details, lateDoseReview: "provider-authorized" };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(evaluation.stops).toEqual([]);
    expect(evaluation.output.lateDoseWarning).toBe(true);

    const note = formatFor(encounter);
    expect(note.assessment).toMatch(/outside routine maintenance interval/);
    expect(note.assessment).toContain("Reviewed with provider; administration authorized.");
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

  it("preserves medication-specific verification facts alongside the compact core sentences", () => {
    // resuspend (checked in the base fixture) is a Sustenna-specific safety
    // fact the plan's simple sample doesn't mention, but rule 5/6 requires
    // keeping it - it must not be dropped by the new compact wording.
    const note = formatFor(sustennaAdministered());
    expect(note.assessment).toContain(
      "Medication inspected and mixed/resuspended per product instructions.",
    );
  });
});
