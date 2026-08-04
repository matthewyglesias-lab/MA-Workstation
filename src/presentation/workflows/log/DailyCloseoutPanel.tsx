import { useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  ACTIVITY_LOG_FILTERS,
  activityLogStats,
  activityLogTypeLabel,
  activityLogStatusLabel,
  filterActivityLog,
  needsReviewEntries,
  readTodayActivityLog,
  type ActivityLogFilter,
} from "../../../domain/activity-log";
import { clickLegacyControl } from "../legacy-mirror";

declare global {
  interface Window {
    ipmgDeleteLogEntry?: (index: number) => void;
  }
}

const KPI_LABELS: ReadonlyArray<{ key: keyof ReturnType<typeof activityLogStats>; label: string }> = [
  { key: "total", label: "Total" },
  { key: "injection", label: "Injections" },
  { key: "uds", label: "UDS" },
  { key: "sample", label: "Samples" },
  { key: "forms", label: "Forms" },
  { key: "completed", label: "Completed" },
  { key: "review", label: "Needs review" },
];

/**
 * Daily Closeout has no encounter and no domain engine - it's a read-only
 * dashboard over the activity log every other workflow's "Add to log"
 * action writes to localStorage. Re-reads that log on every render (main.tsx
 * already re-renders on its own refresh cadence, so this stays live as
 * other workflows log entries) rather than mirroring typed state anywhere -
 * there's nothing this panel itself needs to write except deleting a row,
 * which goes through window.ipmgDeleteLogEntry. Legacy's print renderer
 * (renderDailySheet/#dailySheet) reads the same in-memory LOG array
 * directly and is entirely decoupled from whether this panel is mounted.
 */
export function DailyCloseoutPanel() {
  const [filter, setFilter] = useState<ActivityLogFilter>("all");
  // Forces an immediate re-render after a delete (the log itself is
  // re-read fresh on every render below, not cached, so this component
  // also stays live as other workflows log new entries on the app's own
  // refresh cadence).
  const [, forceRerender] = useState(0);

  const entries = readTodayActivityLog();
  const stats = activityLogStats(entries);
  const review = needsReviewEntries(entries);
  const visibleRows = filterActivityLog(entries, filter).map((entry) => ({
    entry,
    index: entries.indexOf(entry),
  }));

  const deleteRow = (index: number) => {
    window.ipmgDeleteLogEntry?.(index);
    forceRerender((value) => value + 1);
  };

  return (
    <div class="wfp-panel cd2004-print-exclude" tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>Daily Closeout</strong>
        <span class="wfp-status-flag is-idle">{stats.total} logged today</span>
        <span class="wfp-summary-spacer" />
        <button type="button" class="cd2004-link-button" onClick={() => clickLegacyControl("copyDailySummary")}>
          Copy summary
        </button>
        <button type="button" class="cd2004-link-button" onClick={() => clickLegacyControl("exportDailyCsv")}>
          Export CSV
        </button>
        <button type="button" class="cd2004-command-button" onClick={() => clickLegacyControl("printDailyLog")}>
          Print daily log
        </button>
        <button type="button" class="cd2004-command-button" onClick={() => clickLegacyControl("saveDailyPdf")}>
          Save closeout PDF
        </button>
      </div>

      <div class="wfp-section">
        <div class="wfp-section-head">Today's summary</div>
        <div class="wfp-section-body">
          <div class="wfp-kpi-row">
            {KPI_LABELS.map((item) => (
              <div key={item.key}>
                <div class="wfp-kpi-value">{stats[item.key]}</div>
                <div class="wfp-kpi-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div class="wfp-section">
        <div class="wfp-section-head">
          Needs-review queue
          <span class="wfp-group-action">{review.length} item{review.length === 1 ? "" : "s"}</span>
        </div>
        <div class="wfp-section-body">
          {review.length ? (
            <div class="wfp-option-list">
              {review.map((entry) => (
                <div key={entry.index} class="wfp-option-row" style="cursor:default">
                  <span />
                  <span>
                    <span class="wfp-option-title">
                      {activityLogTypeLabel(entry.type)} · {entry.time ?? "—"}
                    </span>
                    <div class="wfp-option-desc">
                      {entry.pt ?? "—"} · {entry.summary ?? "—"}
                    </div>
                    <div class="wfp-option-desc">{[entry.details, entry.follow].filter(Boolean).join(" · ") || "—"}</div>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p class="wfp-field-hint">No needs-review items logged.</p>
          )}
        </div>
      </div>

      <div class="wfp-section">
        <div class="wfp-section-head">Today's activity</div>
        <div class="wfp-section-body">
          <div class="wfp-tabbar" role="tablist">
            {ACTIVITY_LOG_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                class="wfp-tab"
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {visibleRows.length ? (
            <div class="wfp-table-wrap">
              <table class="wfp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Patient</th>
                    <th>Summary</th>
                    <th>Details</th>
                    <th>Traceability</th>
                    <th>Follow-up</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ entry, index }, rowIndex) => (
                    <tr key={index}>
                      <td>{rowIndex + 1}</td>
                      <td>{entry.time ?? "—"}</td>
                      <td>{activityLogTypeLabel(entry.type)}</td>
                      <td>{activityLogStatusLabel(entry.status)}</td>
                      <td>{entry.pt ?? "—"}</td>
                      <td>{entry.summary ?? "—"}</td>
                      <td>{entry.details ?? "—"}</td>
                      <td>{entry.trace ?? "—"}</td>
                      <td>{entry.follow ?? "—"}</td>
                      <td>{entry.by ?? "—"}</td>
                      <td>
                        <button
                          type="button"
                          class="wfp-table-delete"
                          aria-label="Delete entry"
                          onClick={() => deleteRow(index)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div class="wfp-wall">
              <div class="wfp-wall-title">
                {entries.length ? "No activity matches this filter." : "No activity logged yet."}
              </div>
              <p>Log an entry from another workflow to populate this view.</p>
            </div>
          )}

          <button type="button" class="cd2004-link-button" onClick={() => clickLegacyControl("clearLog")}>
            Clear log
          </button>
        </div>
      </div>
    </div>
  );
}
