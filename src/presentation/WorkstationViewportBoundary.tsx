import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";

export const MIN_WORKSTATION_VIEWPORT_WIDTH = 800;

const unsupportedViewportQuery = `(max-width: ${MIN_WORKSTATION_VIEWPORT_WIDTH - 1}px), (max-height: 599px)`;

function viewportIsUnsupported() {
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
  const [unsupported, setUnsupported] = useState(viewportIsUnsupported);
  const gateRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia(unsupportedViewportQuery);
    const update = () => setUnsupported(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!unsupported) return;
    gateRef.current?.focus();
    const stopWorkstationShortcut = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", stopWorkstationShortcut, true);
    return () =>
      window.removeEventListener("keydown", stopWorkstationShortcut, true);
  }, [unsupported]);

  return (
    <>
      <div
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
              <strong>MA CLINICAL WORKSTATION</strong>
              <small>LOCAL / TRAINING</small>
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
              Enlarge this window or open the local app on a desktop workstation.
            </footer>
          </section>
        </main>
      )}
    </>
  );
}
