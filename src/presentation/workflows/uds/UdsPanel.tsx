import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  applyUdsDeviceProfileDefaults,
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
import { mirrorUdsEncounterToLegacyDom, mirrorUdsSignatureToggle } from "./uds-legacy-mirror";
import type { PatientContext } from "../../types";

type UdsTab = "specimen" | "results" | "interpretation";

// A point-of-care immunoassay report has three parts in every lab system that
// ever rendered one: what was collected, what the analyzer said, and what a
// human made of it. The tabs are those parts.
const UDS_TAB_LABEL: Record<UdsTab, string> = {
  specimen: "Specimen",
  results: "Results",
  interpretation: "Interpretation",
};

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
}: {
  idle: boolean;
  stopCount: number;
  warningCount: number;
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
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <div class="wfp-field">
      <label>{label}</label>
      {children}
      {hint && <span class="wfp-field-hint">{hint}</span>}
    </div>
  );
}

const RESULT_CYCLE: UdsResultState[] = ["nt", "neg", "pos", "invalid"];

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
  // Seeded from whatever the hidden legacy checkbox already holds at mount
  // (its own boot-time default) rather than forced, so a fresh encounter
  // doesn't silently flip the print report's signature-block default.
  const [includeSignatureFields, setIncludeSignatureFields] = useState<boolean>(
    () => (document.getElementById("udsSigToggle") as HTMLInputElement | null)?.checked ?? true,
  );
  const mirroredOnMount = useRef(false);

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

  const setAllPanels = (panels: readonly UdsPanelKey[], state: UdsResultState) => {
    const results = { ...encounter.results };
    panels.forEach((panel) => {
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

  const noteInput = udsEncounterToDocumentationInput(encounter);
  const noteText = noteInput ? DocumentationEngine.format("uds", noteInput).text : "";

  const profile = profileFor(encounter.device);
  const testedCount = UDS_PANELS.length - UDS_PANELS.filter((panel) => (encounter.results[panel] ?? "nt") === "nt").length;
  const positiveCount = UDS_PANELS.filter((panel) => encounter.results[panel] === "pos").length;
  const invalidCount = UDS_PANELS.filter((panel) => encounter.results[panel] === "invalid").length;

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>UDS screen</strong>
        <StatusFlag
          idle={(evaluation?.readiness ?? "idle") === "idle"}
          stopCount={evaluation?.stops.length ?? 0}
          warningCount={evaluation?.warnings.length ?? 0}
        />
        <span class="wfp-summary-spacer" />
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
        <button
          type="button"
          class="cd2004-command-button"
          onClick={() => clickLegacyControl("addUdsLog")}
        >
          Add to log
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
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "results"}
          onClick={() => setTab("results")}
        >
          {UDS_TAB_LABEL.results}
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
        </button>
      </div>

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
                <Field label="DOB">
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
              {(profile === "13" || profile === "14") && (
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
                        results[panel] = "neg";
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
                      return (
                        <div class="wfp-grid-row" key={panel}>
                          <span class="wfp-grid-cell">
                            <strong>{panel}</strong> {udsPanelName(panel)}
                          </span>
                          <span class="wfp-grid-cell wfp-grid-cell-actions">
                            {RESULT_CYCLE.map((candidate) => (
                              <button
                                key={candidate}
                                type="button"
                                class={`wfp-grid-toggle ${state === candidate ? "is-selected" : ""} is-${candidate}`}
                                onClick={() => setPanelResult(panel, candidate)}
                              >
                                {UDS_RESULT_LABEL[candidate]}
                              </button>
                            ))}
                          </span>
                          <span
                            class={`wfp-grid-cell wfp-result-flag ${derived.abnormal ? "is-abnormal" : ""}`}
                          >
                            {derived.flag}
                          </span>
                          <span class="wfp-grid-cell wfp-result-status">{derived.status}</span>
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
            <div class="wfp-section-head">UDS note</div>
            <div class="wfp-section-body">
              <div class="wfp-preview">{noteText || "Document the encounter to build the note."}</div>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => clickLegacyControl("printUdsReport")}
                >
                  Print clinician report
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("printUdsPatient")}
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
            </div>
          </div>
        </div>
      )}

      <p class="wfp-field-hint">
        UDS results are point-of-care preliminary screening only. Provider reviews results in
        clinical context; outside lab order may be placed when clinically indicated.
      </p>
    </div>
  );
}
