import { NOTES, RECORD, SHELL, WORKLIST_EMPTY, noteCount } from "./vocabulary";
import { useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import { Illustration } from "./Illustration";
import {
  type ClinicalTone,
  type InjectionRecordRow,
  type WorkQueueItem,
} from "./types";

type WorklistFilter = "all" | "review" | "today" | "drafts";
type WorklistSource = "review" | "today" | "drafts";

export interface StartCenterProps {
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
  injectionRecords: InjectionRecordRow[];
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
    source: "drafts",
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
  if (filter === "review") return WORKLIST_EMPTY.review;
  if (filter === "today") return WORKLIST_EMPTY.today;
  if (filter === "drafts") return WORKLIST_EMPTY.drafts;
  return WORKLIST_EMPTY.all;
}

function worklistEmptyHint(filter: WorklistFilter) {
  if (filter === "drafts") return WORKLIST_EMPTY.draftsHint;
  if (filter === "review") return WORKLIST_EMPTY.reviewHint;
  if (filter === "today") return WORKLIST_EMPTY.todayHint;
  return WORKLIST_EMPTY.allHint;
}

/** Status is never colour alone: every tone renders a glyph and a word. */
const TONE_GLYPH: Record<ClinicalTone, string> = {
  stop: "×",
  warning: "!",
  ready: "✓",
  info: "·",
  neutral: "·",
};

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
  // belong on the current worklist; signed history stays in Open Notes.
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
          <h1 id="currentWorklistTitle">{NOTES.openNotes}</h1>
          <p>{SHELL.localOnlyDetail}</p>
        </div>
        <button
          type="button"
          class="cd2004-worklist-new"
          disabled={!onStartNewInjection}
          title={
            onStartNewInjection
              ? "Start a clean injection note."
              : "Starting an injection note is unavailable in this view."
          }
          onClick={() => onStartNewInjection?.()}
        >
          <DesktopIcon name="new" />
          {RECORD.startNewInjection}
        </button>
      </header>

      <div class="cd2004-worklist-tabs" role="tablist" aria-label="Current work filters">
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

      {/*
        The same list grammar the patient chart uses, not a second table with
        its own column headings. Tebra's product has one way of presenting a
        list of work; two of them, on the two screens a medical assistant sees
        most, is the seam a Tebra user would notice first.
      */}
      <div class="cd2004-worklist-sheet">
        {visibleRows.length ? (
          <ul class="tebra-record-list">
            {visibleRows.map((row) => (
              <li key={row.id} class="tebra-record-row" data-worklist-row={row.source}>
                <div class="tebra-record-copy">
                  <strong class="tebra-record-title">{row.taskLabel}</strong>
                  <p class="tebra-record-meta">
                    <span>{row.patientLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{row.priorityLabel}</span>
                    {row.timeLabel ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{row.timeLabel}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div class="tebra-record-state">
                  <span class={`tebra-state-chip is-${row.tone ?? "neutral"}`}>
                    <span aria-hidden="true">{TONE_GLYPH[row.tone ?? "neutral"]}</span>
                    {row.stateLabel}
                  </span>
                  <button
                    type="button"
                    class="tebra-record-action"
                    data-worklist-open={row.id}
                    disabled={!row.queueItem && !row.record}
                    onClick={() => openRow(row)}
                  >
                    {row.actionLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div class="tebra-record-empty">
            <Illustration name="worklist-clear" />
            <strong>{worklistEmptyText(filter)}</strong>
            <small>{worklistEmptyHint(filter)}</small>
          </div>
        )}
      </div>

      <footer class="cd2004-worklist-footer">
        <span>{noteCount(visibleRows.length, "local item")} shown</span>
        <span>Signed history: {NOTES.openNotes}</span>
      </footer>
    </section>
  );
}
