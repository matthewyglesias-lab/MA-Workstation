import type { ComponentChildren, Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  confirmSampleReview,
  sampleReviewIsCurrent,
  SamplesEngine,
  type SamplePackage,
  type SamplePlanStep,
  type SamplesEncounter,
  type SamplesEvaluationOutput,
} from "../../../domain/samples";
import {
  SAMPLE_INTENTS,
  SAMPLE_MEDICATIONS,
  SAMPLE_MEDICATIONS_BY_KEY,
  sampleMedicationDefaults,
  type SampleMedicationKey,
} from "../../../domain/samples-catalog";
import { localIsoDate } from "../../../domain/dates";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { DocumentationEngine } from "../../../documentation";
import { samplesEncounterToDocumentationInput } from "../../../documentation/adapters/samples-from-encounter";
import { DesktopIcon } from "../../DesktopIcon";
import { clickLegacyControl } from "../legacy-mirror";
import { countStopsByTab, OutstandingRequirements } from "../OutstandingRequirements";
import { ProviderField } from "../ProviderField";
import { StatusFlag } from "../StatusFlag";
import { WorkstationDateField } from "../WorkstationDateField";
import { mirrorSamplesEncounterToLegacyDom } from "./samples-legacy-mirror";
import type { PatientContext } from "../../types";
import { formatDobAsTyped } from "../../format-dob";

type SamplesTab = "order" | "medication" | "plan" | "review";

const SAMPLES_TAB_LABEL: Record<SamplesTab, string> = {
  order: "Patient / order",
  medication: "Medication",
  plan: "Plan & trace",
  review: "Safety / review",
};

/**
 * Maps a ClinicalIssue's dot-path `field` back to the tab that edits it. A
 * sample dispense can open with seven simultaneous stops spread across all
 * four tabs, which is exactly the case where a bare count is useless.
 */
function tabForSamplesField(field?: string): SamplesTab {
  const head = (field ?? "").split(".")[0];
  switch (head) {
    case "patient":
    case "prescriber":
    case "staff":
    case "dispenseDate":
    case "startDate":
    case "purpose":
      return "order";
    case "medication":
    case "quantity":
    case "directions":
    case "titration":
      return "medication";
    // Package traceability and the step plan share the Plan tab.
    case "packages":
    case "plan":
      return "plan";
    case "medicationReview":
    case "education":
    case "review":
      return "review";
    default:
      return "order";
  }
}

interface SamplesPanelProps {
  initialEncounter: SamplesEncounter;
  activePatient: PatientContext;
  evaluation?: ClinicalEvaluation<SamplesEvaluationOutput>;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
}

interface AdditionalRow {
  id: string;
  strength: string;
  quantity: string;
  days: string;
  directions: string;
  lot: string;
  expiration: string;
}

const patientIsEmpty = (patient: SamplesEncounter["patient"]): boolean =>
  !patient.name.trim() && !patient.dob.trim();

const primaryPackage = (encounter: SamplesEncounter): SamplePackage =>
  encounter.packages.find((entry) => entry.id === "primary") ?? {
    id: "primary",
    label: "Primary package",
    medicationStrength: encounter.medicationLabel,
    quantity: encounter.quantity,
    lot: "",
    expiration: "",
  };

const rowsFromEncounter = (encounter: SamplesEncounter): AdditionalRow[] =>
  encounter.plan.map((step) => {
    const pkg = encounter.packages.find((entry) => entry.id === step.id);
    return {
      id: step.id,
      strength: step.strength,
      quantity: step.quantity,
      days: step.days ?? "",
      directions: step.directions,
      lot: pkg?.lot ?? "",
      expiration: pkg?.expiration ?? "",
    };
  });

