import { useEffect, useState } from "preact/hooks";

import { isValidIsoDate, localIsoDate } from "../../domain/dates";

/**
 * Typed date entry, in place of `<input type="date">`.
 *
 * A native date input renders the browser's own calendar-picker glyph and
 * segmented spinner, which is the single most anachronistic control on the
 * workstation. It is also the wrong interaction: a clinical desk types dates,
 * it does not open a month grid and click a cell.
 *
 * This control keeps the stored value in the same ISO shape the encounter
 * records and print renderers already use (`yyyy-mm-dd`, or `yyyy-mm-ddThh:mm`
 * in datetime mode), so nothing outside the presentation layer changes. Only
 * the entry and display grammar move to the workstation's:
 *
 *   112595      → 11/25/95        six digits, MMDDYY
 *   11251995    → 11/25/95        eight digits, MMDDYYYY
 *   11/25/95    → 11/25/95        punctuation optional, `-` also accepted
 *   1125        → 11/25/<current> day and month within the current year
 *   T           → today
 *   T-1 / T+30  → relative days, the classic MEDITECH offset
 *   N           → now (datetime mode; sets date and time together)
 *   0930, 09:30 → time component, 24-hour (datetime mode)
 *
 * Rejecting bad entry by reverting to the last good value is deliberate and
 * matches the terminal: an unparseable entry never silently clears a stored
 * clinical date.
 */

export type WorkstationDateMode = "date" | "datetime";

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** Two-digit years follow the common windowing rule: 00-49 → 2000s, 50-99 → 1900s. */
function expandYear(raw: string): number {
  const value = Number(raw);
  if (raw.length === 4) return value;
  return value <= 49 ? 2000 + value : 1900 + value;
}

/**
 * Strict calendar validation, delegated to the domain so 2026-02-30 is rejected
 * here by exactly the rule the records use.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  return isValidIsoDate(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
}

/**
 * Local, not UTC. A date typed at the desk is the desk's calendar date, so this
 * uses the domain's local formatter rather than its UTC `toIsoDate`.
 */
const isoDate = localIsoDate;

/** ISO → the workstation's MM/DD/YY display form. Empty for anything unparseable. */
export function formatWorkstationDate(value: string, mode: WorkstationDateMode): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return "";
  const year = match[1] ?? "";
  const month = match[2] ?? "";
  const day = match[3] ?? "";
  const hour = match[4];
  const minute = match[5];
  const datePart = `${month}/${day}/${year.slice(2)}`;
  if (mode === "date") return datePart;
  return hour && minute ? `${datePart} ${hour}${minute}` : datePart;
}

/** Parses one date token. Returns null when the token is not a date at all. */
function parseDateToken(token: string, now: Date): Date | null {
  const relative = /^T(?:ODAY)?(?:([+-])(\d{1,4}))?$/.exec(token);
  if (relative) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sign = relative[1];
    const magnitude = relative[2];
    if (sign && magnitude) {
      base.setDate(base.getDate() + Number(magnitude) * (sign === "-" ? -1 : 1));
    }
    return base;
  }

  // ISO in, ISO out. This is the stored shape, so a pasted or programmatically
  // filled value has to round-trip rather than read as an out-of-range month.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isRealDate(year, month, day)) return null;
    return new Date(year, month - 1, day);
  }

  const parts = token.split(/[/-]/).filter((part) => part.length > 0);
  let month: number;
  let day: number;
  let year: number;

  if (parts.length === 1) {
    const digits = parts[0] ?? "";
    if (!/^\d+$/.test(digits)) return null;
    month = Number(digits.slice(0, 2));
    day = Number(digits.slice(2, 4));
    if (digits.length === 4) {
      year = now.getFullYear();
    } else if (digits.length === 6 || digits.length === 8) {
      year = expandYear(digits.slice(4));
    } else {
      return null;
    }
  } else if (parts.length === 2 || parts.length === 3) {
    if (!parts.every((part) => /^\d{1,4}$/.test(part))) return null;
    month = Number(parts[0]);
    day = Number(parts[1]);
    const yearPart = parts[2];
    year = yearPart === undefined ? now.getFullYear() : expandYear(yearPart);
  } else {
    return null;
  }

  if (!isRealDate(year, month, day)) return null;
  return new Date(year, month - 1, day);
}

