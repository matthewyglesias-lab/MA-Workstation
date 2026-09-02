import { DesktopIcon } from "./DesktopIcon";
import { summarizeReadinessVerdict } from "../application/readiness-projection";
import { CHECKLIST, RECORD, SHELL, readinessVerdictCopy } from "./vocabulary";
import { noteDocumentLines, noteDocumentStats } from "./note-document";
import type { NoteSection, PatientContext, ReadinessItem } from "./types";

interface NoteInspectorProps {
  title: string;
  subtitle?: string;
  readiness: ReadinessItem[];
  sections: NoteSection[];
  patient?: PatientContext;
  postState: "idle" | "posting" | "posted" | "error";
  postMessage?: string;
  onCopySection?: (section: NoteSection) => void;
  onCopyAll?: () => void;
}

/**
 * One section of the document, rendered as a terminal document viewer renders
 * one: a numbered gutter beside the text.
 *
 * The gutter is a sibling grid cell per line rather than a single column of
 * numbers beside a single block of text. That is what keeps the numbering
 * honest once a line wraps - a shared column would drift out of step with the
 * text the moment any line took two visual rows, and a line number pointing at
 * the wrong line is worse than none.
 *
 * The numbers are `user-select: none` in CSS, so dragging a selection across
 * the note and copying it by hand cannot pull chrome into the clipboard. The
 * Copy buttons never touch the DOM at all - they copy `section.content`
 * directly - so they are unaffected either way.
 */
function NoteDocumentBody({ content }: { content: string }) {
  return (
    <div class="cd2004-note-body">
      {noteDocumentLines(content).map((line) => (
        <>
          <span class="cd2004-note-lineno" aria-hidden="true">
            {line.number}
          </span>
          <span class={`cd2004-note-line is-${line.kind}`}>
            {line.segments.map((segment, index) =>
              segment.role === "plain" ? (
                segment.text
              ) : (
                <span key={index} class={`cd2004-note-seg-${segment.role}`}>
                  {segment.text}
                </span>
              ),
            )}
          </span>
        </>
      ))}
    </div>
  );
}

export function NoteInspector({
  title,
  subtitle,
  readiness,
  sections,
  patient,
  postState,
  postMessage,
  onCopySection,
  onCopyAll,
}: NoteInspectorProps) {
  const verdict = summarizeReadinessVerdict(readiness);
  const documentIsDraft = verdict?.tone === "blocked";
  const stats = noteDocumentStats(sections.map((section) => section.content));
  // The note is signed once the record is locked. Until then it is a draft,
  // whatever the readiness verdict says - a complete draft is still a draft,
  // and labelling it otherwise would overstate the record's state.
  // State drives the modifier class; vocabulary drives the words. Deriving the
  // class from the label (`is-${label.toLowerCase()}`) coupled the stylesheet
  // to the copy, so renaming a word silently dropped its styling.
  const documentSigned = postState === "posted";
  const documentStateKey = documentSigned ? "signed" : "draft";
  const documentState = documentSigned ? RECORD.signed : RECORD.draft;
  const verdictCopy = verdict ? readinessVerdictCopy(verdict) : null;

  return (
    <div class={`cd2004-inspector is-${postState}`}>
      {/* The aggregate verdict, colour-coded, because a per-row scan is slower
          than staff need when they are deciding whether a note can be signed.
          Scope is decided in `summarizeReadinessVerdict`; wording in
          `readinessVerdictCopy`. */}
      {verdict && verdictCopy && (
        <div class={`cd2004-readiness-verdict is-${verdict.tone}`} role="status">
          <strong>{verdictCopy.headline}</strong>
          <span>{verdictCopy.detail}</span>
        </div>
      )}
      {!verdict && (
        <div class="cd2004-readiness-summary">
          <div class="cd2004-readiness-score">
            <span>{CHECKLIST.title}</span>
            <strong>0 of 0</strong>
          </div>
        </div>
      )}

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

      {/* A document header, not a panel caption. It names the document, whose
          it is, and what state it is in - which is what separates a document
          viewer from a text box, and what the old preview never said. */}
      <div class="cd2004-note-heading">
        <DesktopIcon name="note" />
        <strong>{title}</strong>
        <span class="cd2004-note-marks">
          <span class="cd2004-note-mark">{SHELL.localBadge}</span>
          <span class={`cd2004-note-mark is-${documentStateKey}`}>
            {documentState}
          </span>
        </span>
      </div>

      {(patient?.name || patient?.dob || patient?.visitLabel) && (
        <dl class="cd2004-note-ident">
          {patient.name && (
            <div>
              <dt>Patient</dt>
              <dd>{patient.name}</dd>
            </div>
          )}
          {patient.dob && (
            <div>
              <dt>DOB</dt>
              <dd>{patient.dob}</dd>
            </div>
          )}
          {patient.visitLabel && (
            <div>
              <dt>Visit</dt>
              <dd>{patient.visitLabel}</dd>
            </div>
          )}
        </dl>
      )}

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
                    class="cd2004-note-mark cd2004-note-source"
                    onClick={() => window.dispatchEvent(new CustomEvent("ipmg:navigate-workflow-source", { detail: section.sourceTarget }))}
                  >
                    SOURCE
                  </button>
                )}
                <button
                  type="button"
                  class="cd2004-note-mark cd2004-note-copy"
                  aria-label={`Copy ${section.label} section`}
                  title={`Copy ${section.label} section`}
                  onClick={() => onCopySection?.(section)}
                >
                  COPY
                </button>
              </header>
              <NoteDocumentBody content={section.content} />
            </section>
          ))
        ) : (
          <div class="cd2004-note-empty">
            <DesktopIcon name="note" />
            <strong>Note preview is waiting.</strong>
            <span>Document the encounter to build the local note preview.</span>
          </div>
        )}
        {/* A document that just stops leaves the reader unsure whether more of
            it failed to render. A terminal viewer says where the end is. */}
        {sections.length > 0 && (
          <div class="cd2004-note-eod" aria-hidden="true">
            ── END OF DOCUMENT ──
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div class="cd2004-note-foot">
          <span>
            {stats.sections} SECTION{stats.sections === 1 ? "" : "S"} · {stats.lines} LINE
            {stats.lines === 1 ? "" : "S"}
          </span>
          <span class="cd2004-note-foot-state">{subtitle ?? "LOCAL PREVIEW"}</span>
        </div>
      )}

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