const buildPlanAndPackages = (
  medicationLabel: string,
  quantity: string,
  primaryLot: string,
  primaryExpiration: string,
  rows: AdditionalRow[],
): { plan: SamplePlanStep[]; packages: SamplePackage[] } => {
  const plan: SamplePlanStep[] = rows.map((row) => ({
    id: row.id,
    strength: row.strength,
    quantity: row.quantity,
    days: row.days,
    directions: row.directions,
  }));
  const packages: SamplePackage[] = [
    {
      id: "primary",
      label: "Primary package",
      medicationStrength: medicationLabel,
      quantity,
      lot: primaryLot,
      expiration: primaryExpiration,
    },
    ...rows
      .filter((row) => row.quantity.trim())
      .map((row, index) => ({
        id: row.id,
        label: `Added package ${index + 2}`,
        medicationStrength: row.strength.trim() || medicationLabel,
        quantity: row.quantity,
        lot: row.lot,
        expiration: row.expiration,
      })),
  ];
  return { plan, packages };
};

const newRowId = (): string => `sample-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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

export function SamplesPanel({
  initialEncounter,
  activePatient,
  evaluation,
  staffSignInValue,
  previewRef,
}: SamplesPanelProps) {
  const [encounter, setEncounter] = useState<SamplesEncounter>(initialEncounter);
  const [tab, setTab] = useState<SamplesTab>("order");
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const mirroredOnMount = useRef(false);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorSamplesEncounterToLegacyDom(encounter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const patch = (partial: Partial<SamplesEncounter>) => {
    setEncounter((previous) => {
      const next = { ...previous, ...partial };
      mirrorSamplesEncounterToLegacyDom(next);
      return next;
    });
  };

  const patchPatient = (partial: Partial<SamplesEncounter["patient"]>) => {
    patch({ patient: { ...encounter.patient, ...partial } });
  };

  const patchMedicationQuantity = (
    partial: Partial<Pick<SamplesEncounter, "medicationLabel" | "quantity">>,
  ) => {
    const next = { ...encounter, ...partial };
    const primary = primaryPackage(encounter);
    const rows = rowsFromEncounter(encounter);
    const { plan, packages } = buildPlanAndPackages(
      next.medicationLabel,
      next.quantity,
      primary.lot,
      primary.expiration,
      rows,
    );
    patch({ ...partial, plan, packages });
  };

  const patchRows = (nextRows: AdditionalRow[]) => {
    const primary = primaryPackage(encounter);
    const { plan, packages } = buildPlanAndPackages(
      encounter.medicationLabel,
      encounter.quantity,
      primary.lot,
      primary.expiration,
      nextRows,
    );
    patch({ plan, packages });
  };

  const updateRow = (id: string, rowPatch: Partial<AdditionalRow>) => {
    patchRows(rowsFromEncounter(encounter).map((row) => (row.id === id ? { ...row, ...rowPatch } : row)));
  };

  const addRow = () => {
    patchRows([
      ...rowsFromEncounter(encounter),
      { id: newRowId(), strength: "", quantity: "", days: "", directions: "", lot: "", expiration: "" },
    ]);
  };

  const removeRow = (id: string) => {
    patchRows(rowsFromEncounter(encounter).filter((row) => row.id !== id));
  };

  const patchPrimaryTrace = (field: "lot" | "expiration", value: string) => {
    const rows = rowsFromEncounter(encounter);
    const primary = primaryPackage(encounter);
    const nextLot = field === "lot" ? value : primary.lot;
    const nextExpiration = field === "expiration" ? value : primary.expiration;
    const { plan, packages } = buildPlanAndPackages(
      encounter.medicationLabel,
      encounter.quantity,
      nextLot,
      nextExpiration,
      rows,
    );
    patch({ plan, packages });
  };

  const medication = SAMPLE_MEDICATIONS_BY_KEY[encounter.medicationKey as SampleMedicationKey];

  const onSelectMedication = (key: string) => {
    const med = SAMPLE_MEDICATIONS_BY_KEY[key as SampleMedicationKey];
    if (!med) {
      patchMedicationQuantity({ medicationLabel: "" });
      patch({ medicationKey: "" });
      return;
    }
    const defaults = sampleMedicationDefaults(med, 0);
    const primary = primaryPackage(encounter);
    const rows = rowsFromEncounter(encounter);
    const { plan, packages } = buildPlanAndPackages(
      defaults.medicationLabel,
      defaults.quantity,
      primary.lot,
      primary.expiration,
      rows,
    );
    patch({
      medicationKey: med.key,
      medicationLabel: defaults.medicationLabel,
      purpose: defaults.purpose,
      directions: defaults.directions,
      titration: defaults.titration,
      foodInstructions: defaults.foodInstructions,
      quantity: defaults.quantity,
      plan,
      packages,
    });
  };

  const applySigOption = (index: number) => {
    if (!medication) return;
    const option = medication.sigOptions[index];
    if (!option) return;
    const defaults = sampleMedicationDefaults(medication, index);
    setEncounter((previous) => {
      const primary = primaryPackage(previous);
      let rows = rowsFromEncounter(previous);
      if (option.multiDose?.length) {
        rows = [
          ...rows,
          ...option.multiDose.map((dose) => ({
            id: newRowId(),
            strength: dose.strength,
            quantity: dose.qty,
            days: "",
            directions: dose.sig,
            lot: "",
            expiration: "",
          })),
        ];
      }
      const { plan, packages } = buildPlanAndPackages(
        defaults.medicationLabel,
        defaults.quantity,
        primary.lot,
        primary.expiration,
        rows,
      );
      const next: SamplesEncounter = {
        ...previous,
        medicationLabel: defaults.medicationLabel,
        purpose: defaults.purpose,
        directions: defaults.directions,
        titration: defaults.titration,
        foodInstructions: defaults.foodInstructions,
        quantity: defaults.quantity,
        plan,
        packages,
      };
      mirrorSamplesEncounterToLegacyDom(next);
      return next;
    });
  };

  const today = localIsoDate();
  const localEvaluation = SamplesEngine.evaluate(encounter, { today });
  const reviewCurrent = sampleReviewIsCurrent(encounter, today);

  const confirmReview = () => {
    const confirmedAt = new Date().toISOString();
    setEncounter((previous) => {
      const next = confirmSampleReview(previous, confirmedAt);
      mirrorSamplesEncounterToLegacyDom(next);
      clickLegacyControl("sampleReviewedToday");
      return next;
    });
  };

  const noteInput = samplesEncounterToDocumentationInput(encounter, today);
  const noteText = noteInput ? DocumentationEngine.format("samples", noteInput).text : "";

  const rows = rowsFromEncounter(encounter);
  const primary = primaryPackage(encounter);

  const stops = evaluation?.stops ?? [];
  const stopsByTab = countStopsByTab(stops, tabForSamplesField);
  const canFinalizeSampleLog =
    evaluation?.output.finalizedOutputAllowed ?? false;
  const firstSampleStopMessage = stops[0]?.message;

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>Oral sample encounter</strong>
        <StatusFlag
          idle={(evaluation?.readiness ?? "idle") === "idle"}
          stopCount={stops.length}
          warningCount={evaluation?.warnings.length ?? 0}
          onOpenRequirements={() => setRequirementsOpen(true)}
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
            if (staffSignInValue) patch({ staff: staffSignInValue });
          }}
          disabled={!staffSignInValue}
        >
          Use signed-in staff
        </button>
        <button
          type="button"
          class="cd2004-command-button"
          disabled={!canFinalizeSampleLog}
          title={
            canFinalizeSampleLog
              ? "Add the completed sample dispense to today's local activity log."
              : "Complete the documented safety, traceability, and final review requirements before logging this dispense."
          }
          onClick={() => clickLegacyControl("sampleAddLog")}
        >
          Finalize dispense &amp; add to daily log
        </button>
      </div>

      <div class="wfp-tabbar" role="tablist">
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "order"}
          onClick={() => setTab("order")}
        >
          Patient / order
          {(stopsByTab.get("order") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("order")}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "medication"}
          onClick={() => setTab("medication")}
        >
          Medication
          {(stopsByTab.get("medication") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("medication")}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "plan"}
          onClick={() => setTab("plan")}
        >
          Plan &amp; traceability
          {(stopsByTab.get("plan") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("plan")}
            </span>
          )}
          <span class="wfp-tab-badge wfp-tab-badge-muted">{rows.length + 1}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="wfp-tab"
          aria-selected={tab === "review"}
          onClick={() => setTab("review")}
        >
          Safety &amp; review
          {(stopsByTab.get("review") ?? 0) > 0 && (
            <span class="wfp-tab-badge" aria-hidden="true">
              {stopsByTab.get("review")}
            </span>
          )}
        </button>
      </div>

      <OutstandingRequirements<SamplesTab>
        open={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        stops={stops}
        tabForField={tabForSamplesField}
        tabLabels={SAMPLES_TAB_LABEL}
        onNavigate={setTab}
      />

      {tab === "order" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Patient / order">
            <div class="wfp-section-head">Patient / order</div>
            <div class="wfp-section-body">
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
                    inputMode="numeric"
                    onInput={(event) =>
                      patchPatient({ dob: formatDobAsTyped(event.currentTarget.value) })
                    }
                  />
                </Field>
                <Field label="Prescriber">
                  <ProviderField
                    prescribersOnly
                    fallbackLabel="Prescriber"
                    value={encounter.prescriber}
                    onChange={(next) => patch({ prescriber: next })}
                  />
                </Field>
              </div>
              <div class="wfp-row">
                <Field label="Dispensed by">
                  <input
                    value={encounter.staff}
                    placeholder="Staff name"
                    onInput={(event) => patch({ staff: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Date dispensed">
                  <WorkstationDateField
                    value={encounter.dispenseDate}
                    onCommit={(next) => patch({ dispenseDate: next })}
                  />
                </Field>
                <Field label="Start date">
                  <WorkstationDateField
                    value={encounter.startDate}
                    onCommit={(next) => patch({ startDate: next })}
                  />
                </Field>
              </div>
              <Field label="Prescriber intent / purpose">
                <select
                  value={encounter.purpose}
                  onChange={(event) => patch({ purpose: event.currentTarget.value })}
                >
                  <option value="">Select intent</option>
                  {SAMPLE_INTENTS.map((intent) => (
                    <option key={intent.value} value={intent.value}>
                      {intent.label}
                    </option>
                  ))}
                </select>
                {SAMPLE_INTENTS.find((intent) => intent.value === encounter.purpose) && (
                  <span class="wfp-field-hint">
                    {SAMPLE_INTENTS.find((intent) => intent.value === encounter.purpose)?.note}
                  </span>
                )}
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "medication" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Clinic sample medication">
            <div class="wfp-section-head">Clinic sample medication</div>
            <div class="wfp-section-body">
              <Field label="Medication">
                <select
                  value={encounter.medicationKey}
                  onChange={(event) => onSelectMedication(event.currentTarget.value)}
                >
                  <option value="">Select sample medication</option>
                  {SAMPLE_MEDICATIONS.map((med) => (
                    <option key={med.key} value={med.key}>
                      {med.label}
                    </option>
                  ))}
                </select>
              </Field>
              {medication && medication.guard && (
                <p class="wfp-field-hint">{medication.guard}</p>
              )}
              {medication && medication.sigOptions.length > 0 && (
                <div class="wfp-actions">
                  {medication.sigOptions.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      class="cd2004-link-button"
                      onClick={() => applySigOption(index)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div class="wfp-row">
                <Field label="Primary medication / strength">
                  <input
                    value={encounter.medicationLabel}
                    placeholder="Medication and strength"
                    onInput={(event) => patchMedicationQuantity({ medicationLabel: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Primary package handed out">
                  <input
                    value={encounter.quantity}
                    placeholder="e.g., 1 box / 7 caps"
                    onInput={(event) => patchMedicationQuantity({ quantity: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Food timing">
                  <select
                    value={encounter.foodInstructions ?? "auto"}
                    onChange={(event) => patch({ foodInstructions: event.currentTarget.value })}
                  >
                    <option value="auto">Auto from medication</option>
                    <option value="with or without food">With or without food</option>
                    <option value="with food">Take with food</option>
                    <option value="empty stomach">Empty stomach</option>
                    <option value="custom">See prescriber instructions</option>
                  </select>
                </Field>
              </div>
              <Field label="Patient instructions">
                <textarea
                  value={encounter.directions}
                  placeholder="Example: Take 1 capsule by mouth every morning. Follow the prescriber's titration schedule. Do not change dose unless instructed."
                  onInput={(event) => patch({ directions: event.currentTarget.value })}
                />
              </Field>
              <Field label="Titration / prescriber intent">
                <textarea
                  value={encounter.titration ?? ""}
                  placeholder="Optional: Day 1–7..., then Day 8..., increase only if tolerated, bridge until pharmacy fill, etc."
                  onInput={(event) => patch({ titration: event.currentTarget.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "plan" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Package traceability">
            <div class="wfp-section-head">Package traceability</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Primary package lot #">
                  <input
                    class="mono"
                    value={primary.lot}
                    placeholder="Lot"
                    onInput={(event) => patchPrimaryTrace("lot", event.currentTarget.value)}
                  />
                </Field>
                <Field label="Primary package exp">
                  <input
                    class="mono"
                    type="month"
                    value={primary.expiration}
                    onInput={(event) => patchPrimaryTrace("expiration", event.currentTarget.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Samples provided / step plan">
            <div class="wfp-section-head">
              Samples provided / step plan
              <button type="button" class="cd2004-link-button wfp-group-action" onClick={addRow}>
                + Add package / step
              </button>
            </div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">
                Use this list for additional packages or medication sequences, such as Vraylar 1.5 mg first, then 3
                mg. Single-package samples can stay in the primary package fields above.
              </p>
              {rows.length === 0 && (
                <p class="wfp-field-hint">No additional packages or steps documented.</p>
              )}
              {rows.length > 0 && (
                <div class="wfp-table-wrap">
                  <table class="wfp-table">
                    <thead>
                      <tr>
                        <th>Medication / strength</th>
                        <th>Package</th>
                        <th>Days</th>
                        <th>Directions</th>
                        <th>Lot #</th>
                        <th>Exp</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <input
                              value={row.strength}
                              placeholder="e.g., Vraylar 3 mg capsule"
                              onInput={(event) => updateRow(row.id, { strength: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={row.quantity}
                              placeholder="e.g., 1 box / 7 caps"
                              onInput={(event) => updateRow(row.id, { quantity: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              class="mono"
                              value={row.days}
                              placeholder="7"
                              onInput={(event) => updateRow(row.id, { days: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <input
                              value={row.directions}
                              placeholder="e.g., Then take 1 capsule daily"
                              onInput={(event) => updateRow(row.id, { directions: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <input
                              class="mono"
                              value={row.lot}
                              placeholder="Lot"
                              onInput={(event) => updateRow(row.id, { lot: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <input
                              class="mono"
                              type="month"
                              value={row.expiration}
                              onInput={(event) => updateRow(row.id, { expiration: event.currentTarget.value })}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              class="wfp-table-delete"
                              title="Remove"
                              onClick={() => removeRow(row.id)}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "review" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section" role="group" aria-label="Safety handoff">
            <div class="wfp-section-head">Safety handoff</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Medication list / interaction check">
                  <select
                    value={encounter.medicationReview}
                    onChange={(event) =>
                      patch({
                        medicationReview: event.currentTarget.value as SamplesEncounter["medicationReview"],
                      })
                    }
                  >
                    <option>Prescriber reviewed / ok to dispense</option>
                    <option>Pending provider confirmation</option>
                    <option>Medication list not available</option>
                    <option>Patient counseled to ask pharmacist before starting</option>
                    <option value="not documented">Not documented</option>
                  </select>
                </Field>
                <Field label="Patient education">
                  <select
                    value={encounter.education}
                    onChange={(event) => patch({ education: event.currentTarget.value })}
                  >
                    <option>Reviewed with patient</option>
                    <option>Reviewed with caregiver</option>
                    <option>Written instructions only</option>
                    <option>Needs additional counseling</option>
                    <option value="not documented">Not documented</option>
                  </select>
                </Field>
              </div>
              <Field label="Extra patient-friendly note">
                <textarea
                  value={encounter.extra ?? ""}
                  placeholder="Optional: call if nausea is severe, take at bedtime if provider instructed, pharmacy prior auth pending, etc."
                  onInput={(event) => patch({ extra: event.currentTarget.value })}
                />
              </Field>
              <div class="wfp-row">
                <Field label="Patient handout status" hint="optional">
                  <select
                    value={encounter.handoutStatus ?? ""}
                    onChange={(event) => patch({ handoutStatus: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option>Printed and provided</option>
                    <option>Electronic copy provided</option>
                    <option>Patient declined</option>
                    <option>Not provided — follow-up needed</option>
                  </select>
                </Field>
                <Field label="Follow-up" hint="optional">
                  <textarea
                    value={encounter.followUp ?? ""}
                    placeholder="Owner, timing, pharmacy access, callback, or other next step"
                    onInput={(event) => patch({ followUp: event.currentTarget.value })}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Final dispense review">
            <div class="wfp-section-head">Final dispense review</div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">
                When the current patient/date, package labels, directions, medication review, and education status
                are correct, make one explicit confirmation before printing or logging the dispense. It resets if
                the patient, plan, package trace, or counseling changes.
              </p>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  aria-pressed={reviewCurrent}
                  disabled={!localEvaluation.output.reviewEligible && !reviewCurrent}
                  onClick={confirmReview}
                >
                  {reviewCurrent ? "Reviewed today" : "Mark reviewed today"}
                </button>
                <span class="wfp-field-hint">
                  {reviewCurrent
                    ? "Current entry confirmed."
                    : localEvaluation.output.reviewEligible
                      ? "Eligible for final review."
                      : "Clear the outstanding requirements listed at the top of this worksheet before confirming review."}
                </span>
              </div>
            </div>
          </div>

          <div class="wfp-section" role="group" aria-label="Document output">
            <div class="wfp-section-head">Document output</div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint wfp-document-output-hint">
                Printing uses the same local encounter snapshot as Clinical Documentation, in the sidebar.
              </p>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => navigator.clipboard?.writeText(noteText)}
                  disabled={!noteText}
                >
                  <DesktopIcon name="copy" />
                  Copy note
                </button>
                <span class="wfp-actions-divider" aria-hidden="true" />
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => clickLegacyControl("samplePrint")}
                  disabled={!canFinalizeSampleLog}
                  title={
                    canFinalizeSampleLog
                      ? "Print the finalized patient handout."
                      : "Available once every outstanding requirement below is resolved."
                  }
                >
                  <DesktopIcon name="print" />
                  Print patient handout
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("sampleWorksheetPrint")}
                >
                  <DesktopIcon name="print" />
                  Print clinician worksheet
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("sampleWorksheetBlank")}
                >
                  <DesktopIcon name="print" />
                  Blank worksheet
                </button>
              </div>
              {!canFinalizeSampleLog && (
                <p class="wfp-field-hint wfp-print-block-hint" role="status">
                  Printing the patient handout is disabled until this dispense is complete
                  {firstSampleStopMessage && (
                    <>
                      {" — "}
                      {stops.length === 1
                        ? firstSampleStopMessage
                        : `${stops.length} outstanding requirements, starting with: ${firstSampleStopMessage}`}
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

      <p class="wfp-field-hint">
        Sample handouts support prescriber instructions. They do not replace medication guides, pharmacy counseling,
        or the prescriber's final directions.
      </p>
    </div>
  );
}
