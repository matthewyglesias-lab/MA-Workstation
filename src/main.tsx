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
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ClinicalDesktopShell,
  WorkstationViewportBoundary,
  ContextDialog,
  RecordActionDialog,
  LegacyWorkflowHost,
  RECORD,
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
import { saveFullInjectionDraft } from './presentation/workflows/injection/injection-draft-bridge';
import {
  injectionPresentationExtensionAvailable,
  installInjectionPresentationExtension,
  isUsableInjectionRecord,
  readInjectionPresentationExtension,
  TYPED_INJECTION_ENCOUNTER_KEY,
  type InjectionPresentationExtensionRead,
} from './presentation/workflows/injection/injection-presentation-extension';
import { isCompatibilityProjectionEvent } from './presentation/workflows/legacy-mirror';
import { SamplesPanel } from './presentation/workflows/samples/SamplesPanel';
import {
  requestWorkstationDraftSave,
  requestWorkstationUdsLeaveBlocked,
} from './presentation/workstation-events';
import { chartPatientKey } from './presentation/patient-chart-model';
import { TmsPanel } from './presentation/workflows/tms/TmsPanel';
import { KnowledgePanel } from './presentation/workflows/knowledge/KnowledgePanel';
import { DailyCloseoutPanel } from './presentation/workflows/log/DailyCloseoutPanel';
import { ModalDialog } from './presentation/ModalDialog';
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
import { INJECTION_MEDICATIONS } from './domain/injection-catalog';
import type { ClinicalEvaluation } from './domain/contracts';
import {
  emptyFormsEncounter,
  type FormsEncounter,
} from './domain/forms';
import {
  emptySamplesEncounter,
  type SamplesEncounter,
} from './domain/samples';
import {
  emptyUdsEncounter,
  UdsEngine,
  type UdsEncounter,
  type UdsEvaluationOutput,
} from './domain/uds';
import { InjectionRecordRepository } from './persistence/injection-records';
import {
  INJECTION_RECORDS_STORAGE_KEY,
  UDS_RECORDS_STORAGE_KEY,
} from './persistence/keys';
import { UdsRecordRepository, type UdsRecord } from './persistence/uds-records';
import { browserSafeStorage } from './persistence/storage';
import {
  holdUdsRecordMutationLock,
  isUnambiguousUsableUdsRecordList,
  isUsableUdsRecord,
  type UdsRecordMutationAccess,
} from './presentation/uds-record-safety';
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

const LEGACY_INJECTION_SNAPSHOT_FIELD_IDS = new Set([
  'ptName', 'ptDOB', 'orderingProvider', 'injOrderPurpose', 'ndc', 'lot',
  'exp', 'injProductSource', 'injProductSourceOther', 'injPreparation',
  'injPreparationDetail', 'injWasteToggle', 'injWasteAmount',
  'injWasteWitness', 'injProductIssueToggle', 'injProductIssueDetail',
  'injProductIssueAction', 'injProductIssueRecipient',
  'injProductIssueNotificationTime', 'injProductIssueDirection',
  'injProductIssueNextStep', 'allergies', 'bp', 'hr', 'temp', 'rr', 'spo2',
  'vitalRepeatNote', 'tech', 'priorDose', 'priorSite', 'adminDate',
  'injAdminTime', 'injSecondAdminTime', 'nextDate', 'clinic', 'respCustom',
  'admin', 'injVolume', 'injVolumeUnit', 'injDevice', 'injDeviceOther',
  'injSiteCondition', 'injSiteConditionDetail', 'injExceptionToggle',
  'injExceptionSummary', 'injExceptionRecipient', 'injExceptionTime',
  'injExceptionOutcome',
]);

