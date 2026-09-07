import { DesktopIcon } from "../DesktopIcon";
import { ACTION_BAR } from "../vocabulary";
import { WORKFLOW_LABELS, type WorkflowId } from "../types";
import { MenuButton } from "./MenuButton";

/** Note types the split action can start. Internal keys, Tebra-named labels. */
export const NEW_NOTE_WORKFLOWS: readonly WorkflowId[] = [
  "administer",
  "uds",
  "samples",
  "forms",
];

interface ActionBarProps {
  /**
   * Starts a note of the chosen type. This is the one path on the page that
   * crosses from browsing into a workflow, and it is always an explicit
   * choice - never a side effect of opening a chart.
   */
  onNewNote: (workflow: WorkflowId) => void;
  onPrint?: () => void;
  /** Card visibility, persisted by the caller. */
  customizeOptions: ReadonlyArray<{ id: string; label: string; checked: boolean }>;
  onToggleCustomize: (id: string) => void;
}

/**
 * Page-level actions, top right: the coral split `New Note`, then `Print`,
 * `More`, `Customize View`.
 *
 * NOT the per-note lifecycle footer. `RecordLifecycleActions` owns Save, Sign
 * and Discard, which act on the open note and live beside it. These act on the
 * page, and the two must never be confused - a coral Sign next to a coral New
 * Note is exactly the ambiguity Tebra's own layout avoids by keeping one
 * primary-action group per screen.
 */
export function ActionBar({
  onNewNote,
  onPrint,
  customizeOptions,
  onToggleCustomize,
}: ActionBarProps) {
  return (
    <div class="tebra-action-bar" role="group" aria-label={ACTION_BAR.label} data-action-bar>
      <div class="tebra-action-split">
        <button
          type="button"
          class="tebra-action-primary"
          data-action-new-note
          onClick={() => onNewNote("administer")}
        >
          <DesktopIcon name="new" />
          <span>{ACTION_BAR.newNote}</span>
        </button>
        <MenuButton
          label={ACTION_BAR.newNote}
          menuLabel={ACTION_BAR.newNoteMenu}
          trigger="split-disclosure"
        >
          {(dismiss) =>
            NEW_NOTE_WORKFLOWS.map((workflow) => (
              <button
                key={workflow}
                type="button"
                role="menuitem"
                data-action-new-note-type={workflow}
                onClick={() => {
                  dismiss(false);
                  onNewNote(workflow);
                }}
              >
                {WORKFLOW_LABELS[workflow]}
              </button>
            ))
          }
        </MenuButton>
      </div>

      <button
        type="button"
        class="tebra-action-outlined"
        data-action-print
        disabled={!onPrint}
        title={onPrint ? undefined : ACTION_BAR.printUnavailable}
        onClick={() => onPrint?.()}
      >
        <DesktopIcon name="print" />
        <span>{ACTION_BAR.print}</span>
      </button>

      <MenuButton label={ACTION_BAR.more} menuLabel={ACTION_BAR.more} trigger="outlined">
        {() => (
          // `More` is where low-frequency page actions will land. Until this
          // module has one, it says so rather than listing a destination that
          // does not exist - a dead menu entry is the most obvious tell there is.
          <p class="tebra-action-menu-empty" role="none">
            {ACTION_BAR.moreUnavailable}
          </p>
        )}
      </MenuButton>

      <MenuButton
        label={ACTION_BAR.customizeView}
        menuLabel={ACTION_BAR.customizeViewMenu}
        trigger="outlined"
      >
        {() =>
          customizeOptions.map((option) => (
            <label key={option.id} class="tebra-action-menu-check" role="menuitemcheckbox" aria-checked={option.checked}>
              <input
                type="checkbox"
                data-action-customize={option.id}
                checked={option.checked}
                onChange={() => onToggleCustomize(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))
        }
      </MenuButton>
    </div>
  );
}
