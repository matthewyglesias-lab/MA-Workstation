import { describe, expect, it } from "vitest";

import {
  confirmSampleReview,
  emptySamplesEncounter,
  sampleReviewIsCurrent,
  type SamplesEncounter,
} from "../../src/domain/samples";
import { samplesEncounterToDocumentationInput } from "../../src/documentation/adapters/samples-from-encounter";
import { DocumentationEngine } from "../../src/documentation";
import {
  buildPlanAndPackages,
  patientIsEmpty,
  primaryPackage,
  rowsFromEncounter,
} from "../../src/domain/samples-plan";

const routineSamples = (): SamplesEncounter => ({
  ...emptySamplesEncounter(),
  patient: { name: "MIGRATION, DRAFT", dob: "01/01/1990" },
  prescriber: "Dr. Draft",
  staff: "Draft MA",
  dispenseDate: "2026-01-30",
  startDate: "2026-01-30",
  medicationKey: "vraylar",
  medicationLabel: "Vraylar 3 mg capsule (cariprazine)",
  quantity: "7 capsules",
  directions: "Take 1 capsule by mouth once daily as prescribed.",
  purpose: "Medication sample start",
  foodInstructions: "auto",
  medicationReview: "Prescriber reviewed / ok to dispense",
  education: "Reviewed with patient",
  packages: [
    {
      id: "primary",
      label: "Primary package",
      medicationStrength: "Vraylar 3 mg capsule",
      quantity: "7 capsules",
      lot: "DRAFT-LOT",
      expiration: "2027-01",
    },
  ],
  handoutStatus: "Printed and provided",
});

describe("samplesEncounterToDocumentationInput", () => {
  it("returns null for an untouched encounter", () => {
    expect(samplesEncounterToDocumentationInput(emptySamplesEncounter(), "2026-01-30")).toBeNull();
  });

  it("maps a documented encounter into the documentation input shape", () => {
    const encounter = routineSamples();
    const input = samplesEncounterToDocumentationInput(encounter, "2026-01-30");
    expect(input).not.toBeNull();
    expect(input!.patient).toBe("MIGRATION, DRAFT");
    expect(input!.dob).toBe("01/01/1990");
    expect(input!.prescriber).toBe("Dr. Draft");
    expect(input!.dispensedBy).toBe("Draft MA");
    expect(input!.packages).toEqual([
      {
        label: "Primary package",
        medication: "Vraylar 3 mg capsule",
        quantity: "7 capsules",
        lot: "DRAFT-LOT",
        expiration: "01/2027",
      },
    ]);
    expect(input!.handoutStatus).toBe("Printed and provided");

    const note = DocumentationEngine.format("samples", input!);
    expect(note.text).toBeTruthy();
  });

  it("falls back to the encounter's own medication label when a package omits its strength", () => {
    const encounter = routineSamples();
    encounter.packages[0]!.medicationStrength = "";
    const input = samplesEncounterToDocumentationInput(encounter, "2026-01-30");
    expect(input!.packages?.[0]?.medication).toBe(encounter.medicationLabel);
  });

  it("only surfaces reviewedToday once the encounter's own review confirmation is current", () => {
    const encounter = routineSamples();
    const unconfirmed = samplesEncounterToDocumentationInput(encounter, "2026-01-30");
    expect(unconfirmed!.reviewedToday).toBeUndefined();

    const confirmed = confirmSampleReview(encounter, "2026-01-30T14:05:00.000Z");
    expect(sampleReviewIsCurrent(confirmed, "2026-01-30")).toBe(true);
    const input = samplesEncounterToDocumentationInput(confirmed, "2026-01-30");
    expect(input!.reviewedToday).toBeDefined();
    expect(input!.reviewedToday?.reviewedBy).toBe("Draft MA");
  });

  it("invalidates the review confirmation once a documented field changes", () => {
    const encounter = routineSamples();
    const confirmed = confirmSampleReview(encounter, "2026-01-30T14:05:00.000Z");
    const edited: SamplesEncounter = { ...confirmed, directions: "Take 2 capsules by mouth once daily." };
    expect(sampleReviewIsCurrent(edited, "2026-01-30")).toBe(false);
    const input = samplesEncounterToDocumentationInput(edited, "2026-01-30");
    expect(input!.reviewedToday).toBeUndefined();
  });

  it("excludes placeholder medication-review/education text from counseling once reviewed", () => {
    const encounter = routineSamples();
    encounter.medicationReview = "Pending provider confirmation";
    encounter.education = "not documented";
    const confirmed = confirmSampleReview(encounter, "2026-01-30T14:05:00.000Z");
    const input = samplesEncounterToDocumentationInput(confirmed, "2026-01-30");
    expect(input!.counseling ?? []).toEqual([]);
  });

  it("builds plan steps with the start date/day detail on the first step only", () => {
    const encounter = routineSamples();
    encounter.plan = [
      { id: "step-1", strength: "Vraylar 1.5 mg capsule", quantity: "7 capsules", days: "7", directions: "Take 1 capsule daily." },
      { id: "step-2", strength: "Vraylar 3 mg capsule", quantity: "7 capsules", days: "", directions: "Then take 1 capsule daily." },
    ];
    const input = samplesEncounterToDocumentationInput(encounter, "2026-01-30");
    expect(input!.planSteps?.[0]?.dateRange).toContain("7 day(s)");
    expect(input!.planSteps?.[1]?.dateRange).toBeUndefined();
  });
});

