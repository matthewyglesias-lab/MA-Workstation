import { render } from 'preact';
/*
 * Plus Jakarta Sans is load-bearing for PRINT: the AVS patient handout sets its
 * titles in it (the @media print block in clinical-desktop.css), and
 * tests/e2e/print-regression.spec.js asserts that stack. It stays.
 *
 * Inter and JetBrains Mono are the redesign's screen faces - the open stand-ins
 * for Tebra's commercial Akkurat LL / Akkurat Mono LL. Loading them only
 * registers @font-face rules; nothing renders in them until a later phase
 * points a font-family at var(--tw-font-sans). See docs/redesign/MANIFEST.md.
 */
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { RecordsWindow } from './presentation/RecordsWindow';
import { useIdleLock, WorkstationLock } from './presentation/WorkstationLock';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ClinicalDesktopShell,
  WorkstationViewportBoundary,
  ContextDialog,
  RecordActionDialog,
  LegacyWorkflowHost,
  WORKFLOW_LABELS,
  type ClinicOption,
  type LegacyPanelAdapter,
  type PatientContext,
  type RecordActionKind,
  type WorkflowId,
  type WorkflowRenderContext,
  type WorkQueueItem,
  type InjectionRecordRow,
  type LocalAttestationReview,
} from './presentation';
import {
  buildInjectionAvsHtml,
  type InjectionAvsChrome,
  type InjectionAvsInput,
} from './domain/injection-avs-render';
import { FormsPanel } from './presentation/workflows/forms/FormsPanel';
import { UdsPanel } from './presentation/workflows/uds/UdsPanel';
import { InjectionPanel } from './presentation/workflows/injection/InjectionPanel';
import { isCompatibilityProjectionEvent } from './presentation/workflows/legacy-mirror';
import { SamplesPanel } from './presentation/workflows/samples/SamplesPanel';
import { requestWorkstationDraftSave } from './presentation/workstation-events';
import { TmsPanel } from './presentation/workflows/tms/TmsPanel';
import { KnowledgePanel } from './presentation/workflows/knowledge/KnowledgePanel';
import { DailyCloseoutPanel } from './presentation/workflows/log/DailyCloseoutPanel';
import {
  createClinicalCoordinator,
  selectClinicalEvaluation,
  projectClinicalReadiness,
  type ApplicationWorkflow,
  type ClinicalCoordinatorSnapshot,
  type ClinicalEncounterSource,
  type ClinicalWorkflow,
} from './application';
import { loadLegacyRuntime, type LegacyRuntime } from './legacy/loader';
import { installLegacyDocumentationAdapter } from './legacy/documentation-adapter';
import { createLegacyClinicalSource } from './legacy/clinical-source';
import type {
  InjectionEncounter,
  InjectionEvaluationOutput,
} from './domain/injection';
import type { ClinicalEvaluation } from './domain/contracts';
import type { UdsEncounter, UdsEvaluationOutput } from './domain/uds';
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

