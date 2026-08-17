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
      {showSource && <span class="wfp-register-source">{source}</span>}
      {changed && (
        <span class="wfp-register-change" title={changeDetail ?? "Changed from carried or calculated value"}>
          CHG
        </span>
      )}
      {showState && <span class={`wfp-register-state is-${state.toLowerCase()}`}>{state}</span>}
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
      <span>{value}</span>
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
        <strong>{label}</strong>
        <span class={`wfp-transaction-state ${documented ? "is-documented" : ""}`}>
          {documented ? "DOCUMENTED" : "NONE"}
        </span>
      </button>
      {open && <div class="wfp-transaction-body">{children}</div>}
    </div>
  );
}
