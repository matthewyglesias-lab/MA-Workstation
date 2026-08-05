import type { ClinicalIssue } from "../../domain/contracts";
import { ModalDialog } from "../ModalDialog";

interface OutstandingRequirementsProps<Tab extends string> {
  /** Whether the floating window is currently shown. */
  open: boolean;
  /** Dismisses the window without navigating anywhere. */
  onClose: () => void;
  /** The engine's blocking issues for the current encounter. */
  stops: readonly ClinicalIssue[];
  /** Maps an issue's dot-path `field` to the tab that actually edits it. */
  tabForField: (field?: string) => Tab;
  /** Display name for each tab, used as the row's "go here" label. */
  tabLabels: Record<Tab, string>;
  /** Switches the panel to the tab owning the clicked requirement. */
  onNavigate: (tab: Tab) => void;
}

/**
 * The list of what is still blocking completion, with each row a direct jump
 * to the tab that owns the field. A floating window - titlebar, close box,
 * centred over the worksheet - mirrors how MEDITECH pops a transaction's
 * outstanding items rather than burying them in the worksheet flow.
 *
 * Without this a panel reports only a count - "5 stops" - and staff have to
 * open every tab and compare against a mental list of what the engine wants.
 * That hunt is the single largest avoidable delay in a workflow that is
 * otherwise a few keystrokes long, and it gets worse the more tabs a panel
 * has. Injection carried this first; it belongs to every panel that can
 * block.
 */
export function OutstandingRequirements<Tab extends string>({
  open,
  onClose,
  stops,
  tabForField,
  tabLabels,
  onNavigate,
}: OutstandingRequirementsProps<Tab>) {
  if (!open || !stops.length) return null;

  const navigate = (tab: Tab) => {
    onNavigate(tab);
    onClose();
  };

  // The engine pushes stops in whatever order it happens to evaluate them,
  // not in tab order - left as-is, the list bounces staff between tabs
  // instead of letting them clear one tab before moving to the next. Sort by
  // each row's tab position (a stable sort, so stops sharing a tab keep the
  // engine's original relative order) purely for display; nothing about
  // which stops exist or what they mean changes.
  const tabOrder = Object.keys(tabLabels) as Tab[];
  const orderedStops = [...stops].sort(
    (a, b) => tabOrder.indexOf(tabForField(a.field)) - tabOrder.indexOf(tabForField(b.field)),
  );

  return (
    <ModalDialog
      class="cd2004-dialog-layer cd2004-dialog cd2004-outstanding-requirements-dialog"
      labelledBy="cd2004-outstanding-requirements-title"
      onDismiss={onClose}
    >
      <div class="cd2004-dialog-frame">
        <div class="cd2004-dialog-titlebar">
          <span id="cd2004-outstanding-requirements-title">Outstanding requirements</span>
          <button
            type="button"
            aria-label="Close outstanding requirements"
            onClick={onClose}
          >
            X
          </button>
        </div>
        <div class="cd2004-dialog-body">
          <div class="wfp-issue-list">
            {orderedStops.map((stop) => {
              const stopTab = tabForField(stop.field);
              return (
                <button
                  key={`${stop.code}-${stop.field ?? ""}`}
                  type="button"
                  class="wfp-issue-row"
                  onClick={() => navigate(stopTab)}
                >
                  <span class="wfp-issue-tab">{tabLabels[stopTab]}</span>
                  <span class="wfp-issue-message">{stop.message}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ModalDialog>
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
