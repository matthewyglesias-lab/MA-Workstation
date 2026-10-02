import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

/** A native, non-modal disclosure for low-frequency tools, never clinical checks.
 * Children stay mounted, with their original disabled state and action handlers.
 * Opening/closing this shelf does not read or write a clinical record.
 */
export function ActionShelf({ label, heading, description, placement = "down", children, class: className = "" }: {
  label: string;
  heading: string;
  description?: string;
  placement?: "up" | "down";
  children: ComponentChildren;
  class?: string;
}) {
  const host = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const close = (restoreFocus = false) => {
    if (!host.current?.open) return;
    host.current.open = false;
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || !host.current?.open || document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopPropagation(); close(true);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={host} class={`lf-action-shelf cd2004-print-exclude ${className}`.trim()} data-placement={placement}>
    <summary ref={trigger} class="lf-shelf-trigger" onKeyDown={event => {
      if (event.isComposing || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      if (!host.current) return;
      host.current.open = true;
      const items = host.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([aria-disabled=true])");
      (event.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
    }}><span>{label}</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
    <div class="lf-shelf-panel" role="group" aria-label={heading} onClickCapture={event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      // Restore a stable opener *before* the caller opens a confirmation. Do not
      // intercept the action itself or close a preference toggle while editing.
      if (button && !button.matches(":disabled") && !button.hasAttribute("data-shelf-stay-open")) close(true);
    }}>
      <div class="lf-shelf-intro"><strong>{heading}</strong>{description && <p>{description}</p>}</div>
      <div class="lf-shelf-actions">{children}</div>
    </div>
  </details>;
}
