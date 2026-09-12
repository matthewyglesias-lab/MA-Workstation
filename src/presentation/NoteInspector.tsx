import { DesktopIcon } from "./DesktopIcon";
import { Illustration } from "./Illustration";
import { summarizeReadinessVerdict } from "../application/readiness-projection";
import {
  CHECKLIST,
  RECORD,
  SHELL,
  readinessItemStateLabel,
  readinessVerdictCopy,
} from "./vocabulary";
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
  const stats = noteDocumentStats(sections.map((section) => section.content));
  // There is one note, written in its final form from the first documented
  // field onward, so the only state worth marking is whether the local record
  // has been filed. A second mark reading DRAFT said nothing the readiness
  // verdict above does not already say, and said it on every note that was
  // merely unfiled - including finished ones.
  const filed = postState === "posted";
  const patientIdentified = Boolean(patient?.name || patient?.dob);
  // The verdict still gets its words from vocabulary rather than carrying them
  // on the projection: this branch's Phase 1 amendment removed `headline` and
  // `detail` from `ReadinessVerdict`, so `readinessVerdictCopy` is where they
  // live. Same rendered text either way.
  const verdictCopy = verdict ? readinessVerdictCopy(verdict) : null;

  return (
    <div class={`cd2004-inspector is-${postState}`}>
      {/* The aggregate verdict, colour-coded, because a per-row scan is slower
          than staff need when they are deciding whether a note can be signed.
          Scope is decided in `summarizeReadinessVerdict`; wording in
          `readinessVerdictCopy`. */}
      {verdict && verdictCopy && (
        /* `tone` reports "blocked" for a pending item as readily as for a
           real stop, so a note nobody has filled in yet arrives at the same
           verdict as one with a contraindication. The projection reports
           `blockers` separately; presentation is where the two are told apart,
           exactly as it is where the words are chosen. No clinical rule
           moves. */
        <div
          class={`cd2004-readiness-verdict is-${verdict.tone}${
            verdict.tone === "blocked" && verdict.blockers === 0
              ? " is-unfinished"
              : ""
          }`}
          role="status"
        >
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
                {readinessItemStateLabel(item.state)}
              </small>
            </div>
          ))
        ) : (
          <div class="cd2004-empty-row">{SHELL.startNoteForReadiness}</div>
        )}
      </div>

      {/* A document header, not a panel caption. It names the document, whose
          it is, and what state it is in - which is what separates a document
          viewer from a text box, and what the old preview never said. */}
      <div class="cd2004-note-heading">
        <DesktopIcon name="note" />
        <strong>{title}</strong>
        <span class="cd2004-note-marks">
          <span class="cd2004-note-mark">LOCAL</span>
          {filed && <span class="cd2004-note-mark is-filed">FILED</span>}
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
          disabled={!sections.length || !onCopyAll}
          onClick={onCopyAll}
          title={
            sections.length
              ? "Copy this note exactly as it reads here."
              : "Document the encounter to build this note."
          }
        >
          <DesktopIcon name="copy" />
          Copy note
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
                  disabled={!onCopySection}
                  onClick={() => onCopySection?.(section)}
                >
                  COPY
                </button>
              </header>
              <NoteDocumentBody content={section.content} />
            </section>
          ))
        ) : (
          /* The note is written in its final form from the first documented
             field, so "nothing here yet" is a real state of the encounter
             rather than a lesser version of the note. It says which one it is
             - a chart with a patient but no documentation reads differently
             from an unopened one - and never implies a draft stage. */
          <div class="cd2004-note-empty">
            <Illustration name="note-waiting" />
            <strong>
              {patientIdentified
                ? "Nothing documented yet."
                : "No encounter started."}
            </strong>
            <span>
              {patientIdentified
                ? "Each section appears here, in its final wording, as the encounter is documented."
                : "Enter the patient and encounter details. The note builds here as you work."}
            </span>
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
          <span class="cd2004-note-foot-state">{subtitle ?? RECORD.notePreview}</span>
        </div>
      )}

      <div class="cd2004-post-zone">
        {postState === "error" && (
          <div class="cd2004-post-error" role="alert">
            <DesktopIcon name="alert" />
            <span>
              <strong>{RECORD.saveFailed}</strong>
              <small>{postMessage ?? RECORD.saveFailedDetail}</small>
            </span>
          </div>
        )}
        {postState === "posting" && (
          <div class="cd2004-post-pending" role="status">
            {RECORD.validatingAndSaving}
          </div>
        )}
      </div>
    </div>
  );
}
