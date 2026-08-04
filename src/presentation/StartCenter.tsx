import { useState } from "preact/hooks";
import {
  type ClinicalTone,
  type InjectionRecordRow,
  type WorkflowId,
  type WorkflowSummary,
  type WorkQueueItem,
} from "./types";

type WorklistFilter = "all" | "review" | "today" | "drafts";
type WorklistSource = "review" | "today" | "draft";

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

interface WorklistRow {
  id: string;
  source: WorklistSource;
  priorityLabel: string;
  timeLabel?: string;
  patientLabel: string;
  taskLabel: string;
  stateLabel: string;
  actionLabel: "Resume" | "Review" | "View";
  tone?: ClinicalTone;
  queueItem?: WorkQueueItem;
  record?: InjectionRecordRow;
}

const FILTERS: Array<{ id: WorklistFilter; label: string }> = [
  { id: "all", label: "All Work" },
  { id: "review", label: "Needs Review" },
  { id: "today", label: "Today" },
  { id: "drafts", label: "Saved Drafts" },
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

function queueStateLabel(item: WorkQueueItem) {
  if (requiresReview(item)) return "Needs review";
  return "Recorded locally";
}

function queueActionLabel(item: WorkQueueItem): "Review" | "View" {
  return requiresReview(item) ? "Review" : "View";
}

function queueWorklistRow(
  item: WorkQueueItem,
  source: "review" | "today",
): WorklistRow {
  return {
    id: `${source}:${item.id}`,
    source,
    priorityLabel: source === "review" ? "Needs review" : "Today",
    timeLabel: item.timeLabel,
    patientLabel: item.patientLabel,
    taskLabel: item.detail,
    stateLabel: queueStateLabel(item),
    actionLabel: queueActionLabel(item),
    tone: item.tone,
    queueItem: item,
  };
}

function recordWorklistRow(record: InjectionRecordRow): WorklistRow {
  return {
    id: `draft:${record.id}`,
    source: "draft",
    priorityLabel: "Saved draft",
    patientLabel: record.patientLabel,
    taskLabel: record.medicationLabel,
    stateLabel: record.statusLabel,
    actionLabel: "Resume",
    tone: record.tone,
    record,
  };
}

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
  if (filter === "review") return "No local work is awaiting review.";
  if (filter === "today") return "No other local work is recorded for today.";
  if (filter === "drafts") return "No saved local injection drafts are available.";
  return "No local work or saved drafts are available.";
}

export function StartCenter({
  needsReview,
  todayQueue,
  injectionRecords,
  onQueueItemOpen,
  onRecordOpen,
  onStartNewInjection,
}: StartCenterProps) {
  const [filter, setFilter] = useState<WorklistFilter>("all");

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
  const visibleRows = allRows.filter((row) => rowMatchesFilter(row, filter));
  const countFor = (candidate: WorklistFilter) =>
    allRows.filter((row) => rowMatchesFilter(row, candidate)).length;

  const openRow = (row: WorklistRow) => {
    if (row.queueItem) onQueueItemOpen?.(row.queueItem);
    if (row.record) onRecordOpen?.(row.record);
  };

  return (
    <section class="cd2004-start-center" aria-labelledby="currentWorklistTitle">
      <header class="cd2004-worklist-header">
        <div>
          <span class="cd2004-worklist-kicker">Current worklist</span>
          <h1 id="currentWorklistTitle">Current Worklist</h1>
          <p>Local records only</p>
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
              <th>Time / priority</th>
              <th>Patient / visit</th>
              <th>Task / medication</th>
              <th>State</th>
              <th>
                <span class="cd2004-visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id} class={`is-${row.tone ?? "neutral"}`}>
                <td data-label="Time / priority">
                  <strong>{row.priorityLabel}</strong>
                  {row.timeLabel && <small>{row.timeLabel}</small>}
                </td>
                <td data-label="Patient / visit">{row.patientLabel}</td>
                <td data-label="Task / medication">{row.taskLabel}</td>
                <td data-label="State">
                  <span class={`cd2004-worklist-state is-${row.tone ?? "neutral"}`}>
                    {row.stateLabel}
                  </span>
                </td>
                <td data-label="Action">
                  <button
                    type="button"
                    class="cd2004-worklist-action"
                    disabled={!row.queueItem && !row.record}
                    onClick={() => openRow(row)}
                  >
                    {row.actionLabel}
                  </button>
                </td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr class="cd2004-worklist-empty">
                <td colSpan={5}>{worklistEmptyText(filter)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer class="cd2004-worklist-footer">
        <span>{visibleRows.length} local item{visibleRows.length === 1 ? "" : "s"} shown</span>
        <span>Locked local history: Record List</span>
      </footer>
    </section>
  );
}
