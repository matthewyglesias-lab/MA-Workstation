import type { ComponentChildren, Ref } from "preact";

export type WorkflowId =
  | "home"
  | "administer"
  | "uds"
  | "samples"
  | "forms"
  | "reference"
  | "log"
  | "tms";

export type DesktopPane = "navigator" | "work" | "inspector";
export type ClinicalTone = "neutral" | "ready" | "warning" | "stop" | "info";

export type DesktopIconName =
  | WorkflowId
  | "save"
  | "records"
  | "note"
  | "print"
  | "reset"
  | "patient"
  | "staff"
  | "location"
  | "alert"
  | "check";

export interface PatientContext {
  name?: string;
  dob?: string;
  medicalRecordNumber?: string;
  /** Browser-local record identity; never presented as a server MRN. */
  localRecordId?: string;
  visitLabel?: string;
  medicationLabel?: string;
  allergyStatus?: string;
  sourceWorkflow?: WorkflowId;
}

export interface WorkflowSummary {
  workflow: WorkflowId;
  label?: string;
  detail?: string;
  state?: "idle" | "draft" | "ready" | "attention" | "locked";
  count?: number;
}

export interface ReadinessItem {
  id: string;
  label: string;
  detail?: string;
  state: "complete" | "pending" | "warning" | "stop";
}

export interface WorkQueueItem {
  id: string;
  workflow: WorkflowId;
  patientLabel: string;
  detail: string;
  timeLabel?: string;
  tone?: ClinicalTone;
  actionLabel?: string;
}

export interface InjectionRecordRow {
  id: string;
  patientLabel: string;
  medicationLabel: string;
  administeredLabel: string;
  statusLabel: string;
  tone?: ClinicalTone;
}

export interface NoteSection {
  id: string;
  label: string;
  content: string;
  destination?: string;
}

/** The persistence/lock state of the active local injection record. */
export type InjectionRecordLifecycle =
  | "new"
  | "draft"
  | "locked"
  | "saving"
  | "error";

/**
 * Injection lifecycle controls have one visible home in the worksheet. The
 * menu, toolbar, and function keys accelerate these same actions; they are
 * not alternate record-management surfaces.
 */
export interface InjectionRecordActions {
  lifecycle: InjectionRecordLifecycle;
  detail?: string;
  /** First typed clinical blocker, when one exists. */
  blockingDetail?: string;
  canDiscard: boolean;
  onStartNew: () => void;
  onDiscard: () => void;
}

export interface LegacyPanelAdapter {
  /** Existing panel selector, for example `#panel-administer`. */
  selector: string;
  /** Optional resolver for panels that are not direct document descendants. */
  resolve?: () => HTMLElement | null;
  /** Class applied while the panel is hosted in the classic desktop. */
  mountedClassName?: string;
  /** Invoked after the existing node is moved into its presentation host. */
  onMount?: (panel: HTMLElement, host: HTMLElement) => void;
  /** Invoked immediately before the existing node is restored. */
  onUnmount?: (panel: HTMLElement) => void;
}

export interface WorkflowRenderContext {
  workflow: WorkflowId;
  hostRef: Ref<HTMLDivElement>;
  patient: PatientContext;
  isPatientContextMismatched: boolean;
}

export interface ClinicalDesktopShellProps {
  organizationName?: string;
  versionLabel?: string;
  activeWorkflow?: WorkflowId;
  defaultActiveWorkflow?: WorkflowId;
  onWorkflowChange?: (workflow: WorkflowId) => void;
  patient?: PatientContext;
  workflowPatient?: PatientContext;
  onUseWorkflowPatient?: (workflow: WorkflowId) => void;
  staffLabel?: string;
  locationLabel?: string;
  localStorageAvailable?: boolean;
  workflowSummaries?: Partial<Record<WorkflowId, WorkflowSummary>>;
  needsReview?: WorkQueueItem[];
  todayQueue?: WorkQueueItem[];
  injectionRecords?: InjectionRecordRow[];
  readiness?: ReadinessItem[];
  noteSections?: NoteSection[];
  noteTitle?: string;
  noteSubtitle?: string;
  workflowSlots?: Partial<Record<WorkflowId, ComponentChildren>>;
  legacyPanels?: Partial<Record<WorkflowId, LegacyPanelAdapter>>;
  renderWorkflow?: (
    workflow: WorkflowId,
    context: WorkflowRenderContext,
  ) => ComponentChildren;
  postState?: "idle" | "posting" | "posted" | "error";
  postMessage?: string;
  canComplete?: boolean;
  statusMessage?: string;
  onSaveDraft?: () => void;
  onReviewComplete?: () => void;
  injectionRecordActions?: InjectionRecordActions;
  onStartNewInjection?: () => void;
  onOpenRecords?: () => void;
  /** A truthful, local contextual lookup (currently the local Record List). */
  onLookup?: () => void;
  /** Opens the local documenting-staff sign-in dialog. */
  onOpenStaff?: () => void;
  /** Opens the local visit-location dialog. */
  onOpenLocation?: () => void;
  onOpenKnowledge?: () => void;
  onOpenCloseout?: () => void;
  onCopyNoteSection?: (section: NoteSection) => void;
  onCopyAllNotes?: () => void;
  onQueueItemOpen?: (item: WorkQueueItem) => void;
  onRecordOpen?: (record: InjectionRecordRow) => void;
  onEscape?: () => void;
  onWorkAreaReady?: (element: HTMLDivElement | null) => void;
  className?: string;
}

export const WORKFLOW_ORDER: WorkflowId[] = [
  "home",
  "administer",
  "uds",
  "samples",
  "forms",
  "reference",
  "log",
  "tms",
];

export const WORKFLOW_LABELS: Record<WorkflowId, string> = {
  home: "Start Center",
  administer: "Injection",
  uds: "UDS",
  samples: "Samples",
  forms: "Forms",
  reference: "Knowledge",
  log: "Daily Closeout",
  tms: "Future / TMS",
};

/**
 * Add this attribute to the first action that should receive focus after a
 * browser-local record is locked (for example, “Open read-only record”).
 */
export const LOCKED_RECORD_ACTION_SELECTOR = "[data-locked-record-action]";