function presentationReadiness(
  legacy: LegacyShellSnapshot['readiness'],
  clinical: ClinicalCoordinatorSnapshot,
  workflow: WorkflowId,
  evaluationOverride?: ClinicalEvaluation,
): {
  readiness: LegacyShellSnapshot['readiness'];
  typedReady: boolean;
  firstBlockingDetail?: string;
} {
  const clinicalWorkflow = DESKTOP_TO_CLINICAL[workflow];
  const evaluation = evaluationOverride ?? (clinicalWorkflow
    ? selectClinicalEvaluation(clinical, clinicalWorkflow)
    : undefined);
  if (!evaluation) {
    return { readiness: legacy, typedReady: false };
  }
  const projection = projectClinicalReadiness(workflow, evaluation);
  const injectionReadyToLock =
    workflow === 'administer' &&
    (evaluation.output as { recordStatus?: string }).recordStatus === 'ready-to-lock';
  return {
    readiness: projection.items,
    // Injection warnings are review findings, not unfinished fields. The
    // injection engine already exposes the stricter, disposition-aware lock
    // decision, so use it instead of requiring the generic readiness state to
    // be completely warning-free. Otherwise an on-cadence product that still
    // requires active-order review (for example Vivitrol) can never reach the
    // local attestation dialog.
    typedReady: projection.readiness === 'ready' || injectionReadyToLock,
    // A warning may be the first actionable review item, but it must not be
    // described as the first *blocker* in the record action strip.
    firstBlockingDetail:
      evaluation.stops.length > 0 ? projection.firstBlockingDetail : undefined,
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
  const [typedInjectionState, setTypedInjectionState] = useState<{
    encounter: InjectionEncounter;
    evaluation: ClinicalEvaluation<InjectionEvaluationOutput>;
  } | null>(null);
  const [typedUdsState, setTypedUdsState] = useState<{
    encounter: UdsEncounter;
    evaluation: ClinicalEvaluation<UdsEvaluationOutput>;
    locked: boolean;
  } | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordAction, setRecordAction] = useState<RecordActionKind | null>(null);
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
        setTypedInjectionState(null);
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
    const observers = Object.entries(runtime.panels)
      .filter(([workflow]) => workflow !== 'administer' && workflow !== 'uds')
      .map(([, panel]) => {
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
    const shellObserver = new MutationObserver((records) => {
      const hasNonProjectionMutation = records.some((record) => {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        return !target?.closest('#panel-administer, #panel-uds');
      });
      if (hasNonProjectionMutation) refresh();
    });
    shellObserver.observe(runtime.legacyWrap, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-disabled', 'aria-invalid'],
    });

    const handleChange = (event: Event) => {
      if (isCompatibilityProjectionEvent(event)) return;
      // InjectionPanel owns its typed state and immediately reports each
      // change through onWorkflowStateChange. Do not queue a second legacy
      // snapshot refresh for an in-panel keystroke; that duplicate work is
      // especially disruptive while entering patient identity.
      if (
        event.target instanceof Node &&
        injectionPanelRef.current?.contains(event.target)
      ) {
        return;
      }
      refresh();
    };
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
          staffSignInValue={activeStaffValue()}
          previewRef={udsPanelRef}
          onWorkflowStateChange={(encounter, evaluation, state) => {
            setTypedUdsState({ encounter, evaluation, locked: state.locked });
            const next = readLegacyShellSnapshot(runtime);
            if (!sameSnapshot(snapshotRef.current, next)) {
              snapshotRef.current = next;
              setSnapshot(next);
            }
          }}
        />
      );
    }
    if (workflow === 'administer') {
      return (
        <InjectionPanel
          key={injectionRecordEpoch}
          initialEncounter={rawInjectionEncounter(clinicalSource)}
          activePatient={context.patient}
          staffSignInValue={activeStaffValue()}
          previewRef={injectionPanelRef}
          locked={snapshot.postState === 'posted'}
          onWorkflowStateChange={(encounter, evaluation) =>
            {
              setTypedInjectionState({ encounter, evaluation });
              const next = readLegacyShellSnapshot(runtime);
              if (!sameSnapshot(snapshotRef.current, next)) {
                snapshotRef.current = next;
                setSnapshot(next);
              }
            }
          }
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
    const currentWorkflow = runtime.activeWorkflow();
    // Leaving an editable injection record is an explicit save boundary. This
    // makes normal workflow navigation retain entered work just like Start New
    // does, while keeping a storage failure on the worksheet.
    if (currentWorkflow === 'administer' && workflow !== 'administer') {
      const recordState = runtime.injectionRecordState();
      if (recordState.canDiscard && !runtime.saveDraft()) {
        coordinator.synchronize(['injection']);
        refresh();
        return;
      }
    }
    coordinator.navigate(DESKTOP_TO_APPLICATION[workflow]);
    runtime.activate(workflow);
    coordinator.synchronize();
    refresh();
  };

  const synchronizeInjectionRecordSwitch = () => {
    const nextRecordGeneration = window.ipmgInjectionRecordGeneration?.() ?? 0;
    if (nextRecordGeneration !== injectionRecordGenerationRef.current) {
      injectionRecordGenerationRef.current = nextRecordGeneration;
      setTypedInjectionState(null);
      setInjectionRecordEpoch((value) => value + 1);
    }
    coordinator.navigate('injection');
    // The record switch owns the next active patient. Do this synchronously
    // with the generation/key update so the former blank panel cannot use a
    // newly-restored patient as a cue to mirror its old empty encounter over
    // the restored draft before the new panel mounts.
    coordinator.setActivePatient(rawInjectionEncounter(clinicalSource).patient);
    coordinator.synchronize(['injection']);
    refresh();
  };

  const openInjectionRecord = (id: string): boolean => {
    if (!runtime.openInjectionRecord(id)) return false;
    synchronizeInjectionRecordSwitch();
    return true;
  };

  const openRecord = (record: InjectionRecordRow) => {
    openInjectionRecord(record.id);
  };

  const queueOpen = (item: WorkQueueItem) => openWorkflow(item.workflow);

  const activeWorkflow =
    APPLICATION_TO_DESKTOP[clinical.state.activeWorkflow] ??
    snapshot.activeWorkflow;
  const activeClinicalWorkflow = DESKTOP_TO_CLINICAL[activeWorkflow];
  const injectionAttestation =
    activeWorkflow === 'administer'
      ? runtime.injectionAttestationSummary()
      : undefined;
  const injectionEncounter =
    activeWorkflow === 'administer'
      ? typedInjectionState?.encounter ?? rawInjectionEncounter(clinicalSource)
      : undefined;
  const udsEncounter =
    activeWorkflow === 'uds' ? typedUdsState?.encounter : undefined;
  const injectionPatient = injectionEncounter?.patient;
  const patient: PatientContext = {
    name: injectionPatient?.name ?? udsEncounter?.patient.name ?? clinical.state.activePatient.name,
    dob: injectionPatient?.dob ?? udsEncounter?.patient.dob ?? clinical.state.activePatient.dob,
    localRecordId: injectionAttestation?.activeRecordId,
    medicationLabel: injectionAttestation?.medication || undefined,
    allergyStatus: injectionEncounter?.allergies.trim() || undefined,
  };
  const workflowPatient: PatientContext | undefined =
    activeWorkflow === 'administer' && typedInjectionState
      ? { ...typedInjectionState.encounter.patient, sourceWorkflow: 'administer' }
      : activeWorkflow === 'uds' && typedUdsState
        ? { ...typedUdsState.encounter.patient, sourceWorkflow: 'uds' }
        : activeClinicalWorkflow
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
  const injectionRecordState =
    activeWorkflow === 'administer' ? runtime.injectionRecordState() : undefined;
  const injectionRecordLabel =
    activeWorkflow === 'administer'
      ? injectionEncounter?.patient.name.trim() || 'this injection'
      : 'this injection';
  const readinessModel = presentationReadiness(
    snapshot.readiness,
    clinical,
    activeWorkflow,
    activeWorkflow === 'administer'
      ? typedInjectionState?.evaluation
      : activeWorkflow === 'uds'
        ? typedUdsState?.evaluation
        : undefined,
  );
  const localAttestationReady = Boolean(
    injectionAttestation?.canAttest && injectionAttestation.staff.trim(),
  );
  const attestationBlockingDetail =
    activeWorkflow === 'administer' &&
    typedInjectionState?.evaluation.readiness !== 'idle' &&
    readinessModel.typedReady &&
    !localAttestationReady
      ? injectionAttestation?.staff.trim()
        ? 'The editable local record is not ready to attest and lock.'
        : 'Enter the signed-in documenting staff before local attestation.'
      : undefined;
  const saveInjectionDraft = () => {
    runtime.saveDraft();
    coordinator.synchronize(['injection']);
    refresh();
  };
  const startNewInjection = () => {
    const started = runtime.startNewInjection();
    if (started) {
      synchronizeInjectionRecordSwitch();
      return;
    }
    refresh();
  };
  const discardInjectionDraft = (): boolean => {
    const discarded = runtime.discardInjectionDraft();
    if (discarded) {
      coordinator.navigate('injection');
      coordinator.synchronize(['injection']);
    }
    refresh();
    return discarded;
  };
  const finishInjectionRecord = (): boolean => {
    const attestation = injectionAttestation;
    if (
      activeWorkflow !== 'administer' ||
      !readinessModel.typedReady ||
      !localAttestationReady ||
      !attestation ||
      posting
    ) {
      return false;
    }
    setPosting(true);
    const staff = attestation.staff.trim();
    if (!staff) {
      setPosting(false);
      return false;
    }
    const locked = runtime.attestAndLockInjection({
      staff,
      timestamp: attestation.timestamp || new Date().toISOString(),
      statementVersion: 'local-attestation-v1',
    });
    if (!locked) setPosting(false);
    coordinator.synchronize(['injection']);
    refresh();
    return locked;
  };
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
    if (
      activeWorkflow !== 'administer' ||
      !readinessModel.typedReady ||
      !localAttestationReady ||
      posting
    ) {
      return;
    }
    setRecordAction('attest');
  };

  const attestationReview: LocalAttestationReview | undefined = injectionAttestation
    ? {
        patient:
          injectionAttestation.patient.name ||
          injectionRecordLabel ||
          'Not entered',
        localRecord:
          injectionAttestation.localRecord ||
          injectionAttestation.activeRecordId ||
          'Not assigned',
        medication: injectionAttestation.medication || 'Not entered',
        disposition: injectionAttestation.disposition || 'Not documented',
        staff: injectionAttestation.staff || snapshot.staffLabel || 'Not signed in',
        timestamp: injectionAttestation.timestamp || new Date().toISOString(),
        statementVersion: 'local-attestation-v1',
      }
    : undefined;

  const effectivePostState =
    activeWorkflow === 'administer'
      ? posting
        ? 'posting'
        : snapshot.postState
      : 'idle';

  // snapshot.staffLabel is legacy-formatted display text ("Signed in: A.
  // Rivera, MA", or the literal string "Not signed in" when nobody is) - not
  // a reliable "is anyone signed in" boolean and not a clean name to display
  // or match against. activeStaffValue() is the raw #staffSignIn input value
  // (empty when nobody has signed in), same source ContextDialog already
  // reads at render time below.
  const staffSignInName = activeStaffValue().trim();
  const [locked, unlock] = useIdleLock(staffSignInName.length > 0);

  return (
    <WorkstationViewportBoundary>
      <ClinicalDesktopShell
        organizationName="Integrated Psychiatric Medical Group"
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
        injectionRecords={snapshot.injectionRecords}
        readiness={readinessModel.readiness}
        noteSections={snapshot.noteSections}
        noteTitle={snapshot.noteTitle}
        noteSubtitle={snapshot.noteSubtitle}
        legacyPanels={legacyPanels}
        renderWorkflow={renderWorkflow}
        postState={effectivePostState}
        postMessage={
          effectivePostState === 'posted'
            ? 'Locked browser-local record. Original record is read-only.'
            : undefined
        }
        canComplete={
          activeWorkflow === 'administer' &&
          readinessModel.typedReady &&
          localAttestationReady
        }
        statusMessage={snapshot.statusMessage}
        onSaveDraft={
          activeWorkflow === 'administer'
            ? saveInjectionDraft
            : activeWorkflow === 'uds' &&
                typedUdsState?.evaluation.readiness !== 'idle' &&
                !typedUdsState?.locked
              ? () => requestWorkstationDraftSave('uds')
              : undefined
        }
        onReviewComplete={reviewOrComplete}
        injectionRecordActions={
          activeWorkflow === 'administer' && injectionRecordState
            ? {
                lifecycle: injectionRecordState.lifecycle,
                detail: injectionRecordState.detail,
                blockingDetail:
                  readinessModel.firstBlockingDetail ?? attestationBlockingDetail,
                canDiscard: injectionRecordState.canDiscard,
                onStartNew: startNewInjection,
                onDiscard: () => setRecordAction('discard'),
              }
            : undefined
        }
        onStartNewInjection={startNewInjection}
        onOpenStaff={() => setContextEditor('staff')}
        onOpenLocation={() => setContextEditor('location')}
        onOpenRecords={() => setRecordsOpen(true)}
        onLookup={() => setRecordsOpen(true)}
        onOpenKnowledge={() => openWorkflow('reference')}
        onOpenCloseout={() => openWorkflow('log')}
        onCopyNoteSection={(section) =>
          copyLegacyNoteSection(activeWorkflow, section.id)
        }
        onCopyAllNotes={() => copyAllLegacyNotes(activeWorkflow)}
        onQueueItemOpen={queueOpen}
        onRecordOpen={openRecord}
        onEscape={() => {
          if (contextEditor) {
            setContextEditor(null);
            return;
          }
          if (recordsOpen) setRecordsOpen(false);
        }}
      />
      <RecordsWindow
        open={recordsOpen}
        onClose={() => setRecordsOpen(false)}
        onRecordOpen={openInjectionRecord}
      />
      {recordAction && (
        <RecordActionDialog
          kind={recordAction}
          recordLabel={injectionRecordLabel}
          attestation={recordAction === 'attest' ? attestationReview : undefined}
          onConfirm={recordAction === 'attest' ? finishInjectionRecord : discardInjectionDraft}
          onClose={() => setRecordAction(null)}
        />
      )}
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
      {locked && (
        <WorkstationLock staffLabel={staffSignInName} onUnlock={unlock} />
      )}
    </WorkstationViewportBoundary>
  );
}

