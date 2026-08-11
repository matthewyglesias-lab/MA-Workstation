import { describe, expect, it } from "vitest";

import {
  InjectionEngine,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  type InjectionEncounter,
  type InjectionInitiationProtocol,
  type InjectionMedicationKey,
} from "../../src/domain";
import { injectionEncounterToDocumentationInput } from "../../src/documentation/adapters/injection-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

// Every RC6.1-affecting scenario the compact injection note has to cover,
// run end to end (typed encounter -> evaluator -> documentation adapter ->
// formatter) and checked for content that must appear. Complements
// injection-note-format.test.ts's single-scenario exact-text check with
// broad coverage across initiation protocols, dispositions, and optional
// fields, so a field silently dropped by the compact rewrite fails loudly
// here instead of surfacing later as a missing chart detail.

const requiredInjectionAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const formatFor = (encounter: InjectionEncounter) => {
  const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate || "2026-08-07" });
  expect(evaluation.stops).toEqual([]);
  const input = injectionEncounterToDocumentationInput(encounter, evaluation);
  if (!input) throw new Error("expected a documentation input");
  return { note: DocumentationEngine.format("injection", input, evaluation), evaluation };
};

const baseAdministered = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "STRESS, TEST", dob: "01/01/1990" },
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

// --- Paired (dual-injection) initiation protocols ---------------------

const pairedInjection = (
  medicationKey: InjectionMedicationKey,
  protocol: InjectionInitiationProtocol,
): InjectionEncounter => {
  const encounter: InjectionEncounter = {
    ...emptyInjectionEncounter(),
    patient: { name: "STRESS, PAIRED", dob: "01/01/1990" },
    medicationKey,
    dose: "400 mg",
    route: "IM",
    site: "R deltoid",
    intervalKey: "q4wk",
    reason: "initiation",
    administrationDate: "2026-07-30",
    nextDoseDate: "2026-08-27",
    orderingProvider: "Safety Provider",
    administeredBy: "Safety MA",
    administrationTime: "09:15",
    secondAdministrationTime: "09:18",
    allergies: "NKDA verified in active record",
    traceability: { ndc: "11111-1111-11", lot: "PRIMARY-LOT", expiration: "2027-12" },
    response: { kind: "well" },
    attestations: requiredInjectionAttestations,
    verifications: { resuspend: true },
    acuteSafetyScreenConfirmed: true,
    disposition: { kind: "administered" },
    initiation: {
      ...emptyInjectionInitiation(),
      protocol,
      planVerified: true,
      oralStatus: "administered",
      second: {
        productKey: "maintena",
        dose: "400 mg",
        site: "L deltoid",
        ndc: "22222-2222-22",
        lot: "SECOND-LOT",
        expiration: "2027-11",
        given: true,
        orderVerified: true,
      },
    },
  };

  if (medicationKey === "asimtufii") {
    encounter.dose = "960 mg";
    encounter.site = "R ventrogluteal";
    encounter.intervalKey = "q8wk";
    encounter.nextDoseDate = "2026-09-24";
    encounter.verifications = {
      resuspend: true,
      aripiprazoleTolerability: true,
      glutealOnly: true,
      noMassage: true,
    };
  } else if (medicationKey === "aristada") {
    encounter.dose = "882 mg";
    encounter.site = "R ventrogluteal";
    encounter.initiation!.second.productKey = "initio";
    encounter.initiation!.second.dose = "675 mg";
  } else if (medicationKey === "initio") {
    encounter.dose = "675 mg";
    encounter.intervalKey = "once";
    encounter.nextDoseDate = "";
    encounter.initiation!.second.productKey = "aristada";
    encounter.initiation!.second.dose = "882 mg";
    encounter.initiation!.second.site = "L ventrogluteal";
  }

  return encounter;
};

