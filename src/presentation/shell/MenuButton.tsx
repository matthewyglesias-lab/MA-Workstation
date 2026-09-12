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
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  const dismiss = (restoreFocus = true) => {
    pendingFocusRef.current = null;
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const menuItems = (): HTMLElement[] =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
      ) ?? [],
    ).filter((item) => {
      if (item.getAttribute("aria-disabled") === "true") return false;
      return !(item instanceof HTMLButtonElement && item.disabled);
    });

  const focusMenuItem = (index: number) => {
    const items = menuItems();
    if (!items.length) return;
    const nextIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      item.tabIndex = itemIndex === nextIndex ? 0 : -1;
    });
    items[nextIndex]?.focus({ preventScroll: true });
  };

  const openAndFocus = (position: "first" | "last") => {
    pendingFocusRef.current = position;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const items = menuItems();
    const focusedIndex = items.findIndex(
      (item) =>
        item === document.activeElement || item.contains(document.activeElement),
    );
    const pending = pendingFocusRef.current;
    const rovingIndex = focusedIndex >= 0 ? focusedIndex : 0;
    items.forEach((item, index) => {
      item.tabIndex = index === rovingIndex ? 0 : -1;
    });
    if (!pending || !items.length) return;
    pendingFocusRef.current = null;
    focusMenuItem(pending === "last" ? items.length - 1 : 0);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) dismiss(false);
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
        onClick={() => {
          if (open) dismiss(false);
          else openAndFocus("first");
        }}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            openAndFocus("first");
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus("last");
            return;
          }
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
          }
        }}
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
        <div
          ref={menuRef}
          class="tebra-action-menu-list"
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onFocus={(event) => {
            const item = menuItems().find(
              (candidate) =>
                candidate === event.target || candidate.contains(event.target as Node),
            );
            if (!item) return;
            for (const candidate of menuItems()) {
              candidate.tabIndex = candidate === item ? 0 : -1;
            }
          }}
          onKeyDown={(event) => {
            const items = menuItems();
            const currentIndex = items.findIndex(
              (item) =>
                item === document.activeElement || item.contains(document.activeElement),
            );
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              dismiss();
              return;
            }
            if (event.key === "Tab") {
              globalThis.setTimeout(() => dismiss(false), 0);
              return;
            }
            if (!items.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusMenuItem(currentIndex < 0 ? 0 : currentIndex + 1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem(currentIndex < 0 ? items.length - 1 : currentIndex - 1);
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              focusMenuItem(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              focusMenuItem(items.length - 1);
            }
          }}
        >
          {children(dismiss)}
        </div>
      ) : null}
    </div>
  );
}
