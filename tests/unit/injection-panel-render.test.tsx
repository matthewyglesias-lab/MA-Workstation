import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyInjectionEncounter } from "../../src/domain/injection";
import { InjectionPanel } from "../../src/presentation/workflows/injection/InjectionPanel";

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
