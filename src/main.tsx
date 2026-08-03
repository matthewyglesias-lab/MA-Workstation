import { render } from 'preact';
import { RecordsWindow } from './presentation/RecordsWindow';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ClinicalDesktopShell,
  ContextDialog,
  LegacyWorkflowHost,
  WORKFLOW_LABELS,
  type ClinicOption,
  type LegacyPanelAdapter,
  type PatientContext,
  type ReadinessItem,
  type ToolbarAction,
  type WorkflowId,
  type WorkflowRenderContext,
  type WorkQueueItem,
  type InjectionRecordRow,
} from './presentation';
import { FormsPanel } from './presentation/workflows/forms/FormsPanel';
import { UdsPanel } from './presentation/workflows/uds/UdsPanel';
import { InjectionPanel } from './presentation/workflows/injection/InjectionPanel';
import { SamplesPanel } from './presentation/workflows/samples/SamplesPanel';
import { TmsPanel } from './presentation/workflows/tms/TmsPanel';
import { KnowledgePanel } from './presentation/workflows/knowledge/KnowledgePanel';
import { DailyCloseoutPanel } from './presentation/workflows/log/DailyCloseoutPanel';
import {
  createClinicalCoordinator,
  selectClinicalEvaluation,
  selectClinicalMirrorAgreement,
  type ApplicationWorkflow,
  type ClinicalCoordinatorSnapshot,
  type ClinicalEncounterSource,
  type ClinicalWorkflow,
} from './application';
import { loadLegacyRuntime, type LegacyRuntime } from './legacy/loader';
import { installLegacyDocumentationAdapter } from './legacy/documentation-adapter';
import { createLegacyClinicalSource } from './legacy/clinical-source';
import type { InjectionEncounter } from './domain/injection';
import {
  copyAllLegacyNotes,
  copyLegacyNoteSection,
  readLegacyShellSnapshot,
  type LegacyShellSnapshot,
} from './legacy/shell-state';

declare global {
  interface Window {
    ipmgInjectionRecordGeneration?: () => number;
  }
}

type ContextEditor = 'staff' | 'location' | null;

const DESKTOP_TO_APPLICATION: Record<WorkflowId, ApplicationWorkflow> = {
  home: 'dashboard',
  administer: 'injection',
  uds: 'uds',
  samples: 'samples',
  forms: 'forms',
  reference: 'knowledge',
  log: 'closeout',
  tms: 'future',
};

const APPLICATION_TO_DESKTOP: Record<ApplicationWorkflow, WorkflowId> = {
  dashboard: 'home',
  injection: 'administer',
  uds: 'uds',
  samples: 'samples',
  forms: 'forms',
  records: 'administer',
  knowledge: 'reference',
  closeout: 'log',
  future: 'tms',
};

const DESKTOP_TO_CLINICAL: Partial<Record<WorkflowId, ClinicalWorkflow>> = {
  administer: 'injection',
  uds: 'uds',
  samples: 'samples',
  forms: 'forms',
};

function sameSnapshot(
  left: LegacyShellSnapshot,
  right: LegacyShellSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function paritySafeReadiness(
  legacy: ReadinessItem[],
  clinical: ClinicalCoordinatorSnapshot,
  workflow: WorkflowId,
): {
  readiness: ReadinessItem[];
  typedAggregateMatched: boolean;
} {
  const clinicalWorkflow = DESKTOP_TO_CLINICAL[workflow];
  const evaluation = clinicalWorkflow
    ? selectClinicalEvaluation(clinical, clinicalWorkflow)
    : undefined;
  const agreement = selectClinicalMirrorAgreement(
    evaluation,
    legacy.map((item) => item.state),
  );
  if (!agreement?.agrees || agreement.engineReadiness === 'idle') {
    return { readiness: legacy, typedAggregateMatched: false };
  }
  return {
    readiness: [
      ...legacy,
      {
        id: `${workflow}-typed-clinical-mirror`,
        label: 'Typed engine shadow',
        detail: agreement.detail,
        state: agreement.state,
      },
    ],
    typedAggregateMatched: true,
  };
}

function readClinicOptions(): ClinicOption[] {
  const select = document.getElementById('clinic') as HTMLSelectElement | null;
  if (!select) return [{ value: '', label: 'Select visit location' }];
  return [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent?.trim() || option.value || 'Select visit location',
  }));
}

