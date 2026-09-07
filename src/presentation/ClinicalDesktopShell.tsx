import type { ComponentChildren } from "preact";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
// Tokens first: every later stylesheet resolves var(--tw-*) against this one.
import "./tebra-tokens.css";
import "./clinical-desktop.css";
import "./workflows/workflow-panels.css";
import "./tebra-workstation.css";
import "./tebra-screen-contract.css";
import {
  InjectionRecordRepository,
} from "../persistence/injection-records";
import { browserSafeStorage } from "../persistence/storage";
import { UdsRecordRepository } from "../persistence/uds-records";
import { isUsableUdsRecord } from "./uds-record-safety";
import { isUsableInjectionRecord } from "./workflows/injection/injection-presentation-extension";
import {
  fieldsBeforeSigning,
  MODULE,
  NOTES,
  PATIENT,
  RECORD,
  SHELL,
} from "./vocabulary";
import {
  buildPatientChartIndex,
  chartPatientKey,
  scopeNotesToPatient,
  type PatientChartIndex,
} from "./patient-chart-model";
import {
  PatientChart,
  type PatientChartView,
} from "./facesheet/PatientChart";
import { PatientSearch } from "./shell/PatientSearch";
import { Panel } from "./Panel";
import { DesktopIcon } from "./DesktopIcon";
import { PowerCommandMenu } from "./TebraChrome";
import { Toast } from "./Toast";
import { AppHeader } from "./shell/AppHeader";
import { AccountMenu, WorkspaceBadge } from "./shell/AccountMenu";
import { SectionRail } from "./shell/SectionRail";
import {
  FUNCTION_KEY_PROFILE,
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
  requestWorkstationOpenNote,
  WORKSTATION_FIELD_LOOKUP_REQUEST,
  type WorkstationFieldLookupRequestDetail,
} from "./workstation-events";
import {
  WORKFLOW_LABELS,
  LOCKED_RECORD_ACTION_SELECTOR,
  type ClinicalDesktopShellProps,
  type DesktopPane,
  type InjectionRecordRow,
  type InjectionRecordActions as InjectionRecordActionsConfig,
  type PatientContext,
  type WorkflowId,
} from "./types";

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

const SAFE_CLINICAL_TONES = new Set([
  "stop",
  "warning",
  "ready",
  "info",
  "neutral",
]);

/**
 * The legacy shell snapshot is an untrusted display projection of localStorage.
 * Cross-check every Dashboard row against the typed, fully validated record
 * list before Preact sees its labels. This prevents malformed object-valued
 * labels from throwing during render and quarantines the whole worklist when
 * even one persisted row is ambiguous or unsafe.
 */
