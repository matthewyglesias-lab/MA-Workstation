import { DialogHeading } from "../lightfully/DialogHeading";
import type { ClinicalIssue } from "../../domain/contracts";
import { ModalDialog } from "../ModalDialog";
import { CHECKLIST } from "../vocabulary";

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
 * to the tab that owns the field. A focused dialog keeps that checklist near
 * the worksheet without burying it in the form flow.
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

  const navigate = (tab: Tab, field?: string) => {
    onNavigate(tab);
    onClose();
    // The native dialog first restores its trigger; then move to the actual
    // visible answer after the target section has rendered. Never fill a value.
    if (field) requestAnimationFrame(() => requestAnimationFrame(() => {
      const candidates = document.querySelectorAll<HTMLElement>(".wfp-panel [data-field-path]");
      const target = Array.from(candidates).find(node => node.dataset.fieldPath === field && node.getClientRects().length > 0);
      const control = target?.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)");
      if (control) { control.scrollIntoView({ block: "center", behavior: "auto" }); control.focus({ preventScroll: true }); }
    }));
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
        <DialogHeading id="cd2004-outstanding-requirements-title" title={CHECKLIST.title}
          description="Choose an item to return to its section. Required checks remain in place before you finish."
          closeLabel={`Close ${CHECKLIST.title}`} onClose={onClose} />
        <div class="cd2004-dialog-body lf-requirements-body">
          {tabOrder.map(tab => {
            const items = orderedStops.filter(stop => tabForField(stop.field) === tab);
            if (!items.length) return null;
            return <section class="lf-requirements-group" key={tab} aria-label={tabLabels[tab]}>
              <h3>{tabLabels[tab]}<span>{items.length}</span></h3>
              <div class="wfp-issue-list">
                {items.map(stop => <button key={`${stop.code}-${stop.field ?? ""}`} type="button" class="wfp-issue-row" onClick={() => navigate(tab, stop.field)}>
                  <span class="wfp-issue-tab lf-sr-only">{tabLabels[tab]}</span>
                  <span class="wfp-issue-message">{stop.message}</span>
                  <span class="lf-issue-arrow" aria-hidden="true">→</span>
                </button>)}
              </div>
            </section>;
          })}
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
