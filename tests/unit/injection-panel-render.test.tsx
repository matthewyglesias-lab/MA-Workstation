import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyInjectionEncounter, type InjectionEncounter } from "../../src/domain/injection";
import { InjectionPanel } from "../../src/presentation/workflows/injection/InjectionPanel";

const requiredInjectionAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

// Matches the routineInjection() fixture shape shared across the injection
// test suite (injection-panel-migration.test.ts, clinical-safety-matrix.test.ts).
const routineInjection = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "RENDER, DRAFT", dob: "01/01/1990" },
  medicationKey: "haldol",
  dose: "100 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "scheduled",
  priorDoseDate: "2026-01-02",
  priorSite: "R deltoid",
  administrationDate: "2026-01-30",
  nextDoseDate: "2026-02-27",
  orderingProvider: "Draft Provider",
  administeredBy: "Draft MA",
  administrationTime: "09:15",
  allergies: "NKDA verified in active record",
  traceability: {
    ndc: "12345-6789-01",
    lot: "DRAFT-LOT",
    expiration: "2027-12",
  },
  response: { kind: "well" },
  attestations: requiredInjectionAttestations,
  verifications: { deepZtrack: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  details: { productSource: "Clinic sample" },
});

// Reproduces the "outside window" case from clinical-safety-matrix.test.ts:
// administrationDate/nextDoseDate placed well past the erzofri interval
// window from priorDoseDate, which is what InjectionEngine.evaluate reads
// `lateDoseWarning` from - deterministic from the encounter's own dates, not
// wall-clock "now" (administrationDate always outranks context.today).
const lateInjection = (): InjectionEncounter => ({
  ...routineInjection(),
  medicationKey: "erzofri",
  dose: "117 mg",
  verifications: { resuspend: true },
  administrationDate: "2026-02-10",
  nextDoseDate: "2026-03-10",
});

describe("InjectionPanel (smoke)", () => {
  it("renders without throwing for a blank encounter", () => {
    const { container } = render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    expect(container.querySelector("section")).not.toBeNull();
  });
});

describe("InjectionPanel patient-identity legacy sync", () => {
  let legacyPtName: HTMLInputElement;
  let legacyPtDob: HTMLInputElement;

  beforeEach(() => {
    // Simulates the hidden legacy #panel-administer markup that
    // mirrorInjectionEncounterToLegacyDom() targets by element id - absent
    // in these tests otherwise, since only InjectionPanel itself is mounted.
    legacyPtName = document.createElement("input");
    legacyPtName.id = "ptName";
    document.body.append(legacyPtName);
    legacyPtDob = document.createElement("input");
    legacyPtDob.id = "ptDOB";
    document.body.append(legacyPtDob);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    legacyPtName.remove();
    legacyPtDob.remove();
  });

  it("mirrors the typed value immediately but defers the legacy input event for 500ms", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    const notified = vi.fn();
    legacyPtName.addEventListener("input", notified);

    const nameField = screen.getByPlaceholderText("Last, First");
    fireEvent.input(nameField, { target: { value: "Draft, Patient" } });

    // Both controls update silently on every keystroke...
    expect(legacyPtName.value).toBe("Draft, Patient");
    expect(notified).not.toHaveBeenCalled();

    // ...and a single legacy input event fires only once the typing pause
    // elapses, so downstream legacy compatibility code reads a settled value.
    vi.advanceTimersByTime(500);
    expect(notified).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately on blur instead of waiting for the debounce", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    const notified = vi.fn();
    legacyPtName.addEventListener("input", notified);

    const nameField = screen.getByPlaceholderText("Last, First");
    fireEvent.input(nameField, { target: { value: "Draft, Patient" } });
    expect(notified).not.toHaveBeenCalled();

    fireEvent.blur(nameField);
    expect(notified).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid keystrokes into a single legacy notify", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    const notified = vi.fn();
    legacyPtName.addEventListener("input", notified);

    const nameField = screen.getByPlaceholderText("Last, First");
    fireEvent.input(nameField, { target: { value: "D" } });
    vi.advanceTimersByTime(200);
    fireEvent.input(nameField, { target: { value: "Dr" } });
    vi.advanceTimersByTime(200);
    fireEvent.input(nameField, { target: { value: "Draft, Patient" } });
    vi.advanceTimersByTime(499);
    expect(notified).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(legacyPtName.value).toBe("Draft, Patient");
  });
});

