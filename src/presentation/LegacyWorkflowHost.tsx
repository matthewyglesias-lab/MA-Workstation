import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { LegacyPanelAdapter } from "./types";

interface LegacyWorkflowHostProps {
  adapter: LegacyPanelAdapter;
  label?: string;
  onHostReady?: (element: HTMLDivElement | null) => void;
}

export function LegacyWorkflowHost({
  adapter,
  label = "workflow",
  onHostReady,
}: LegacyWorkflowHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mountError, setMountError] = useState("");

  useLayoutEffect(() => {
    const host = hostRef.current;
    onHostReady?.(host);
    if (!host || typeof document === "undefined") return;

    const panel =
      adapter.resolve?.() ??
      (document.querySelector(adapter.selector) as HTMLElement | null);

    if (!panel) {
      setMountError(`Unable to locate ${adapter.selector}`);
      return () => onHostReady?.(null);
    }

    setMountError("");
    const originalParent = panel.parentNode;
    const originalNextSibling = panel.nextSibling;
    const originalHidden = panel.hidden;
    const originalDisplay = panel.style.display;
    const originalAriaHidden = panel.getAttribute("aria-hidden");
    const mountedClassName =
      adapter.mountedClassName ?? "cd2004-legacy-panel-mounted";
    const originallyHadMountedClass = panel.classList.contains(mountedClassName);

    panel.hidden = false;
    panel.style.display = "";
    panel.removeAttribute("aria-hidden");
    panel.classList.add(mountedClassName);
    host.appendChild(panel);
    adapter.onMount?.(panel, host);

    return () => {
      adapter.onUnmount?.(panel);
      if (!originallyHadMountedClass) panel.classList.remove(mountedClassName);
      panel.hidden = originalHidden;
      panel.style.display = originalDisplay;
      if (originalAriaHidden === null) panel.removeAttribute("aria-hidden");
      else panel.setAttribute("aria-hidden", originalAriaHidden);

      if (originalParent) {
        if (originalNextSibling?.parentNode === originalParent) {
          originalParent.insertBefore(panel, originalNextSibling);
        } else {
          originalParent.appendChild(panel);
        }
      }
      onHostReady?.(null);
    };
  }, [adapter, onHostReady]);

  return (
    <div
      ref={hostRef}
      class="cd2004-legacy-host"
      data-legacy-selector={adapter.selector}
      aria-label={`${label} content`}
    >
      {mountError && (
        <div class="cd2004-system-message is-error" role="alert">
          <strong>Panel unavailable.</strong>
          <span>{mountError}</span>
        </div>
      )}
    </div>
  );
}
