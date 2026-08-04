import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { UdsRecordRepository, type UdsRecord } from "../persistence/uds-records";
import { browserSafeStorage } from "../persistence/storage";

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
type SortKey = "patient" | "summary" | "activity";
type SortDirection = "asc" | "desc";

const FILTERS: Array<[RecordFilter, string]> = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["locked", "Locked"],
  ["addenda", "Addenda"],
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "patient", label: "Patient" },
  { key: "summary", label: "Device & result" },
  { key: "activity", label: "Last activity" },
];

const timeOf = (value: unknown): number => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

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

const addendaCount = (record: UdsRecord): number =>
  Array.isArray(record.addenda) ? record.addenda.length : 0;

const activityText = (record: UdsRecord): string => {
  const extra = addendaCount(record);
  const suffix = extra ? ` / ${extra} addendum${extra === 1 ? "" : "s"}` : "";
  return record.status === "completed"
    ? `Attested local lock ${stamp(record.completedAt || record.updatedAt)}${suffix}`
    : `Draft updated ${stamp(record.updatedAt)}${suffix}`;
};

const patientOf = (record: UdsRecord): string =>
  record.patient?.name?.trim() || record.summary || "Untitled UDS screen";

const summaryOf = (record: UdsRecord): string => record.summary || "No device selected";

const searchText = (record: UdsRecord): string => JSON.stringify(record).toLocaleLowerCase();

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
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "activity",
    direction: "desc",
  });

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
      const read = sort.key === "patient" ? patientOf : summaryOf;
      return read(a).localeCompare(read(b)) * direction;
    });
  }, [records, query, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "activity" ? "desc" : "asc" },
    );

  const onKeyDown = (event: KeyboardEvent) => {
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
            <h2 id="udsRecordsDrawerTitle">UDS Records</h2>
          </div>
          <button
            type="button"
            class="records-drawer-close"
            aria-label="Close UDS Records"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div class="records-drawer-search">
          <label class="records-sr-only" for="udsRecordsDrawerSearch">
            Search local UDS screens
          </label>
          <input
            id="udsRecordsDrawerSearch"
            type="search"
            placeholder="Patient, DOB, device, or lot"
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

        <div class="records-drawer-filters" role="group" aria-label="Filter local UDS screens">
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
            ? `${records.length} local UDS screen${records.length === 1 ? "" : "s"}`
            : `${visible.length} of ${records.length} local UDS screen${records.length === 1 ? "" : "s"}`}
        </div>

        <div class="records-drawer-results" id="udsRecordsDrawerResults">
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
            <span class="records-drawer-action-heading" role="columnheader">
              Action
            </span>
          </div>

          {!open ? null : visible.length ? (
            visible.map((record) => {
              const locked = record.status === "completed";
              const attested = locked && Boolean(record.attestation);
              const action = locked ? "View locked snapshot" : "Resume draft";
              return (
                <button
                  key={record.id}
                  type="button"
                  class={`records-drawer-row ${locked ? "locked" : "draft"}`}
                  data-records-open={record.id}
                  aria-label={`${action} for ${patientOf(record)}`}
                  onClick={() => openRecord(record)}
                >
                  <span class="records-drawer-row-top">
                    <span class="records-drawer-row-title">{patientOf(record)}</span>
                    <span class={`records-drawer-row-badge ${locked ? "locked" : "draft"}`}>
                      {locked ? (attested ? "Locked" : "Legacy lock") : "Draft"}
                    </span>
                  </span>
                  <span class="records-drawer-row-summary">{summaryOf(record)}</span>
                  <span class="records-drawer-row-meta">{activityText(record)}</span>
                  <span class="records-drawer-row-action" aria-hidden="true">
                    {locked ? "View" : "Resume"}
                  </span>
                </button>
              );
            })
          ) : (
            <div class="records-drawer-empty">
              <b>No matching local UDS screens.</b>
              <span>Try another patient, device, or filter.</span>
            </div>
          )}
        </div>

        <div class="records-drawer-foot">
          <p>
            Saved only in this browser. Locked records remain read-only. Starting a new
            UDS screen retains any current local draft.
          </p>
          <div class="records-drawer-foot-actions">
            <button type="button" class="records-drawer-cancel" onClick={onClose}>
              Close
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
              Start new UDS screen
            </button>
          </div>
        </div>
      </section>
    </dialog>
  );
}
