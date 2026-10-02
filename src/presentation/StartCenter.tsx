import { NOTES, RECORD, SHELL, WORKLIST_EMPTY, noteCount } from "./vocabulary";
import { useMemo, useState } from "preact/hooks";
import { DesktopIcon } from "./DesktopIcon";
import { SERVICES } from "./lightfully/ServiceWorkspace";
import type { NotesTableRow } from "./notes/note-table-model";
import { WORKFLOW_LABELS } from "./types";
import {
  type ClinicalTone,
  type InjectionRecordRow,
  type WorkQueueItem,
  type WorkflowId,
  type WorkspaceSessionDraft,
} from "./types";

type WorklistFilter = "all" | "review" | "today" | "drafts";
type WorklistSource = "review" | "today" | "drafts";

export interface StartCenterProps {
  udsDraftRows?: NotesTableRow[];
  onUdsDraftOpen?: (row: NotesTableRow) => void;
  sessionDrafts?: WorkspaceSessionDraft[];
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
  session?: WorkspaceSessionDraft;
  udsDraft?: NotesTableRow;
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
  udsDraftRows = [],
  onUdsDraftOpen,
  sessionDrafts = [],
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
  const allRows = useMemo(() => {
    const reviewItems = uniqueQueueRows(needsReview);
    const reviewIds = new Set(reviewItems.map(item => item.id));
    const todayItems = uniqueQueueRows(todayQueue).filter(item => !reviewIds.has(item.id));
    const savedDrafts = injectionRecords.filter(record => !isLockedRecord(record));
    return [
      ...reviewItems.map(item => queueWorklistRow(item, "review")),
      ...savedDrafts.map(recordWorklistRow),
      ...udsDraftRows.map((record): WorklistRow => ({
        id: `uds-draft:${record.recordId}`, source: 'drafts', service: 'uds',
        priorityLabel: 'Saved draft', patientLabel: record.patientLabel,
        taskLabel: record.summaryLabel || 'Drug screen', timeLabel: record.visit.label,
        stateLabel: 'Draft saved locally', actionLabel: 'Resume', tone: 'neutral', udsDraft: record,
      })),
      ...sessionDrafts.map((session): WorklistRow => ({
        id: `session:${session.workflow}`, source: 'drafts', service: session.workflow,
        priorityLabel: 'Unfinished session', patientLabel: session.patientLabel,
        taskLabel: session.recoveryAvailable ? 'Reload recovery available in this tab' : 'Keep this tab open; recovery unavailable',
        timeLabel: 'Open session', stateLabel: 'Unfinished', actionLabel: 'Resume',
        tone: session.recoveryAvailable ? 'neutral' : 'warning', session,
      })),
      ...todayItems.map(item => queueWorklistRow(item, "today")),
    ];
  }, [needsReview, todayQueue, injectionRecords, sessionDrafts, udsDraftRows]);
  const indexedRows = useMemo(() => allRows.map(row => ({
    row, text: `${row.patientLabel} ${row.taskLabel} ${row.stateLabel}`.toLocaleLowerCase(),
  })), [allRows]);
  const counts = useMemo(() => {
    const value = { all: allRows.length, review: 0, today: 0, drafts: 0 };
    for (const row of allRows) {
      if (row.source === "drafts") value.drafts++;
      else { value.today++; if (row.source === "review") value.review++; }
    }
    return value;
  }, [allRows]);
  const visibleRows = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return indexedRows.filter(({row, text}) => rowMatchesFilter(row, filter) &&
      words.every(word => text.includes(word))).map(({row}) => row);
  }, [indexedRows, filter, query]);
  const countFor = (candidate: WorklistFilter) => counts[candidate];

  const openRow = (row: WorklistRow) => {
    if (row.udsDraft) { onUdsDraftOpen?.(row.udsDraft); return; }
    if (row.session) { onWorkflowOpen?.(row.session.workflow); return; }
    if (row.queueItem) onQueueItemOpen?.(row.queueItem);
    if (row.record) onRecordOpen?.(row.record);
  };

  return (
    <section class="cd2004-start-center lf-start-center" aria-labelledby="currentWorklistTitle">
      <header class="lf-worklist-heading cd2004-worklist-header"><div><span class="lf-eyebrow">YOUR LOCAL WORKSPACE</span><h1 id="currentWorklistTitle">Worklist</h1><p>Choose a service, pick up a draft, or review what needs attention.</p></div><time>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</time></header>
      <aside class="lf-service-launcher" aria-label="Document care">
      <h2>Document care</h2><p>Start a service or return to the one you left open.</p>
      <div class="lf-service-strip" aria-label="Start or resume a service">
        {SERVICES.map((service) => <button type="button" class={`lf-service-shortcut lf-service-${service.id}`} key={service.id}
          disabled={!onWorkflowOpen} onClick={() => onWorkflowOpen?.(service.id)}>
          <span class="lf-shortcut-number" aria-hidden="true"><DesktopIcon name={service.id}/></span>
          <span class="lf-shortcut-copy"><strong>{service.id === "uds" ? "Drug screen" : service.id === "samples" ? "Samples" : service.id === "forms" ? "Forms & requests" : "Injection"}</strong><small>{service.id === "administer" ? "Document an injection" : service.id === "uds" ? "Collection & results" : service.id === "samples" ? "Medication handoff" : "Prepare documentation"}</small></span>
          <span class="lf-shortcut-arrow" aria-hidden="true">↗</span>
        </button>)}
      </div>
      </aside>
      <div class="lf-worklist-card">
      <div class="lf-worklist-intro"><h2>Continue work</h2><p>Drafts, open sessions and documentation to review.</p></div>
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
        {visibleRows.length ? <table class="lf-work-table"><caption class="cd2004-visually-hidden">Local records and unfinished work in this tab</caption><thead><tr><th scope="col">Patient / task</th><th scope="col">Service</th><th scope="col">Date / time</th><th scope="col">Status</th><th scope="col"><span class="cd2004-visually-hidden">Action</span></th></tr></thead><tbody>
          {visibleRows.map((row) => <tr key={row.id} class="tebra-record-row" data-worklist-row={row.source}>
            <td class="tebra-record-copy"><strong class="tebra-record-title">{row.patientLabel}</strong><span class="tebra-record-meta">{row.taskLabel}</span></td>
            <td><span class="lf-table-service"><DesktopIcon name={row.service}/>{WORKFLOW_LABELS[row.service]}</span></td>
            <td class="lf-table-date">{row.timeLabel || "—"}</td>
            <td><span class={`tebra-state-chip is-${row.tone ?? "neutral"}`}><span aria-hidden="true">{TONE_GLYPH[row.tone ?? "neutral"]}</span>{row.stateLabel}</span></td>
            <td><button type="button" class="tebra-record-action" data-worklist-open={row.id} disabled={row.udsDraft ? !onUdsDraftOpen : row.session ? !onWorkflowOpen : row.queueItem ? !onQueueItemOpen : !onRecordOpen} onClick={() => openRow(row)}>{row.actionLabel}<span aria-hidden="true"> →</span></button></td>
          </tr>)}
        </tbody></table> : <div class="tebra-record-empty lf-worklist-empty"><span class="lf-empty-mark" aria-hidden="true"><span/><DesktopIcon name={query.trim() ? "records" : "note"}/></span><strong>{query.trim() ? "No matching work" : filter === "all" ? "Your worklist is clear" : worklistEmptyText(filter)}</strong><small>{query.trim() ? "Try another patient or medication, or clear the search." : filter === "all" ? "Document an injection, drug screen, samples or a form request. Your unfinished work will appear here." : worklistEmptyHint(filter)}</small>{query.trim() ? <button type="button" class="lf-secondary-button" onClick={() => setQuery("")}>Clear search</button> : filter === "all" && <button type="button" class="lf-secondary-button" disabled={!onDocumentService} onClick={onDocumentService}>Choose a service <span aria-hidden="true">→</span></button>}</div>}
      </div>
      <footer class="cd2004-worklist-footer"><span aria-live="polite">{noteCount(visibleRows.length, "local item")} shown</span><span>Local records &amp; open sessions</span></footer>
      </div>
      <p class="lf-workspace-footnote">Review and copy completed documentation to Tebra. This worklist is not an appointment schedule.</p>
    </section>
  );
}
