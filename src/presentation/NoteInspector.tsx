import type { InjectionWorkflowProgress } from "../application/injection-workflow-progress";
import { InjectionProgressSummary } from "./InjectionProgressSummary";
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
import { copyButtonLabel, copyFeedbackMessage, useCopyFeedback } from "./clipboard";
import "./lightfully/preview.css";
import { noteDocumentLines, noteDocumentStats, noteDocumentText } from "./note-document";
import type { NoteSection, PatientContext, ReadinessItem } from "./types";

/**
 * What "Copy note" puts on the clipboard when the document has more than one
 * section: the same rule the documentation engine uses to join them, so the
 * whole note reads as it does on screen.
 */

/** Identifies the toolbar command, so its confirmation stays its own. */
const WHOLE_NOTE = "note";

interface NoteInspectorProps {
  title: string;
  subtitle?: string;
  readiness: ReadinessItem[];
  injectionProgress?: InjectionWorkflowProgress;
  sections: NoteSection[];
  patient?: PatientContext;
  /**
   * Withhold both copy commands: what is rendered here may not be what durable
   * storage holds, so putting it on the clipboard invites it into a chart as
   * though it were the record. Separate from a copy the browser refuses, which
   * `clipboard.ts` reports as "blocked" after an attempt was actually made.
   */
  copyUnsafe?: boolean;
  postState: "idle" | "posting" | "posted" | "error";
  postMessage?: string;
}

/** Lossless generated lines; decoration never enters copy content. */
function NoteDocumentBody({ content }: { content: string }) {
  return (
    <div class="cd2004-note-body">
      {noteDocumentLines(content).map((line) => (
        <>
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
  injectionProgress,
  sections,
  patient,
  copyUnsafe,
  postState,
  postMessage,
}: NoteInspectorProps) {
  const verdict = summarizeReadinessVerdict(readiness);
  const stats = noteDocumentStats(sections.map((section) => section.content));
  // The compatibility state "posted" means signed in this browser only.
  // Neither a local signature nor a clipboard copy proves a Tebra handoff.
  const signedLocally = postState === "posted";
  const patientIdentified = Boolean(patient?.name || patient?.dob);
  // The verdict still gets its words from vocabulary rather than carrying them
  // on the projection: this branch's Phase 1 amendment removed `headline` and
  // `detail` from `ReadinessVerdict`, so `readinessVerdictCopy` is where they
  // live. Same rendered text either way.
  const verdictCopy = verdict ? readinessVerdictCopy(verdict) : null;
  // The viewer copies the text it is displaying. It used to forward the click
  // to a hidden control in the compatibility panel, which only ever carried
  // selectors for the injection note - so the same button silently did
  // nothing in UDS, Samples and Forms. The content is right here; copy it.
  const { state: copyState, copy, stateFor } = useCopyFeedback();
  const wholeNoteCopy = stateFor(WHOLE_NOTE);
  const copyFeedback = copyFeedbackMessage(
    copyState,
    wholeNoteCopy || !copyState ? "Note" : "Section",
  );

  return (
    <div class={`cd2004-inspector is-${postState}`}>
      {injectionProgress ? <InjectionProgressSummary progress={injectionProgress} /> : <div class="lf-document-checks">
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
          readiness.filter(item => item.state !== "complete").map((item) => (
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
      <details class="lf-preview-checks"><summary>View checks <span>{readiness.filter(item => item.state === "complete").length} of {readiness.length} recorded</span></summary>
        <ul>{readiness.filter(item => item.state === "complete").map(item => <li key={item.id}><strong>{item.label}</strong><span>{readinessItemStateLabel(item.state)}</span></li>)}</ul>
      </details>
      </div>}
      <article class="lf-note-paper" aria-label="Generated documentation">
      {/* One header identifies the document, its local scope and copy action. */}
      <div class="cd2004-note-toolbar" role="toolbar" aria-label="Document review commands">
        <div class="cd2004-note-heading"><strong>{title}</strong>
          <span class="cd2004-note-mode" title={subtitle}>{signedLocally ? "Signed locally · read-only" : "Read-only preview · local"}</span>
        </div>
        <button
          type="button"
          class={`cd2004-command-button cd2004-note-copy-all${wholeNoteCopy ? ` is-${wholeNoteCopy}` : ""}`}
          disabled={!sections.length || copyUnsafe}
          onClick={() =>
            copy(
              noteDocumentText(sections.map((section) => section.content)),
              WHOLE_NOTE,
            )
          }
          title={
            copyUnsafe
              ? RECORD.noteCopyWithheld
              : sections.length
                ? "Copy this note exactly as it reads here."
                : "Document the encounter to build this note."
          }
        >
          <DesktopIcon name="copy" />
          {copyButtonLabel(wholeNoteCopy, "Copy note")}
        </button>
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

      <p class="lf-note-boundary">{signedLocally ? "This note is signed in this browser. " : "This is a documentation preview. "}Copying does not file it. Confirm the final note separately in Tebra.</p>
      {/* Announced, not just drawn: the confirmation is the whole point of the
          change, and an operator using a screen reader needs it too. */}
      <div class="cd2004-note-copy-status" role="status" aria-live="polite">
        {copyFeedback}
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
                    Source
                  </button>
                )}
                <button
                  type="button"
                  class="cd2004-note-mark cd2004-note-copy"
                  aria-label={`Copy ${section.label} section`}
                  title={`Copy ${section.label} section`}
                  disabled={copyUnsafe}
                  onClick={() => copy(section.content, section.id)}
                >
                  {stateFor(section.id) === "copied" ? "Copied" : "Copy"}
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
            it failed to render. A quiet endpoint confirms that the preview is complete. */}
        {sections.length > 0 && (
          <div class="cd2004-note-eod" aria-hidden="true">
            End of note
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div class="cd2004-note-foot">
          <span>
            {stats.sections} section{stats.sections === 1 ? "" : "s"} · {stats.lines} line
            {stats.lines === 1 ? "" : "s"}
          </span>
          <span class="cd2004-note-foot-state">{subtitle ?? RECORD.notePreview}</span>
        </div>
      )}

      </article>
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
