import { DesktopIcon } from "./DesktopIcon";
import type { NoteSection, ReadinessItem } from "./types";

interface NoteInspectorProps {
  title: string;
  subtitle?: string;
  readiness: ReadinessItem[];
  sections: NoteSection[];
  postState: "idle" | "posting" | "posted" | "error";
  postMessage?: string;
  onCopySection?: (section: NoteSection) => void;
  onCopyAll?: () => void;
}

export function NoteInspector({
  title,
  subtitle,
  readiness,
  sections,
  postState,
  postMessage,
  onCopySection,
  onCopyAll,
}: NoteInspectorProps) {
  const completed = readiness.filter((item) => item.state === "complete").length;
  const blockers = readiness.filter((item) => item.state === "stop").length;
  const warnings = readiness.filter((item) => item.state === "warning").length;
  const readinessTotal = readiness.length;

  return (
    <div class={`cd2004-inspector is-${postState}`}>
      <div class="cd2004-readiness-summary">
        <div class="cd2004-readiness-score">
          <span>Readiness</span>
          <strong>
            {completed}/{readinessTotal || 0}
          </strong>
        </div>
        <div class="cd2004-readiness-flags">
          <span class={blockers ? "has-stop" : ""}>{blockers} incomplete</span>
          <span class={warnings ? "has-warning" : ""}>{warnings} warnings</span>
        </div>
      </div>

      <div class="cd2004-readiness-list" aria-label="Readiness checks">
        {readiness.length ? (
          readiness.map((item) => (
            <div key={item.id} class={`cd2004-readiness-item is-${item.state}`}>
              <span class="cd2004-readiness-marker" aria-hidden="true">
                {item.state === "complete"
                  ? "✓"
                  : item.state === "stop"
                    ? "×"
                    : item.state === "warning"
                      ? "!"
                      : "·"}
              </span>
              <span>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </span>
            </div>
          ))
        ) : (
          <div class="cd2004-empty-row">Start the workflow to populate readiness.</div>
        )}
      </div>

      <div class="cd2004-note-heading">
        <div>
          <span>Document preview</span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <button
          type="button"
          class="cd2004-command-button"
          disabled={!sections.length}
          onClick={onCopyAll}
        >
          Copy all
        </button>
      </div>

      <div class="cd2004-note-sections">
        {sections.length ? (
          sections.map((section) => (
            <section key={section.id} class="cd2004-note-section">
              <header>
                <span>
                  {section.label}
                  {section.destination && <small>{section.destination}</small>}
                </span>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => onCopySection?.(section)}
                >
                  Copy
                </button>
              </header>
              <pre>{section.content}</pre>
            </section>
          ))
        ) : (
          <div class="cd2004-note-empty">
            <DesktopIcon name="note" />
            <strong>Note preview is waiting.</strong>
            <span>Document the encounter to build the Tebra-ready text.</span>
          </div>
        )}
      </div>

      <div class="cd2004-post-zone">
        {postState === "posted" && (
          <div class="cd2004-post-stamp" role="status" tabIndex={-1}>
            <DesktopIcon name="check" />
            <span>
              <strong>LOCAL RECORD LOCKED</strong>
              <small>{postMessage ?? "The browser-local record is read-only."}</small>
            </span>
          </div>
        )}
        {postState === "error" && (
          <div class="cd2004-post-error" role="alert">
            <DesktopIcon name="alert" />
            <span>
              <strong>Record was not posted.</strong>
              <small>{postMessage ?? "No changes were cleared or locked."}</small>
            </span>
          </div>
        )}
        {postState === "posting" && (
          <div class="cd2004-post-pending" role="status">
            Saving and validating the local record…
          </div>
        )}
      </div>
    </div>
  );
}
