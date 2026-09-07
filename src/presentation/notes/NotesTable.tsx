import { useMemo, useState } from "preact/hooks";
import { NOTES_TABLE, openNoteRowLabel } from "../vocabulary";
import { LockIndicator } from "./LockIndicator";
import {
  DEFAULT_NOTE_SORT,
  nextNoteSort,
  noteStatusLabel,
  sortNotesTableRows,
  type NoteSort,
  type NoteSortKey,
  type NotesTableRow,
} from "./note-table-model";
import { StatusChip } from "./StatusChip";

interface NotesTableProps {
  rows: readonly NotesTableRow[];
  label: string;
  emptyMessage: string;
  onOpen: (recordId: string) => void;
}

const SORTABLE_COLUMNS: ReadonlyArray<{ key: NoteSortKey; label: string }> = [
  { key: "patient", label: NOTES_TABLE.columnPatient },
  { key: "type", label: NOTES_TABLE.columnType },
  { key: "visitDate", label: NOTES_TABLE.columnVisitDate },
];

export function NotesTable({ rows, label, emptyMessage, onOpen }: NotesTableProps) {
  const [sort, setSort] = useState<NoteSort>(DEFAULT_NOTE_SORT);
  const sortedRows = useMemo(() => sortNotesTableRows(rows, sort), [rows, sort]);

  const sortableHeader = (key: NoteSortKey, columnLabel: string) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        class={active ? `is-sorted is-${sort.direction}` : ""}
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          data-records-sort={key}
          onClick={() => setSort((current) => nextNoteSort(current, key))}
        >
          <span>{columnLabel}</span>
          <span class="notes-table-sort-caret" aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <table class="notes-table" aria-label={label}>
      <thead>
        <tr>
          {sortableHeader(SORTABLE_COLUMNS[0]!.key, SORTABLE_COLUMNS[0]!.label)}
          <th scope="col">{NOTES_TABLE.columnLock}</th>
          {sortableHeader(SORTABLE_COLUMNS[1]!.key, SORTABLE_COLUMNS[1]!.label)}
          <th scope="col">{NOTES_TABLE.columnStatus}</th>
          {sortableHeader(SORTABLE_COLUMNS[2]!.key, SORTABLE_COLUMNS[2]!.label)}
        </tr>
      </thead>
      <tbody>
        {sortedRows.length ? (
          sortedRows.map((row) => (
            <tr
              key={row.key}
              class="notes-table-row records-drawer-row"
              tabIndex={0}
              data-records-open={row.recordId}
              data-note-type={row.noteType}
              aria-label={openNoteRowLabel(
                row.patientLabel,
                row.typeLabel,
                noteStatusLabel(row.status),
              )}
              onClick={() => onOpen(row.recordId)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onOpen(row.recordId);
              }}
            >
              <td class="notes-table-patient records-drawer-row-title">
                {row.patientLabel}
              </td>
              <td class="notes-table-lock">
                {row.lock ? (
                  <LockIndicator lock={row.lock} />
                ) : null}
              </td>
              <td class="notes-table-type">{row.typeLabel}</td>
              <td class="notes-table-status">
                <StatusChip status={row.status} />
              </td>
              <td class="notes-table-visit">{row.visit.label}</td>
            </tr>
          ))
        ) : (
          <tr class="notes-table-empty-row">
            <td colSpan={5} class="records-drawer-empty notes-table-empty">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
