import { PATIENT, PATIENT_CARD } from "../vocabulary";
import type { ChartPatient } from "../patient-chart-model";

interface PatientCardPopupProps {
  patient: ChartPatient;
  /** Rendered as the hoverable trigger; usually the patient's name. */
  label: string;
}

/**
 * Hover card on a patient name.
 *
 * Tebra's card carries insurance and contact detail. This workstation holds
 * none of that, so the card carries what it does hold and stops: an absent row
 * is a smaller seam than a row labelled "Insurance" with nothing beside it.
 *
 * The trigger is a button rather than a bare span so the card is reachable by
 * keyboard, and it does not navigate: browsing a patient is read-only, and
 * only an explicit Open or New Note crosses into a workflow.
 */
export function PatientCardPopup({ patient, label }: PatientCardPopupProps) {
  return (
    <span class="tebra-patient-card-host">
      <button
        type="button"
        class="tebra-patient-card-trigger"
        aria-describedby={`patient-card-${patient.key}`}
      >
        {label}
      </button>
      <span
        class="tebra-patient-card"
        id={`patient-card-${patient.key}`}
        role="tooltip"
        data-patient-card
      >
        <strong class="tebra-patient-card-name">{patient.name}</strong>
        <dl>
          <div>
            <dt>{PATIENT.dob}</dt>
            <dd>{patient.dob || "—"}</dd>
          </div>
          <div>
            <dt>{PATIENT_CARD.recordId}</dt>
            <dd class="tebra-patient-card-id">
              {patient.localRecordId ?? PATIENT_CARD.noRecordId}
            </dd>
          </div>
          <div>
            <dt>{PATIENT.allergiesLabel}</dt>
            <dd>{patient.allergyStatus ?? PATIENT.allergiesUnavailable}</dd>
          </div>
          <div>
            <dt>{PATIENT_CARD.lastVisit}</dt>
            <dd>{patient.lastVisit?.label ?? PATIENT_CARD.noLastVisit}</dd>
          </div>
        </dl>
      </span>
    </span>
  );
}
