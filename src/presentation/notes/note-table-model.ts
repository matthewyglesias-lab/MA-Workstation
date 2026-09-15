import type { InjectionRecord } from "../../persistence/injection-records";
import type { UdsRecord } from "../../persistence/uds-records";
import {
  disambiguatedSavedNoteLabel,
  NOTES,
  NOTES_TABLE,
  noteRowVisitLabel,
  openNoteRowLabel,
  openPatientNoteLabel,
  signedNoteLockLabel,
} from "../vocabulary";

export type NoteType = "injection" | "uds";
export type NoteStatus = "incomplete" | "ready-to-sign" | "signed";
export type NoteSortKey = "patient" | "type" | "visitDate";
export type NoteSortDirection = "asc" | "desc";

export interface NoteVisit {
  raw: string | null;
  label: string;
  sortTime: number | null;
  source: "documented-visit" | "created" | "unavailable";
  precision: "date" | "datetime";
}

export interface NoteLock {
  staff?: string;
  timestamp?: string;
}

export interface NotesTableRow {
  key: string;
  recordId: string;
  noteType: NoteType;
  typeLabel: string;
  patientLabel: string;
  patientDob?: string;
  /**
   * The record's own summary line - the medication or screen it documents.
   * The global table has no column for it; the patient-scoped list titles its
   * rows with it, because within one patient's chart the medication is the
   * distinguishing fact and the patient name is the constant.
   */
  summaryLabel?: string;
  status: NoteStatus;
  visit: NoteVisit;
  lock: NoteLock | null;
}

export interface NoteSort {
  key: NoteSortKey;
  direction: NoteSortDirection;
}

export const DEFAULT_NOTE_SORT: NoteSort = {
  key: "visitDate",
  direction: "desc",
};

const collator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

const visitDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const visitDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const lockTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

interface ParsedDate {
  date: Date;
  precision: NoteVisit["precision"];
}

const localDateParts = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date | null => {
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second
    ? date
    : null;
};

const isCalendarDate = (year: number, month: number, day: number): boolean =>
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Parses chart-entered values as local calendar values. In particular,
 * `YYYY-MM-DD` must not pass through UTC parsing and render as the previous
 * day for staff west of Greenwich.
 */
const parseChartDate = (
  value: unknown,
  expectedPrecision: NoteVisit["precision"],
): ParsedDate | null => {
  const raw = nonEmptyString(value);
  if (!raw) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const date = localDateParts(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
    return date ? { date, precision: "date" } : null;
  }

  const localDateTime =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      raw,
    );
  if (localDateTime) {
    const milliseconds = Number((localDateTime[7] ?? "").padEnd(3, "0"));
    const date = localDateParts(
      Number(localDateTime[1]),
      Number(localDateTime[2]),
      Number(localDateTime[3]),
      Number(localDateTime[4]),
      Number(localDateTime[5]),
      Number(localDateTime[6] ?? 0),
      milliseconds,
    );
    return date ? { date, precision: "datetime" } : null;
  }

  // Repository timestamps are ISO instants. Offset-bearing values are safe
  // to parse because they identify an actual moment rather than a chart date.
  if (expectedPrecision === "datetime") {
    const instant =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/i.exec(
        raw,
      );
    if (instant) {
      const year = Number(instant[1]);
      const month = Number(instant[2]);
      const day = Number(instant[3]);
      const hour = Number(instant[4]);
      const minute = Number(instant[5]);
      const second = Number(instant[6] ?? 0);
      const offsetHour = Number(instant[8] ?? 0);
      const offsetMinute = Number(instant[9] ?? 0);
      if (
        isCalendarDate(year, month, day) &&
        hour <= 23 &&
        minute <= 59 &&
        second <= 59 &&
        offsetHour <= 23 &&
        offsetMinute <= 59
      ) {
        const date = new Date(raw);
        return Number.isFinite(date.getTime()) ? { date, precision: "datetime" } : null;
      }
    }
  }

  return null;
};