describe("RC6.1 note stress: paired (dual-injection) initiation protocols", () => {
  it.each([
    ["maintena", "maintena-1day"],
    ["asimtufii", "asimtufii-1day"],
    ["aristada", "aristada-initio-sameday"],
    ["initio", "aristada-initio-sameday"],
  ] as const)("documents both components' dose, site, and traceability for %s / %s", (medicationKey, protocol) => {
    const encounter = pairedInjection(medicationKey, protocol);
    const { note } = formatFor(encounter);

    // Primary component: dose + site in Administration, NDC/Lot/Exp in Traceability.
    expect(note.plan).toContain(encounter.dose);
    expect(note.plan).toContain(encounter.site);
    expect(note.plan).toContain("NDC 11111-1111-11");
    expect(note.plan).toContain("Lot PRIMARY-LOT");
    expect(note.plan).toContain("Exp 12/2027");

    // Second component: dose + site must appear in Administration, and
    // NDC/Lot/Exp must appear in Traceability - this is the exact class of
    // bug this stress test exists to catch (component 2 silently dropped
    // from the compact rewrite).
    const second = encounter.initiation!.second;
    expect(note.plan).toContain("Component 2");
    expect(note.plan).toContain(second.dose);
    expect(note.plan).toContain(second.site);
    expect(note.plan).toContain("NDC 22222-2222-22");
    expect(note.plan).toContain("Lot SECOND-LOT");
    expect(note.plan).toContain("Exp 11/2027");
  });
});

// --- Oral-overlap (14/21-day) initiation protocols ---------------------

describe("RC6.1 note stress: oral-overlap initiation protocols", () => {
  it.each([
    ["maintena", "maintena-14day"],
    ["asimtufii", "asimtufii-14day"],
    ["aristada", "aristada-21day"],
  ] as const)("documents the primary injection for %s / %s", (medicationKey, protocol) => {
    const encounter: InjectionEncounter = {
      ...emptyInjectionEncounter(),
      patient: { name: "STRESS, ORAL", dob: "01/01/1990" },
      medicationKey,
      dose: medicationKey === "asimtufii" ? "960 mg" : "400 mg",
      route: "IM",
      site: medicationKey === "maintena" ? "R deltoid" : "R ventrogluteal",
      intervalKey: "q4wk",
      reason: "initiation",
      administrationDate: "2026-07-30",
      nextDoseDate: "2026-08-27",
      orderingProvider: "Safety Provider",
      administeredBy: "Safety MA",
      administrationTime: "09:15",
      allergies: "NKDA",
      traceability: { ndc: "33333-3333-33", lot: "ORAL-LOT", expiration: "2027-12" },
      response: { kind: "well" },
      attestations: requiredInjectionAttestations,
      verifications:
        medicationKey === "asimtufii"
          ? { resuspend: true, aripiprazoleTolerability: true, glutealOnly: true, noMassage: true }
          : { resuspend: true },
      acuteSafetyScreenConfirmed: true,
      disposition: { kind: "administered" },
      initiation: {
        ...emptyInjectionInitiation(),
        protocol,
        planVerified: true,
        oralStatus: "administered",
      },
    };
    const { note } = formatFor(encounter);

    expect(note.plan).toContain(encounter.dose);
    expect(note.plan).toContain(encounter.site);
    expect(note.plan).toContain("NDC 33333-3333-33");
    expect(note.plan).toContain("Lot ORAL-LOT");
    // No phantom second component for a single-injection oral-overlap path.
    expect(note.plan).not.toContain("Component 2");
  });
});

// --- Provider-directed (non-calculating) initiation protocols ---------

