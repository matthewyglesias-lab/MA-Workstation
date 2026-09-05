import { MODULE, NOTES, RECORD, SHELL } from "./vocabulary";
import { useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import {
  WORKFLOW_LABELS,
  type ClinicalTone,
  type DesktopIconName,
  type InjectionRecordRow,
  type WorkflowId,
  type WorkflowSummary,
  type WorkQueueItem,
} from "./types";

// The module tiles a real EHR home screen opens work from - everything a
// shift touches except Start Center itself. Order follows the same
// clinical-first, administrative-last sequence as the workflow nav strip.
const LAUNCHER_WORKFLOWS: readonly WorkflowId[] = [
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
  "tms",
];

const LAUNCHER_HINT: Partial<Record<WorkflowId, string>> = {
  administer: "Start or resume a medication administration record.",
  uds: "Document a point-of-care urine drug screen.",
  samples: "Log dispensed sample packages.",
  forms: "Build a letter, form, or handoff document.",
  reference: "Look up clinical and formulary reference material.",
  log: "Review and close out today's local activity log.",
  tms: "Open the future / TMS workspace.",
};

type WorklistFilter = "all" | "review" | "today" | "drafts";
type WorklistSource = "review" | "today" | "drafts";

export interface StartCenterProps {
  /** Retained for callers that also summarize the module rail. */
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
  injectionRecords: InjectionRecordRow[];
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onQueueItemOpen?: (item: WorkQueueItem) => void;
  onRecordOpen?: (record: InjectionRecordRow) => void;
  /**
   * Starts a clean local injection record. The shell owns the lifecycle, so
   * this remains optional for embedders that only render the worklist.
   */
  onStartNewInjection?: () => void;
}

/**
 * A row in Open Notes. The column set is Tebra's -
 * `Patient · Lock · Type · Status · Visit Date` - so the shape carries one
 * field per column rather than the Time/Task pairs the client/server register
 * used. `detailLabel` is the medication or activity line; Tebra has no detail
 * column, so it rides under Type as a secondary line rather than being
 * dropped, because it is what an MA actually scans for.
 */
interface WorklistRow {
  id: string;
  source: WorklistSource;
  patientLabel: string;
  typeLabel: string;
  detailLabel: string;
  statusLabel: string;
  /**
   * The chip's tone, which is NOT the row's clinical tone. The record
   * register reports an unsigned draft as `warning`, and an incomplete draft
   * is not a clinical warning - it is unfinished work. The row marker keeps
   * the register's tone; the chip states what the status means.
   */
  statusTone: ClinicalTone;
  statusIcon?: DesktopIconName;
  /** Signed notes are read-only and take the lock glyph. */
  locked: boolean;
  /** Absent on a draft: no visit date is held for one. */
  visitTimeLabel?: string;
  tone?: ClinicalTone;
  queueItem?: WorkQueueItem;
  record?: InjectionRecordRow;
}

/**
 * Sortable columns, per MANIFEST 4.1: Patient, Type and Visit Date sort;
 * Lock and Status do not.
 */
type SortColumn = "patient" | "type" | "visitDate";
type SortDirection = "asc" | "desc";
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

/**
 * "9:42 AM" to minutes past midnight. Sorting the label as text puts 10:06 AM
 * before 9:18 AM, which is the kind of thing nobody notices until a morning
 * list is in the wrong order.
 */
function minutesFromTimeLabel(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  const [, hours, minutes, meridiem] = match ?? [];
  if (!hours || !minutes || !meridiem) return undefined;
  const hour = Number(hours) % 12;
  const afternoon = meridiem.toUpperCase() === "PM";
  return (hour + (afternoon ? 12 : 0)) * 60 + Number(minutes);
}

const FILTERS: Array<{ id: WorklistFilter; label: string }> = [
  { id: "all", label: "All work" },
  { id: "review", label: "Needs review" },
  { id: "today", label: "Today" },
  { id: "drafts", label: "Drafts" },
];

function uniqueQueueRows(rows: WorkQueueItem[]) {
  return Array.from(new Map(rows.map((item) => [item.id, item])).values());
}

function requiresReview(item: WorkQueueItem) {
  return item.tone === "warning" || item.tone === "stop";
}

function isLockedRecord(record: InjectionRecordRow) {
  return /locked|completed/i.test(record.statusLabel);
}

/**
 * Three of the four status chips are reachable from a worklist row.
 * `Ready to sign` is not: it distinguishes a complete draft from an
 * incomplete one, and the row does not carry enough to tell them apart -
 * the record register reports only Draft or Locked. The worksheet, which
 * does know, uses it. Claiming it here would be a guess.
 */
function queueStatusLabel(item: WorkQueueItem) {
  if (requiresReview(item)) return NOTES.statusNeedsReview;
  return NOTES.statusSigned;
}

function queueWorklistRow(
  item: WorkQueueItem,
  source: "review" | "today",
): WorklistRow {
  const review = requiresReview(item);
  return {
    id: `${source}:${item.id}`,
    source,
    patientLabel: item.patientLabel,
    typeLabel: WORKFLOW_LABELS[item.workflow],
    detailLabel: item.detail,
    statusLabel: queueStatusLabel(item),
    statusTone: review ? "warning" : "ready",
    statusIcon: review ? "alert" : "check",
    // A signed note is locked; one still awaiting review is not, and marking
    // it locked would say the work is finished when it is not.
    locked: !review,
    visitTimeLabel: item.timeLabel,
    tone: item.tone,
    queueItem: item,
  };
}

function recordWorklistRow(record: InjectionRecordRow): WorklistRow {
  return {
    id: `draft:${record.id}`,
    source: "drafts",
    patientLabel: record.patientLabel,
    typeLabel: MODULE.injection,
    detailLabel: record.medicationLabel,
    statusLabel: NOTES.statusIncomplete,
    statusTone: "neutral",
    locked: false,
    tone: record.tone,
    record,
  };
}

/**
 * The default order is priority, not a column: review work first, then
 * drafts, then the rest of today. Sorting applies only once a header is
 * clicked, so opening Open Notes still surfaces what needs attention rather
 * than whatever happens to sort first.
 */
function sortRows(rows: WorklistRow[], sort: SortState | undefined) {
  if (!sort) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((left, right) => {
    if (sort.column === "visitDate") {
      const leftAt = minutesFromTimeLabel(left.visitTimeLabel);
      const rightAt = minutesFromTimeLabel(right.visitTimeLabel);
      // A draft holds no visit date. Undated rows sort last in both
      // directions - reversing the sort should not bury the dated work.
      if (leftAt === undefined && rightAt === undefined) return 0;
      if (leftAt === undefined) return 1;
      if (rightAt === undefined) return -1;
      return (leftAt - rightAt) * direction;
    }
    const key = sort.column === "patient" ? "patientLabel" : "typeLabel";
    return left[key].localeCompare(right[key]) * direction;
  });
}

/**
 * A sortable header. The direction shows on the sorted column; the others
 * reveal their affordance on hover only, which is what keeps a five-column
 * header from reading as five buttons.
 */
function sortableHeader(
  column: SortColumn,
  label: string,
  sort: SortState | undefined,
  toggleSort: (column: SortColumn) => void,
) {
  const active = sort?.column === column;
  const ascending = active && sort?.direction === "asc";
  return (
    <th
      class={`cd2004-worklist-sortable ${active ? "is-sorted" : ""}`}
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
    >
      <button type="button" onClick={() => toggleSort(column)}>
        <span>{label}</span>
        <span class="cd2004-worklist-sort-mark" aria-hidden="true">
          {ascending ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

const SORTABLE_COLUMNS = {
  patient: (sort: SortState | undefined, toggle: (column: SortColumn) => void) =>
    sortableHeader("patient", NOTES.columnPatient, sort, toggle),
  type: (sort: SortState | undefined, toggle: (column: SortColumn) => void) =>
    sortableHeader("type", NOTES.columnType, sort, toggle),
  visitDate: (sort: SortState | undefined, toggle: (column: SortColumn) => void) =>
    sortableHeader("visitDate", NOTES.columnVisitDate, sort, toggle),
};

function rowMatchesFilter(row: WorklistRow, filter: WorklistFilter) {
  if (filter === "all") return true;
  if (filter === "today") {
    // Review work is still today's work. It is promoted once in the All Work
    // register, while the Today filter retains it rather than silently
    // making it disappear from a date-based scan.
    return row.source === "today" || row.source === "review";
  }
  return row.source === filter;
}

function worklistEmptyText(filter: WorklistFilter) {
  if (filter === "review") return "Nothing is waiting for review.";
  if (filter === "today") return "Nothing else is recorded for today.";
  if (filter === "drafts") return "No unfinished notes.";
  return "No open notes.";
}

/**
 * The way forward, naming the action in the bar above rather than repeating
 * its button. Second person, imperative, no system nouns - PLAN 2.4.
 */
function worklistEmptyHint(filter: WorklistFilter) {
  if (filter === "review") return "Notes appear here when one needs a second look.";
  if (filter === "today") return "Notes you sign today appear here.";
  return `Use ${RECORD.startNewInjection} to begin one.`;
}

export function StartCenter({
  summaries,
  needsReview,
  todayQueue,
  injectionRecords,
  onWorkflowOpen,
  onQueueItemOpen,
  onRecordOpen,
  onStartNewInjection,
}: StartCenterProps) {
  const [filter, setFilter] = useState<WorklistFilter>("all");
  const [sort, setSort] = useState<SortState | undefined>(undefined);

  // Tebra sorts on the first header click and reverses on the second.
  const toggleSort = (column: SortColumn) =>
    setSort((current) =>
      current?.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );

  // A review item is also present in the general Today queue. Keep it once in
  // its higher-priority register instead of showing the same local work twice.
  const reviewItems = uniqueQueueRows(needsReview);
  const reviewIds = new Set(reviewItems.map((item) => item.id));
  const todayItems = uniqueQueueRows(todayQueue).filter(
    (item) => !reviewIds.has(item.id),
  );
  // Injection records are a local record register. Only editable records
  // belong on the current worklist; locked history is intentionally kept in
  // Record List.
  const savedDrafts = injectionRecords.filter(
    (record) => !isLockedRecord(record),
  );
  const allRows = [
    ...reviewItems.map((item) => queueWorklistRow(item, "review")),
    ...savedDrafts.map(recordWorklistRow),
    ...todayItems.map((item) => queueWorklistRow(item, "today")),
  ];
  const visibleRows = sortRows(
    allRows.filter((row) => rowMatchesFilter(row, filter)),
    sort,
  );
  const countFor = (candidate: WorklistFilter) =>
    allRows.filter((row) => rowMatchesFilter(row, candidate)).length;

  const openRow = (row: WorklistRow) => {
    if (row.queueItem) onQueueItemOpen?.(row.queueItem);
    if (row.record) onRecordOpen?.(row.record);
  };

  return (
    <section class="cd2004-start-center" aria-labelledby="currentWorklistTitle">
      <nav class="cd2004-launcher" aria-label="Start a clinical workflow">
        <span class="cd2004-launcher-head">Clinical Modules</span>
        <div class="cd2004-launcher-grid">
          {LAUNCHER_WORKFLOWS.map((workflow) => {
            const summary = summaries[workflow];
            const count = summary?.count ?? 0;
            return (
              <button
                key={workflow}
                type="button"
                class={`cd2004-launcher-tile ${summary?.state ? `is-${summary.state}` : ""}`}
                title={LAUNCHER_HINT[workflow]}
                aria-label={
                  summary?.detail
                    ? `${WORKFLOW_LABELS[workflow]} — ${summary.detail}`
                    : WORKFLOW_LABELS[workflow]
                }
                onClick={() => onWorkflowOpen(workflow)}
              >
                <span class="cd2004-launcher-icon" aria-hidden="true">
                  <DesktopIcon name={workflow} />
                </span>
                <span class="cd2004-launcher-label">{WORKFLOW_LABELS[workflow]}</span>
                {count > 0 && (
                  <span class="cd2004-launcher-badge" aria-label={`${count} items`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <header class="cd2004-worklist-header">
        <div>
          <h1 id="currentWorklistTitle" aria-label={NOTES.openNotes}>
            {SHELL.localOnlyDetail}
          </h1>
        </div>
        <button
          type="button"
          class="cd2004-worklist-new"
          disabled={!onStartNewInjection}
          title={
            onStartNewInjection
              ? "Start a clean local injection record."
              : "Starting a new local injection record is not available in this view."
          }
          onClick={() => onStartNewInjection?.()}
        >
          <DesktopIcon name="new" />
          Start new injection
        </button>
      </header>

      <div class="cd2004-worklist-tabs" role="tablist" aria-label="Current work filters">
        <span class="cd2004-worklist-filter-label">VIEW:</span>
        {FILTERS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={filter === candidate.id}
            class={filter === candidate.id ? "is-selected" : ""}
            onClick={() => setFilter(candidate.id)}
          >
            <span>{candidate.label}</span>
            <b>{countFor(candidate.id)}</b>
          </button>
        ))}
      </div>

      <div class="cd2004-worklist-sheet">
        <table class="cd2004-worklist-table">
          <thead>
            <tr>
              {SORTABLE_COLUMNS.patient(sort, toggleSort)}
              <th class="cd2004-worklist-lock-column">
                <span class="cd2004-visually-hidden">{NOTES.columnLock}</span>
              </th>
              {SORTABLE_COLUMNS.type(sort, toggleSort)}
              <th>{NOTES.columnStatus}</th>
              {SORTABLE_COLUMNS.visitDate(sort, toggleSort)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const openable = Boolean(row.queueItem ?? row.record);
              return (
                <tr
                  key={row.id}
                  class={`is-${row.tone ?? "neutral"} ${openable ? "is-openable" : ""}`}
                  // Tebra opens a note from anywhere on its row, with no
                  // trailing "open" link. The row carries the pointer target;
                  // the patient button below carries the keyboard and screen
                  // reader one, so neither input method loses the affordance.
                  onClick={openable ? () => openRow(row) : undefined}
                >
                  <td data-label={NOTES.columnPatient}>
                    <button
                      type="button"
                      class="cd2004-worklist-open"
                      disabled={!openable}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRow(row);
                      }}
                    >
                      {row.patientLabel}
                    </button>
                  </td>
                  <td class="cd2004-worklist-lock-column" data-label={NOTES.columnLock}>
                    {row.locked && (
                      <span
                        class="cd2004-worklist-lock"
                        title={
                          row.visitTimeLabel
                            ? `${NOTES.lockedHint} · ${row.visitTimeLabel}`
                            : NOTES.lockedHint
                        }
                        aria-label={NOTES.lockedHint}
                      >
                        <DesktopIcon name="lock" />
                      </span>
                    )}
                  </td>
                  <td data-label={NOTES.columnType}>
                    <span class="cd2004-worklist-type">
                      <strong>{row.typeLabel}</strong>
                      <small>{row.detailLabel}</small>
                    </span>
                  </td>
                  <td data-label={NOTES.columnStatus}>
                    {/* Icon and word, never colour alone: MANIFEST 5 q7. */}
                    <span class={`cd2004-note-chip is-${row.statusTone}`}>
                      {row.statusIcon && (
                        <DesktopIcon name={row.statusIcon} />
                      )}
                      {row.statusLabel}
                    </span>
                  </td>
                  <td data-label={NOTES.columnVisitDate}>
                    <span class="cd2004-worklist-visit">
                      {row.visitTimeLabel ?? NOTES.noVisitDate}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!visibleRows.length && (
              <tr class="cd2004-worklist-empty">
                <td colSpan={5}>
                  {/*
                    One line in voice, then the way out of it - never a bare
                    "No records." MANIFEST 4.1 says the empty state carries the
                    primary action; it is carried by the action bar directly
                    above, and repeating it here would put two coral buttons on
                    one screen (MANIFEST 5 q6) and two controls with the same
                    accessible name on one table. The line names it instead.
                  */}
                  <strong>{worklistEmptyText(filter)}</strong>
                  <small>{worklistEmptyHint(filter)}</small>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer class="cd2004-worklist-footer">
        <span>{visibleRows.length} local item{visibleRows.length === 1 ? "" : "s"} shown</span>
        <span>Signed history: {NOTES.openNotes}</span>
      </footer>
    </section>
  );
}
