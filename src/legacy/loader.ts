import legacyMarkup from './legacy-markup.html?raw';

export type WorkflowId =
  | 'home'
  | 'administer'
  | 'uds'
  | 'samples'
  | 'forms'
  | 'tms'
  | 'reference'
  | 'log';

const PANEL_SELECTORS: Record<WorkflowId, string> = {
  home: '#panel-home',
  administer: '#panel-administer',
  uds: '#panel-uds',
  samples: '#panel-samples',
  forms: '#panel-forms',
  tms: '#panel-tms',
  reference: '#panel-reference',
  log: '#panel-log',
};

const PRINT_IDS = [
  'avsSheet',
  'letterSheet',
  'udsSheet',
  'udsPatientSheet',
  'dailySheet',
  'sampleSheet',
  'sampleWorksheetSheet',
  'injWorksheetSheet',
] as const;

export type LegacyInjectionRecordLifecycle =
  | 'new'
  | 'draft'
  | 'locked'
  | 'saving'
  | 'error';

export interface LegacyInjectionRecordState {
  lifecycle: LegacyInjectionRecordLifecycle;
  canDiscard: boolean;
  activeRecordId?: string;
  detail?: string;
}

export interface LegacyInjectionAttestation {
  staff: string;
  timestamp: string;
  statementVersion: string;
}

export interface LegacyInjectionAttestationSummary {
  lifecycle: LegacyInjectionRecordLifecycle;
  canAttest: boolean;
  activeRecordId?: string;
  patient: { name: string; dob: string };
  localRecord: string;
  medication: string;
  disposition: string;
  staff: string;
  timestamp: string;
  attestation?: LegacyInjectionAttestation;
  detail?: string;
}

interface LegacyRecordsBridge {
  open: (id: string) => boolean | void;
  create: () => boolean | void;
  discard: () => boolean | void;
  attestAndLock: (attestation: LegacyInjectionAttestation) => boolean | void;
  attestationSummary: () => LegacyInjectionAttestationSummary;
  state: () => LegacyInjectionRecordState;
}

declare global {
  interface Window {
    IPMGNavigation?: {
      activate: (workflow: WorkflowId, options?: Record<string, unknown>) => void;
      focusPanel?: (workflow: WorkflowId) => void;
      state?: { active?: WorkflowId };
      reducedMotion?: boolean;
    };
    getStoredStaff?: () => string;
    renderHome?: () => void;
    render?: () => unknown;
    renderUdsNote?: () => unknown;
    renderSampleHandout?: () => unknown;
    renderForms?: () => unknown;
    _note?: { cc?: string; as?: string; pl?: string };
    _udsNote?: { cc?: string; as?: string; pl?: string };
    IPMGRecords?: LegacyRecordsBridge;
  }
}

export interface LegacyRuntime {
  staging: HTMLElement;
  legacyWrap: HTMLElement;
  panels: Record<WorkflowId, HTMLElement>;
  activate: (workflow: WorkflowId) => void;
  activeWorkflow: () => WorkflowId;
  openRecords: () => void;
  openInjectionRecord: (id: string) => boolean;
  startNewInjection: () => boolean;
  discardInjectionDraft: () => boolean;
  injectionRecordState: () => LegacyInjectionRecordState;
  attestAndLockInjection: (attestation: LegacyInjectionAttestation) => boolean;
  injectionAttestationSummary: () => LegacyInjectionAttestationSummary;
  saveDraft: () => boolean;
  reviewOrComplete: () => boolean;
  focusOutput: () => boolean;
  resetLayoutState: () => void;
}

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

function loadClassicScript(source: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-legacy-runtime="${source}"]`,
  );
  if (existing?.dataset.loaded === 'true') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.src = source;
    script.async = false;
    script.dataset.legacyRuntime = source;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => reject(new Error(`Unable to load ${source}`)),
      { once: true },
    );
    if (!existing) document.body.append(script);
  });
}

function requiredElement<T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required legacy element: ${selector}`);
  return element;
}

function movePrintSurfaces(): void {
  const printRoot = requiredElement<HTMLElement>('#print-root');
  for (const id of PRINT_IDS) {
    const sheet = document.getElementById(id);
    if (sheet) printRoot.append(sheet);
  }
}

function currentWorkflow(): WorkflowId {
  const fromController = window.IPMGNavigation?.state?.active;
  if (fromController && fromController in PANEL_SELECTORS) return fromController;
  const selected = document.querySelector<HTMLElement>('.tab.on[data-tab]')?.dataset.tab;
  return selected && selected in PANEL_SELECTORS ? (selected as WorkflowId) : 'home';
}

function clickFirst(selectors: string[]): boolean {
  for (const selector of selectors) {
    const control = document.querySelector<HTMLElement>(selector);
    if (!control || control.matches('[disabled],[aria-disabled="true"]')) continue;
    control.click();
    return true;
  }
  return false;
}

