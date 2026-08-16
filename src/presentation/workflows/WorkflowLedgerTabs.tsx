import type { WorkflowLedgerState } from "../../application/workstation-projection";

const LEDGER_STATE_LABEL: Record<WorkflowLedgerState, string> = {
  pending: "PEND",
  entry: "ENTRY",
  complete: "OK",
  review: "REV",
  stop: "STOP",
  locked: "LOCK",
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
 * A single control serves as both worksheet navigation and transaction ledger.
 * This avoids a duplicate modern stepper while giving each MEDITECH-style page
 * a concise, evaluator-derived state stamp.
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
            ? `${tab.stopCount} STOP`
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
            <span class="wfp-ledger-sequence" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span class="wfp-ledger-label">{tab.label}</span>
            <span id={stateId} class={`wfp-ledger-state is-${tab.state}`}>
              {stateLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