/** Parses one time token into minutes-of-day. Returns null when not a time. */
function parseTimeToken(token: string, now: Date): number | null {
  if (/^N(?:OW)?$/.test(token)) return now.getHours() * 60 + now.getMinutes();

  const colon = /^(\d{1,2}):(\d{2})$/.exec(token);
  const bare = /^(\d{3,4})$/.exec(token);
  let hour: number;
  let minute: number;
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (bare) {
    const digits = (bare[1] ?? "").padStart(4, "0");
    hour = Number(digits.slice(0, 2));
    minute = Number(digits.slice(2, 4));
  } else {
    return null;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Typed entry → ISO. Returns `""` for empty input and `null` when the entry is
 * not a date, which the field treats as "reject and revert".
 */
export function parseWorkstationDate(
  raw: string,
  mode: WorkstationDateMode,
  now: Date = new Date(),
): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return "";

  // A full stored datetime arrives as one `T`-joined token; split it before
  // tokenizing so the `T` is not read as the today shortcut.
  const isoDateTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(trimmed);
  if (isoDateTime) {
    const datePart = parseDateToken(isoDateTime[1] ?? "", now);
    if (!datePart) return null;
    if (mode === "date") return isoDate(datePart);
    return `${isoDate(datePart)}T${isoDateTime[2]}`;
  }

  const tokens = trimmed.split(/\s+/);
  const dateToken = tokens[0] ?? "";
  const timeToken = tokens[1];

  if (mode === "date") {
    if (tokens.length !== 1) return null;
    const date = parseDateToken(dateToken, now);
    return date ? isoDate(date) : null;
  }

  if (tokens.length > 2) return null;

  // `N` alone means now - both halves at once.
  if (timeToken === undefined && /^N(?:OW)?$/.test(dateToken)) {
    return `${isoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  const date = parseDateToken(dateToken, now);
  if (!date) return null;

  let minutes = 0;
  if (timeToken !== undefined) {
    const parsed = parseTimeToken(timeToken, now);
    if (parsed === null) return null;
    minutes = parsed;
  }
  return `${isoDate(date)}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export interface WorkstationDateFieldProps {
  value: string;
  onCommit: (value: string) => void;
  mode?: WorkstationDateMode;
  disabled?: boolean;
  /** Supplied by WorkflowField so the dense caption grid still names the control. */
  labelledBy?: string;
  describedBy?: string;
  required?: boolean;
  invalid?: boolean;
}

export function WorkstationDateField({
  value,
  onCommit,
  mode = "date",
  disabled,
  labelledBy,
  describedBy,
  required,
  invalid,
}: WorkstationDateFieldProps) {
  const display = formatWorkstationDate(value, mode);
  const [draft, setDraft] = useState(display);
  const [rejected, setRejected] = useState(false);

  // The record can change underneath the field (a lookup, a "use current
  // date/time" command, a loaded draft). Re-sync unless the user is mid-entry.
  useEffect(() => {
    setDraft(display);
    setRejected(false);
  }, [display]);

  // Commit reads the control's live value rather than the `draft` state, which
  // is a render behind when `input` and `change` arrive in the same tick - as
  // they do for any programmatic fill.
  const commit = (raw: string) => {
    const parsed = parseWorkstationDate(raw, mode);
    if (parsed === null) {
      setDraft(display);
      setRejected(true);
      return;
    }
    setRejected(false);
    if (parsed !== value) onCommit(parsed);
    else setDraft(formatWorkstationDate(parsed, mode));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autocomplete="off"
      spellcheck={false}
      class={`wfp-date-entry ${rejected ? "is-rejected" : ""}`}
      value={draft}
      disabled={disabled}
      placeholder={mode === "date" ? "MMDDYY" : "MMDDYY HHMM"}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      aria-invalid={invalid || rejected || undefined}
      data-workstation-date={mode}
      onInput={(event) => {
        setDraft(event.currentTarget.value);
        if (rejected) setRejected(false);
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      // A text input fires `change` when the value is committed, including for
      // programmatic fills that never blur. Commit is idempotent, so the extra
      // call a real blur produces is harmless.
      onChange={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        } else if (event.key === "Escape") {
          setDraft(display);
          setRejected(false);
        }
      }}
    />
  );
}
