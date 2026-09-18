import type { ComponentChildren } from "preact";
import type { WorkflowFieldSource } from "../../application/workstation-projection";

export type ClinicalFieldSource = WorkflowFieldSource;
export type ClinicalFieldState = "REQ" | "OK" | "OPT" | "PEND" | "REV" | "STOP" | "N/A";

/**
 * ENTRY is the default source - staff typed it here - so it appeared on very
 * nearly every field and said nothing. Every other source is a real provenance
 * claim worth a chip: the value came off the chart, the sign-in session, a local
 * record, the product label, a calculation, an override, or a locked record.
 */
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

/**
 * REQ duplicates the caption's red asterisk, OPT duplicates its italic
 * "optional", and OK / PEND / N/A only restate what the field already looks
 * like. Two chips on every field was more decoration than a real terminal ever
 * carried, and it competed with the data. STOP and REV survive: a hard blocker
 * and a review flag are worth calling out beside the field itself.
 */
const SILENT_STATE: ReadonlySet<ClinicalFieldState> = new Set([
  "REQ",
  "OPT",
  "OK",
  "PEND",
  "N/A",
]);

export function RegisterMarkers({
  source = "ENTRY",
  state,
  changed = false,
  changeDetail,
}: {
  source?: ClinicalFieldSource;
  state: ClinicalFieldState;
  changed?: boolean;
  changeDetail?: string;
}) {
  const showSource = !SILENT_SOURCE.has(source);
  const showState = !SILENT_STATE.has(state);
  // Nothing informative to say: render no wrapper at all, so the caption row
  // does not reserve a gap for an empty marker group.
  if (!showSource && !showState && !changed) return null;

  return (
    <span
      class="wfp-register-markers"
      aria-label={`Source ${source}; state ${state}${changed ? "; changed from carried or calculated value" : ""}`}
    >
      {showSource && <span class="wfp-register-source" title={`Source: ${source}`}>{SOURCE_LABEL[source] ?? source}</span>}
      {changed && (
        <span class="wfp-register-change" title={changeDetail ?? "Changed from carried or calculated value"}>
          Changed
        </span>
      )}
      {showState && <span class={`wfp-register-state is-${state.toLowerCase()}`}>{state === "STOP" ? "Required" : state === "REV" ? "Review" : state}</span>}
    </span>
  );
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
        <span aria-hidden="true">{open ? "−" : "+"}</span>
        <strong>{readableHeading(label)}</strong>
        <span class={`wfp-transaction-state ${documented ? "is-documented" : ""}`}>
          {documented ? "Documented" : "Not recorded"}
        </span>
      </button>
      {open && <div class="wfp-transaction-body">{children}</div>}
    </div>
  );
}
