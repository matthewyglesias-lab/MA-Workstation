import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  InjectionRecordRepository,
  type InjectionRecord,
} from "../persistence/injection-records";
import { browserSafeStorage } from "../persistence/storage";

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
type SortKey = "patient" | "medication" | "activity";
type SortDirection = "asc" | "desc";

interface LegacyRecordsBridge {
  open: (id: string) => void;
  create: () => void;
  list: () => unknown[];
  count: () => number;
  onChange: (handler: () => void) => void;
}

const bridge = (): LegacyRecordsBridge | undefined =>
  (window as unknown as { IPMGRecords?: LegacyRecordsBridge }).IPMGRecords;

const FILTERS: Array<[RecordFilter, string]> = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["locked", "Locked"],
  ["addenda", "Addenda"],
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "patient", label: "Patient" },
  { key: "medication", label: "Medication" },
  { key: "activity", label: "Last activity" },
];

const timeOf = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Matches legacy's `stamp()` output: "Aug 2, 9:41 AM". */
const stamp = (value: unknown): string => {
  const at = timeOf(value);
  if (!at) return "—";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const addendaCount = (record: InjectionRecord): number =>
  Array.isArray(record.addenda) ? record.addenda.length : 0;

/** Same shape legacy's `drawerMessage()` produced. */
const activityText = (record: InjectionRecord): string => {
  const extra = addendaCount(record);
  const suffix = extra ? ` / ${extra} addendum${extra === 1 ? "" : "s"}` : "";
  return record.status === "completed"
    ? `Locked ${stamp(record.completedAt || record.updatedAt)}${suffix}`
    : `Draft updated ${stamp(record.updatedAt)}${suffix}`;
};

const patientOf = (record: InjectionRecord): string =>
  record.patient?.name?.trim() || record.summary || "Untitled injection";

const medicationOf = (record: InjectionRecord): string =>
  record.summary || "No medication selected";

/** Legacy searched the whole record; keep that so results do not narrow. */
const searchText = (record: InjectionRecord): string =>
  JSON.stringify(record).toLocaleLowerCase();

interface RecordsWindowProps {
  open: boolean;
  onClose: () => void;
}

export function RecordsWindow({ open, onClose }: RecordsWindowProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Set when the window closes because a record was opened or created: those
  // paths hand focus to the encounter form, and must not be clawed back.
  const handedOffRef = useRef(false);
  const [records, setRecords] = useState<InjectionRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecordFilter>("all");
  // Newest first: the encounter you were just in is the one you usually want.
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "activity",
    direction: "desc",
  });

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
    const matches = records.filter((record) => {
      const passesFilter =
        filter === "all"
          ? true
          : filter === "addenda"
            ? addendaCount(record) > 0
            : record.status === (filter === "locked" ? "completed" : "draft");
      return passesFilter && (!needle || searchText(record).includes(needle));
    });
    const direction = sort.direction === "asc" ? 1 : -1;
    return matches.sort((a, b) => {
      if (sort.key === "activity") {
        return (timeOf(a.updatedAt) - timeOf(b.updatedAt)) * direction;
      }
      const read = sort.key === "patient" ? patientOf : medicationOf;
      return read(a).localeCompare(read(b)) * direction;
    });
  }, [records, query, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : // Names read A-Z first; a date column is more useful newest-first.
          { key, direction: key === "activity" ? "desc" : "asc" },
    );

  // showModal() inerts the background but does not cycle focus: in Chromium,
  // Shift+Tab from the first control lands on <body>, outside the dialog. The
  // platform gives containment, not wrapping, so the wrap is ours to add.
  const onKeyDown = (event: KeyboardEvent) => {
    // Escape is handled by the dialog itself. Let it stop here: the shell has
    // a document-level Escape binding that closes an open menu and pulls focus
    // back to that menu's title, which otherwise fires as this window closes
    // and steals the focus restore out from under it.
    if (event.key === "Escape") {
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.hasAttribute("disabled") && node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
    handedOffRef.current = true;
    onClose();
    bridge()?.open(id);
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
            <h2 id="recordsDrawerTitle">Injection records</h2>
          </div>
          <button
            type="button"
            class="records-drawer-close"
            aria-label="Close injection records"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div class="records-drawer-search">
          <label class="records-sr-only" for="recordsDrawerSearch">
            Search local injection records
          </label>
          <input
            id="recordsDrawerSearch"
            type="search"
            placeholder="Patient, DOB, medication, NDC, or lot"
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

        <div class="records-drawer-filters" role="group" aria-label="Filter injection records">
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
            ? `${records.length} local record${records.length === 1 ? "" : "s"}`
            : `${visible.length} of ${records.length} local record${records.length === 1 ? "" : "s"}`}
        </div>

        <div class="records-drawer-results" id="recordsDrawerResults">
          <div class="records-drawer-columns" role="row">
            {COLUMNS.map((column) => {
              const active = sort.key === column.key;
              return (
                <button
                  key={column.key}
                  type="button"
                  role="columnheader"
                  data-records-sort={column.key}
                  class={`${active ? "is-sorted" : ""} ${active && sort.direction === "desc" ? "is-desc" : ""}`}
                  aria-sort={
                    active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                  }
                  onClick={() => toggleSort(column.key)}
                >
                  {column.label}
                </button>
              );
            })}
          </div>

          {!open ? null : visible.length ? (
            visible.map((record) => {
              const locked = record.status === "completed";
              const action = locked ? "View locked snapshot" : "Resume draft";
              return (
                <button
                  key={record.id}
                  type="button"
                  class={`records-drawer-row ${locked ? "locked" : "draft"}`}
                  data-records-open={record.id}
                  aria-label={`${action} for ${patientOf(record)}`}
                  onClick={() => openRecord(String(record.id))}
                  onDblClick={() => openRecord(String(record.id))}
                >
                  <span class="records-drawer-row-top">
                    <span class="records-drawer-row-title">{patientOf(record)}</span>
                    <span class={`records-drawer-row-badge ${locked ? "locked" : "draft"}`}>
                      {locked ? "Locked" : "Draft"}
                    </span>
                  </span>
                  <span class="records-drawer-row-summary">{medicationOf(record)}</span>
                  <span class="records-drawer-row-meta">{activityText(record)}</span>
                </button>
              );
            })
          ) : (
            <div class="records-drawer-empty">
              <b>No matching local injection records.</b>
              <span>Try another patient, medication, traceability field, or filter.</span>
            </div>
          )}
        </div>

        <div class="records-drawer-foot">
          <p>Saved only in this browser. Locked records remain read-only.</p>
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
            + New injection
          </button>
        </div>
      </section>
    </dialog>
  );
}