function sameSnapshot(
  left: LegacyShellSnapshot,
  right: LegacyShellSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameUdsEncounter(left: UdsEncounter, right: UdsEncounter): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function udsRecordMatchesDurableStorage(record: UdsRecord): boolean {
  const listed = new UdsRecordRepository(browserSafeStorage()).list();
  if (
    !listed.ok ||
    listed.warnings.length > 0 ||
    !isUnambiguousUsableUdsRecordList(listed.value)
  ) return false;
  const matches = listed.value.filter((candidate) => candidate.id === record.id);
  return matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(record);
}

interface TransientWorkflowState<TEncounter> {
  encounter: TEncounter;
  dirty: boolean;
}

type TransientWorkflow = 'samples' | 'forms';

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
function rawInjectionEncounterRead(
  source: ClinicalEncounterSource,
  runtime: LegacyRuntime,
): InjectionPresentationExtensionRead {
  const fallback = source.read('injection').encounter as InjectionEncounter;
  const activeRecordId = runtime.injectionRecordState().activeRecordId;
  const listed = new InjectionRecordRepository(browserSafeStorage()).list();
  if (
    !listed.ok ||
    listed.warnings.length ||
    !injectionRecordsUsableAndUnambiguous(listed.value) ||
    !sameInjectionRecordListAsLegacy(listed.value)
  ) {
    return { encounter: fallback, status: 'invalid' };
  }
  if (!activeRecordId) return { encounter: fallback, status: 'absent' };
  const matches = listed.value.filter((record) => record.id === activeRecordId);
  if (matches.length !== 1) return { encounter: fallback, status: 'invalid' };
  const stored = matches[0];
  if (!stored) return { encounter: fallback, status: 'invalid' };
  const storedPatient = stored.patient as unknown;
  const storedSnapshot = stored.snapshot as unknown;
  if (
    !storedPatient ||
    typeof storedPatient !== 'object' ||
    Array.isArray(storedPatient) ||
    !storedSnapshot ||
    typeof storedSnapshot !== 'object' ||
    Array.isArray(storedSnapshot) ||
    ((storedSnapshot as Record<string, unknown>).version !== 4 &&
      !(
        stored.status === 'completed' &&
        (storedSnapshot as Record<string, unknown>).version === 3
      ))
  ) {
    return { encounter: fallback, status: 'invalid' };
  }
  const patient = storedPatient as Record<string, unknown>;
  const recordSnapshot = storedSnapshot as Record<string, unknown>;
  const recordFields = recordSnapshot.fields;
  if (
    typeof patient.name !== 'string' ||
    typeof patient.dob !== 'string' ||
    typeof recordSnapshot.medKey !== 'string' ||
    !recordFields ||
    typeof recordFields !== 'object' ||
    Array.isArray(recordFields) ||
    typeof (recordFields as Record<string, unknown>).ptName !== 'string' ||
    typeof (recordFields as Record<string, unknown>).ptDOB !== 'string' ||
    (recordFields as Record<string, unknown>).ptName?.toString().trim() !==
      patient.name.trim() ||
    (recordFields as Record<string, unknown>).ptDOB?.toString().trim() !==
      patient.dob.trim() ||
    (recordSnapshot.medKey !== '' &&
      !Object.prototype.hasOwnProperty.call(
        INJECTION_MEDICATIONS,
        recordSnapshot.medKey,
      ))
  ) {
    return { encounter: fallback, status: 'invalid' };
  }
  if (stored.status === 'completed' && recordSnapshot.version === 3) {
    return { encounter: fallback, status: 'absent' };
  }
  return readInjectionPresentationExtension(
    fallback,
    recordSnapshot.documentation,
  );
}

function injectionRecordsUsableAndUnambiguous(records: unknown[]): boolean {
  const idCounts = records.reduce<Map<string, number>>((counts, entry) => {
    const id =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).id
        : undefined;
    if (typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, new Map());
  return records.every((record) => {
    const id =
      record && typeof record === 'object' && !Array.isArray(record)
        ? (record as Record<string, unknown>).id
        : undefined;
    return typeof id === 'string' &&
      idCounts.get(id) === 1 &&
      isUsableInjectionRecord(record);
  });
}

function rawInjectionEncounter(
  source: ClinicalEncounterSource,
  runtime: LegacyRuntime,
): InjectionEncounter {
  return rawInjectionEncounterRead(source, runtime).encounter;
}

function sameInjectionRecordListAsLegacy(records: unknown[]): boolean {
  const bridge = window.IPMGRecords as unknown as
    | { list?: () => unknown[] }
    | undefined;
  let legacyRecords: unknown;
  try {
    legacyRecords = bridge?.list?.();
  } catch {
    return false;
  }
  if (!Array.isArray(legacyRecords)) return false;
  const sorted = (entries: unknown[]) => [...entries].sort((left, right) => {
    const leftUpdated =
      left && typeof left === 'object'
        ? String((left as Record<string, unknown>).updatedAt ?? '')
        : '';
    const rightUpdated =
      right && typeof right === 'object'
        ? String((right as Record<string, unknown>).updatedAt ?? '')
        : '';
    return rightUpdated.localeCompare(leftUpdated);
  });
  const withoutOwnedExtension = (entries: unknown[]) =>
    JSON.stringify(sorted(entries).map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const record = entry as Record<string, unknown>;
      const snapshot =
        record.snapshot &&
        typeof record.snapshot === 'object' &&
        !Array.isArray(record.snapshot)
          ? (record.snapshot as Record<string, unknown>)
          : undefined;
      const documentation =
        snapshot?.documentation &&
        typeof snapshot.documentation === 'object' &&
        !Array.isArray(snapshot.documentation)
          ? (snapshot.documentation as Record<string, unknown>)
          : undefined;
      if (!snapshot || !documentation) return entry;
      const {
        [TYPED_INJECTION_ENCOUNTER_KEY]: _ownedExtension,
        ...otherDocumentation
      } = documentation;
      return {
        ...record,
        snapshot: { ...snapshot, documentation: otherDocumentation },
      };
    }));
  return withoutOwnedExtension(records) === withoutOwnedExtension(legacyRecords);
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
    dirty: boolean;
  } | null>(null);
  const [injectionExtensionInstalled, setInjectionExtensionInstalled] =
    useState(false);
  const [, setInjectionStorageRevision] = useState(0);
  const [injectionStorageConflict, setInjectionStorageConflict] =
    useState(false);
  const injectionStorageConflictRef = useRef(false);
  const [typedUdsState, setTypedUdsState] = useState<{
    encounter: UdsEncounter;
    evaluation: ClinicalEvaluation<UdsEvaluationOutput>;
    locked: boolean;
  } | null>(null);
  const [formsRecordEpoch, setFormsRecordEpoch] = useState(0);
  const [typedFormsState, setTypedFormsState] =
    useState<TransientWorkflowState<FormsEncounter> | null>(null);
  const [samplesRecordEpoch, setSamplesRecordEpoch] = useState(0);
  const [typedSamplesState, setTypedSamplesState] =
    useState<TransientWorkflowState<SamplesEncounter> | null>(null);
  // UDS persistence metadata must outlive the panel. The patient chart and
  // workflow navigation intentionally unmount workflow content; retaining
  // only the encounter would remount a signed record as an editable new note
  // and let the next save create a duplicate id.
  const [udsActiveRecord, setUdsActiveRecord] = useState<UdsRecord | undefined>();
  const [udsLaunchEncounter, setUdsLaunchEncounter] =
    useState<UdsEncounter | undefined>();
  const [udsRecordEpoch, setUdsRecordEpoch] = useState(0);
  const [udsRecordMutationAccess, setUdsRecordMutationAccess] =
    useState<UdsRecordMutationAccess>('pending');
  const [udsActiveRecordStorageConflict, setUdsActiveRecordStorageConflict] =
    useState(false);
  const [pendingUdsAddendum, setPendingUdsAddendum] = useState(false);
  const [pendingUdsPhoto, setPendingUdsPhoto] = useState(false);
  const [pendingInjectionAddendum, setPendingInjectionAddendum] = useState(false);
  const udsActiveRecordRef = useRef<UdsRecord | undefined>();
  const udsActiveRecordStorageConflictRef = useRef(false);
  const typedUdsStateRef = useRef<typeof typedUdsState>(null);
  const pendingUdsAddendumRef = useRef(false);
  const pendingUdsPhotoRef = useRef(false);
  const pendingInjectionAddendumRef = useRef(false);
  const typedInjectionStateRef = useRef<typeof typedInjectionState>(null);
  const typedInjectionDirtyRef = useRef(false);
  const typedFormsStateRef =
    useRef<TransientWorkflowState<FormsEncounter> | null>(null);
  const typedSamplesStateRef =
    useRef<TransientWorkflowState<SamplesEncounter> | null>(null);
  const [pendingTransientReplacement, setPendingTransientReplacement] =
    useState<{ workflow: TransientWorkflow; patient: PatientContext } | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [externalWorkflowHandoffToken, setExternalWorkflowHandoffToken] =
    useState(0);
  const [recordAction, setRecordAction] = useState<RecordActionKind | null>(null);
  const injectionRecordGenerationRef = useRef(0);

  const rememberUdsRecord = useCallback((record?: UdsRecord) => {
    // A conflict is a latch, not a transient warning. Clear it only when an
    // explicit handoff adopted bytes that still exactly match fully validated
    // durable storage, or after a successful new/discard handoff cleared the
    // active record. Web Lock access changes never clear it.
    if (!record || udsRecordMatchesDurableStorage(record)) {
      udsActiveRecordStorageConflictRef.current = false;
      setUdsActiveRecordStorageConflict(false);
    }
    udsActiveRecordRef.current = record;
    setUdsActiveRecord(record);
    // The in-panel UDS records window can hand off to a different patient
    // without remounting the shell. Carry that identity into the coordinator
    // now so the next workflow cannot revert to the prior patient.
    if (record && isUsableUdsRecord(record)) {
      coordinator.setActivePatient(record.snapshot.patient);
    } else if (!record) {
      coordinator.setActivePatient({ name: '', dob: '' });
    }
  }, [coordinator]);

  const rememberPendingUdsAddendum = useCallback((pending: boolean) => {
    pendingUdsAddendumRef.current = pending;
    setPendingUdsAddendum(pending);
  }, []);

  const rememberPendingUdsPhoto = useCallback((pending: boolean) => {
    pendingUdsPhotoRef.current = pending;
    setPendingUdsPhoto(pending);
  }, []);

  const rememberPendingInjectionAddendum = useCallback((pending: boolean) => {
    pendingInjectionAddendumRef.current = pending;
    setPendingInjectionAddendum(pending);
  }, []);

  const rememberInjectionState = useCallback(
    (
      encounter: InjectionEncounter,
      evaluation: ClinicalEvaluation<InjectionEvaluationOutput>,
    ) => {
      const next = {
        encounter,
        evaluation,
        dirty: typedInjectionDirtyRef.current,
      };
      typedInjectionStateRef.current = next;
      setTypedInjectionState(next);
    },
    [],
  );

  const rememberInjectionDirty = useCallback((dirty: boolean) => {
    typedInjectionDirtyRef.current = dirty;
    const current = typedInjectionStateRef.current;
    if (!current || current.dirty === dirty) return;
    const next = { ...current, dirty };
    typedInjectionStateRef.current = next;
    setTypedInjectionState(next);
  }, []);

  useEffect(() => {
    const uninstall = installInjectionPresentationExtension(
      () => typedInjectionStateRef.current?.encounter,
      () => rememberInjectionDirty(false),
    );
    setInjectionExtensionInstalled(injectionPresentationExtensionAvailable());
    return uninstall;
  }, [rememberInjectionDirty]);

  useEffect(() => {
    const refreshInjectionStorageState = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== INJECTION_RECORDS_STORAGE_KEY && event.key !== null) return;
      // A storage event for this key is necessarily from another document.
      // Stop trusting the boot-time legacy list even when only our owned
      // envelope changed and the compatibility fingerprint is otherwise equal.
      injectionStorageConflictRef.current = true;
      setInjectionStorageConflict(true);
      setInjectionStorageRevision((value) => value + 1);
    };
    window.addEventListener('storage', refreshInjectionStorageState);
    return () =>
      window.removeEventListener('storage', refreshInjectionStorageState);
  }, []);

  useEffect(() => {
    const quarantineChangedUdsRecord = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== UDS_RECORDS_STORAGE_KEY && event.key !== null) return;
      if (udsActiveRecordStorageConflictRef.current) return;
      const activeRecord = udsActiveRecordRef.current;
      if (!activeRecord || udsRecordMatchesDurableStorage(activeRecord)) return;
      // Storage events for this key come from another document. Keep the
      // in-memory snapshot visible only as a quarantined reference until staff
      // explicitly opens freshly revalidated durable bytes (or starts anew).
      udsActiveRecordStorageConflictRef.current = true;
      setUdsActiveRecordStorageConflict(true);
    };
    window.addEventListener('storage', quarantineChangedUdsRecord);
    return () =>
      window.removeEventListener('storage', quarantineChangedUdsRecord);
  }, []);

  useEffect(() => {
    const protectUnsavedTypedWork = (event: BeforeUnloadEvent) => {
      if (
        !typedInjectionStateRef.current?.dirty &&
        !typedFormsStateRef.current?.dirty &&
        !typedSamplesStateRef.current?.dirty
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener('beforeunload', protectUnsavedTypedWork);
    return () =>
      window.removeEventListener('beforeunload', protectUnsavedTypedWork);
  }, []);

  useEffect(() => {
    const flushUnsavedTypedInjection = () => {
      const current = typedInjectionStateRef.current;
      if (!current?.dirty) return;
      if (injectionStorageConflictRef.current) return;
      if (
        rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid'
      ) {
        return;
      }
      const saved = saveFullInjectionDraft({
        encounter: current.encounter,
        typedDirty: true,
        readLegacyState: runtime.injectionRecordState,
        saveLegacyDraft: runtime.saveDraft,
        extensionAvailable: injectionPresentationExtensionAvailable,
      });
      if (saved) rememberInjectionDirty(false);
    };
    const flushWhenHidden = () => {
      if (document.hidden) flushUnsavedTypedInjection();
    };
    window.addEventListener('pagehide', flushUnsavedTypedInjection, {
      capture: true,
    });
    document.addEventListener('visibilitychange', flushWhenHidden, {
      capture: true,
    });
    return () =>
      {
        window.removeEventListener('pagehide', flushUnsavedTypedInjection, true);
        document.removeEventListener('visibilitychange', flushWhenHidden, true);
      };
  }, [clinicalSource, rememberInjectionDirty, runtime]);

  useEffect(() => {
    const current = typedInjectionStateRef.current;
    if (!current?.dirty || !injectionExtensionInstalled) return;
    const timer = window.setTimeout(() => {
      const latest = typedInjectionStateRef.current;
      if (!latest?.dirty) return;
      if (injectionStorageConflictRef.current) return;
      if (
        rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid'
      ) {
        return;
      }
      const saved = saveFullInjectionDraft({
        encounter: latest.encounter,
        typedDirty: true,
        readLegacyState: runtime.injectionRecordState,
        saveLegacyDraft: runtime.saveDraft,
        // Field edits have already synchronously projected changed chip
        // facts. Do not make patient-only background saves rebuild the heavy
        // hidden chip workspace; explicit lifecycle saves still force it.
        forceChipState: false,
        extensionAvailable: injectionPresentationExtensionAvailable,
      });
      if (saved) rememberInjectionDirty(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    clinicalSource,
    injectionExtensionInstalled,
    rememberInjectionDirty,
    runtime,
    typedInjectionState?.dirty,
    typedInjectionState?.encounter,
  ]);

  const rememberFormsState = useCallback(
    (encounter: FormsEncounter, state: { dirty: boolean }) => {
      const next = { encounter, dirty: state.dirty };
      typedFormsStateRef.current = next;
      setTypedFormsState(next);
    },
    [],
  );

  const rememberSamplesState = useCallback(
    (encounter: SamplesEncounter, state: { dirty: boolean }) => {
      const next = { encounter, dirty: state.dirty };
      typedSamplesStateRef.current = next;
      setTypedSamplesState(next);
    },
    [],
  );

  const rememberFormsDirty = useCallback((dirty: boolean) => {
    const current = typedFormsStateRef.current;
    if (!current || current.dirty === dirty) return;
    rememberFormsState(current.encounter, { dirty });
  }, [rememberFormsState]);

  const rememberSamplesDirty = useCallback((dirty: boolean) => {
    const current = typedSamplesStateRef.current;
    if (!current || current.dirty === dirty) return;
    rememberSamplesState(current.encounter, { dirty });
  }, [rememberSamplesState]);

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
        typedInjectionDirtyRef.current = false;
        typedInjectionStateRef.current = null;
        setTypedInjectionState(null);
        setInjectionRecordEpoch((value) => value + 1);
        // A genuine record switch (opening a different saved record, or
        // starting a new one) must not let the coordinator's cross-workflow
        // active-patient inheritance resurrect the previous record's
        // patient into the freshly (un)loaded one - sync the active patient
        // to match whatever the newly active record itself holds, same as
        // legacy's own newInjection()/openRecord() (no ambient inheritance).
        coordinator.setActivePatient(rawInjectionEncounter(clinicalSource, runtime).patient);
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
          key={formsRecordEpoch}
          initialEncounter={
            typedFormsState?.encounter ??
            clinical.state.workflows.forms.encounter
          }
          initialDirty={typedFormsState?.dirty}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'forms')}
          staffSignInValue={activeStaffValue()}
          previewRef={formsPanelRef}
          onDirtyChange={rememberFormsDirty}
          onWorkflowStateChange={rememberFormsState}
        />
      );
    }
    if (workflow === 'uds') {
      return (
        <UdsPanel
          key={udsRecordEpoch}
          initialEncounter={
            udsLaunchEncounter ??
            udsActiveRecord?.snapshot ??
            typedUdsState?.encounter ??
            clinical.state.workflows.uds.encounter
          }
          initialRecord={udsLaunchEncounter ? undefined : udsActiveRecord}
          activePatient={context.patient}
          staffSignInValue={activeStaffValue()}
          recordMutationAccess={udsRecordMutationAccess}
          recordStorageConflict={udsActiveRecordStorageConflict}
          previewRef={udsPanelRef}
          onActiveRecordChange={rememberUdsRecord}
          onPendingAddendumChange={rememberPendingUdsAddendum}
          onPendingPhotoChange={rememberPendingUdsPhoto}
          onWorkflowStateChange={(encounter, evaluation, state) => {
            const nextState = { encounter, evaluation, locked: state.locked };
            typedUdsStateRef.current = nextState;
            setTypedUdsState(nextState);
            if (udsLaunchEncounter) setUdsLaunchEncounter(undefined);
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
      const launch = rawInjectionEncounterRead(clinicalSource, runtime);
      return (
        <InjectionPanel
          key={injectionRecordEpoch}
          initialEncounter={launch.encounter}
          activePatient={context.patient}
          staffSignInValue={activeStaffValue()}
          previewRef={injectionPanelRef}
          locked={runtime.injectionRecordState().lifecycle === 'locked'}
          editorUnavailable={
            !injectionExtensionInstalled ||
            injectionStorageConflict ||
            launch.status === 'invalid'
          }
          kioskMode={context.kioskMode}
          kioskStep={context.injectionKioskStep}
          onKioskStepChange={context.onInjectionKioskStepChange}
          onPendingAddendumChange={rememberPendingInjectionAddendum}
          onDirtyChange={rememberInjectionDirty}
          onWorkflowStateChange={(encounter, evaluation) =>
            {
              rememberInjectionState(encounter, evaluation);
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
          key={samplesRecordEpoch}
          initialEncounter={
            typedSamplesState?.encounter ??
            clinical.state.workflows.samples.encounter
          }
          initialDirty={typedSamplesState?.dirty}
          activePatient={context.patient}
          evaluation={selectClinicalEvaluation(clinical, 'samples')}
          staffSignInValue={activeStaffValue()}
          previewRef={samplesPanelRef}
          onDirtyChange={rememberSamplesDirty}
          onWorkflowStateChange={rememberSamplesState}
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

  const canLeaveActiveEditor = (): boolean => {
    const currentWorkflow = runtime.activeWorkflow();
    if (
      currentWorkflow === 'administer' &&
      (pendingInjectionAddendumRef.current || pendingInjectionAddendum)
    ) {
      // A modal Records window owns the top layer here. Keep focus inside it;
      // the drawer renders the veto explanation and staff can close it before
      // returning to the highlighted addendum.
      if (!recordsOpen) {
        const addendum = injectionPanelRef.current?.querySelector<HTMLTextAreaElement>(
          '[data-addendum-input]',
        );
        addendum?.scrollIntoView({ block: 'center' });
        addendum?.focus({ preventScroll: true });
      }
      return false;
    }
    if (
      currentWorkflow === 'uds' &&
      (pendingUdsAddendumRef.current || pendingUdsAddendum)
    ) {
      requestWorkstationUdsLeaveBlocked('addendum');
      return false;
    }
    if (
      currentWorkflow === 'uds' &&
      (pendingUdsPhotoRef.current || pendingUdsPhoto)
    ) {
      requestWorkstationUdsLeaveBlocked('photo');
      return false;
    }

    // Leaving an editable injection record is an explicit save boundary.
    if (currentWorkflow === 'administer') {
      const current = typedInjectionStateRef.current;
      const presentationStatus =
        rawInjectionEncounterRead(clinicalSource, runtime).status;
      if (
        injectionStorageConflictRef.current ||
        presentationStatus === 'invalid' ||
        !injectionPresentationExtensionAvailable()
      ) {
        // A clean protected view can be left without writing. If it contains
        // an in-memory edit, keep it mounted until storage is recoverable.
        if (!current?.dirty) return true;
        refresh();
        return false;
      }
      const legacyState = runtime.injectionRecordState();
      const saved = current
        ? saveFullInjectionDraft({
            encounter: current.encounter,
            typedDirty: current.dirty,
            readLegacyState: runtime.injectionRecordState,
            saveLegacyDraft: runtime.saveDraft,
            extensionAvailable: injectionPresentationExtensionAvailable,
          })
        : !legacyState.canDiscard || runtime.saveDraft();
      if (!saved) {
        coordinator.synchronize(['injection']);
        refresh();
        return false;
      }
      if (current?.dirty) rememberInjectionDirty(false);
    }

    if (currentWorkflow === 'uds') {
      const current = typedUdsStateRef.current;
      if (current?.locked) return true;
      const saved = udsActiveRecordRef.current;
      if (current && !saved && current.evaluation.readiness === 'idle') {
        return true;
      }
      // A chart replaces (and unmounts) workflow content. Once this exact
      // snapshot is durable, later chart actions need no mounted listener.
      if (current && saved && sameUdsEncounter(saved.snapshot, current.encounter)) {
        return true;
      }
      // While mounted, the UDS owner answers synchronously from refs. A fresh
      // idle note is an accepted no-op; a changed or cleared saved draft files.
      if (!requestWorkstationDraftSave('uds')) return false;
    }
    return true;
  };

  const activateWorkflow = (workflow: WorkflowId): boolean => {
    coordinator.navigate(DESKTOP_TO_APPLICATION[workflow]);
    runtime.activate(workflow);
    coordinator.synchronize();
    refresh();
    return true;
  };

  const openWorkflow = (workflow: WorkflowId): boolean => {
    const currentWorkflow = runtime.activeWorkflow();
    if (workflow !== currentWorkflow && !canLeaveActiveEditor()) return false;
    return activateWorkflow(workflow);
  };

  const synchronizeInjectionRecordSwitch = () => {
    const nextSnapshot = readLegacyShellSnapshot(runtime);
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    const nextRecordGeneration = window.ipmgInjectionRecordGeneration?.() ?? 0;
    if (nextRecordGeneration !== injectionRecordGenerationRef.current) {
      injectionRecordGenerationRef.current = nextRecordGeneration;
      typedInjectionDirtyRef.current = false;
      typedInjectionStateRef.current = null;
      setTypedInjectionState(null);
      setInjectionRecordEpoch((value) => value + 1);
    }
    coordinator.navigate('injection');
    // The record switch owns the next active patient. Do this synchronously
    // with the generation/key update so the former blank panel cannot use a
    // newly-restored patient as a cue to mirror its old empty encounter over
    // the restored draft before the new panel mounts.
    coordinator.setActivePatient(rawInjectionEncounter(clinicalSource, runtime).patient);
    coordinator.synchronize(['injection']);
    refresh();
  };

  const focusInjectionEditorNextFrame = () => {
    window.requestAnimationFrame(() => {
      const panel = injectionPanelRef.current;
      const target =
        panel?.querySelector<HTMLElement>(
          'input[placeholder="Last, First"]:not(:disabled)',
        ) ??
        panel?.querySelector<HTMLElement>(
          'textarea[data-addendum-input]:not(:disabled)',
        ) ??
        panel?.querySelector<HTMLElement>(
          'input[placeholder="Current staff name or initials"]:not(:disabled)',
        );
      target?.focus({ preventScroll: true });
    });
  };

  const openInjectionRecord = (
    id: string,
    expectedPatient?: PatientContext,
  ): boolean | 'patient-identity-mismatch' => {
    const previousWorkflow = runtime.activeWorkflow();
    if (!canLeaveActiveEditor()) return false;
    if (injectionStorageConflictRef.current) return false;
    const listed = new InjectionRecordRepository(browserSafeStorage()).list();
    if (
      !listed.ok ||
      listed.warnings.length ||
      !injectionRecordsUsableAndUnambiguous(listed.value) ||
      !sameInjectionRecordListAsLegacy(listed.value)
    ) {
      return false;
    }
    const matches = listed.value.filter((record) => record.id === id);
    const target = matches.length === 1 ? matches[0] : undefined;
    if (!target || !isUsableInjectionRecord(target)) return false;
    if (expectedPatient) {
      const expectedPatientKey = chartPatientKey(
        expectedPatient.name ?? '',
        expectedPatient.dob ?? '',
      );
      if (
        !expectedPatientKey ||
        chartPatientKey(target.patient.name, target.patient.dob) !==
          expectedPatientKey
      ) {
        return 'patient-identity-mismatch';
      }
    }
    // The frozen legacy runtime owns an unconditional pagehide flush. Without
    // the synchronous presentation extension we cannot gate that stale
    // closure after a cross-tab storage event, so opening an editable saved
    // draft would let pagehide overwrite newer records. Completed records are
    // read-only and their legacy flush is a no-op; editable drafts fail closed.
    if (
      target.status === 'draft' &&
      !injectionPresentationExtensionAvailable()
    ) {
      return false;
    }
    let opened = false;
    const nativeGetElementById = document.getElementById;
    const originalGetElementByIdDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'getElementById',
    );
    let fieldProjectionInstalled = false;
    try {
      const legacyBridge = window.IPMGRecords as unknown as
        | { list?: () => unknown[] }
        | undefined;
      const legacyMatches = legacyBridge?.list?.().filter((entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry) &&
        (entry as Record<string, unknown>).id === id,
      ) ?? [];
      const legacyRecord =
        legacyMatches.length === 1
          ? legacyMatches[0] as Record<string, unknown>
          : undefined;
      const legacySnapshot =
        legacyRecord?.snapshot &&
        typeof legacyRecord.snapshot === 'object' &&
        !Array.isArray(legacyRecord.snapshot)
          ? legacyRecord.snapshot as Record<string, unknown>
          : undefined;
      const legacyFields =
        legacySnapshot?.fields &&
        typeof legacySnapshot.fields === 'object' &&
        !Array.isArray(legacySnapshot.fields)
          ? legacySnapshot.fields as Record<string, unknown>
          : undefined;
      if (!legacyRecord || !legacySnapshot || !legacyFields) return false;
      const blockedFieldIds = new Set(
        Object.keys(legacyFields).filter((fieldId) => {
          const element = nativeGetElementById.call(document, fieldId);
          // Unknown forward-compatible fields stay in the durable snapshot but
          // are never applied by this older runtime. Mask a currently absent
          // id too: initiation restore can create controls such as a second
          // component NDC before the legacy all-fields loop reaches them.
          // Existing non-value nodes are harmless to that loop and must remain
          // visible to the runtime for its own rendering/lock machinery.
          return !LEGACY_INJECTION_SNAPSHOT_FIELD_IDS.has(fieldId) &&
            (!element || 'value' in element);
        }),
      );
      if (blockedFieldIds.size) {
        Object.defineProperty(document, 'getElementById', {
          configurable: true,
          writable: true,
          value(fieldId: string) {
            if (blockedFieldIds.has(fieldId)) return null;
            return nativeGetElementById.call(document, fieldId);
          },
        });
        fieldProjectionInstalled = true;
      }
      opened = runtime.openInjectionRecord(id);
      if (opened && runtime.injectionRecordState().lifecycle === 'locked') {
        const activeEditor = injectionPanelRef.current?.querySelector<
          HTMLFieldSetElement
        >('fieldset');
        if (activeEditor) activeEditor.disabled = true;
      }
    } catch {
      opened = false;
    } finally {
      if (fieldProjectionInstalled) {
        if (originalGetElementByIdDescriptor) {
          Object.defineProperty(
            document,
            'getElementById',
            originalGetElementByIdDescriptor,
          );
        } else {
          Reflect.deleteProperty(document, 'getElementById');
        }
      }
    }
    if (!opened) {
      if (runtime.activeWorkflow() !== previousWorkflow) {
        activateWorkflow(previousWorkflow);
      }
      return false;
    }
    synchronizeInjectionRecordSwitch();
    focusInjectionEditorNextFrame();
    return true;
  };

  const openUdsRecord = (
    id: string,
    expectedPatient?: PatientContext,
  ): boolean | 'patient-identity-mismatch' => {
    if (!canLeaveActiveEditor()) return false;
    const listed = new UdsRecordRepository(browserSafeStorage()).list();
    if (
      !listed.ok ||
      listed.warnings.length > 0 ||
      !isUnambiguousUsableUdsRecordList(listed.value)
    ) return false;
    const matches = listed.value.filter((record) => record.id === id);
    const record = matches.length === 1 ? matches[0] : undefined;
    if (!record || !isUsableUdsRecord(record)) return false;
    if (expectedPatient) {
      const expectedPatientKey = chartPatientKey(
        expectedPatient.name ?? '',
        expectedPatient.dob ?? '',
      );
      if (
        !expectedPatientKey ||
        chartPatientKey(record.patient.name, record.patient.dob) !==
          expectedPatientKey
      ) {
        return 'patient-identity-mismatch';
      }
    }
    rememberUdsRecord(record);
    setUdsLaunchEncounter(undefined);
    typedUdsStateRef.current = null;
    setTypedUdsState(null);
    rememberPendingUdsAddendum(false);
    rememberPendingUdsPhoto(false);
    setUdsRecordEpoch((value) => value + 1);
    coordinator.setActivePatient(record.snapshot.patient);
    return activateWorkflow('uds');
  };

  const startNewUds = (chartPatient?: PatientContext): boolean => {
    if (!canLeaveActiveEditor()) return false;
    const listed = new UdsRecordRepository(browserSafeStorage()).list();
    if (
      !listed.ok ||
      listed.warnings.length > 0 ||
      !isUnambiguousUsableUdsRecordList(listed.value)
    ) return false;
    const nextEncounter = {
      ...emptyUdsEncounter(),
      patient: {
        name: chartPatient?.name ?? '',
        dob: chartPatient?.dob ?? '',
      },
    };
    rememberUdsRecord(undefined);
    setUdsLaunchEncounter(nextEncounter);
    const nextState = {
      encounter: nextEncounter,
      evaluation: UdsEngine.evaluate(nextEncounter, {}),
      locked: false,
    };
    typedUdsStateRef.current = nextState;
    setTypedUdsState(nextState);
    rememberPendingUdsAddendum(false);
    rememberPendingUdsPhoto(false);
    setUdsRecordEpoch((value) => value + 1);
    coordinator.setActivePatient(nextEncounter.patient);
    return activateWorkflow('uds');
  };

  const launchTransientNote = (
    workflow: TransientWorkflow,
    chartPatient: PatientContext,
  ): boolean => {
    const patientIdentity = {
      name: chartPatient.name ?? '',
      dob: chartPatient.dob ?? '',
    };
    if (workflow === 'forms') {
      const encounter = {
        ...emptyFormsEncounter(),
        patient: patientIdentity,
      };
      rememberFormsState(encounter, { dirty: false });
      setFormsRecordEpoch((value) => value + 1);
    } else {
      const encounter = {
        ...emptySamplesEncounter(),
        patient: patientIdentity,
      };
      rememberSamplesState(encounter, { dirty: false });
      setSamplesRecordEpoch((value) => value + 1);
    }
    setPendingTransientReplacement(null);
    setExternalWorkflowHandoffToken((value) => value + 1);
    coordinator.setActivePatient(patientIdentity);
    return activateWorkflow(workflow);
  };

  const dismissTransientReplacement = () => {
    setPendingTransientReplacement(null);
    setExternalWorkflowHandoffToken((value) => value + 1);
  };

  const startNewTransientNote = (
    workflow: TransientWorkflow,
    chartPatient: PatientContext,
  ): boolean => {
    if (!canLeaveActiveEditor()) return false;
    const retained =
      workflow === 'forms'
        ? typedFormsStateRef.current
        : typedSamplesStateRef.current;
    // Forms/Samples are transient and can only be edited through their mounted
    // typed panels. Compatibility defaults (signed-in staff and today's date)
    // make the coordinator encounter non-empty before any user action, so the
    // panel's sticky all-field dirty signal is the truthful replacement guard.
    const started = Boolean(retained?.dirty);

    if (!started) return launchTransientNote(workflow, chartPatient);

    // Put the existing target note behind the confirmation. If staff keep it,
    // the note stays intact and in view; replacement is the explicit action.
    activateWorkflow(workflow);
    setPendingTransientReplacement({
      workflow,
      patient: {
        name: chartPatient.name ?? '',
        dob: chartPatient.dob ?? '',
      },
    });
    return true;
  };

  const openRecord = (record: InjectionRecordRow) => {
    openInjectionRecord(record.id);
  };

  const queueOpen = (item: WorkQueueItem) => openWorkflow(item.workflow);

  const activeWorkflow =
    APPLICATION_TO_DESKTOP[clinical.state.activeWorkflow] ??
    snapshot.activeWorkflow;
  useEffect(() => {
    if (activeWorkflow !== 'uds') {
      setUdsRecordMutationAccess('pending');
      return;
    }
    setUdsRecordMutationAccess('pending');
    return holdUdsRecordMutationLock(setUdsRecordMutationAccess);
  }, [activeWorkflow]);
  const activeClinicalWorkflow = DESKTOP_TO_CLINICAL[activeWorkflow];
  const injectionAttestation =
    activeWorkflow === 'administer'
      ? runtime.injectionAttestationSummary()
      : undefined;
  const injectionEncounter =
    activeWorkflow === 'administer'
      ? typedInjectionState?.encounter ?? rawInjectionEncounter(clinicalSource, runtime)
      : undefined;
  const udsEncounter =
    activeWorkflow === 'uds' ? typedUdsState?.encounter : undefined;
  const injectionPatient = injectionEncounter?.patient;
  const patient: PatientContext = {
    name: injectionPatient?.name ?? udsEncounter?.patient.name ?? clinical.state.activePatient.name,
    dob: injectionPatient?.dob ?? udsEncounter?.patient.dob ?? clinical.state.activePatient.dob,
    localRecordId:
      injectionAttestation?.activeRecordId ??
      (activeWorkflow === 'uds' ? udsActiveRecord?.id : undefined),
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
  const injectionPresentationStatus =
    activeWorkflow === 'administer'
      ? rawInjectionEncounterRead(clinicalSource, runtime).status
      : 'absent';
  const injectionPresentationSafe = injectionPresentationStatus !== 'invalid';
  const injectionDraftProtectionAvailable =
    injectionPresentationSafe && !injectionStorageConflict;
  const injectionDraftCanPersist = Boolean(
    injectionDraftProtectionAvailable &&
      injectionExtensionInstalled &&
      (injectionRecordState?.canDiscard || typedInjectionState?.dirty),
  );
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
  const injectionPersistenceBlockingDetail =
    activeWorkflow !== 'administer'
      ? undefined
      : !injectionDraftProtectionAvailable
        ? RECORD.injectionPresentationDataInvalid
        : !injectionExtensionInstalled
          ? RECORD.injectionDraftProtectionUnavailable
          : undefined;
  const saveInjectionDraft = (): boolean => {
    if (
      !injectionPresentationExtensionAvailable() ||
      injectionStorageConflictRef.current ||
      rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid'
    ) {
      return false;
    }
    const current = typedInjectionStateRef.current;
    const saved = current
      ? saveFullInjectionDraft({
          encounter: current.encounter,
          typedDirty: current.dirty,
          readLegacyState: runtime.injectionRecordState,
          saveLegacyDraft: runtime.saveDraft,
          extensionAvailable: injectionPresentationExtensionAvailable,
        })
      : runtime.saveDraft();
    if (saved) rememberInjectionDirty(false);
    coordinator.synchronize(['injection']);
    refresh();
    return saved;
  };
  const startNewInjection = (chartPatient?: PatientContext): boolean => {
    if (
      !injectionPresentationExtensionAvailable() ||
      injectionStorageConflictRef.current ||
      rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid'
    ) {
      return false;
    }
    const previousWorkflow = runtime.activeWorkflow();
    if (!canLeaveActiveEditor()) return false;
    const started = runtime.startNewInjection();
    if (started) {
      if (chartPatient) {
        clinicalSource.applyPatientIfEmpty('injection', {
          name: chartPatient.name ?? '',
          dob: chartPatient.dob ?? '',
        });
      }
      synchronizeInjectionRecordSwitch();
      if (chartPatient) {
        coordinator.setActivePatient({
          name: chartPatient.name ?? '',
          dob: chartPatient.dob ?? '',
        });
      }
      focusInjectionEditorNextFrame();
      return true;
    }
    if (runtime.activeWorkflow() !== previousWorkflow) {
      activateWorkflow(previousWorkflow);
    }
    refresh();
    return false;
  };
  const discardInjectionDraft = (): boolean => {
    if (
      !injectionPresentationExtensionAvailable() ||
      injectionStorageConflictRef.current ||
      rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid'
    ) {
      return false;
    }
    const current = typedInjectionStateRef.current;
    const legacyState = runtime.injectionRecordState();
    const discarded =
      current?.dirty && !legacyState.activeRecordId
        ? runtime.startNewInjection()
        : runtime.discardInjectionDraft();
    if (discarded) {
      typedInjectionDirtyRef.current = false;
      typedInjectionStateRef.current = null;
      setTypedInjectionState(null);
      injectionRecordGenerationRef.current =
        window.ipmgInjectionRecordGeneration?.() ??
        injectionRecordGenerationRef.current;
      setInjectionRecordEpoch((value) => value + 1);
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
      !injectionPresentationExtensionAvailable() ||
      injectionStorageConflictRef.current ||
      rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid' ||
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
      !injectionPresentationExtensionAvailable() ||
      injectionStorageConflictRef.current ||
      rawInjectionEncounterRead(clinicalSource, runtime).status === 'invalid' ||
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
        onBeforeViewChange={canLeaveActiveEditor}
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
          localAttestationReady &&
          injectionExtensionInstalled &&
          injectionDraftProtectionAvailable
        }
        statusMessage={snapshot.statusMessage}
        onSaveDraft={
          activeWorkflow === 'administer' && injectionDraftCanPersist
            ? saveInjectionDraft
            : activeWorkflow === 'uds' &&
                !udsActiveRecordStorageConflict &&
                (typedUdsState?.evaluation.readiness !== 'idle' ||
                  Boolean(udsActiveRecord)) &&
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
                  injectionPersistenceBlockingDetail ??
                  readinessModel.firstBlockingDetail ??
                  attestationBlockingDetail,
                canDiscard: injectionDraftCanPersist,
                unavailable:
                  !injectionExtensionInstalled ||
                  !injectionDraftProtectionAvailable,
                onStartNew: startNewInjection,
                onDiscard: () => setRecordAction('discard'),
              }
            : undefined
        }
        injectionKioskContext={
          activeWorkflow === 'administer' && injectionEncounter
            ? {
                priorDoseDate: injectionEncounter.priorDoseDate,
                priorSite: injectionEncounter.priorSite,
                nextDoseDate:
                  injectionEncounter.nextDoseDate ||
                  typedInjectionState?.evaluation.output.expectedNextDoseDate,
                nonAdministration: Boolean(
                  injectionEncounter.disposition?.kind &&
                    injectionEncounter.disposition.kind !== 'administered',
                ),
              }
            : undefined
        }
        onStartNewInjection={startNewInjection}
        onOpenStaff={() => setContextEditor('staff')}
        onOpenLocation={() => setContextEditor('location')}
        onOpenRecords={() => setRecordsOpen(true)}
        onLookup={() => setRecordsOpen(true)}
        onCopyNoteSection={
          (activeWorkflow === 'administer' && !injectionDraftProtectionAvailable) ||
          (activeWorkflow === 'uds' && udsActiveRecordStorageConflict)
            ? undefined
            : (section) => copyLegacyNoteSection(activeWorkflow, section.id)
        }
        onCopyAllNotes={
          (activeWorkflow === 'administer' && !injectionDraftProtectionAvailable) ||
          (activeWorkflow === 'uds' && udsActiveRecordStorageConflict)
            ? undefined
            : () => copyAllLegacyNotes(activeWorkflow)
        }
        onQueueItemOpen={queueOpen}
        onRecordOpen={openRecord}
        onOpenInjectionRecord={openInjectionRecord}
        onOpenUdsRecord={openUdsRecord}
        onStartNewUds={startNewUds}
        onStartNewTransientNote={startNewTransientNote}
        externalWorkflowHandoffToken={externalWorkflowHandoffToken}
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
        onRecordOpen={(id) => openInjectionRecord(id) === true}
        onCreate={startNewInjection}
        onHandoffComplete={() =>
          setExternalWorkflowHandoffToken((value) => value + 1)
        }
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
      {pendingTransientReplacement && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog cd2004-record-action-dialog"
          labelledBy="cd2004-replace-note-title"
          onDismiss={dismissTransientReplacement}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="cd2004-replace-note-title">
                {RECORD.replaceStartedNoteTitle(
                  WORKFLOW_LABELS[pendingTransientReplacement.workflow],
                )}
              </span>
              <button
                type="button"
                aria-label={RECORD.closeConfirmation}
                onClick={dismissTransientReplacement}
              >
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>
                {RECORD.replaceStartedNotePrompt(
                  WORKFLOW_LABELS[pendingTransientReplacement.workflow],
                )}
              </p>
              <p class="cd2004-record-action-warning">
                {RECORD.replaceStartedNoteWarning}
              </p>
            </div>
            <div class="cd2004-dialog-actions">
              <span />
              <button
                type="button"
                autoFocus
                onClick={dismissTransientReplacement}
              >
                {RECORD.keepCurrentNote}
              </button>
              <button
                type="button"
                class="is-danger"
                onClick={() =>
                  launchTransientNote(
                    pendingTransientReplacement.workflow,
                    pendingTransientReplacement.patient,
                  )
                }
              >
                {RECORD.replaceAndStart}
              </button>
            </div>
          </div>
        </ModalDialog>
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
