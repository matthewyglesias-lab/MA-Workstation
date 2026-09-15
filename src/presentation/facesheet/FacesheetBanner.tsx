import type { ComponentChildren } from "preact";
import { DesktopIcon } from "../DesktopIcon";
import { FACESHEET, noteCount, PATIENT, PATIENT_CARD, SHELL } from "../vocabulary";
import type { ChartPatient } from "../patient-chart-model";
import { PatientCardPopup } from "./PatientCardPopup";

interface FacesheetBannerProps {
  patient: ChartPatient;
  /** Page-level actions, rendered top right. */
  actions?: ComponentChildren;
  /**
   * Set when a note is open for someone other than the patient being browsed.
   * The shell's masthead is suppressed while a chart is open - it repeated
   * this header and contradicted it - so this is where that fact now lives.
   */
  otherNotePatient?: string;
}

/**
 * Patient hub header for the chart.
 *
 * Distinct from the shell's `PatientBanner`, which follows whichever patient
 * the *open note* belongs to across every workflow. This one heads the chart
 * a user is browsing, which may not be the patient with a note open - so it
 * states its own identity rather than borrowing the masthead's.
 */
export function FacesheetBanner({
  patient,
  actions,
  otherNotePatient,
}: FacesheetBannerProps) {
  return (
    <header class="tebra-facesheet-banner">
      <div class="tebra-facesheet-identity">
        <span class="tebra-facesheet-avatar" aria-hidden="true">
          <DesktopIcon name="patient" />
        </span>
        <div class="tebra-facesheet-identity-copy">
          <h1 class="tebra-facesheet-name">
            <PatientCardPopup patient={patient} label={patient.name} />
          </h1>
          <p class="tebra-facesheet-meta">
            <span>
              {PATIENT.dob} {patient.dob || "—"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{noteCount(patient.noteCount)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {PATIENT_CARD.lastVisit}: {patient.lastVisit?.label ?? PATIENT_CARD.noLastVisit}
            </span>
          </p>
        </div>
      </div>

      <div class="tebra-facesheet-banner-side">
        <p class="tebra-facesheet-allergies">
          <strong>{PATIENT.allergiesLabel}:</strong>{" "}
          <b>{patient.allergyStatus ?? PATIENT.allergiesUnavailable}</b>
        </p>
        {/*
          The local-only disclosure travels with the chart. This is the screen
          that most reads like a real EHR chart, so it is the screen where
          staff are likeliest to assume the documentation reached the patient's
          chart somewhere else. It did not.
        */}
        <p class="tebra-facesheet-scope">{SHELL.localOnlyDetail}</p>
        {actions}
      </div>

      {otherNotePatient ? (
        <p class="tebra-facesheet-other-note" role="status">
          <DesktopIcon name="alert" />
          <span>{FACESHEET.otherNoteOpen(otherNotePatient)}</span>
        </p>
      ) : null}
    </header>
  );
}
