/**
 * Patient-scoped chart projection: who this workstation holds notes for, and
 * what its Facesheet can truthfully say about them.
 *
 * Two rules shape everything here.
 *
 * 1. PATIENT BROWSING IS READ-ONLY. Nothing in this module opens, creates or
 *    mutates a record. It reads the same repositories the workflows already
 *    write and derives display facts; crossing into a workflow stays an
 *    explicit New Note or Open action in the components above.
 *
 * 2. WE SHOW ONLY WHAT WE HOLD. Tebra's chart carries insurance, contacts and
 *    a server-side history. This one carries notes saved in this browser. An
 *    absent card is honest; a card with an empty field is a seam. Every
 *    derivation below falls back to a truthful "not recorded" rather than an
 *    inferred value.
 *
 * Identity is normalized name plus exact DOB - see `chartPatientKey` for the
 * exact rule and where it comes from.
 */

import type { InjectionRecord } from "../persistence/injection-records";
import {
  siteHistoryPatientKey,
  type SiteHistoryEntry,
} from "../persistence/site-history";
import type { UdsRecord } from "../persistence/uds-records";
import {
  asObject,
  injectionRecordToNotesTableRow,
  nonEmptyString,
  sortNotesTableRows,
  udsRecordToNotesTableRow,
  type NotesTableRow,
  type NoteVisit,
} from "./notes/note-table-model";

/** Shortest query that may match. One letter matches most of a clinic. */
export const PATIENT_QUERY_MIN_LENGTH = 2;

/** Facesheet cards and the hover card both cap their lists here. */
export const PATIENT_RECENT_LIMIT = 5;

export type PatientNoteTypeFilter = "all" | "injection" | "uds";
export type PatientNoteStatusFilter = "all" | "incomplete" | "signed";
export type PatientNoteRecencyFilter = "all" | "30-days" | "12-months";

export interface PatientNotesFilter {
  type: PatientNoteTypeFilter;
  status: PatientNoteStatusFilter;
  recency: PatientNoteRecencyFilter;
  query: string;
}

export const DEFAULT_PATIENT_NOTES_FILTER: PatientNotesFilter = {
  type: "all",
  status: "all",
  recency: "all",
  query: "",
};

/** The most recent administration this workstation has documented. */
export interface LastInjectionFact {
  recordId: string;
  medicationLabel: string;
  site?: string;
  visit: NoteVisit;
}

export interface ChartPatient {
  /** Normalized `name|dob`; empty when either half is missing. */
  key: string;
  /** Name as it was recorded, for display. */
  name: string;
  dob: string;
  /** Browser-local record identity; never presented as a server MRN. */
  localRecordId?: string;
  allergyStatus?: string;
  noteCount: number;
  /** Visit date of the most recent note, by the Open Notes precedence. */
  lastVisit: NoteVisit | null;
  lastInjection: LastInjectionFact | null;
}

export interface PatientChartIndex {
  patients: ChartPatient[];
  rowsByPatient: Map<string, NotesTableRow[]>;
}

/**
 * Chart identity: normalized name plus exact DOB.
 *
 * The pairing and its `name|dob` shape come from `siteHistoryPatientKey`, the
 * key the site-rotation store has always used, so the chart and a patient's
 * rotation history agree on what makes two records the same person.
 *
 * One difference, deliberately: runs of whitespace inside the name are
 * collapsed first. `"Baker,   Test"` and `"Baker, Test"` are one patient who
 * was typed in twice, and a chart that splits them into two is wrong in a way
 * staff cannot fix. Rotation lookups still pass the name exactly as the note
 * recorded it, so nothing about that store's own keying changes.
 */
export const chartPatientKey = (name: string, dob: string): string =>
  siteHistoryPatientKey(name.replace(/\s+/g, " ").trim(), dob);

const collator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

/**
 * Newer wins for identity detail. A patient's allergy status and local record
 * id are whatever their most recent note recorded, not whatever the first one
 * happened to say.
 */
const isNewer = (candidate: NoteVisit | null, current: NoteVisit | null): boolean => {
  if (!candidate?.sortTime) return false;
  if (!current?.sortTime) return true;
  return candidate.sortTime > current.sortTime;
};

interface RecordFacts {
  localRecordId?: string;
  allergyStatus?: string;
  medicationLabel?: string;
  site?: string;
}

interface RecordIdentity {
  name: string;
  dob: string;
}

