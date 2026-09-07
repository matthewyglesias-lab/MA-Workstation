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
import {
  isUnambiguousUsableUdsRecordList,
  isUsableUdsRecord,
} from "./uds-record-safety";

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
  onRecordOpen: (record: UdsRecord) => boolean | void;
  onCreate: () => boolean | void;
  /** Focuses the accepted record only after the native dialog is closed. */
  onHandoffComplete?: () => void;
  /** Bumped by the caller after a save/discard/lock so the list re-reads. */
  refreshToken?: number;
}

export function UdsRecordsWindow({
  open,
  onClose,
  onRecordOpen,
  onCreate,
  onHandoffComplete,
  refreshToken,
}: UdsRecordsWindowProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const handedOffRef = useRef(false);
  const repository = useMemo(() => new UdsRecordRepository(browserSafeStorage()), []);
  const [records, setRecords] = useState<UdsRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const reload = () => {
    const result = repository.list();
    if (!result.ok) {
      setRecords([]);
      setStorageError(result.error.message);
      return;
    }
    const storageSafe =
      result.warnings.length === 0 &&
      isUnambiguousUsableUdsRecordList(result.value);
    setRecords(storageSafe ? result.value : []);
    setStorageError(storageSafe ? null : RECORD.udsStorageNeedsAttention);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    const refreshFromAnotherTab = () => reload();
    window.addEventListener("storage", refreshFromAnotherTab);
    return () => window.removeEventListener("storage", refreshFromAnotherTab);
    // repository is stable for this component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reload();
      setActionError(null);
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
    setActionError(null);
    onClose();
    const opener = openerRef.current;
    const handedOff = handedOffRef.current;
    handedOffRef.current = false;
    if (handedOff) {
      requestAnimationFrame(() => onHandoffComplete?.());
      return;
    }
    if (!opener?.isConnected) return;
    requestAnimationFrame(() => {
      if (opener.isConnected) opener.focus();
    });
  };

  const openRecord = (recordId: string) => {
    const invoked = document.activeElement as HTMLElement | null;
    // Re-read by id at handoff. A different tab may have completed or edited
    // the record since this window rendered its cached row.
    const latest = repository.list();
    const storageSafe = Boolean(
      latest.ok &&
        latest.warnings.length === 0 &&
        isUnambiguousUsableUdsRecordList(latest.value),
    );
    const matches = latest.ok
      ? latest.value.filter((record) => record.id === recordId)
      : [];
    const current = matches.length === 1 ? matches[0] : undefined;
    if (!storageSafe || !current || !isUsableUdsRecord(current)) {
      setActionError(
        storageSafe ? RECORD.invalidUdsRecord : RECORD.udsStorageNeedsAttention,
      );
      reload();
      requestAnimationFrame(() => {
        if (invoked?.isConnected && dialogRef.current?.contains(invoked)) {
          invoked.focus();
        } else {
          dialogRef.current
            ?.querySelector<HTMLInputElement>("#udsRecordsDrawerSearch")
            ?.focus();
        }
      });
      return;
    }
    const opened = onRecordOpen(current);
    if (opened === false) {
      setActionError(RECORD.currentNoteStayedOpen);
      requestAnimationFrame(() => {
        if (invoked?.isConnected && dialogRef.current?.contains(invoked)) invoked.focus();
      });
      return;
    }
    setActionError(null);
    handedOffRef.current = true;
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      class="records-drawer-layer"
      aria-labelledby="udsRecordsDrawerTitle"
      onClose={handleDialogClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <section class="records-drawer">
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

        {(actionError ?? storageError) && (
          <p class="cd2004-system-message is-error records-drawer-action-error" role="alert">
            {actionError ?? storageError}
          </p>
        )}

        <div class="records-drawer-results" id="udsRecordsDrawerResults">
          {!open ? null : (
            <NotesTable
              rows={visible}
              label={NOTES_TABLE.udsLabel}
              emptyMessage={OPEN_NOTES.noUdsMatches}
              onOpen={openRecord}
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
              disabled={Boolean(storageError)}
              onClick={() => {
                const invoked = document.activeElement as HTMLElement | null;
                const latest = repository.list();
                if (
                  !latest.ok ||
                  latest.warnings.length > 0 ||
                  !isUnambiguousUsableUdsRecordList(latest.value)
                ) {
                  setActionError(RECORD.udsStorageNeedsAttention);
                  reload();
                  requestAnimationFrame(() => {
                    if (invoked?.isConnected && dialogRef.current?.contains(invoked)) {
                      invoked.focus();
                    }
                  });
                  return;
                }
                const created = onCreate();
                if (created === false) {
                  setActionError(RECORD.currentNoteStayedOpen);
                  requestAnimationFrame(() => {
                    if (invoked?.isConnected && dialogRef.current?.contains(invoked)) {
                      invoked.focus();
                    }
                  });
                  return;
                }
                setActionError(null);
                handedOffRef.current = true;
                onClose();
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
