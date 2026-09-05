import { MODULE, NOTES, PATIENT } from "./vocabulary";
import { DesktopIcon } from "./DesktopIcon";
import {
  FUNCTION_KEY_DECK_PROFILE,
  getFunctionKeyCommand,
  type FunctionKeyActions,
} from "./FunctionKeyProfile";
import {
  WORKFLOW_LABELS,
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

const RAIL_GROUPS: Array<{
  label: string;
  id: string;
  workflows: WorkflowId[];
  pinned?: boolean;
}> = [
  {
    label: "Clinical Work",
    id: "clinical",
    workflows: ["home", "administer", "uds", "samples", "forms"],
  },
  {
    // The module inside this group is itself called Reference now, so the
    // group takes the broader category name rather than echoing its one child.
    label: "Resources",
    id: "reference",
    workflows: ["reference"],
  },
  {
    label: "Closeout",
    id: "closeout",
    workflows: ["log", "tms"],
    pinned: true,
  },
];

/**
 * MEDITECH workstations keep chart functions and record access in a persistent
 * rail. The central Dashboard owns the actionable work queue, avoiding a
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
    ? [patient.name?.trim() || PATIENT.facesheet, patient.localRecordId?.trim()]
        .filter(Boolean)
        .join(" · ")
    : "Use F11 to select a record";

  return (
    <nav
      class="cd2004-navigator meditech-record-list cd2004-print-exclude"
      aria-label="Open Notes and clinical functions"
    >
      <button
        type="button"
        class="meditech-rail-title"
        onClick={onOpenRecords}
        disabled={!onOpenRecords}
        aria-label={`Open saved local records (${localEmrCommand.keyLabel})`}
        title={`${localEmrCommand.label}: open saved local records (${localEmrCommand.keyLabel})`}
      >
        <span>{NOTES.openNotes}</span>
        <span class="meditech-rail-records-command">
          <kbd>{localEmrCommand.keyLabel}</kbd>
          <DesktopIcon name="records" />
        </span>
      </button>

      <div class="meditech-rail-context" aria-label="Local chart context">
        <strong>{hasLocalChart ? PATIENT.facesheet : PATIENT.noPatient}</strong>
        <span>{localChartDetail}</span>
      </div>

      <div class="meditech-function-list">
        {RAIL_GROUPS.map((group) => (
          <section
            key={group.id}
            class={`meditech-rail-group is-${group.id} ${group.pinned ? "is-pinned" : ""}`}
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

interface MeditechCommandDeckProps {
  selectedWorkflow: WorkflowId;
  /** Field register code currently owning focus, when a worksheet field is active. */
  contextCode?: string;
  /** Injectable command behavior, keyed by the shared Client/Server profile. */
  actions?: FunctionKeyActions;
}

function compactCommandLabel(commandId: string, label: string): string {
  switch (commandId) {
    case "next-section":
      return "Section";
    case "next-page":
      return "Page";
    case "focus-next-zone": {
      const zoneLabel = label.replace(/^Next\s+/i, "");
      return `${zoneLabel.charAt(0).toLocaleUpperCase()}${zoneLabel.slice(1)}`;
    }
    case "local-emr":
      return "EMR";
    case "file":
      return label.toLocaleLowerCase().startsWith("save") ? "Save" : "File";
    case "back":
      return "Back";
    default:
      return label;
  }
}

/** Fixed function keys mirror the physical-key command deck used at the desk. */
export function MeditechCommandDeck({
  selectedWorkflow,
  contextCode,
  actions = {},
}: MeditechCommandDeckProps) {
  return (
    <div
      class="meditech-command-deck cd2004-print-exclude"
      role="toolbar"
      aria-label="Function key commands"
    >
      {/* "CMD" was a terminal prompt marker, and the shouted context beside
          it was the same word the screen already shows. What is useful here
          is where you are, said once. */}
      <span class="meditech-command-prompt">
        <span>{contextCode ?? WORKFLOW_LABELS[selectedWorkflow]}</span>
      </span>
      {FUNCTION_KEY_DECK_PROFILE.map((command) => {
        const action = actions[command.id] ?? {};
        const commandLabel = action.label ?? command.label;

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
            <span data-compact-label={compactCommandLabel(command.id, commandLabel)}>
              {commandLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
