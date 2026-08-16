import type { ComponentChildren } from "preact";
import type { WorkflowFieldSource } from "../../application/workstation-projection";

export type ClinicalFieldSource = WorkflowFieldSource;
export type ClinicalFieldState = "REQ" | "OK" | "OPT" | "PEND" | "REV" | "STOP" | "N/A";

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
  return (
    <span
      class="wfp-register-markers"
      aria-label={`Source ${source}; state ${state}${changed ? "; changed from carried or calculated value" : ""}`}
    >
      <span class="wfp-register-source">{source}</span>
      {changed && (
        <span class="wfp-register-change" title={changeDetail ?? "Changed from carried or calculated value"}>
          CHG
        </span>
      )}
      <span class={`wfp-register-state is-${state.toLowerCase()}`}>{state}</span>
    </span>
  );
}

export function WorkflowContextStrip({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: string; tone?: "normal" | "attention" | "stop" }>;
}) {
  return (
    <dl class="wfp-context-strip" aria-label="Current workflow context">
      {items.map((item) => (
        <div class={`wfp-context-item is-${item.tone ?? "normal"}`} key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
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
