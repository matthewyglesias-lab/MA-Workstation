import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { useDismissibleLayer } from "../interaction/use-dismissible-layer";

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
 * Escape restores the opener. Outside pointer/focus dismissal leaves the new
 * destination in control; it must not steal focus back from another field.
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
  const typeahead = useRef({ text: "", at: 0 });

  const layer = useDismissibleLayer(hostRef, reason => dismiss(reason === "escape"));

  const dismiss = (restoreFocus = true) => {
    layer.deactivate();
    pendingFocusRef.current = null;
    typeahead.current.text = "";
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
    items[nextIndex]?.scrollIntoView({ block: "nearest" });
  };

  const openAndFocus = (position: "first" | "last") => {
    layer.activate();
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
        aria-label={trigger === "split-disclosure" ? menuLabel : label}
        disabled={disabled}
        onClick={() => {
          if (open) dismiss(false);
          else openAndFocus("first");
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.isComposing) return;
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
          if (event.defaultPrevented || event.isComposing) return;
            const items = menuItems();
            const currentIndex = items.findIndex(
              (item) =>
                item === document.activeElement || item.contains(document.activeElement),
            );
            if (event.key === "Tab") return;
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
              return;
            }
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
              const now = Date.now();
              const letter = event.key.toLocaleLowerCase();
              const previous = now - typeahead.current.at < 600 ? typeahead.current.text : "";
              const query = previous === letter ? letter : previous + letter;
              typeahead.current = { text: query, at: now };
              for (let offset = 1; offset <= items.length; offset++) {
                const index = (currentIndex + offset + items.length) % items.length;
                if (items[index]?.textContent?.trim().toLocaleLowerCase().startsWith(query)) {
                  event.preventDefault(); focusMenuItem(index); break;
                }
              }
            }
          }}
        >
          {children(dismiss)}
        </div>
      ) : null}
    </div>
  );
}
