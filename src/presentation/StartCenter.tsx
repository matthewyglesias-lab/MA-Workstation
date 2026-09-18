import { NOTES, RECORD, SHELL, WORKLIST_EMPTY, noteCount } from "./vocabulary";
import { useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import { LightfullyMark } from "./lightfully/WorkspaceTools";
import {
  type ClinicalTone,
  type InjectionRecordRow,
  type WorkQueueItem,
  type WorkflowId,
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
  onWorkflowOpen?: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
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

  const quickTools: Array<{ workflow: WorkflowId; title: string; detail: string; tag: string }> = [
    { workflow: "administer", title: "Injection", detail: "Order, timing & administration", tag: "CLINICAL" },
    { workflow: "uds", title: "Drug screen", detail: "Collection, results & interpretation", tag: "LABORATORY" },
    { workflow: "samples", title: "Oral samples", detail: "Dispensing & patient instructions", tag: "MEDICATION" },
    { workflow: "forms", title: "Forms & letters", detail: "Requests, review & documentation", tag: "DOCUMENTS" },
  ];

  return (
    <section class="cd2004-start-center lf-start-center" aria-labelledby="currentWorklistTitle">
      <div class="lf-welcome">
        <div><span class="lf-eyebrow">YOUR CLINICAL WORKSPACE</span><h1>Care, with a little more clarity.</h1><p>One place for the work around each patient.</p></div>
        <div class="lf-welcome-date"><LightfullyMark/><span>{new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date())}<strong>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date())}</strong></span></div>
      </div>
      <div class="lf-quick-tools" aria-label="Clinical workspaces">
        {quickTools.map((tool) => <button key={tool.workflow} type="button" class={`lf-quick-tool is-${tool.workflow}`} disabled={!onWorkflowOpen} onClick={() => onWorkflowOpen?.(tool.workflow)}>
          <span class="lf-quick-icon"><DesktopIcon name={tool.workflow}/></span><span class="lf-quick-copy"><small>{tool.tag}</small><strong>{tool.title}</strong><span>{tool.detail}</span></span><span class="lf-quick-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>

      <div class="lf-work-summary" aria-label="Local work summary">
        <button type="button" class="lf-summary-item" onClick={() => { setFilter("review"); setQuery(""); }}><span class="lf-summary-number is-review">{countFor("review")}</span><span><strong>Needs review</strong><small>Resolve before finishing</small></span></button>
        <button type="button" class="lf-summary-item" onClick={() => { setFilter("drafts"); setQuery(""); }}><span class="lf-summary-number is-drafts">{countFor("drafts")}</span><span><strong>Saved drafts</strong><small>Ready to pick back up</small></span></button>
        <button type="button" class="lf-summary-item" onClick={() => { setFilter("today"); setQuery(""); }}><span class="lf-summary-number is-today">{countFor("today")}</span><span><strong>Today’s work</strong><small>Recorded on this browser</small></span></button>
      </div>

      <div class="lf-worklist-card">
      <header class="cd2004-worklist-header">
        <div><span class="lf-eyebrow">CONTINUE YOUR WORK</span><h2 id="currentWorklistTitle">{NOTES.openNotes}</h2><p>Review items first, then saved drafts and today’s work.</p></div>
        <button type="button" class="cd2004-worklist-new" disabled={!onStartNewInjection} title={onStartNewInjection ? "Start a clean injection note." : "Starting an injection note is unavailable in this view."} onClick={() => onStartNewInjection?.()}><DesktopIcon name="new"/>{RECORD.startNewInjection}</button>
      </header>
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
        <label class="lf-worklist-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input type="search" aria-label="Filter local work by patient or medication" placeholder="Patient or medication" value={query} onInput={(event) => setQuery(event.currentTarget.value)}/></label>
      </div>
      <div class="cd2004-worklist-sheet" id="lf-work-panel" role="tabpanel" aria-labelledby={`lf-work-tab-${filter}`}>
        {visibleRows.length ? <ul class="tebra-record-list">
          {visibleRows.map((row) => <li key={row.id} class="tebra-record-row" data-worklist-row={row.source}>
            <span class={`lf-worklist-row-mark is-${row.tone ?? "neutral"}`} aria-hidden="true"><DesktopIcon name={row.source === "review" ? "alert" : "note"}/></span>
            <div class="tebra-record-copy"><strong class="tebra-record-title">{row.taskLabel}</strong><p class="tebra-record-meta"><span>{row.patientLabel}</span><span aria-hidden="true">·</span><span>{row.priorityLabel}</span>{row.timeLabel ? <><span aria-hidden="true">·</span><span>{row.timeLabel}</span></> : null}</p></div>
            <div class="tebra-record-state"><span class={`tebra-state-chip is-${row.tone ?? "neutral"}`}><span aria-hidden="true">{TONE_GLYPH[row.tone ?? "neutral"]}</span>{row.stateLabel}</span><button type="button" class="tebra-record-action" data-worklist-open={row.id} disabled={!row.queueItem && !row.record} onClick={() => openRow(row)}>{row.actionLabel}<span aria-hidden="true"> →</span></button></div>
          </li>)}
        </ul> : <div class="tebra-record-empty lf-worklist-empty"><span class="lf-empty-mark"><LightfullyMark/></span><strong>{query.trim() ? "No notes match your search." : worklistEmptyText(filter)}</strong><small>{query.trim() ? "Try another patient or medication, or clear the search." : worklistEmptyHint(filter)}</small>{query.trim() && <button type="button" class="tebra-record-action" onClick={() => setQuery("")}>Clear search</button>}</div>}
      </div>
      <footer class="cd2004-worklist-footer"><span aria-live="polite">{noteCount(visibleRows.length, "local item")} shown</span><button type="button" class="lf-text-button" disabled={!onOpenRecords} onClick={() => onOpenRecords?.()}>Signed history & all saved notes <span aria-hidden="true">↗</span></button></footer>
      </div>
      <div class="lf-workspace-footnote"><DesktopIcon name="lock"/><span>{SHELL.localOnlyDetail}. Copy reviewed documentation to Tebra, the chart of record.</span></div>
    </section>
  );
}
