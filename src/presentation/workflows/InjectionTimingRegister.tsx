import type { ComponentChildren } from "preact";
import "../lightfully/timing.css";

export type InjectionTimingRegisterTone = "neutral" | "ok" | "warning" | "stop";
export interface InjectionTimingRegisterRow {
  /** Presentation ownership is explicit, independent of order or English text. */
  kind: "next" | "elapsed" | "window";
  label: string;
  value: string;
  note?: string;
  flag?: string;
  flagTone?: InjectionTimingRegisterTone;
}
export interface InjectionTimingRegisterProps {
  variant: "timing" | "return";
  marker?: string;
  verdict?: string;
  tone?: InjectionTimingRegisterTone;
  rows: ReadonlyArray<InjectionTimingRegisterRow>;
  bandTitle?: string;
  bandDetail?: string;
  actions?: ComponentChildren;
}
const SOURCE_LABELS: Record<string, string> = {
  CALC: "Calculated", OVR: "Override", REF: "Reference", PENDING: "Not set", REVIEW: "Review", "N/A": "Not applicable",
};
function TimingFact({ row, tone }: { row: InjectionTimingRegisterRow; tone: InjectionTimingRegisterTone }) {
  const redundantWindowFlag = row.kind === "elapsed" && row.flag === "IN WINDOW" &&
    tone === "ok" && (!row.flagTone || row.flagTone === "ok");
  return <div class="lf-timing-row" data-timing-fact={row.kind}>
    <dt>{row.label}</dt><dd><span class="lf-timing-value">{row.value}</span>
      {row.note && <span class="lf-timing-note">{row.note}</span>}
      {row.flag && !redundantWindowFlag && <span class={`lf-timing-flag is-${row.flagTone ?? tone}`}>{row.flag}</span>}
    </dd>
  </div>;
}
/** Two semantic regions, one engine's values. Only the concise verdict is live;
 * unrelated input updates cannot reannounce every date and provenance detail. */
export function InjectionTimingRegister({ variant, marker, verdict, tone = "neutral", rows, bandTitle, bandDetail, actions }: InjectionTimingRegisterProps) {
  const repeatedNormalVerdict = tone === "ok" && verdict === "ON SCHEDULE" && bandTitle === "On schedule.";
  const title = variant === "timing" ? "SCHEDULE — NEXT DOSE" : "RETURN TARGET";
  const next = rows.filter(row => row.kind === "next");
  const visit = rows.filter(row => row.kind !== "next");
  return <section class={`lf-timing-register is-${tone}`} data-timing-variant={variant} aria-label={verdict ? `${title} — ${verdict}` : title}>
    <div class="lf-timing-layout">
      <div class="lf-timing-next" role="group" aria-label="Next injection due">
        <header class="lf-timing-head"><strong>{variant === "timing" ? "Next injection due" : "Return planning"}</strong>
          {marker && <span class="lf-timing-mark" data-source-code={marker} title={`Source: ${marker}`}>{SOURCE_LABELS[marker] ?? marker}</span>}
        </header>
        <dl class="lf-timing-rows">{next.map(row => <TimingFact key={row.kind} row={row} tone={tone}/>)}</dl>
        {actions && <div class="lf-timing-actions">{actions}</div>}
      </div>
      {(visit.length > 0 || verdict || bandTitle) && <div class="lf-timing-visit" role="group" aria-label="Timing of this visit">
        <header class="lf-timing-head"><strong>Timing of this visit</strong></header>
        <div class="lf-timing-status" role="status" aria-live="polite" aria-atomic="true">
          {verdict && <span class={`lf-timing-verdict is-${tone}`}>{verdict}</span>}
          {bandTitle && !repeatedNormalVerdict && <strong>{bandTitle}</strong>}
        </div>
        <dl class="lf-timing-rows">{visit.map(row => <TimingFact key={row.kind} row={row} tone={tone}/>)}</dl>
      </div>}
    </div>
    {bandDetail && <div class={`lf-timing-band is-${tone}`}>
      {bandDetail && <span>{bandDetail}</span>}
    </div>}
  </section>;
}
