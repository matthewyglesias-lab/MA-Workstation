import { DesktopIcon } from "./DesktopIcon";
import {
  WORKFLOW_LABELS,
  WORKFLOW_ORDER,
  type WorkQueueItem,
  type WorkflowId,
  type WorkflowSummary,
} from "./types";

interface MeditechRecordRailProps {
  selectedWorkflow: WorkflowId;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onQueueItemOpen?: (item: WorkQueueItem) => void;
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
 * MEDITECH workstations keep the chart functions and the active record list in
 * a persistent rail. The controls below are the same real workflow routes the
 * shell has always exposed; only their information architecture changes.
 */
export function MeditechRecordRail({
  selectedWorkflow,
  summaries,
  needsReview,
  todayQueue,
  onWorkflowOpen,
  onQueueItemOpen,
}: MeditechRecordRailProps) {
  const recordList = [...needsReview, ...todayQueue].slice(0, 5);

  return (
    <nav
      class="cd2004-navigator meditech-record-list cd2004-print-exclude"
      aria-label="Record List and clinical functions"
    >
      <div class="meditech-rail-title">
        <span>RECORD LIST</span>
        <small>{recordList.length.toString().padStart(2, "0")} ACTIVE</small>
      </div>

      <div class="meditech-record-register" aria-label="Active clinical records">
        {recordList.length === 0 ? (
          <p class="meditech-record-empty">No patient record is selected.</p>
        ) : (
          recordList.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              type="button"
              class={`meditech-record-row is-${item.tone ?? "neutral"}`}
              onClick={() => onQueueItemOpen?.(item)}
              disabled={!onQueueItemOpen}
            >
              <span class="meditech-record-number">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span class="meditech-record-copy">
                <strong>{item.patientLabel}</strong>
                <small>{item.detail}</small>
              </span>
              <span class="meditech-record-module">
                {WORKFLOW_LABELS[item.workflow]}
              </span>
            </button>
          ))
        )}
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
  canSave: boolean;
  canOpenRecords: boolean;
  canReview: boolean;
  reviewLabel: string;
  onHelp: () => void;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
  onFocusInspector: () => void;
  onReview?: () => void;
  onSave?: () => void;
  onEscape?: () => void;
}

interface DeckKey {
  keyLabel: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onInvoke?: () => void;
}

/** Fixed function keys mirror the physical-key command deck used at the desk. */
export function MeditechCommandDeck({
  selectedWorkflow,
  canSave,
  canOpenRecords,
  canReview,
  reviewLabel,
  onHelp,
  onWorkflowOpen,
  onOpenRecords,
  onFocusInspector,
  onReview,
  onSave,
  onEscape,
}: MeditechCommandDeckProps) {
  const keys: DeckKey[] = [
    { keyLabel: "F1", label: "Help", onInvoke: onHelp },
    {
      keyLabel: "F3",
      label: "Home",
      active: selectedWorkflow === "home",
      onInvoke: () => onWorkflowOpen("home"),
    },
    {
      keyLabel: "F4",
      label: "Lookup",
      active: selectedWorkflow === "reference",
      onInvoke: () => onWorkflowOpen("reference"),
    },
    {
      keyLabel: "F6",
      label: "Records",
      disabled: !canOpenRecords,
      onInvoke: onOpenRecords,
    },
    { keyLabel: "F8", label: "Note", onInvoke: onFocusInspector },
    {
      keyLabel: "F10",
      label: reviewLabel,
      disabled: !canReview,
      onInvoke: onReview,
    },
    {
      keyLabel: "F12",
      label: "Save",
      disabled: !canSave,
      onInvoke: onSave,
    },
    { keyLabel: "ESC", label: "Back", onInvoke: onEscape },
  ];

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
      {keys.map((item) => (
        <button
          key={item.keyLabel}
          type="button"
          class={item.active ? "is-active" : ""}
          disabled={item.disabled || !item.onInvoke}
          onClick={item.onInvoke}
        >
          <kbd>{item.keyLabel}</kbd>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