describe("patientIsEmpty", () => {
  it("is true only when both name and dob are blank", () => {
    expect(patientIsEmpty({ name: "", dob: "" })).toBe(true);
    expect(patientIsEmpty({ name: "  ", dob: "  " })).toBe(true);
    expect(patientIsEmpty({ name: "Draft, Patient", dob: "" })).toBe(false);
    expect(patientIsEmpty({ name: "", dob: "01/01/1990" })).toBe(false);
  });
});

describe("primaryPackage", () => {
  it("returns the stored primary package when one exists", () => {
    const encounter = routineSamples();
    expect(primaryPackage(encounter)).toEqual(encounter.packages[0]);
  });

  it("synthesizes a blank primary package from the encounter's own medication fields when none is stored", () => {
    const encounter: SamplesEncounter = { ...emptySamplesEncounter(), medicationLabel: "Vraylar 3 mg", quantity: "7 capsules" };
    expect(primaryPackage(encounter)).toEqual({
      id: "primary",
      label: "Primary package",
      medicationStrength: "Vraylar 3 mg",
      quantity: "7 capsules",
      lot: "",
      expiration: "",
    });
  });
});

describe("rowsFromEncounter / buildPlanAndPackages", () => {
  it("round-trips plan steps and their matching package traceability into editable rows", () => {
    const encounter: SamplesEncounter = {
      ...routineSamples(),
      plan: [{ id: "step-2", strength: "Vraylar 4.5 mg capsule", quantity: "7 capsules", days: "7", directions: "Then daily." }],
      packages: [
        ...routineSamples().packages,
        { id: "step-2", label: "Added package 2", medicationStrength: "Vraylar 4.5 mg capsule", quantity: "7 capsules", lot: "LOT-2", expiration: "2027-02" },
      ],
    };
    const rows = rowsFromEncounter(encounter);
    expect(rows).toEqual([
      {
        id: "step-2",
        strength: "Vraylar 4.5 mg capsule",
        quantity: "7 capsules",
        days: "7",
        directions: "Then daily.",
        lot: "LOT-2",
        expiration: "2027-02",
      },
    ]);
  });

  it("leaves package traceability blank for a plan step with no matching package yet", () => {
    const encounter: SamplesEncounter = {
      ...routineSamples(),
      plan: [{ id: "step-2", strength: "Vraylar 4.5 mg capsule", quantity: "7 capsules", directions: "Then daily." }],
    };
    const rows = rowsFromEncounter(encounter);
    expect(rows[0]).toMatchObject({ days: "", lot: "", expiration: "" });
  });

  it("builds a primary package plus one added package per row with a non-blank quantity", () => {
    const rows = [
      { id: "row-1", strength: "4.5 mg", quantity: "7 capsules", days: "7", directions: "Then daily.", lot: "LOT-2", expiration: "2027-02" },
      { id: "row-2", strength: "", quantity: "", days: "", directions: "Skipped, no quantity yet", lot: "", expiration: "" },
    ];
    const { plan, packages } = buildPlanAndPackages("Vraylar 3 mg", "7 capsules", "LOT-1", "2027-01", rows);

    expect(plan).toEqual([
      { id: "row-1", strength: "4.5 mg", quantity: "7 capsules", days: "7", directions: "Then daily." },
      { id: "row-2", strength: "", quantity: "", days: "", directions: "Skipped, no quantity yet" },
    ]);
    // Every row becomes a plan step (dosing timeline), but only rows with a
    // quantity become a real package to trace (there's nothing dispensed yet
    // for the others).
    expect(packages).toEqual([
      { id: "primary", label: "Primary package", medicationStrength: "Vraylar 3 mg", quantity: "7 capsules", lot: "LOT-1", expiration: "2027-01" },
      { id: "row-1", label: "Added package 2", medicationStrength: "4.5 mg", quantity: "7 capsules", lot: "LOT-2", expiration: "2027-02" },
    ]);
  });

  it("falls back to the primary medication label when an added row omits its own strength", () => {
    const rows = [{ id: "row-1", strength: "", quantity: "7 capsules", days: "", directions: "Then daily.", lot: "LOT-2", expiration: "2027-02" }];
    const { packages } = buildPlanAndPackages("Vraylar 3 mg", "7 capsules", "LOT-1", "2027-01", rows);
    expect(packages[1]?.medicationStrength).toBe("Vraylar 3 mg");
  });
});
