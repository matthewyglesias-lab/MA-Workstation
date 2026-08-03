import { DesktopIcon } from "./DesktopIcon";
import {
  FUNCTION_KEY_DECK_PROFILE,
  getFunctionKeyCommand,
  type FunctionKeyActions,
} from "./FunctionKeyProfile";
import {
  WORKFLOW_LABELS,
  WORKFLOW_ORDER,
  type PatientContext,
  type WorkflowId,
  type WorkflowSummary,
} from "./types";

interface MeditechRecordRailProps {
  selectedWorkflow: WorkflowId;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  patient?: PatientContext;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
}

const ACCELERATOR_WORKFLOWS: WorkflowId[] = [
  "home",
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
];

/**
 * MEDITECH workstations keep chart functions and record access in a persistent
 * rail. The central Start Center owns the actionable work queue, avoiding a
 * second copy of those same follow-up items beside every workflow.
 */
export function MeditechRecordRail({
  selectedWorkflow,
  summaries,
  patient = {},
  onWorkflowOpen,
  onOpenRecords,
}: MeditechRecordRailProps) {
  const localEmrCommand = getFunctionKeyCommand("local-emr");
  const hasLocalChart = Boolean(
    patient.localRecordId?.trim() ||
      patient.visitLabel?.trim() ||
      patient.medicalRecordNumber?.trim(),
  );
  const localChartDetail = hasLocalChart
    ? [patient.name?.trim() || "Local chart", patient.localRecordId?.trim()]
        .filter(Boolean)
        .join(" · ")
    : "Use F11 to select a record";

  return (
    <nav
      class="cd2004-navigator meditech-record-list cd2004-print-exclude"
      aria-label="Record List and clinical functions"
    >
      <div class="meditech-rail-title">
        <span>RECORD LIST</span>
        <span class="meditech-rail-records-command">
          <button
            type="button"
            onClick={onOpenRecords}
            disabled={!onOpenRecords}
            aria-label={`Open saved local records (${localEmrCommand.keyLabel})`}
            title={`${localEmrCommand.label}: open saved local records (${localEmrCommand.keyLabel})`}
          >
            <kbd>{localEmrCommand.keyLabel}</kbd>
          </button>
        </span>
      </div>

      <div class="meditech-rail-context" aria-label="Local chart context">
        <strong>{hasLocalChart ? "LOCAL CHART" : "NO LOCAL CHART"}</strong>
        <span>{localChartDetail}</span>
      </div>

      <div class="meditech-function-heading">
        <span>CLINICAL FUNCTIONS</span>
        <small>SELECT</small>
      </div>

      <div class="meditech-function-list">
        {WORKFLOW_ORDER.map((workflow) => {
          const summary = summaries[workflow];
          const accelerator = ACCELERATOR_WORKFLOWS.indexOf(workflow) + 1;
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
              title={WORKFLOW_LABELS[workflow]}
              onClick={() => onWorkflowOpen(workflow)}
            >
              <kbd>{accelerator > 0 ? accelerator : "·"}</kbd>
              <DesktopIcon name={workflow} />
              <span>
                <strong>{WORKFLOW_LABELS[workflow]}</strong>
                <small>{summary?.detail ?? summary?.state ?? "Available"}</small>
              </span>
              {summary?.count ? (
                <em aria-label={`${summary.count} items`}>{summary.count}</em>
              ) : (
                <i aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

interface MeditechCommandDeckProps {
  selectedWorkflow: WorkflowId;
  /** Injectable command behavior, keyed by the shared Client/Server profile. */
  actions?: FunctionKeyActions;
}

/** Fixed function keys mirror the physical-key command deck used at the desk. */
export function MeditechCommandDeck({
  selectedWorkflow,
  actions = {},
}: MeditechCommandDeckProps) {
  return (
    <div
      class="meditech-command-deck cd2004-print-exclude"
      role="toolbar"
      aria-label="MEDITECH function key commands"
    >
      <span class="meditech-command-prompt">
        <strong>CMD</strong>
        <span>{WORKFLOW_LABELS[selectedWorkflow].toUpperCase()}</span>
      </span>
      {FUNCTION_KEY_DECK_PROFILE.map((command) => {
        const action = actions[command.id] ?? {};

        return (
          <button
            key={command.id}
            type="button"
            class={action.active ? "is-active" : ""}
            disabled={action.disabled || !action.onInvoke}
            onClick={action.onInvoke}
            title={command.description}
          >
            <kbd>{command.keyLabel}</kbd>
            <span>{action.label ?? command.label}</span>
          </button>
        );
      })}
    </div>
  );
}
