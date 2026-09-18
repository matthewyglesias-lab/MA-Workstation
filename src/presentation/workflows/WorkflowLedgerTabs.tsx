import type { WorkflowLedgerState } from "../../application/workstation-projection";

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
  const activateAndFocus = (index: number) => {
    const normalized = (index + tabs.length) % tabs.length;
    const next = tabs[normalized];
    if (!next) return;
    onChange(next.key);
    globalThis.requestAnimationFrame(() => {
      document.getElementById(workflowLedgerTabId(idPrefix, next.key))?.focus({
        preventScroll: true,
      });
    });
  };

  return (
    <div class="wfp-tabbar wfp-ledger-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
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
            onKeyDown={(event) => {
              switch (event.key) {
                case "ArrowRight":
                case "ArrowDown":
                  event.preventDefault();
                  activateAndFocus(index + 1);
                  break;
                case "ArrowLeft":
                case "ArrowUp":
                  event.preventDefault();
                  activateAndFocus(index - 1);
                  break;
                case "Home":
                  event.preventDefault();
                  activateAndFocus(0);
                  break;
                case "End":
                  event.preventDefault();
                  activateAndFocus(tabs.length - 1);
                  break;
                default:
                  break;
              }
            }}
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
    </div>
  );
}
