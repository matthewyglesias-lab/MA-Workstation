import type { ComponentChildren } from "preact";

/** Calculated timing readout. All verdicts and cautions retain explicit text,
 * and the presentation never derives or changes the clinical conclusion. */

export type ScheduleRegisterTone = "neutral" | "ok" | "warning" | "stop";

export interface ScheduleRegisterRow {
  label: string;
  /** Rendered in the fixed-width face so columns of values align. */
  value: string;
  /** Trailing context - cadence, source, expected date. Never a conclusion. */
  note?: string;
  /** Short flag on the value itself, the way a lab flags an out-of-range result. */
  flag?: string;
  flagTone?: ScheduleRegisterTone;
}

export interface ScheduleRegisterProps {
  title: string;
  /** Provenance: CALC, OVR, REF ... Omitted when there is nothing to claim. */
  marker?: string;
  /** The verdict word. Required whenever `tone` is not neutral. */
  verdict?: string;
  tone?: ScheduleRegisterTone;
  rows: ReadonlyArray<ScheduleRegisterRow>;
  /** One-line verdict sentence in the tinted band. */
  bandTitle?: string;
  bandDetail?: string;
  actions?: ComponentChildren;
  ariaLive?: "off" | "polite";
}

export function ScheduleRegister({
  title,
  marker,
  verdict,
  tone = "neutral",
  rows,
  bandTitle,
  bandDetail,
  actions,
  ariaLive = "polite",
}: ScheduleRegisterProps) {
  const showBand = Boolean(bandTitle || bandDetail);
  // Display names only. Raw provenance and the evaluator verdict remain
  // accessible; no clinical facts or decisions are translated here.
  const readableTitle: Record<string, string> = {
    "SCHEDULE — NEXT DOSE": "Next-dose timing", "RETURN TARGET": "Return planning",
  };
  const readableMarker: Record<string, string> = {
    CALC: "Calculated", OVR: "Override", REF: "Reference",
    PENDING: "Not set", REVIEW: "Review", "N/A": "Not applicable",
  };
  return (
    <section
      class={`wfp-schedule-register is-${tone}`}
      aria-label={verdict ? `${title} — ${verdict}` : title}
      aria-live={ariaLive}
    >
      <header class="wfp-schedule-head">
        <strong>{readableTitle[title] ?? title}</strong>
        <span class="wfp-schedule-marks">
          {marker && <span class="wfp-schedule-mark" data-source-code={marker} title={`Source: ${marker}`}>{readableMarker[marker] ?? marker}</span>}
          {verdict && (
            <span class={`wfp-schedule-verdict is-${tone}`}>{verdict}</span>
          )}
        </span>
      </header>

      <dl class="wfp-schedule-rows">
        {rows.map((row) => (
          <div key={row.label} class="wfp-schedule-row">
            <dt>{row.label}</dt>
            <dd>
              <span class="wfp-schedule-value">{row.value}</span>
              {row.note && <span class="wfp-schedule-note">{row.note}</span>}
              {row.flag && (
                <span class={`wfp-schedule-flag is-${row.flagTone ?? tone}`}>{row.flag}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {showBand && (
        <div class={`wfp-schedule-band is-${tone}`}>
          {bandTitle && <strong>{bandTitle}</strong>}
          {bandDetail && <span>{bandDetail}</span>}
        </div>
      )}

      {actions && <div class="wfp-schedule-foot">{actions}</div>}
    </section>
  );
}