const noteVisit = (
  documentedValue: unknown,
  documentedPrecision: NoteVisit["precision"],
  createdAt: unknown,
): NoteVisit => {
  const documented = parseChartDate(documentedValue, documentedPrecision);
  const fallback = documented ? null : parseChartDate(createdAt, "datetime");
  const parsed = documented ?? fallback;

  if (!parsed) {
    return {
      raw: null,
      label: NOTES_TABLE.dateUnavailable,
      sortTime: null,
      source: "unavailable",
      precision: documentedPrecision,
    };
  }

  const raw = nonEmptyString(documented ? documentedValue : createdAt) ?? null;
  return {
    raw,
    label:
      parsed.precision === "date"
        ? visitDateFormatter.format(parsed.date)
        : visitDateTimeFormatter.format(parsed.date),
    sortTime: parsed.date.getTime(),
    source: documented ? "documented-visit" : "created",
    precision: parsed.precision,
  };
};

const patientDetails = (
  patientValue: unknown,
  fallback: string,
): { label: string; dob?: string } => {
  const patient = asObject(patientValue);
  const label = nonEmptyString(patient?.name) ?? fallback;
  const dob = nonEmptyString(patient?.dob);
  return { label, ...(dob ? { dob } : {}) };
};

const lockFor = (record: { status: unknown; attestation?: unknown }): NoteLock | null => {
  if (record.status !== "completed") return null;
  const attestation = asObject(record.attestation);
  const staff = nonEmptyString(attestation?.staff);
  const timestamp = nonEmptyString(attestation?.timestamp);
  return {
    ...(staff ? { staff } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
};

export const injectionRecordToNotesTableRow = (
  record: InjectionRecord,
): NotesTableRow => {
  const root = asObject(record);
  const snapshot = asObject(root?.snapshot);
  const fields = asObject(snapshot?.fields);
  const summary = nonEmptyString(root?.summary);
  const fallback = summary ?? NOTES_TABLE.untitledInjection;
  const patient = patientDetails(root?.patient, fallback);
  const recordId = nonEmptyString(root?.id) ?? "";
  const completed = root?.status === "completed";

  return {
    key: `injection:${recordId}`,
    recordId,
    noteType: "injection",
    typeLabel: NOTES_TABLE.typeInjection,
    patientLabel: patient.label,
    ...(patient.dob ? { patientDob: patient.dob } : {}),
    ...(summary ? { summaryLabel: summary } : {}),
    status: completed ? "signed" : "incomplete",
    visit: noteVisit(fields?.adminDate, "date", root?.createdAt),
    lock: lockFor(record),
  };
};

export const udsRecordToNotesTableRow = (record: UdsRecord): NotesTableRow => {
  const root = asObject(record);
  const snapshot = asObject(root?.snapshot);
  const summary = nonEmptyString(root?.summary);
  const fallback = summary ?? NOTES_TABLE.untitledUds;
  const patient = patientDetails(root?.patient, fallback);
  const recordId = nonEmptyString(root?.id) ?? "";
  const completed = root?.status === "completed";

  return {
    key: `uds:${recordId}`,
    recordId,
    noteType: "uds",
    typeLabel: NOTES_TABLE.typeUds,
    patientLabel: patient.label,
    ...(patient.dob ? { patientDob: patient.dob } : {}),
    ...(summary ? { summaryLabel: summary } : {}),
    status: completed ? "signed" : "incomplete",
    visit: noteVisit(snapshot?.collectionDateTime, "datetime", root?.createdAt),
    lock: lockFor(record),
  };
};

const compareVisit = (
  left: NotesTableRow,
  right: NotesTableRow,
  direction: NoteSortDirection,
): number => {
  const leftTime = left.visit.sortTime;
  const rightTime = right.visit.sortTime;
  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return (leftTime - rightTime) * (direction === "asc" ? 1 : -1);
};

const compareText = (
  left: string,
  right: string,
  direction: NoteSortDirection,
): number => collator.compare(left, right) * (direction === "asc" ? 1 : -1);

/** Sorts a copy. Missing dates stay last in either direction. */
export const sortNotesTableRows = (
  rows: readonly NotesTableRow[],
  sort: NoteSort,
): NotesTableRow[] =>
  [...rows].sort((left, right) => {
    const primary =
      sort.key === "visitDate"
        ? compareVisit(left, right, sort.direction)
        : sort.key === "patient"
          ? compareText(left.patientLabel, right.patientLabel, sort.direction)
          : compareText(left.typeLabel, right.typeLabel, sort.direction);
    if (primary) return primary;

    const latestVisit = compareVisit(left, right, "desc");
    if (latestVisit) return latestVisit;
    const patient = collator.compare(left.patientLabel, right.patientLabel);
    if (patient) return patient;
    const type = collator.compare(left.typeLabel, right.typeLabel);
    if (type) return type;
    return collator.compare(left.key, right.key);
  });

export const nextNoteSort = (current: NoteSort, key: NoteSortKey): NoteSort =>
  current.key === key
    ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
    : { key, direction: key === "visitDate" ? "desc" : "asc" };

/** One word for a note's lifecycle state, shared by both note surfaces. */
export const noteStatusLabel = (status: NoteStatus): string => {
  switch (status) {
    case "ready-to-sign":
      return NOTES.statusReadyToSign;
    case "signed":
      return NOTES.statusSigned;
    case "incomplete":
      return NOTES.statusIncomplete;
  }
};

const patientNoteOpenBaseLabel = (row: NotesTableRow): string =>
  openPatientNoteLabel(
    row.typeLabel,
    row.visit.label,
    noteStatusLabel(row.status),
  );

const notesTableRowOpenBaseLabel = (row: NotesTableRow): string => {
  const base = openNoteRowLabel(
    row.patientLabel,
    row.typeLabel,
    noteStatusLabel(row.status),
  );
  return noteRowVisitLabel(
    base,
    row.visit.label === NOTES_TABLE.dateUnavailable ? undefined : row.visit.label,
  );
};

/**
 * Gives each focusable global Open Notes row the visible visit fact as part of
 * its name. If all visible facts still collide, append the stable local id so
 * assistive-technology users never encounter two indistinguishable rows.
 */
export const notesTableRowAccessibleLabel = (
  row: NotesTableRow,
  peers: readonly NotesTableRow[],
): string => {
  const base = notesTableRowOpenBaseLabel(row);
  const hasDuplicate = peers.some(
    (peer) => peer.key !== row.key && notesTableRowOpenBaseLabel(peer) === base,
  );
  return hasDuplicate ? disambiguatedSavedNoteLabel(base, row.recordId) : base;
};

/**
 * Names a patient-chart Open control with the note facts visible in its row.
 * Type, visit and status distinguish the normal case. If two rows still have
 * the same name, their stable browser-local record ids provide the final
 * disambiguator rather than leaving two indistinguishable "Open" controls.
 */
export const patientNoteOpenAccessibleLabel = (
  row: NotesTableRow,
  peers: readonly NotesTableRow[],
): string => {
  const base = patientNoteOpenBaseLabel(row);
  const hasDuplicate = peers.some(
    (peer) => peer.key !== row.key && patientNoteOpenBaseLabel(peer) === base,
  );
  return hasDuplicate ? disambiguatedSavedNoteLabel(base, row.recordId) : base;
};

export const noteLockLabel = (lock: NoteLock): string => {
  const staff = nonEmptyString(lock.staff);
  const parsedTime = parseChartDate(lock.timestamp, "datetime");
  const time = parsedTime ? lockTimeFormatter.format(parsedTime.date) : undefined;
  return signedNoteLockLabel(staff, time);
};
