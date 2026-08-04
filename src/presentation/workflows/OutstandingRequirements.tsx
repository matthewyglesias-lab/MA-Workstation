import type { ClinicalIssue } from "../../domain/contracts";

interface OutstandingRequirementsProps<Tab extends string> {
  /** The engine's blocking issues for the current encounter. */
  stops: readonly ClinicalIssue[];
  /** Maps an issue's dot-path `field` to the tab that actually edits it. */
  tabForField: (field?: string) => Tab;
  /** Display name for each tab, used as the row's "go here" label. */
  tabLabels: Record<Tab, string>;
  /** Switches the panel to the tab owning the clicked requirement. */
  onNavigate: (tab: Tab) => void;
  /** Injection keeps its detailed register on demand; other worksheets retain it open. */
  collapsible?: boolean;
}

/**
 * The list of what is still blocking completion, with each row a direct jump
 * to the tab that owns the field.
 *
 * Without this a panel reports only a count - "5 stops" - and staff have to
 * open every tab and compare against a mental list of what the engine wants.
 * That hunt is the single largest avoidable delay in a workflow that is
 * otherwise a few keystrokes long, and it gets worse the more tabs a panel
 * has. Injection carried this first; it belongs to every panel that can
 * block.
 */
export function OutstandingRequirements<Tab extends string>({
  stops,
  tabForField,
  tabLabels,
  onNavigate,
  collapsible = false,
}: OutstandingRequirementsProps<Tab>) {
  if (!stops.length) return null;
  const rows = (
    <div class="wfp-issue-list">
      {stops.map((stop) => {
        const stopTab = tabForField(stop.field);
        return (
          <button
            key={`${stop.code}-${stop.field ?? ""}`}
            type="button"
            class="wfp-issue-row"
            onClick={() => onNavigate(stopTab)}
          >
            <span class="wfp-issue-tab">{tabLabels[stopTab]}</span>
            <span class="wfp-issue-message">{stop.message}</span>
          </button>
        );
      })}
    </div>
  );

  if (!collapsible) {
    return (
      <div class="wfp-section wfp-issue-section">
        <div class="wfp-section-head">
          Outstanding requirements
          <span class="wfp-tab-badge">{stops.length}</span>
        </div>
        {rows}
      </div>
    );
  }

  return (
    <details class="wfp-section wfp-issue-section">
      <summary class="wfp-section-head">
        <span>View all outstanding requirements</span>
        <span class="wfp-tab-badge">{stops.length}</span>
      </summary>
      {rows}
    </details>
  );
}

/**
 * Per-tab stop counts, for the badge on each tab button. Keyed the same way
 * the list is, so the badge and the list can never disagree.
 */
export function countStopsByTab<Tab extends string>(
  stops: readonly ClinicalIssue[],
  tabForField: (field?: string) => Tab,
): Map<Tab, number> {
  const counts = new Map<Tab, number>();
  stops.forEach((stop) => {
    const tab = tabForField(stop.field);
    counts.set(tab, (counts.get(tab) ?? 0) + 1);
  });
  return counts;
}
