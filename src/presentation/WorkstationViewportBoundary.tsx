import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import { SHELL } from "./vocabulary";

export const MIN_WORKSTATION_VIEWPORT_WIDTH = 800;

const unsupportedViewportQuery = `(max-width: ${MIN_WORKSTATION_VIEWPORT_WIDTH - 1}px), (max-height: 599px)`;

export function workstationViewportIsUnsupported() {
  if (typeof window === "undefined") return true;
  return window.matchMedia(unsupportedViewportQuery).matches;
}

interface WorkstationViewportBoundaryProps {
  children: ComponentChildren;
}

/**
 * Clinical worksheets are intentionally desktop-only. Rendering a reduced
 * mobile chart would both conceal important context and create a second,
 * weaker interaction contract. Unsupported viewports hide and inert the whole
 * application tree while keeping an unfinished worksheet mounted, so widening
 * the window cannot discard in-progress documentation.
 */
export function WorkstationViewportBoundary({
  children,
}: WorkstationViewportBoundaryProps) {
  const [unsupported, setUnsupported] = useState(workstationViewportIsUnsupported);
  const contentRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLElement>(null);
  const suspendedFocusRef = useRef<HTMLElement | null>(null);
  const suspendedDialogsRef = useRef<
    Array<{ dialog: HTMLDialogElement; focusTarget: HTMLElement | null }>
  >([]);

  useLayoutEffect(() => {
    const query = window.matchMedia(unsupportedViewportQuery);
    const update = () => {
      if (query.matches) {
        const active = document.activeElement as HTMLElement | null;
        if (
          active &&
          active !== document.body &&
          active.closest(".meditech-workstation-content")
        ) {
          // Capture before the render that hides/inerts the workstation can
          // move focus. Date fields use the same media query to defer their
          // blur commit, leaving the live draft available to resume.
          suspendedFocusRef.current = active;
        }
      }
      setUnsupported(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (!unsupported) {
      const suspended = suspendedDialogsRef.current;
      suspendedDialogsRef.current = [];
      const resumed: Array<{
        dialog: HTMLDialogElement;
        focusTarget: HTMLElement | null;
      }> = [];
      for (const entry of suspended) {
        const { dialog } = entry;
        if (!dialog.isConnected) continue;
        try {
          if (!dialog.open) dialog.showModal();
          resumed.push(entry);
        } catch {
          // An owner may have changed or removed a dialog while the viewport
          // was gated. One stale surface must not prevent the remaining
          // dialogs or the original worksheet focus from being restored.
        }
      }
      const topmost = resumed.at(-1);
      const suspendedFocus = suspendedFocusRef.current;
      suspendedFocusRef.current = null;
      if (topmost || suspendedFocus?.isConnected) {
        const frame = requestAnimationFrame(() => {
          if (!topmost) {
            suspendedFocus?.focus({ preventScroll: true });
            return;
          }
          if (!topmost.dialog.isConnected || !topmost.dialog.open) return;
          const fallback = topmost.dialog.querySelector<HTMLElement>(
            '[autofocus], input:not(:disabled), select:not(:disabled), ' +
              'textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
          );
          const target = topmost.focusTarget?.isConnected
            ? topmost.focusTarget
            : fallback;
          target?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
      }
      return;
    }
    // A modal <dialog> remains in the browser's top layer even when its
    // application ancestor is hidden and inert. Temporarily remove each open
    // workstation modal from that layer before focusing the viewport gate;
    // otherwise the platform refuses the focus move and leaves keyboard users
    // on <body>. Suppressing only this programmatic close event keeps the
    // owner state and any unsubmitted dialog fields mounted. On return to a
    // supported viewport the same element is shown modally and focus resumes.
    const focusGate = () => gateRef.current?.focus({ preventScroll: true });
    let focusFrame: number | null = null;
    const queueGateFocus = () => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        focusGate();
      });
    };
    const suspendDialog = (dialog: HTMLDialogElement): boolean => {
      if (!dialog.isConnected || !dialog.open) return false;
      const activeElement = document.activeElement as HTMLElement | null;
      const preGateFocus = suspendedFocusRef.current;
      const focusTarget =
        preGateFocus && dialog.contains(preGateFocus)
          ? preGateFocus
          : activeElement && dialog.contains(activeElement)
            ? activeElement
            : null;
      const retained = suspendedDialogsRef.current.find(
        (entry) => entry.dialog === dialog,
      );
      if (retained) {
        if (!retained.focusTarget && focusTarget) retained.focusTarget = focusTarget;
      } else {
        suspendedDialogsRef.current.push({ dialog, focusTarget });
      }
      const suppressSuspensionClose = (event: Event) => {
        event.stopImmediatePropagation();
      };
      dialog.addEventListener("close", suppressSuspensionClose, {
        capture: true,
        once: true,
      });
      try {
        dialog.close();
        return true;
      } catch {
        dialog.removeEventListener("close", suppressSuspensionClose, true);
        if (!retained) {
          suspendedDialogsRef.current = suspendedDialogsRef.current.filter(
            (entry) => entry.dialog !== dialog,
          );
        }
        return false;
      }
    };
    const suspendOpenDialogs = () => {
      const content = contentRef.current;
      if (!content) return;
      const openDialogs = Array.from(
        content.querySelectorAll<HTMLDialogElement>("dialog[open]"),
      );
      let suspendedAny = false;
      for (const dialog of openDialogs) {
        if (suspendDialog(dialog)) suspendedAny = true;
      }
      if (suspendedAny) queueGateFocus();
    };
    const content = contentRef.current;
    const dialogObserver = new MutationObserver(suspendOpenDialogs);
    if (content) {
      dialogObserver.observe(content, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["open"],
      });
    }
    suspendOpenDialogs();
    if (!suspendedDialogsRef.current.length) focusGate();
    const stopWorkstationShortcut = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", stopWorkstationShortcut, true);
    return () => {
      dialogObserver.disconnect();
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", stopWorkstationShortcut, true);
    };
  }, [unsupported]);

  return (
    <>
      <div
        ref={contentRef}
        class={`meditech-workstation-content ${unsupported ? "is-unsupported" : ""}`}
        aria-hidden={unsupported ? "true" : undefined}
        inert={unsupported ? true : undefined}
      >
        {children}
      </div>
      {unsupported && (
        <main
          ref={gateRef}
          class="meditech-workstation-gate"
          aria-labelledby="workstationViewportTitle"
          data-minimum-width={MIN_WORKSTATION_VIEWPORT_WIDTH}
          tabIndex={-1}
        >
          <section
            class="meditech-workstation-gate-window"
            role="status"
            aria-live="polite"
          >
            <header>
              <span aria-hidden="true">
                <DesktopIcon name="administer" />
              </span>
              <strong>{SHELL.organizationShort} {SHELL.productName}</strong>
              <small>{SHELL.localOnlyBadge}</small>
            </header>
            <div class="meditech-workstation-gate-body">
              <span class="meditech-workstation-gate-alert" aria-hidden="true">
                <DesktopIcon name="alert" />
              </span>
              <div>
                <h1 id="workstationViewportTitle">Workstation view required</h1>
                <p>
                  Clinical documentation is unavailable at this window size. No
                  chart or record content is displayed in this view.
                </p>
                <dl>
                  <div>
                    <dt>Minimum window</dt>
                    <dd>{MIN_WORKSTATION_VIEWPORT_WIDTH} x 600 px</dd>
                  </div>
                  <div>
                    <dt>Required input</dt>
                    <dd>Keyboard and mouse or trackpad</dd>
                  </div>
                  <div>
                    <dt>Clinical view</dt>
                    <dd>Hidden until supported</dd>
                  </div>
                </dl>
              </div>
            </div>
            <footer>
              {SHELL.localOnlyDetail}. Enlarge this window to continue.
            </footer>
          </section>
        </main>
      )}
    </>
  );
}
