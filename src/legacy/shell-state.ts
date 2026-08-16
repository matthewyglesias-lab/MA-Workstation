import type {
  InjectionRecordRow,
  NoteSection,
  PatientContext,
  ReadinessItem,
  WorkflowId as DesktopWorkflowId,
  WorkflowSummary,
  WorkQueueItem,
} from '../presentation';
import type { LegacyRuntime, WorkflowId } from './loader';

declare global {
  interface Window {
    sampleNoteText?: () => string;
    formsNoteText?: () => string;
  }
}

interface StoredActivity {
  type?: string;
  status?: string;
  time?: string;
  pt?: string;
  summary?: string;
  details?: string;
  trace?: string;
  follow?: string;
  by?: string;
}

interface StoredInjectionRecord {
  id?: string;
  status?: string;
  updatedAt?: string;
  completedAt?: string;
  patient?: { name?: string; dob?: string };
  summary?: string;
  snapshot?: {
    medKey?: string;
    state?: { dose?: string; site?: string; route?: string };
    fields?: Record<string, unknown>;
  };
  addenda?: unknown[];
  [key: string]: unknown;
}

export interface LegacyShellSnapshot {
  activeWorkflow: WorkflowId;
  workflowPatients: Record<WorkflowId, PatientContext>;
  staffLabel: string;
  locationLabel: string;
  localStorageAvailable: boolean;
  workflowSummaries: Partial<Record<DesktopWorkflowId, WorkflowSummary>>;
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
  injectionRecords: InjectionRecordRow[];
  readiness: ReadinessItem[];
  noteSections: NoteSection[];
  noteTitle: string;
  noteSubtitle: string;
  canComplete: boolean;
  postState: 'idle' | 'posting' | 'posted' | 'error';
  statusMessage: string;
}

const PATIENT_FIELDS: Partial<
  Record<WorkflowId, { name: string; dob: string }>
> = {
  administer: { name: 'ptName', dob: 'ptDOB' },
  uds: { name: 'udsPtName', dob: 'udsDOB' },
  samples: { name: 'samplePtName', dob: 'sampleDOB' },
  forms: { name: 'formsPtName', dob: 'formsDOB' },
};

const NOTE_TITLES: Partial<Record<WorkflowId, string>> = {
  administer: 'Injection documentation',
  uds: 'UDS clinician handoff',
  samples: 'Sample dispensing note',
  forms: 'Forms handoff note',
};

function value(id: string): string {
  const control = document.getElementById(id) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
  return String(control?.value ?? '').trim();
}

