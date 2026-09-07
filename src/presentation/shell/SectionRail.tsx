import type { ComponentChildren } from "preact";
import { DesktopIcon } from "../DesktopIcon";
import { getFunctionKeyCommand } from "../FunctionKeyProfile";
import {
  WORKFLOW_LABELS,
  type PatientContext,
  type WorkflowId,
  type WorkflowSummary,
} from "../types";
import { NAVIGATION, NOTES, PATIENT, PATIENT_NOTES } from "../vocabulary";

interface SectionRailProps {
  selectedWorkflow: WorkflowId;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  patient?: PatientContext;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
  /**
   * Patient search.
   *
   * Tebra puts this in the product header, centred. Measured at every
   * supported width, this module's header cannot hold it: the menu bar - an
   * affordance Tebra does not have - occupies the centre, and below 1024px
   * there is no room on either side of it. Putting it here keeps it reachable
   * at 800x600 instead of vanishing exactly where the workstation is most
   * constrained, and the rail is already where this app's patient context
   * lives. A repository adaptation, not a Tebra measurement.
   */
  search?: ComponentChildren;
  /**
   * Opens the chart for the patient currently in context. Absent when no
   * patient is identified, which is why the group below is conditional: a rail
   * entry that leads nowhere is the most obvious tell there is.
   */
  onOpenChart?: (view: "facesheet" | "notes") => void;
  /** Which chart page is showing, when the chart is the active destination. */
  activeChartView?: "facesheet" | "notes" | null;
}

const RAIL_GROUPS: Array<{
  label: string;
  id: string;
  workflows: WorkflowId[];
}> = [
  {
    label: NAVIGATION.clinicalWork,
    id: "clinical",
    workflows: ["home", "administer", "uds", "samples", "forms"],
  },
  {
    label: NAVIGATION.resources,
    id: "reference",
    workflows: ["reference"],
  },
  {
    label: NAVIGATION.closeout,
    id: "closeout",
    workflows: ["log", "tms"],
  },
];

/**
 * Left section rail for the work this module can actually open. It keeps the
 * familiar Tebra patient-hub placement without inventing links to server-side
 * chart areas that do not exist in this browser-local workstation.
 */
export function SectionRail({
  selectedWorkflow,
  summaries,
  patient = {},
  onWorkflowOpen,
  onOpenRecords,
  search,
  onOpenChart,
  activeChartView = null,
}: SectionRailProps) {
  const localEmrCommand = getFunctionKeyCommand("local-emr");
  const hasLocalChart = Boolean(
    patient.localRecordId?.trim() ||
      patient.visitLabel?.trim() ||
      patient.medicalRecordNumber?.trim(),
  );
  const localChartDetail = hasLocalChart
    ? [patient.name?.trim() || PATIENT.facesheet, patient.localRecordId?.trim()]
        .filter(Boolean)
        .join(" · ")
    : NAVIGATION.selectRecordHint;

  return (
    <nav
      class="cd2004-navigator meditech-record-list tebra-section-rail cd2004-print-exclude"
      aria-label="Open Notes and clinical functions"
    >
      <button
        type="button"
        class="meditech-rail-title tebra-section-rail-title"
        onClick={onOpenRecords}
        disabled={!onOpenRecords}
        aria-label={`Open saved notes (${localEmrCommand.keyLabel})`}
        title={`${NOTES.openNotes} (${localEmrCommand.keyLabel})`}
      >
        <span>{NOTES.openNotes}</span>
        <span class="meditech-rail-records-command">
          <kbd>{localEmrCommand.keyLabel}</kbd>
          <DesktopIcon name="records" />
        </span>
      </button>

      {search ? <div class="tebra-rail-search">{search}</div> : null}

      <div class="meditech-rail-context tebra-section-rail-context" aria-label={NAVIGATION.localChart}>
        <strong>{hasLocalChart ? PATIENT.facesheet : PATIENT.noPatient}</strong>
        <span>{localChartDetail}</span>
      </div>

      {onOpenChart ? (
        <section
          class="meditech-rail-group is-patient"
          aria-labelledby="meditech-rail-patient"
        >
          <div class="meditech-function-heading" id="meditech-rail-patient">
            {NAVIGATION.patientChart}
          </div>
          <button
            type="button"
            class={`cd2004-nav-item${activeChartView === "facesheet" ? " is-selected" : ""}`}
            data-chart-nav="facesheet"
            aria-current={activeChartView === "facesheet" ? "page" : undefined}
            aria-label={NAVIGATION.openFacesheet}
            onClick={() => onOpenChart("facesheet")}
          >
            <span>
              <strong>{PATIENT.facesheet}</strong>
            </span>
            <span class="meditech-nav-icon" aria-hidden="true">
              <DesktopIcon name="patient" />
            </span>
          </button>
          <button
            type="button"
            class={`cd2004-nav-item${activeChartView === "notes" ? " is-selected" : ""}`}
            data-chart-nav="notes"
            aria-current={activeChartView === "notes" ? "page" : undefined}
            aria-label={NAVIGATION.openPatientNotes}
            onClick={() => onOpenChart("notes")}
          >
            <span>
              <strong>{PATIENT_NOTES.title}</strong>
            </span>
            <span class="meditech-nav-icon" aria-hidden="true">
              <DesktopIcon name="note" />
            </span>
          </button>
        </section>
      ) : null}

      <div class="meditech-function-list">
        {RAIL_GROUPS.map((group) => (
          <section
            key={group.id}
            class={`meditech-rail-group is-${group.id}`}
            aria-labelledby={`meditech-rail-${group.id}`}
          >
            <div class="meditech-function-heading" id={`meditech-rail-${group.id}`}>
              {group.label}
            </div>
            {group.workflows.map((workflow) => {
              const summary = summaries[workflow];
              return (
                <button
                  key={workflow}
                  type="button"
                  class={[
                    "cd2004-nav-item",
                    selectedWorkflow === workflow ? "is-selected" : "",
                    `is-${summary?.state ?? "idle"}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={selectedWorkflow === workflow ? "page" : undefined}
                  aria-label={
                    summary?.detail
                      ? `${WORKFLOW_LABELS[workflow]} — ${summary.detail}`
                      : WORKFLOW_LABELS[workflow]
                  }
                  title={WORKFLOW_LABELS[workflow]}
                  onClick={() => onWorkflowOpen(workflow)}
                >
                  <span>
                    <strong>{WORKFLOW_LABELS[workflow]}</strong>
                  </span>
                  {summary?.count ? (
                    <em aria-label={`${summary.count} items`}>{summary.count}</em>
                  ) : null}
                  <span class="meditech-nav-icon" aria-hidden="true">
                    <DesktopIcon name={workflow} />
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
}
