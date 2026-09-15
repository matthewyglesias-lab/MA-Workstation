import {
  NOTES,
  NOTES_TABLE,
  PATIENT_NOTES,
} from "../vocabulary";
import { Illustration } from "../Illustration";
import {
  DEFAULT_PATIENT_NOTES_FILTER,
  filterPatientNotes,
  type PatientNoteRecencyFilter,
  type PatientNoteStatusFilter,
  type PatientNoteTypeFilter,
  type PatientNotesFilter,
} from "../patient-chart-model";
import { LockIndicator } from "./LockIndicator";
import {
  patientNoteOpenAccessibleLabel,
  type NotesTableRow,
} from "./note-table-model";
import { StatusChip } from "./StatusChip";
import { useMemo, useState } from "preact/hooks";

interface PatientNotesListProps {
  rows: readonly NotesTableRow[];
  /** Type-qualified row key (`injection:<id>` / `uds:<id>`). */
  onOpen: (recordKey: string) => void;
}

const TYPE_OPTIONS: ReadonlyArray<[PatientNoteTypeFilter, string]> = [
  ["all", PATIENT_NOTES.typeAll],
  ["injection", NOTES_TABLE.typeInjection],
  ["uds", NOTES_TABLE.typeUds],
];

const STATUS_OPTIONS: ReadonlyArray<[PatientNoteStatusFilter, string]> = [
  ["all", PATIENT_NOTES.statusAll],
  ["incomplete", NOTES.statusIncomplete],
  ["signed", NOTES.statusSigned],
];

const RECENCY_OPTIONS: ReadonlyArray<[PatientNoteRecencyFilter, string]> = [
  ["all", PATIENT_NOTES.recencyAll],
  ["30-days", PATIENT_NOTES.recency30],
  ["12-months", PATIENT_NOTES.recency12],
];

/**
 * The patient-scoped Notes list.
 *
 * This is deliberately NOT the global Open Notes table. Tebra ships two
 * different note surfaces and they do not look alike: the global worklist is
 * the legacy sparse table with 44px rows, a lock column and date sorting,
 * while the patient chart uses this newer, roomier list - a four-filter panel
 * above 100px rows, each with its own `Open` button. Making one imitate the
 * other is the seam a Tebra user notices first, so the two components stay
 * separate on purpose rather than sharing a renderer.
 *
 * Row activation is the `Open` button alone. In the global worklist the whole
 * row opens the note; here it does not, because this list is reached by
 * browsing a patient and browsing stays read-only until an explicit action.
 */
export function PatientNotesList({ rows, onOpen }: PatientNotesListProps) {
  const [filter, setFilter] = useState<PatientNotesFilter>(
    DEFAULT_PATIENT_NOTES_FILTER,
  );
  const visible = useMemo(() => filterPatientNotes(rows, filter), [rows, filter]);

  const patch = (next: Partial<PatientNotesFilter>) =>
    setFilter((current) => ({ ...current, ...next }));

  return (
    <section class="tebra-patient-notes" data-patient-notes>
      <div
        class="tebra-patient-notes-filters"
        role="group"
        aria-label={PATIENT_NOTES.filtersLabel}
      >
        <label class="tebra-patient-notes-field">
          <span>{PATIENT_NOTES.filterType}</span>
          <select
            data-patient-notes-filter="type"
            value={filter.type}
            onChange={(event) =>
              patch({ type: event.currentTarget.value as PatientNoteTypeFilter })
            }
          >
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label class="tebra-patient-notes-field">
          <span>{PATIENT_NOTES.filterStatus}</span>
          <select
            data-patient-notes-filter="status"
            value={filter.status}
            onChange={(event) =>
              patch({ status: event.currentTarget.value as PatientNoteStatusFilter })
            }
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label class="tebra-patient-notes-field">
          <span>{PATIENT_NOTES.filterRecency}</span>
          <select
            data-patient-notes-filter="recency"
            value={filter.recency}
            onChange={(event) =>
              patch({
                recency: event.currentTarget.value as PatientNoteRecencyFilter,
              })
            }
          >
            {RECENCY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label class="tebra-patient-notes-field">
          <span>{PATIENT_NOTES.filterSearch}</span>
          <input
            type="search"
            data-patient-notes-filter="query"
            autocomplete="off"
            placeholder={PATIENT_NOTES.searchPlaceholder}
            value={filter.query}
            onInput={(event) => patch({ query: event.currentTarget.value })}
          />
        </label>
      </div>

      {visible.length ? (
        <ul class="tebra-record-list">
          {visible.map((row) => (
            <li key={row.key} class="tebra-record-row" data-note-type={row.noteType}>
              <div class="tebra-record-copy">
                <strong class="tebra-record-title">
                  {row.summaryLabel ?? row.typeLabel}
                </strong>
                <p class="tebra-record-meta">
                  <span>{row.typeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{row.visit.label}</span>
                </p>
              </div>
              <div class="tebra-record-state">
                {row.lock ? <LockIndicator lock={row.lock} /> : null}
                <StatusChip status={row.status} />
                <button
                  type="button"
                  class="tebra-record-action"
                  data-patient-note-open={row.recordId}
                  aria-label={patientNoteOpenAccessibleLabel(row, visible)}
                  onClick={() => onOpen(row.key)}
                >
                  {PATIENT_NOTES.open}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div class="tebra-record-empty">
          <Illustration name="notes-empty" />
          <strong>{PATIENT_NOTES.empty}</strong>
          <small>{PATIENT_NOTES.emptyHint}</small>
        </div>
      )}
    </section>
  );
}
