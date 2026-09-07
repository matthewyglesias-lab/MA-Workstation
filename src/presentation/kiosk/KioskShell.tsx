import { Fragment } from "preact";

import type { WorkstationReadinessItem } from "../../application/workstation-projection";
import type {
  InjectionKioskContext,
  InjectionKioskStepId,
  PatientContext,
} from "../types";
import { KIOSK, PATIENT } from "../vocabulary";
import { formatWorkstationDate } from "../workflows/WorkstationDateField";
import { CareChecklistRail } from "./CareChecklistRail";
import { InjectionStepper } from "./InjectionStepper";
import { SignAndNextCard } from "./SignAndNextCard";

interface KioskShellProps {
  patient: PatientContext;
  workflowPatient?: PatientContext;
  patientMismatch: boolean;
  context?: InjectionKioskContext;
  readiness: readonly WorkstationReadinessItem[];
  activeStep: InjectionKioskStepId;
  locked: boolean;
  canComplete: boolean;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  onStepChange: (step: InjectionKioskStepId) => void;
  onUseWorkflowPatient?: () => void;
  onToggleFullscreen: () => void;
  onExit: () => void;
  onPrintHandout: () => void;
  onStartNextPatient: () => void;
}

const dateLabel = (value?: string): string =>
  value
    ? formatWorkstationDate(value, "date") || value
    : KIOSK.notAvailable;

/**
 * The direct children of the workspace grid that turn the existing Injection
 * editor into a focused, touch-first loop. The editor itself remains mounted
 * by ClinicalDesktopShell; this component supplies only kiosk chrome.
 */
export function KioskShell({
  patient,
  workflowPatient,
  patientMismatch,
  context,
  readiness,
  activeStep,
  locked,
  canComplete,
  fullscreen,
  fullscreenSupported,
  onStepChange,
  onUseWorkflowPatient,
  onToggleFullscreen,
  onExit,
  onPrintHandout,
  onStartNextPatient,
}: KioskShellProps) {
  const patientName = patient.name?.trim() || KIOSK.identifyPatient;
  const patientDob = patient.dob?.trim() || KIOSK.notAvailable;

  return (
    <Fragment>
      <section class="kiosk-patient-summary" aria-label={KIOSK.currentPatient}>
        <div class="kiosk-patient-identity">
          <small>{KIOSK.currentPatient}</small>
          <strong>{patientName}</strong>
          <span>
            {PATIENT.dob}: <b>{patientDob}</b>
          </span>
        </div>
        <dl class="kiosk-patient-facts">
          <div>
            <dt>{PATIENT.allergiesLabel}</dt>
            <dd>{patient.allergyStatus?.trim() || PATIENT.allergiesUnavailable}</dd>
          </div>
          <div>
            <dt>{KIOSK.lastInjection}</dt>
            <dd>{dateLabel(context?.priorDoseDate)}</dd>
          </div>
          <div>
            <dt>{KIOSK.lastSite}</dt>
            <dd>{context?.priorSite?.trim() || KIOSK.notAvailable}</dd>
          </div>
          <div>
            <dt>{KIOSK.nextDue}</dt>
            <dd>{dateLabel(context?.nextDoseDate)}</dd>
          </div>
        </dl>
        <div class="kiosk-shell-actions">
          {fullscreenSupported && (
            <button
              type="button"
              data-kiosk-fullscreen
              onClick={onToggleFullscreen}
            >
              {fullscreen ? KIOSK.exitFullScreen : KIOSK.fullScreen}
            </button>
          )}
          <button type="button" data-kiosk-exit onClick={onExit}>
            {KIOSK.exitMode}
          </button>
        </div>
        {patientMismatch && (
          <div class="kiosk-patient-mismatch" role="status">
            <span>
              <strong>{PATIENT.contextMismatch}</strong>
              <small>{KIOSK.mismatchDetail(workflowPatient?.name ?? "")}</small>
            </span>
            <button
              type="button"
              onClick={onUseWorkflowPatient}
              disabled={!onUseWorkflowPatient}
            >
              {KIOSK.makeActive}
            </button>
          </div>
        )}
      </section>

      <aside class="kiosk-journey-rail" aria-label={KIOSK.modeName}>
        <InjectionStepper
          activeStep={activeStep}
          readiness={readiness}
          locked={locked}
          canComplete={canComplete}
          nonAdministration={Boolean(context?.nonAdministration)}
          onChange={onStepChange}
        />
        <CareChecklistRail readiness={readiness} />
      </aside>

      {locked && (
        <SignAndNextCard
          patientLabel={patient.name?.trim() ?? ""}
          onPrintHandout={onPrintHandout}
          onStartNextPatient={onStartNextPatient}
        />
      )}
    </Fragment>
  );
}
