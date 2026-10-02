import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { useDisclosureLayer } from "../interaction/use-dismissible-layer";

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
  const disclosure = useDisclosureLayer(host);
  return <details ref={host} class={`lf-action-shelf cd2004-print-exclude ${className}`.trim()} data-placement={placement} onToggle={disclosure.onToggle}>
    <summary class="lf-shelf-trigger" onClick={disclosure.onSummaryClick} onKeyDown={event => {
      if (event.defaultPrevented || event.isComposing || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      if (!host.current) return;
      disclosure.open();
      const items = host.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([aria-disabled=true])");
      (event.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
    }}><span>{label}</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
    <div class="lf-shelf-panel" role="group" aria-label={heading} onKeyDown={event => {
      if (event.defaultPrevented || event.isComposing || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      // Rove only action buttons. Inputs retain their native editing keys.
      if (!(event.target instanceof HTMLButtonElement)) return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled):not([aria-disabled=true])"));
      const index = items.indexOf(event.target);
      if (index < 0 || !items.length) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    }} onClickCapture={event => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      // Restore a stable opener *before* the caller opens a confirmation. Do not
      // intercept the action itself or close a preference toggle while editing.
      if (button && !button.matches(":disabled") && !button.hasAttribute("data-shelf-stay-open")) disclosure.close(true);
    }}>
      <div class="lf-shelf-intro"><strong>{heading}</strong>{description && <p>{description}</p>}</div>
      <div class="lf-shelf-actions">{children}</div>
    </div>
  </details>;
}
