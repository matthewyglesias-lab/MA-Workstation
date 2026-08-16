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
  const pending = readiness.filter((item) => item.state === "pending").length;
  const readinessTotal = readiness.length;
  const documentIsDraft = blockers > 0 || pending > 0;

  return (
    <div class={`cd2004-inspector is-${postState}`}>
      <div class="cd2004-readiness-summary">
        <div class="cd2004-readiness-score">
          <span>Requirements</span>
          <strong>{completed} OF {readinessTotal || 0}</strong>
        </div>
        <div class="cd2004-readiness-flags">
          <span class={blockers ? "has-stop" : ""}>
            {blockers ? `${blockers} INCOMPLETE` : pending ? `${pending} PENDING` : "COMPLETE"}
          </span>
          {warnings > 0 && <span class="has-warning">{warnings} REVIEW</span>}
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
              <small class="cd2004-readiness-state">
                {item.state === "complete"
                  ? "Complete"
                  : item.state === "stop"
                    ? "Required"
                    : item.state === "warning"
                      ? "Review"
                      : "Pending"}
              </small>
            </div>
          ))
        ) : (
          <div class="cd2004-empty-row">Start the workflow to populate readiness.</div>
        )}
      </div>

      <div class="cd2004-note-heading">
        <DesktopIcon name="note" />
        <strong>{title}</strong>
        <span>REVIEW</span>
      </div>

      <div class="cd2004-note-toolbar" role="toolbar" aria-label="Document review commands">
        <span class="cd2004-note-mode" title={subtitle}>
          READ ONLY · LOCAL
        </span>
        <button
          type="button"
          class="cd2004-command-button cd2004-note-copy-all"
          disabled={!sections.length}
          onClick={onCopyAll}
          title={
            documentIsDraft
              ? "Copy the current incomplete documentation as a draft."
              : "Copy the completed local documentation."
          }
        >
          <DesktopIcon name="copy" />
          {documentIsDraft ? "Copy draft note" : "Copy note"}
        </button>
      </div>

      <div class="cd2004-note-sections">
        {sections.length ? (
          sections.map((section) => (
            <section key={section.id} class="cd2004-note-section">
              <header>
                <span class="cd2004-note-section-id">
                  <DesktopIcon name="note" />
                  <b>{section.label}</b>
                  {section.destination &&
                    section.destination.trim().toLocaleLowerCase() !==
                      section.label.trim().toLocaleLowerCase() && (
                      <small>{section.destination}</small>
                    )}
                </span>
                {section.sourceTarget && (
                  <button
                    type="button"
                    class="cd2004-link-button cd2004-note-source"
                    onClick={() => window.dispatchEvent(new CustomEvent("ipmg:navigate-workflow-source", { detail: section.sourceTarget }))}
                  >
                    Source →
                  </button>
                )}
                <button
                  type="button"
                  class="cd2004-command-button cd2004-note-copy"
                  aria-label={`Copy ${section.label} section`}
                  title={`Copy ${section.label} section`}
                  onClick={() => onCopySection?.(section)}
                >
                  <DesktopIcon name="copy" />
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
            <span>Document the encounter to build the local note preview.</span>
          </div>
        )}
      </div>

      <div class="cd2004-post-zone">
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
