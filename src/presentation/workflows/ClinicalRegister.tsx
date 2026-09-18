import type { ComponentChildren } from "preact";
import type { WorkflowFieldSource } from "../../application/workstation-projection";

export type ClinicalFieldSource = WorkflowFieldSource;
export type ClinicalFieldState = "REQ" | "OK" | "OPT" | "PEND" | "REV" | "STOP" | "N/A";

/** Staff-entered values need no extra label. Carried/calculated provenance
 * remains available in a keyboard-accessible disclosure beside the caption. */
const SILENT_SOURCE: ReadonlySet<ClinicalFieldSource> = new Set(["ENTRY"]);
const SOURCE_LABEL: Record<string, string> = {
  CHART: "From chart", STAFF: "Signed-in staff", SESSION: "Session", LOCAL: "Local record",
  LABEL: "Product label", LBL: "Product label", CALC: "Calculated", REF: "Reference",
  OVR: "Override", LOCK: "Signed record", LOCKED: "Signed record", DEFAULT: "Default", RECORD: "Saved record",
};
const readableSummary = (value: string): string => {
  const labels: Record<string, string> = { PENDING: "Not set", INCOMPLETE: "Details needed", COMPLETE: "Complete" };
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return date ? `${date[2]}/${date[3]}/${date[1]}` : labels[value] ?? value;
};
// Sentence case only the uppercase heading of an exception/disclosure, never
// arbitrary clinical text, medication names, or values.
const readableHeading = (label: string): string => label.replace(/^[A-Z][A-Z /&–-]+(?= —|:|$)/, text => text[0] + text.slice(1).toLowerCase());

export function RegisterMarkers({
  source = "ENTRY", state, changed = false, changeDetail, fieldLabel = "Field",
}: {
  source?: ClinicalFieldSource; state: ClinicalFieldState; changed?: boolean;
  changeDetail?: string; fieldLabel?: string;
}) {
  const showSource = !SILENT_SOURCE.has(source);
  const sourceLabel = SOURCE_LABEL[source] ?? source;
  // Required state belongs to aria-required/aria-invalid and one caption asterisk,
  // not a second “Required” stamp. All provenance remains available on demand.
  if (!showSource && !changed && state !== "REV") return null;
  return <details class="wfp-register-markers lf-field-provenance" onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label={`${fieldLabel}: field information`} title={`${fieldLabel}: ${changed ? "value edited; " : ""}${sourceLabel}`}>
      {changed ? <span class="lf-edited-label">Edited</span> : state === "REV" ? <span class="lf-edited-label">Review</span> :
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 9v5"/><circle cx="10" cy="6" r=".6" fill="currentColor"/></svg>}
    </summary>
    <span class="lf-provenance-content">
      {showSource && <span class="wfp-register-source">{sourceLabel}</span>}
      {changed && <span class="wfp-register-change">{changeDetail ?? "Changed from the carried or calculated value."}</span>}
      {state === "REV" && <span class="wfp-register-state is-rev">Review this value before completion.</span>}
    </span>
  </details>;
}

export function WorkflowSummaryFact({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "attention" | "stop";
}) {
  return (
    <span
      class={`wfp-summary-fact is-${tone}`}
      title={`${label}: ${value}`}
      aria-label={`${label}: ${value}`}
    >
      <b>{label}</b>
      <span>{readableSummary(value)}</span>
    </span>
  );
}

export function TransactionLine({
  label,
  documented,
  open,
  onToggle,
  children,
}: {
  label: string;
  documented?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ComponentChildren;
}) {
  return (
    <div class={`wfp-transaction ${open ? "is-open" : ""}`}>
      <button type="button" class="wfp-transaction-line" aria-expanded={open} onClick={onToggle}>
        <span class="lf-disclosure-chevron" aria-hidden="true">{open ? "⌄" : "›"}</span>
        <strong>{readableHeading(label)}</strong>
        <span class={`wfp-transaction-state ${documented ? "is-documented" : ""}`}>
          {documented ? "Documented" : "Not recorded"}
        </span>
      </button>
      {open && <div class="wfp-transaction-body">{children}</div>}
    </div>
  );
}