describe("InjectionPanel next-dose override dialog", () => {
  it("keeps Record override disabled until date, reason, and (for provider direction) a provider are filled", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    fireEvent.click(screen.getByText("Override…"));
    expect(screen.getByText("Override calculated return target")).not.toBeNull();

    const submit = screen.getByText("Record override");
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Override date"), { target: { value: "080126" } });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText("Reason / order context"), {
      target: { value: "Active order specifies a later return date." },
    });
    expect(submit).not.toBeDisabled();

    // Switching to provider-direction authority adds a required field and
    // re-disables submit until it, too, is filled.
    fireEvent.change(screen.getByLabelText("Authority"), {
      target: { value: "provider-direction" },
    });
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText("Directing provider"), {
      target: { value: "Dr. Provider" },
    });
    expect(submit).not.toBeDisabled();
  });

  it("applies a confirmed override to the visible schedule and switches the trigger to review mode", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    fireEvent.click(screen.getByText("Override…"));
    fireEvent.change(screen.getByLabelText("Override date"), { target: { value: "080126" } });
    fireEvent.input(screen.getByLabelText("Reason / order context"), {
      target: { value: "Active order specifies a later return date." },
    });
    fireEvent.click(screen.getByText("Record override"));

    expect(screen.queryByText("Override calculated return target")).toBeNull();
    expect(screen.getByText("08/01/26")).not.toBeNull();
    expect(screen.getByText("Review override…")).not.toBeNull();
  });

  it("discards the draft and leaves the schedule untouched when Cancel is clicked", () => {
    render(
      <InjectionPanel
        initialEncounter={emptyInjectionEncounter()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    fireEvent.click(screen.getByText("Override…"));
    fireEvent.change(screen.getByLabelText("Override date"), { target: { value: "080126" } });
    fireEvent.input(screen.getByLabelText("Reason / order context"), {
      target: { value: "Draft reason, never submitted." },
    });
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Override calculated return target")).toBeNull();
    expect(screen.getByText("Override…")).not.toBeNull();
    expect(screen.queryByText("Review override…")).toBeNull();
  });
});

describe("InjectionPanel late-dose review dialog", () => {
  it("prompts for a late-dose review and records provider authorization", () => {
    render(
      <InjectionPanel
        initialEncounter={lateInjection()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    fireEvent.click(screen.getByText("Document provider approval / late-dose review"));
    expect(screen.getByText("Late-dose review")).not.toBeNull();

    const submit = screen.getByText("Record review");
    expect(submit).toBeDisabled();

    fireEvent.input(screen.getByLabelText("Approving provider"), {
      target: { value: "Dr. Reviewer" },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Approval / decision time"), {
      target: { value: "021026 0900" },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);

    expect(screen.queryByText("Late-dose review")).toBeNull();
    expect(screen.queryByText("Document provider approval / late-dose review")).toBeNull();
    expect(screen.getByText(/provider approval documented/)).not.toBeNull();
    expect(screen.getByText(/Dr\. Reviewer/)).not.toBeNull();
  });

  it("auto-opens the late-dose review once on reaching Review, and does not re-prompt on a later revisit", () => {
    render(
      <InjectionPanel
        initialEncounter={lateInjection()}
        activePatient={{}}
        staffSignInValue="Test MA"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Review" }));
    expect(screen.getByText("Late-dose review")).not.toBeNull();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Late-dose review")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Order & Timing" }));
    fireEvent.click(screen.getByRole("tab", { name: "Review" }));
    expect(screen.queryByText("Late-dose review")).toBeNull();
  });
});
