import type { ComponentChildren, Ref } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  applyUdsDeviceProfileDefaults,
  emptyUdsEncounter,
  profileFor,
  UDS_CONTROL_OPTIONS,
  UDS_GROUPS,
  UDS_PANELS,
  UDS_REASON_OPTIONS,
  UDS_RESULT_LABEL,
  UDS_TEMP_OPTIONS,
  udsPanelName,
  type UdsControlState,
  type UdsEncounter,
  type UdsEvaluationOutput,
  type UdsPanel as UdsPanelKey,
  type UdsResultState,
  type UdsTemperatureState,
} from "../../../domain/uds";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { DocumentationEngine } from "../../../documentation";
import { udsEncounterToDocumentationInput } from "../../../documentation/adapters/uds-from-encounter";
import { clickLegacyControl } from "../legacy-mirror";
import { countStopsByTab, OutstandingRequirements } from "../OutstandingRequirements";
import { mirrorUdsEncounterToLegacyDom, mirrorUdsSignatureToggle } from "./uds-legacy-mirror";
import type { PatientContext } from "../../types";
import { DesktopIcon } from "../../DesktopIcon";
import { RecordActionDialog, type RecordActionKind } from "../../RecordActionDialog";
import { UdsRecordsWindow } from "../../UdsRecordsWindow";
import { UdsRecordRepository, type UdsAddendum, type UdsRecord } from "../../../persistence/uds-records";
import { browserSafeStorage } from "../../../persistence/storage";

type UdsTab = "specimen" | "results" | "interpretation";

const UDS_TABS: readonly UdsTab[] = ["specimen", "results", "interpretation"];

// A point-of-care immunoassay report has three parts in every lab system that
// ever rendered one: what was collected, what the analyzer said, and what a
// human made of it. The tabs are those parts.
const UDS_TAB_LABEL: Record<UdsTab, string> = {
  specimen: "Specimen",
  results: "Results",
  interpretation: "Interpretation",
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
    case "device":
    case "omittedPanel":
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
    case "medicationAlignment":
    case "labPlan":
    case "comment":
      return "interpretation";
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
    nt: { flag: "", status: "Not performed", abnormal: false },
    neg: { flag: "", status: "Preliminary", abnormal: false },
    pos: { flag: "A", status: "Preliminary", abnormal: true },
    invalid: { flag: "INV", status: "Invalid", abnormal: true },
  };

interface UdsPanelProps {
  initialEncounter: UdsEncounter;
  activePatient: PatientContext;
  evaluation?: ClinicalEvaluation<UdsEvaluationOutput>;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
}

const patientIsEmpty = (patient: UdsEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

function StatusFlag({
  idle,
  stopCount,
  warningCount,
  onOpenRequirements,
}: {
  idle: boolean;
  stopCount: number;
  warningCount: number;
  onOpenRequirements?: () => void;
}) {
  const variant = idle
    ? "is-idle"
    : stopCount > 0
      ? "is-stop"
      : warningCount > 0
        ? "is-warning"
        : "is-ready";
  const label = idle
    ? "Not started"
    : stopCount > 0
      ? `${stopCount} stop${stopCount === 1 ? "" : "s"}`
      : warningCount > 0
        ? `${warningCount} to review`
        : "Ready";
  if (stopCount > 0 && onOpenRequirements) {
    return (
      <button
        type="button"
        class={`wfp-status-flag ${variant}`}
        onClick={onOpenRequirements}
      >
        {label}
      </button>
    );
  }
  return <span class={`wfp-status-flag ${variant}`}>{label}</span>;
}

interface OptionListProps<T extends string> {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ key: T; label: string; description?: string }>;
  inline?: boolean;
}

