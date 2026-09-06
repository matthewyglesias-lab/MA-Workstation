import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  filteredNoteCount,
  noteCount,
  NOTES,
  NOTES_TABLE,
  OPEN_NOTES,
  RECORD,
} from "./vocabulary";
import { UdsRecordRepository, type UdsRecord } from "../persistence/uds-records";
import { browserSafeStorage } from "../persistence/storage";
import {
  addendaCount,
  searchText,
  trapDialogTabKey,
} from "./records-drawer-shared";
import { NotesTable } from "./notes/NotesTable";
import { udsRecordToNotesTableRow } from "./notes/note-table-model";

/**
 * UDS record selection window.
 *
 * Modeled on `RecordsWindow.tsx` (the Injection records browser): same
 * dialog chrome, focus trap, Escape handling, and search/filter/sort
 * mechanics, since those are DOM/UX concerns rather than Injection-specific
 * ones. Unlike Injection, UDS has no legacy engine backing it - the
 * `UdsRecordRepository` is the only source of truth, both for reading and
 * writing, so there is no `bridge()`/`window.IPMG*` equivalent here.
 */

type RecordFilter = "all" | "draft" | "locked" | "addenda";

const FILTERS: Array<[RecordFilter, string]> = [
  ["all", OPEN_NOTES.filterAll],
  ["draft", NOTES.statusIncomplete],
  ["locked", NOTES.statusSigned],
  ["addenda", OPEN_NOTES.filterAddenda],
];

interface UdsRecordsWindowProps {
  open: boolean;
  onClose: () => void;
  onRecordOpen: (record: UdsRecord) => void;
  onCreate: () => void;
  /** Bumped by the caller after a save/discard/lock so the list re-reads. */
  refreshToken?: number;
}

export function UdsRecordsWindow({
  open,
  onClose,
  onRecordOpen,
  onCreate,
  refreshToken,
}: UdsRecordsWindowProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const handedOffRef = useRef(false);
  const repository = useMemo(() => new UdsRecordRepository(browserSafeStorage()), []);
  const [records, setRecords] = useState<UdsRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");

  const reload = () => {
    const result = repository.list();
    setRecords(result.ok ? result.value : []);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reload();
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("#udsRecordsDrawerSearch")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      const passesFilter =
        filter === "all"
          ? true
          : filter === "addenda"
            ? addendaCount(record) > 0
            : record.status === (filter === "locked" ? "completed" : "draft");
      return passesFilter && (!needle || searchText(record).includes(needle));
    }).map(udsRecordToNotesTableRow);
  }, [records, query, filter]);

  const onKeyDown = (event: KeyboardEvent) => trapDialogTabKey(dialogRef.current, event);

  const handleDialogClose = () => {
    onClose();
    const opener = openerRef.current;
    const handedOff = handedOffRef.current;
    handedOffRef.current = false;
    if (handedOff || !opener?.isConnected) return;
    requestAnimationFrame(() => {
      if (opener.isConnected) opener.focus();
    });
  };

  const openRecord = (record: UdsRecord) => {
    handedOffRef.current = true;
    onRecordOpen(record);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      class="records-drawer-layer"
      aria-labelledby="udsRecordsDrawerTitle"
      onClose={handleDialogClose}
      onCancel={handleDialogClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <section class="records-drawer" role="dialog" aria-labelledby="udsRecordsDrawerTitle">
        <div class="records-drawer-head">
          <div>
            <h2 id="udsRecordsDrawerTitle">{OPEN_NOTES.udsTitle}</h2>
          </div>
          <button
            type="button"
            class="records-drawer-close"
            aria-label={OPEN_NOTES.closeUds}
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div class="records-drawer-search">
          <label class="records-sr-only" for="udsRecordsDrawerSearch">
            {OPEN_NOTES.searchUds}
          </label>
          <input
            id="udsRecordsDrawerSearch"
            type="search"
            placeholder={OPEN_NOTES.searchUdsPlaceholder}
            autocomplete="off"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </span>
        </div>

        <div class="records-drawer-filters" role="group" aria-label={OPEN_NOTES.filterUds}>
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-records-filter={key}
              class={filter === key ? "on" : ""}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div class="records-drawer-status" id="udsRecordsDrawerStatus" role="status" aria-live="polite">
          {visible.length === records.length
            ? noteCount(records.length, "UDS note")
            : filteredNoteCount(visible.length, records.length, "UDS note")}
        </div>

        <div class="records-drawer-results" id="udsRecordsDrawerResults">
          {!open ? null : (
            <NotesTable
              rows={visible}
              label={NOTES_TABLE.udsLabel}
              emptyMessage={OPEN_NOTES.noUdsMatches}
              onOpen={(recordId) => {
                const record = records.find((entry) => entry.id === recordId);
                if (record) openRecord(record);
              }}
            />
          )}
        </div>

        <div class="records-drawer-foot">
          <p>
            {OPEN_NOTES.udsFooter}
          </p>
          <div class="records-drawer-foot-actions">
            <button type="button" class="records-drawer-cancel" onClick={onClose}>
              {OPEN_NOTES.closeAction}
            </button>
            <button
              type="button"
              class="records-drawer-new"
              data-records-new
              onClick={() => {
                handedOffRef.current = true;
                onClose();
                onCreate();
              }}
            >
              {RECORD.startNewUds}
            </button>
          </div>
        </div>
      </section>
    </dialog>
  );
}
