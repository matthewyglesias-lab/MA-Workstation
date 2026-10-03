/** Calendar arithmetic for comparing the recorded history with an order.
 * These helpers do not establish eligibility, restart instructions, or a due date.
 */
export interface InjectionInterval {
  every: number;
  unit: "days" | "weeks" | "months";
}

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? parsed
    : null;
}

function dateString(value: Date): string | null {
  if (!Number.isFinite(value.valueOf())) return null;
  const result = value.toISOString().slice(0, 10);
  return calendarDate(result) ? result : null;
}

/** Converts a recorded instant to its calendar date in the clinic's timezone. */
export function clinicDateAt(instant: string, timezone: string): string | null {
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.valueOf())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);
    const get = (name: string) =>
      parts.find((part) => part.type === name)?.value;
    const result = `${get("year")}-${get("month")}-${get("day")}`;
    return calendarDate(result) ? result : null;
  } catch {
    return null;
  }
}

/** Counts clinic calendar dates, independent of daylight-saving clock changes. */
export function elapsedCalendarDays(
  fromDate: string,
  toDate: string,
): number | null {
  const from = calendarDate(fromDate);
  const to = calendarDate(toDate);
  return from && to ? (to.valueOf() - from.valueOf()) / 86_400_000 : null;
}

/** Adds a single interval from the original anchor. Months clamp at month end. */
export function addInjectionInterval(
  anchor: string,
  interval: InjectionInterval,
): string | null {
  const date = calendarDate(anchor);
  if (!date || !Number.isSafeInteger(interval.every) || interval.every <= 0)
    return null;
  if (interval.unit === "days" || interval.unit === "weeks") {
    date.setUTCDate(
      date.getUTCDate() + interval.every * (interval.unit === "weeks" ? 7 : 1),
    );
    return dateString(date);
  }
  if (interval.unit !== "months") return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + interval.every);
  if (!Number.isFinite(date.valueOf())) return null;
  const lastDay = new Date(date.valueOf());
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  date.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return dateString(date);
}

export function injectionIntervalLabel(interval: InjectionInterval): string {
  return `Every ${interval.every} ${interval.every === 1 ? interval.unit.slice(0, -1) : interval.unit}`;
}
