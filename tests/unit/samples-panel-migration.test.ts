import { describe, expect, it } from "vitest";

import {
  confirmSampleReview,
  emptySamplesEncounter,
  sampleReviewIsCurrent,
  type SamplesEncounter,
} from "../../src/domain/samples";
import { samplesEncounterToDocumentationInput } from "../../src/documentation/adapters/samples-from-encounter";
import { DocumentationEngine } from "../../src/documentation";

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
