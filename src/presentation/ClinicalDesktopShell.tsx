import type { ComponentChildren, TargetedMouseEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import "./clinical-desktop.css";
import { Panel } from "./Panel";
import { DesktopIcon } from "./DesktopIcon";
import { LegacyWorkflowHost } from "./LegacyWorkflowHost";
import { NoteInspector } from "./NoteInspector";
import { StartCenter } from "./StartCenter";
import {
  WORKFLOW_LABELS,
  LOCKED_RECORD_ACTION_SELECTOR,
  type ClinicalDesktopShellProps,
  type DesktopPane,
  type PatientContext,
  type WorkflowId,
} from "./types";

const shortcutWorkflows: WorkflowId[] = [
  "home",
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
];

const navigatorGroups: Array<{
  label: string;
  workflows: WorkflowId[];
}> = [
  {
    label: "Documentation",
    workflows: ["home", "administer", "uds", "samples", "forms"],
  },
  { label: "Utilities", workflows: ["reference", "log"] },
  { label: "Future", workflows: ["tms"] },
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

  useEffect(() => {
    if (!showShortcutHelp) return;
    const shell = shellRef.current;
    const backdrop = shell?.querySelector<HTMLElement>(
      ".cd2004-modal-backdrop",
    );
    const dialog = backdrop?.querySelector<HTMLElement>(
      ".cd2004-help-dialog",
    );
    if (!shell || !backdrop || !dialog) return;

    const isolatedSiblings = [...shell.children]
      .filter((element) => element !== backdrop)
      .map((element) => ({
        element: element as HTMLElement,
        inert: Boolean((element as HTMLElement).inert),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    const returnFocus = previousFocusRef.current;
    isolatedSiblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });

    const focusableControls = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (control) =>
          control.offsetParent !== null &&
          control.getAttribute("aria-hidden") !== "true",
      );
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = focusableControls();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", containFocus, true);
    const focusFrame = globalThis.requestAnimationFrame(() => {
      focusableControls()[0]?.focus({ preventScroll: true });
    });
    return () => {
      globalThis.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", containFocus, true);
      isolatedSiblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      globalThis.setTimeout(
        () => returnFocus?.focus({ preventScroll: true }),
        0,
      );
    };
  }, [showShortcutHelp]);

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
  ]);

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

        <nav class="cd2004-menu-bar" aria-label="Application menu">
          <DesktopMenu label="File">
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
          <DesktopMenu label="Chart">
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
          <DesktopMenu label="Workflows">
            {shortcutWorkflows.map((workflow, index) => (
              <MenuCommand
                key={workflow}
                label={WORKFLOW_LABELS[workflow]}
                shortcut={`Alt+${index + 1}`}
                onInvoke={() => openWorkflow(workflow)}
              />
            ))}
          </DesktopMenu>
          <DesktopMenu label="Tools">
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
          <DesktopMenu label="Help">
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
        {(["navigator", "work", "inspector"] as DesktopPane[]).map((pane) => (
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
              const panes = [
                "navigator",
                "work",
                "inspector",
              ] as DesktopPane[];
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
            {pane === "navigator"
              ? "NAV"
              : pane === "work"
                ? "WORK"
                : "NOTE"}
          </button>
        ))}
      </div>

      <main
        class="cd2004-workspace"
        id="cd2004-work-area"
        data-mobile-pane={mobilePane}
      >
        <Panel
          pane="navigator"
          title="Navigator"
          active={focusedPane === "navigator"}
          mobileActive={mobilePane === "navigator"}
          onActivate={setFocusedPane}
        >
          <nav class="cd2004-navigator" aria-label="Clinical modules">
            {navigatorGroups.map((group) => (
              <div key={group.label} class="cd2004-nav-group">
                <div class="cd2004-nav-group-label">{group.label}</div>
                {group.workflows.map((workflow, index) => {
                  const summary = workflowSummaries[workflow];
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
                      aria-current={
                        selectedWorkflow === workflow ? "page" : undefined
                      }
                      title={WORKFLOW_LABELS[workflow]}
                      onClick={() => openWorkflow(workflow)}
                    >
                      <DesktopIcon name={workflow} />
                      <span>{WORKFLOW_LABELS[workflow]}</span>
                      {workflow !== "tms" && (
                        <kbd>
                          {workflow === "home"
                            ? "1"
                            : shortcutWorkflows.indexOf(workflow) + 1 || index + 1}
                        </kbd>
                      )}
                      {summary?.count ? (
                        <em aria-label={`${summary.count} items`}>{summary.count}</em>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div class="cd2004-navigator-foot">
            <strong>LOCAL</strong>
            <span>No server synchronization</span>
          </div>
        </Panel>

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

      <footer class="cd2004-taskbar cd2004-print-exclude">
        <button
          type="button"
          class="cd2004-start-button"
          onClick={() => openWorkflow("home")}
        >
          <span class="cd2004-start-flag" aria-hidden="true">
            ◆
          </span>
          Start
        </button>
        <div
          class={`cd2004-storage-status ${localStorageAvailable ? "is-online" : "is-error"}`}
          title={
            localStorageAvailable
              ? "Records save only in this browser"
              : "Browser storage is unavailable"
          }
        >
          <span aria-hidden="true">{localStorageAvailable ? "●" : "×"}</span>
          {localStorageAvailable ? "LOCAL" : "STORAGE ERROR"}
        </div>
        <div class="cd2004-status-message" aria-live="polite" aria-atomic="true">
          {effectiveStatus}
        </div>
      </footer>

      {showShortcutHelp && (
        <div
          class="cd2004-modal-backdrop cd2004-print-exclude"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowShortcutHelp(false);
              restorePreviousFocus();
            }
          }}
        >
          <section
            class="cd2004-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cd2004ShortcutTitle"
          >
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
        </div>
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

interface DesktopMenuProps {
  label: string;
  children: ComponentChildren;
}

function DesktopMenu({ label, children }: DesktopMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const summary = details.querySelector<HTMLElement>("summary");
    const close = (restoreFocus = false) => {
      if (!details.open) return;
      details.open = false;
      if (restoreFocus) summary?.focus({ preventScroll: true });
    };
    const handleToggle = () => {
      if (!details.open) return;
      document
        .querySelectorAll<HTMLDetailsElement>(".cd2004-menu[open]")
        .forEach((other) => {
          if (other !== details) other.open = false;
        });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        details.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    details.addEventListener("toggle", handleToggle);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      details.removeEventListener("toggle", handleToggle);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <details ref={detailsRef} class="cd2004-menu">
      <summary>{label}</summary>
      <div class="cd2004-menu-popup">{children}</div>
    </details>
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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        const details = event.currentTarget.closest("details");
        const returnFocus =
          details?.querySelector<HTMLElement>("summary") ?? undefined;
        onInvoke?.(returnFocus);
        details?.removeAttribute("open");
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
