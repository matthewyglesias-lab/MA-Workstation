import { NOTES, RECORD, SHELL, WORKLIST_EMPTY, noteCount } from "./vocabulary";
import { useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import { WORKFLOW_LABELS } from "./types";
import {
  type ClinicalTone,
  type InjectionRecordRow,
  type WorkQueueItem,
  type WorkflowId,
} from "./types";

type WorklistFilter = "all" | "review" | "today" | "drafts";
type WorklistSource = "review" | "today" | "drafts";

export interface StartCenterProps {
  onDocumentService?: () => void;
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
  onWorkflowOpen?: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
}

interface WorklistRow {
  id: string;
  source: WorklistSource;
  service: WorkflowId;
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
    service: item.workflow,
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
    service: "administer",
    timeLabel: record.timeLabel,
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
  onDocumentService,
  needsReview,
  todayQueue,
  injectionRecords,
  onQueueItemOpen,
  onRecordOpen,
  onStartNewInjection,
  onWorkflowOpen,
  onOpenRecords,
}: StartCenterProps) {
  const [filter, setFilter] = useState<WorklistFilter>("all");
  const [query, setQuery] = useState("");

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
  const searchWords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visibleRows = allRows.filter((row) => rowMatchesFilter(row, filter) && searchWords.every((word) => `${row.patientLabel} ${row.taskLabel} ${row.stateLabel}`.toLocaleLowerCase().includes(word)));
  const countFor = (candidate: WorklistFilter) =>
    allRows.filter((row) => rowMatchesFilter(row, candidate)).length;

  const openRow = (row: WorklistRow) => {
    if (row.queueItem) onQueueItemOpen?.(row.queueItem);
    if (row.record) onRecordOpen?.(row.record);
  };

  return (
    <section class="cd2004-start-center lf-start-center" aria-labelledby="currentWorklistTitle">
      <header class="lf-worklist-heading cd2004-worklist-header"><div><span class="lf-eyebrow">CLINICAL DOCUMENTATION</span><h1 id="currentWorklistTitle">Worklist</h1><p>Pick up a draft, review an item, or document a service.</p></div><time>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</time></header>
      <div class="lf-worklist-card">
      <div class="lf-worklist-controls">
        <div class="cd2004-worklist-tabs" role="tablist" aria-label="Current work filters" onKeyDown={(event) => {
          const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const index = FILTERS.findIndex((candidate) => candidate.id === filter);
          const next = event.key === "Home" ? 0 : event.key === "End" ? FILTERS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + FILTERS.length) % FILTERS.length;
          setFilter(FILTERS[next]!.id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>
          {FILTERS.map((candidate) => <button key={candidate.id} type="button" role="tab" id={`lf-work-tab-${candidate.id}`} aria-controls="lf-work-panel" tabIndex={filter === candidate.id ? 0 : -1} aria-selected={filter === candidate.id} class={filter === candidate.id ? "is-selected" : ""} onClick={() => setFilter(candidate.id)}><span>{candidate.label}</span><b>{countFor(candidate.id)}</b></button>)}
        </div>
        <label class="lf-worklist-search"><DesktopIcon name="patient"/><input type="search" aria-label="Filter local work by patient or medication" placeholder="Filter this worklist" value={query} onInput={(event) => setQuery(event.currentTarget.value)}/></label>
      </div>
      <div class="cd2004-worklist-sheet" id="lf-work-panel" role="tabpanel" aria-labelledby={`lf-work-tab-${filter}`}>
        {visibleRows.length ? <table class="lf-work-table"><caption class="cd2004-visually-hidden">Work saved in this browser</caption><thead><tr><th scope="col">Patient / task</th><th scope="col">Service</th><th scope="col">Date / time</th><th scope="col">Status</th><th scope="col"><span class="cd2004-visually-hidden">Action</span></th></tr></thead><tbody>
          {visibleRows.map((row) => <tr key={row.id} class="tebra-record-row" data-worklist-row={row.source}>
            <td class="tebra-record-copy"><strong class="tebra-record-title">{row.patientLabel}</strong><span class="tebra-record-meta">{row.taskLabel}</span></td>
            <td><span class="lf-table-service"><DesktopIcon name={row.service}/>{WORKFLOW_LABELS[row.service]}</span></td>
            <td class="lf-table-date">{row.timeLabel || "—"}</td>
            <td><span class={`tebra-state-chip is-${row.tone ?? "neutral"}`}><span aria-hidden="true">{TONE_GLYPH[row.tone ?? "neutral"]}</span>{row.stateLabel}</span></td>
            <td><button type="button" class="tebra-record-action" data-worklist-open={row.id} disabled={row.queueItem ? !onQueueItemOpen : !onRecordOpen} onClick={() => openRow(row)}>{row.actionLabel}<span aria-hidden="true"> →</span></button></td>
          </tr>)}
        </tbody></table> : <div class="tebra-record-empty lf-worklist-empty"><span class="lf-empty-mark"><DesktopIcon name={query.trim() ? "records" : "note"}/></span><strong>{query.trim() ? "No matching work" : filter === "all" ? "Your worklist is clear" : worklistEmptyText(filter)}</strong><small>{query.trim() ? "Try another patient or medication, or clear the search." : filter === "all" ? "Document an injection, drug screen, samples or a form request. Your unfinished work will appear here." : worklistEmptyHint(filter)}</small>{query.trim() ? <button type="button" class="lf-secondary-button" onClick={() => setQuery("")}>Clear search</button> : filter === "all" && <button type="button" class="lf-secondary-button" disabled={!onDocumentService} onClick={onDocumentService}>Choose a service <span aria-hidden="true">→</span></button>}</div>}
      </div>
      <footer class="cd2004-worklist-footer"><span aria-live="polite">{noteCount(visibleRows.length, "local item")} shown</span><span>Saved in this browser</span></footer>
      </div>
      <p class="lf-workspace-footnote">Review and copy completed documentation to Tebra. This worklist is not an appointment schedule.</p>
    </section>
  );
}
