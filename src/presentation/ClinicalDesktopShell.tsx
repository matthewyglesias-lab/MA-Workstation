import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
// Tokens first: every later stylesheet resolves var(--tw-*) against this one.
import "./tebra-tokens.css";
import "./clinical-desktop.css";
import "./workflows/workflow-panels.css";
import "./meditech-workstation.css";
import "./tebra-screen-contract.css";
import { WORKSTATION_TRANSACTION_CODE } from "../application/workstation-projection";
import { MODULE, NOTES, PATIENT, RECORD, SHELL } from "./vocabulary";
import { Panel } from "./Panel";
import { DesktopIcon } from "./DesktopIcon";
import {
  MeditechCommandDeck,
  MeditechRecordRail,
} from "./MeditechChrome";
import {
  FUNCTION_KEY_PROFILE,
  getFunctionKeyCommand,
  resolveFunctionKeyCommand,
  type FunctionKeyActions,
} from "./FunctionKeyProfile";
import { LegacyWorkflowHost } from "./LegacyWorkflowHost";
import { ModalDialog } from "./ModalDialog";
import { NoteInspector } from "./NoteInspector";
import {
  RecordLifecycleActions,
  type RecordLifecycle,
} from "./RecordLifecycleActions";
import { StartCenter } from "./StartCenter";
import {
  WorkstationLookupDialog,
  type WorkstationLookupOption,
  type WorkstationLookupTransaction,
} from "./WorkstationLookupDialog";
import {
  WORKSTATION_FIELD_LOOKUP_REQUEST,
  type WorkstationFieldLookupRequestDetail,
} from "./workstation-events";
import {
  WORKFLOW_LABELS,
  LOCKED_RECORD_ACTION_SELECTOR,
  type ClinicalDesktopShellProps,
  type DesktopPane,
  type InjectionRecordActions as InjectionRecordActionsConfig,
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

const WORKFLOW_SUMMARY_STATE_LABEL = {
  idle: NOTES.statusNotStarted,
  draft: NOTES.statusIncomplete,
  ready: NOTES.statusReadyToSign,
  attention: NOTES.statusNeedsReview,
  locked: NOTES.statusSigned,
} as const;

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

function normalizedPromptText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Client/Server workstations keep a one-line prompt for the control that owns
 * focus. Reuse the control's existing label and title so this improves field
 * orientation without introducing a second, potentially divergent source of
 * clinical guidance.
 */
interface FocusedControlContext {
  prompt: string;
  fieldCode?: string;
  fieldLabel: string;
  fieldState?: string;
  lookupSelect?: HTMLSelectElement;
}

function contextForFocusedControl(
  target: EventTarget | null,
): FocusedControlContext | null {
  if (!(target instanceof HTMLElement)) return null;
  const control = target.closest<HTMLElement>(
    "button, input, select, textarea, [role='tab'], [role='menuitem']",
  );
  if (!control || control.matches(":disabled")) return null;
  const register = control.closest<HTMLElement>("[data-field-code]");
  if (register) {
    const code = register.dataset.fieldCode || "FIELD";
    const label = register.dataset.fieldLabel || "Entry";
    const state = register.dataset.fieldState || "OK";
    const lookupSelect =
      register.querySelector<HTMLSelectElement>("select:not(:disabled)") ??
      undefined;
    const prompt =
      register.dataset.fieldPrompt ||
      (lookupSelect
        ? `Select ${label.toLowerCase()} or press F9 for available values`
        : `Enter ${label.toLowerCase()}`);
    return {
      prompt: `${code} | ${label} | ${state} | ${prompt}`,
      fieldCode: code,
      fieldLabel: label,
      fieldState: state,
      lookupSelect,
    };
  }

  const labelledControl = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const associatedLabel = labelledControl.labels?.[0];
  const enclosingLabel = control.closest("label");
  const fieldCaption = control
    .closest(".wfp-field")
    ?.querySelector<HTMLElement>(".wfp-field-caption");
  const legacyFieldLabel = control
    .closest(".field, .cd2004-field")
    ?.querySelector<HTMLElement>("label");
  const label = normalizedPromptText(
    control.getAttribute("aria-label") ??
      associatedLabel?.textContent ??
      enclosingLabel?.textContent ??
      fieldCaption?.textContent ??
      legacyFieldLabel?.textContent ??
      control.textContent,
  );
  if (!label) return null;

  const title = normalizedPromptText(control.getAttribute("title"));
  const placeholder =
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? normalizedPromptText(control.placeholder)
      : "";
  const detail = title || placeholder;
  return {
    prompt:
      detail && !detail.toLocaleLowerCase().includes(label.toLocaleLowerCase())
        ? `${label} — ${detail}`
        : `Current field: ${label}`,
    fieldLabel: label,
    lookupSelect:
      control instanceof HTMLSelectElement && !control.disabled
        ? control
        : undefined,
  };
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
    (workflowName && activeName !== workflowName) ||
      (workflowDob && activeDob !== workflowDob),
  );
}

