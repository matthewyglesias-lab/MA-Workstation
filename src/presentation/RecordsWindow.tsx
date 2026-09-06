import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  filteredNoteCount,
  noteCount,
  NOTES,
  NOTES_TABLE,
  OPEN_NOTES,
  RECORD,
} from "./vocabulary";
import {
  InjectionRecordRepository,
  type InjectionRecord,
} from "../persistence/injection-records";
import { browserSafeStorage } from "../persistence/storage";
import {
  addendaCount,
  searchText,
  trapDialogTabKey,
} from "./records-drawer-shared";
import { NotesTable } from "./notes/NotesTable";
import { injectionRecordToNotesTableRow } from "./notes/note-table-model";

/**
 * Injection record selection window.
 *
 * A real component over the typed `InjectionRecordRepository`, replacing the
 * drawer the legacy runtime used to build. The record *lifecycle* stays with
 * legacy: opening a record restores a v4 snapshot into the encounter form, and
 * that is the one path by which a draft is resumed or a locked record viewed,
 * so it is called through `window.IPMGRecords` rather than re-derived here.
 *
 * Search, filter, sort and rendering are ours. The filter and search semantics
 * deliberately match what legacy did (see `drawerRecords`), so switching the
 * renderer does not quietly change which records a search turns up.
 */

type RecordFilter = "all" | "draft" | "locked" | "addenda";

interface LegacyRecordsBridge {
  open: (id: string) => boolean | void;
  create: () => boolean | void;
  list: () => unknown[];
  count: () => number;
  onChange: (handler: () => void) => void;
}

const bridge = (): LegacyRecordsBridge | undefined =>
  (window as unknown as { IPMGRecords?: LegacyRecordsBridge }).IPMGRecords;

const FILTERS: Array<[RecordFilter, string]> = [
  ["all", OPEN_NOTES.filterAll],
  ["draft", NOTES.statusIncomplete],
  ["locked", NOTES.statusSigned],
  ["addenda", OPEN_NOTES.filterAddenda],
];

interface RecordsWindowProps {
  open: boolean;
  onClose: () => void;
  /**
   * The shell owns the active-record transition. Keeping the handoff here
   * means a reopened draft is rehydrated before this dialog's close render can
   * let the previous blank worksheet mirror back over its restored values.
   */
  onRecordOpen?: (id: string) => boolean;
}

export function RecordsWindow({
  open,
  onClose,
  onRecordOpen,
}: RecordsWindowProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Set when the window closes because a record was opened or created: those
  // paths hand focus to the encounter form, and must not be clawed back.
  const handedOffRef = useRef(false);
  const [records, setRecords] = useState<InjectionRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");

  const reload = () => {
    const result = new InjectionRecordRepository(browserSafeStorage()).list();
    setRecords(result.ok ? result.value : []);
  };

  useEffect(() => {
    reload();
    bridge()?.onChange(reload);
  }, []);

  // Native <dialog> supplies the top layer, ::backdrop, Escape, the focus
  // trap, background inerting and focus restoration - all of which the legacy
  // drawer hand-rolled.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      reload();
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // showModal() focuses the first autofocus element, but the search field
      // is the one staff always want, and it must be focused every time the
      // window opens - not only the first.
      dialog.querySelector<HTMLInputElement>("#recordsDrawerSearch")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
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
    }).map(injectionRecordToNotesTableRow);
  }, [records, query, filter]);

  const onKeyDown = (event: KeyboardEvent) => trapDialogTabKey(dialogRef.current, event);

  /**
   * Runs on the dialog's own close event, which is where the restore has to
   * live: Escape closes a <dialog> natively before any state update, so by the
   * time an effect sees it the dialog is already shut and the branch is
   * skipped.
   *
   * <dialog> does restore focus to whatever was focused when showModal() ran,
   * but it does not win here - the shell keeps its own previous-focus pointer
   * for its dialogs, and closing this one lets that stale pointer pull focus to
   * whichever menu was last opened. Restoring on the next frame puts it back
   * after everyone else has had their turn.
   */
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

  const openRecord = (id: string) => {
    const opened = onRecordOpen ? onRecordOpen(id) : bridge()?.open(id);
    if (opened === false) return;
    handedOffRef.current = true;
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      // Deliberately NOT id="recordsDrawerLayer". Legacy's ensureRecordsDrawer()
      // looks the layer up by that id; finding ours it concluded its drawer
      // existed and rendered its own rows into our #recordsDrawerResults, so
      // every row appeared twice. Without the id its lookup returns null and
      // renderRecordsDrawer() early-returns, which is the stand-down we want.
      class="records-drawer-layer"
      aria-labelledby="recordsDrawerTitle"
      onClose={handleDialogClose}
      onCancel={handleDialogClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <section class="records-drawer" role="dialog" aria-labelledby="recordsDrawerTitle">
        <div class="records-drawer-head">
          <div>
            <h2 id="recordsDrawerTitle">{NOTES.openNotes}</h2>
          </div>
          <button
            type="button"
            class="records-drawer-close"
            aria-label={OPEN_NOTES.close}
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div class="records-drawer-search">
          <label class="records-sr-only" for="recordsDrawerSearch">
            {OPEN_NOTES.searchInjection}
          </label>
          <input
            id="recordsDrawerSearch"
            type="search"
            placeholder={OPEN_NOTES.searchInjectionPlaceholder}
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

        <div
          class="records-drawer-filters"
          role="group"
          aria-label={OPEN_NOTES.filterInjection}
        >
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

        <div class="records-drawer-status" id="recordsDrawerStatus" role="status" aria-live="polite">
          {visible.length === records.length
            ? noteCount(records.length)
            : filteredNoteCount(visible.length, records.length)}
        </div>

        <div class="records-drawer-results" id="recordsDrawerResults">
          {!open ? null : (
            <NotesTable
              rows={visible}
              label={NOTES_TABLE.injectionLabel}
              emptyMessage={OPEN_NOTES.noMatches}
              onOpen={openRecord}
            />
          )}
        </div>

        <div class="records-drawer-foot">
          <p>
            {OPEN_NOTES.injectionFooter}
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
                bridge()?.create();
              }}
            >
              {RECORD.startNewInjection}
            </button>
          </div>
        </div>
      </section>
    </dialog>
  );
}
