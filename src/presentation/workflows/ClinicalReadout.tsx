import type { ComponentChildren } from "preact";

export type ClinicalReadoutTone = "neutral" | "info" | "attention" | "success" | "danger";

interface ClinicalReadoutProps {
  label: string;
  value: string;
  marker: string;
  detail?: ComponentChildren;
  source?: ComponentChildren;
  tone?: ClinicalReadoutTone;
  actions?: ComponentChildren;
  compact?: boolean;
  ariaLive?: "off" | "polite" | "assertive";
}

/**
 * Shared legacy-clinical readout: the system-owned value gets the strongest
 * hierarchy, while provenance, state, and exception actions remain visible.
 */
export function ClinicalReadout({
  label,
  value,
  marker,
  detail,
  source,
  tone = "neutral",
  actions,
  compact = false,
  ariaLive = "polite",
}: ClinicalReadoutProps) {
  return (
    <section
      class={`wfp-clinical-readout is-${tone} ${compact ? "is-compact" : ""}`}
      aria-label={label}
      aria-live={ariaLive}
    >
      <header class="wfp-clinical-readout-header">
        <span>{label}</span>
        <strong class="wfp-clinical-readout-marker">{marker}</strong>
      </header>
      <div class="wfp-clinical-readout-body">
        <output class="wfp-clinical-readout-value">{value}</output>
        <div class="wfp-clinical-readout-copy">
          {detail && <div class="wfp-clinical-readout-detail">{detail}</div>}
          {source && <small class="wfp-clinical-readout-source">{source}</small>}
        </div>
        {actions && <div class="wfp-clinical-readout-actions">{actions}</div>}
      </div>
    </section>
  );
}