export function ClinicalDesktopShell({
  organizationName = SHELL.organization,
  activeWorkflow,
  defaultActiveWorkflow = "home",
  onWorkflowChange,
  patient = {},
  workflowPatient,
  onUseWorkflowPatient,
  staffLabel = PATIENT.notSignedIn,
  locationLabel = PATIENT.noLocation,
  localStorageAvailable = true,
  workflowSummaries = {},
  needsReview = [],
  todayQueue = [],
  injectionRecords = [],
  readiness = [],
  noteSections = [],
  noteTitle,
  noteSubtitle,
  workflowSlots = {},
  legacyPanels = {},
  renderWorkflow,
  postState = "idle",
  postMessage,
  canComplete = false,
  statusMessage,
  onSaveDraft,
  onReviewComplete,
  injectionRecordActions,
  onStartNewInjection,
  onOpenRecords,
  onLookup,
  onOpenStaff,
  onOpenLocation,
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
  const [internalStatus, setInternalStatus] = useState<string | null>(null);
  const [fieldPrompt, setFieldPrompt] = useState<string | null>(null);
  const [focusedControl, setFocusedControl] =
    useState<FocusedControlContext | null>(null);
  const [fieldLookup, setFieldLookup] =
    useState<WorkstationLookupTransaction | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const workHostRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const selectedWorkflow = activeWorkflow ?? internalWorkflow;
  const helpCommand = getFunctionKeyCommand("help");
  const fileCommand = getFunctionKeyCommand("file");
  const lookupCommand = getFunctionKeyCommand("lookup");
  const localEmrCommand = getFunctionKeyCommand("local-emr");
  const previousWorkflowRef = useRef<WorkflowId>(selectedWorkflow);
  const workflowScrollPositionsRef = useRef<
    Partial<Record<WorkflowId, number>>
  >({});
  const capturedScrollWorkflowRef = useRef<WorkflowId | null>(null);
  /*
   * Identity for the document header. The workflow's own patient wins field by
   * field - it is that encounter's document - but an empty field falls back to
   * the chart context rather than blanking the header. A plain
   * `workflowPatient ?? patient` cannot do this: the workflow context is a
   * defined object well before its fields are filled, so `??` would keep the
   * empty one and the document would look unidentified while the chart banner
   * above it named the patient.
   */
  const documentPatient: PatientContext = {
    ...patient,
    ...workflowPatient,
    name: workflowPatient?.name || patient.name,
    dob: workflowPatient?.dob || patient.dob,
  };
  const isMismatch = contextsMismatch(patient, workflowPatient);
  const effectiveStatus =
    internalStatus ??
    fieldPrompt ??
    statusMessage ??
    "Ready. Select a workflow to begin.";
  const hasOutstandingStops = readiness.some((item) => item.state === "stop");

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
    setInternalStatus(`${WORKFLOW_LABELS[workflow]} opened.`);
  };

  const restorePreviousFocus = () => {
    globalThis.setTimeout(() => previousFocusRef.current?.focus(), 0);
  };

  const openShortcutHelp = useCallback(() => {
    previousFocusRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    setShowShortcutHelp(true);
  }, []);

  const requestDraftSave = useCallback(() => {
    if (onSaveDraft) {
      onSaveDraft();
      setInternalStatus("Draft save requested.");
    } else {
      setInternalStatus("Draft saving is unavailable in this workflow.");
    }
  }, [onSaveDraft]);

  const focusWorksheetSection = useCallback((direction: 1 | -1) => {
    const worksheet = workHostRef.current;
    if (!worksheet) return false;
    const sections = Array.from(
      worksheet.querySelectorAll<HTMLElement>(
        ".wfp-section, [data-workflow-section]",
      ),
    );
    if (!sections.length) return false;
    const active = document.activeElement as HTMLElement | null;
    const current = sections.findIndex((section) => section.contains(active));
    const next =
      current < 0
        ? direction > 0
          ? 0
          : sections.length - 1
        : (current + direction + sections.length) % sections.length;
    const target = sections[next]!;
    target.tabIndex = -1;
    target.scrollIntoView({ block: "center" });
    const focusTarget =
      target.querySelector<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex='0']",
      ) ?? target;
    focusTarget.focus({ preventScroll: true });
    setFocusedPane("work");
    setInternalStatus(`${direction > 0 ? "Next" : "Previous"} worksheet section focused.`);
    return true;
  }, []);

  const focusWorksheetPage = useCallback((direction: 1 | -1) => {
    const worksheet = workHostRef.current;
    if (!worksheet) return false;
    const tabs = Array.from(
      worksheet.querySelectorAll<HTMLButtonElement>("[role='tab']:not([disabled])"),
    );
    if (!tabs.length) return focusWorksheetSection(direction);
    const active = document.activeElement as HTMLElement | null;
    const current = tabs.findIndex(
      (tab) => tab.getAttribute("aria-selected") === "true" || tab === active,
    );
    const next =
      current < 0
        ? direction > 0
          ? 0
          : tabs.length - 1
        : (current + direction + tabs.length) % tabs.length;
    const target = tabs[next]!;
    target.click();
    target.focus({ preventScroll: true });
    setFocusedPane("work");
    setInternalStatus(`${direction > 0 ? "Next" : "Previous"} worksheet page focused.`);
    return true;
  }, [focusWorksheetSection]);

  const focusNextStop = useCallback(() => {
    const worksheet = workHostRef.current;
    if (!worksheet) return false;
    const findCandidates = () =>
      Array.from(
        worksheet.querySelectorAll<HTMLElement>(
          ".wfp-field.is-incomplete, .wfp-checkbox-row.is-required, [role='radiogroup'][data-requirement='required']",
        ),
      ).filter((element) => {
        if (!element.getClientRects().length) return false;
        if (element.classList.contains("wfp-field")) return true;
        return !element.querySelector<HTMLInputElement>("input:checked");
      });
    const candidates = findCandidates();
    if (!candidates.length) {
      const stoppedPage = worksheet.querySelector<HTMLButtonElement>(
        "[role='tab'].is-stop:not([aria-selected='true'])",
      );
      if (!stoppedPage) return focusWorksheetSection(1);
      stoppedPage.click();
      globalThis.setTimeout(() => {
        const target = findCandidates()[0];
        const focusTarget = target?.querySelector<HTMLElement>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex='0']",
        );
        (focusTarget ?? target)?.focus({ preventScroll: true });
      }, 0);
      setFocusedPane("work");
      setInternalStatus(null);
      return true;
    }

    const active = document.activeElement as HTMLElement | null;
    const current = candidates.findIndex((candidate) => candidate.contains(active));
    const target = candidates[(current + 1 + candidates.length) % candidates.length]!;
    target.scrollIntoView({ block: "center" });
    const focusTarget = target.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex='0']",
    );
    (focusTarget ?? target).focus({ preventScroll: true });
    setFocusedPane("work");
    setInternalStatus(null);
    return true;
  }, [focusWorksheetSection]);

  const cycleFocusZone = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const zones = [
      workHostRef.current,
      shell.querySelector<HTMLElement>(".meditech-record-list"),
      shell.querySelector<HTMLElement>(".meditech-command-deck"),
    ].filter(
      (element): element is HTMLElement =>
        Boolean(element && element.getClientRects().length),
    );
    if (!zones.length) return;
    const active = document.activeElement as HTMLElement | null;
    const current = zones.findIndex((zone) => zone.contains(active));
    const target = zones[(current + 1 + zones.length) % zones.length]!;
    const focusTarget =
      target.querySelector<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role='tab'][aria-selected='true'], [tabindex='0']",
      ) ?? target;
    focusTarget.focus({ preventScroll: true });
    if (target === workHostRef.current) {
      setFocusedPane("work");
      setInternalStatus("Worksheet zone focused.");
    } else if (target.classList.contains("meditech-record-list")) {
      setInternalStatus(`${NOTES.openNotes} zone focused.`);
    } else {
      setInternalStatus("Command zone focused.");
    }
  }, []);

  const openFieldLookup = useCallback((select: HTMLSelectElement) => {
    if (select.disabled || !select.isConnected) return false;
    const field = select.closest<HTMLElement>("[data-field-code]");
    const options: WorkstationLookupOption[] = Array.from(select.options)
      .filter((option) => !option.disabled && option.value !== "")
      .map((option, index) => ({
        value: option.value,
        label: normalizedPromptText(option.label || option.textContent) || option.value,
        description: normalizedPromptText(option.title) || undefined,
        selected: option.selected,
        ordinal: index + 1,
      }));
    if (!options.length) {
      setInternalStatus("No local values are available for this field.");
      return false;
    }
    previousFocusRef.current = select;
    setFieldLookup({
      control: select,
      fieldCode: field?.dataset.fieldCode || select.name || "FIELD",
      fieldLabel:
        field?.dataset.fieldLabel ||
        normalizedPromptText(select.labels?.[0]?.textContent) ||
        "Available values",
      prompt: field?.dataset.fieldPrompt,
      options,
    });
    setInternalStatus("Local field value table opened.");
    return true;
  }, []);

  const openContextualLookup = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const select =
      active?.closest<HTMLSelectElement>("select:not([disabled])") ??
      active
        ?.closest<HTMLElement>("[data-field-code]")
        ?.querySelector<HTMLSelectElement>("select:not([disabled])") ??
      focusedControl?.lookupSelect;
    if (select && openFieldLookup(select)) return;
    if (onLookup) {
      onLookup();
      setInternalStatus(`${NOTES.openNotes} opened.`);
      return;
    }
    setInternalStatus("No local lookup is available in this context.");
  }, [focusedControl?.lookupSelect, onLookup, openFieldLookup]);

  const dismissFieldLookup = useCallback(() => {
    const control = fieldLookup?.control;
    setFieldLookup(null);
    globalThis.setTimeout(() => {
      control?.focus({ preventScroll: true });
      setInternalStatus("Lookup closed. No value changed.");
    }, 0);
  }, [fieldLookup]);

  const chooseFieldLookupValue = useCallback(
    (option: WorkstationLookupOption) => {
      if (!fieldLookup) return;
      const { control, fieldCode } = fieldLookup;
      if (control.value === option.value) {
        setFieldLookup(null);
        globalThis.setTimeout(() => {
          control.focus({ preventScroll: true });
          setInternalStatus(`${fieldCode} unchanged — ${option.label} remains selected.`);
        }, 0);
        return;
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      if (setter) setter.call(control, option.value);
      else control.value = option.value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
      setFieldLookup(null);
      globalThis.setTimeout(() => {
        control.focus({ preventScroll: true });
        setInternalStatus(`${fieldCode} filed as ${option.label}.`);
      }, 0);
    },
    [fieldLookup],
  );

  const safeBack = useCallback(() => {
    // Menus own the first Escape. Nothing here navigates away from a draft or
    // destroys local work; callers may only dismiss a local utility.
    if (openMenu) {
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
      setShowShortcutHelp(false);
      restorePreviousFocus();
      return;
    }
    onEscape?.();
    restorePreviousFocus();
    setInternalStatus("Back: no draft was discarded.");
  }, [onEscape, openMenu, showShortcutHelp]);

  useEffect(() => {
    onWorkAreaReady?.(workHostRef.current);
    return () => onWorkAreaReady?.(null);
  }, [onWorkAreaReady]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const handleFocus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(".meditech-command-deck, .cd2004-lookup-dialog")
      ) {
        // The fixed keys and their lookup dialog operate on the last
        // worksheet field. Retaining that context while F9 or the modal owns
        // focus prevents a field lookup from degrading into a generic record
        // lookup or replacing the field prompt with dialog chrome.
        return;
      }
      const context = contextForFocusedControl(event.target);
      setFocusedControl(context);
      setFieldPrompt(context?.prompt ?? null);
      if (context) setInternalStatus(null);
    };
    shell.addEventListener("focusin", handleFocus);
    return () => shell.removeEventListener("focusin", handleFocus);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const handleLookupRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<WorkstationFieldLookupRequestDetail>
      ).detail;
      if (!detail?.select) return;
      event.stopPropagation();
      openFieldLookup(detail.select);
    };
    shell.addEventListener(WORKSTATION_FIELD_LOOKUP_REQUEST, handleLookupRequest);
    return () =>
      shell.removeEventListener(
        WORKSTATION_FIELD_LOOKUP_REQUEST,
        handleLookupRequest,
      );
  }, [openFieldLookup]);

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
      const focusTarget = lockedAction;
      if (!focusTarget) return;
      focusTarget.focus({ preventScroll: true });
      settled =
        focusTarget === document.activeElement ||
        Boolean(
          document.activeElement?.closest(LOCKED_RECORD_ACTION_SELECTOR),
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
          document.querySelector("dialog[open]") ||
          eventTarget?.closest('dialog[open], [aria-modal="true"]'),
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
        requestDraftSave();
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

      const command = resolveFunctionKeyCommand(event.key, event.shiftKey);
      if (!command) return;
      event.preventDefault();
      switch (command.id) {
        case "help":
          openShortcutHelp();
          return;
        case "next-section":
          focusWorksheetSection(1);
          return;
        case "previous-section":
          focusWorksheetSection(-1);
          return;
        case "next-page":
          focusWorksheetPage(1);
          return;
        case "previous-page":
          focusWorksheetPage(-1);
          return;
        case "focus-next-zone":
          if (hasOutstandingStops) focusNextStop();
          else cycleFocusZone();
          return;
        case "lookup":
          openContextualLookup();
          return;
        case "local-emr":
          if (onOpenRecords) {
            onOpenRecords();
            setInternalStatus(`${NOTES.openNotes} opened.`);
          } else {
            setInternalStatus(`${NOTES.openNotes} is unavailable.`);
          }
          return;
        case "file":
          requestDraftSave();
          return;
        case "back":
          safeBack();
          return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cycleFocusZone,
    focusNextStop,
    focusWorksheetPage,
    focusWorksheetSection,
    hasOutstandingStops,
    openContextualLookup,
    onOpenRecords,
    openShortcutHelp,
    requestDraftSave,
    safeBack,
    showShortcutHelp,
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
      ? NOTES.openNotes
      : `${WORKFLOW_LABELS[selectedWorkflow]} note`;
  const transactionCode = WORKSTATION_TRANSACTION_CODE[selectedWorkflow];

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
    injectionRecords,
    onWorkflowOpen: openWorkflow,
    onQueueItemOpen,
    onRecordOpen,
    onStartNewInjection,
  });

  const inspectorPanel = (
    <Panel
      pane="inspector"
      title="Clinical Documentation"
      subtitle={selectedWorkflow === "administer" ? undefined : WORKFLOW_LABELS[selectedWorkflow]}
      icon="note"
      active={focusedPane === "inspector"}
      onActivate={setFocusedPane}
    >
      <NoteInspector
        title={noteTitle ?? `${WORKFLOW_LABELS[selectedWorkflow]} note`}
        subtitle={noteSubtitle}
        readiness={readiness}
        sections={noteSections}
        patient={documentPatient}
        postState={postState}
        postMessage={postMessage}
        onCopySection={onCopyNoteSection}
        onCopyAll={onCopyAllNotes}
      />
    </Panel>
  );

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
            <b>IPMG</b>
            <span>{SHELL.productName}</span>
            <small>{transactionCode}</small>
          </span>
          <span class="cd2004-app-environment">
            <b>{SHELL.localOnlyBadge}</b>
            <small>
              {staffLabel || PATIENT.notSignedIn} · {locationLabel || PATIENT.noLocation}
            </small>
          </span>
        </div>

        <nav
          class="cd2004-menu-bar"
          role="menubar"
          aria-label="Application menu"
        >
          <MenuBarContext.Provider value={menuBar}>
          <DesktopMenu id="file" label="File" mnemonic="F">
            <MenuCommand
              label={RECORD.save}
              shortcut={fileCommand.keyLabel}
              disabled={!onSaveDraft}
              onInvoke={requestDraftSave}
            />
            <MenuCommand
              label={NOTES.openNotes}
              shortcut={localEmrCommand.keyLabel}
              disabled={!onOpenRecords}
              onInvoke={onOpenRecords}
            />
          </DesktopMenu>
          <DesktopMenu id="chart" label="Chart" mnemonic="C">
            <MenuCommand
              label={PATIENT.useThisPatient}
              disabled={!isMismatch || !onUseWorkflowPatient}
              onInvoke={() => onUseWorkflowPatient?.(selectedWorkflow)}
            />
            <MenuCommand
              label={PATIENT.findPatient}
              shortcut={lookupCommand.keyLabel}
              disabled={!onLookup}
              onInvoke={openContextualLookup}
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
              label="Staff sign-in…"
              disabled={!onOpenStaff}
              onInvoke={onOpenStaff}
            />
            <MenuCommand
              label="Visit location…"
              disabled={!onOpenLocation}
              onInvoke={onOpenLocation}
            />
            <MenuCommand
              label={MODULE.reference}
              disabled={!onOpenKnowledge}
              onInvoke={onOpenKnowledge}
            />
            <MenuCommand
              label={MODULE.dailyCloseout}
              disabled={!onOpenCloseout}
              onInvoke={onOpenCloseout}
            />
          </DesktopMenu>
          <DesktopMenu id="help" label="Help" mnemonic="H">
            <MenuCommand
              label={SHELL.keyboardReference}
              shortcut={helpCommand.keyLabel}
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

        <PatientBanner
          patient={patient}
          workflowPatient={workflowPatient}
          mismatch={isMismatch}
          selectedWorkflow={selectedWorkflow}
          workflowStateLabel={
            postState === "posted"
              ? NOTES.statusSigned
              : WORKFLOW_SUMMARY_STATE_LABEL[
                  workflowSummaries[selectedWorkflow]?.state ?? "idle"
                ]
          }
          staffLabel={staffLabel}
          locationLabel={locationLabel}
          onUseWorkflowPatient={onUseWorkflowPatient}
          onSelectLocalRecord={onOpenRecords}
        />
      </header>

      <main
        class={`cd2004-workspace ${selectedWorkflow === "administer" ? "has-central-preview" : ""}`}
        id="cd2004-work-area"
        data-workflow={selectedWorkflow}
      >
        <Panel
          pane="work"
          title={windowTitle}
          icon={selectedWorkflow}
          subtitle={
            selectedWorkflow === "home" ? SHELL.localOnlyDetail : "Active encounter"
          }
          active={focusedPane === "work"}
          onActivate={setFocusedPane}
        >
          <div
            class={`cd2004-transaction-window ${
              selectedWorkflow === "administer" ? "has-document-split" : ""
            }`}
          >
          <div
            ref={workHostRef}
            class="cd2004-workflow-slot"
            data-workflow={selectedWorkflow}
            data-post-state={postState}
          >
            <div
              class={`cd2004-workflow-body ${
                selectedWorkflow === "administer" ? "is-transaction-scroll" : ""
              }`}
            >
              {postState === "posting" && (
                <div class="cd2004-posting-strip" role="status">
                  <span aria-hidden="true" />
                  Validating required fields and writing local record…
                </div>
              )}
              {workflowContent}
            </div>
            {selectedWorkflow === "administer" && injectionRecordActions && (
              <InjectionRecordActions
                actions={injectionRecordActions}
                canComplete={canComplete}
                blockerCount={
                  readiness.filter((item) => item.state === "stop").length
                }
                posting={postState === "posting"}
                onSaveDraft={onSaveDraft}
                onFinish={onReviewComplete}
                onAddendum={() => {
                  const input = workHostRef.current?.querySelector<HTMLTextAreaElement>(
                    "[data-addendum-input]",
                  );
                  input?.scrollIntoView({ block: "center" });
                  input?.focus({ preventScroll: true });
                  setInternalStatus("Dated addendum field focused.");
                }}
              />
            )}
          </div>
          {selectedWorkflow === "administer" && (
            <div class="cd2004-document-split">{inspectorPanel}</div>
          )}
          </div>
        </Panel>

        <aside class="meditech-context-rail">
          <MeditechRecordRail
            selectedWorkflow={selectedWorkflow}
            summaries={workflowSummaries}
            patient={patient}
            onWorkflowOpen={openWorkflow}
            onOpenRecords={onOpenRecords}
          />
          {selectedWorkflow !== "administer" && selectedWorkflow !== "home" && inspectorPanel}
        </aside>
      </main>

      <MeditechCommandDeck
        selectedWorkflow={selectedWorkflow}
        contextCode={focusedControl?.fieldCode}
        actions={{
          help: { onInvoke: openShortcutHelp },
          "next-section": { onInvoke: () => focusWorksheetSection(1) },
          "previous-section": { onInvoke: () => focusWorksheetSection(-1) },
          "next-page": { onInvoke: () => focusWorksheetPage(1) },
          "previous-page": { onInvoke: () => focusWorksheetPage(-1) },
          "focus-next-zone": {
            onInvoke: hasOutstandingStops ? focusNextStop : cycleFocusZone,
            label: hasOutstandingStops ? "Next stop" : "Next zone",
            active: hasOutstandingStops,
          },
          lookup: {
            onInvoke: openContextualLookup,
            disabled: !focusedControl?.lookupSelect && !onLookup,
            label: focusedControl?.lookupSelect ? "Field values" : "Lookup",
            active: Boolean(focusedControl?.lookupSelect),
          },
          "local-emr": {
            onInvoke: onOpenRecords,
            disabled: !onOpenRecords,
          },
          file: {
            onInvoke: requestDraftSave,
            disabled: !onSaveDraft,
            label: selectedWorkflow === "home" ? RECORD.save : `Save ${transactionCode}`,
          },
          back: { onInvoke: safeBack },
        } satisfies FunctionKeyActions}
      />

      {/*
        Segmented status bar. Replaces the taskbar/Start button, which emulated
        the Windows shell rather than an EHR application. `.cd2004-status-message`
        keeps its live-region contract and exact strings.
      */}
      <footer class="cd2004-statusbar cd2004-print-exclude">
        <div class="cd2004-status-message" aria-live="polite" aria-atomic="true">
          {effectiveStatus}
        </div>
        <div class="cd2004-status-segment" title="Current record mode">
          {postState === "posted" ? RECORD.readOnly : RECORD.editable}
        </div>
        <div
          class={`cd2004-status-segment ${localStorageAvailable ? "is-online" : "is-error"}`}
          title={
            localStorageAvailable
              ? SHELL.localOnlyDetail
              : SHELL.storageUnavailable
          }
        >
          {localStorageAvailable ? SHELL.localBadge : SHELL.storageError}
        </div>
      </footer>

      {fieldLookup && (
        <WorkstationLookupDialog
          key={`${fieldLookup.fieldCode}:${fieldLookup.control.name}`}
          transaction={fieldLookup}
          transactionCode={transactionCode}
          onChoose={chooseFieldLookupValue}
          onDismiss={dismissFieldLookup}
        />
      )}

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
              {FUNCTION_KEY_PROFILE.map((command) => (
                <ShortcutRow
                  key={command.id}
                  keys={command.keyLabel}
                  label={command.description}
                />
              ))}
              <ShortcutRow keys="Alt+1–7" label="Switch major modules" />
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
  injectionRecords: NonNullable<ClinicalDesktopShellProps["injectionRecords"]>;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onQueueItemOpen?: ClinicalDesktopShellProps["onQueueItemOpen"];
  onRecordOpen?: ClinicalDesktopShellProps["onRecordOpen"];
  onStartNewInjection?: ClinicalDesktopShellProps["onStartNewInjection"];
}

