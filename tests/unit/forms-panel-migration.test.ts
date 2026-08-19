import { describe, expect, it } from "vitest";

import { emptyFormsEncounter, patientIsEmpty, type FormsEncounter } from "../../src/domain/forms";
import { formsEncounterToDocumentationInput } from "../../src/documentation/adapters/forms-from-encounter";
import { formatProviderLetterDraft, letterSubjectText } from "../../src/documentation/forms";
import { DocumentationEngine } from "../../src/documentation";

const baseEncounter = (): FormsEncounter => ({
  ...emptyFormsEncounter(),
  patient: { name: "Draft, Patient", dob: "01/02/1990" },
  provider: "Provider, MD",
  staff: "Staff, MA",
});

describe("formsEncounterToDocumentationInput", () => {
  it("maps a typed encounter into the same shape formatFormsDocumentation expects", () => {
    const encounter: FormsEncounter = {
      ...baseEncounter(),
      requestType: "disability",
      status: "provider_review",
      letterType: "offwork",
      notes: "Patient needs accommodation letter.",
      actionNotes: "Drafted letter for review.",
      followUpNotes: "Call patient once signed.",
      providerApprovalConfirmed: true,
    };

    const input = formsEncounterToDocumentationInput(encounter);
    expect(input.patient).toBe("Draft, Patient");
    expect(input.requestCategory).toBe("Disability / EDD form");
    expect(input.documentType).toBe("Off-work letter");
    expect(input.status).toBe("Provider review");
    expect(input.assignedProvider).toBe("Provider, MD");
    expect(input.assignedStaff).toBe("Staff, MA");
    expect(input.approvalStatus).toBe("Provider approved for release");
    expect(input.actions).toEqual(["Drafted letter for review."]);
    expect(input.followUp).toEqual(["Call patient once signed."]);

    const note = DocumentationEngine.format("forms", input);
    expect(note.text).toContain("Status: Provider review");
    expect(note.text).toContain("Assigned provider: Provider, MD");
    expect(note.text).toContain("ACTION / FOLLOW-UP");
  });

  it("omits default/placeholder values so the note only documents explicit selections", () => {
    const encounter = baseEncounter();
    const input = formsEncounterToDocumentationInput(encounter);
    // Defaults: requestType "work", letterType "dx", status "received",
    // fee "No fee / not applicable", notification "Not yet notified" — none
    // of these should be surfaced as if staff had explicitly documented them.
    expect(input.feeStatus).toBeUndefined();
    expect(input.patientNotification).toBeUndefined();
    expect(input.approvalStatus).toBeUndefined();
    expect(input.actions).toBeUndefined();
    expect(input.followUp).toBeUndefined();
  });
});

describe("letterSubjectText", () => {
  it("falls back to a per-letterType default when no custom subject is set", () => {
    const encounter = baseEncounter();
    expect(letterSubjectText({ ...encounter, letterType: "dx" })).toBe(
      "Diagnosis / Treatment Verification Letter",
    );
    expect(letterSubjectText({ ...encounter, letterType: "offwork" })).toBe(
      "Work Status Letter",
    );
    expect(letterSubjectText({ ...encounter, letterType: "return" })).toBe(
      "Return to Work Letter",
    );
    expect(letterSubjectText({ ...encounter, letterType: "restrictions" })).toBe(
      "Restrictions / Accommodation Letter",
    );
    expect(letterSubjectText({ ...encounter, letterType: "custom" })).toBe(
      "Provider Letter",
    );
  });

  it("prefers an explicit custom subject over the letterType default", () => {
    const encounter: FormsEncounter = {
      ...baseEncounter(),
      letterType: "offwork",
      letterSubject: "Custom Subject Line",
    };
    expect(letterSubjectText(encounter)).toBe("Custom Subject Line");
  });
});

describe("formatProviderLetterDraft", () => {
  it("prefers the letter-specific provider name/credentials, falling back to the assigned provider", () => {
    const encounter: FormsEncounter = {
      ...baseEncounter(),
      letterProviderName: "",
      letterCredentials: "MD, PMHNP-BC",
    };
    const draft = formatProviderLetterDraft(encounter);
    expect(draft.providerDisplayName).toBe("Provider, MD");
    expect(draft.providerFullName).toBe("Provider, MD, MD, PMHNP-BC");

    const withLetterProvider = formatProviderLetterDraft({
      ...encounter,
      letterProviderName: "Letter Signer, DO",
    });
    expect(withLetterProvider.providerDisplayName).toBe("Letter Signer, DO");
  });

  it("produces the dx-letter paragraph shape matching legacy letterBodyParagraphs()", () => {
    const encounter: FormsEncounter = {
      ...baseEncounter(),
      letterType: "dx",
      diagnosisWording: "under care for a mood disorder",
    };
    const draft = formatProviderLetterDraft(encounter);
    expect(draft.paragraphs[0]).toContain(
      "This letter is to verify that Draft, Patient (DOB 01/02/1990) is an established patient",
    );
    expect(draft.paragraphs[1]).toBe(
      "Provider-approved clinical information: under care for a mood disorder",
    );
  });

  it("produces the off-work letter paragraph shape with date ranges and return date", () => {
    const encounter: FormsEncounter = {
      ...baseEncounter(),
      letterType: "offwork",
      offWorkStart: "2026-08-01",
      offWorkEnd: "2026-08-10",
      returnDate: "2026-08-11",
    };
    const draft = formatProviderLetterDraft(encounter);
    expect(draft.paragraphs[1]).toContain("beginning Aug 1, 2026");
    expect(draft.paragraphs[1]).toContain("through Aug 10, 2026");
    expect(draft.paragraphs[1]).toContain("anticipated return-to-work date is Aug 11, 2026");
  });

  it("falls back to placeholder text for an unset patient/provider and empty restrictions", () => {
    const draft = formatProviderLetterDraft(emptyFormsEncounter());
    expect(draft.paragraphs[0]).toContain("[Patient name]");
    expect(draft.providerDisplayName).toBe("[Provider name]");
  });

  it("defaults the recipient and signature mode to match the legacy letter builder", () => {
    const draft = formatProviderLetterDraft(baseEncounter());
    expect(draft.recipient).toBe("To Whom It May Concern");
    expect(draft.signatureMode).toBe("wet");
    expect(draft.signatureBlock).toBe("______________________________");
  });

  it("uses an electronic-approval signature line when signatureMode is electronic", () => {
    const draft = formatProviderLetterDraft({
      ...baseEncounter(),
      letterSignatureMode: "electronic",
    });
    expect(draft.signatureBlock).toBe(
      "Electronically reviewed / approved by Provider, MD",
    );
  });
});

describe("patientIsEmpty", () => {
  it("is true only when both name and dob are blank", () => {
    expect(patientIsEmpty({ name: "", dob: "" })).toBe(true);
    expect(patientIsEmpty({ name: "  ", dob: "  " })).toBe(true);
    expect(patientIsEmpty({ name: "Draft, Patient", dob: "" })).toBe(false);
    expect(patientIsEmpty({ name: "", dob: "01/02/1990" })).toBe(false);
  });
});