describe("RC6.1 note stress: provider-directed initiation protocols", () => {
  it.each([
    ["maintena", "maintena-provider"],
    ["asimtufii", "asimtufii-provider"],
    ["aristada", "aristada-provider"],
    ["sustenna", "sustenna-provider"],
  ] as const)("documents the primary injection for %s / %s without a phantom next-dose date", (medicationKey, protocol) => {
    const encounter: InjectionEncounter = {
      ...emptyInjectionEncounter(),
      patient: { name: "STRESS, PROVIDER", dob: "01/01/1990" },
      medicationKey,
      dose: medicationKey === "sustenna" ? "156 mg" : medicationKey === "asimtufii" ? "960 mg" : "400 mg",
      route: "IM",
      site:
        medicationKey === "maintena"
          ? "R deltoid"
          : medicationKey === "sustenna"
            ? "L deltoid"
            : "R ventrogluteal",
      intervalKey: "q4wk",
      reason: "reinit",
      administrationDate: "2026-07-30",
      // A provider-directed path calculates nothing, but nextDoseDate is
      // still a required field once intervalKey is set - staff enter the
      // actual provider-directed date manually, which is what this fixture
      // simulates. The point of this test is that the *engine* never
      // silently invented this value (checked via calculatedDates below).
      nextDoseDate: "2026-09-15",
      orderingProvider: "Safety Provider",
      administeredBy: "Safety MA",
      administrationTime: "09:15",
      allergies: "NKDA",
      traceability: { ndc: "44444-4444-44", lot: "PROVIDER-LOT", expiration: "2027-12" },
      response: { kind: "well" },
      attestations: requiredInjectionAttestations,
      verifications:
        medicationKey === "asimtufii"
          ? { resuspend: true, aripiprazoleTolerability: true, glutealOnly: true, noMassage: true }
          : medicationKey === "sustenna"
            ? { resuspend: true }
            : { resuspend: true, oralOverlap: true },
      acuteSafetyScreenConfirmed: true,
      disposition: { kind: "administered" },
      initiation: {
        ...emptyInjectionInitiation(),
        protocol,
        planVerified: true,
        providerNote: "Provider-directed restart per current PI; see active order.",
      },
    };
    const evaluation = InjectionEngine.evaluate(encounter, { today: encounter.administrationDate });
    expect(evaluation.stops).toEqual([]);
    // A provider-directed path is explicitly non-calculating - it must not
    // itself produce a stop for the missing next-dose date since intervalKey
    // is still "q4wk" (not "once"), so the panel leaves it for staff to
    // enter; here we only assert no *date* got silently invented.
    expect(evaluation.calculatedDates.expectedNextDoseDate).toBeUndefined();

    const input = injectionEncounterToDocumentationInput(encounter, evaluation);
    expect(input).not.toBeNull();
    if (!input) return;
    const note = DocumentationEngine.format("injection", input, evaluation);
    expect(note.plan).toContain(encounter.dose);
    expect(note.plan).toContain(encounter.site);
    expect(note.plan).toContain("NDC 44444-4444-44");
  });
});

// --- Sustenna Day 1 / Day 8 initiation ---------------------------------