/**
 * The patient a record is actually for.
 *
 * Deliberately NOT `row.patientLabel`: that is a display label, and it falls
 * back to the record's summary when a note has no patient name yet. Keying the
 * index on it would turn an unnamed draft into a browsable patient named after
 * its medication - a chart for someone who does not exist.
 */
const recordIdentity = (record: unknown): RecordIdentity => {
  const patient = asObject(asObject(record)?.patient);
  return {
    name: nonEmptyString(patient?.name) ?? "",
    dob: nonEmptyString(patient?.dob) ?? "",
  };
};

/** Reads display facts out of a saved record without trusting its shape. */
const injectionFacts = (record: InjectionRecord): RecordFacts => {
  const root = asObject(record);
  const snapshot = asObject(root?.snapshot);
  const fields = asObject(snapshot?.fields);
  const state = asObject(snapshot?.state);
  const recordId = nonEmptyString(root?.id);
  const allergies = nonEmptyString(fields?.allergies);
  const medication = nonEmptyString(root?.summary);
  const site = nonEmptyString(state?.site);
  return {
    ...(recordId ? { localRecordId: recordId } : {}),
    ...(allergies ? { allergyStatus: allergies } : {}),
    ...(medication ? { medicationLabel: medication } : {}),
    ...(site ? { site } : {}),
  };
};

const udsFacts = (record: UdsRecord): RecordFacts => {
  const root = asObject(record);
  const recordId = nonEmptyString(root?.id);
  return recordId ? { localRecordId: recordId } : {};
};

interface Accumulator {
  patient: ChartPatient;
  identityVisit: NoteVisit | null;
  injectionVisit: NoteVisit | null;
}

/**
 * Groups every saved note into per-patient chart facts.
 *
 * Records whose patient identity is incomplete get no key and are left out of
 * the patient index deliberately: a chart that cannot say whose it is should
 * not be browsable. Those notes remain reachable in global Open Notes, which
 * lists work rather than patients.
 */
export const buildPatientChartIndex = (
  injections: readonly InjectionRecord[],
  udsRecords: readonly UdsRecord[],
): PatientChartIndex => {
  const accumulators = new Map<string, Accumulator>();
  const rowsByPatient = new Map<string, NotesTableRow[]>();

  const absorb = (
    row: NotesTableRow,
    identity: RecordIdentity,
    facts: RecordFacts,
  ) => {
    const key = chartPatientKey(identity.name, identity.dob);
    if (!key) return;

    const rows = rowsByPatient.get(key);
    if (rows) rows.push(row);
    else rowsByPatient.set(key, [row]);

    const existing = accumulators.get(key);
    if (!existing) {
      accumulators.set(key, {
        patient: {
          key,
          name: identity.name,
          dob: identity.dob,
          ...(facts.localRecordId ? { localRecordId: facts.localRecordId } : {}),
          ...(facts.allergyStatus ? { allergyStatus: facts.allergyStatus } : {}),
          noteCount: 1,
          lastVisit: row.visit.sortTime === null ? null : row.visit,
          lastInjection:
            row.noteType === "injection" && facts.medicationLabel
              ? {
                  recordId: row.recordId,
                  medicationLabel: facts.medicationLabel,
                  ...(facts.site ? { site: facts.site } : {}),
                  visit: row.visit,
                }
              : null,
        },
        identityVisit: row.visit,
        injectionVisit: row.noteType === "injection" ? row.visit : null,
      });
      return;
    }

    existing.patient.noteCount += 1;
    if (isNewer(row.visit, existing.patient.lastVisit)) {
      existing.patient.lastVisit = row.visit;
    }
    if (isNewer(row.visit, existing.identityVisit)) {
      existing.identityVisit = row.visit;
      if (facts.localRecordId) existing.patient.localRecordId = facts.localRecordId;
      if (facts.allergyStatus) existing.patient.allergyStatus = facts.allergyStatus;
    }
    if (
      row.noteType === "injection" &&
      facts.medicationLabel &&
      (existing.patient.lastInjection === null ||
        isNewer(row.visit, existing.injectionVisit))
    ) {
      existing.injectionVisit = row.visit;
      existing.patient.lastInjection = {
        recordId: row.recordId,
        medicationLabel: facts.medicationLabel,
        ...(facts.site ? { site: facts.site } : {}),
        visit: row.visit,
      };
    }
  };

  for (const record of injections) {
    absorb(
      injectionRecordToNotesTableRow(record),
      recordIdentity(record),
      injectionFacts(record),
    );
  }
  for (const record of udsRecords) {
    absorb(udsRecordToNotesTableRow(record), recordIdentity(record), udsFacts(record));
  }

  const patients = [...accumulators.values()]
    .map((entry) => entry.patient)
    .sort((left, right) => collator.compare(left.name, right.name));

  return { patients, rowsByPatient };
};

