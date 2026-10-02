import type { WorkflowLedgerState } from "../../application/workstation-projection";
import { WorkflowTabList } from "./WorkflowTabList";

const LEDGER_STATE_LABEL: Record<WorkflowLedgerState, string> = {
  pending: "Not started",
  entry: "In progress",
  complete: "Complete",
  review: "Review",
  stop: "Required",
  locked: "Signed",
};

export interface WorkflowLedgerTab<Tab extends string> {
  key: Tab;
  label: string;
  state: WorkflowLedgerState;
  stopCount?: number;
  detail?: string;
}

export const workflowLedgerTabId = (idPrefix: string, tab: string) =>
  `${idPrefix}-tab-${tab}`;

export const workflowLedgerPanelId = (idPrefix: string, tab: string) =>
  `${idPrefix}-panel-${tab}`;

/**
 * Direct, non-sequential section navigation. Quiet counts are accompanied by
 * full evaluator-derived accessible state descriptions; no signing gate changes.
 */
export function WorkflowLedgerTabs<Tab extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  idPrefix,
}: {
  tabs: ReadonlyArray<WorkflowLedgerTab<Tab>>;
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  ariaLabel: string;
  idPrefix: string;
}) {
  return (
    <WorkflowTabList label={ariaLabel}>
      {tabs.map((tab) => {
        const tabId = workflowLedgerTabId(idPrefix, tab.key);
        const stateId = `${tabId}-state`;
        const stateLabel =
          tab.state === "stop" && tab.stopCount
            ? `${tab.stopCount} required`
            : LEDGER_STATE_LABEL[tab.state];
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={tabId}
            class={`wfp-tab is-${tab.state}`}
            aria-selected={activeTab === tab.key}
            aria-controls={workflowLedgerPanelId(idPrefix, tab.key)}
            aria-label={tab.label}
            aria-describedby={stateId}
            tabIndex={activeTab === tab.key ? 0 : -1}
            title={tab.detail}
            onClick={() => onChange(tab.key)}
          >
            <span class="wfp-ledger-label">{tab.label}</span>
            <span id={stateId} class={`wfp-ledger-state is-${tab.state}`} title={stateLabel}>
              <span class="lf-sr-only">{stateLabel}</span>
              {tab.stopCount ? <span class="lf-tab-count" aria-hidden="true">{tab.stopCount}</span> :
                tab.state === "complete" || tab.state === "locked" ? <span class="lf-tab-complete" aria-hidden="true">✓</span> : null}
            </span>
          </button>
        );
      })}
    </WorkflowTabList>
  );
}