describe("RC6.1 note stress: Sustenna Day 1 / Day 8 initiation", () => {
  it("documents the Day 1 dose and the Day 8 target in Timing/follow-up", () => {
    const encounter: InjectionEncounter = {
      ...baseAdministered(),
      reason: "initiation",
      priorDoseDate: "",
      administrationDate: "2026-01-01",
      nextDoseDate: "2026-01-08",
      site: "L deltoid",
      initiation: {
        ...emptyInjectionInitiation(),
        protocol: "sustenna-day1",
        planVerified: true,
        sustennaOrder: "standard",
      },
    };
    const { note, evaluation } = formatFor(encounter);
    expect(evaluation.output.expectedNextDoseDate).toBe("2026-01-08");
    expect(note.plan).toContain(encounter.dose);
    expect(note.plan).toContain("Follow-up: Next dose due 1/8/26.");
  });

  it("documents the Day 8 dose and calculates the true monthly maintenance follow-up", () => {
    const encounter: InjectionEncounter = {
      ...baseAdministered(),
      reason: "initiation",
      priorDoseDate: "",
      administrationDate: "2026-01-08",
      nextDoseDate: "2026-02-05",
      site: "L deltoid",
      initiation: {
        ...emptyInjectionInitiation(),
        protocol: "sustenna-day8",
        planVerified: true,
        sustennaOrder: "standard",
        day1Date: "2026-01-01",
      },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("Follow-up: Next dose due 2/5/26.");
  });
});

// --- Response types -----------------------------------------------------

describe("RC6.1 note stress: every response type", () => {
  it("documents minor bleeding", () => {
    const encounter = { ...baseAdministered(), response: { kind: "bleed" as const } };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain(
      "Response: Minor bleeding noted post-inj; controlled w/ pressure. No persistent bleeding or significant swelling.",
    );
  });

  it("documents mild site discomfort", () => {
    const encounter = { ...baseAdministered(), response: { kind: "disc" as const } };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("Response: Mild transient site discomfort reported; no acute reaction noted.");
  });

  it("preserves custom response text verbatim without a 'tolerated well' prefix", () => {
    const encounter = {
      ...baseAdministered(),
      response: { kind: "custom" as const, custom: "Pt reported transient dizziness resolved within 5 minutes." },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("Response: Pt reported transient dizziness resolved within 5 minutes.");
    expect(note.plan).not.toContain("tolerated well");
  });
});

// --- Disposition-on-departure options -----------------------------------

describe("RC6.1 note stress: every disposition-on-departure option", () => {
  it.each([
    ["ambulatory", "Pt departed clinic ambulatory w/o difficulty."],
    ["observed", "Pt ambulatory on departure; no immediate post-inj concerns noted."],
    ["escorted", "Pt departed clinic accompanied/escorted w/o acute concern."],
    ["wheelchair", "Pt departed clinic via wheelchair; no immediate post-inj concerns noted."],
    ["continued-observation", "Pt remained in clinic for continued observation."],
    ["provider-evaluation", "Pt remained in clinic for provider evaluation following administration."],
  ] as const)("documents departureStatus=%s", (departureStatus, expectedText) => {
    const encounter = {
      ...baseAdministered(),
      details: { ...baseAdministered().details, departureStatus },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain(`Disposition: ${expectedText}`);
  });
});

// --- Non-administered handoff dispositions ------------------------------

describe("RC6.1 note stress: non-administered handoff (verbose formatter path)", () => {
  it.each(["held", "escalated", "provider"] as const)(
    "produces a non-empty note without error for disposition=%s",
    (kind) => {
      const encounter: InjectionEncounter = {
        ...emptyInjectionEncounter(),
        patient: { name: "STRESS, HANDOFF", dob: "01/01/1990" },
        medicationKey: "sustenna",
        dose: "156 mg",
        route: "IM",
        intervalKey: "q4wk",
        reason: "scheduled",
        orderingProvider: "Jane Doe, MD",
        disposition: {
          kind,
          provider: "Dr. Reviewer",
          time: "2026-08-07T10:00",
          outcome: "Held pending provider review of recent labs.",
        },
      };
      const evaluation = InjectionEngine.evaluate(encounter, { today: "2026-08-07" });
      const input = injectionEncounterToDocumentationInput(encounter, evaluation);
      expect(input).not.toBeNull();
      if (!input) return;
      // The noteFacts (RC6.1) path only applies to the administered
      // disposition - a handoff record must fall back to the verbose
      // formatter, not silently produce an empty or noteFacts-shaped note.
      expect(input.noteFacts).toBeUndefined();
      const note = DocumentationEngine.format("injection", input, evaluation);
      expect(note.text.length).toBeGreaterThan(0);
      expect(note.plan).toContain("Held pending provider review of recent labs.");
    },
  );
});

// --- Product issue / exception blocks preserved alongside noteFacts -----

describe("RC6.1 note stress: product issue and exception blocks", () => {
  it("preserves a documented product issue alongside the compact core", () => {
    const encounter = {
      ...baseAdministered(),
      details: {
        ...baseAdministered().details,
        productIssue: true,
        productIssueDetail: "Vial arrived without a legible lot sticker.",
        productIssueAction: "Contacted pharmacy for a replacement vial before administering.",
        productIssueRecipient: "Pharmacy Manager R. Lee",
        productIssueNotificationTime: "2026-08-07T09:00",
        productIssueDirection: "Use the replacement vial once verified against the active order.",
        productIssueNextStep: "Pharmacy to follow up with the manufacturer about the labeling defect.",
      },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("Vial arrived without a legible lot sticker.");
  });

  it("preserves a documented administration exception alongside the compact core", () => {
    const encounter = {
      ...baseAdministered(),
      details: {
        ...baseAdministered().details,
        administrationException: true,
        exceptionSummary: "Patient requested a brief pause mid-injection; resumed without issue.",
        exceptionRecipient: "Charge nurse",
        exceptionTime: "2026-08-07T17:52",
        exceptionOutcome: "Completed without further complication.",
      },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("Patient requested a brief pause mid-injection; resumed without issue.");
  });

  it("preserves documented waste alongside the compact core", () => {
    const encounter = {
      ...baseAdministered(),
      details: {
        ...baseAdministered().details,
        waste: true,
        wasteAmount: "0.1 mL",
        wasteWitness: "R. Lee, RN",
      },
    };
    const { note } = formatFor(encounter);
    expect(note.plan).toContain("0.1 mL");
  });
});

// --- Site assessment, observation, education, all together -------------

describe("RC6.1 note stress: every optional one-tap item combined", () => {
  it("documents all optional items when every toggle is on", () => {
    const encounter = {
      ...baseAdministered(),
      details: {
        ...baseAdministered().details,
        siteAssessed: true,
        postInjectionObservation: true,
        educationProvided: true,
        departureStatus: "ambulatory" as const,
      },
    };
    const { note } = formatFor(encounter);
    expect(note.assessment).toContain("Site assessment:");
    expect(note.plan).toContain("Pt observed post-inj w/o adverse reaction.");
    expect(note.plan).toContain("Disposition: Pt departed clinic ambulatory w/o difficulty.");
    expect(note.plan).toContain("Post-inj education provided");
  });
});