export const scopeNotesToPatient = (
  index: PatientChartIndex,
  key: string,
): NotesTableRow[] => sortNotesTableRows(index.rowsByPatient.get(key) ?? [], {
  key: "visitDate",
  direction: "desc",
});

/* -------------------------------------------------------------- searching */

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/** A query of digits and separators is a date-of-birth query, not a name. */
const isDateQuery = (needle: string): boolean => /^[\d/\-.]+$/.test(needle);

/**
 * Name parts a query may prefix-match. Names are recorded `Last, First`, and
 * staff search by either half, so both are offered alongside the whole label.
 */
const namePrefixCandidates = (name: string): string[] => {
  const label = name.trim().toLocaleLowerCase();
  if (!label) return [];
  const parts = label
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [label, ...parts];
};

/**
 * Tebra's own rule: the first 2-3 letters of the patient's name, or the date
 * of birth as mm/dd/yyyy. Date queries match by digit prefix so the field
 * narrows as it is typed rather than only on the final keystroke.
 */
export const matchesPatientQuery = (patient: ChartPatient, query: string): boolean => {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < PATIENT_QUERY_MIN_LENGTH) return false;

  if (isDateQuery(needle)) {
    const typed = digitsOnly(needle);
    const recorded = digitsOnly(patient.dob);
    return typed.length >= PATIENT_QUERY_MIN_LENGTH &&
      recorded.length > 0 &&
      recorded.startsWith(typed);
  }

  return namePrefixCandidates(patient.name).some((part) => part.startsWith(needle));
};

export const searchChartPatients = (
  patients: readonly ChartPatient[],
  query: string,
  limit = 8,
): ChartPatient[] =>
  patients.filter((patient) => matchesPatientQuery(patient, query)).slice(0, limit);

/* --------------------------------------------------------------- filtering */

const DAY_MS = 86_400_000;

const withinRecency = (
  visit: NoteVisit,
  recency: PatientNoteRecencyFilter,
  now: number,
): boolean => {
  if (recency === "all") return true;
  // A note with no resolvable visit date cannot be claimed to fall inside a
  // window. It stays out of the dated filters rather than being assumed recent.
  if (visit.sortTime === null) return false;
  const days = recency === "30-days" ? 30 : 365;
  return now - visit.sortTime <= days * DAY_MS;
};

export const filterPatientNotes = (
  rows: readonly NotesTableRow[],
  filter: PatientNotesFilter,
  now = Date.now(),
): NotesTableRow[] => {
  const needle = filter.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (filter.type !== "all" && row.noteType !== filter.type) return false;
    if (filter.status === "signed" && row.status !== "signed") return false;
    if (filter.status === "incomplete" && row.status === "signed") return false;
    if (!withinRecency(row.visit, filter.recency, now)) return false;
    if (!needle) return true;
    return [row.patientLabel, row.typeLabel, row.visit.label]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle);
  });
};

/* ------------------------------------------------------------ site rotation */

export interface SiteRotationEntry {
  site: string;
  date: string;
  recordId?: string;
}

/**
 * Last five sites by administration date, newest first.
 *
 * The store appends in write order, which is close to but not the same as
 * administration order: a note documented late lands after one administered
 * later. Rotation is read by date, so it is sorted by date here, with the
 * stored time only breaking ties.
 */
export const siteRotation = (
  entries: readonly SiteHistoryEntry[],
  limit = PATIENT_RECENT_LIMIT,
): SiteRotationEntry[] =>
  [...entries]
    .filter((entry) => nonEmptyString(entry.site) && nonEmptyString(entry.date))
    .sort((left, right) =>
      `${right.date}|${right.storedAt ?? ""}`.localeCompare(
        `${left.date}|${left.storedAt ?? ""}`,
      ),
    )
    .slice(0, limit)
    .map((entry) => ({
      site: entry.site,
      date: entry.date,
      ...(nonEmptyString(entry.recordId) ? { recordId: entry.recordId } : {}),
    }));

/** Up to the last five notes by visit date, newest first. */
export const recentPatientNotes = (
  rows: readonly NotesTableRow[],
  limit = PATIENT_RECENT_LIMIT,
): NotesTableRow[] =>
  sortNotesTableRows(rows, { key: "visitDate", direction: "desc" }).slice(0, limit);