function OptionList<T extends string>({
  name,
  value,
  onChange,
  options,
  inline,
}: OptionListProps<T>) {
  // Native <select> rather than a custom radio-row list: the OS draws the
  // popup, keyboard type-ahead comes for free, and a closed control costs one
  // line instead of one per option. The selected option's description stays
  // visible beneath it - clinical guidance should not hide inside a tooltip.
  const selected = options.find((option) => option.key === value);
  return (
    <div class={`wfp-select-group ${inline ? "wfp-select-group-inline" : ""}`}>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.description && (
        <small class="wfp-select-desc">{selected.description}</small>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  width,
  children,
}: {
  label: string;
  hint?: string;
  /** Sizes the control to its content. Free-text fields that hold a fixed
   * shape - a date typed as MM/DD/YYYY, a short code - should not stretch to
   * a full grid column just because the grid offers one. */
  width?: "date" | "short";
  children: ComponentChildren;
}) {
  // Requirement is marked on the field itself - a red asterisk on the caption
  // and a filled control - rather than as a word of helper text underneath.
  // Only the bare "required"/"optional" markers are replaced; a hint carrying
  // real content ("required for Other") keeps its explanatory line.
  const required = hint?.startsWith("required") ?? false;
  const optional = hint?.startsWith("optional") ?? false;
  // A hint that only says "required"/"optional" is fully replaced by the
  // marker. One that qualifies it keeps the qualifier, minus the leading word
  // the marker already carries, so it does not read "optional ... optional".
  const detail =
    hint && hint !== "required" && hint !== "optional"
      ? hint.replace(/^(required|optional)[;:,]?\s*/i, "")
      : "";
  return (
    <div
      class={`wfp-field ${required ? "is-required" : ""} ${width ? `is-w-${width}` : ""}`}
    >
      <label>
        <span class="wfp-field-caption">{label}</span>
        {required && (
          <abbr class="wfp-req" title="Required">
            *
          </abbr>
        )}
        {optional && <span class="wfp-opt">optional</span>}
      </label>
      {children}
      {detail && <span class="wfp-field-hint">{detail}</span>}
    </div>
  );
}

const RESULT_CYCLE: UdsResultState[] = ["nt", "neg", "pos", "invalid"];

function ClinicianLabSheet({
  encounter,
  omittedPanel,
  includeSignatureFields,
}: {
  encounter: UdsEncounter;
  omittedPanel?: UdsPanelKey;
  includeSignatureFields: boolean;
}) {
  const collected = encounter.collectionDateTime
    ? new Date(encounter.collectionDateTime).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "NOT ENTERED";
  const reported = encounter.collectionDateTime ? collected : "PENDING";

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
          <dd>{encounter.device || "Device not entered"} · waived immunoassay</dd>
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
          {UDS_PANELS.map((panel) => {
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
          <span>{encounter.medicationAlignment}</span>
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
  activePatient,
  evaluation,
  staffSignInValue,
  previewRef,
}: UdsPanelProps) {
  const [encounter, setEncounter] = useState<UdsEncounter>(initialEncounter);
  const [photoData, setPhotoData] = useState<string>("");
  const [tab, setTab] = useState<UdsTab>("specimen");
  const [requirementsOpen, setRequirementsOpen] = useState(false);
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
  const repository = useMemo(() => new UdsRecordRepository(browserSafeStorage()), []);
  const [activeRecordId, setActiveRecordId] = useState<string | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [addenda, setAddenda] = useState<UdsAddendum[]>([]);
  const [attestation, setAttestation] = useState<
    { staff: string; timestamp: string; statementVersion: string } | undefined
  >(undefined);
  const [addendumAuthor, setAddendumAuthor] = useState(staffSignInValue);
  const [addendumText, setAddendumText] = useState("");
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordAction, setRecordAction] = useState<RecordActionKind | null>(null);
  const [recordStatus, setRecordStatus] = useState<string | undefined>(undefined);
  const [recordsRefreshToken, setRecordsRefreshToken] = useState(0);
  const addendumTextRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorUdsEncounterToLegacyDom(encounter, photoData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const patch = (partial: Partial<UdsEncounter>, nextPhotoData = photoData) => {
    setEncounter((previous) => {
      const next = { ...previous, ...partial };
      mirrorUdsEncounterToLegacyDom(next, nextPhotoData);
      return next;
    });
  };

  const patchPatient = (partial: Partial<UdsEncounter["patient"]>) => {
    patch({ patient: { ...encounter.patient, ...partial } });
  };

  const setPanelResult = (panel: UdsPanelKey, state: UdsResultState) => {
    patch({ results: { ...encounter.results, [panel]: state } });
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

  const onDeviceChange = (device: string) => {
    const defaults = applyUdsDeviceProfileDefaults({ ...encounter, device, omittedPanel: "" });
    patch(defaults);
  };

  const onOmittedPanelChange = (omittedPanel: UdsPanelKey | "") => {
    const defaults = applyUdsDeviceProfileDefaults({ ...encounter, omittedPanel });
    patch(defaults);
  };

  const onPhotoChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setPhotoData(dataUrl);
      mirrorUdsEncounterToLegacyDom(encounter, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // One-line synopsis stored on the record and reused in the attestation
  // review's "Device / panel summary" field - built from whatever encounter
  // is passed in, not the closed-over one, so it stays correct for a
  // just-locked snapshot rather than a stale render.
  const summaryFor = (source: UdsEncounter): string => {
    const tested =
      UDS_PANELS.length -
      UDS_PANELS.filter((panel) => (source.results[panel] ?? "nt") === "nt").length;
    const positive = UDS_PANELS.filter((panel) => source.results[panel] === "pos").length;
    const device = source.device || "No device selected";
    return positive > 0
      ? `${device} · ${positive} preliminary positive, ${tested}/${UDS_PANELS.length} tested`
      : `${device} · ${tested}/${UDS_PANELS.length} tested`;
  };

  const canAttest = evaluation?.readiness === "ready" && staffSignInValue.trim().length > 0;

  const saveLocalDraft = () => {
    const result = repository.saveDraft({
      id: activeRecordId,
      patient: encounter.patient,
      summary: summaryFor(encounter),
      snapshot: encounter,
    });
    if (result.ok) {
      setActiveRecordId(result.value.id);
      setRecordStatus(`Draft saved ${new Date(result.value.updatedAt).toLocaleTimeString()}.`);
      setRecordsRefreshToken((value) => value + 1);
    } else {
      setRecordStatus(result.error.message);
    }
  };

  const discardLocalDraft = (): boolean => {
    if (!activeRecordId) return false;
    const result = repository.discard(activeRecordId);
    if (!result.ok) {
      setRecordStatus(result.error.message);
      return false;
    }
    setEncounter(emptyUdsEncounter());
    setActiveRecordId(undefined);
    setLocked(false);
    setAddenda([]);
    setAttestation(undefined);
    setRecordStatus(undefined);
    setRecordsRefreshToken((value) => value + 1);
    return true;
  };

  const attestAndLock = (): boolean => {
    const staff = staffSignInValue.trim();
    if (!canAttest || !staff) return false;
    const nextAttestation = {
      staff,
      timestamp: new Date().toISOString(),
      statementVersion: "local-attestation-v1",
    };
    const result = repository.complete({
      id: activeRecordId,
      patient: encounter.patient,
      summary: summaryFor(encounter),
      snapshot: encounter,
      attestation: nextAttestation,
    });
    if (!result.ok) {
      setRecordStatus(result.error.message);
      return false;
    }
    setActiveRecordId(result.value.id);
    setLocked(true);
    setAddenda(result.value.addenda);
    setAttestation(nextAttestation);
    setRecordStatus(`Locked ${new Date().toLocaleTimeString()}.`);
    setRecordsRefreshToken((value) => value + 1);
    return true;
  };

  // Leaving an editable record without saving would silently lose it -
  // mirrors Injection's "leaving an editable record is a save boundary".
  const startNewUdsScreen = () => {
    if (activeRecordId && !locked) saveLocalDraft();
    setEncounter(emptyUdsEncounter());
    setPhotoData("");
    setActiveRecordId(undefined);
    setLocked(false);
    setAddenda([]);
    setAttestation(undefined);
    setAddendumText("");
    setRecordStatus(undefined);
  };

  const openUdsRecord = (record: UdsRecord) => {
    setEncounter(record.snapshot);
    mirrorUdsEncounterToLegacyDom(record.snapshot, photoData);
    setActiveRecordId(record.id);
    setLocked(record.status === "completed");
    setAddenda(record.addenda);
    setAttestation(record.attestation);
    setAddendumText("");
    setRecordStatus(undefined);
  };

  const saveAddendum = () => {
    if (!activeRecordId || !addendumText.trim()) return;
    const result = repository.addAddendum({
      recordId: activeRecordId,
      author: addendumAuthor,
      text: addendumText,
    });
    if (result.ok) {
      setAddenda(result.value.addenda);
      setAddendumText("");
      setRecordsRefreshToken((value) => value + 1);
    } else {
      setRecordStatus(result.error.message);
    }
  };

  const noteInput = udsEncounterToDocumentationInput(encounter);
  const noteText = noteInput ? DocumentationEngine.format("uds", noteInput).text : "";

  const profile = profileFor(encounter.device);
  const testedCount = UDS_PANELS.length - UDS_PANELS.filter((panel) => (encounter.results[panel] ?? "nt") === "nt").length;
  const positiveCount = UDS_PANELS.filter((panel) => encounter.results[panel] === "pos").length;
  const invalidCount = UDS_PANELS.filter((panel) => encounter.results[panel] === "invalid").length;

  const stops = evaluation?.stops ?? [];
  const stopsByTab = countStopsByTab(stops, tabForUdsField);
  const udsReadyForFinalOutput = evaluation?.readiness === "ready";
  const firstStopMessage = stops[0]?.message;
  const udsLogLabel = udsReadyForFinalOutput
    ? "Finalize & add to daily log"
    : "Log as needs review";

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>UDS screen</strong>
        {locked ? (
          <span class="wfp-status-flag is-idle">Read only</span>
        ) : (
          <StatusFlag
            idle={(evaluation?.readiness ?? "idle") === "idle"}
            stopCount={stops.length}
            warningCount={evaluation?.warnings.length ?? 0}
            onOpenRequirements={() => setRequirementsOpen(true)}
          />
        )}
        <span class="wfp-summary-spacer" />
        <span class="wfp-transaction-readout" aria-label={`Worksheet page ${UDS_TABS.indexOf(tab) + 1} of ${UDS_TABS.length}`}>
          <b>{locked ? "REVIEW" : "ENTRY"}</b>
          <span>PG {UDS_TABS.indexOf(tab) + 1}/{UDS_TABS.length}</span>
        </span>
        <button
          type="button"
          class="cd2004-link-button"
          onClick={() => setRecordsOpen(true)}
        >
          UDS records…
        </button>
        {!locked && (
          <button
            type="button"
            class="cd2004-link-button"
            onClick={() =>
              patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } })
            }
            disabled={!activePatient.name?.trim() && !activePatient.dob?.trim()}
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
            disabled={!staffSignInValue}
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
        >
          {udsLogLabel}
        </button>
      </div>

      <div class="wfp-tabbar" role="tablist">
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "specimen"}
          onClick={() => setTab("specimen")}
        >
          {UDS_TAB_LABEL.specimen}
          {(stopsByTab.get("specimen") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("specimen")}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "results"}
          onClick={() => setTab("results")}
        >
          {UDS_TAB_LABEL.results}
          {(stopsByTab.get("results") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("results")}
            </span>
          )}
          <span class="wfp-tab-badge wfp-tab-badge-muted">
            {testedCount}/{UDS_PANELS.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "interpretation"}
          onClick={() => setTab("interpretation")}
        >
          {UDS_TAB_LABEL.interpretation}
          {(stopsByTab.get("interpretation") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("interpretation")}
            </span>
          )}
        </button>
      </div>

      <OutstandingRequirements<UdsTab>
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        stops={stops}
        tabForField={tabForUdsField}
        tabLabels={UDS_TAB_LABEL}
        onNavigate={setTab}
      />

      <fieldset disabled={locked} style="border:none;padding:0;margin:0;display:contents">

      {tab === "specimen" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Specimen &amp; collection</div>
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
                <Field label="Patient name">
                  <input
                    value={encounter.patient.name}
                    placeholder="Last, First"
                    onInput={(event) => patchPatient({ name: event.currentTarget.value })}
                  />
                </Field>
                <Field label="DOB" width="date">
                  <input
                    value={encounter.patient.dob}
                    placeholder="MM/DD/YYYY"
                    onInput={(event) => patchPatient({ dob: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Collected by">
                  <input
                    value={encounter.collector}
                    placeholder="Staff initials / name"
                    onInput={(event) => patch({ collector: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Collection date / time">
                  <input
                    type="datetime-local"
                    value={encounter.collectionDateTime}
                    onInput={(event) => patch({ collectionDateTime: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <Field label="Specimen temperature">
                <OptionList<UdsTemperatureState>
                  name="uds-temperature"
                  value={encounter.temperature}
                  onChange={(value) => patch({ temperature: value })}
                  options={UDS_TEMP_OPTIONS}
                  inline
                />
              </Field>
              <Field label="Reason">
                <OptionList<UdsEncounter["reason"]>
                  name="uds-reason"
                  value={encounter.reason}
                  onChange={(value) => patch({ reason: value })}
                  options={UDS_REASON_OPTIONS}
                  inline
                />
              </Field>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Device &amp; quality control</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Device">
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
                <Field label="Lot #">
                  <input
                    class="mono"
                    value={encounter.lot}
                    placeholder="LOT123"
                    onInput={(event) => patch({ lot: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Exp">
                  <input
                    class="mono"
                    type="month"
                    value={encounter.expiration}
                    onInput={(event) => patch({ expiration: event.currentTarget.value })}
                  />
                </Field>
              </div>

              {profile === "13" && (
                <Field label="Panel not on this 13-panel cup">
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
                <div class="wfp-checkbox-row">
                  <input
                    type="checkbox"
                    id="uds-custom-panel-verified"
                    checked={encounter.customPanelSetVerified ?? false}
                    onChange={(event) =>
                      patch({ customPanelSetVerified: event.currentTarget.checked })
                    }
                  />
                  <label for="uds-custom-panel-verified">
                    The device's exact visible panel set has been verified
                  </label>
                </div>
              )}
              {/* The engine requires this confirmation for every named device,
                  not just the two catalogued cups. Rendering it only for 13/14
                  made "Other point-of-care UDS cup" unfinishable: the stop
                  fired with no control anywhere in the UI that could clear it. */}
              {profile !== "none" && (
                <div class="wfp-checkbox-row">
                  <input
                    type="checkbox"
                    id="uds-readings-verified"
                    checked={encounter.physicalReadingsVerified}
                    onChange={(event) =>
                      patch({ physicalReadingsVerified: event.currentTarget.checked })
                    }
                  />
                  <label for="uds-readings-verified">
                    Physical cup and displayed panel readings verified for this encounter
                  </label>
                </div>
              )}

              <Field label="Control line">
                <OptionList<UdsControlState>
                  name="uds-control"
                  value={encounter.control}
                  onChange={(value) => patch({ control: value })}
                  options={UDS_CONTROL_OPTIONS}
                  inline
                />
              </Field>

              <Field label="Device photo" hint="optional for report">
                <input type="file" accept="image/*" onChange={onPhotoChange} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "results" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Result detail</div>
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
                  class="cd2004-link-button"
                  onClick={() => setAllPanels(UDS_PANELS, "neg")}
                >
                  All tested negative
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => setAllPanels(UDS_PANELS, "nt")}
                >
                  Mark all not tested
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => {
                    const results = { ...encounter.results };
                    UDS_PANELS.forEach((panel) => {
                      if (panel === omittedPanel) return;
                      results[panel] = panel === "THC" ? "pos" : "neg";
                    });
                    patch({ results });
                  }}
                >
                  THC positive · rest negative
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => {
                    const results = { ...encounter.results };
                    UDS_PANELS.forEach((panel) => {
                      if (results[panel] === "pos" || results[panel] === "invalid") {
                        results[panel] = panel === omittedPanel ? "nt" : "neg";
                      }
                    });
                    patch({ results });
                  }}
                >
                  Clear positives / invalids
                </button>
              </div>

              {UDS_GROUPS.map((group) => (
                <div class="wfp-section" key={group.key}>
                  <div class="wfp-section-head">
                    {group.label}
                    <button
                      type="button"
                      class="cd2004-link-button wfp-group-action"
                      onClick={() => setAllPanels(group.panels, "neg")}
                    >
                      Group negative
                    </button>
                    <button
                      type="button"
                      class="cd2004-link-button wfp-group-action"
                      onClick={() => setAllPanels(group.panels, "nt")}
                    >
                      Group not tested
                    </button>
                  </div>
                  <div class="wfp-grid wfp-grid-lab">
                    <div class="wfp-grid-head">
                      <span>Analyte</span>
                      <span>Result</span>
                      <span>Flag</span>
                      <span>Status</span>
                    </div>
                    {group.panels.map((panel) => {
                      const state = encounter.results[panel] ?? "nt";
                      const derived = UDS_RESULT_FLAG[state];
                      // The analyte named as absent from a 13-panel cup has no
                      // result to record - the device never displayed one. A
                      // lab report says so on the line itself rather than
                      // offering buttons that only produce a stop.
                      const notOnCup = panel === omittedPanel;
                      return (
                        <div class={`wfp-grid-row ${notOnCup ? "is-not-on-cup" : ""}`} key={panel}>
                          <span class="wfp-grid-cell">
                            <strong>{panel}</strong> {udsPanelName(panel)}
                          </span>
                          <span class="wfp-grid-cell wfp-grid-cell-actions">
                            {notOnCup ? (
                              <span class="wfp-grid-note">Not on this cup</span>
                            ) : (
                              RESULT_CYCLE.map((candidate) => (
                                <button
                                  key={candidate}
                                  type="button"
                                  class={`wfp-grid-toggle ${state === candidate ? "is-selected" : ""} is-${candidate}`}
                                  onClick={() => setPanelResult(panel, candidate)}
                                >
                                  {UDS_RESULT_LABEL[candidate]}
                                </button>
                              ))
                            )}
                          </span>
                          <span
                            class={`wfp-grid-cell wfp-result-flag ${derived.abnormal ? "is-abnormal" : ""}`}
                          >
                            {notOnCup ? "" : derived.flag}
                          </span>
                          <span class="wfp-grid-cell wfp-result-status">
                            {notOnCup ? "Not on device" : derived.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div class="wfp-summary-bar">
                <span>Tested: {testedCount}</span>
                <span>Preliminary positive: {positiveCount}</span>
                <span>Invalid: {invalidCount}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "interpretation" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Interpretation &amp; review</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Validity markers">
                  <select
                    value={encounter.validity}
                    onChange={(event) =>
                      patch({ validity: event.currentTarget.value as UdsEncounter["validity"] })
                    }
                  >
                    <option value="acceptable">Acceptable</option>
                    <option value="needs review">Needs review</option>
                    <option value="not documented">Not documented</option>
                  </select>
                </Field>
                <Field label="Medication alignment">
                  <select
                    value={encounter.medicationAlignment}
                    onChange={(event) =>
                      patch({
                        medicationAlignment: event.currentTarget
                          .value as UdsEncounter["medicationAlignment"],
                      })
                    }
                  >
                    <option value="no unexpected">No unexpected findings noted by staff</option>
                    <option value="not aligned">Not readily explained by available med list</option>
                    <option value="needs review">Provider review requested</option>
                    <option value="patient explanation">
                      Patient reports prescribed/known explanation
                    </option>
                    <option value="unavailable">Medication list unavailable / not reviewed</option>
                  </select>
                </Field>
                <Field label="Outside lab">
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
              <Field label="Patient comment / context">
                <textarea
                  value={encounter.comment ?? ""}
                  placeholder="Optional: patient explanation, prescribed meds, provider instruction, or follow-up context"
                  onInput={(event) => patch({ comment: event.currentTarget.value })}
                />
              </Field>
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="uds-sig-toggle"
                  checked={includeSignatureFields}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setIncludeSignatureFields(checked);
                    mirrorUdsSignatureToggle(checked);
                  }}
                />
                <label for="uds-sig-toggle">
                  Include review / signature fields on clinician report
                </label>
              </div>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Clinician result report</div>
            <div class="wfp-section-body">
              <ClinicianLabSheet
                encounter={encounter}
                omittedPanel={omittedPanel || undefined}
                includeSignatureFields={includeSignatureFields}
              />
              <div class="meditech-lab-note-heading">TEBRA NARRATIVE</div>
              <div class="wfp-preview">{noteText || "Document the encounter to build the note."}</div>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => clickLegacyControl("printUdsReport")}
                  disabled={!udsReadyForFinalOutput}
                  title={
                    udsReadyForFinalOutput
                      ? "Print the finalized clinician result report."
                      : "Available once every outstanding requirement below is resolved."
                  }
                >
                  Print clinician report
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("printUdsPatient")}
                  disabled={!udsReadyForFinalOutput}
                  title={
                    udsReadyForFinalOutput
                      ? "Print the finalized patient summary."
                      : "Available once every outstanding requirement below is resolved."
                  }
                >
                  Patient summary
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => navigator.clipboard?.writeText(noteText)}
                  disabled={!noteText}
                >
                  Copy Tebra UDS note
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
                        : `${stops.length} outstanding requirements, starting with: ${firstStopMessage}`}
                    </>
                  )}
                  .{" "}
                  <button
                    type="button"
                    class="cd2004-link-button"
                    onClick={() => setRequirementsOpen(true)}
                  >
                    View outstanding requirements
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      </fieldset>

      {locked && (
        <div class="wfp-section">
          <div class="wfp-section-head">Addendum</div>
          <div class="wfp-section-body">
            <p class="wfp-field-hint">
              Read-only completed record. The original encounter snapshot is locked. Add a dated
              addendum instead of changing the completed documentation.
              {attestation && (
                <>
                  {" "}
                  Attested by {attestation.staff} at{" "}
                  {new Date(attestation.timestamp).toLocaleString()}.
                </>
              )}
            </p>
            {addenda.map((entry) => (
              <div class="wfp-preview" key={entry.id}>
                <strong>{entry.author || "Staff"}</strong>
                <br />
                {entry.text}
              </div>
            ))}
            <Field label="Addendum entered by">
              <input
                value={addendumAuthor}
                placeholder="Current staff name or initials"
                onInput={(event) => setAddendumAuthor(event.currentTarget.value)}
              />
            </Field>
            <Field label="Dated addendum">
              <textarea
                ref={addendumTextRef}
                data-addendum-input
                value={addendumText}
                placeholder="Clarification, correction, or follow-up. The original completed record remains unchanged."
                onInput={(event) => setAddendumText(event.currentTarget.value)}
              />
            </Field>
            <div class="wfp-actions">
              <button
                type="button"
                class="cd2004-command-button"
                onClick={saveAddendum}
                disabled={!addendumText.trim()}
              >
                Save addendum
              </button>
            </div>
          </div>
        </div>
      )}

      <section
        class={`cd2004-record-actions is-${locked ? "locked" : activeRecordId ? "draft" : "new"}`}
        aria-label="UDS record actions"
      >
        <div class="cd2004-record-actions-state">
          <span>UDS RECORD</span>
          <strong>
            {locked ? "LOCAL RECORD LOCKED" : activeRecordId ? "SAVED LOCAL DRAFT" : "NEW LOCAL DRAFT"}
          </strong>
          <small role="status" aria-live="polite">
            {recordStatus ??
              (locked
                ? "This browser-local record is read-only. Corrections require a dated addendum."
                : activeRecordId
                  ? "Draft saved in this browser. Attest and lock only when the screen is final."
                  : "Enter encounter details, then save a local draft.")}
          </small>
        </div>
        <div class="cd2004-record-actions-buttons">
          {locked && (
            <button
              type="button"
              class="is-addendum"
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
                title="Save this editable UDS draft locally."
              >
                <span class="cd2004-action-glyph" aria-hidden="true">
                  <DesktopIcon name="save" />
                </span>
                Save local draft
              </button>
              <button
                type="button"
                class="is-primary"
                disabled={!canAttest}
                title={
                  canAttest
                    ? "Review the local attestation before locking this browser-local record."
                    : "Complete the required clinical fields and sign in staff before attesting and locking this record."
                }
                onClick={() => setRecordAction("attest")}
              >
                <span class="cd2004-action-glyph" aria-hidden="true">
                  <DesktopIcon name="lock" />
                </span>
                Attest &amp; lock local record
              </button>
            </>
          )}
          <span class="cd2004-record-action-separator" aria-hidden="true" />
          <button
            type="button"
            class="is-new"
            title="Start a blank UDS screen. Any current editable work is saved as a local draft first."
            onClick={startNewUdsScreen}
          >
            <span class="cd2004-action-glyph" aria-hidden="true">
              <DesktopIcon name="new" />
            </span>
            Start new UDS screen
          </button>
          {!locked && (
            <button
              type="button"
              class="is-danger"
              disabled={!activeRecordId}
              title={
                activeRecordId
                  ? "Discard this editable local draft. This cannot be undone."
                  : "There is no editable local draft to discard."
              }
              onClick={() => setRecordAction("discard")}
            >
              <span class="cd2004-action-glyph" aria-hidden="true">
                <DesktopIcon name="discard" />
              </span>
              Discard local draft...
            </button>
          )}
        </div>
      </section>

      <UdsRecordsWindow
        open={recordsOpen}
        onClose={() => setRecordsOpen(false)}
        onRecordOpen={openUdsRecord}
        onCreate={startNewUdsScreen}
        refreshToken={recordsRefreshToken}
      />

      {recordAction && (
        <RecordActionDialog
          kind={recordAction}
          recordNoun="UDS screen"
          recordLabel={encounter.patient.name.trim() || "this UDS screen"}
          attestation={
            recordAction === "attest"
              ? {
                  patient: encounter.patient.name.trim() || "Not entered",
                  localRecord: activeRecordId ?? "Not assigned",
                  medication: summaryFor(encounter),
                  disposition: `Validity: ${encounter.validity}; medication alignment: ${encounter.medicationAlignment}`,
                  staff: staffSignInValue || "Not signed in",
                  timestamp: new Date().toISOString(),
                  statementVersion: "local-attestation-v1",
                }
              : undefined
          }
          attestationLabels={{
            medication: "Device / panel summary",
            disposition: "Validity / interpretation summary",
          }}
          onConfirm={recordAction === "attest" ? attestAndLock : discardLocalDraft}
          onClose={() => setRecordAction(null)}
        />
      )}

      <p class="wfp-field-hint">
        UDS results are point-of-care preliminary screening only. Provider reviews results in
        clinical context; outside lab order may be placed when clinically indicated.
      </p>
    </div>
  );
}