function text(selector: string): string {
  return String(document.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function patientFor(workflow: WorkflowId): PatientContext {
  const fields = PATIENT_FIELDS[workflow];
  if (!fields) return {};
  return {
    name: value(fields.name),
    dob: value(fields.dob),
    sourceWorkflow: workflow,
  };
}

export function applyPatientToEmptyWorkflow(
  workflow: WorkflowId,
  patient: PatientContext,
): boolean {
  const fields = PATIENT_FIELDS[workflow];
  if (!fields || (!patient.name && !patient.dob)) return false;
  const nameControl = document.getElementById(fields.name) as HTMLInputElement | null;
  const dobControl = document.getElementById(fields.dob) as HTMLInputElement | null;
  if (!nameControl || !dobControl || nameControl.value.trim() || dobControl.value.trim()) {
    return false;
  }

  nameControl.value = patient.name ?? '';
  dobControl.value = patient.dob ?? '';
  for (const control of [nameControl, dobControl]) {
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

function safeStorageArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function localDateKey(date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function workflowFromStored(type?: string): DesktopWorkflowId {
  if (type === 'injection') return 'administer';
  if (type === 'sample') return 'samples';
  if (type === 'forms') return 'forms';
  return 'uds';
}

function activityTone(status?: string): 'ready' | 'warning' {
  return status === 'needs_review' ? 'warning' : 'ready';
}

function activityLabel(activity: StoredActivity): string {
  return activity.summary || activity.details || 'Clinical activity';
}

function readQueues(): {
  needsReview: WorkQueueItem[];
  todayQueue: WorkQueueItem[];
} {
  const activities = safeStorageArray<StoredActivity>(
    `ipmgMedAssistActivityLog_${localDateKey()}`,
  );

  const todayQueue = activities
    .slice()
    .reverse()
    .map<WorkQueueItem>((activity, index) => ({
      id: `activity-${activities.length - index}`,
      workflow: workflowFromStored(activity.type),
      patientLabel: activity.pt || 'No patient entered',
      detail: activityLabel(activity),
      timeLabel: activity.time,
      tone: activityTone(activity.status),
      actionLabel: 'Open workflow',
    }));

  return {
    todayQueue,
    needsReview: todayQueue.filter((item) => item.tone === 'warning'),
  };
}

function readInjectionRecords(): InjectionRecordRow[] {
  return safeStorageArray<StoredInjectionRecord>(
    'ipmgMedAssistInjectionRecordsV1',
  )
    .filter((record) => record && record.id)
    .sort((left, right) =>
      String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')),
    )
    .map((record) => {
      const state = record.snapshot?.state ?? {};
      const medication =
        record.summary ||
        [record.snapshot?.medKey, state.dose].filter(Boolean).join(' ') ||
        'Medication not selected';
      return {
        id: String(record.id),
        patientLabel: record.patient?.name || 'Untitled injection',
        medicationLabel: medication,
        administeredLabel:
          state.site || state.route
            ? [state.route, state.site].filter(Boolean).join(' · ')
            : 'No administration site',
        statusLabel: record.status === 'completed' ? 'Locked' : 'Draft',
        tone: record.status === 'completed' ? 'ready' : 'warning',
      };
    });
}

function noteSectionsFor(workflow: WorkflowId): NoteSection[] {
  if (workflow === 'administer') {
    const note = window._note ?? {};
    return [
      { id: 'cc', label: 'CC', destination: 'CC', content: note.cc ?? '', sourceTarget: { workflow: 'administer', tab: 'order', field: 'reason' } as NoteSection['sourceTarget'] },
      {
        id: 'assessment',
        label: 'Assessment',
        destination: 'Assessment',
        content: note.as ?? '',
        sourceTarget: { workflow: 'administer', tab: 'administration', field: 'site' } as NoteSection['sourceTarget'],
      },
      {
        id: 'plan',
        label: 'Plan',
        destination: 'Plan',
        content: note.pl ?? '',
        sourceTarget: { workflow: 'administer', tab: 'review', field: 'response' } as NoteSection['sourceTarget'],
      },
    ].filter((section) => section.content);
  }

  if (workflow === 'uds') {
    const note = window._udsNote ?? {};
    return [
      { id: 'cc', label: 'First line', content: note.cc ?? '', sourceTarget: { workflow: 'uds', tab: 'specimen', field: 'reason' } as NoteSection['sourceTarget'] },
      { id: 'assessment', label: 'Handoff body', content: note.as ?? '', sourceTarget: { workflow: 'uds', tab: 'results', field: 'results' } as NoteSection['sourceTarget'] },
      { id: 'plan', label: 'Footer details', content: note.pl ?? '', sourceTarget: { workflow: 'uds', tab: 'review', field: 'medicationAlignment' } as NoteSection['sourceTarget'] },
    ].filter((section) => section.content);
  }

  if (workflow === 'samples') {
    const content = window.sampleNoteText?.() ?? '';
    return content
      ? [{ id: 'note', label: 'Tebra note', destination: 'Note', content }]
      : [];
  }

  if (workflow === 'forms') {
    const content = window.formsNoteText?.() ?? text('#formsNotePreview');
    return content
      ? [{ id: 'note', label: 'Tebra note', destination: 'Note', content }]
      : [];
  }

  return [];
}

function readinessState(element: Element): ReadinessItem['state'] {
  const marker = `${element.className} ${element.textContent}`.toLowerCase();
  if (/danger|error|stop|blocked|missing|required/.test(marker)) return 'stop';
  if (/warn|attention|review|pending|needs/.test(marker)) return 'warning';
  if (/complete|ready|confirmed|done|ok/.test(marker)) return 'complete';
  return 'pending';
}

function readReadiness(runtime: LegacyRuntime, workflow: WorkflowId): ReadinessItem[] {
  const panel = runtime.panels[workflow];
  const candidates = panel.querySelectorAll(
    '.rc530-ready-card li, .qa-list li, .qa-panel li, .qa-item, [data-readiness-item]',
  );
  const seen = new Set<string>();
  return [...candidates]
    .map((element, index) => {
      const labelNode = element.querySelector<HTMLElement>(
        ':scope b, :scope strong, :scope .label, :scope .title, :scope > span > b, :scope > span > strong',
      );
      const detailNode = element.querySelector<HTMLElement>(
        ':scope small, :scope .detail, :scope .sub, :scope > span > span',
      );
      const fullText = String(element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const label =
        String(labelNode?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim() || fullText;
      const detail = String(detailNode?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      const key = `${label}\u0000${detail}`;
      if (!label || seen.has(key)) return null;
      seen.add(key);
      const item: ReadinessItem = {
        id: `${workflow}-readiness-${index}`,
        label,
        state: readinessState(element),
      };
      if (detail && detail !== label) item.detail = detail;
      return item;
    })
    .filter((item): item is ReadinessItem => item !== null)
    .slice(0, 10);
}

function storageAvailable(): boolean {
  try {
    void window.localStorage.length;
    return true;
  } catch {
    return false;
  }
}

function clinicalBridgeSnapshot(): ReturnType<
  NonNullable<Window['ipmgLegacyClinicalStateSnapshot']>
> {
  try {
    return window.ipmgLegacyClinicalStateSnapshot?.() ?? {};
  } catch {
    return {};
  }
}

/**
 * Intentional defaults are reminders, not evidence that a transaction was
 * started. Keep the shell/worklist state aligned with the typed evaluators so
 * a blank Injection or UDS worksheet does not light up as a draft or warning.
 */
function hasMeaningfulWorkflowDocumentation(
  workflow: WorkflowId,
  panel: HTMLElement,
): boolean {
  const bridge = clinicalBridgeSnapshot();
  const hasText = (...ids: string[]) => ids.some((id) => Boolean(value(id)));

  if (workflow === 'administer') {
    const injection = bridge.injection ?? {};
    const disposition = injection.disposition as { kind?: unknown } | undefined;
    return Boolean(
      hasText('ptName', 'ptDOB', 'lot') ||
        String(injection.medicationKey ?? '').trim() ||
        String(injection.dose ?? '').trim() ||
        String(injection.reason ?? '').trim() ||
        String(disposition?.kind ?? '').trim(),
    );
  }

  if (workflow === 'uds') {
    const uds = bridge.uds ?? {};
    const profile = window.__IPMG_RC538_UDS_PROFILE__;
    const anyResult = Object.values(uds.results ?? {}).some(
      (state) => String(state) !== 'nt',
    );
    return Boolean(
      hasText(
        'udsPtName',
        'udsDOB',
        'udsCollector',
        'udsDateTime',
        'udsDevice',
        'udsLot',
        'udsExp',
        'udsComment',
      ) ||
        String(uds.reason ?? '').trim() ||
        (uds.temperature && uds.temperature !== 'not documented') ||
        (uds.control && uds.control !== 'not documented') ||
        (uds.validity && uds.validity !== 'not documented') ||
        String(uds.medicationAlignment ?? '').trim() ||
        (uds.labPlan && uds.labPlan !== 'provider to decide') ||
        String(profile?.reasonDetail ?? '').trim() ||
        String(profile?.customDeviceName ?? '').trim() ||
        anyResult,
    );
  }

  return [...panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea',
  )].some((control) =>
    control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)
      ? control.checked
      : Boolean(control.value.trim()),
  );
}

function summaryState(workflow: WorkflowId): WorkflowSummary['state'] {
  const panel = document.querySelector<HTMLElement>(
    workflow === 'reference' ? '#panel-reference' : `#panel-${workflow}`,
  );
  if (!panel) return 'idle';
  if (panel.classList.contains('record-readonly')) return 'locked';
  const hasValue = hasMeaningfulWorkflowDocumentation(workflow, panel);
  if (!hasValue) return 'idle';
  const blocked = panel.querySelector(
    '[aria-invalid="true"], .danger, .error, .rc530-block',
  );
  return blocked ? 'attention' : 'draft';
}

export function readLegacyShellSnapshot(runtime: LegacyRuntime): LegacyShellSnapshot {
  const activeWorkflow = runtime.activeWorkflow();
  const queues = readQueues();
  const injectionRecords = readInjectionRecords();
  const workflowPatients = Object.fromEntries(
    (Object.keys(runtime.panels) as WorkflowId[]).map((workflow) => [
      workflow,
      patientFor(workflow),
    ]),
  ) as Record<WorkflowId, PatientContext>;

  const staffLabel =
    text('#staffCurrent') || value('staffSignIn') || 'Not signed in';
  const selectedClinic = document.querySelector<HTMLOptionElement>(
    '#clinic option:checked',
  );
  const locationLabel =
    (selectedClinic?.value ? selectedClinic.textContent?.trim() : '') ||
    text('#clinicLocationHint') ||
    'Clinic not selected';
  const completeButton = document.querySelector<HTMLButtonElement>(
    '#injRecordWorkspace [data-inj-complete]',
  );
  const locked = runtime.panels.administer.classList.contains('record-readonly');
  const saveFailed = /save failed|could not be saved/i.test(
    text('#injRecordStatus') || text('#toastMsg'),
  );

  const workflowSummaries = Object.fromEntries(
    (Object.keys(runtime.panels) as WorkflowId[]).map((workflow) => [
      workflow,
      {
        workflow,
        state: summaryState(workflow),
        count:
          workflow === 'administer'
            ? injectionRecords.length
            : workflow === 'log'
              ? queues.todayQueue.length
              : undefined,
      } satisfies WorkflowSummary,
    ]),
  ) as Partial<Record<DesktopWorkflowId, WorkflowSummary>>;

  return {
    activeWorkflow,
    workflowPatients,
    staffLabel,
    locationLabel,
    localStorageAvailable: storageAvailable(),
    workflowSummaries,
    needsReview: queues.needsReview,
    todayQueue: queues.todayQueue,
    injectionRecords,
    readiness: readReadiness(runtime, activeWorkflow),
    noteSections: noteSectionsFor(activeWorkflow),
    noteTitle: NOTE_TITLES[activeWorkflow] ?? 'Note / Readiness',
    noteSubtitle:
      activeWorkflow === 'home'
        ? 'Open a workflow to preview its documentation.'
        : 'Live local documentation preview.',
    canComplete: Boolean(completeButton && !completeButton.disabled),
    postState: saveFailed ? 'error' : locked ? 'posted' : 'idle',
    statusMessage:
      text('#injRecordStatus') ||
      text('#clinicalDispositionMessage') ||
      `${NOTE_TITLES[activeWorkflow] ?? 'Workstation'} ready.`,
  };
}

export function copyLegacyNoteSection(
  workflow: WorkflowId,
  sectionId: string,
): boolean {
  const selectors: Partial<Record<WorkflowId, Record<string, string>>> = {
    administer: {
      cc: '[data-copy="cc"]',
      assessment: '[data-copy="as"]',
      plan: '[data-copy="pl"]',
    },
    uds: {
      cc: '[data-udscopy="cc"]',
      assessment: '[data-udscopy="as"]',
      plan: '[data-udscopy="pl"]',
    },
  };
  const selector = selectors[workflow]?.[sectionId];
  if (!selector) return false;
  document.querySelector<HTMLElement>(selector)?.click();
  return true;
}

export function copyAllLegacyNotes(workflow: WorkflowId): boolean {
  const selector: Partial<Record<WorkflowId, string>> = {
    administer: '#copyAll',
    uds: '#udsCopyAll',
    samples: '#sampleCopy',
    forms: '#formsCopy',
  };
  const control = selector[workflow]
    ? document.querySelector<HTMLElement>(selector[workflow]!)
    : null;
  if (!control) return false;
  control.click();
  return true;
}
