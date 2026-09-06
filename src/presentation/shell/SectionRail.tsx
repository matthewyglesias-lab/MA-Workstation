import { DesktopIcon } from "../DesktopIcon";
import { getFunctionKeyCommand } from "../FunctionKeyProfile";
import {
  WORKFLOW_LABELS,
  type PatientContext,
  type WorkflowId,
  type WorkflowSummary,
} from "../types";
import { NAVIGATION, NOTES, PATIENT } from "../vocabulary";

interface SectionRailProps {
  selectedWorkflow: WorkflowId;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  patient?: PatientContext;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
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

      <div class="meditech-rail-context tebra-section-rail-context" aria-label={NAVIGATION.localChart}>
        <strong>{hasLocalChart ? PATIENT.facesheet : PATIENT.noPatient}</strong>
        <span>{localChartDetail}</span>
      </div>

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
