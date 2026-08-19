const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const parseIsoDate = (value: string): Date | null => {
  const match = ISO_DATE.exec(String(value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

/** Strict calendar validation.  Do not let Date normalize impossible input
 * such as 2026-02-30 into a different, silently contradictory date. */
export const isValidIsoDate = (value: string): boolean =>
  Boolean(parseIsoDate(String(value ?? "").trim()));

export const isValidExpirationMonth = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Number.isInteger(year) && year >= 1 && month >= 1 && month <= 12;
};

/** Validate the local datetime format used by the collection/admin forms. */
export const isValidLocalDateTime = (value: string): boolean => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    String(value ?? "").trim(),
  );
  if (!match || !match[1] || !parseIsoDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = match[4] ? Number(match[4]) : 0;
  return hour <= 23 && minute <= 59 && second <= 59;
};

export const toIsoDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;

export const addCalendarDays = (iso: string, days: number): string => {
  const date = parseIsoDate(iso);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return toIsoDate(date);
};

export const differenceInCalendarDays = (from: string, to: string): number | null => {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

export const localIsoDate = (value: Date = new Date()): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;

export const localDayFromTimestamp = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localIsoDate(date);
};

export const isExpiredMonth = (month: string, referenceDate: string): boolean => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? "").trim());
  const reference = parseIsoDate(String(referenceDate ?? "").slice(0, 10));
  if (!match || !reference) return false;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return false;
  const endOfMonth = new Date(Date.UTC(year, monthNumber, 0));
  return endOfMonth.getTime() < reference.getTime();
};

export interface SustennaDay8Window {
  target: string;
  early: string;
  late: string;
  monthly: string;
}

export const calculateSustennaDay8Window = (day1: string): SustennaDay8Window | null => {
  if (!parseIsoDate(day1)) return null;
  const target = addCalendarDays(day1, 7);
  return {
    target,
    early: addCalendarDays(target, -4),
    late: addCalendarDays(target, 4),
    monthly: addCalendarDays(day1, 35),
  };
};
