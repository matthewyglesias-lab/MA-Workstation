import { DesktopIcon } from "./DesktopIcon";
import {
  FUNCTION_KEY_DECK_PROFILE,
  type FunctionKeyActions,
} from "./FunctionKeyProfile";
import { WORKFLOW_LABELS, type WorkflowId } from "./types";
import { SHELL } from "./vocabulary";

interface PowerCommandMenuProps {
  selectedWorkflow: WorkflowId;
  contextCode?: string;
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
      return "Notes";
    case "file":
      return label.toLocaleLowerCase().startsWith("save") ? "Save" : "File";
    case "back":
      return "Back";
    default:
      return label;
  }
}

/**
 * Function-key commands remain available for experienced staff, but they no
 * longer occupy a permanent simulated hardware deck. The native details
 * disclosure keeps them keyboard reachable without competing with the active
 * clinical task.
 */
export function PowerCommandMenu({
  selectedWorkflow,
  contextCode,
  actions = {},
}: PowerCommandMenuProps) {
  return (
    <details class="tebra-power-commands cd2004-print-exclude">
      <summary>
        <DesktopIcon name="reference" />
        <span>{SHELL.shortcuts}</span>
        <kbd>F1</kbd>
      </summary>
      <div
        class="meditech-command-deck"
        role="toolbar"
        aria-label={SHELL.shortcuts}
      >
        <span class="meditech-command-prompt">
          <strong>{SHELL.currentWorkspace}</strong>
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
    </details>
  );
}

interface AppFooterProps {
  message: string;
  readOnly: boolean;
  localStorageAvailable: boolean;
  readOnlyLabel: string;
  editableLabel: string;
  localLabel: string;
  storageErrorLabel: string;
  localDetail: string;
  storageErrorDetail: string;
}

/** Always-visible status and provenance footer. */
export function AppFooter({
  message,
  readOnly,
  localStorageAvailable,
  readOnlyLabel,
  editableLabel,
  localLabel,
  storageErrorLabel,
  localDetail,
  storageErrorDetail,
}: AppFooterProps) {
  return (
    <footer class="cd2004-statusbar tebra-app-footer cd2004-print-exclude">
      <div class="cd2004-status-message" aria-live="polite" aria-atomic="true">
        {message}
      </div>
      <div class="cd2004-status-segment" title={SHELL.currentRecordMode}>
        {readOnly ? readOnlyLabel : editableLabel}
      </div>
      <div
        class={`cd2004-status-segment ${localStorageAvailable ? "is-online" : "is-error"}`}
        title={localStorageAvailable ? localDetail : storageErrorDetail}
      >
        <span aria-hidden="true">{localStorageAvailable ? "●" : "!"}</span>
        {localStorageAvailable ? localLabel : storageErrorLabel}
      </div>
    </footer>
  );
}