function fallbackInjectionRecordState(): LegacyInjectionRecordState {
  const status = document.getElementById('injRecordStatus')?.textContent ?? '';
  if (/completed|locked/i.test(status)) {
    return { lifecycle: 'locked', canDiscard: false };
  }
  if (/saving/i.test(status)) return { lifecycle: 'saving', canDiscard: false };
  if (/failed|could not be saved/i.test(status)) {
    return { lifecycle: 'error', canDiscard: false };
  }
  if (/saved/i.test(status)) return { lifecycle: 'draft', canDiscard: true };
  return { lifecycle: 'new', canDiscard: false };
}

function fallbackInjectionAttestationSummary(): LegacyInjectionAttestationSummary {
  const state = fallbackInjectionRecordState();
  const patientName = document.querySelector<HTMLInputElement>('#ptName')?.value ?? '';
  const patientDob = document.querySelector<HTMLInputElement>('#ptDOB')?.value ?? '';
  const staff = document.querySelector<HTMLInputElement>('#tech')?.value ?? '';
  const medication =
    document.querySelector<HTMLElement>('#medName')?.textContent?.trim() ?? '';
  const disposition =
    document.querySelector<HTMLElement>('#clinicalDispositionBadge')?.textContent?.trim() ?? '';
  return {
    lifecycle: state.lifecycle,
    canAttest: false,
    activeRecordId: state.activeRecordId,
    patient: { name: patientName, dob: patientDob },
    localRecord: state.activeRecordId || 'Unsaved local draft',
    medication,
    disposition,
    staff,
    timestamp: new Date().toISOString(),
    detail: state.detail,
  };
}

export async function loadLegacyRuntime(): Promise<LegacyRuntime> {
  const staging = requiredElement<HTMLElement>('#legacy-staging');
  staging.innerHTML = legacyMarkup;
  movePrintSurfaces();

  await loadClassicScript('/legacy/legacy-runtime.js?v=6.0.0');
  await waitForDocumentReady();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const legacyWrap = requiredElement<HTMLElement>('.wrap', staging);
  const panels = Object.fromEntries(
    Object.entries(PANEL_SELECTORS).map(([workflow, selector]) => [
      workflow,
      requiredElement<HTMLElement>(selector),
    ]),
  ) as Record<WorkflowId, HTMLElement>;

  const toast = staging.querySelector<HTMLElement>('.toast');
  if (toast) document.body.append(toast);

  return {
    staging,
    legacyWrap,
    panels,
    activate(workflow) {
      if (window.IPMGNavigation?.activate) {
        window.IPMGNavigation.activate(workflow);
        return;
      }
      document.querySelector<HTMLElement>(`.tab[data-tab="${workflow}"]`)?.click();
    },
    activeWorkflow: currentWorkflow,
    openRecords() {
      clickFirst([
        '#recordsDrawerTrigger',
        '[data-records-drawer-open]',
        '#injRecordWorkspace [data-records-drawer-open]',
      ]);
    },
    openInjectionRecord(id) {
      const records = window.IPMGRecords;
      if (!records?.open) return false;
      return records.open(id) !== false;
    },
    startNewInjection() {
      const records = window.IPMGRecords;
      if (!records?.create) return false;
      return records.create() !== false;
    },
    discardInjectionDraft() {
      const records = window.IPMGRecords;
      if (!records?.discard) return false;
      return records.discard() !== false;
    },
    injectionRecordState() {
      return window.IPMGRecords?.state?.() ?? fallbackInjectionRecordState();
    },
    attestAndLockInjection(attestation) {
      const records = window.IPMGRecords;
      if (!records?.attestAndLock) return false;
      return records.attestAndLock(attestation) !== false;
    },
    injectionAttestationSummary() {
      return (
        window.IPMGRecords?.attestationSummary?.() ??
        fallbackInjectionAttestationSummary()
      );
    },
    saveDraft() {
      if (currentWorkflow() !== 'administer') return false;
      const invoked = clickFirst(['#injRecordWorkspace [data-inj-save]']);
      if (!invoked) return false;
      const status = document.getElementById('injRecordStatus')?.textContent ?? '';
      return !/save failed|could not be saved/i.test(status);
    },
    reviewOrComplete() {
      const workflow = currentWorkflow();
      if (workflow === 'administer') {
        return clickFirst([
          '#injRecordWorkspace [data-inj-complete]',
          '#clinicalDisposition [data-disposition="administered"]',
        ]);
      }
      return clickFirst([
        `#panel-${workflow} [data-complete]`,
        `#panel-${workflow} .primary`,
      ]);
    },
    focusOutput() {
      const panel = panels[currentWorkflow()];
      const target = panel.querySelector<HTMLElement>(
        '.preview-col, .note-preview, .output-tray, [data-output-tray]',
      );
      if (!target) return false;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: false });
      const reducedMotion = globalThis.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      target.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      return true;
    },
    resetLayoutState() {
      document.body.classList.remove(
        'cd-nav-minimized',
        'cd-inspector-minimized',
        'cd-work-maximized',
      );
    },
  };
}
