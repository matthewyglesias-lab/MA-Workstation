import {
  CHECKLIST,
  draftSavedAtCopy,
  NOTES,
  NOTES_TABLE,
  RECORD,
  signedAtCopy,
  signedByCopy,
  TRANSACTION_PHASE_LABEL,
} from "../../vocabulary";
import { createContext, type ComponentChildren, type Ref } from "preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  applyUdsDeviceProfileDefaults,
  displayedUdsPanels,
  deriveUdsReportStatus,
  emptyUdsEncounter,
  nextUdsResultState,
  profileFor,
  UdsEngine,
  UDS_CONTROL_OPTIONS,
  UDS_PANELS,
  UDS_REASON_OPTIONS,
  UDS_RESULT_LABEL,
  UDS_TEMP_OPTIONS,
  udsPanelName,
  type UdsControlState,
  type UdsEncounter,
  type UdsEvaluationOutput,
  type UdsPanel as UdsPanelKey,
  type UdsRequirement,
  type UdsResultState,
  type UdsTemperatureState,
} from "../../../domain/uds";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { DocumentationEngine } from "../../../documentation";
import { udsEncounterToDocumentationInput } from "../../../documentation/adapters/uds-from-encounter";
import { clickLegacyControl } from "../legacy-mirror";
import { countStopsByTab, OutstandingRequirements } from "../OutstandingRequirements";
import { StatusFlag } from "../StatusFlag";
import { mirrorUdsEncounterToLegacyDom, mirrorUdsSignatureToggle } from "./uds-legacy-mirror";
import type { PatientContext } from "../../types";
import { DesktopIcon } from "../../DesktopIcon";
import { ModalDialog } from "../../ModalDialog";
import { formatDobAsTyped } from "../../format-dob";
import { RecordActionDialog, type RecordActionKind } from "../../RecordActionDialog";
import { RecordLifecycleActions } from "../../RecordLifecycleActions";
import { UdsRecordsWindow } from "../../UdsRecordsWindow";
import {
  UdsRecordRepository,
  type UdsAddendum,
  type UdsLocalAttestation,
  type UdsRecord,
} from "../../../persistence/uds-records";
import { browserSafeStorage } from "../../../persistence/storage";
import { ScheduleRegister, type ScheduleRegisterTone } from "../ScheduleRegister";
import {
  isUnambiguousUsableUdsRecordList,
  isUsableUdsRecord,
  runOwnedUdsRecordMutation,
  UDS_RECORD_MUTATION_BUSY_MESSAGE,
  UDS_RECORD_MUTATION_PENDING_MESSAGE,
  UDS_RECORD_MUTATION_PROTECTION_MESSAGE,
  type UdsRecordMutationAccess,
} from "../../uds-record-safety";

/** The report status carries the old readout's tone vocabulary; map it onto the
 *  register's four states rather than widening the register for one caller. */
const UDS_REPORT_TONE: Record<string, ScheduleRegisterTone> = {
  neutral: "neutral",
  info: "neutral",
  attention: "warning",
  success: "ok",
  danger: "stop",
};
import { RegisterMarkers, WorkflowSummaryFact, type ClinicalFieldSource } from "../ClinicalRegister";
import { OptionList, WorkflowField } from "../WorkflowField";
import { WorkstationDateField } from "../WorkstationDateField";
import { isValidLocalDateTime } from "../../../domain/dates";
import {
  projectCarriedFieldSource,
  projectWorkflowLedgerState,
  projectWorkflowTransactionStatus,
  projectRecordLifecycle,
  type WorkflowFieldState,
} from "../../../application/workstation-projection";
import { requestClinicalPrint } from "../clinical-print";
import {
  workflowLedgerPanelId,
  workflowLedgerTabId,
  WorkflowLedgerTabs,
} from "../WorkflowLedgerTabs";
import {
  WORKSTATION_DRAFT_SAVE_REQUEST,
  WORKSTATION_OPEN_NOTE_REQUEST,
  WORKSTATION_UDS_LEAVE_BLOCKED_REQUEST,
  type WorkstationDraftSaveRequestDetail,
  type WorkstationOpenNoteRequestDetail,
  type WorkstationUdsLeaveBlockedRequestDetail,
} from "../../workstation-events";

type UdsTab = "specimen" | "results" | "review";

const UDS_TABS: readonly UdsTab[] = ["specimen", "results", "review"];

const currentLocalDateTime = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

/**
 * Addenda retain their exact ISO timestamp in storage, while the locked note
 * presents it in the same concise US date/time idiom as the legacy record
 * workspace. Bad historical values must never surface as "Invalid Date".
 */
const formatSavedAddendumTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return NOTES_TABLE.dateUnavailable;
  return timestamp.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const emptyUdsResults = (): UdsEncounter["results"] =>
  Object.fromEntries(UDS_PANELS.map((panel) => [panel, "nt"])) as UdsEncounter["results"];

// A point-of-care immunoassay report has three parts in every lab system that
// ever rendered one: what was collected, what the analyzer said, and what a
// human made of it. The tabs are those parts.
const UDS_TAB_LABEL: Record<UdsTab, string> = {
  specimen: "Specimen",
  results: "Results",
  review: "Review",
};

/**
 * Maps a ClinicalIssue's `field` back to the tab that edits it, so an
 * outstanding stop becomes a direct jump instead of a hunt across three tabs.
 */
function tabForUdsField(field?: string): UdsTab {
  const head = (field ?? "").split(".")[0];
  switch (head) {
    // What was collected, on what device, under what quality control.
    case "patient":
    case "collectionDateTime":
    case "collector":
    case "temperature":
    case "reason":
    case "reasonDetail":
    case "device":
    case "omittedPanel":
    case "customDeviceName":
    case "customPanels":
    case "customPanelSetVerified":
    case "physicalReadingsVerified":
    case "lot":
    case "expiration":
    case "control":
      return "specimen";
    case "results":
      return "results";
    // What a human made of it.
    case "validity":
      return "specimen";
    case "medicationAlignment":
    case "labPlan":
    case "comment":
      return "review";
    default:
      return "specimen";
  }
}

// Result flags are *derived* from the four states the panel already captures -
// no new clinical data is introduced. Old lab reports carried a one- or
// two-letter flag column beside the value; abnormal was the only thing that
// earned ink.
const UDS_RESULT_FLAG: Record<UdsResultState, { flag: string; status: string; abnormal: boolean }> =
  {
    nt: { flag: "", status: "Not tested", abnormal: false },
    neg: { flag: "", status: "Preliminary", abnormal: false },
    pos: { flag: "A", status: "Preliminary", abnormal: true },
    invalid: { flag: "INV", status: "Invalid", abnormal: true },
  };

export interface UdsPanelProps {
  initialEncounter: UdsEncounter;
  /**
   * Saved record that owns this panel instance. The shell retains it while
   * the workflow is unmounted so remounting cannot turn an edit into a new,
   * duplicate record or forget a completed record's locked lifecycle.
   */
  initialRecord?: UdsRecord;
  activePatient: PatientContext;
  staffSignInValue: string;
  recordMutationAccess: UdsRecordMutationAccess;
  recordStorageConflict: boolean;
  previewRef?: Ref<HTMLDivElement>;
  onRecordsChange?: () => void;
  onActiveRecordChange?: (record?: UdsRecord) => void;
  onPendingAddendumChange?: (pending: boolean) => void;
  onPendingPhotoChange?: (pending: boolean) => void;
  onWorkflowStateChange?: (
    encounter: UdsEncounter,
    evaluation: ClinicalEvaluation<UdsEvaluationOutput>,
    state: { locked: boolean },
  ) => void;
}

