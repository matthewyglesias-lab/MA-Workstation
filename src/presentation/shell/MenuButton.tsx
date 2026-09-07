import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";

export type MenuTrigger = "split-disclosure" | "outlined" | "quiet";

interface MenuButtonProps {
  /** Visible trigger text. A split disclosure shows only its caret. */
  label: string;
  /** Accessible name for the menu itself, distinct from its trigger. */
  menuLabel: string;
  trigger: MenuTrigger;
  /** Rendered before the label. */
  icon?: ComponentChildren;
  /**
   * `dismiss(false)` closes without restoring focus to the trigger — used when
   * the chosen item hands focus somewhere else, so the handoff is not clawed
   * back.
   */
  children: (dismiss: (restoreFocus?: boolean) => void) => ComponentChildren;
  disabled?: boolean;
  /** Extra class on the trigger, for placement by its host. */
  class?: string;
}

/**
 * One disclosure menu, shared by every menu in the shell: the split `New Note`
 * action, `More`, `Customize View`, and the header's account control.
 *
 * There used to be a second, entirely separate menu implementation — the
 * desktop menu bar's, with its own context, mnemonics and tracking model. That
 * bar is gone (a menu bar is a desktop-application affordance Tebra does not
 * have), and with it the reason to maintain two menus that behaved differently
 * on Escape and on focus return. This is the survivor.
 *
 * Escape and outside-pointer both dismiss, and dismissal returns focus to the
 * trigger. A menu that drops focus on the body is the kind of small break that
 * reads as unfinished rather than as a different product.
 */
export function MenuButton({
  label,
  menuLabel,
  trigger,
  icon,
  children,
  disabled = false,
  class: className = "",
}: MenuButtonProps) {
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

  const triggerClass =
    trigger === "split-disclosure"
      ? "tebra-action-split-disclosure"
      : trigger === "quiet"
        ? "tebra-menu-quiet"
        : "tebra-action-outlined";

  return (
    <div class="tebra-action-menu" ref={hostRef}>
      <button
        ref={triggerRef}
        type="button"
        class={`${triggerClass} ${className}`.trim()}
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
            {icon}
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