interface InjectionRecordActionsProps {
  actions: InjectionRecordActionsConfig;
  canComplete: boolean;
  blockerCount: number;
  posting: boolean;
  onSaveDraft?: () => void;
  onFinish?: () => void;
  onAddendum?: () => void;
}

const INJECTION_DEFAULT_DETAIL: Record<RecordLifecycle, string> = {
  new: "Enter encounter details to begin a local draft.",
  draft: "Draft saved in this browser. Finish only when the disposition is final.",
  locked: "This browser-local record is read-only. Corrections require a dated addendum.",
  saving: "Writing the latest encounter changes to this browser.",
  error: "The local draft needs storage attention before you leave this encounter.",
};

/**
 * The only visible source of truth for the active injection record's
 * lifecycle. Shell commands remain accelerators for these actions, rather
 * than forcing staff to discover Save/New/Finish through a menu or F-key.
 */
function InjectionRecordActions({
  actions,
  canComplete,
  blockerCount,
  posting,
  onSaveDraft,
  onFinish,
  onAddendum,
}: InjectionRecordActionsProps) {
  const locked = actions.lifecycle === "locked";
  const saveDisabled =
    locked || posting || !actions.canDiscard || !onSaveDraft;
  const finishDisabled = locked || posting || !canComplete || !onFinish;
  const discardDisabled = locked || posting || !actions.canDiscard;
  const detail = locked
    ? actions.detail ?? INJECTION_DEFAULT_DETAIL[actions.lifecycle]
    : actions.blockingDetail
      ? `First blocker: ${actions.blockingDetail}`
      : blockerCount
        ? `First blocker: ${blockerCount} required ${
            blockerCount === 1 ? "field needs" : "fields need"
          } attention.`
        : actions.detail ?? INJECTION_DEFAULT_DETAIL[actions.lifecycle];

  return (
    <RecordLifecycleActions
      recordLabel={`${MODULE.injection} note`}
      ariaLabel="Injection record actions"
      lifecycle={actions.lifecycle}
      detail={detail}
      rootTestAttribute="data-injection-record-actions"
      buttons={
        <>
          {locked && (
            <button
              type="button"
              class="is-addendum"
              onClick={onAddendum}
              disabled={!onAddendum}
            >
              <span class="cd2004-action-glyph" aria-hidden="true">
                <DesktopIcon name="addendum" />
              </span>
              Add dated addendum
            </button>
          )}
          {!locked && (
            <>
              <button
                type="button"
                class="is-save"
                data-injection-save
                disabled={saveDisabled}
                title={
                  saveDisabled
                    ? "Enter encounter details before saving a local draft."
                    : "Save this editable injection draft locally (F12)."
                }
                onClick={onSaveDraft}
              >
                <span class="cd2004-action-glyph" aria-hidden="true">
                  <DesktopIcon name="save" />
                </span>
                {RECORD.save} <kbd>F12</kbd>
              </button>
              <button
                type="button"
                class="is-primary"
                data-injection-finish
                disabled={finishDisabled}
                title={
                  finishDisabled
                    ? actions.blockingDetail
                      ? actions.blockingDetail
                      : blockerCount
                      ? `Complete ${blockerCount} required clinical ${blockerCount === 1 ? "field" : "fields"} before attesting and locking this local record.`
                      : "Complete the required clinical fields before finishing and locking this record."
                    : "Review the note before signing it."
                }
                onClick={onFinish}
              >
                <span class="cd2004-action-glyph" aria-hidden="true">
                  <DesktopIcon name="lock" />
                </span>
                {RECORD.sign}
              </button>
            </>
          )}
          <span class="cd2004-record-action-separator" aria-hidden="true" />
          <button
            type="button"
            class="is-new"
            data-injection-new
            disabled={posting}
            title="Start a blank injection. Any current editable work is saved as a local draft first."
            onClick={actions.onStartNew}
          >
            <span class="cd2004-action-glyph" aria-hidden="true">
              <DesktopIcon name="new" />
            </span>
            Start new injection
          </button>
          {!locked && (
            <button
              type="button"
              class="is-danger"
              data-injection-discard
              disabled={discardDisabled}
              title={
                discardDisabled
                  ? "There is no editable local draft to discard."
                  : "Discard this editable local draft. This cannot be undone."
              }
              onClick={actions.onDiscard}
            >
              <span class="cd2004-action-glyph" aria-hidden="true">
                <DesktopIcon name="discard" />
              </span>
              {RECORD.discardDraft}…
            </button>
          )}
        </>
      }
    />
  );
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
  injectionRecords,
  onWorkflowOpen,
  onQueueItemOpen,
  onRecordOpen,
  onStartNewInjection,
}: RenderWorkflowOptions): ComponentChildren {
  if (workflow === "home") {
    return (
      <StartCenter
        summaries={summaries}
        needsReview={needsReview}
        todayQueue={todayQueue}
        injectionRecords={injectionRecords}
        onWorkflowOpen={onWorkflowOpen}
        onQueueItemOpen={onQueueItemOpen}
        onRecordOpen={onRecordOpen}
        onStartNewInjection={onStartNewInjection}
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
  workflowStateLabel: string;
  staffLabel: string;
  locationLabel: string;
  onUseWorkflowPatient?: (workflow: WorkflowId) => void;
  onSelectLocalRecord?: () => void;
}

function PatientBanner({
  patient,
  workflowPatient,
  mismatch,
  selectedWorkflow,
  workflowStateLabel,
  staffLabel,
  locationLabel,
  onUseWorkflowPatient,
  onSelectLocalRecord,
}: PatientBannerProps) {
  // The masthead follows a complete patient identity across workflows. Local
  // record persistence remains a separate status in the rail and action bar.
  const hasLocalRecord = Boolean(
    patient.localRecordId?.trim() ||
      patient.visitLabel?.trim() ||
      patient.medicalRecordNumber?.trim(),
  );
  const hasIdentifiedPatient = Boolean(patient.name?.trim() && patient.dob?.trim());
  const hasActiveChart = hasLocalRecord || hasIdentifiedPatient;
  const patientNameLabel = hasActiveChart
    ? patient.name?.trim() || PATIENT.facesheet
    : PATIENT.noPatient;
  const dobLabel = hasActiveChart ? patient.dob || "—" : "—";
  const recordLabel = patient.visitLabel || patient.localRecordId || "Not selected";
  // The banner is the Facesheet in every state. The client/server shell drew a
  // three-way distinction here ("Local chart" / "Patient context" / "Chart
  // context") that named its own internals rather than anything staff act on.
  const chartContextLabel = PATIENT.facesheet;
  const workflowContextLabel = `${WORKFLOW_LABELS[selectedWorkflow]} — ${workflowStateLabel}`;
  const medicationContextPrefix = patient.medicationLabel
    ? `MEDICATION: ${patient.medicationLabel} · `
    : "";
  const safetyContextLabel =
    selectedWorkflow === "home"
      ? patient.medicationLabel
        ? `MEDICATION: ${patient.medicationLabel}`
        : `WORKFLOW: ${WORKFLOW_LABELS[selectedWorkflow].toUpperCase()}`
      : `${medicationContextPrefix}WORKFLOW: ${WORKFLOW_LABELS[selectedWorkflow].toUpperCase()} · STATE: ${workflowStateLabel.toUpperCase()}`;
  return (
    <div
      class={`cd2004-patient-banner ${
        hasActiveChart ? "has-active-chart" : "is-no-active-chart"
      } ${mismatch ? "has-mismatch" : ""}`}
    >
      <div class="cd2004-patient-primary" title={patientNameLabel}>
        <DesktopIcon name={mismatch ? "alert" : hasActiveChart ? "patient" : "records"} />
        <span>
          <small>{chartContextLabel}</small>
          <strong>{patientNameLabel}</strong>
        </span>
      </div>
      <div class="cd2004-patient-field" title={`DOB: ${dobLabel}`}>
        <small>{PATIENT.dob}</small>
        <strong>{dobLabel}</strong>
      </div>
      <div class="cd2004-patient-field" title={`Local visit / record: ${recordLabel}`}>
        <small>{PATIENT.visitRecord}</small>
        <strong>{recordLabel}</strong>
      </div>
      <div class="cd2004-patient-field cd2004-banner-location" title={`Clinic: ${locationLabel}`}>
        <small>{PATIENT.clinic}</small>
        <strong>{locationLabel}</strong>
      </div>
      <div class="cd2004-patient-field cd2004-banner-staff" title={`Staff: ${staffLabel}`}>
        <small>{PATIENT.staff}</small>
        <strong>{staffLabel}</strong>
      </div>
      <div class="meditech-patient-safety">
        <strong>{PATIENT.allergiesLabel}:</strong>
        <b>
          {hasActiveChart
            ? patient.allergyStatus || PATIENT.allergiesUnavailable
            : selectedWorkflow === "home"
              ? PATIENT.allergiesNoPatient
              : `${PATIENT.allergiesNoPatient} · ${workflowContextLabel}`}
        </b>
        {hasActiveChart ? (
          <small title={workflowContextLabel}>
            {safetyContextLabel}
          </small>
        ) : (
          <button type="button" onClick={onSelectLocalRecord} disabled={!onSelectLocalRecord}>
            {NOTES.openNotes}
          </button>
        )}
      </div>
      {mismatch && (
        <div class="cd2004-context-mismatch" role="status">
          <span>
            <strong>{PATIENT.contextMismatch}</strong>
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

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div class="cd2004-shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
