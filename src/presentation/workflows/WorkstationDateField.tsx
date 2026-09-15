import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { isValidIsoDate, localIsoDate } from "../../domain/dates";
import { workstationViewportIsUnsupported } from "../WorkstationViewportBoundary";

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
 * Ordinary field exit rejects bad entry by reverting to the last good value,
 * matching the terminal. Save/navigation shortcuts instead leave invalid raw
 * text in place and veto the command so it can be corrected; either way, an
 * unparseable entry never silently clears a stored clinical date.
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

interface LiveWorkstationDateField {
  input: HTMLInputElement | null;
  value: string;
  display: string;
  mode: WorkstationDateMode;
  onCommit: (value: string) => void;
  normalize: (value: string) => void;
}

const liveWorkstationDateFields = new Set<{
  current: LiveWorkstationDateField;
}>();
let workstationDateLifecycleInstalled = false;

function publishLiveWorkstationDate(
  field: LiveWorkstationDateField,
): "clean" | "invalid" | "published" {
  const input = field.input;
  if (!input || !input.isConnected || input.disabled) return "clean";
  const raw = input.value;
  if (raw === field.display) return "clean";
  const parsed = parseWorkstationDate(raw, field.mode);
  if (parsed === null) return "invalid";
  if (parsed !== field.value) field.onCommit(parsed);
  field.normalize(parsed);
  return "published";
}

/**
 * Install before any effect-backed workflow persistence listener. Date fields
 * intentionally keep raw keystrokes local until commit, so the lifecycle
 * boundary has to publish them before a parent pagehide/visibility handler
 * reads its encounter ref. The registry lets one early capture listener cover
 * every migrated workflow without coupling this generic control to a record
 * repository.
 */
function ensureWorkstationDateLifecycle(): void {
  if (
    workstationDateLifecycleInstalled ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }
  workstationDateLifecycleInstalled = true;

  const publishValidDates = () => {
    for (const field of liveWorkstationDateFields) {
      publishLiveWorkstationDate(field.current);
    }
  };
  window.addEventListener("pagehide", publishValidDates, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) publishValidDates();
  }, { capture: true });
  window.addEventListener("beforeunload", (event) => {
    let hasTransientEntry = false;
    for (const field of liveWorkstationDateFields) {
      const current = field.current;
      const input = current.input;
      if (
        !input ||
        !input.isConnected ||
        input.disabled ||
        input.value === current.display
      ) {
        continue;
      }
      // Publish a valid value so any later unload guard reads the exact fact.
      // Keep an invalid value visible when navigation is cancelled instead of
      // reverting it underneath the user.
      hasTransientEntry = true;
      publishLiveWorkstationDate(current);
    }
    if (hasTransientEntry) {
      event.preventDefault();
      event.returnValue = "";
    }
  }, { capture: true });
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
  const draftDirtyRef = useRef(false);
  const liveFieldRef = useRef<LiveWorkstationDateField>({
    input: null,
    value,
    display,
    mode,
    onCommit,
    normalize: () => undefined,
  });

  ensureWorkstationDateLifecycle();
  liveFieldRef.current.value = value;
  liveFieldRef.current.display = display;
  liveFieldRef.current.mode = mode;
  liveFieldRef.current.onCommit = onCommit;
  liveFieldRef.current.normalize = (parsed) => {
    draftDirtyRef.current = false;
    setRejected(false);
    setDraft(formatWorkstationDate(parsed, mode));
  };

  useLayoutEffect(() => {
    liveWorkstationDateFields.add(liveFieldRef);
    return () => liveWorkstationDateFields.delete(liveFieldRef);
  }, []);

  // The record can change underneath the field (a lookup, a "use current
  // date/time" command, a loaded draft). Re-sync unless the user is mid-entry.
  useEffect(() => {
    if (draftDirtyRef.current) return;
    setDraft(display);
    setRejected(false);
  }, [display]);

  // Commit reads the control's live value rather than the `draft` state, which
  // is a render behind when `input` and `change` arrive in the same tick - as
  // they do for any programmatic fill.
  const commit = (
    raw: string,
    { preserveInvalid = false }: { preserveInvalid?: boolean } = {},
  ): boolean => {
    const parsed = parseWorkstationDate(raw, mode);
    if (parsed === null) {
      // A save or navigation shortcut must be allowed to veto the command
      // without erasing the text the user still needs to correct. Ordinary
      // field exit retains the terminal's historical reject-and-revert rule.
      draftDirtyRef.current = preserveInvalid;
      setDraft(preserveInvalid ? raw : display);
      setRejected(true);
      return false;
    }
    draftDirtyRef.current = false;
    setRejected(false);
    if (parsed !== value) onCommit(parsed);
    setDraft(formatWorkstationDate(parsed, mode));
    return true;
  };

  return (
    <input
      ref={(input) => {
        liveFieldRef.current.input = input;
      }}
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
        draftDirtyRef.current = true;
        setDraft(event.currentTarget.value);
        if (rejected) setRejected(false);
      }}
      onBlur={(event) => {
        if (!workstationViewportIsUnsupported()) {
          commit(event.currentTarget.value);
        }
      }}
      // A text input fires `change` when the value is committed, including for
      // programmatic fills that never blur. Commit is idempotent, so the extra
      // call a real blur produces is harmless.
      onChange={(event) => {
        if (!workstationViewportIsUnsupported()) {
          commit(event.currentTarget.value);
        }
      }}
      onKeyDown={(event) => {
        const saveShortcut =
          (event.key === "F12" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey) ||
          ((event.ctrlKey || event.metaKey) &&
            event.key.toLocaleLowerCase() === "s");
        if (saveShortcut) {
          // This target-phase handler runs before the shell's window listener.
          // A bad transient value vetoes saving the previous clinical date.
          if (
            !commit(event.currentTarget.value, { preserveInvalid: true })
          ) {
            event.preventDefault();
          }
        } else if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        } else if (event.key === "Escape") {
          draftDirtyRef.current = false;
          setDraft(display);
          setRejected(false);
        } else if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          /^[1-7]$/.test(event.key)
        ) {
          // The shell handles Alt+1-7 on this event's later window bubble and
          // may unmount the workflow immediately. Blur would then be too late,
          // so file the control's live value before the navigation handler.
          if (
            !commit(event.currentTarget.value, { preserveInvalid: true })
          ) {
            event.preventDefault();
          }
        }
      }}
    />
  );
}