function safeInjectionWorklistRows(
  rows: InjectionRecordRow[],
): InjectionRecordRow[] {
  const listed = new InjectionRecordRepository(browserSafeStorage()).list();
  if (!listed.ok || listed.warnings.length) return [];

  const idCounts = listed.value.reduce<Map<string, number>>((counts, record) => {
    counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    return counts;
  }, new Map());
  if (
    !listed.value.every(
      (record) => idCounts.get(record.id) === 1 && isUsableInjectionRecord(record),
    )
  ) {
    return [];
  }

  const safeIds = new Set(listed.value.map((record) => record.id));
  const seen = new Set<string>();
  if (rows.length !== safeIds.size) return [];
  for (const candidate of rows as unknown[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !safeIds.has(row.id) ||
      seen.has(row.id) ||
      typeof row.patientLabel !== "string" ||
      typeof row.medicationLabel !== "string" ||
      typeof row.administeredLabel !== "string" ||
      typeof row.statusLabel !== "string" ||
      (row.tone !== undefined &&
        (typeof row.tone !== "string" || !SAFE_CLINICAL_TONES.has(row.tone)))
    ) {
      return [];
    }
    seen.add(row.id);
  }
  return rows;
}

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
  onBeforeViewChange,
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
  onCopyNoteSection,
  onCopyAllNotes,
  onQueueItemOpen,
  onRecordOpen,
  onOpenInjectionRecord,
  onOpenUdsRecord,
  onStartNewUds,
  onStartNewTransientNote,
  externalWorkflowHandoffToken,
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
  /**
   * Patient chart navigation. The chart is a destination like any section,
   * not a mode layered over one: it replaces the work area's content and
   * leaves the selected workflow untouched, so closing it returns to exactly
   * the workflow that was open.
   */
  const [chartPatientKeyState, setChartPatientKeyState] = useState<string | null>(
    null,
  );
  const [chartView, setChartView] = useState<PatientChartView>("facesheet");
  const [chartIndex, setChartIndex] = useState<PatientChartIndex>(() => ({
    patients: [],
    rowsByPatient: new Map(),
  }));
  /** A UDS note chosen in the chart, waiting for its panel to mount. */
  const pendingUdsNoteRef = useRef<string | null>(null);
  /** Refreshes search only after a stale chart has been explicitly closed. */
  const patientChartRefreshPendingRef = useRef(false);
  const lastExternalHandoffTokenRef = useRef(externalWorkflowHandoffToken);
  const shellRef = useRef<HTMLDivElement>(null);
  const workHostRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const saveDraftRef = useRef(onSaveDraft);
  const selectedWorkflow = activeWorkflow ?? internalWorkflow;
  const dashboardInjectionRecords = useMemo(
    () => safeInjectionWorklistRows(injectionRecords),
    [injectionRecords],
  );
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
  /**
   * Two different things used to share one status line.
   *
   * An *announcement* is something that just happened - a chart opened, a
   * value filed. Ambient state is what is currently true: the focused field's
   * prompt, and the record's own lifecycle label ("New draft"). The status bar
   * could carry both, because it never moved. A toast cannot: a popup that
   * reappears on every Tab, or that re-announces "New draft" each time the
   * lifecycle re-reports it, is noise that teaches people to ignore it.
   *
   * So only shell announcements toast. Ambient state keeps its own polite live
   * region - visually hidden, since sighted staff can already see the focused
   * field and the lifecycle footer. Nothing that was announced before has
   * stopped being announced.
   */
  const announcement = internalStatus ?? "";
  const ambientPrompt = fieldPrompt ?? statusMessage ?? SHELL.readyToBegin;
  const hasOutstandingStops = readiness.some((item) => item.state === "stop");

  const openWorkflow = (workflow: WorkflowId): boolean => {
    if (onWorkflowChange?.(workflow) === false) return false;
    const scrollBody = shellRef.current?.querySelector<HTMLElement>(
      ".cd2004-work-window .cd2004-window-body",
    );
    if (scrollBody && workflow !== selectedWorkflow) {
      workflowScrollPositionsRef.current[selectedWorkflow] =
        scrollBody.scrollTop;
      capturedScrollWorkflowRef.current = selectedWorkflow;
    }
    if (activeWorkflow === undefined) setInternalWorkflow(workflow);
    setInternalStatus(`${WORKFLOW_LABELS[workflow]} opened.`);
    return true;
  };

  /**
   * Reads every saved note into a per-patient index.
   *
   * Read-only, and read through the typed repositories rather than
   * localStorage, exactly as `RecordsWindow` does - so the chart, the global
   * worklist and the panels all see one set of records. A malformed store
   * yields an empty index rather than throwing: a chart that cannot be built
   * is not a reason for the workstation to stop.
   */
  const reloadChartIndex = useCallback(() => {
    const storage = browserSafeStorage();
    const injections = new InjectionRecordRepository(storage).list();
    const uds = new UdsRecordRepository(storage).list();
    const rawUds = uds.ok ? uds.value : [];
    const udsIdCounts = rawUds.reduce<Map<string, number>>((counts, record) => {
      counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
      return counts;
    }, new Map());
    const unambiguousUds = rawUds.filter(
      (record) =>
        udsIdCounts.get(record.id) === 1 && isUsableUdsRecord(record),
    );
    const rawInjections =
      injections.ok && !injections.warnings.length ? injections.value : [];
    const injectionIdCounts = rawInjections.reduce<Map<string, number>>(
      (counts, record) => {
        counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
        return counts;
      },
      new Map(),
    );
    const unambiguousInjections = rawInjections.filter(
      (record) =>
        injectionIdCounts.get(record.id) === 1 &&
        isUsableInjectionRecord(record),
    );
    setChartIndex(
      buildPatientChartIndex(
        unambiguousInjections,
        unambiguousUds,
      ),
    );
  }, []);

  useEffect(() => {
    reloadChartIndex();
  }, [reloadChartIndex, postState, selectedWorkflow]);

  const chartPatient = chartPatientKeyState
    ? (chartIndex.patients.find((entry) => entry.key === chartPatientKeyState) ?? null)
    : null;
  const chartRows = chartPatient
    ? scopeNotesToPatient(chartIndex, chartPatient.key)
    : [];
  // The Care Checklist belongs to the open note, not to the patient. It is
  // only shown on a chart when that chart is the patient the note is for.
  const activePatientKey = chartPatientKey(patient.name ?? "", patient.dob ?? "");

  const openChart = (
    key: string,
    view: PatientChartView = "facesheet",
  ): boolean => {
    if (!key) return false;
    if (!chartPatientKeyState && onBeforeViewChange?.() === false) return false;
    reloadChartIndex();
    setChartPatientKeyState(key);
    setChartView(view);
    setInternalStatus(`${PATIENT.facesheet} opened.`);
    return true;
  };

  const focusWorkflowContentNextFrame = useCallback(() => {
    // Two frames let the chart unmount and the selected workflow mount before
    // choosing a target. This also runs after native <dialog> focus restore
    // when invoked by the external-handoff token below.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const host = workHostRef.current;
        if (!host) return;
        const isVisible = (candidate: HTMLElement) =>
          candidate.getClientRects().length > 0 &&
          !candidate.closest('[hidden], [aria-hidden="true"], [inert]');
        const preferredSelectors = [
          'input[placeholder="Last, First"]:not(:disabled)',
          'textarea[data-addendum-input]:not(:disabled)',
        ];
        const preferredTarget = preferredSelectors
          .map((selector) => host.querySelector<HTMLElement>(selector))
          .find((candidate): candidate is HTMLElement =>
            Boolean(candidate && isVisible(candidate)),
          );
        const fieldCandidates = host.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not(:disabled), ' +
            'select:not(:disabled), textarea:not(:disabled)',
        );
        const actionCandidates = host.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        );
        const target =
          preferredTarget ??
          Array.from(fieldCandidates).find(isVisible) ??
          Array.from(actionCandidates).find(isVisible);
        const fallback = host.querySelector<HTMLElement>('[tabindex="-1"]');
        (target ?? fallback)?.focus({ preventScroll: true });
      });
    });
  }, []);

  const closeChart = (destination = selectedWorkflow) => {
    if (patientChartRefreshPendingRef.current) {
      patientChartRefreshPendingRef.current = false;
      reloadChartIndex();
    }
    setChartPatientKeyState(null);
    setInternalStatus(`${WORKFLOW_LABELS[destination]} opened.`);
    focusWorkflowContentNextFrame();
  };

  useEffect(() => {
    if (
      externalWorkflowHandoffToken === undefined ||
      externalWorkflowHandoffToken === lastExternalHandoffTokenRef.current
    ) {
      return;
    }
    lastExternalHandoffTokenRef.current = externalWorkflowHandoffToken;
    setChartPatientKeyState(null);
    focusWorkflowContentNextFrame();
  }, [externalWorkflowHandoffToken, focusWorkflowContentNextFrame]);

  /**
   * Opening a note from the chart is the explicit crossing from browsing into
   * a workflow. Injection resumes through the shell's own handler; UDS is
   * owned by its panel, which holds the encounter a record restores into.
   *
   * The UDS request cannot be dispatched here. The panel is not mounted while
   * the chart is open, so an event sent now would land before anything is
   * listening and the note would simply never open. It is held until the
   * effect below, which runs after the panel has mounted and registered.
   */
  const openChartNote = (recordKey: string) => {
    const row = chartRows.find((candidate) => candidate.key === recordKey);
    if (!row || !chartPatient) return;
    const { recordId } = row;
    const expectedPatient = {
      name: chartPatient.name,
      dob: chartPatient.dob,
    };
    if (row.noteType === "injection") {
      if (onOpenInjectionRecord) {
        const result = onOpenInjectionRecord(recordId, expectedPatient);
        if (result === "patient-identity-mismatch") {
          patientChartRefreshPendingRef.current = true;
          setInternalStatus(RECORD.savedNotePatientChanged);
          return;
        }
        if (result === false) {
          setInternalStatus(RECORD.savedNoteCouldNotOpen);
          return;
        }
        closeChart("administer");
        return;
      }
      closeChart("administer");
      openWorkflow("administer");
      return;
    }
    if (onOpenUdsRecord) {
      const result = onOpenUdsRecord(recordId, expectedPatient);
      if (result === "patient-identity-mismatch") {
        patientChartRefreshPendingRef.current = true;
        setInternalStatus(RECORD.savedNotePatientChanged);
        return;
      }
      if (result === false) {
        setInternalStatus(RECORD.savedNoteCouldNotOpen);
        return;
      }
      closeChart("uds");
      return;
    }
    pendingUdsNoteRef.current = recordId;
    closeChart("uds");
    openWorkflow("uds");
  };

  useEffect(() => {
    const recordId = pendingUdsNoteRef.current;
    if (!recordId || selectedWorkflow !== "uds" || chartPatientKeyState) return;
    pendingUdsNoteRef.current = null;
    requestWorkstationOpenNote({ noteType: "uds", recordId });
  }, [chartPatientKeyState, selectedWorkflow]);

  const startNoteFromChart = (workflow: WorkflowId): boolean => {
    if (workflow === "uds" && onStartNewUds && chartPatient) {
      if (onStartNewUds(chartPatient) === false) {
        setInternalStatus(RECORD.currentNoteStayedOpen);
        return false;
      }
      closeChart("uds");
      return true;
    }
    if (
      (workflow === "samples" || workflow === "forms") &&
      onStartNewTransientNote &&
      chartPatient
    ) {
      if (onStartNewTransientNote(workflow, chartPatient) === false) {
        setInternalStatus(RECORD.currentNoteStayedOpen);
        return false;
      }
      closeChart(workflow);
      return true;
    }
    if (workflow === "administer" && onStartNewInjection) {
      // The callback owns both the guarded leave boundary and activating the
      // new Injection. Do not switch the workflow first: on a veto the chart's
      // return destination must remain exactly where staff left it.
      if (onStartNewInjection(chartPatient ?? undefined) === false) {
        setInternalStatus(RECORD.currentNoteStayedOpen);
        return false;
      }
    } else if (!openWorkflow(workflow)) {
      return false;
    }
    closeChart(workflow);
    return true;
  };

  const restorePreviousFocus = () => {
    const previous = previousFocusRef.current;
    previousFocusRef.current = null;
    globalThis.setTimeout(() => previous?.focus(), 0);
  };

  // The global function-key listener is effect-backed, while a workflow can
  // make Save available during the preceding render. Keep the callback
  // current in a layout effect so F12 cannot land in that post-commit gap and
  // invoke the prior render's unavailable handler.
  useLayoutEffect(() => {
    // A chart is read-only and covers the mounted editor. Never let F12 or
    // Ctrl/Cmd+S mutate that hidden note while staff are browsing a patient.
    saveDraftRef.current = chartPatientKeyState ? undefined : onSaveDraft;
  }, [chartPatientKeyState, onSaveDraft]);

  const openShortcutHelp = useCallback(() => {
    previousFocusRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    setShowShortcutHelp(true);
  }, []);

  const requestDraftSave = useCallback(() => {
    const saveDraft = saveDraftRef.current;
    if (saveDraft) {
      saveDraft();
      setInternalStatus(SHELL.draftSaveRequested);
    } else {
      setInternalStatus(SHELL.draftSaveUnavailable);
    }
  }, []);

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
    const activeContext = contextForFocusedControl(active);
    const retainsWorksheetContext = Boolean(
      active?.closest(".meditech-command-deck, .cd2004-lookup-dialog"),
    );
    // A focus event and the following function key can occur in the same
    // browser task. Prefer the live focused control so a stale render cannot
    // open the prior field's values (for example, after moving from Encounter
    // type back to Patient name). Command/deck utilities deliberately retain
    // the last worksheet field, as documented by handleFocus above.
    const select =
      activeContext?.lookupSelect ??
      (retainsWorksheetContext || !activeContext
        ? focusedControl?.lookupSelect
        : undefined);
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
    // Nothing here navigates away from a draft or destroys local work; callers
    // may only dismiss a local utility. Menus are not handled here any more:
    // each one stops Escape at its own host, so the key never reaches this.
    if (showShortcutHelp) {
      setShowShortcutHelp(false);
      restorePreviousFocus();
      return;
    }
    // The chart is a destination, so Escape leaves it the way Escape leaves
    // any other local view: back to the workflow that was open, with nothing
    // saved, discarded or started.
    if (chartPatientKeyState) {
      closeChart();
      return;
    }
    onEscape?.();
    setInternalStatus("Back: no draft was discarded.");
  }, [chartPatientKeyState, onEscape, selectedWorkflow, showShortcutHelp]);

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
      // Moving focus used to clear the last announcement, because the status
      // bar had one line and the field prompt had to win it. The toast and the
      // prompt live region no longer compete for that line, so an
      // announcement now survives the focus move that follows the action which
      // caused it — which is the whole point of a toast.
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

  // There used to be an effect clearing the announcement whenever the
  // workflow, post state or legacy status changed, so the status bar could
  // fall back to the authoritative ambient value. It is gone: the two are no
  // longer sharing one line, and it was wiping every announcement about a
  // transition at the exact moment that transition happened - "Injection
  // opened." never survived opening Injection. The toast expires on its own.

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

      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        /^[1-7]$/.test(event.key)
      ) {
        event.preventDefault();
        const workflow = shortcutWorkflows[Number(event.key) - 1];
        if (workflow && openWorkflow(workflow)) {
          if (chartPatientKeyState) closeChart(workflow);
          else if (workflow !== selectedWorkflow) focusWorkflowContentNextFrame();
        }
        return;
      }

      // Function-key commands are unmodified (Shift is part of the published
      // profile for alternate commands). Do not steal browser/OS chords such
      // as Ctrl+F11, Alt+F1, or Ctrl+Alt+3.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

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

  /**
   * The chart is a full-width page, and no note is open on it. Neither the
   * document split nor the per-note lifecycle footer belongs beside it: those
   * act on an open note, and showing them over a chart is exactly the
   * confusion between page actions and note actions that the redesign is
   * trying to remove.
   */
  const chartOpen = chartPatient !== null;
  const showsInjectionLayout = selectedWorkflow === "administer" && !chartOpen;
  const showsSideInspector =
    !chartOpen && selectedWorkflow !== "administer" && selectedWorkflow !== "home";

  const windowTitle = chartPatient
    ? chartPatient.name
    : selectedWorkflow === "home"
      ? MODULE.dashboard
      : `${WORKFLOW_LABELS[selectedWorkflow]} note`;

  const workflowContent = renderWorkflowContent({
    workflow: selectedWorkflow,
    patient,
    isMismatch,
    renderWorkflow,
    workflowSlots,
    legacyPanels,
    workHostRef,
    needsReview,
    todayQueue,
    injectionRecords: dashboardInjectionRecords,
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
      data-chart-view={chartPatient ? chartView : undefined}
      data-post-state={postState}
    >
      <a class="cd2004-skip-link" href="#cd2004-work-area">
        {SHELL.skipToActiveNote}
      </a>

      <AppHeader
        badge={<WorkspaceBadge localStorageAvailable={localStorageAvailable} />}
        account={
          <AccountMenu
            staffLabel={staffLabel}
            locationLabel={locationLabel}
            {...(onOpenStaff ? { onOpenStaff } : {})}
            {...(onOpenLocation ? { onOpenLocation } : {})}
            onOpenShortcuts={openShortcutHelp}
          />
        }
      >

        {/*
          The masthead is the open note's context. While a chart is open it
          said nothing this page does not say better a few pixels lower - and
          said one thing that was plainly false, "No patient selected" above a
          Facesheet. Clinic and staff are already in the header's top right, so
          suppressing it here removes duplication rather than information. The
          one fact it uniquely carried, that a note is open for someone else,
          moved into the chart header.
        */}
        {!chartOpen && (
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
          onUseWorkflowPatient={onUseWorkflowPatient}
          onSelectLocalRecord={onOpenRecords}
        />
        )}
      </AppHeader>

      <main
        class={[
          "cd2004-workspace",
          showsInjectionLayout ? "has-central-preview" : "",
          showsSideInspector ? "has-side-inspector" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        id="cd2004-work-area"
        data-workflow={selectedWorkflow}
      >
        <aside class="meditech-context-rail tebra-context-rail">
          <SectionRail
            selectedWorkflow={selectedWorkflow}
            summaries={workflowSummaries}
            patient={patient}
            onWorkflowOpen={(workflow) => {
              // openWorkflow already publishes the correct destination status;
              // only clear the chart layer after that guarded transition.
              if (openWorkflow(workflow) && chartPatientKeyState) {
                closeChart(workflow);
              }
            }}
            onOpenRecords={onOpenRecords}
            search={
              <PatientSearch
                patients={chartIndex.patients}
                onSelect={(selected) => openChart(selected.key)}
              />
            }
            {...(chartPatient ? { browsedPatientName: chartPatient.name } : {})}
            {...(chartPatient || activePatientKey
              ? {
                  onOpenChart: (view: PatientChartView) =>
                    openChart(chartPatient?.key ?? activePatientKey, view),
                }
              : {})}
            activeChartView={chartPatient ? chartView : null}
          />
          {showsSideInspector && inspectorPanel}
        </aside>

        <Panel
          pane="work"
          title={windowTitle}
          icon={chartPatient ? "patient" : selectedWorkflow}
          subtitle={
            chartPatient || selectedWorkflow === "home"
              ? undefined
              : SHELL.activeEncounter
          }
          active={focusedPane === "work"}
          onActivate={setFocusedPane}
        >
          <div
            class={`cd2004-transaction-window ${
              showsInjectionLayout ? "has-document-split" : ""
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
                showsInjectionLayout ? "is-transaction-scroll" : ""
              }`}
            >
              {postState === "posting" && (
                <div class="cd2004-posting-strip" role="status">
                  <span aria-hidden="true" />
                  {RECORD.validatingAndSaving}
                </div>
              )}
              {chartPatient ? (
                <PatientChart
                  patient={chartPatient}
                  rows={chartRows}
                  readiness={readiness}
                  checklistAppliesToPatient={chartPatient.key === activePatientKey}
                  view={chartView}
                  onViewChange={setChartView}
                  onOpenNote={openChartNote}
                  onNewNote={startNoteFromChart}
                  {...(activePatientKey && activePatientKey !== chartPatient.key
                    ? { otherNotePatient: patient.name?.trim() ?? "" }
                    : {})}
                />
              ) : (
                workflowContent
              )}
            </div>
            {showsInjectionLayout && injectionRecordActions && (
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
          {showsInjectionLayout && (
            <div class="cd2004-document-split">{inspectorPanel}</div>
          )}
          </div>
        </Panel>

      </main>

      <PowerCommandMenu
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
            disabled: Boolean(chartPatientKeyState) || !onSaveDraft,
            label: RECORD.save,
          },
          back: { onInvoke: safeBack },
        } satisfies FunctionKeyActions}
      />

      <Toast message={announcement} />

      <p
        class="cd2004-visually-hidden"
        role="status"
        aria-live="polite"
        data-status-prompt
      >
        {ambientPrompt}
      </p>

      {fieldLookup && (
        <WorkstationLookupDialog
          key={`${fieldLookup.fieldCode}:${fieldLookup.control.name}`}
          transaction={fieldLookup}
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
  needsReview: NonNullable<ClinicalDesktopShellProps["needsReview"]>;
  todayQueue: NonNullable<ClinicalDesktopShellProps["todayQueue"]>;
  injectionRecords: NonNullable<ClinicalDesktopShellProps["injectionRecords"]>;
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
  new: RECORD.newDraftDetail,
  draft: RECORD.draftSavedDetail,
  locked: RECORD.readOnlyDetail,
  saving: RECORD.savingDetail,
  error: RECORD.storageAttentionDetail,
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
      ariaLabel={RECORD.injectionActions}
      lifecycle={actions.lifecycle}
      detail={detail}
      rootTestAttribute="data-injection-record-actions"
      buttons={
        actions.unavailable ? null : <>
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
                    ? RECORD.enterBeforeSaving
                    : RECORD.saveInjectionDraftDescription
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
                      ? fieldsBeforeSigning(blockerCount)
                      : RECORD.fieldsBeforeSigning
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
            title={RECORD.startInjectionDescription}
            onClick={actions.onStartNew}
          >
            <span class="cd2004-action-glyph" aria-hidden="true">
              <DesktopIcon name="new" />
            </span>
            {RECORD.startNewInjection}
          </button>
          {!locked && (
            <button
              type="button"
              class="is-danger"
              data-injection-discard
              disabled={discardDisabled}
              title={
                discardDisabled
                  ? RECORD.noDraftToDiscard
                  : RECORD.discardDraftDescription
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
  needsReview,
  todayQueue,
  injectionRecords,
  onQueueItemOpen,
  onRecordOpen,
  onStartNewInjection,
}: RenderWorkflowOptions): ComponentChildren {
  if (workflow === "home") {
    return (
      <StartCenter
        needsReview={needsReview}
        todayQueue={todayQueue}
        injectionRecords={injectionRecords}
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
      <span>{SHELL.notePanelUnavailable}</span>
    </div>
  );
}

interface PatientBannerProps {
  patient: PatientContext;
  workflowPatient?: PatientContext;
  mismatch: boolean;
  selectedWorkflow: WorkflowId;
  workflowStateLabel: string;
  onUseWorkflowPatient?: (workflow: WorkflowId) => void;
  onSelectLocalRecord?: () => void;
}

function PatientBanner({
  patient,
  workflowPatient,
  mismatch,
  selectedWorkflow,
  workflowStateLabel,
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
        : `${SHELL.noteType.toUpperCase()}: ${WORKFLOW_LABELS[selectedWorkflow].toUpperCase()}`
      : `${medicationContextPrefix}${SHELL.noteType.toUpperCase()}: ${WORKFLOW_LABELS[selectedWorkflow].toUpperCase()} · ${SHELL.status.toUpperCase()}: ${workflowStateLabel.toUpperCase()}`;
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

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div class="cd2004-shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
