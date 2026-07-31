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
  }
}

export interface LegacyRuntime {
  staging: HTMLElement;
  legacyWrap: HTMLElement;
  panels: Record<WorkflowId, HTMLElement>;
  activate: (workflow: WorkflowId) => void;
  activeWorkflow: () => WorkflowId;
  openRecords: () => void;
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
    saveDraft() {
      if (currentWorkflow() !== 'administer') return false;
      return clickFirst(['#injRecordWorkspace [data-inj-save]']);
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
