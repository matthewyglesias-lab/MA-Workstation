import type { ComponentChildren } from "preact";

/**
 * The workstation's register for a system-calculated clinical readout.
 *
 * Replaces a 24px value on a floating card. Hierarchy comes from position and
 * labeling rather than type size, which is how the rest of this screen works,
 * and the facts are labeled rows instead of a prose sentence.
 *
 * Colour is the point, not decoration. Staff need the verdict before they read
 * anything, so state appears twice in fixed positions: a spine down the left
 * edge that carries from across the room, and a saturated verdict chip in the
 * header that names it. Two rules keep that honest:
 *
 *  - Colour never travels alone. Every state also carries its word, so the
 *    register survives red/green colour deficiency (~8% of men) and monochrome
 *    printing. A green spine with no "ON SCHEDULE" beside it would be a
 *    clinical signal that some staff cannot read.
 *  - The spine is a border, not an inset shadow, so it reserves its own width
 *    and can never paint over the content it is marking.
 */

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
  return (
    <section
      class={`wfp-schedule-register is-${tone}`}
      aria-label={verdict ? `${title} — ${verdict}` : title}
      aria-live={ariaLive}
    >
      <header class="wfp-schedule-head">
        <strong>{title}</strong>
        <span class="wfp-schedule-marks">
          {marker && <span class="wfp-schedule-mark">{marker}</span>}
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