/**
 * Publishes the typed After Visit Summary builder for the legacy print
 * pipeline. renderAVS() collects the documented values out of the legacy
 * fields and calls this; keeping the patient wording on this side means it
 * lives in one reviewable, unit-tested module instead of the runtime blob.
 *
 * Installed before the legacy runtime loads so a print can never race the
 * bridge. renderAVS() still has its own fallback if this is ever missing.
 */
function installInjectionAvsBridge(): void {
  (
    window as unknown as {
      ipmgBuildInjectionAvsHtml?: (
        input: InjectionAvsInput,
        chrome?: Partial<InjectionAvsChrome>,
      ) => string;
    }
  ).ipmgBuildInjectionAvsHtml = (input, chrome) => buildInjectionAvsHtml(input, chrome ?? {});
}

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing application mount point.');

  installInjectionAvsBridge();

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
  dismissBootSplash();
}

/**
 * #boot-splash (index.html) is inline HTML/CSS with no JS dependency, so it
 * paints before this module even finishes loading. Fades out once the real
 * shell has rendered - tied to genuine boot completion, not a fixed delay -
 * and is removed outright afterward so it cannot ever intercept a click.
 */
function dismissBootSplash(): void {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('is-done');
  window.setTimeout(() => splash.remove(), 200);
}

boot().catch((error: unknown) => {
  console.error(error);
  dismissBootSplash();
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<main role="alert" style="max-width:48rem;margin:4rem auto;padding:1.5rem;font:14px Tahoma,Arial,sans-serif">' +
      '<h1 style="font-size:18px">The workstation could not start.</h1>' +
      '<p>Reload the page. If the problem continues, keep the browser open and contact support.</p>' +
      '</main>';
  }
});
