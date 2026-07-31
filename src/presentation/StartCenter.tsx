import { DesktopIcon } from "./DesktopIcon";
import {
  WORKFLOW_LABELS,
  type ActivityItem,
  type InjectionRecordRow,
  type WorkflowId,
  type WorkflowSummary,
  type WorkQueueItem,
} from "./types";

interface StartCenterProps {
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
  recentActivity: ActivityItem[];
  injectionRecords: InjectionRecordRow[];
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onQueueItemOpen?: (item: WorkQueueItem) => void;
  onRecordOpen?: (record: InjectionRecordRow) => void;
}

const launchWorkflows: WorkflowId[] = [
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
];

function stateLabel(summary?: WorkflowSummary) {
  if (!summary?.state || summary.state === "idle") return "Ready";
  if (summary.state === "attention") return "Review";
  if (summary.state === "locked") return "Posted";
  return summary.state.charAt(0).toUpperCase() + summary.state.slice(1);
}

export function StartCenter({
  summaries,
  needsReview,
  todayQueue,
  recentActivity,
  injectionRecords,
  onWorkflowOpen,
  onQueueItemOpen,
  onRecordOpen,
}: StartCenterProps) {
  const todayTotal = todayQueue.length;
  const reviewTotal = needsReview.length;

  return (
    <div class="cd2004-start-center">
      <section class="cd2004-start-launchers" aria-labelledby="workflowLauncherTitle">
        <div class="cd2004-section-heading">
          <div>
            <span class="cd2004-eyebrow">Clinical workstation</span>
            <h1 id="workflowLauncherTitle">Select a workflow</h1>
          </div>
          <span class="cd2004-counter">{launchWorkflows.length} modules</span>
        </div>
        <div class="cd2004-launcher-grid">
          {launchWorkflows.map((workflow, index) => {
            const summary = summaries[workflow];
            return (
              <button
                key={workflow}
                type="button"
                class={`cd2004-launcher is-${summary?.state ?? "idle"}`}
                onClick={() => onWorkflowOpen(workflow)}
              >
                <span class="cd2004-launcher-icon">
                  <DesktopIcon name={workflow} />
                </span>
                <span class="cd2004-launcher-copy">
                  <strong>
                    <span class="cd2004-access-key">{index + 2}</span>
                    {summary?.label ?? WORKFLOW_LABELS[workflow]}
                  </strong>
                  <small>
                    {summary?.detail ??
                      (workflow === "administer"
                        ? "Document medication administration"
                        : workflow === "uds"
                          ? "Document point-of-care screening"
                          : workflow === "samples"
                            ? "Record package-level dispensing"
                            : workflow === "forms"
                              ? "Track forms and patient notification"
                              : workflow === "reference"
                                ? "Search clinical guidance"
                                : "Review and close today’s activity")}
                  </small>
                </span>
                <span class="cd2004-launcher-state">
                  {summary?.count ? `${summary.count} · ` : ""}
                  {stateLabel(summary)}
                </span>
              </button>
            );
          })}
        </div>
        <div class="cd2004-local-notice">
          <DesktopIcon name="records" />
          <span>
            <strong>This is a local clinical workspace.</strong> It does not display a
            server patient census. Records listed here are saved only in this browser.
          </span>
        </div>
      </section>

      <section class="cd2004-start-ledger" aria-label="Today and needs review">
        <div class="cd2004-metric-row">
          <div class="cd2004-metric">
            <span>Today</span>
            <strong>{todayTotal}</strong>
            <small>local activity items</small>
          </div>
          <div class={`cd2004-metric ${reviewTotal ? "has-warning" : ""}`}>
            <span>Needs review</span>
            <strong>{reviewTotal}</strong>
            <small>{reviewTotal ? "follow-up required" : "no flagged items"}</small>
          </div>
        </div>

        <Ledger
          title="Needs Review"
          emptyLabel="No locally saved items need review."
          rows={needsReview}
          onOpen={onQueueItemOpen}
        />
        <Ledger
          title="Today"
          emptyLabel="No local activity has been recorded today."
          rows={todayQueue}
          onOpen={onQueueItemOpen}
        />
      </section>

      <section class="cd2004-start-bottom" aria-label="Recent local information">
        <div class="cd2004-data-group">
          <div class="cd2004-data-title">
            <strong>Recent activity</strong>
            <span>browser-local</span>
          </div>
          {recentActivity.length ? (
            <ul class="cd2004-activity-list">
              {recentActivity.slice(0, 5).map((item) => (
                <li key={item.id} class={`is-${item.tone ?? "neutral"}`}>
                  <span class="cd2004-activity-time">{item.timeLabel ?? "—"}</span>
                  <span>
                    <strong>{item.label}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                  <span>{WORKFLOW_LABELS[item.workflow]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div class="cd2004-empty-row">No recent local activity.</div>
          )}
        </div>

        <div class="cd2004-data-group">
          <div class="cd2004-data-title">
            <strong>Injection record ledger</strong>
            <span>{injectionRecords.length} shown</span>
          </div>
          {injectionRecords.length ? (
            <div class="cd2004-table-wrap">
              <table class="cd2004-record-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Medication</th>
                    <th>Administered</th>
                    <th>Status</th>
                    <th>
                      <span class="cd2004-visually-hidden">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {injectionRecords.slice(0, 6).map((record) => (
                    <tr key={record.id}>
                      <td data-label="Patient">{record.patientLabel}</td>
                      <td data-label="Medication">{record.medicationLabel}</td>
                      <td data-label="Administered">{record.administeredLabel}</td>
                      <td data-label="Status">
                        <span class={`cd2004-state-text is-${record.tone ?? "neutral"}`}>
                          {record.statusLabel}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          class="cd2004-link-button"
                          disabled={!onRecordOpen}
                          onClick={() => onRecordOpen?.(record)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div class="cd2004-empty-row">
              No injection records are saved in this browser.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

interface LedgerProps {
  title: string;
  emptyLabel: string;
  rows: WorkQueueItem[];
  onOpen?: (item: WorkQueueItem) => void;
}

function Ledger({ title, emptyLabel, rows, onOpen }: LedgerProps) {
  return (
    <div class="cd2004-ledger">
      <div class="cd2004-ledger-heading">
        <strong>{title}</strong>
        <span>{rows.length}</span>
      </div>
      {rows.length ? (
        <ul>
          {rows.slice(0, 6).map((item) => (
            <li key={item.id} class={`is-${item.tone ?? "neutral"}`}>
              <button
                type="button"
                disabled={!onOpen}
                onClick={() => onOpen?.(item)}
              >
                <span class="cd2004-ledger-time">{item.timeLabel ?? "—"}</span>
                <span class="cd2004-ledger-main">
                  <strong>{item.patientLabel}</strong>
                  <small>{item.detail}</small>
                </span>
                <span class="cd2004-ledger-workflow">
                  {WORKFLOW_LABELS[item.workflow]}
                </span>
                <span class="cd2004-ledger-action">
                  {item.actionLabel ?? "Open"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div class="cd2004-empty-row">{emptyLabel}</div>
      )}
    </div>
  );
}