function setLegacyStaff(value: string): void {
  const input = document.getElementById('staffSignIn') as HTMLInputElement | null;
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('staffApply')?.click();
}

function clearLegacyStaff(): void {
  document.getElementById('staffClear')?.click();
}

function setLegacyLocation(value: string): void {
  const select = document.getElementById('clinic') as HTMLSelectElement | null;
  if (!select) return;
  select.value = value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function activeClinicValue(): string {
  const select = document.getElementById('clinic') as HTMLSelectElement | null;
  return select?.value ?? '';
}

function activeStaffValue(): string {
  const input = document.getElementById('staffSignIn') as HTMLInputElement | null;
  return input?.value ?? '';
}

// Reads the injection encounter straight from the legacy DOM, bypassing the
// coordinator's cross-workflow active-patient inheritance in synchronize().
// That inheritance is right for switching between workflows mid-visit, but
// wrong for InjectionPanel's own remount after "+ New"/open-a-different-
// record: legacy's own newInjection() clears #ptName with no auto-refill, so
// the panel's fresh mount must see that same genuinely-blank patient instead
// of picking up a stale still-active patient from another workflow.
function rawInjectionEncounter(source: ClinicalEncounterSource): InjectionEncounter {
  return source.read('injection').encounter as InjectionEncounter;
}

function LegacyDesktopApp({ runtime }: { runtime: LegacyRuntime }) {
  const [snapshot, setSnapshot] = useState<LegacyShellSnapshot>(() =>
    readLegacyShellSnapshot(runtime),
  );
  const clinicalSource = useMemo(() => createLegacyClinicalSource(), [runtime]);
  const coordinator = useMemo(
    () =>
      createClinicalCoordinator({
        source: clinicalSource,
      }),
    [clinicalSource],
  );
  const [clinical, setClinical] = useState<ClinicalCoordinatorSnapshot>(() => {
    coordinator.navigate(DESKTOP_TO_APPLICATION[runtime.activeWorkflow()]);
    return coordinator.synchronize();
  });
  const [contextEditor, setContextEditor] = useState<ContextEditor>(null);
  const [posting, setPosting] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const formsPanelRef = useRef<HTMLDivElement | null>(null);
  const udsPanelRef = useRef<HTMLDivElement | null>(null);
  const injectionPanelRef = useRef<HTMLDivElement | null>(null);
  const samplesPanelRef = useRef<HTMLDivElement | null>(null);
  // Bumped only when the active injection record genuinely changes (opening
  // a different saved record, or starting a new one) - not when a fresh
  // draft's first autosave silently assigns it an id - so InjectionPanel's
  // internal typed state can be reset via `key` without discarding in-flight
  // typing on every autosave tick.
  const [injectionRecordEpoch, setInjectionRecordEpoch] = useState(0);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const injectionRecordGenerationRef = useRef(0);

  const refresh = () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      const next = readLegacyShellSnapshot(runtime);
      const activeApplicationWorkflow =
        DESKTOP_TO_APPLICATION[next.activeWorkflow];
      if (
        coordinator.getSnapshot().state.activeWorkflow !==
        activeApplicationWorkflow
      ) {
        coordinator.navigate(activeApplicationWorkflow);
      }
      coordinator.synchronize();
      if (!sameSnapshot(snapshotRef.current, next)) {
        snapshotRef.current = next;
        setSnapshot(next);
      }
      const nextRecordGeneration = window.ipmgInjectionRecordGeneration?.() ?? 0;
      if (nextRecordGeneration !== injectionRecordGenerationRef.current) {
        injectionRecordGenerationRef.current = nextRecordGeneration;
        setInjectionRecordEpoch((value) => value + 1);
        // A genuine record switch (opening a different saved record, or
        // starting a new one) must not let the coordinator's cross-workflow
        // active-patient inheritance resurrect the previous record's
        // patient into the freshly (un)loaded one - sync the active patient
        // to match whatever the newly active record itself holds, same as
        // legacy's own newInjection()/openRecord() (no ambient inheritance).
        coordinator.setActivePatient(rawInjectionEncounter(clinicalSource).patient);
      }
      setPosting(false);
    }, 55);
  };

  useEffect(
    () =>
      coordinator.subscribe((next) => {
        setClinical(next);
      }),
    [coordinator],
  );

  useEffect(() => {
    const observers = Object.values(runtime.panels).map((panel) => {
      const observer = new MutationObserver(refresh);
      observer.observe(panel, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'class',
          'disabled',
          'aria-disabled',
          'aria-invalid',
          'aria-pressed',
          'value',
        ],
      });
      return observer;
    });
    const shellObserver = new MutationObserver(refresh);
    shellObserver.observe(runtime.legacyWrap, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled', 'aria-invalid'],
    });

    const handleChange = () => refresh();
    const handleTabChange = () => refresh();
    document.addEventListener('input', handleChange, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('ipmg:tabchange', handleTabChange as EventListener);
    window.addEventListener('storage', handleChange);

    return () => {
      observers.forEach((observer) => observer.disconnect());
      shellObserver.disconnect();
      document.removeEventListener('input', handleChange, true);
      document.removeEventListener('change', handleChange, true);
      document.removeEventListener(
        'ipmg:tabchange',
        handleTabChange as EventListener,
      );
      window.removeEventListener('storage', handleChange);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [coordinator, runtime]);

  useEffect(() => {
    document.body.dataset.clinicalCoordinator = 'active';
    document.body.dataset.clinicalEngines =
      'injection uds samples forms';
    return () => {
      delete document.body.dataset.clinicalCoordinator;
      delete document.body.dataset.clinicalEngines;
    };
  }, [coordinator]);

  const legacyPanels = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(runtime.panels) as WorkflowId[])
          // 'forms', 'uds', 'administer' (injection), and 'samples' are
          // migrated to new panels; their legacy panels stay loaded
          // (hidden) only as a print/readiness compatibility mirror. 'tms',
          // 'reference' (Knowledge), and 'log' (Daily Closeout) are also
          // migrated; none of the three has any print/readiness dependency
          // on its own panel being mounted (Daily Closeout's print sheet
          // reads directly from the in-memory activity log, not from the
          // panel DOM), so their legacy panels are simply never mounted.
          .filter(
            (workflow) =>
              workflow !== 'home' &&
              workflow !== 'forms' &&
              workflow !== 'uds' &&
              workflow !== 'administer' &&
              workflow !== 'samples' &&
              workflow !== 'tms' &&
              workflow !== 'reference' &&
              workflow !== 'log',
          )
          .map((workflow) => [
            workflow,
            {
              selector: `#panel-${workflow}`,
              resolve: () => runtime.panels[workflow],
              mountedClassName: 'cd2004-legacy-panel-mounted',
              onMount: (panel: HTMLElement) => {
                panel.classList.add('on');
                panel.setAttribute('aria-hidden', 'false');
              },
            } satisfies LegacyPanelAdapter,
          ]),
      ) as Partial<Record<WorkflowId, LegacyPanelAdapter>>,
    [runtime],
  );

  const renderWorkflow = (
    workflow: WorkflowId,
    context: WorkflowRenderContext,
  ) => {
    if (workflow === 'forms') {
      return (
        <FormsPanel
          initialEncounter={clinical.state.workflows.forms.encounter}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'forms')}
          staffSignInValue={activeStaffValue()}
          previewRef={formsPanelRef}
        />
      );
    }
    if (workflow === 'uds') {
      return (
        <UdsPanel
          initialEncounter={clinical.state.workflows.uds.encounter}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'uds')}
          staffSignInValue={activeStaffValue()}
          previewRef={udsPanelRef}
        />
      );
    }
    if (workflow === 'administer') {
      return (
        <InjectionPanel
          key={injectionRecordEpoch}
          initialEncounter={rawInjectionEncounter(clinicalSource)}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'injection')}
          staffSignInValue={activeStaffValue()}
          previewRef={injectionPanelRef}
          locked={snapshot.postState === 'posted'}
        />
      );
    }
    if (workflow === 'samples') {
      return (
        <SamplesPanel
          initialEncounter={clinical.state.workflows.samples.encounter}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'samples')}
          staffSignInValue={activeStaffValue()}
          previewRef={samplesPanelRef}
        />
      );
    }
    if (workflow === 'tms') {
      return <TmsPanel />;
    }
    if (workflow === 'reference') {
      return <KnowledgePanel />;
    }
    if (workflow === 'log') {
      return <DailyCloseoutPanel />;
    }
    const adapter = legacyPanels[workflow];
    if (adapter) {
      return <LegacyWorkflowHost adapter={adapter} label={WORKFLOW_LABELS[workflow]} />;
    }
    return undefined;
  };

  const openWorkflow = (workflow: WorkflowId) => {
    coordinator.navigate(DESKTOP_TO_APPLICATION[workflow]);
    runtime.activate(workflow);
    coordinator.synchronize();
    refresh();
  };

  const openRecord = (record: InjectionRecordRow) => {
    runtime.openRecords();
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-records-open="${CSS.escape(record.id)}"]`)
        ?.click();
      refresh();
    }, 60);
  };

  const toolbarActions = useMemo<ToolbarAction[]>(
    () => [
      {
        id: 'staff',
        label: 'Edit staff sign-in',
        shortLabel: 'Staff',
        icon: 'staff',
        onInvoke: () => setContextEditor('staff'),
      },
      {
        id: 'location',
        label: 'Select visit location',
        shortLabel: 'Location',
        icon: 'location',
        onInvoke: () => setContextEditor('location'),
      },
    ],
    [],
  );

  const queueOpen = (item: WorkQueueItem) => openWorkflow(item.workflow);

  const activeWorkflow =
    APPLICATION_TO_DESKTOP[clinical.state.activeWorkflow] ??
    snapshot.activeWorkflow;
  const activeClinicalWorkflow = DESKTOP_TO_CLINICAL[activeWorkflow];
  const patient: PatientContext = {
    name: clinical.state.activePatient.name,
    dob: clinical.state.activePatient.dob,
  };
  const workflowPatient: PatientContext | undefined = activeClinicalWorkflow
    ? {
        name:
          clinical.state.workflows[activeClinicalWorkflow].encounter.patient
            .name,
        dob:
          clinical.state.workflows[activeClinicalWorkflow].encounter.patient
            .dob,
        sourceWorkflow: activeWorkflow,
      }
    : snapshot.workflowPatients[activeWorkflow];
  const parityModel = paritySafeReadiness(
    snapshot.readiness,
    clinical,
    activeWorkflow,
  );
  const isReviewWorkflow =
    activeWorkflow === 'uds' ||
    activeWorkflow === 'samples' ||
    activeWorkflow === 'forms';
  const reviewOrComplete = () => {
    if (activeWorkflow === 'forms') {
      formsPanelRef.current?.focus({ preventScroll: false });
      formsPanelRef.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (activeWorkflow === 'uds') {
      udsPanelRef.current?.focus({ preventScroll: false });
      udsPanelRef.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (activeWorkflow === 'samples') {
      samplesPanelRef.current?.focus({ preventScroll: false });
      samplesPanelRef.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (isReviewWorkflow) {
      runtime.focusOutput();
      refresh();
      return;
    }
    if (
      activeWorkflow !== 'administer' ||
      !snapshot.canComplete ||
      posting
    ) {
      return;
    }
    setPosting(true);
    window.setTimeout(() => {
      if (!runtime.reviewOrComplete()) setPosting(false);
      refresh();
    }, 110);
  };

  const effectivePostState =
    activeWorkflow === 'administer'
      ? posting
        ? 'posting'
        : snapshot.postState
      : 'idle';

  return (
    <>
      <ClinicalDesktopShell
        appName="IPMG MA Workstation"
        organizationName="Integrated Psychiatric Medical Group"
        versionLabel="Clinical Desktop 2004 · v6.0"
        activeWorkflow={activeWorkflow}
        onWorkflowChange={openWorkflow}
        patient={patient}
        workflowPatient={workflowPatient}
        onUseWorkflowPatient={(workflow) => {
          const clinicalWorkflow = DESKTOP_TO_CLINICAL[workflow];
          if (clinicalWorkflow) coordinator.useWorkflowPatient(clinicalWorkflow);
        }}
        staffLabel={snapshot.staffLabel}
        locationLabel={snapshot.locationLabel}
        localStorageAvailable={snapshot.localStorageAvailable}
        workflowSummaries={snapshot.workflowSummaries}
        needsReview={snapshot.needsReview}
        todayQueue={snapshot.todayQueue}
        recentActivity={snapshot.recentActivity}
        injectionRecords={snapshot.injectionRecords}
        readiness={parityModel.readiness}
        noteSections={snapshot.noteSections}
        noteTitle={snapshot.noteTitle}
        noteSubtitle={
          parityModel.typedAggregateMatched
            ? `${snapshot.noteSubtitle} Typed engine aggregate matched; compatibility workflow remains authoritative.`
            : snapshot.noteSubtitle
        }
        legacyPanels={legacyPanels}
        renderWorkflow={renderWorkflow}
        toolbarActions={toolbarActions}
        postState={effectivePostState}
        postMessage={
          effectivePostState === 'posted'
            ? 'Permanent local snapshot created. Original record is read-only.'
            : undefined
        }
        canComplete={
          activeWorkflow === 'administer' && snapshot.canComplete
        }
        canReview={isReviewWorkflow}
        reviewActionMode={isReviewWorkflow ? 'review' : 'complete'}
        statusMessage={snapshot.statusMessage}
        onSaveDraft={
          activeWorkflow === 'administer'
            ? () => {
                runtime.saveDraft();
                coordinator.synchronize(['injection']);
                refresh();
              }
            : undefined
        }
        onReviewComplete={reviewOrComplete}
        onOpenRecords={() => setRecordsOpen(true)}
        onOpenKnowledge={() => openWorkflow('reference')}
        onOpenCloseout={() => openWorkflow('log')}
        onCopyNoteSection={(section) =>
          copyLegacyNoteSection(activeWorkflow, section.id)
        }
        onCopyAllNotes={() => copyAllLegacyNotes(activeWorkflow)}
        onQueueItemOpen={queueOpen}
        onRecordOpen={openRecord}
        onEscape={() => setContextEditor(null)}
      />
      <RecordsWindow open={recordsOpen} onClose={() => setRecordsOpen(false)} />
      {contextEditor && (
        <ContextDialog
          kind={contextEditor}
          staffValue={activeStaffValue()}
          locationValue={activeClinicValue()}
          clinicOptions={readClinicOptions()}
          onSaveStaff={(value) => {
            setLegacyStaff(value);
            refresh();
          }}
          onClearStaff={() => {
            clearLegacyStaff();
            refresh();
          }}
          onSaveLocation={(value) => {
            setLegacyLocation(value);
            refresh();
          }}
          onClose={() => setContextEditor(null)}
        />
      )}
    </>
  );
}

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing application mount point.');

  // Claim the records window before the legacy runtime boots. Its
  // ensureRecordsDrawer() rebuilds the drawer layer whenever it is missing and
  // runs from five call sites, so removing the element is not enough - it has
  // to be told to stand down, or two dialogs answer to #recordsDrawerLayer.
  (window as unknown as { IPMG_RECORDS_WINDOW_OWNED?: boolean })
    .IPMG_RECORDS_WINDOW_OWNED = true;

  const runtime = await loadLegacyRuntime();
  installLegacyDocumentationAdapter();
  render(<LegacyDesktopApp runtime={runtime} />, app);
  window.setTimeout(() => {
    runtime.staging.hidden = true;
    runtime.staging.setAttribute('aria-hidden', 'true');
  }, 0);
  document.body.dataset.applicationReady = 'true';
}

boot().catch((error: unknown) => {
  console.error(error);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<main role="alert" style="max-width:48rem;margin:4rem auto;padding:1.5rem;font:14px Tahoma,Arial,sans-serif">' +
      '<h1 style="font-size:18px">The workstation could not start.</h1>' +
      '<p>Reload the page. If the problem continues, keep the browser open and contact support.</p>' +
      '</main>';
  }
});
