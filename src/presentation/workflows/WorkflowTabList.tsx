import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** Section navigation adapts to the available form width; it never advances care. */
export function WorkflowTabList({ label, children }: { label: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const sync = () => {
      node.setAttribute("aria-orientation", getComputedStyle(node).flexDirection === "column" ? "vertical" : "horizontal");
      node.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(tab => {
        tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  });
  return <div ref={ref} class="wfp-tabbar wfp-ledger-tabs" role="tablist" aria-label={label} onKeyDown={event => {
    if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
      (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + tabs.length) % tabs.length;
    tabs[next]?.click();
    tabs[next]?.focus({ preventScroll: true });
  }}>{children}</div>;
}
