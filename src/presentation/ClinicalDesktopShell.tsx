import type { ComponentChildren, TargetedMouseEvent } from "preact";
import { createContext } from "preact";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import "./clinical-desktop.css";
import { Panel } from "./Panel";
import { DesktopIcon } from "./DesktopIcon";
import { LegacyWorkflowHost } from "./LegacyWorkflowHost";
import { NoteInspector } from "./NoteInspector";
import { StartCenter } from "./StartCenter";
import {
  WORKFLOW_LABELS,
  WORKFLOW_ORDER,
  LOCKED_RECORD_ACTION_SELECTOR,
  type ClinicalDesktopShellProps,
  type DesktopPane,
  type PatientContext,
  type WorkflowId,
} from "./types";

/** Menu bar order, with the Alt access key for each. */
const MENU_IDS: string[] = ["file", "chart", "workflows", "tools", "help"];
const MENU_MNEMONICS: Record<string, string> = {
  f: "file",
  c: "chart",
  w: "workflows",
  t: "tools",
  h: "help",
};

const shortcutWorkflows: WorkflowId[] = [
  "home",
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
];

function normalizedPatientValue(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function contextsMismatch(
  activePatient: PatientContext,
  workflowPatient?: PatientContext,
) {
  if (!workflowPatient) return false;
  const activeName = normalizedPatientValue(activePatient.name);
  const workflowName = normalizedPatientValue(workflowPatient.name);
  const activeDob = normalizedPatientValue(activePatient.dob);
  const workflowDob = normalizedPatientValue(workflowPatient.dob);
  return Boolean(
    (activeName && workflowName && activeName !== workflowName) ||
      (activeDob && workflowDob && activeDob !== workflowDob),
  );
}

export function ClinicalDesktopShell({
  appName = "IPMG Clinical Workstation",
  organizationName = "Integrated Psychiatric Medical Group",
  versionLabel = "Clinical Desktop 2004",
  activeWorkflow,
  defaultActiveWorkflow = "home",
  onWorkflowChange,
  patient = {},
  workflowPatient,
  onUseWorkflowPatient,
  staffLabel = "Not signed in",
  locationLabel = "Clinic not selected",
  localStorageAvailable = true,
  workflowSummaries = {},
  needsReview = [],
  todayQueue = [],
  recentActivity = [],
  injectionRecords = [],
  readiness = [],
  noteSections = [],
  noteTitle,
  noteSubtitle,
  workflowSlots = {},
  legacyPanels = {},
  renderWorkflow,
  toolbarActions = [],
  postState = "idle",
  postMessage,
  canComplete = false,
  canReview = false,
  reviewActionMode = "complete",
  statusMessage,
  onSaveDraft,
  onReviewComplete,
  onOpenRecords,
  onOpenKnowledge,
  onOpenCloseout,
  onCopyNoteSection,
  onCopyAllNotes,
  onQueueItemOpen,
  onRecordOpen,
  onEscape,
  onWorkAreaReady,
  className = "",
}: ClinicalDesktopShellProps) {
  const [internalWorkflow, setInternalWorkflow] =
    useState<WorkflowId>(defaultActiveWorkflow);
  const [focusedPane, setFocusedPane] = useState<DesktopPane>("work");
  const [mobilePane, setMobilePane] = useState<DesktopPane>("work");
  const [internalStatus, setInternalStatus] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const workHostRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const selectedWorkflow = activeWorkflow ?? internalWorkflow;
  const previousWorkflowRef = useRef<WorkflowId>(selectedWorkflow);
  const workflowScrollPositionsRef = useRef<
    Partial<Record<WorkflowId, number>>
  >({});
  const capturedScrollWorkflowRef = useRef<WorkflowId | null>(null);
  const isMismatch = contextsMismatch(patient, workflowPatient);
  const effectiveStatus =
    internalStatus ?? statusMessage ?? "Ready. Select a workflow to begin.";

  const openWorkflow = (workflow: WorkflowId) => {
    const scrollBody = shellRef.current?.querySelector<HTMLElement>(
      ".cd2004-work-window .cd2004-window-body",
    );
    if (scrollBody && workflow !== selectedWorkflow) {
      workflowScrollPositionsRef.current[selectedWorkflow] =
        scrollBody.scrollTop;
      capturedScrollWorkflowRef.current = selectedWorkflow;
    }
    if (activeWorkflow === undefined) setInternalWorkflow(workflow);
    onWorkflowChange?.(workflow);
    setMobilePane("work");
    setInternalStatus(`${WORKFLOW_LABELS[workflow]} opened.`);
  };

  const focusInspector = () => {
    previousFocusRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    setFocusedPane("inspector");
    setMobilePane("inspector");
    globalThis.setTimeout(() => {
      const inspectorWindow = shellRef.current?.querySelector<HTMLElement>(
        ".cd2004-inspector-window",
      );
      const focusTarget =
        inspectorWindow?.querySelector<HTMLElement>(
          "button:not([disabled]), [tabindex='0']",
        ) ?? inspectorWindow;
      focusTarget?.focus();
    }, 0);
  };

  const restorePreviousFocus = () => {
    globalThis.setTimeout(() => previousFocusRef.current?.focus(), 0);
  };

  useEffect(() => {
    onWorkAreaReady?.(workHostRef.current);
    return () => onWorkAreaReady?.(null);
  }, [onWorkAreaReady]);

  useEffect(() => {
    // Command feedback takes precedence long enough to be announced. A later
    // workflow or persistence transition restores the authoritative legacy
    // status, including storage-write failures.
    setInternalStatus(null);
  }, [postState, selectedWorkflow, statusMessage]);

  // The keyboard-reference dialog is a native <dialog> opened with showModal(),
  // so the platform supplies the focus trap, Escape handling, focus
  // restoration, and inerting of the rest of the shell. The hand-rolled
  // sibling-isolation effect and Tab trap that used to live here are gone.

  useLayoutEffect(() => {
    const scrollBody = shellRef.current?.querySelector<HTMLElement>(
      ".cd2004-work-window .cd2004-window-body",
    );
    if (!scrollBody) return;

    const previousWorkflow = previousWorkflowRef.current;
    if (previousWorkflow === selectedWorkflow) return;

    if (capturedScrollWorkflowRef.current !== previousWorkflow) {
      workflowScrollPositionsRef.current[previousWorkflow] =
        scrollBody.scrollTop;
    }
    capturedScrollWorkflowRef.current = null;
    previousWorkflowRef.current = selectedWorkflow;
    const restoredScroll =
      workflowScrollPositionsRef.current[selectedWorkflow] ?? 0;
    scrollBody.scrollTop = restoredScroll;

    // The legacy panel is moved into the host during the same commit. Reapply
    // once after layout so late intrinsic sizing cannot carry the prior
    // workflow's scroll position into the newly opened worksheet.
    const frame = globalThis.requestAnimationFrame(() => {
      scrollBody.scrollTop = restoredScroll;
      scrollBody.scrollLeft = 0;
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [selectedWorkflow]);

  useEffect(() => {
    if (postState !== "posted") return;

    let settled = false;
    const timers: Array<ReturnType<typeof globalThis.setTimeout>> = [];
    const focusLockedRecord = () => {
      if (settled) return;
      const completionOverlay = document.getElementById("injCompletionOverlay");
      if (
        completionOverlay &&
        !completionOverlay.hidden &&
        globalThis.getComputedStyle(completionOverlay).display !== "none"
      ) {
        return;
      }
      const lockedAction = workHostRef.current?.querySelector<HTMLElement>(
        LOCKED_RECORD_ACTION_SELECTOR,
      );
      const postedStatus = shellRef.current?.querySelector<HTMLElement>(
        ".cd2004-post-stamp",
      );
      const focusTarget = lockedAction ?? postedStatus;
      if (!focusTarget) return;
      focusTarget.focus({ preventScroll: true });
      settled =
        focusTarget === document.activeElement ||
        Boolean(
          document.activeElement?.closest(
            `${LOCKED_RECORD_ACTION_SELECTOR}, .cd2004-post-stamp`,
          ),
        );
    };

    const scheduleFocus = (delay: number) => {
      timers.push(
        globalThis.setTimeout(() => {
          globalThis.requestAnimationFrame(focusLockedRecord);
        }, delay),
      );
    };

    const observer = new MutationObserver(() => scheduleFocus(0));
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style", "aria-hidden"],
    });
    [0, 120, 300, 700, 1400].forEach(scheduleFocus);

    return () => {
      settled = true;
      observer.disconnect();
      timers.forEach((timer) => globalThis.clearTimeout(timer));
    };
  }, [postState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const eventTarget = event.target as HTMLElement | null;
      const modalOwnsKeyboard = Boolean(
        showShortcutHelp ||
          shellRef.current?.inert ||
          eventTarget?.closest('[aria-modal="true"]'),
      );
      if (modalOwnsKeyboard) {
        if (!(showShortcutHelp && event.key === "Escape")) return;
      }
      if (
        eventTarget?.closest(".cd2004-dialog-layer") &&
        event.key !== "Escape"
      ) {
        return;
      }
      const key = event.key.toLocaleLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (onSaveDraft) {
          onSaveDraft();
          setInternalStatus("Draft save requested.");
        } else {
          setInternalStatus("Draft saving is unavailable in this workflow.");
        }
        return;
      }

      if (event.altKey && /^[1-7]$/.test(event.key)) {
        event.preventDefault();
        const workflow = shortcutWorkflows[Number(event.key) - 1];
        if (workflow) openWorkflow(workflow);
        return;
      }

      // Alt+access key opens the matching menu, as a native menu bar does.
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const target = MENU_MNEMONICS[key];
        if (target) {
          event.preventDefault();
          setOpenMenu(target);
          globalThis.setTimeout(() => {
            shellRef.current
              ?.querySelector<HTMLElement>(
                `.cd2004-menu[data-menu="${target}"] .cd2004-menu-title`,
              )
              ?.focus({ preventScroll: true });
          }, 0);
          return;
        }
      }

      if (event.key === "F6") {
        event.preventDefault();
        if (onOpenRecords) {
          onOpenRecords();
          setInternalStatus("Injection records opened.");
        } else {
          setInternalStatus("Injection records are unavailable.");
        }
        return;
      }

      if (event.key === "F8") {
        event.preventDefault();
        focusInspector();
        setInternalStatus("Note and readiness window focused.");
        return;
      }

      if (event.key === "F10") {
        event.preventDefault();
        if (
          (canComplete || canReview) &&
          postState !== "posting" &&
          onReviewComplete
        ) {
          onReviewComplete();
          setInternalStatus(
            reviewActionMode === "review"
              ? "Current note and readiness focused for review."
              : "Record validation requested.",
          );
        } else {
          setInternalStatus(
            reviewActionMode === "review"
              ? "Review is unavailable in this workflow."
              : "Record is not ready to complete.",
          );
        }
        return;
      }

      if (event.key === "Escape") {
        // An open menu consumes Escape first and returns focus to its title,
        // without disturbing the shell-level Escape handling below it.
        if (openMenu) {
          event.preventDefault();
          const id = openMenu;
          setOpenMenu(null);
          globalThis.setTimeout(() => {
            shellRef.current
              ?.querySelector<HTMLElement>(
                `.cd2004-menu[data-menu="${id}"] .cd2004-menu-title`,
              )
              ?.focus({ preventScroll: true });
          }, 0);
          return;
        }
        if (showShortcutHelp) {
          event.preventDefault();
          setShowShortcutHelp(false);
          restorePreviousFocus();
        } else {
          onEscape?.();
          restorePreviousFocus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canComplete,
    canReview,
    onOpenRecords,
    onReviewComplete,
    onSaveDraft,
    postState,
    reviewActionMode,
    selectedWorkflow,
    showShortcutHelp,
    openMenu,
  ]);

  // Clicking anywhere outside the menu bar dismisses an open menu, without
  // stealing focus - matching native menu behavior.
  useEffect(() => {
    if (!openMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !(target as Element).closest?.(".cd2004-menu")) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [openMenu]);

  const menuBar: MenuBarContextValue = {
    openMenu,
    open: (id) => setOpenMenu(id),
    close: (restoreFocus = false) => {
      const id = openMenu;
      setOpenMenu(null);
      if (restoreFocus && id) {
        globalThis.setTimeout(() => {
          shellRef.current
            ?.querySelector<HTMLElement>(
              `.cd2004-menu[data-menu="${id}"] .cd2004-menu-title`,
            )
            ?.focus({ preventScroll: true });
        }, 0);
      }
    },
    moveMenu: (from, direction) => {
      const index = MENU_IDS.indexOf(from);
      if (index < 0) return;
      const next =
        MENU_IDS[(index + direction + MENU_IDS.length) % MENU_IDS.length]!;
      setOpenMenu(next);
      globalThis.setTimeout(() => {
        shellRef.current
          ?.querySelector<HTMLElement>(
            `.cd2004-menu[data-menu="${next}"] .cd2004-menu-title`,
          )
          ?.focus({ preventScroll: true });
      }, 0);
    },
  };

  const windowTitle =
    selectedWorkflow === "home"
      ? "Start Center"
      : `${WORKFLOW_LABELS[selectedWorkflow]} Worksheet`;

  const workflowContent = renderWorkflowContent({
    workflow: selectedWorkflow,
    patient,
    isMismatch,
    renderWorkflow,
    workflowSlots,
    legacyPanels,
    workHostRef,
    summaries: workflowSummaries,
    needsReview,
    todayQueue,
    recentActivity,
    injectionRecords,
    onWorkflowOpen: openWorkflow,
    onQueueItemOpen,
    onRecordOpen,
  });

  return (
    <div
      ref={shellRef}
      class={`cd2004-shell ${className}`.trim()}
      data-active-workflow={selectedWorkflow}
      data-post-state={postState}
    >
      <a class="cd2004-skip-link" href="#cd2004-work-area">
        Skip to active workflow
      </a>

      <header class="cd2004-application-header cd2004-print-exclude">
        <div class="cd2004-app-titlebar">
          <span class="cd2004-app-logo" aria-hidden="true">
            <DesktopIcon name="administer" />
          </span>
          <span class="cd2004-app-title">
            {appName} — {versionLabel}
          </span>
          <span class="cd2004-app-environment">LOCAL WORKSTATION</span>
        </div>

        <nav
          class="cd2004-menu-bar"
          role="menubar"
          aria-label="Application menu"
        >
          <MenuBarContext.Provider value={menuBar}>
          <DesktopMenu id="file" label="File" mnemonic="F">
            <MenuCommand
              label="Save Draft"
              shortcut="Ctrl+S"
              disabled={!onSaveDraft}
              onInvoke={onSaveDraft}
            />
            <MenuCommand
              label="Open Injection Records"
              shortcut="F6"
              disabled={!onOpenRecords}
              onInvoke={onOpenRecords}
            />
          </DesktopMenu>
          <DesktopMenu id="chart" label="Chart" mnemonic="C">
            <MenuCommand
              label="Use Workflow Patient"
              disabled={!isMismatch || !onUseWorkflowPatient}
              onInvoke={() => onUseWorkflowPatient?.(selectedWorkflow)}
            />
            <MenuCommand
              label="Injection Records"
              shortcut="F6"
              disabled={!onOpenRecords}
              onInvoke={onOpenRecords}
            />
          </DesktopMenu>
          <DesktopMenu id="workflows" label="Workflows" mnemonic="W">
            {shortcutWorkflows.map((workflow, index) => (
              <MenuCommand
                key={workflow}
                label={WORKFLOW_LABELS[workflow]}
                shortcut={`Alt+${index + 1}`}
                onInvoke={() => openWorkflow(workflow)}
              />
            ))}
          </DesktopMenu>
          <DesktopMenu id="tools" label="Tools" mnemonic="T">
            <MenuCommand
              label="Knowledge Base"
              disabled={!onOpenKnowledge}
              onInvoke={onOpenKnowledge}
            />
            <MenuCommand
              label="Daily Closeout"
              disabled={!onOpenCloseout}
              onInvoke={onOpenCloseout}
            />
          </DesktopMenu>
          <DesktopMenu id="help" label="Help" mnemonic="H">
            <MenuCommand
              label="Keyboard Reference"
              onInvoke={(returnFocus) => {
                previousFocusRef.current =
                  returnFocus ??
                  (document.activeElement as HTMLElement | null);
                setShowShortcutHelp(true);
              }}
            />
          </DesktopMenu>
          </MenuBarContext.Provider>
        </nav>

        <div class="cd2004-toolbar" role="toolbar" aria-label="Clinical commands">
          <ToolbarButton
            label="Save Draft"
            shortLabel="Save"
            shortcut="Ctrl+S"
            icon="save"
            disabled={!onSaveDraft}
            onClick={onSaveDraft}
          />
          <ToolbarButton
            label="Injection Records"
            shortLabel="Records"
            shortcut="F6"
            icon="records"
            disabled={!onOpenRecords}
            onClick={onOpenRecords}
          />
          <ToolbarButton
            label="Note / Readiness"
            shortLabel="Note"
            shortcut="F8"
            icon="note"
            onClick={focusInspector}
          />
          <span class="cd2004-toolbar-separator" aria-hidden="true" />
          {toolbarActions.map((action) => (
            <button
              key={action.id}
              type="button"
              class={`cd2004-toolbar-button ${action.pressed ? "is-pressed" : ""}`}
              aria-label={action.label}
              aria-pressed={action.pressed}
              title={
                action.shortcut
                  ? `${action.label} (${action.shortcut})`
                  : action.label
              }
              disabled={action.disabled}
              onClick={action.onInvoke}
            >
              <span class="cd2004-toolbar-glyph" aria-hidden="true">
                <DesktopIcon name={action.icon} />
              </span>
              <span>{action.shortLabel ?? action.label}</span>
            </button>
          ))}
        </div>

        <PatientBanner
          patient={patient}
          workflowPatient={workflowPatient}
          mismatch={isMismatch}
          selectedWorkflow={selectedWorkflow}
          staffLabel={staffLabel}
          locationLabel={locationLabel}
          onUseWorkflowPatient={onUseWorkflowPatient}
        />
      </header>

      <div
        class="cd2004-mobile-switcher cd2004-print-exclude"
        role="tablist"
        aria-label="Desktop section switcher"
      >
        {(["work", "inspector"] as DesktopPane[]).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            id={`cd2004-pane-tab-${pane}`}
            aria-controls={`cd2004-pane-${pane}`}
            aria-selected={mobilePane === pane}
            tabIndex={mobilePane === pane ? 0 : -1}
            class={mobilePane === pane ? "is-active" : ""}
            onClick={() => {
              setMobilePane(pane);
              setFocusedPane(pane);
            }}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "Home" &&
                event.key !== "End"
              ) {
                return;
              }
              event.preventDefault();
              const panes = ["work", "inspector"] as DesktopPane[];
              const current = panes.indexOf(pane);
              const next: DesktopPane =
                event.key === "Home"
                  ? panes[0]!
                  : event.key === "End"
                    ? panes[panes.length - 1]!
                    : panes[
                        (current +
                          (event.key === "ArrowLeft" ? -1 : 1) +
                          panes.length) %
                          panes.length
                      ]!;
              setMobilePane(next);
              globalThis.setTimeout(() => {
                shellRef.current
                  ?.querySelector<HTMLElement>(
                    `#cd2004-pane-tab-${next}`,
                  )
                  ?.focus();
              }, 0);
            }}
          >
            {pane === "work" ? "WORK" : "NOTE"}
          </button>
        ))}
      </div>

      <main
        class="cd2004-workspace"
        id="cd2004-work-area"
        data-mobile-pane={mobilePane}
      >
        <Panel
          pane="work"
          title={windowTitle}
          subtitle={
            selectedWorkflow === "home" ? "Local workstation overview" : "Active encounter"
          }
          active={focusedPane === "work"}
          mobileActive={mobilePane === "work"}
          onActivate={setFocusedPane}
          toolbar={
            selectedWorkflow !== "home" ? (
              <div class="cd2004-work-context-strip">
                <span>
                  <strong>Module:</strong> {WORKFLOW_LABELS[selectedWorkflow]}
                </span>
                <span>
                  <strong>State:</strong>{" "}
                  {postState === "posted"
                    ? "Locked"
                    : workflowSummaries[selectedWorkflow]?.state ?? "Draft"}
                </span>
                {isMismatch && <span class="is-warning">Patient mismatch</span>}
              </div>
            ) : undefined
          }
        >
          <div
            ref={workHostRef}
            class="cd2004-workflow-slot"
            data-workflow={selectedWorkflow}
            data-post-state={postState}
          >
            {postState === "posting" && (
              <div class="cd2004-posting-strip" role="status">
                <span aria-hidden="true" />
                Validating required fields and writing permanent record…
              </div>
            )}
            {postState === "posted" && selectedWorkflow === "administer" && (
              <div class="cd2004-work-locked-banner" role="status">
                <DesktopIcon name="check" />
                <strong>INJECTION POSTED · RECORD LOCKED</strong>
                <span>Read-only actions and addenda remain available.</span>
              </div>
            )}
            {workflowContent}
          </div>
        </Panel>

        <Panel
          pane="inspector"
          title="Note / Readiness"
          subtitle={WORKFLOW_LABELS[selectedWorkflow]}
          active={focusedPane === "inspector"}
          mobileActive={mobilePane === "inspector"}
          onActivate={setFocusedPane}
        >
          <NoteInspector
            title={noteTitle ?? `${WORKFLOW_LABELS[selectedWorkflow]} note`}
            subtitle={noteSubtitle}
            readiness={readiness}
            sections={noteSections}
            postState={postState}
            postMessage={postMessage}
            canComplete={canComplete && Boolean(onReviewComplete)}
            canReview={canReview && Boolean(onReviewComplete)}
            actionMode={reviewActionMode}
            onCopySection={onCopyNoteSection}
            onCopyAll={onCopyAllNotes}
            onComplete={onReviewComplete}
          />
        </Panel>
      </main>

      {/*
        Workflow tab strip along the bottom edge - the VistA/CPRS signature.
        This IS the navigator, relocated: it keeps the `.cd2004-navigator`
        landmark and the `.cd2004-nav-item[title]` handles the whole test suite
        navigates by, while freeing the entire left edge for clinical content.
      */}
      <nav
        class="cd2004-navigator cd2004-print-exclude"
        aria-label="Clinical modules"
      >
        {WORKFLOW_ORDER.map((workflow) => {
          const summary = workflowSummaries[workflow];
          const accelerator = shortcutWorkflows.indexOf(workflow) + 1;
          return (
            <button
              key={workflow}
              type="button"
              class={[
                "cd2004-nav-item",
                selectedWorkflow === workflow ? "is-selected" : "",
                `is-${summary?.state ?? "idle"}`,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={selectedWorkflow === workflow ? "page" : undefined}
              title={WORKFLOW_LABELS[workflow]}
              onClick={() => openWorkflow(workflow)}
            >
              <DesktopIcon name={workflow} />
              <span>{WORKFLOW_LABELS[workflow]}</span>
              {accelerator > 0 && <kbd>{accelerator}</kbd>}
              {summary?.count ? (
                <em aria-label={`${summary.count} items`}>{summary.count}</em>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/*
        Segmented status bar. Replaces the taskbar/Start button, which emulated
        the Windows shell rather than an EHR application. `.cd2004-status-message`
        keeps its live-region contract and exact strings.
      */}
      <footer class="cd2004-statusbar cd2004-print-exclude">
        <div class="cd2004-status-message" aria-live="polite" aria-atomic="true">
          {effectiveStatus}
        </div>
        <div class="cd2004-status-segment" title="Signed-in staff">
          {staffLabel?.trim() ? staffLabel : "No staff sign-in"}
        </div>
        <div class="cd2004-status-segment" title="Visit location">
          {locationLabel?.trim() ? locationLabel : "No location"}
        </div>
        <div
          class={`cd2004-status-segment ${localStorageAvailable ? "is-online" : "is-error"}`}
          title={
            localStorageAvailable
              ? "Records save only in this browser"
              : "Browser storage is unavailable"
          }
        >
          {localStorageAvailable ? "LOCAL" : "STORAGE ERROR"}
        </div>
      </footer>

      {showShortcutHelp && (
        <ModalDialog
          class="cd2004-modal-backdrop cd2004-print-exclude"
          labelledBy="cd2004ShortcutTitle"
          onDismiss={() => {
            setShowShortcutHelp(false);
            restorePreviousFocus();
          }}
        >
          <section class="cd2004-help-dialog">
            <div class="cd2004-window-titlebar">
              <span class="cd2004-window-mark" aria-hidden="true" />
              <strong id="cd2004ShortcutTitle">Keyboard Reference</strong>
              <button
                type="button"
                class="cd2004-caption-button cd2004-caption-close"
                aria-label="Close keyboard reference"
                autoFocus
                onClick={() => {
                  setShowShortcutHelp(false);
                  restorePreviousFocus();
                }}
              >
                ×
              </button>
            </div>
            <div class="cd2004-help-body">
              <ShortcutRow keys="Ctrl+S" label="Save the current draft" />
              <ShortcutRow keys="Alt+1–7" label="Switch major modules" />
              <ShortcutRow keys="F6" label="Open injection records" />
              <ShortcutRow keys="F8" label="Focus note and readiness" />
              <ShortcutRow keys="F10" label="Review or complete" />
              <ShortcutRow keys="Esc" label="Close utility or restore focus" />
            </div>
            <footer>
              <button
                type="button"
                class="cd2004-command-button"
                onClick={() => {
                  setShowShortcutHelp(false);
                  restorePreviousFocus();
                }}
              >
                OK
              </button>
            </footer>
          </section>
        </ModalDialog>
      )}

      <span class="cd2004-visually-hidden">
        {organizationName}. {localStorageAvailable ? "Local storage available." : ""}
      </span>
    </div>
  );
}

interface RenderWorkflowOptions {
  workflow: WorkflowId;
  patient: PatientContext;
  isMismatch: boolean;
  renderWorkflow: ClinicalDesktopShellProps["renderWorkflow"];
  workflowSlots: NonNullable<ClinicalDesktopShellProps["workflowSlots"]>;
  legacyPanels: NonNullable<ClinicalDesktopShellProps["legacyPanels"]>;
  workHostRef: { current: HTMLDivElement | null };
  summaries: NonNullable<ClinicalDesktopShellProps["workflowSummaries"]>;
  needsReview: NonNullable<ClinicalDesktopShellProps["needsReview"]>;
  todayQueue: NonNullable<ClinicalDesktopShellProps["todayQueue"]>;
  recentActivity: NonNullable<ClinicalDesktopShellProps["recentActivity"]>;
  injectionRecords: NonNullable<ClinicalDesktopShellProps["injectionRecords"]>;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onQueueItemOpen?: ClinicalDesktopShellProps["onQueueItemOpen"];
  onRecordOpen?: ClinicalDesktopShellProps["onRecordOpen"];
}

function renderWorkflowContent({
  workflow,
  patient,
  isMismatch,
  renderWorkflow,
  workflowSlots,
  legacyPanels,
  workHostRef,
  summaries,
  needsReview,
  todayQueue,
  recentActivity,
  injectionRecords,
  onWorkflowOpen,
  onQueueItemOpen,
  onRecordOpen,
}: RenderWorkflowOptions): ComponentChildren {
  if (workflow === "home") {
    return (
      <StartCenter
        summaries={summaries}
        needsReview={needsReview}
        todayQueue={todayQueue}
        recentActivity={recentActivity}
        injectionRecords={injectionRecords}
        onWorkflowOpen={onWorkflowOpen}
        onQueueItemOpen={onQueueItemOpen}
        onRecordOpen={onRecordOpen}
      />
    );
  }

  if (renderWorkflow) {
    return renderWorkflow(workflow, {
      workflow,
      hostRef: workHostRef,
      patient,
      isPatientContextMismatched: isMismatch,
    });
  }

  if (workflowSlots[workflow]) return workflowSlots[workflow];

  const adapter = legacyPanels[workflow];
  if (adapter) {
    return (
      <LegacyWorkflowHost
        adapter={adapter}
        label={WORKFLOW_LABELS[workflow]}
      />
    );
  }

  return (
    <div class="cd2004-workflow-placeholder">
      <DesktopIcon name={workflow} />
      <strong>{WORKFLOW_LABELS[workflow]}</strong>
      <span>The application has not connected this workflow panel yet.</span>
      <code>workflowSlots.{workflow}</code>
    </div>
  );
}

interface PatientBannerProps {
  patient: PatientContext;
  workflowPatient?: PatientContext;
  mismatch: boolean;
  selectedWorkflow: WorkflowId;
  staffLabel: string;
  locationLabel: string;
  onUseWorkflowPatient?: (workflow: WorkflowId) => void;
}

function PatientBanner({
  patient,
  workflowPatient,
  mismatch,
  selectedWorkflow,
  staffLabel,
  locationLabel,
  onUseWorkflowPatient,
}: PatientBannerProps) {
  return (
    <div class={`cd2004-patient-banner ${mismatch ? "has-mismatch" : ""}`}>
      <div class="cd2004-patient-primary">
        <DesktopIcon name={mismatch ? "alert" : "patient"} />
        <span>
          <small>Active patient</small>
          <strong>{patient.name?.trim() || "NO PATIENT SELECTED"}</strong>
        </span>
      </div>
      <div class="cd2004-patient-field">
        <small>DOB</small>
        <strong>{patient.dob || "—"}</strong>
      </div>
      <div class="cd2004-patient-field">
        <small>MRN / ID</small>
        <strong>{patient.medicalRecordNumber || "Not entered"}</strong>
      </div>
      <div class="cd2004-patient-field cd2004-banner-location">
        <small>Clinic</small>
        <strong>{locationLabel}</strong>
      </div>
      <div class="cd2004-patient-field cd2004-banner-staff">
        <small>Staff</small>
        <strong>{staffLabel}</strong>
      </div>
      {mismatch && (
        <div class="cd2004-context-mismatch" role="status">
          <span>
            <strong>Patient context mismatch</strong>
            <small>
              This {WORKFLOW_LABELS[selectedWorkflow]} draft belongs to{" "}
              {workflowPatient?.name || "another patient"}.
            </small>
          </span>
          <button
            type="button"
            onClick={() => onUseWorkflowPatient?.(selectedWorkflow)}
          >
            Make active
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Thin wrapper over the native <dialog> element. showModal() supplies the top
 * layer, ::backdrop, Escape-to-cancel, focus trapping, focus restoration, and
 * inerting of everything behind it - replacing the hand-rolled backdrop div,
 * Tab trap, and sibling-isolation effect this shell used to carry.
 */
function ModalDialog({
  class: className,
  labelledBy,
  onDismiss,
  children,
}: {
  class?: string;
  labelledBy: string;
  onDismiss: () => void;
  children: ComponentChildren;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      class={className}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}

/**
 * Menu-tracking context. A real Windows menu bar behaves as one unit: once any
 * menu is open the bar is in "tracking mode", so simply *hovering* a sibling
 * switches to it without a second click. That requires the open state to live
 * above the individual menus, which is why it is threaded through context
 * rather than owned by each menu.
 */
interface MenuBarContextValue {
  openMenu: string | null;
  open: (id: string) => void;
  close: (restoreFocus?: boolean) => void;
  moveMenu: (from: string, direction: -1 | 1) => void;
}

const MenuBarContext = createContext<MenuBarContextValue | null>(null);

/** Provided by each menu so its items can dismiss it and restore focus. */
const MenuContext = createContext<{ dismiss: (restoreFocus?: boolean) => void } | null>(
  null,
);

/** Splits a label at its access key so the mnemonic can be underlined. */
function renderMnemonic(label: string, mnemonic: string) {
  const index = label.toLocaleLowerCase().indexOf(mnemonic.toLocaleLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <u>{label.slice(index, index + 1)}</u>
      {label.slice(index + 1)}
    </>
  );
}

interface DesktopMenuProps {
  id: string;
  label: string;
  mnemonic: string;
  children: ComponentChildren;
}

function DesktopMenu({ id, label, mnemonic, children }: DesktopMenuProps) {
  const bar = useContext(MenuBarContext);
  const titleRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const isOpen = bar?.openMenu === id;
  const isTracking = Boolean(bar?.openMenu);
  // Set when hover-tracking opened this menu, so the click that necessarily
  // follows the pointer landing here is absorbed rather than toggling it shut.
  const openedByHoverRef = useRef(false);

  useEffect(() => {
    if (!isOpen) openedByHoverRef.current = false;
  }, [isOpen]);

  const dismiss = (restoreFocus = false) => {
    bar?.close(false);
    if (restoreFocus) titleRef.current?.focus({ preventScroll: true });
  };

  // Opening by keyboard puts focus on the first command, matching Windows.
  useEffect(() => {
    if (!isOpen) return;
    const frame = globalThis.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active === titleRef.current) return;
      if (popupRef.current?.contains(active)) return;
    });
    return () => globalThis.cancelAnimationFrame(frame);
  }, [isOpen]);

  const focusCommand = (offset: number, absolute?: "first" | "last") => {
    const commands = Array.from(
      popupRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (commands.length === 0) return;
    const current = commands.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      absolute === "first"
        ? 0
        : absolute === "last"
          ? commands.length - 1
          : (current + offset + commands.length) % commands.length;
    commands[next]?.focus({ preventScroll: true });
  };

  return (
    <div class="cd2004-menu" data-menu={id}>
      <button
        ref={titleRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        class="cd2004-menu-title"
        onClick={() => {
          if (openedByHoverRef.current) {
            openedByHoverRef.current = false;
            return;
          }
          if (isOpen) dismiss(true);
          else bar?.open(id);
        }}
        onPointerEnter={() => {
          // Menu tracking: hovering a sibling while any menu is open switches
          // to it, exactly as a native menu bar does.
          if (isTracking && !isOpen) {
            openedByHoverRef.current = true;
            bar?.open(id);
          }
        }}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowDown":
            case "Enter":
            case " ":
              event.preventDefault();
              if (!isOpen) bar?.open(id);
              globalThis.setTimeout(() => focusCommand(0, "first"), 0);
              break;
            case "ArrowUp":
              event.preventDefault();
              if (!isOpen) bar?.open(id);
              globalThis.setTimeout(() => focusCommand(0, "last"), 0);
              break;
            case "ArrowRight":
              event.preventDefault();
              bar?.moveMenu(id, 1);
              break;
            case "ArrowLeft":
              event.preventDefault();
              bar?.moveMenu(id, -1);
              break;
            default:
              break;
          }
        }}
      >
        {renderMnemonic(label, mnemonic)}
      </button>
      {isOpen && (
        <div
          ref={popupRef}
          class="cd2004-menu-popup"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            switch (event.key) {
              case "ArrowDown":
                event.preventDefault();
                focusCommand(1);
                break;
              case "ArrowUp":
                event.preventDefault();
                focusCommand(-1);
                break;
              case "Home":
                event.preventDefault();
                focusCommand(0, "first");
                break;
              case "End":
                event.preventDefault();
                focusCommand(0, "last");
                break;
              case "ArrowRight":
                event.preventDefault();
                bar?.moveMenu(id, 1);
                break;
              case "ArrowLeft":
                event.preventDefault();
                bar?.moveMenu(id, -1);
                break;
              default:
                break;
            }
          }}
        >
          <MenuContext.Provider value={{ dismiss }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

interface MenuCommandProps {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onInvoke?: (returnFocus?: HTMLElement) => void;
}

function MenuCommand({
  label,
  shortcut,
  disabled = false,
  onInvoke,
}: MenuCommandProps) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        const returnFocus =
          event.currentTarget
            .closest(".cd2004-menu")
            ?.querySelector<HTMLElement>(".cd2004-menu-title") ?? undefined;
        onInvoke?.(returnFocus);
        menu?.dismiss(false);
      }}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

interface ToolbarButtonProps {
  label: string;
  shortLabel: string;
  shortcut?: string;
  icon: "save" | "records" | "note" | "print" | "reset";
  disabled?: boolean;
  onClick?: (event: TargetedMouseEvent<HTMLButtonElement>) => void;
}

function ToolbarButton({
  label,
  shortLabel,
  shortcut,
  icon,
  disabled,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      class="cd2004-toolbar-button"
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace("+", "+")}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      <DesktopIcon name={icon} />
      <span>{shortLabel}</span>
    </button>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div class="cd2004-shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
