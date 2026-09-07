import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { DesktopIcon } from "../DesktopIcon";
import { ACTION_BAR } from "../vocabulary";
import { WORKFLOW_LABELS, type WorkflowId } from "../types";

/** Note types the split action can start. Internal keys, Tebra-named labels. */
export const NEW_NOTE_WORKFLOWS: readonly WorkflowId[] = [
  "administer",
  "uds",
  "samples",
  "forms",
];

interface ActionMenuProps {
  label: string;
  /** Accessible name for the menu itself, distinct from its trigger. */
  menuLabel: string;
  /** Rendered as the trigger; a split action passes only its disclosure. */
  trigger: "split-disclosure" | "outlined";
  /**
   * `dismiss(false)` closes without restoring focus to the trigger — used when
   * the chosen item hands focus somewhere else, so the handoff is not clawed
   * back.
   */
  children: (dismiss: (restoreFocus?: boolean) => void) => ComponentChildren;
  disabled?: boolean;
}

/**
 * One disclosure menu, shared by the split action, More, and Customize View.
 *
 * Escape and outside-pointer both dismiss, and dismissal returns focus to the
 * trigger. That is the same contract the shell's menu bar honours; a menu that
 * drops focus on the body is the kind of small break that reads as unfinished
 * rather than as a different product.
 */
function ActionMenu({
  label,
  menuLabel,
  trigger,
  children,
  disabled = false,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const dismiss = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div class="tebra-action-menu" ref={hostRef}>
      <button
        ref={triggerRef}
        type="button"
        class={
          trigger === "split-disclosure"
            ? "tebra-action-split-disclosure"
            : "tebra-action-outlined"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger === "split-disclosure" ? menuLabel : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger === "split-disclosure" ? (
          <span class="tebra-action-caret" aria-hidden="true" />
        ) : (
          <>
            <span>{label}</span>
            <span class="tebra-action-caret" aria-hidden="true" />
          </>
        )}
      </button>
      {open ? (
        <div class="tebra-action-menu-list" id={menuId} role="menu" aria-label={menuLabel}>
          {children(dismiss)}
        </div>
      ) : null}
    </div>
  );
}

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
        <ActionMenu
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
        </ActionMenu>
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

      <ActionMenu label={ACTION_BAR.more} menuLabel={ACTION_BAR.more} trigger="outlined">
        {() => (
          // `More` is where low-frequency page actions will land. Until this
          // module has one, it says so rather than listing a destination that
          // does not exist - a dead menu entry is the most obvious tell there is.
          <p class="tebra-action-menu-empty" role="none">
            {ACTION_BAR.moreUnavailable}
          </p>
        )}
      </ActionMenu>

      <ActionMenu
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
      </ActionMenu>
    </div>
  );
}