const patientIsEmpty = (patient: UdsEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

/** Which required fields the engine is *currently* stopping on - same idea
 * and same wiring as InjectionPanel's context, so a staff member scanning a
 * still-incomplete required field gets the same visual language on every
 * workflow instead of relearning one per panel. */
const UdsIncompleteFieldsContext = createContext<ReadonlySet<string>>(new Set());
const UdsRequirementsContext = createContext<Readonly<Record<string, UdsRequirement>>>({});

function Field({
  label,
  hint,
  width,
  field,
  source = "ENTRY",
  state,
  prompt,
  children,
}: {
  label: string;
  hint?: string;
  /** Sizes the control to its content. Free-text fields that hold a fixed
   * shape - a date typed as MM/DD/YYYY, a short code - should not stretch to
   * a full grid column just because the grid offers one. */
  width?: "date" | "short";
  /** Issue `field` this control edits, so an active stop on it can be shown
   * here instead of only in the aggregate outstanding-requirements list. */
  field?: string;
  source?: ClinicalFieldSource;
  /** Explicit state for command-dialog fields that are not encounter facts. */
  state?: WorkflowFieldState;
  prompt?: string;
  children: ComponentChildren;
}) {
  // Requirement is marked on the field itself - a red asterisk on the caption
  // and a filled control - rather than as a word of helper text underneath.
  // Only the bare "required"/"optional" markers are replaced; a hint carrying
  // real content ("required for Other") keeps its explanatory line.
  const required = hint?.startsWith("required") ?? false;
  const optional = hint?.startsWith("optional") ?? false;
  const incompleteFields = useContext(UdsIncompleteFieldsContext);
  const requirements = useContext(UdsRequirementsContext);
  const requirement = field ? requirements[field] : undefined;
  const incomplete = Boolean(field && incompleteFields.has(field));
  // A hint that only says "required"/"optional" is fully replaced by the
  // marker. One that qualifies it keeps the qualifier, minus the leading word
  // the marker already carries, so it does not read "optional ... optional".
  const detail =
    hint && hint !== "required" && hint !== "optional"
      ? hint.replace(/^(required|optional)[;:,]?\s*/i, "")
      : "";
  const code = `UDS-${field?.replace(/[^a-z0-9]+/gi, "-").toUpperCase() ?? label.replace(/[^a-z0-9]+/gi, "-").toUpperCase()}`;
  return (
    <WorkflowField
      label={label}
      hint={requirement?.reason ?? detail}
      field={field}
      width={width}
      prompt={prompt}
      presentation={{
        state: state ?? (
          requirement?.state === "hidden"
            ? "not-applicable"
            : requirement?.state === "pending"
              ? "pending-context"
              : requirement?.state === "required"
                ? "required"
                : requirement?.state === "optional"
                  ? "optional"
                  : required
                    ? "required"
                    : optional || !hint
                      ? "optional"
                      : "pending-context"),
        source,
        fieldCode: code,
      }}
      incomplete={incomplete}
    >
      {children}
    </WorkflowField>
  );
}

function ClinicianLabSheet({
  encounter,
  omittedPanel,
  includeSignatureFields,
}: {
  encounter: UdsEncounter;
  omittedPanel?: UdsPanelKey;
  includeSignatureFields: boolean;
}) {
  const hasValidCollectionTime = isValidLocalDateTime(encounter.collectionDateTime);
  const collected = hasValidCollectionTime
    ? new Date(encounter.collectionDateTime).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : encounter.collectionDateTime
      ? "INVALID / NOT ENTERED"
      : "NOT ENTERED";
  const reported = hasValidCollectionTime ? collected : "PENDING";
  const reportPanels = displayedUdsPanels(encounter);

  return (
    <section class="meditech-lab-sheet" aria-label="UDS clinician laboratory report preview">
      <header class="meditech-lab-header">
        <div>
          <strong>INTEGRATED PSYCHIATRIC MEDICAL GROUP</strong>
          <span>POINT OF CARE LABORATORY</span>
        </div>
        <div>
          <b>UDS SCREEN</b>
          <span>CLINICIAN RESULT REPORT</span>
        </div>
      </header>

      <div class="meditech-lab-status">
        <strong>PRELIMINARY / PRESUMPTIVE</strong>
        <span>Confirm unexpected findings by definitive laboratory method.</span>
      </div>

      <dl class="meditech-lab-demographics">
        <div>
          <dt>PATIENT</dt>
          <dd>{encounter.patient.name || "NO PATIENT ENTERED"}</dd>
        </div>
        <div>
          <dt>DOB</dt>
          <dd>{encounter.patient.dob || "—"}</dd>
        </div>
        <div>
          <dt>ACCESSION</dt>
          <dd>POC-UDS / OPEN</dd>
        </div>
        <div>
          <dt>COLLECTED</dt>
          <dd>{collected}</dd>
        </div>
        <div>
          <dt>REPORTED</dt>
          <dd>{reported}</dd>
        </div>
        <div>
          <dt>COLLECTOR</dt>
          <dd>{encounter.collector || "—"}</dd>
        </div>
      </dl>

      <dl class="meditech-lab-device">
        <div>
          <dt>SPECIMEN</dt>
          <dd>Urine, random</dd>
        </div>
        <div>
          <dt>DEVICE / METHOD</dt>
          <dd>{encounter.customDeviceName?.trim() || encounter.device || "Device not entered"} · waived immunoassay</dd>
        </div>
        <div>
          <dt>LOT / EXP</dt>
          <dd>{encounter.lot || "—"} / {encounter.expiration || "—"}</dd>
        </div>
        <div>
          <dt>CONTROL</dt>
          <dd>{encounter.control}</dd>
        </div>
        <div>
          <dt>TEMPERATURE</dt>
          <dd>{encounter.temperature}</dd>
        </div>
      </dl>

      <table class="meditech-lab-results">
        <thead>
          <tr>
            <th>TEST / ANALYTE</th>
            <th>RESULT</th>
            <th>FLAG</th>
            <th>EXPECTED</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {reportPanels.map((panel) => {
            const notOnCup = panel === omittedPanel;
            const state: UdsResultState = notOnCup
              ? "nt"
              : encounter.results[panel] ?? "nt";
            const derived = UDS_RESULT_FLAG[state];
            const result = notOnCup
              ? "NOT ON DEVICE"
              : state === "pos"
                ? "PRESUMPTIVE POS"
                : state === "neg"
                  ? "NEGATIVE"
                  : state === "invalid"
                    ? "INVALID"
                    : "NOT TESTED";
            return (
              <tr class={derived.abnormal ? "is-abnormal" : ""} key={panel}>
                <td>
                  <b>{panel}</b>
                  <span>{udsPanelName(panel)}</span>
                </td>
                <td>{result}</td>
                <td>{notOnCup ? "" : derived.flag}</td>
                <td>NEGATIVE</td>
                <td>{notOnCup ? "Not on cup" : derived.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div class="meditech-lab-interpretation">
        <div>
          <b>VALIDITY</b>
          <span>{encounter.validity}</span>
        </div>
        <div>
          <b>MEDICATION ALIGNMENT</b>
          <span>{encounter.medicationAlignment || "NOT DOCUMENTED"}</span>
        </div>
        <div>
          <b>OUTSIDE LAB</b>
          <span>{encounter.labPlan ?? "provider to decide"}</span>
        </div>
        {encounter.comment?.trim() && (
          <p>
            <b>COMMENT:</b> {encounter.comment}
          </p>
        )}
      </div>

      <footer class="meditech-lab-footer">
        <p>
          Results are qualitative screening findings and are not diagnostic. Clinical correlation is required.
        </p>
        {includeSignatureFields && (
          <div class="meditech-lab-signatures">
            <span>REVIEWED BY</span>
            <span>DATE / TIME</span>
          </div>
        )}
      </footer>
    </section>
  );
}

export function UdsPanel({
  initialEncounter,
  initialRecord,
  activePatient,
  staffSignInValue,
  recordMutationAccess,
  recordStorageConflict,
  previewRef,
  onRecordsChange,
  onActiveRecordChange,
  onPendingAddendumChange,
  onPendingPhotoChange,
  onWorkflowStateChange,
}: UdsPanelProps) {
  const [encounter, setEncounter] = useState<UdsEncounter>(
    () => initialRecord?.snapshot ?? initialEncounter,
  );
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  // UDS field edits are evaluated from the typed encounter in the same render
  // cycle. The legacy DOM remains a print/report compatibility projection; it
  // is no longer the authority for readiness, field state, or attestation.
  const evaluation = useMemo(() => UdsEngine.evaluate(encounter, {}), [encounter]);
  const evaluationReadinessRef = useRef(evaluation.readiness);
  evaluationReadinessRef.current = evaluation.readiness;
  const [photoData, setPhotoData] = useState<string>("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [tab, setTab] = useState<UdsTab>("specimen");
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [normalQcReviewOpen, setNormalQcReviewOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<{
    state: "neg" | "nt";
    panels: readonly UdsPanelKey[];
    title: string;
  } | null>(null);
  const [activeResultPanel, setActiveResultPanel] = useState<UdsPanelKey | undefined>();
  const [invalidationReceipt, setInvalidationReceipt] = useState<string | null>(null);
  // Seeded from whatever the hidden legacy checkbox already holds at mount
  // (its own boot-time default) rather than forced, so a fresh encounter
  // doesn't silently flip the print report's signature-block default.
  const [includeSignatureFields, setIncludeSignatureFields] = useState<boolean>(
    () => (document.getElementById("udsSigToggle") as HTMLInputElement | null)?.checked ?? true,
  );
  const mirroredOnMount = useRef(false);

  // Local record lifecycle - fully self-contained here, unlike Injection's
  // (whose actual save/discard/lock engine lives in the legacy vanilla-JS
  // runtime and whose command bar is rendered by ClinicalDesktopShell). UDS
  // has no legacy engine to lean on, so both the persistence and the UI live
  // in this panel, the same way its own StatusFlag/OutstandingRequirements
  // dialog already do.
  const recordStorage = useMemo(() => browserSafeStorage(), []);
  const repository = useMemo(() => new UdsRecordRepository(recordStorage), [recordStorage]);
  const recordMutationAccessRef = useRef<UdsRecordMutationAccess>(recordMutationAccess);
  recordMutationAccessRef.current = recordMutationAccess;
  const recordStorageConflictRef = useRef(recordStorageConflict);
  recordStorageConflictRef.current = recordStorageConflict;
  const [activeRecordId, setActiveRecordId] = useState<string | undefined>(
    () => initialRecord?.id,
  );
  const [locked, setLocked] = useState(() => initialRecord?.status === "completed");
  const [addenda, setAddenda] = useState<UdsAddendum[]>(
    () => initialRecord?.addenda ?? [],
  );
  const [attestation, setAttestation] = useState<
    { staff: string; timestamp: string; statementVersion: string } | undefined
  >(() => initialRecord?.attestation);
  const [addendumAuthor, setAddendumAuthor] = useState(staffSignInValue);
  const [addendumText, setAddendumText] = useState("");
  const [addendumSaving, setAddendumSaving] = useState(false);
  const addendumSavingRef = useRef(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordAction, setRecordAction] = useState<RecordActionKind | null>(null);
  const [reviewedAttestation, setReviewedAttestation] =
    useState<UdsLocalAttestation | undefined>();
  const [recordStatus, setRecordStatus] = useState<string | undefined>(undefined);
  const [recordStatusIsError, setRecordStatusIsError] = useState(false);
  const [recordsRefreshToken, setRecordsRefreshToken] = useState(0);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const addendumTextRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoReaderRef = useRef<FileReader | null>(null);
  const photoRemoveButtonRef = useRef<HTMLButtonElement>(null);
  const lastDraftSavedStatusRef = useRef<string | null>(null);
  const initializedFromRecordRef = useRef(Boolean(initialRecord));
  const activeRecordIdRef = useRef(activeRecordId);
  const lockedRef = useRef(locked);
  const savedSnapshotRef = useRef<UdsEncounter | undefined>(initialRecord?.snapshot);
  // Every mutation of an existing record is conditional on the exact durable
  // record that this screen opened or most recently saved. Keeping the
  // serialized value (rather than a live object reference) makes the baseline
  // immutable even if a caller later reuses or mutates its record object.
  const durableRecordBaselineRef = useRef<
    { id: string; serialized: string } | undefined
  >(
    initialRecord
      ? { id: initialRecord.id, serialized: JSON.stringify(initialRecord) }
      : undefined,
  );
  const addendumPendingRef = useRef(false);
  const photoDataRef = useRef(photoData);
  const photoLoadingRef = useRef(photoLoading);
  const onRecordsChangeRef = useRef(onRecordsChange);
  const onActiveRecordChangeRef = useRef(onActiveRecordChange);
  const onPendingAddendumChangeRef = useRef(onPendingAddendumChange);
  const onPendingPhotoChangeRef = useRef(onPendingPhotoChange);
  const onWorkflowStateChangeRef = useRef(onWorkflowStateChange);
  activeRecordIdRef.current = activeRecordId;
  lockedRef.current = locked;
  photoDataRef.current = photoData;
  photoLoadingRef.current = photoLoading;
  onRecordsChangeRef.current = onRecordsChange;
  onActiveRecordChangeRef.current = onActiveRecordChange;
  onPendingAddendumChangeRef.current = onPendingAddendumChange;
  onPendingPhotoChangeRef.current = onPendingPhotoChange;
  onWorkflowStateChangeRef.current = onWorkflowStateChange;
  addendumPendingRef.current = Boolean(addendumText.trim());
  const recordMutationUnavailable =
    recordStorageConflict || recordMutationAccess !== "owned";
  const hasPendingPhoto = photoLoading || Boolean(photoData);
  const hasPendingPhotoNow = () =>
    photoLoadingRef.current || Boolean(photoDataRef.current);

  const publishWorkflowState = (
    source: UdsEncounter,
    nextLocked = lockedRef.current,
  ) => {
    const nextEvaluation = UdsEngine.evaluate(source, {});
    // State setters and effects are deferred. Navigation can be requested in
    // the same browser task as the very first edit, so the synchronous save
    // listener must see that edit as started immediately.
    evaluationReadinessRef.current = nextEvaluation.readiness;
    onWorkflowStateChangeRef.current?.(
      source,
      nextEvaluation,
      { locked: nextLocked },
    );
  };

  useEffect(() => {
    onWorkflowStateChangeRef.current?.(encounter, evaluation, { locked });
    // Notification boundary only; callback identity follows the shell render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter, evaluation, locked]);

  useEffect(() => {
    onPendingAddendumChangeRef.current?.(Boolean(addendumText.trim()));
  }, [addendumText, onPendingAddendumChange]);

  useEffect(() => {
    // A staff handoff updates the default author for the next addendum, but
    // never overwrites authorship while clarification text is in progress.
    if (!addendumPendingRef.current) setAddendumAuthor(staffSignInValue);
  }, [staffSignInValue]);

  useEffect(() => {
    onPendingPhotoChangeRef.current?.(hasPendingPhoto);
  }, [hasPendingPhoto, onPendingPhotoChange]);

  useEffect(() => {
    if (!recordStorageConflict) return;
    // A confirmation opened against the old durable record must not remain
    // actionable after another tab replaces those bytes.
    setRecordAction(null);
    setReviewedAttestation(undefined);
    setBulkAction(null);
    setNormalQcReviewOpen(false);
  }, [recordStorageConflict]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<{ workflow?: string; tab?: UdsTab; field?: string }>).detail;
      if (detail?.workflow !== "uds" || !detail.tab) return;
      setTab(detail.tab);
      if (detail.field) window.setTimeout(() => (document.querySelector(`[data-field-path="${detail.field}"] input, [data-field-path="${detail.field}"] select, [data-field-path="${detail.field}"] textarea, [data-field-path^="${detail.field}."] button`) as HTMLElement | null)?.focus(), 0);
    };
    window.addEventListener("ipmg:navigate-workflow-source", navigate);
    return () => window.removeEventListener("ipmg:navigate-workflow-source", navigate);
  }, []);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorUdsEncounterToLegacyDom(encounter, photoData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // An explicitly opened record remains authoritative even when its stored
    // demographics are incomplete. Ambient patient context must not mutate a
    // saved snapshot merely because the workflow remounted.
    if (initializedFromRecordRef.current) return;
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const patch = (
    update:
      | Partial<UdsEncounter>
      | ((previous: UdsEncounter) => Partial<UdsEncounter>),
    nextPhotoData = photoDataRef.current,
  ) => {
    // A save confirmation describes one exact snapshot. The first later edit
    // retires that confirmation; the lifecycle detail below then reports the
    // actual saved-vs-current comparison.
    if (lastDraftSavedStatusRef.current) {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(undefined);
    }
    setEncounter((previous) => {
      const partial = typeof update === "function" ? update(previous) : update;
      const next = { ...previous, ...partial };
      encounterRef.current = next;
      mirrorUdsEncounterToLegacyDom(next, nextPhotoData);
      publishWorkflowState(next);
      return next;
    });
  };

  const patchPatient = (partial: Partial<UdsEncounter["patient"]>) => {
    patch((previous) => ({
      patient: { ...previous.patient, ...partial },
    }));
  };

  const setPanelResult = (panel: UdsPanelKey, state: UdsResultState) => {
    patch((previous) => ({
      results: { ...previous.results, [panel]: state },
    }));
  };

  // A 13-panel cup physically does not display the omitted analyte, and the
  // engine stops on any result recorded against it. Every bulk action has to
  // honour that, or the obvious shortcut ("All tested negative") immediately
  // creates a stop that staff then have to hunt down and undo.
  const omittedPanel =
    profileFor(encounter.device) === "13" ? (encounter.omittedPanel ?? "") : "";

  const setAllPanels = (panels: readonly UdsPanelKey[], state: UdsResultState) => {
    const results = { ...encounter.results };
    panels.forEach((panel) => {
      if (panel === omittedPanel) return;
      results[panel] = state;
    });
    patch({ results });
  };

  const confirmBulkAction = () => {
    if (!bulkAction) return;
    setAllPanels(bulkAction.panels, bulkAction.state);
    setBulkAction(null);
  };

  const confirmNormalQcReview = () => {
    patch({
      temperature: "acceptable",
      control: "valid",
      validity: "acceptable",
      physicalReadingsVerified: true,
    });
    setNormalQcReviewOpen(false);
  };

  const onDeviceChange = (device: string) => {
    if (encounter.device && encounter.device !== device) {
      setInvalidationReceipt("DEVICE CHANGED · cleared panel readings and physical-reading verification");
    }
    const defaults = applyUdsDeviceProfileDefaults({
      ...encounter,
      device,
      omittedPanel: "",
      customDeviceName: "",
      customPanels: [],
    });
    patch({
      ...defaults,
      results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "nt"])) as UdsEncounter["results"],
      physicalReadingsVerified: false,
    });
  };

  const onOmittedPanelChange = (omittedPanel: UdsPanelKey | "") => {
    const defaults = applyUdsDeviceProfileDefaults({ ...encounter, omittedPanel });
    // Choosing which window is absent completes the already-selected device
    // profile. Clear readings/verification, but preserve QC facts staff just
    // documented for that same physical cup.
    patch({
      ...defaults,
      results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "nt"])) as UdsEncounter["results"],
      physicalReadingsVerified: false,
      control: encounter.control,
      validity: encounter.validity,
      temperature: encounter.temperature,
    });
  };

  const replaceCustomPanel = (index: number, panel: UdsPanelKey) => {
    const next = [...(encounter.customPanels ?? [])];
    next[index] = panel;
    patch({
      customPanels: next,
      results: emptyUdsResults(),
      physicalReadingsVerified: false,
    });
    setInvalidationReceipt("PANEL PROFILE CHANGED · cleared panel readings and physical-reading verification");
  };

  const moveCustomPanel = (index: number, direction: -1 | 1) => {
    const next = [...(encounter.customPanels ?? [])];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    patch({ customPanels: next, results: emptyUdsResults(), physicalReadingsVerified: false });
    setInvalidationReceipt("PANEL PROFILE CHANGED · cleared panel readings and physical-reading verification");
  };

  const removeCustomPanel = (index: number) => {
    const next = (encounter.customPanels ?? []).filter((_, position) => position !== index);
    patch({
      customPanels: next,
      results: emptyUdsResults(),
      physicalReadingsVerified: false,
    });
    setInvalidationReceipt("PANEL PROFILE CHANGED · cleared panel readings and physical-reading verification");
  };

  const addCustomPanel = () => {
    const nextPanel = UDS_PANELS.find((panel) => !(encounter.customPanels ?? []).includes(panel));
    if (nextPanel) {
      patch({
        customPanels: [...(encounter.customPanels ?? []), nextPanel],
        results: emptyUdsResults(),
        physicalReadingsVerified: false,
      });
      setInvalidationReceipt("PANEL PROFILE CHANGED · cleared panel readings and physical-reading verification");
    }
  };

  const clearSelectedPhoto = (focusInput = true) => {
    const reader = photoReaderRef.current;
    photoReaderRef.current = null;
    if (reader?.readyState === FileReader.LOADING) reader.abort();
    photoLoadingRef.current = false;
    photoDataRef.current = "";
    setPhotoLoading(false);
    setPhotoData("");
    mirrorUdsEncounterToLegacyDom(encounterRef.current, "");
    if (photoInputRef.current) photoInputRef.current.value = "";
    // State updates are scheduled, while navigation checks run synchronously.
    // Publish the cleared guard immediately so the explicit Remove action can
    // be followed by a navigation action in the same browser task.
    onPendingPhotoChangeRef.current?.(false);
    if (
      recordStatus === RECORD.photoReadFailed ||
      recordStatus === RECORD.removePhotoBeforeLeaving ||
      recordStatus === RECORD.removePhotoBeforeSigning
    ) {
      setRecordStatus(undefined);
      setRecordStatusIsError(false);
    }
    if (focusInput) {
      window.setTimeout(() => {
        photoInputRef.current?.focus({ preventScroll: true });
      }, 0);
    }
  };

  const onPhotoChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      clearSelectedPhoto(false);
      return;
    }

    const previousReader = photoReaderRef.current;
    photoReaderRef.current = null;
    if (previousReader?.readyState === FileReader.LOADING) previousReader.abort();

    // FileReader completes asynchronously. Publish the guard before starting
    // it so navigation or signing cannot slip through while bytes are read.
    setPhotoData("");
    setPhotoLoading(true);
    photoDataRef.current = "";
    photoLoadingRef.current = true;
    mirrorUdsEncounterToLegacyDom(encounterRef.current, "");
    onPendingPhotoChangeRef.current?.(true);

    const reader = new FileReader();
    photoReaderRef.current = reader;
    reader.onload = () => {
      if (photoReaderRef.current !== reader) return;
      photoReaderRef.current = null;
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl.startsWith("data:")) {
        photoDataRef.current = "";
        photoLoadingRef.current = false;
        setPhotoData("");
        setPhotoLoading(false);
        mirrorUdsEncounterToLegacyDom(encounterRef.current, "");
        if (photoInputRef.current) photoInputRef.current.value = "";
        onPendingPhotoChangeRef.current?.(false);
        setRecordStatus(RECORD.photoReadFailed);
        setRecordStatusIsError(true);
        return;
      }
      photoDataRef.current = dataUrl;
      photoLoadingRef.current = false;
      setPhotoData(dataUrl);
      setPhotoLoading(false);
      mirrorUdsEncounterToLegacyDom(encounterRef.current, dataUrl);
      onPendingPhotoChangeRef.current?.(true);
    };
    reader.onerror = () => {
      if (photoReaderRef.current !== reader) return;
      photoReaderRef.current = null;
      photoDataRef.current = "";
      photoLoadingRef.current = false;
      setPhotoData("");
      setPhotoLoading(false);
      mirrorUdsEncounterToLegacyDom(encounterRef.current, "");
      if (photoInputRef.current) photoInputRef.current.value = "";
      onPendingPhotoChangeRef.current?.(false);
      setRecordStatus(RECORD.photoReadFailed);
      setRecordStatusIsError(true);
    };
    reader.onabort = () => {
      if (photoReaderRef.current !== reader) return;
      photoReaderRef.current = null;
      photoDataRef.current = "";
      photoLoadingRef.current = false;
      setPhotoData("");
      setPhotoLoading(false);
      mirrorUdsEncounterToLegacyDom(encounterRef.current, "");
      onPendingPhotoChangeRef.current?.(false);
    };
    reader.readAsDataURL(file);
  };

  useEffect(
    () => () => {
      const reader = photoReaderRef.current;
      photoReaderRef.current = null;
      if (reader?.readyState === FileReader.LOADING) reader.abort();
    },
    [],
  );

  useEffect(() => {
    const confirmUnsafeUnload = (event: BeforeUnloadEvent) => {
      const saved = savedSnapshotRef.current;
      const clinicalDraftChanged = !lockedRef.current &&
        (saved
          ? JSON.stringify(saved) !== JSON.stringify(encounterRef.current)
          : evaluationReadinessRef.current !== "idle");
      if (
        !clinicalDraftChanged &&
        !addendumPendingRef.current &&
        !photoLoadingRef.current &&
        !photoDataRef.current
      ) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmUnsafeUnload);
    return () => window.removeEventListener("beforeunload", confirmUnsafeUnload);
  }, []);

  const focusPhotoRemoval = () => {
    setTab("specimen");
    window.setTimeout(() => {
      const target = photoRemoveButtonRef.current ?? photoInputRef.current;
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    }, 0);
  };

  useEffect(() => {
    const handleLeaveBlocked = (event: Event) => {
      const detail = (event as CustomEvent<WorkstationUdsLeaveBlockedRequestDetail>)
        .detail;
      if (detail?.reason === "addendum") {
        setRecordStatus(RECORD.finishAddendumBeforeLeaving);
        setRecordStatusIsError(true);
        addendumTextRef.current?.scrollIntoView({ block: "center" });
        addendumTextRef.current?.focus({ preventScroll: true });
        return;
      }
      if (detail?.reason === "photo") {
        setRecordStatus(RECORD.removePhotoBeforeLeaving);
        setRecordStatusIsError(true);
        focusPhotoRemoval();
      }
    };
    window.addEventListener(WORKSTATION_UDS_LEAVE_BLOCKED_REQUEST, handleLeaveBlocked);
    return () =>
      window.removeEventListener(
        WORKSTATION_UDS_LEAVE_BLOCKED_REQUEST,
        handleLeaveBlocked,
      );
  });

  // One-line synopsis stored on the record and reused in the attestation
  // review's "Device / panel summary" field - built from whatever encounter
  // is passed in, not the closed-over one, so it stays correct for a
  // just-locked snapshot rather than a stale render.
  const summaryFor = (source: UdsEncounter): string => {
    const panels = displayedUdsPanels(source);
    const tested = panels.filter((panel) => (source.results[panel] ?? "nt") !== "nt").length;
    const positive = panels.filter((panel) => source.results[panel] === "pos").length;
    const device = source.customDeviceName?.trim() || source.device || "No device selected";
    return positive > 0
      ? `${device} · ${positive} preliminary positive, ${tested}/${panels.length} tested`
      : `${device} · ${tested}/${panels.length} tested`;
  };

  // A preliminary positive panel, an unreadable result, or an unresolved
  // medication-alignment flag keeps readiness at "review" forever - those are
  // genuine findings, not something staff can "fix" away. Gate attest/lock on
  // the absence of hard stops (matching InjectionPanel's canFinalize), not on
  // zero warnings, so a flagged-but-clinically-complete screen can still be
  // attested and locked instead of stuck as an unfinishable draft.
  const canAttest =
    evaluation !== undefined &&
    evaluation.readiness !== "idle" &&
    evaluation.readiness !== "blocked" &&
    staffSignInValue.trim().length > 0 &&
    !hasPendingPhoto;

  const notifyRecordsChange = () => {
    setRecordsRefreshToken((value) => value + 1);
    onRecordsChangeRef.current?.();
  };

  const rememberDurableRecord = (record: UdsRecord | undefined) => {
    durableRecordBaselineRef.current = record
      ? { id: record.id, serialized: JSON.stringify(record) }
      : undefined;
  };

  /**
   * The repository's compatibility decoder is intentionally shallow. Before
   * any mutating call, prove every visible record is safe and honor its read
   * warnings; otherwise that call could rewrite a known-corrupt array.
   *
   * Existing records also use a stale-baseline guard: the exact same-id
   * durable record must still match what this screen opened or last saved.
   * Every caller that writes runs this check while the panel owns its
   * session-held exclusive Web Lock, closing the old gap between preflight
   * and the repository's whole-array read/modify/write.
   * New unsaved records have no baseline yet and remain eligible for their
   * first save.
   */
  const repositoryIsSafeToMutate = (): boolean => {
    if (recordStorageConflictRef.current) {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(RECORD.udsRecordChangedElsewhere);
      setRecordStatusIsError(true);
      return false;
    }
    const access = runOwnedUdsRecordMutation(
      recordMutationAccessRef.current,
      () => true,
    );
    if (!access.ok) {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(access.message);
      setRecordStatusIsError(recordMutationAccessRef.current !== "pending");
      return false;
    }
    const listed = repository.list();
    if (!listed.ok) {
      setRecordStatus(listed.error.message);
      setRecordStatusIsError(true);
      return false;
    }
    if (
      listed.warnings.length > 0 ||
      !isUnambiguousUsableUdsRecordList(listed.value)
    ) {
      setRecordStatus(RECORD.udsStorageNeedsAttention);
      setRecordStatusIsError(true);
      return false;
    }
    const recordId = activeRecordIdRef.current;
    if (!recordId) return true;
    const baseline = durableRecordBaselineRef.current;
    const durable = listed.value.find((record) => record.id === recordId);
    if (
      !baseline ||
      baseline.id !== recordId ||
      !durable ||
      JSON.stringify(durable) !== baseline.serialized
    ) {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(RECORD.udsRecordChangedElsewhere);
      setRecordStatusIsError(true);
      return false;
    }
    return true;
  };

  const runSafeRepositoryMutation = <T,>(mutation: () => T): T | undefined => {
    const guarded = runOwnedUdsRecordMutation(recordMutationAccessRef.current, () => {
      if (!repositoryIsSafeToMutate()) return undefined;
      return mutation();
    });
    if (!guarded.ok) {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(guarded.message);
      setRecordStatusIsError(true);
      return undefined;
    }
    return guarded.value;
  };

  const resetPerRecordUi = (reportOpen = false) => {
    lastDraftSavedStatusRef.current = null;
    setTab("specimen");
    setRequirementsOpen(false);
    setNormalQcReviewOpen(false);
    setBulkAction(null);
    setActiveResultPanel(undefined);
    setInvalidationReceipt(null);
    setReportPreviewOpen(reportOpen);
    setReviewedAttestation(undefined);
  };

  const focusUdsEditorNextFrame = () => {
    window.requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>('.wfp-panel');
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

  useEffect(() => {
    if (recordMutationUnavailable) return;
    // A chart handoff can mount this panel while the page-level Web Lock is
    // still pending. The shell's normal two-frame focus attempt then sees
    // only disabled controls. Retry once ownership enables the editor so a
    // signed note lands on its addendum field and a draft lands on its first
    // editable patient field.
    focusUdsEditorNextFrame();
  }, [recordMutationUnavailable]);

  const saveLocalDraft = (): boolean => {
    const source = encounterRef.current;
    const result = runSafeRepositoryMutation(() =>
      repository.saveDraft({
        id: activeRecordIdRef.current,
        patient: source.patient,
        summary: summaryFor(source),
        snapshot: source,
      }),
    );
    if (!result) return false;
    if (result.ok) {
      activeRecordIdRef.current = result.value.id;
      savedSnapshotRef.current = result.value.snapshot;
      rememberDurableRecord(result.value);
      setActiveRecordId(result.value.id);
      onActiveRecordChangeRef.current?.(result.value);
      publishWorkflowState(source);
      const savedStatus = draftSavedAtCopy(
        new Date(result.value.updatedAt).toLocaleTimeString(),
      );
      lastDraftSavedStatusRef.current = savedStatus;
      setRecordStatus(savedStatus);
      setRecordStatusIsError(false);
      notifyRecordsChange();
      return true;
    } else {
      lastDraftSavedStatusRef.current = null;
      setRecordStatus(result.error.message);
      setRecordStatusIsError(true);
      return false;
    }
  };

  useEffect(() => {
    const handleDraftSave = (event: Event) => {
      const detail = (event as CustomEvent<WorkstationDraftSaveRequestDetail>).detail;
      if (detail?.workflow !== "uds") return;
      detail.handled = true;
      detail.saved = lockedRef.current ||
        (!activeRecordIdRef.current && evaluationReadinessRef.current === "idle") ||
        saveLocalDraft();
    };
    window.addEventListener(WORKSTATION_DRAFT_SAVE_REQUEST, handleDraftSave);
    return () => window.removeEventListener(WORKSTATION_DRAFT_SAVE_REQUEST, handleDraftSave);
  }, []);

  useEffect(() => {
    // Mobile operating systems and browser tab suspension can bypass a normal
    // navigation prompt. File the current editable clinical snapshot at the
    // last synchronous lifecycle boundary, through the same guarded save path
    // as the visible Save command. Refs are deliberate here: an input event
    // and pagehide can occur in the same task, before a component re-render.
    const flushUnsavedClinicalDraft = () => {
      if (lockedRef.current) return;
      const saved = savedSnapshotRef.current;
      const clinicalDraftChanged = saved
        ? JSON.stringify(saved) !== JSON.stringify(encounterRef.current)
        : evaluationReadinessRef.current !== "idle";
      if (!clinicalDraftChanged) return;
      saveLocalDraft();
    };
    const flushWhenHidden = () => {
      if (document.hidden) flushUnsavedClinicalDraft();
    };
    window.addEventListener("pagehide", flushUnsavedClinicalDraft, {
      capture: true,
    });
    document.addEventListener("visibilitychange", flushWhenHidden, {
      capture: true,
    });
    return () => {
      window.removeEventListener("pagehide", flushUnsavedClinicalDraft, true);
      document.removeEventListener("visibilitychange", flushWhenHidden, true);
    };
    // The installed listeners intentionally use only synchronously maintained
    // refs and the stable repository captured by the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The patient chart lists UDS notes but cannot restore one: the encounter a
  // record opens into lives here. It asks; this panel reads the record through
  // its own repository and opens it exactly as its own notes window does.
  useEffect(() => {
    const handleOpenNote = (event: Event) => {
      const detail = (event as CustomEvent<WorkstationOpenNoteRequestDetail>).detail;
      if (detail?.noteType !== "uds" || !detail.recordId) return;
      const result = repository.list();
      if (!result.ok) return;
      const record = result.value.find((candidate) => candidate.id === detail.recordId);
      if (record) openUdsRecord(record);
    };
    window.addEventListener(WORKSTATION_OPEN_NOTE_REQUEST, handleOpenNote);
    return () => window.removeEventListener(WORKSTATION_OPEN_NOTE_REQUEST, handleOpenNote);
  });

  const discardLocalDraft = (): boolean => {
    const recordId = activeRecordIdRef.current;
    if (!recordId) return false;
    const result = runSafeRepositoryMutation(() => repository.discard(recordId));
    if (!result) return false;
    if (!result.ok) {
      setRecordStatus(result.error.message);
      setRecordStatusIsError(true);
      return false;
    }
    const nextEncounter = emptyUdsEncounter();
    encounterRef.current = nextEncounter;
    activeRecordIdRef.current = undefined;
    savedSnapshotRef.current = undefined;
    rememberDurableRecord(undefined);
    lockedRef.current = false;
    addendumPendingRef.current = false;
    setEncounter(nextEncounter);
    clearSelectedPhoto(false);
    mirrorUdsEncounterToLegacyDom(nextEncounter, "");
    setActiveRecordId(undefined);
    setLocked(false);
    setAddenda([]);
    setAttestation(undefined);
    resetPerRecordUi();
    onPendingAddendumChangeRef.current?.(false);
    onActiveRecordChangeRef.current?.(undefined);
    publishWorkflowState(nextEncounter, false);
    setRecordStatus(undefined);
    setRecordStatusIsError(false);
    notifyRecordsChange();
    focusUdsEditorNextFrame();
    return true;
  };

  const attestAndLock = (): boolean => {
    // The selected photo is deliberately report-only and is never persisted.
    // Keep this independent of the disabled Sign button: a confirmation that
    // was already open before photo selection must still fail closed.
    if (hasPendingPhotoNow()) {
      setRecordStatus(RECORD.removePhotoBeforeSigning);
      setRecordStatusIsError(true);
      setRecordAction(null);
      setReviewedAttestation(undefined);
      focusPhotoRemoval();
      return false;
    }
    const staff = staffSignInValue.trim();
    // Persist the exact staff/time shown in the irreversible confirmation,
    // rather than manufacturing a second signature time after acknowledgement.
    const nextAttestation = reviewedAttestation;
    if (!canAttest || !staff || !nextAttestation || nextAttestation.staff !== staff) {
      return false;
    }
    const source = encounterRef.current;
    const result = runSafeRepositoryMutation(() =>
      repository.complete({
        id: activeRecordIdRef.current,
        patient: source.patient,
        summary: summaryFor(source),
        snapshot: source,
        attestation: nextAttestation,
      }),
    );
    if (!result) return false;
    if (!result.ok) {
      setRecordStatus(result.error.message);
      setRecordStatusIsError(true);
      return false;
    }
    activeRecordIdRef.current = result.value.id;
    savedSnapshotRef.current = result.value.snapshot;
    rememberDurableRecord(result.value);
    lockedRef.current = true;
    setActiveRecordId(result.value.id);
    setLocked(true);
    setAddenda(result.value.addenda);
    setAttestation(nextAttestation);
    setAddendumAuthor(nextAttestation.staff);
    onActiveRecordChangeRef.current?.(result.value);
    publishWorkflowState(source, true);
    setRecordStatus(signedAtCopy(new Date().toLocaleTimeString()));
    setRecordStatusIsError(false);
    setReviewedAttestation(undefined);
    notifyRecordsChange();
    return true;
  };

  // Leaving an editable record without saving would silently lose it -
  // mirrors Injection's "leaving an editable record is a save boundary".
  const startNewUdsScreen = (): boolean => {
    if (addendumPendingRef.current) {
      setRecordStatus(RECORD.finishAddendumBeforeLeaving);
      setRecordStatusIsError(true);
      if (!recordsOpen) addendumTextRef.current?.focus({ preventScroll: true });
      return false;
    }
    if (hasPendingPhotoNow()) {
      setRecordStatus(RECORD.removePhotoBeforeLeaving);
      setRecordStatusIsError(true);
      if (!recordsOpen) focusPhotoRemoval();
      return false;
    }
    // Even an idle or locked current view can start a new editable note.
    // Refuse that handoff when a sibling row makes the whole-store write
    // boundary unsafe; otherwise the blank form would accept work it cannot
    // later file.
    if (!repositoryIsSafeToMutate()) return false;
    if (
      !lockedRef.current &&
      (Boolean(activeRecordIdRef.current) ||
        evaluationReadinessRef.current !== "idle") &&
      !saveLocalDraft()
    ) return false;
    const nextEncounter = emptyUdsEncounter();
    encounterRef.current = nextEncounter;
    activeRecordIdRef.current = undefined;
    savedSnapshotRef.current = undefined;
    rememberDurableRecord(undefined);
    lockedRef.current = false;
    addendumPendingRef.current = false;
    setEncounter(nextEncounter);
    mirrorUdsEncounterToLegacyDom(nextEncounter, "");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setActiveRecordId(undefined);
    setLocked(false);
    setAddenda([]);
    setAttestation(undefined);
    setAddendumAuthor(staffSignInValue);
    resetPerRecordUi();
    setAddendumText("");
    onPendingAddendumChangeRef.current?.(false);
    onActiveRecordChangeRef.current?.(undefined);
    publishWorkflowState(nextEncounter, false);
    setRecordStatus(undefined);
    setRecordStatusIsError(false);
    focusUdsEditorNextFrame();
    return true;
  };

  const openUdsRecord = (record: UdsRecord): boolean => {
    if (!isUsableUdsRecord(record)) {
      setRecordStatus(RECORD.invalidUdsRecord);
      setRecordStatusIsError(true);
      return false;
    }
    const isActiveRecord = record.id === activeRecordIdRef.current;
    const durableBaseline = durableRecordBaselineRef.current;
    const durableCopyChanged = Boolean(
      isActiveRecord &&
        (!durableBaseline ||
          durableBaseline.id !== record.id ||
          JSON.stringify(record) !== durableBaseline.serialized),
    );
    // Clicking the unchanged record already on screen is a harmless no-op and
    // must never replace current in-memory edits with the drawer's saved copy.
    if (isActiveRecord && !durableCopyChanged) return true;
    if (addendumPendingRef.current) {
      setRecordStatus(RECORD.finishAddendumBeforeLeaving);
      setRecordStatusIsError(true);
      if (!recordsOpen) addendumTextRef.current?.focus({ preventScroll: true });
      return false;
    }
    if (hasPendingPhotoNow()) {
      setRecordStatus(RECORD.removePhotoBeforeLeaving);
      setRecordStatusIsError(true);
      if (!recordsOpen) focusPhotoRemoval();
      return false;
    }
    const currentHasUnsavedChanges = Boolean(
      savedSnapshotRef.current &&
        JSON.stringify(encounterRef.current) !== JSON.stringify(savedSnapshotRef.current),
    );
    if (isActiveRecord && durableCopyChanged && currentHasUnsavedChanges) {
      setRecordStatus(RECORD.udsRecordChangedElsewhere);
      setRecordStatusIsError(true);
      return false;
    }
    if (
      !isActiveRecord &&
      !lockedRef.current &&
      (Boolean(activeRecordIdRef.current) ||
        evaluationReadinessRef.current !== "idle") &&
      !saveLocalDraft()
    ) return false;
    encounterRef.current = record.snapshot;
    activeRecordIdRef.current = record.id;
    savedSnapshotRef.current = record.snapshot;
    rememberDurableRecord(record);
    lockedRef.current = record.status === "completed";
    addendumPendingRef.current = false;
    setEncounter(record.snapshot);
    photoDataRef.current = "";
    photoLoadingRef.current = false;
    setPhotoData("");
    setPhotoLoading(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
    mirrorUdsEncounterToLegacyDom(record.snapshot, "");
    setActiveRecordId(record.id);
    setLocked(record.status === "completed");
    setAddenda(record.addenda);
    setAttestation(record.attestation);
    setAddendumAuthor(staffSignInValue);
    resetPerRecordUi(
      record.status === "completed" ||
        UdsEngine.evaluate(record.snapshot, {}).output.testedCount > 0,
    );
    setAddendumText("");
    onPendingAddendumChangeRef.current?.(false);
    onActiveRecordChangeRef.current?.(record);
    publishWorkflowState(record.snapshot, record.status === "completed");
    setRecordStatus(undefined);
    setRecordStatusIsError(false);
    focusUdsEditorNextFrame();
    return true;
  };

  const saveAddendum = () => {
    const recordId = activeRecordIdRef.current;
    if (!recordId || !addendumText.trim()) return;
    if (addendumSavingRef.current) return;
    addendumSavingRef.current = true;
    setAddendumSaving(true);
    const result = runSafeRepositoryMutation(() =>
      repository.addAddendum({
        recordId,
        author: addendumAuthor,
        text: addendumText,
      }),
    );
    if (!result) {
      addendumSavingRef.current = false;
      setAddendumSaving(false);
      return;
    }
    if (result.ok) {
      rememberDurableRecord(result.value);
      setAddenda(result.value.addenda);
      addendumPendingRef.current = false;
      setAddendumText("");
      setAddendumAuthor(staffSignInValue);
      onPendingAddendumChangeRef.current?.(false);
      onActiveRecordChangeRef.current?.(result.value);
      setRecordStatus(undefined);
      setRecordStatusIsError(false);
      notifyRecordsChange();
    } else {
      setRecordStatus(result.error.message);
      setRecordStatusIsError(true);
    }
    window.setTimeout(() => {
      addendumSavingRef.current = false;
      setAddendumSaving(false);
    }, 0);
  };

  const noteInput = udsEncounterToDocumentationInput(encounter);
  const noteText = noteInput ? DocumentationEngine.format("uds", noteInput).text : "";

  const profile = profileFor(encounter.device);
  const displayedPanels = displayedUdsPanels(encounter);
  const panelProfileReady =
    profile === "14" ||
    (profile === "13" && Boolean(encounter.omittedPanel)) ||
    (profile === "other" && Boolean(encounter.customDeviceName?.trim()) && displayedPanels.length > 0);
  const testedCount = displayedPanels.filter((panel) => (encounter.results[panel] ?? "nt") !== "nt").length;
  const positiveCount = displayedPanels.filter((panel) => encounter.results[panel] === "pos").length;
  const invalidCount = displayedPanels.filter((panel) => encounter.results[panel] === "invalid").length;
  useEffect(() => {
    if (testedCount > 0 || locked) setReportPreviewOpen(true);
  }, [locked, testedCount]);
  const reviewContextStarted = Boolean(
    encounter.collectionDateTime.trim() || encounter.device.trim() || testedCount > 0,
  );
  const udsExceptions = [
    ...displayedPanels.filter((panel) => encounter.results[panel] === "pos").map((panel) => ({ label: `${panel} preliminary positive`, tab: "results" as const, field: `results.${panel}` })),
    ...displayedPanels.filter((panel) => encounter.results[panel] === "invalid").map((panel) => ({ label: `${panel} invalid / unreadable`, tab: "results" as const, field: `results.${panel}` })),
    ...(encounter.temperature === "not acceptable" || encounter.control === "invalid" || encounter.validity === "needs review" ? [{ label: "Specimen or device QC requires review", tab: "specimen" as const, field: "control" }] : []),
    ...(reviewContextStarted &&
    (encounter.medicationAlignment === "needs review" ||
      encounter.medicationAlignment === "not aligned")
      ? [
          {
            label: "Medication alignment requires review",
            tab: "review" as const,
            field: "medicationAlignment",
          },
        ]
      : []),
  ];
  const reportStatus = evaluation
    ? deriveUdsReportStatus(encounter, evaluation, locked)
    : ({
        state: "not-started",
        label: "NOT STARTED",
        marker: "PENDING",
        tone: "neutral",
        detail: "Enter specimen facts and read the physical device before review.",
      } as const);

  const stops = evaluation?.stops ?? [];
  const incompleteFields = useMemo(
    () => new Set(stops.flatMap((item) => (item.field ? [item.field] : []))),
    [stops],
  );
  const stopsByTab = countStopsByTab(stops, tabForUdsField);
  const warningsByTab = countStopsByTab(
    evaluation?.warnings ?? [],
    tabForUdsField,
  );
  const transactionStatus = projectWorkflowTransactionStatus({ evaluation, locked });
  const recordMutationAccessDetail =
    recordStorageConflict
      ? RECORD.udsRecordChangedElsewhere
      : recordMutationAccess === "owned"
      ? undefined
      : recordMutationAccess === "busy"
        ? UDS_RECORD_MUTATION_BUSY_MESSAGE
        : recordMutationAccess === "pending"
          ? UDS_RECORD_MUTATION_PENDING_MESSAGE
          : UDS_RECORD_MUTATION_PROTECTION_MESSAGE;
  const qcStatus =
    encounter.control === "invalid"
      ? { value: "INVALID", tone: "stop" as const }
      : encounter.validity === "needs review"
        ? { value: "REVIEW", tone: "attention" as const }
        : encounter.control === "valid" && encounter.validity === "acceptable"
          ? { value: "ACCEPTABLE", tone: "normal" as const }
          : { value: "PENDING", tone: "attention" as const };
  const recordLifecycle = projectRecordLifecycle({
    locked,
    error: recordStatusIsError || recordStorageConflict,
    recordId: activeRecordId,
  });
  const hasUnsavedClinicalChanges = Boolean(
    !locked &&
      savedSnapshotRef.current &&
      JSON.stringify(savedSnapshotRef.current) !== JSON.stringify(encounter),
  );
  // Same fix as canAttest: a preliminary positive, an unreadable panel, or a
  // medication-alignment flag pins readiness at "review" forever - those are
  // genuine findings, not something staff can edit away. Printing (like
  // attesting) only needs the absence of hard stops, not zero warnings -
  // otherwise a record staff already attested and locked with a warning
  // present could never be printed at all.
  const udsReadyForFinalOutput =
    evaluation !== undefined &&
    evaluation.readiness !== "idle" &&
    evaluation.readiness !== "blocked";
  const firstStopMessage = stops[0]?.message.replace(/[.!?]+\s*$/, "");
  // Unlike print/attest, the daily-log label is purely informational (never
  // disables the button), so it keeps the stricter "no warnings either"
  // reading - a preliminary positive genuinely does need review, even though
  // it must not block printing or attesting.
  const udsLogLabel =
    evaluation.readiness === "idle"
      ? "Add to daily log"
      : evaluation.readiness === "ready"
        ? "Finalize & add to daily log"
        : "Log as needs review";
  const transactionStarted = evaluation.readiness !== "idle";
  const udsLedgerTabs = UDS_TABS.map((key) => {
    const stopCount = stopsByTab.get(key) ?? 0;
    const warningCount = warningsByTab.get(key) ?? 0;
    const complete = {
      specimen: Boolean(
        encounter.patient.name.trim() &&
          encounter.patient.dob.trim() &&
          encounter.reason &&
          encounter.collectionDateTime &&
          encounter.collector.trim() &&
          panelProfileReady &&
          encounter.physicalReadingsVerified,
      ),
      results: Boolean(
        displayedPanels.length > 0 &&
          testedCount === displayedPanels.length &&
          stopCount === 0,
      ),
      review: Boolean(encounter.medicationAlignment && stopCount === 0),
    }[key];
    return {
      key,
      label: UDS_TAB_LABEL[key],
      stopCount,
      state: projectWorkflowLedgerState({
        locked,
        started: transactionStarted,
        active: tab === key,
        stopCount,
        warningCount,
        complete,
      }),
      detail:
        key === "results"
          ? `${testedCount}/${displayedPanels.length} panels entered`
          : stopCount > 0
            ? `${stopCount} unresolved requirement${stopCount === 1 ? "" : "s"}`
            : warningCount > 0
              ? `${warningCount} review item${warningCount === 1 ? "" : "s"}`
              : complete
                ? "Transaction page complete"
                : "Transaction page pending",
    };
  });

  return (
    <UdsIncompleteFieldsContext.Provider value={incompleteFields}>
    <UdsRequirementsContext.Provider value={evaluation.output.requirements}>
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-transaction-chrome">
        <div class="wfp-summary-bar wfp-uds-context">
          <h1 class="wfp-workflow-title"><strong>Urine drug screen</strong></h1>
          {locked || recordMutationUnavailable ? (
            <span class="wfp-status-flag is-idle">
              {!recordStorageConflict && recordMutationAccess === "pending" && !locked
                ? "Opening…"
                : "Read only"}
            </span>
          ) : (
            <StatusFlag
              idle={(evaluation?.readiness ?? "idle") === "idle"}
              stopCount={stops.length}
              warningCount={evaluation?.warnings.length ?? 0}
              onOpenRequirements={() => setRequirementsOpen(true)}
            />
          )}
          <WorkflowSummaryFact
            label="DEVICE"
            value={encounter.customDeviceName?.trim() || encounter.device || "NOT SELECTED"}
            tone={panelProfileReady ? "normal" : "attention"}
          />
          <WorkflowSummaryFact
            label="PANELS"
            value={panelProfileReady ? `${testedCount}/${displayedPanels.length}` : "PENDING"}
            tone={panelProfileReady ? "normal" : "attention"}
          />
          <WorkflowSummaryFact label="QC" value={qcStatus.value} tone={qcStatus.tone} />
          <span class="wfp-summary-spacer" />
          <span
            class="wfp-transaction-readout"
            aria-label={`Worksheet page ${UDS_TABS.indexOf(tab) + 1} of ${UDS_TABS.length}`}
          >
            <b>{TRANSACTION_PHASE_LABEL[transactionStatus.phase]}</b>
            <span>PG {UDS_TABS.indexOf(tab) + 1}/{UDS_TABS.length}</span>
          </span>
          <button
            type="button"
            class="cd2004-link-button"
            onClick={() => setRecordsOpen(true)}
          >
            {NOTES.openUdsNotes}…
          </button>
          {!locked && (
            <button
              type="button"
              class="cd2004-link-button"
              onClick={() =>
                patch({
                  patient: {
                    name: activePatient.name ?? "",
                    dob: activePatient.dob ?? "",
                  },
                })
              }
              disabled={
                recordMutationUnavailable ||
                (!activePatient.name?.trim() && !activePatient.dob?.trim())
              }
              title={
                activePatient.name?.trim() || activePatient.dob?.trim()
                  ? "Carry the selected local patient into this UDS record."
                  : "Select a local patient first."
              }
            >
              Use current patient
            </button>
          )}
          {!locked && (
            <button
              type="button"
              class="cd2004-link-button"
              onClick={() => {
                if (staffSignInValue) patch({ collector: staffSignInValue });
              }}
              disabled={recordMutationUnavailable || !staffSignInValue}
              title={
                staffSignInValue
                  ? "Carry the signed-in staff member into the collector field."
                  : "Sign in a staff member first."
              }
            >
              Use signed-in staff
            </button>
          )}
          <button
            type="button"
            class="cd2004-command-button"
            title={
              udsReadyForFinalOutput
                ? "Add the finalized UDS documentation to today's local activity log."
                : "Add this incomplete UDS documentation to today's local activity log as needs review."
            }
            onClick={() => clickLegacyControl("addUdsLog")}
            disabled={
              recordMutationUnavailable || evaluation.readiness === "idle"
            }
          >
            {udsLogLabel}
          </button>
        </div>

        <WorkflowLedgerTabs
          tabs={udsLedgerTabs}
          activeTab={tab}
          onChange={setTab}
          ariaLabel="UDS transaction pages and state"
          idPrefix="uds-ledger"
        />
      </div>

      <div
        class="wfp-transaction-page"
        role="region"
        aria-label="UDS clinical page"
        tabIndex={0}
      >
        <p class="wfp-field-hint">
          UDS results are point-of-care preliminary screening only. Provider reviews results in
          clinical context; outside lab order may be placed when clinically indicated.
        </p>
        {invalidationReceipt && (
          <div class="wfp-invalidation-receipt" role="status">
            <strong>INVALIDATION RECEIPT</strong><span>{invalidationReceipt}</span>
            <button type="button" class="cd2004-link-button" aria-label="Dismiss invalidation receipt" onClick={() => setInvalidationReceipt(null)}>×</button>
          </div>
        )}

      <OutstandingRequirements<UdsTab>
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        stops={stops}
        tabForField={tabForUdsField}
        tabLabels={UDS_TAB_LABEL}
        onNavigate={setTab}
      />

      <fieldset
        disabled={locked || recordMutationUnavailable}
        style="border:none;padding:0;margin:0;display:contents"
      >

      {tab === "specimen" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("uds-ledger", "specimen")}
          aria-labelledby={workflowLedgerTabId("uds-ledger", "specimen")}
        >
          <div class="wfp-section" role="group" aria-label="Specimen & collection">
            <h2 class="wfp-section-head">Specimen &amp; collection</h2>
            <div class="wfp-section-body">
              {/* Source and method are fixed for this workflow, but a lab
                  report always states them - a result with no named specimen
                  is not a result. */}
              <dl class="wfp-report-meta">
                <dt>Specimen</dt>
                <dd>Urine, random collection</dd>
                <dt>Method</dt>
                <dd>Point-of-care immunoassay (waived)</dd>
              </dl>
              <div class="wfp-row">
                <Field label="Patient name" field="patient.name" hint="required" source={projectCarriedFieldSource(encounter.patient.name, activePatient.name, "CHART")}>
                  <input
                    value={encounter.patient.name}
                    placeholder="Last, First"
                    onInput={(event) => patchPatient({ name: event.currentTarget.value })}
                  />
                </Field>
                <Field label="DOB" width="date" field="patient.dob" hint="required" source={projectCarriedFieldSource(encounter.patient.dob, activePatient.dob, "CHART")}>
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    inputMode="numeric"
                    onInput={(event) =>
                      patchPatient({ dob: formatDobAsTyped(event.currentTarget.value) })
                    }
                  />
                </Field>
                <Field label="Collected by" field="collector" hint="required" source={projectCarriedFieldSource(encounter.collector, staffSignInValue, "SESSION")}>
                  <input
                    value={encounter.collector}
                    placeholder="Staff initials / name"
                    onInput={(event) => patch({ collector: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Collection date / time" field="collectionDateTime" hint="required">
                  <WorkstationDateField
                    mode="datetime"
                    value={encounter.collectionDateTime}
                    onCommit={(next) => patch({ collectionDateTime: next })}
                  />
                </Field>
                <div class="wfp-field-action">
                  <button type="button" class="cd2004-command-button" onClick={() => patch({ collectionDateTime: currentLocalDateTime() })}>Use current date/time</button>
                  <small>Captured only when selected; it will not refresh automatically.</small>
                </div>
              </div>
              <Field label="Specimen temperature" field="temperature" hint="required">
                <OptionList<UdsTemperatureState>
                  name="uds-temperature"
                  value={encounter.temperature}
                  onChange={(value) => patch({ temperature: value })}
                  options={UDS_TEMP_OPTIONS}
                  inline
                />
              </Field>
              <Field label="Encounter type" field="reason" hint="required">
                <OptionList<UdsEncounter["reason"]>
                  name="uds-reason"
                  value={encounter.reason}
                  onChange={(value) => patch({ reason: value })}
                  options={UDS_REASON_OPTIONS}
                  placeholder="Select encounter type"
                  inline
                />
              </Field>
              {encounter.reason === "other" && (
                <Field label="Reason detail" field="reasonDetail" hint="required for Other">
                  <input value={encounter.reasonDetail ?? ""} onInput={(event) => patch({ reasonDetail: event.currentTarget.value })} placeholder="Document the collection purpose" />
                </Field>
              )}
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Device & quality control">
            <h2 class="wfp-section-head">Device &amp; quality control</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Device" field="device" hint="required">
                  <select
                    value={encounter.device}
                    onChange={(event) => onDeviceChange(event.currentTarget.value)}
                  >
                    <option value="">Select cup/device</option>
                    <option>SAFE life 13-Panel Cup</option>
                    <option>SAFE life 14-Panel Cup</option>
                    <option>Other point-of-care UDS cup</option>
                  </select>
                </Field>
                <Field label="Lot #" field="lot" hint="required">
                  <input
                    class="mono"
                    value={encounter.lot}
                    placeholder="LOT123"
                    onInput={(event) => patch({ lot: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Exp" field="expiration" hint="required">
                  <input
                    class="mono"
                    type="month"
                    value={encounter.expiration}
                    onInput={(event) => patch({ expiration: event.currentTarget.value })}
                  />
                </Field>
              </div>

              {profile === "13" && (
                <Field label="Panel not on this 13-panel cup" field="omittedPanel" hint="required">
                  <select
                    value={encounter.omittedPanel ?? ""}
                    onChange={(event) =>
                      onOmittedPanelChange(event.currentTarget.value as UdsPanelKey | "")
                    }
                  >
                    <option value="">Which panel is not on this cup?</option>
                    {UDS_PANELS.map((panel) => (
                      <option key={panel} value={panel}>
                        {panel} — {udsPanelName(panel)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {profile === "other" && (
                <div class="wfp-custom-device-register">
                  <Field label="Device/package name" field="customDeviceName" hint="required">
                    <input value={encounter.customDeviceName ?? ""} onInput={(event) => patch({ customDeviceName: event.currentTarget.value })} placeholder="Name printed on package" />
                  </Field>
                  <div class="wfp-field" data-field-code="UDS-CUSTOM-PANELS" data-field-label="Physical panel sequence" data-field-state={(encounter.customPanels?.length ?? 0) ? "OK" : "STOP"} data-field-prompt="Build the panel order exactly as it appears on the device" data-field-path="customPanels">
                    <label><span class="wfp-field-caption">Physical panel sequence</span><RegisterMarkers state={(encounter.customPanels?.length ?? 0) ? "OK" : "STOP"} source="ENTRY" /></label>
                    <ol class="wfp-panel-sequence">
                      {(encounter.customPanels ?? []).map((panel, index) => (
                        <li key={`${panel}-${index}`}>
                          <span class="wfp-sequence-number">{index + 1}</span>
                          <select value={panel} aria-label={`Panel ${index + 1}`} onChange={(event) => replaceCustomPanel(index, event.currentTarget.value as UdsPanelKey)}>
                            {UDS_PANELS.map((option) => <option value={option} disabled={option !== panel && (encounter.customPanels ?? []).includes(option)}>{option} — {udsPanelName(option)}</option>)}
                          </select>
                          <button type="button" class="cd2004-link-button" aria-label={`Move ${panel} up`} disabled={index === 0} onClick={() => moveCustomPanel(index, -1)}>↑</button>
                          <button type="button" class="cd2004-link-button" aria-label={`Move ${panel} down`} disabled={index === (encounter.customPanels?.length ?? 0) - 1} onClick={() => moveCustomPanel(index, 1)}>↓</button>
                          <button type="button" class="cd2004-link-button" onClick={() => removeCustomPanel(index)}>Remove</button>
                        </li>
                      ))}
                    </ol>
                    <button type="button" class="cd2004-command-button" disabled={(encounter.customPanels?.length ?? 0) >= UDS_PANELS.length} onClick={addCustomPanel}>+ Add panel</button>
                    <small class="wfp-field-hint">Enter top-to-bottom physical device order. Results follow this exact sequence.</small>
                  </div>
                </div>
              )}
              {/* The engine requires this confirmation for every named device,
                  not just the two catalogued cups. Rendering it only for 13/14
                  made "Other point-of-care UDS cup" unfinishable: the stop
                  fired with no control anywhere in the UI that could clear it. */}
              {profile !== "none" && (
                <div
                  class={`wfp-checkbox-row ${evaluation.output.requirements.physicalReadingsVerified?.state === "required" ? "is-required" : ""}`}
                  data-requirement={evaluation.output.requirements.physicalReadingsVerified?.state ?? "unprojected"}
                >
                  <input
                    type="checkbox"
                    id="uds-readings-verified"
                    aria-required={evaluation.output.requirements.physicalReadingsVerified?.state === "required" || undefined}
                    checked={encounter.physicalReadingsVerified}
                    onChange={(event) =>
                      patch({ physicalReadingsVerified: event.currentTarget.checked })
                    }
                  />
                  <label for="uds-readings-verified">
                    Physical cup and displayed panel readings verified for this encounter
                    {evaluation.output.requirements.physicalReadingsVerified?.state === "required" && (
                      <abbr class="wfp-req" title="Required">*</abbr>
                    )}
                    <RegisterMarkers
                      source="ENTRY"
                      state={encounter.physicalReadingsVerified ? "OK" : "REQ"}
                    />
                  </label>
                </div>
              )}

              <Field label="Control line" field="control" hint="required">
                <OptionList<UdsControlState>
                  name="uds-control"
                  value={encounter.control}
                  onChange={(value) => patch({ control: value })}
                  options={UDS_CONTROL_OPTIONS}
                  inline
                />
              </Field>
              <Field label="Validity markers" field="validity" hint="required">
                <select
                  value={encounter.validity}
                  onChange={(event) =>
                    patch({ validity: event.currentTarget.value as UdsEncounter["validity"] })
                  }
                >
                  <option value="not documented">Not documented</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="needs review">Needs review</option>
                </select>
              </Field>

              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  disabled={profile === "none"}
                  onClick={() => setNormalQcReviewOpen(true)}
                >
                  Review normal QC…
                </button>
                <span class="wfp-field-hint">
                  Confirms acceptable temperature, control, validity, and physical reading review.
                </span>
              </div>

              <Field label="Device photo" field="devicePhoto" hint="optional for report">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  aria-busy={photoLoading || undefined}
                  onChange={onPhotoChange}
                />
                {hasPendingPhoto && (
                  <div class="wfp-actions">
                    <button
                      ref={photoRemoveButtonRef}
                      type="button"
                      class="cd2004-command-button"
                      data-uds-remove-photo
                      aria-describedby="uds-photo-report-only-detail"
                      onClick={() => clearSelectedPhoto()}
                    >
                      {RECORD.removeSelectedPhoto}
                    </button>
                    <span
                      id="uds-photo-report-only-detail"
                      class="wfp-field-hint"
                      role="status"
                    >
                      {RECORD.photoReportOnlyDetail} {RECORD.removePhotoBeforeSigning}
                    </span>
                  </div>
                )}
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "results" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("uds-ledger", "results")}
          aria-labelledby={workflowLedgerTabId("uds-ledger", "results")}
        >
          <div
            class="wfp-section"
            role="group"
            aria-label="Result detail"
            data-requirement={evaluation.output.requirements.results?.state ?? "unprojected"}
          >
            <h2 class="wfp-section-head">
              Result detail
              {evaluation.output.requirements.results?.state === "required" && (
                <abbr class="wfp-req" title="Required">*</abbr>
              )}
            </h2>
            <div class="wfp-section-body">
              {/* Every point-of-care immunoassay result is presumptive until a
                  confirmatory method says otherwise. Old lab reports carried
                  that as a banner on the report itself, not as fine print
                  three screens away. */}
              <p class="wfp-report-status">
                <strong>PRELIMINARY</strong>
                <span>
                  Presumptive screen. Confirmation by a definitive method (GC/MS or LC-MS/MS)
                  is required before a result is treated as diagnostic.
                </span>
              </p>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  disabled={!panelProfileReady}
                  title={
                    panelProfileReady
                      ? "Review before applying NEG to every displayed panel."
                      : "Identify and verify the physical device panel profile first."
                  }
                  onClick={() =>
                    setBulkAction({
                      state: "neg",
                      panels: displayedPanels,
                      title: "Mark displayed panels negative",
                    })
                  }
                >
                  Mark displayed panels negative…
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() =>
                    setBulkAction({
                      state: "nt",
                      panels: displayedPanels,
                      title: "Reset displayed panels to not tested",
                    })
                  }
                >
                  Reset displayed panels to NT…
                </button>
              </div>

              <div class="wfp-result-legend" aria-label="Result entry cycle">
                <strong>ACTIVATE CELL TO CYCLE:</strong>
                <span>NT Not tested</span>
                <span>NEG Negative</span>
                <span>POS* Preliminary positive</span>
                <span>INV! Invalid / unreadable</span>
              </div>

              <div class="wfp-section wfp-device-ledger" role="group" aria-label="Physical device panel order">
                <h3 class="wfp-section-head">Physical device order</h3>
                <div class="wfp-grid wfp-grid-lab">
                  <div class="wfp-grid-head"><span>Position / analyte</span><span>Result</span><span>Flag</span><span>Status</span></div>
                  {displayedPanels.map((panel, index) => {
                    const state = encounter.results[panel] ?? "nt";
                    const derived = UDS_RESULT_FLAG[state];
                    return (
                      <div class="wfp-grid-row" key={panel} data-field-path={`results.${panel}`}>
                        <span class="wfp-grid-cell"><span class="wfp-sequence-number">{index + 1}</span> <strong>{panel}</strong> {udsPanelName(panel)}</span>
                        <span class="wfp-grid-cell wfp-grid-cell-actions">
                          <button
                            type="button"
                            class={`wfp-result-cycle is-${state}`}
                            data-result-panel={panel}
                            tabIndex={(activeResultPanel ?? displayedPanels[0]) === panel ? 0 : -1}
                            aria-label={`${panel} ${udsPanelName(panel)}. Current result: ${UDS_RESULT_LABEL[state]}. N negative, P positive, I invalid, T not tested.`}
                            title="N negative · P positive · I invalid · T not tested · arrows move"
                            onFocus={() => setActiveResultPanel(panel)}
                            onKeyDown={(event) => {
                              const keyState: Record<string, UdsResultState> = { n: "neg", p: "pos", i: "invalid", t: "nt" };
                              const direct = keyState[event.key.toLowerCase()];
                              if (direct) { event.preventDefault(); setPanelResult(panel, direct); return; }
                              const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                              if (!direction) return;
                              event.preventDefault();
                              const target = displayedPanels[index + direction];
                              if (target) {
                                setActiveResultPanel(target);
                                setTimeout(() => (document.querySelector(`[data-result-panel="${target}"]`) as HTMLElement | null)?.focus(), 0);
                              }
                            }}
                            onClick={() => setPanelResult(panel, nextUdsResultState(state))}
                          ><b>{state === "nt" ? "NT" : state === "neg" ? "NEG" : state === "pos" ? "POS*" : "INV!"}</b></button>
                        </span>
                        <span class={`wfp-grid-cell wfp-result-flag ${derived.abnormal ? "is-abnormal" : ""}`}>{derived.flag}</span>
                        <span class="wfp-grid-cell wfp-result-status">{derived.status}</span>
                      </div>
                    );
                  })}
                  {displayedPanels.length === 0 && <div class="wfp-grid-empty">Select a device and define its physical panels before entering results.</div>}
                </div>
              </div>

              <div class="wfp-summary-bar wfp-results-sticky-status">
                <span>Tested: {testedCount}</span>
                <span>Preliminary positive: {positiveCount}</span>
                <span>Invalid: {invalidCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "review" && (
        <div
          class="wfp-tabpanel"
          role="tabpanel"
          id={workflowLedgerPanelId("uds-ledger", "review")}
          aria-labelledby={workflowLedgerTabId("uds-ledger", "review")}
        >
          {/* Same register as the injection schedule readout. The status is a
              saturated chip and a spine rather than a phrase set at 24px on a
              tinted panel, and the counts become labeled rows. */}
          <ScheduleRegister
            title="POINT-OF-CARE REPORT"
            marker={reportStatus.marker}
            verdict={reportStatus.label}
            tone={UDS_REPORT_TONE[reportStatus.tone] ?? "neutral"}
            rows={[
              { label: "Tested", value: String(testedCount) },
              {
                label: "Preliminary positive",
                value: String(positiveCount),
                flag: positiveCount > 0 ? "POSITIVE" : undefined,
                flagTone: positiveCount > 0 ? "warning" : "neutral",
              },
              {
                label: "Invalid",
                value: String(invalidCount),
                flag: invalidCount > 0 ? "DO NOT INTERPRET" : undefined,
                flagTone: invalidCount > 0 ? "stop" : "neutral",
              },
            ]}
            bandDetail={reportStatus.detail}
          />
          <div class="wfp-exception-register" aria-label="Exception register">
            <div class="wfp-exception-head"><strong>EXCEPTION REGISTER</strong><span>{udsExceptions.length ? `${udsExceptions.length} ACTIVE` : "CLEAR"}</span></div>
            {udsExceptions.length ? udsExceptions.map((item) => (
              <button type="button" class="wfp-exception-line" onClick={() => { setTab(item.tab); setTimeout(() => (document.querySelector(`[data-field-path="${item.field}"] input, [data-field-path="${item.field}"] select, [data-field-path="${item.field}"] button`) as HTMLElement | null)?.focus(), 0); }}>
                <span>REV</span><strong>{item.label}</strong><span>GO TO {UDS_TAB_LABEL[item.tab].toUpperCase()} →</span>
              </button>
            )) : <div class="wfp-exception-clear">No result, QC, or reconciliation exceptions documented.</div>}
          </div>
          <div class="wfp-section" role="group" aria-label="Clinical review">
            <h2 class="wfp-section-head">Clinical review</h2>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Medication alignment" field="medicationAlignment" hint="required">
                  <select
                    value={encounter.medicationAlignment}
                    onChange={(event) =>
                      patch({
                        medicationAlignment: event.currentTarget
                          .value as UdsEncounter["medicationAlignment"],
                      })
                    }
                  >
                    <option value="">Select review status</option>
                    <option value="no unexpected">No unexpected findings noted by staff</option>
                    <option value="not aligned">Not readily explained by available med list</option>
                    <option value="needs review">Provider review requested</option>
                    <option value="patient explanation">
                      Patient reports prescribed/known explanation
                    </option>
                    <option value="unavailable">Medication list unavailable / not reviewed</option>
                  </select>
                </Field>
                <Field
                  label="Outside lab"
                  field="labPlan"
                  source={
                    !encounter.labPlan || encounter.labPlan === "provider to decide"
                      ? "REF"
                      : "ENTRY"
                  }
                >
                  <select
                    value={encounter.labPlan ?? "provider to decide"}
                    onChange={(event) => patch({ labPlan: event.currentTarget.value })}
                  >
                    <option value="provider to decide">Provider to decide</option>
                    <option value="not needed">Not needed</option>
                    <option value="ordered">Outside lab order placed</option>
                    <option value="recommended">Recommended if clinically indicated</option>
                  </select>
                </Field>
              </div>
              <Field label="Patient comment / context" field="comment">
                <textarea
                  value={encounter.comment ?? ""}
                  placeholder="Optional: patient explanation, prescribed meds, provider instruction, or follow-up context"
                  onInput={(event) => patch({ comment: event.currentTarget.value })}
                />
              </Field>
            </div>
          </div>

        </div>
      )}

      </fieldset>

      {/* Deliberately outside the fieldset above: printing/copying the
          finalized output is the point of a locked record, so these actions
          must stay reachable after lock instead of being disabled by the
          same native <fieldset disabled> that makes editable fields
          read-only. */}
      {tab === "review" && (
        <div class="wfp-section" role="group" aria-label="Clinician result report">
          <h2 class="wfp-section-head">Clinician result report</h2>
          <div class="wfp-section-body">
            <div class="wfp-checkbox-row wfp-output-option">
              <input
                type="checkbox"
                id="uds-sig-toggle"
                checked={includeSignatureFields}
                disabled={recordStorageConflict}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setIncludeSignatureFields(checked);
                  mirrorUdsSignatureToggle(checked);
                }}
              />
              <label for="uds-sig-toggle">Include review / signature fields on this printed clinician report</label>
            </div>
            {recordStorageConflict ? (
              <p class="wfp-field-hint wfp-print-block-hint" role="alert">
                {RECORD.udsRecordChangedElsewhere}
              </p>
            ) : (
              <details
                class="wfp-report-preview"
                open={reportPreviewOpen}
                onToggle={(event) => setReportPreviewOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>REPORT PREVIEW</span>
                  <strong>
                    {testedCount > 0
                      ? `${testedCount}/${displayedPanels.length} PANELS ENTERED`
                      : "WAITING FOR RESULTS"}
                  </strong>
                </summary>
                <ClinicianLabSheet
                  encounter={encounter}
                  omittedPanel={omittedPanel || undefined}
                  includeSignatureFields={includeSignatureFields}
                />
              </details>
            )}
            <div class="wfp-actions">
              <button
                type="button"
                class="cd2004-command-button"
                onClick={() => {
                  if (!recordStorageConflictRef.current) {
                    requestClinicalPrint("uds-clinician-report");
                  }
                }}
                disabled={recordStorageConflict || !udsReadyForFinalOutput || photoLoading}
                title={
                  recordStorageConflict
                    ? RECORD.udsRecordChangedElsewhere
                    : photoLoading
                    ? RECORD.waitForPhotoBeforePrinting
                    : udsReadyForFinalOutput
                    ? "Print the finalized clinician result report."
                    : "Available once every outstanding requirement below is resolved."
                }
              >
                <DesktopIcon name="print" />
                Print clinician report
              </button>
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => {
                  if (!recordStorageConflictRef.current) {
                    requestClinicalPrint("uds-patient-summary");
                  }
                }}
                disabled={recordStorageConflict || !udsReadyForFinalOutput || photoLoading}
                title={
                  recordStorageConflict
                    ? RECORD.udsRecordChangedElsewhere
                    : photoLoading
                    ? RECORD.waitForPhotoBeforePrinting
                    : udsReadyForFinalOutput
                    ? "Print the finalized patient summary."
                    : "Available once every outstanding requirement below is resolved."
                }
              >
                <DesktopIcon name="print" />
                Print patient summary
              </button>
              <span class="wfp-actions-divider" aria-hidden="true" />
              <button
                type="button"
                class="cd2004-link-button"
                onClick={() => {
                  if (!recordStorageConflictRef.current) {
                    navigator.clipboard?.writeText(noteText);
                  }
                }}
                disabled={recordStorageConflict || !noteText}
                // One note, in its final wording, at every stage of the
                // screen. Printing a finalized result still waits on the
                // requirements below; copying the documentation never did.
                //
                // The record-changed-elsewhere guard stays: copying out of a
                // record another tab has already rewritten hands staff a note
                // that no longer matches what is stored, which is the case
                // `uds-record-integrity.spec.js` exists to hold.
                title={
                  recordStorageConflict
                    ? RECORD.udsRecordChangedElsewhere
                    : "Copy this UDS note exactly as it reads here."
                }
              >
                <DesktopIcon name="copy" />
                Copy note
              </button>
            </div>
            {!udsReadyForFinalOutput && (
              <p class="wfp-field-hint wfp-print-block-hint" role="status">
                Printing is disabled until this screen is complete
                {firstStopMessage && (
                  <>
                    {" — "}
                    {stops.length === 1
                      ? firstStopMessage
                      : CHECKLIST.remainingFromFirst(stops.length, firstStopMessage)}
                  </>
                )}
                .{" "}
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => setRequirementsOpen(true)}
                >
                  {CHECKLIST.view}
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {locked && (
        <div class="wfp-section" role="group" aria-label="Addendum">
          <h2 class="wfp-section-head">Addendum</h2>
          <div class="wfp-section-body">
            <p class="wfp-field-hint">
              Signed note. {RECORD.readOnlyDetail}
              {attestation && (
                <>
                  {" "}
                  {signedByCopy(
                    attestation.staff,
                    new Date(attestation.timestamp).toLocaleString(),
                  )}
                </>
              )}
            </p>
            {addenda.map((entry) => {
              const displayedTimestamp = formatSavedAddendumTimestamp(entry.createdAt);
              const timestampIsValid = displayedTimestamp !== NOTES_TABLE.dateUnavailable;
              return (
                <div
                  class="wfp-preview"
                  data-uds-saved-addendum={entry.id}
                  key={entry.id}
                >
                  <strong>{entry.author || "Staff"}</strong>
                  {" · "}
                  <time dateTime={timestampIsValid ? entry.createdAt : undefined}>
                    {displayedTimestamp}
                  </time>
                  <br />
                  {entry.text}
                </div>
              );
            })}
            <Field label="Addendum entered by" state="required">
              <input
                value={addendumAuthor}
                placeholder="Current staff name or initials"
                disabled={recordMutationUnavailable}
                onInput={(event) => setAddendumAuthor(event.currentTarget.value)}
              />
            </Field>
            <Field label="Dated addendum" state="required">
              <textarea
                ref={addendumTextRef}
                data-addendum-input
                value={addendumText}
                placeholder="Clarification, correction, or follow-up. The original completed record remains unchanged."
                disabled={recordMutationUnavailable}
                onInput={(event) => {
                  const next = event.currentTarget.value;
                  addendumPendingRef.current = Boolean(next.trim());
                  setAddendumText(next);
                  onPendingAddendumChangeRef.current?.(Boolean(next.trim()));
                }}
              />
            </Field>
            <div class="wfp-actions">
              <button
                type="button"
                class="cd2004-command-button"
                onClick={saveAddendum}
                disabled={
                  addendumSaving ||
                  recordMutationUnavailable ||
                  !addendumText.trim() ||
                  !addendumAuthor.trim()
                }
              >
                Save addendum
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      <RecordLifecycleActions
        recordLabel="UDS note"
        ariaLabel={RECORD.udsActions}
        lifecycle={recordLifecycle.state}
        detail={
          recordMutationAccessDetail ??
          recordStatus ??
          (hasPendingPhoto && !locked
            ? RECORD.removePhotoBeforeSigning
            : hasUnsavedClinicalChanges
              ? RECORD.unsavedChanges
              : locked
                ? RECORD.readOnlyDetail
                : activeRecordId
                  ? RECORD.draftSavedDetail
                  : RECORD.newDraftDetail)
        }
        buttons={
          <>
            {locked && (
              <button
                type="button"
                class="is-addendum"
                disabled={recordMutationUnavailable}
                onClick={() => {
                  addendumTextRef.current?.scrollIntoView({ block: "center" });
                  addendumTextRef.current?.focus({ preventScroll: true });
                }}
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
                  onClick={saveLocalDraft}
                  disabled={
                    recordMutationUnavailable ||
                    (!activeRecordId && evaluation.readiness === "idle")
                  }
                  title={RECORD.saveUdsDraftDescription}
                >
                  <span class="cd2004-action-glyph" aria-hidden="true">
                    <DesktopIcon name="save" />
                  </span>
                  {RECORD.save}
                </button>
                <button
                  type="button"
                  class="is-primary"
                  disabled={recordMutationUnavailable || !canAttest}
                  title={
                    hasPendingPhoto
                      ? RECORD.removePhotoBeforeSigning
                      : canAttest
                      ? "Review the note before signing it."
                      : RECORD.udsFieldsBeforeSigning
                  }
                  onClick={() => {
                    setReviewedAttestation({
                      staff: staffSignInValue.trim(),
                      timestamp: new Date().toISOString(),
                      statementVersion: "local-attestation-v1",
                    });
                    setRecordAction("attest");
                  }}
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
              title={RECORD.startUdsDescription}
              onClick={startNewUdsScreen}
              disabled={recordMutationUnavailable}
            >
              <span class="cd2004-action-glyph" aria-hidden="true">
                <DesktopIcon name="new" />
              </span>
              {RECORD.startNewUds}
            </button>
            {!locked && (
              <button
                type="button"
                class="is-danger"
                disabled={recordMutationUnavailable || !activeRecordId}
                title={
                  activeRecordId
                    ? RECORD.discardDraftDescription
                    : RECORD.noDraftToDiscard
                }
                onClick={() => setRecordAction("discard")}
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

      <UdsRecordsWindow
        open={recordsOpen}
        onClose={() => setRecordsOpen(false)}
        onRecordOpen={openUdsRecord}
        onCreate={startNewUdsScreen}
        onHandoffComplete={focusUdsEditorNextFrame}
        refreshToken={recordsRefreshToken}
      />

      {normalQcReviewOpen && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog"
          labelledBy="uds-normal-qc-title"
          onDismiss={() => setNormalQcReviewOpen(false)}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="uds-normal-qc-title">Review normal QC</span>
              <button type="button" aria-label="Close" onClick={() => setNormalQcReviewOpen(false)}>
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>
                <strong>{encounter.device || "No device selected"}</strong>
                <br />
                Lot {encounter.lot || "NOT ENTERED"} · Exp {encounter.expiration || "NOT ENTERED"}
              </p>
              <p>Confirm all four observations from this encounter:</p>
              <ul>
                <li>Specimen temperature is acceptable.</li>
                <li>The device control line is valid.</li>
                <li>Validity markers are acceptable.</li>
                <li>The physical cup and displayed panel readings were reviewed.</li>
              </ul>
              <p class="wfp-field-hint">
                This action does not set medication alignment and does not enter any analyte result.
              </p>
            </div>
            <div class="cd2004-dialog-actions">
              <button type="button" onClick={() => setNormalQcReviewOpen(false)}>
                Cancel
              </button>
              <span />
              <button type="button" class="is-primary" onClick={confirmNormalQcReview}>
                Confirm normal QC
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {bulkAction && (
        <ModalDialog
          class="cd2004-dialog-layer cd2004-dialog"
          labelledBy="uds-bulk-action-title"
          onDismiss={() => setBulkAction(null)}
        >
          <div class="cd2004-dialog-frame">
            <div class="cd2004-dialog-titlebar">
              <span id="uds-bulk-action-title">{bulkAction.title}</span>
              <button type="button" aria-label="Close" onClick={() => setBulkAction(null)}>
                X
              </button>
            </div>
            <div class="cd2004-dialog-body">
              <p>
                <strong>{encounter.device || "No device selected"}</strong>
                <br />
                {bulkAction.panels.filter((panel) => panel !== omittedPanel).length} displayed panel(s)
                {omittedPanel ? ` · ${omittedPanel} remains NT because it is not on this cup` : ""}
              </p>
              <p>
                {bulkAction.state === "neg"
                  ? "Confirm that every displayed panel was physically read as negative. Existing positive or invalid entries will be replaced."
                  : "All entered results will return to not tested. This does not change specimen or QC documentation."}
              </p>
            </div>
            <div class="cd2004-dialog-actions">
              <button type="button" onClick={() => setBulkAction(null)}>
                Cancel
              </button>
              <span />
              <button type="button" class="is-primary" onClick={confirmBulkAction}>
                {bulkAction.state === "neg"
                  ? "Mark displayed panels NEG"
                  : "Reset displayed panels to NT"}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {recordAction && (
        <RecordActionDialog
          kind={recordAction}
          recordNoun="UDS"
          recordLabel={encounter.patient.name.trim() || "this UDS screen"}
          attestation={
            recordAction === "attest"
              ? {
                  patient: encounter.patient.name.trim() || "Not entered",
                  localRecord: activeRecordId ?? "Not assigned",
                  medication: summaryFor(encounter),
                  disposition: `Validity: ${encounter.validity}; medication alignment: ${encounter.medicationAlignment}`,
                  staff: staffSignInValue || "Not signed in",
                  timestamp: reviewedAttestation?.timestamp ?? "Not available",
                  statementVersion:
                    reviewedAttestation?.statementVersion ?? "local-attestation-v1",
                }
              : undefined
          }
          attestationLabels={{
            medication: "Device / panel summary",
            disposition: "Validity / interpretation summary",
          }}
          onConfirm={recordAction === "attest" ? attestAndLock : discardLocalDraft}
          onClose={() => {
            setRecordAction(null);
            setReviewedAttestation(undefined);
          }}
        />
      )}

    </div>
    </UdsRequirementsContext.Provider>
    </UdsIncompleteFieldsContext.Provider>
  );
}
