import type { ComponentChildren, Ref } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "../workflow-panels.css";
import {
  INJECTION_ATTESTATION_OPTIONS,
  INJECTION_REASON_OPTIONS,
  INJECTION_RESPONSE_OPTIONS,
  INJECTION_SAFETY_TRIGGERS,
  emptyInjectionInitiation,
  injectionInitiationConfig,
  injectionInitiationOptions,
  injectionInitiationSecondarySites,
  verificationLabels,
  type InjectionAdministrationDetails,
  type InjectionDisposition,
  type InjectionEncounter,
  type InjectionEvaluationOutput,
  type InjectionInitiationProtocol,
  type InjectionReason,
  type InjectionResponse,
} from "../../../domain/injection";
import {
  ALL_INJECTION_SITES,
  INJECTION_INTERVAL_OPTIONS,
  INJECTION_MEDICATIONS,
  allowedDosesForInterval,
  type InjectionIntervalKey,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "../../../domain/injection-catalog";
import type { ClinicalEvaluation } from "../../../domain/contracts";
import { DocumentationEngine } from "../../../documentation";
import { injectionEncounterToDocumentationInput } from "../../../documentation/adapters/injection-from-encounter";
import { clickLegacyControl, setLegacyFieldValue } from "../legacy-mirror";
import { mirrorInjectionEncounterToLegacyDom } from "./injection-legacy-mirror";
import { SiteHistoryRepository } from "../../../persistence/site-history";
import { browserSafeStorage } from "../../../persistence/storage";
import type { PatientContext } from "../../types";

// The tabs are the blocks of a medication administration record, not a
// decomposition of the form. A MAR is organised around the administration
// event: what authorises this dose, when it is due, what was actually given,
// what product it came from, what was verified first, and what happened after.
type InjectionTab =
  | "order"
  | "schedule"
  | "administration"
  | "product"
  | "verification"
  | "outcome";

const INJECTION_TABS: Array<[InjectionTab, string]> = [
  ["order", "Order"],
  ["schedule", "Schedule"],
  ["administration", "Administration"],
  ["product", "Product"],
  ["verification", "Verification"],
  ["outcome", "Outcome"],
];

const INJECTION_TAB_LABELS = Object.fromEntries(INJECTION_TABS) as Record<InjectionTab, string>;

// "details.*" is the one field prefix that doesn't map to a single tab - its
// sub-fields are split across Product (source/prep/waste/product issue),
// Administration (volume/device/site condition) and Outcome (administration
// exception). Everything else maps by top-level field name/prefix alone.
const INJECTION_DETAILS_FIELD_TAB: Record<string, InjectionTab> = {
  purpose: "order",
  productSource: "product",
  productSourceOther: "product",
  preparation: "product",
  preparationOther: "product",
  waste: "product",
  wasteAmount: "product",
  wasteWitness: "product",
  productIssue: "product",
  productIssueDetail: "product",
  productIssueAction: "product",
  productIssueRecipient: "product",
  productIssueNotificationTime: "product",
  productIssueDirection: "product",
  productIssueNextStep: "product",
  // Dose actually delivered and the device it came through are part of the
  // administration event, not the outcome of it.
  volume: "administration",
  volumeUnit: "administration",
  device: "administration",
  deviceOther: "administration",
  siteCondition: "administration",
  siteConditionOther: "administration",
  administrationException: "outcome",
  exceptionSummary: "outcome",
  exceptionRecipient: "outcome",
  exceptionTime: "outcome",
  exceptionOutcome: "outcome",
};

/**
 * Maps a ClinicalIssue's dot-path `field` back to the tab that actually
 * edits it, so an outstanding stop can be surfaced as a direct "go here"
 * link instead of leaving staff to hunt across all six tabs for whichever
 * field is still blank.
 */
function tabForInjectionField(field?: string): InjectionTab {
  const [head, sub] = (field ?? "").split(".");
  switch (head) {
    // What authorises this dose: who ordered it, why, and the exact product,
    // dose, route and interval the order specifies.
    case "patient":
    case "orderingProvider":
    case "reason":
    case "medicationKey":
    case "customMedication":
    case "dose":
    case "route":
    case "intervalKey":
    case "technique":
      return "order";
    // When it is due, and the multi-dose protocol that sets the schedule.
    case "priorDoseDate":
    case "priorSite":
    case "administrationDate":
    case "nextDoseDate":
    case "initiation":
      return "schedule";
    // The administration event itself.
    case "site":
    case "administeredBy":
    case "administrationTime":
    case "secondAdministrationTime":
      return "administration";
    case "traceability":
      return "product";
    case "attestations":
    case "verifications":
    case "vitals":
    case "allergies":
    case "acuteSafetyScreenConfirmed":
    case "activeSafetyConcerns":
      return "verification";
    case "response":
    case "disposition":
      return "outcome";
    case "details":
      return (sub && INJECTION_DETAILS_FIELD_TAB[sub]) || "outcome";
    default:
      return "order";
  }
}

interface InjectionPanelProps {
  initialEncounter: InjectionEncounter;
  activePatient: PatientContext;
  evaluation?: ClinicalEvaluation<InjectionEvaluationOutput>;
  staffSignInValue: string;
  previewRef?: Ref<HTMLDivElement>;
  /** True once the record has been completed and locked (read-only) via the
   * records workspace. Matches legacy's #panel-administer.record-readonly. */
  locked?: boolean;
}

const patientIsEmpty = (patient: InjectionEncounter["patient"]): boolean =>
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

function OptionList<T extends string>({ name, value, onChange, options, inline }: OptionListProps<T>) {
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

function CheckList({
  items,
  checked,
  onToggle,
}: {
  items: ReadonlyArray<{ key: string; label: string; description?: string; required?: boolean }>;
  checked: (key: string) => boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <div class="wfp-option-list">
      {items.map((item) => (
        <label key={item.key} class={`wfp-option-row ${checked(item.key) ? "is-selected" : ""}`}>
          <input
            type="checkbox"
            checked={checked(item.key)}
            onChange={(event) => onToggle(item.key, event.currentTarget.checked)}
          />
          <span>
            <span class="wfp-option-title">
              {item.label}
              {item.required && <span style="color:var(--cd-red)"> *</span>}
            </span>
            {item.description && <div class="wfp-option-desc">{item.description}</div>}
          </span>
        </label>
      ))}
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

const emptyDetails = (): InjectionAdministrationDetails => ({});

export function InjectionPanel({
  initialEncounter,
  activePatient,
  evaluation,
  staffSignInValue,
  previewRef,
  locked,
}: InjectionPanelProps) {
  const [encounter, setEncounter] = useState<InjectionEncounter>(initialEncounter);
  const [tab, setTab] = useState<InjectionTab>("order");
  const mirroredOnMount = useRef(false);
  // Addenda are a record-lifecycle concept, not part of the typed
  // InjectionEncounter - staffSignInValue seeds the author field, then this
  // drives the hidden legacy #injAddendumAuthor/#injAddendumText/
  // [data-inj-addendum] the same one-way-mirror way as everything else.
  const [addendumAuthor, setAddendumAuthor] = useState(staffSignInValue);
  const [addendumText, setAddendumText] = useState("");
  const [addenda, setAddenda] = useState<Array<{ author: string; text: string; stamp: string }>>([]);

  const readAddenda = () =>
    [...document.querySelectorAll<HTMLElement>(".record-addenda-item")].map((node) => ({
      author: node.querySelector("b")?.textContent ?? "",
      text: (node.textContent ?? "").replace(node.querySelector("b")?.textContent ?? "", "").trim(),
      stamp: "",
    }));

  useEffect(() => {
    if (!locked) return;
    setAddenda(readAddenda());
    setLegacyFieldValue("injAddendumAuthor", addendumAuthor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    if (mirroredOnMount.current) return;
    mirroredOnMount.current = true;
    mirrorInjectionEncounterToLegacyDom(encounter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patientIsEmpty(encounter.patient)) return;
    if (!activePatient.name?.trim() && !activePatient.dob?.trim()) return;
    patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatient.name, activePatient.dob]);

  const patch = (partial: Partial<InjectionEncounter>) => {
    setEncounter((previous) => {
      const next = { ...previous, ...partial };
      mirrorInjectionEncounterToLegacyDom(next);
      return next;
    });
  };

  const patchPatient = (partial: Partial<InjectionEncounter["patient"]>) => {
    patch({ patient: { ...encounter.patient, ...partial } });
  };

  const patchDetails = (partial: Partial<InjectionAdministrationDetails>) => {
    patch({ details: { ...(encounter.details ?? emptyDetails()), ...partial } });
  };

  const patchDisposition = (partial: Partial<InjectionDisposition>) => {
    patch({ disposition: { ...encounter.disposition, ...partial } });
  };

  const onMedicationChange = (key: InjectionMedicationKey | "") => {
    const medication = key ? INJECTION_MEDICATIONS[key] : null;
    patch({
      medicationKey: key,
      customMedication: "",
      dose: "",
      site: "",
      route: medication?.route ?? "",
      intervalKey: "",
      verifications: {},
      initiation: emptyInjectionInitiation(),
    });
  };

  const toggleAttestation = (key: string, value: boolean) => {
    patch({
      attestations: {
        ...encounter.attestations,
        [key]: value,
      } as InjectionEncounter["attestations"],
    });
  };

  const toggleVerification = (key: string, value: boolean) => {
    patch({
      verifications: {
        ...encounter.verifications,
        [key]: value,
      } as InjectionEncounter["verifications"],
    });
  };

  const toggleSafetyConcern = (key: string, value: boolean) => {
    const current = new Set(encounter.activeSafetyConcerns ?? []);
    if (value) current.add(key);
    else current.delete(key);
    patch({ activeSafetyConcerns: [...current] });
  };

  const patchInitiation = (partial: Partial<NonNullable<InjectionEncounter["initiation"]>>) => {
    patch({ initiation: { ...(encounter.initiation ?? emptyInjectionInitiation()), ...partial } });
  };

  const patchInitiationSecond = (
    partial: Partial<NonNullable<InjectionEncounter["initiation"]>["second"]>,
  ) => {
    const initiation = encounter.initiation ?? emptyInjectionInitiation();
    patch({ initiation: { ...initiation, second: { ...initiation.second, ...partial } } });
  };

  const onAddendumAuthorChange = (value: string) => {
    setAddendumAuthor(value);
    setLegacyFieldValue("injAddendumAuthor", value);
  };

  const onAddendumTextChange = (value: string) => {
    setAddendumText(value);
    setLegacyFieldValue("injAddendumText", value);
  };

  const saveAddendum = () => {
    document.querySelector<HTMLButtonElement>("[data-inj-addendum]")?.click();
    setAddendumText("");
    window.setTimeout(() => setAddenda(readAddenda()), 60);
  };

  const noteInput = evaluation
    ? injectionEncounterToDocumentationInput(encounter, evaluation)
    : null;
  const noteText = noteInput ? DocumentationEngine.format("injection", noteInput, evaluation).text : "";

  const medication = encounter.medicationKey ? INJECTION_MEDICATIONS[encounter.medicationKey] : null;
  const initiationOptions = injectionInitiationOptions(encounter.medicationKey);
  const initiationConfig = encounter.initiation?.protocol
    ? injectionInitiationConfig(encounter.initiation.protocol, encounter.medicationKey)
    : null;
  const doseOptions = medication
    ? encounter.intervalKey
      ? allowedDosesForInterval(medication, encounter.intervalKey)
      : medication.doses
    : [];
  const allowedSites = evaluation?.output.allowedSites?.length
    ? evaluation.output.allowedSites
    : [...ALL_INJECTION_SITES];
  const recommendedSite = evaluation?.output.recommendedSite ?? "";

  // The dose-history grid — the most recognisably-MAR artifact, and the one
  // that makes LAI site rotation legible at a glance. Read-only, and read
  // through the typed repository rather than reaching into localStorage: it
  // is the same store the live app already writes on every completed
  // administration, so this shows real history, not a placeholder.
  const doseHistory = useMemo(() => {
    const result = new SiteHistoryRepository(browserSafeStorage()).list(
      encounter.patient.name,
      encounter.patient.dob,
    );
    return result.ok ? [...result.value].reverse() : [];
  }, [encounter.patient.name, encounter.patient.dob]);
  const repeatsPreviousSite = evaluation?.output.repeatsPreviousSite ?? false;
  const safetyTriggers = INJECTION_SAFETY_TRIGGERS.filter(
    (trigger) =>
      !trigger.medications ||
      (encounter.medicationKey !== "" && trigger.medications.includes(encounter.medicationKey)),
  );
  const activeSafetyConcerns = new Set(encounter.activeSafetyConcerns ?? []);

  const administered = encounter.disposition.kind === "administered";

  const stops = evaluation?.stops ?? [];
  const stopsByTab = new Map<InjectionTab, number>();
  stops.forEach((stop) => {
    const stopTab = tabForInjectionField(stop.field);
    stopsByTab.set(stopTab, (stopsByTab.get(stopTab) ?? 0) + 1);
  });

  return (
    <div class="wfp-panel cd2004-print-exclude" ref={previewRef} tabIndex={-1}>
      <div class="wfp-summary-bar">
        <strong>Injection encounter</strong>
        <StatusFlag
          idle={(evaluation?.readiness ?? "idle") === "idle"}
          stopCount={stops.length}
          warningCount={evaluation?.warnings.length ?? 0}
        />
        <span class="wfp-summary-spacer" />
        <button
          type="button"
          class="cd2004-link-button"
          onClick={() =>
            patch({ patient: { name: activePatient.name ?? "", dob: activePatient.dob ?? "" } })
          }
          disabled={locked || (!activePatient.name?.trim() && !activePatient.dob?.trim())}
        >
          Use current patient
        </button>
        <button
          type="button"
          class="cd2004-link-button"
          onClick={() => {
            if (staffSignInValue) patch({ administeredBy: staffSignInValue });
          }}
          disabled={locked || !staffSignInValue}
        >
          Use signed-in staff
        </button>
        <button
          type="button"
          class="cd2004-command-button"
          onClick={() => clickLegacyControl("addLog")}
          disabled={locked}
        >
          Add to log
        </button>
      </div>

      <div class="wfp-tabbar" role="tablist">
        {INJECTION_TABS.map(([key, label]) => {
          const tabStopCount = stopsByTab.get(key) ?? 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              class="wfp-tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
              {tabStopCount > 0 && (
                <span class="wfp-tab-badge" aria-hidden="true">
                  {tabStopCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {locked && (
        <div class="wfp-summary-bar">
          <span class="wfp-status-flag is-idle">Record locked</span>
          <span>This encounter is completed and read-only. Use a dated addendum to add follow-up documentation.</span>
        </div>
      )}

      {!locked && stops.length > 0 && (
        <div class="wfp-section wfp-issue-section">
          <div class="wfp-section-head">
            Outstanding requirements
            <span class="wfp-tab-badge">{stops.length}</span>
          </div>
          <div class="wfp-issue-list">
            {stops.map((stop) => {
              const stopTab = tabForInjectionField(stop.field);
              return (
                <button
                  key={`${stop.code}-${stop.field ?? ""}`}
                  type="button"
                  class="wfp-issue-row"
                  onClick={() => setTab(stopTab)}
                >
                  <span class="wfp-issue-tab">{INJECTION_TAB_LABELS[stopTab]}</span>
                  <span class="wfp-issue-message">{stop.message}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <fieldset disabled={locked} style="border:none;padding:0;margin:0;display:contents">

      {tab === "order" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Patient &amp; ordering provider</div>
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
                    onInput={(event) => patchPatient({ dob: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Ordering provider" hint="required">
                  <input
                    value={encounter.orderingProvider}
                    placeholder="Provider name"
                    onInput={(event) => patch({ orderingProvider: event.currentTarget.value })}
                  />
                </Field>
              </div>
              <Field label="Verified active-order purpose" hint="optional; do not enter a diagnosis unless ordered/documented">
                <input
                  value={encounter.details?.purpose ?? ""}
                  placeholder="Encounter context from the active order"
                  onInput={(event) => patchDetails({ purpose: event.currentTarget.value })}
                />
              </Field>
              <Field label="Visit reason">
                <OptionList<InjectionReason>
                  name="inj-reason"
                  value={encounter.reason}
                  onChange={(value) => patch({ reason: value })}
                  options={INJECTION_REASON_OPTIONS}
                  inline
                />
              </Field>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Ordered medication</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Drug" hint="required">
                  <select
                    name="inj-medication"
                    value={encounter.medicationKey}
                    onChange={(event) =>
                      onMedicationChange(event.currentTarget.value as InjectionMedicationKey | "")
                    }
                  >
                    <option value="">Select medication</option>
                    {Object.values(INJECTION_MEDICATIONS).map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {encounter.medicationKey === "other" && (
                  <Field label="Medication name" hint="required for Other">
                    <input
                      value={encounter.customMedication ?? ""}
                      placeholder="Drug name"
                      onInput={(event) => patch({ customMedication: event.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field label="Dose" hint="required">
                  {encounter.medicationKey === "other" ? (
                    <input
                      name="inj-dose"
                      value={encounter.dose}
                      placeholder="Exact ordered dose"
                      onInput={(event) => patch({ dose: event.currentTarget.value })}
                    />
                  ) : (
                    <select
                      name="inj-dose"
                      value={encounter.dose}
                      onChange={(event) => patch({ dose: event.currentTarget.value })}
                    >
                      <option value="">Select dose</option>
                      {doseOptions.map((dose) => (
                        <option key={dose} value={dose}>
                          {dose}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Route">
                  <input
                    name="inj-route"
                    value={encounter.route}
                    placeholder="IM / SubQ"
                    onInput={(event) => patch({ route: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Interval">
                  <select
                    name="inj-interval"
                    value={encounter.intervalKey}
                    onChange={(event) =>
                      patch({ intervalKey: event.currentTarget.value as InjectionIntervalKey | "" })
                    }
                  >
                    <option value="">Select interval</option>
                    {INJECTION_INTERVAL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Needle / technique" hint="editable">
                <input
                  value={encounter.technique ?? ""}
                  placeholder="Needle gauge, length, or technique note"
                  onInput={(event) => patch({ technique: event.currentTarget.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Schedule &amp; next dose</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Prior dose" hint="optional">
                  <input
                    type="date"
                    value={encounter.priorDoseDate}
                    onInput={(event) => patch({ priorDoseDate: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Prior site" hint="optional">
                  <select
                    value={encounter.priorSite ?? ""}
                    onChange={(event) => patch({ priorSite: event.currentTarget.value })}
                  >
                    <option value="">—</option>
                    {ALL_INJECTION_SITES.map((site) => (
                      <option key={site} value={site}>
                        {site}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Administered">
                  <input
                    type="date"
                    value={encounter.administrationDate}
                    onInput={(event) => patch({ administrationDate: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Next dose" hint="required">
                  <input
                    type="date"
                    value={encounter.nextDoseDate}
                    onInput={(event) => patch({ nextDoseDate: event.currentTarget.value })}
                  />
                </Field>
              </div>
              {/* The due line a MAR carries: how long since the last dose and
                  what window this one falls in. Every value here is read
                  straight off the engine's own timing evaluation — this
                  surfaces what it already computed and adds no gating of its
                  own. The engine raises the stop or warning itself. */}
              {evaluation && (
                <dl class={`wfp-report-meta wfp-due-line is-${evaluation.output.timing.state}`}>
                  <dt>Days since prior</dt>
                  <dd>
                    {evaluation.output.timing.daysSincePrior === null
                      ? "—"
                      : `${evaluation.output.timing.daysSincePrior} day(s)`}
                  </dd>
                  {evaluation.output.timing.earliestDay !== null &&
                    evaluation.output.timing.latestDay !== null && (
                      <>
                        <dt>Permitted window</dt>
                        <dd>
                          Day {evaluation.output.timing.earliestDay}–
                          {evaluation.output.timing.latestDay}
                        </dd>
                      </>
                    )}
                  <dt>Timing</dt>
                  <dd>{evaluation.output.timing.message}</dd>
                </dl>
              )}
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">
              Dose history
              {doseHistory.length > 0 && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">{doseHistory.length}</span>
              )}
            </div>
            <div class="wfp-section-body">
              {doseHistory.length === 0 ? (
                <p class="wfp-field-hint">
                  No prior administrations recorded for this patient on this workstation.
                </p>
              ) : (
                <div class="wfp-grid wfp-grid-mar">
                  <div class="wfp-grid-head">
                    <span>Date</span>
                    <span>Medication</span>
                    <span>Route</span>
                    <span>Site</span>
                  </div>
                  {doseHistory.map((entry) => (
                    <div class="wfp-grid-row" key={`${entry.fingerprint}${entry.storedAt}`}>
                      <span class="wfp-grid-cell mono">{entry.date}</span>
                      <span class="wfp-grid-cell">
                        {INJECTION_MEDICATIONS[entry.medKey as InjectionMedicationKey]?.label ??
                          entry.medKey}
                      </span>
                      <span class="wfp-grid-cell">{entry.route}</span>
                      <span class="wfp-grid-cell">{entry.site}</span>
                    </div>
                  ))}
                </div>
              )}
              <p class="wfp-field-hint">
                Read-only rotation history from this workstation's local records. It informs site
                selection; it never gates it.
              </p>
            </div>
          </div>

          {initiationOptions.length > 0 && (
            <div class="wfp-section">
              <div class="wfp-section-head">Initiation &amp; paired-injection path</div>
              <div class="wfp-section-body">
                <p class="wfp-field-hint">
                  Select a path only when today is an initiation, restart, or Day 8 initiation encounter. Leaving
                  it unselected preserves the routine-maintenance workflow.
                </p>
                <div class="wfp-option-list">
                  {initiationOptions.map((option) => (
                    <label
                      key={option.id}
                      class={`wfp-option-row ${encounter.initiation?.protocol === option.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="inj-initiation"
                        checked={encounter.initiation?.protocol === option.id}
                        onChange={() =>
                          patch({
                            initiation: { ...emptyInjectionInitiation(), protocol: option.id },
                          })
                        }
                      />
                      <span>
                        <span class="wfp-option-title">{option.title}</span>
                        <div class="wfp-option-desc">{option.sub}</div>
                      </span>
                    </label>
                  ))}
                </div>
                {encounter.initiation?.protocol && (
                  <button
                    type="button"
                    class="cd2004-link-button"
                    onClick={() => patch({ initiation: emptyInjectionInitiation() })}
                  >
                    Clear initiation selection
                  </button>
                )}

                {initiationConfig && (
                  <div class="wfp-section">
                    <div class="wfp-section-head">{initiationConfig.title}</div>
                    <div class="wfp-section-body">
                      <p class="wfp-field-hint">{initiationConfig.summary}</p>
                      <div class="wfp-checkbox-row">
                        <input
                          type="checkbox"
                          id="init-plan-verified"
                          checked={encounter.initiation?.planVerified ?? false}
                          onChange={(event) => patchInitiation({ planVerified: event.currentTarget.checked })}
                        />
                        <label for="init-plan-verified">
                          Active provider initiation/re-initiation order and current product information verified
                          for this encounter
                        </label>
                      </div>

                      {initiationConfig.kind === "dual" && (
                        <>
                          {initiationConfig.secondaryProduct && (
                            <p class="wfp-field-hint">
                              <strong>Component 2 — {initiationConfig.secondaryProduct.replace(/^Injection 2\s*—\s*/, "")}</strong>
                            </p>
                          )}
                          <div class="wfp-row">
                            <Field label="Component 2 — dose">
                              <input
                                value={encounter.initiation?.second.dose ?? ""}
                                placeholder="Per active order"
                                onInput={(event) => patchInitiationSecond({ dose: event.currentTarget.value })}
                              />
                            </Field>
                            <Field label="Component 2 — site">
                              <select
                                value={encounter.initiation?.second.site ?? ""}
                                onChange={(event) => patchInitiationSecond({ site: event.currentTarget.value })}
                              >
                                <option value="">Select site</option>
                                {injectionInitiationSecondarySites().map((site) => (
                                  <option key={site} value={site}>
                                    {site}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Component 2 — NDC">
                              <input
                                class="mono"
                                value={encounter.initiation?.second.ndc ?? ""}
                                onInput={(event) => patchInitiationSecond({ ndc: event.currentTarget.value })}
                              />
                            </Field>
                            <Field label="Component 2 — Lot">
                              <input
                                class="mono"
                                value={encounter.initiation?.second.lot ?? ""}
                                onInput={(event) => patchInitiationSecond({ lot: event.currentTarget.value })}
                              />
                            </Field>
                            <Field label="Component 2 — Exp">
                              <input
                                class="mono"
                                type="month"
                                value={encounter.initiation?.second.expiration ?? ""}
                                onInput={(event) =>
                                  patchInitiationSecond({ expiration: event.currentTarget.value })
                                }
                              />
                            </Field>
                          </div>
                          <p class="wfp-field-hint">{initiationConfig.secondaryGuide}</p>
                          <div class="wfp-checkbox-row">
                            <input
                              type="checkbox"
                              id="init-second-order"
                              checked={encounter.initiation?.second.orderVerified ?? false}
                              onChange={(event) =>
                                patchInitiationSecond({ orderVerified: event.currentTarget.checked })
                              }
                            />
                            <label for="init-second-order">
                              Exact product and dose verified against the active order
                            </label>
                          </div>
                          <div class="wfp-checkbox-row">
                            <input
                              type="checkbox"
                              id="init-second-given"
                              checked={encounter.initiation?.second.given ?? false}
                              onChange={(event) => patchInitiationSecond({ given: event.currentTarget.checked })}
                            />
                            <label for="init-second-given">
                              Injection component 2 was actually administered today
                            </label>
                          </div>
                          <Field label="Component 2 note" hint="optional">
                            <input
                              value={encounter.initiation?.second.note ?? ""}
                              onInput={(event) => patchInitiationSecond({ note: event.currentTarget.value })}
                            />
                          </Field>
                          <Field label={initiationConfig.oralLabel}>
                            <OptionList<"" | "administered" | "verified">
                              name="init-oral"
                              value={encounter.initiation?.oralStatus ?? ""}
                              onChange={(value) => patchInitiation({ oralStatus: value })}
                              options={[
                                { key: "administered", label: "Administered today" },
                                { key: "verified", label: "Verified in active record / eMAR" },
                              ]}
                              inline
                            />
                          </Field>
                        </>
                      )}

                      {initiationConfig.kind === "oral" && (
                        <Field label={initiationConfig.oralLabel}>
                          <OptionList<"" | "administered" | "verified">
                            name="init-oral"
                            value={encounter.initiation?.oralStatus ?? ""}
                            onChange={(value) => patchInitiation({ oralStatus: value })}
                            options={[
                              { key: "administered", label: "Administered today" },
                              { key: "verified", label: "Verified in active record / eMAR" },
                            ]}
                            inline
                          />
                        </Field>
                      )}

                      {initiationConfig.kind === "provider" && (
                        <Field label="Provider-directed initiation / re-initiation instruction" hint="required">
                          <textarea
                            value={encounter.initiation?.providerNote ?? ""}
                            placeholder="Concise active order, timing plan, and any provider/pharmacist direction"
                            onInput={(event) => patchInitiation({ providerNote: event.currentTarget.value })}
                          />
                        </Field>
                      )}

                      {(initiationConfig.kind === "sustenna-day1" || initiationConfig.kind === "sustenna-day8") && (
                        <>
                          <Field label="Ordered initiation category" hint="required">
                            <OptionList<"" | "standard" | "mild" | "other">
                              name="init-sustenna-order"
                              value={encounter.initiation?.sustennaOrder ?? ""}
                              onChange={(value) => patchInitiation({ sustennaOrder: value })}
                              options={[
                                { key: "standard", label: "Standard order" },
                                { key: "mild", label: "Mild renal order" },
                                { key: "other", label: "Other provider order" },
                              ]}
                              inline
                            />
                          </Field>
                          {initiationConfig.kind === "sustenna-day8" && (
                            <Field label="Documented Day 1 date" hint="required">
                              <input
                                type="date"
                                value={encounter.initiation?.day1Date ?? ""}
                                onInput={(event) => patchInitiation({ day1Date: event.currentTarget.value })}
                              />
                            </Field>
                          )}
                          <p class="wfp-field-hint">
                            Order cross-check only. This tool never determines dose, renal adjustment, or
                            re-initiation regimens. Both initiation injections require a documented deltoid site.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "administration" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">
              Administration site
              {recommendedSite && (
                <span class="wfp-tab-badge wfp-tab-badge-muted">rotate: {recommendedSite}</span>
              )}
            </div>
            <div class="wfp-section-body">
              {repeatsPreviousSite && (
                <p class="wfp-field-hint">
                  Today's selected site repeats the prior documented site; consider rotation when clinically
                  appropriate.
                </p>
              )}
              <div class="wfp-option-list">
                {allowedSites.map((site) => (
                  <label key={site} class={`wfp-option-row ${encounter.site === site ? "is-selected" : ""}`}>
                    <input type="radio" name="inj-site" checked={encounter.site === site} onChange={() => patch({ site })} />
                    <span>
                      <span class="wfp-option-title">{site}</span>
                      {site === recommendedSite && <div class="wfp-option-desc">Suggested rotation site</div>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Given by / time</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Administered by" hint="required">
                  <input
                    value={encounter.administeredBy}
                    placeholder="J. Doe, LVN"
                    onInput={(event) => patch({ administeredBy: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Actual administration time" hint="required">
                  <input
                    type="time"
                    value={encounter.administrationTime}
                    onInput={(event) => patch({ administrationTime: event.currentTarget.value })}
                  />
                </Field>
                {encounter.initiation?.protocol && (
                  <Field label="Component 2 actual time" hint="required for paired protocols">
                    <input
                      type="time"
                      value={encounter.secondAdministrationTime ?? ""}
                      onInput={(event) => patch({ secondAdministrationTime: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>

              <div class="wfp-section-head">Dose delivered &amp; device</div>
              <div class="wfp-row">
                <Field label="Administration amount" hint="optional">
                  <input
                    value={encounter.details?.volume ?? ""}
                    placeholder="e.g., 2"
                    onInput={(event) => patchDetails({ volume: event.currentTarget.value })}
                  />
                </Field>
                <Field label="Unit">
                  <select
                    value={encounter.details?.volumeUnit ?? ""}
                    onChange={(event) => patchDetails({ volumeUnit: event.currentTarget.value })}
                  >
                    <option value="">Select unit</option>
                    <option value="mL">mL (volume)</option>
                    <option value="mg">mg (dose amount)</option>
                  </select>
                </Field>
                <Field label="Delivery device" hint="optional">
                  <select
                    value={encounter.details?.device ?? ""}
                    onChange={(event) => patchDetails({ device: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Needle and syringe">Needle and syringe</option>
                    <option value="Prefilled syringe">Prefilled syringe</option>
                    <option value="Autoinjector">Autoinjector</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                {encounter.details?.device === "Other" && (
                  <Field label="Device detail" hint="required">
                    <input
                      value={encounter.details?.deviceOther ?? ""}
                      onInput={(event) => patchDetails({ deviceOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field label="Site condition" hint="optional">
                  <select
                    value={encounter.details?.siteCondition ?? ""}
                    onChange={(event) => patchDetails({ siteCondition: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Skin/site intact before administration">
                      Skin/site intact before administration
                    </option>
                    <option value="Other">Other finding / condition</option>
                  </select>
                </Field>
                {encounter.details?.siteCondition === "Other" && (
                  <Field label="Site condition detail" hint="required">
                    <input
                      value={encounter.details?.siteConditionOther ?? ""}
                      onInput={(event) => patchDetails({ siteConditionOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "product" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Lot &amp; traceability</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="NDC" hint="required">
                  <input
                    class="mono"
                    value={encounter.traceability.ndc}
                    placeholder="00000-0000-00"
                    onInput={(event) =>
                      patch({ traceability: { ...encounter.traceability, ndc: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="Lot #" hint="required">
                  <input
                    class="mono"
                    value={encounter.traceability.lot}
                    placeholder="LOT123"
                    onInput={(event) =>
                      patch({ traceability: { ...encounter.traceability, lot: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="Exp" hint="required">
                  <input
                    class="mono"
                    type="month"
                    value={encounter.traceability.expiration}
                    onInput={(event) =>
                      patch({
                        traceability: { ...encounter.traceability, expiration: event.currentTarget.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Product handling &amp; trace exceptions</div>
            <div class="wfp-section-body">
              <div class="wfp-row">
                <Field label="Medication source" hint="optional">
                  <select
                    value={encounter.details?.productSource ?? ""}
                    onChange={(event) => patchDetails({ productSource: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Clinic stock">Clinic stock</option>
                    <option value="Patient-supplied medication">Patient-supplied medication</option>
                    <option value="Specialty-pharmacy shipment">Specialty-pharmacy shipment</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                {encounter.details?.productSource === "Other" && (
                  <Field label="Medication source detail" hint="required">
                    <input
                      value={encounter.details?.productSourceOther ?? ""}
                      onInput={(event) => patchDetails({ productSourceOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
                <Field label="Preparation / reconstitution" hint="optional">
                  <select
                    value={encounter.details?.preparation ?? ""}
                    onChange={(event) => patchDetails({ preparation: event.currentTarget.value })}
                  >
                    <option value="">Not separately documented</option>
                    <option value="Preparation/reconstitution verified per current product instructions">
                      Verified per current product instructions
                    </option>
                    <option value="Other">Other preparation / reconstitution detail</option>
                  </select>
                </Field>
                {encounter.details?.preparation === "Other" && (
                  <Field label="Preparation detail" hint="required">
                    <input
                      value={encounter.details?.preparationOther ?? ""}
                      onInput={(event) => patchDetails({ preparationOther: event.currentTarget.value })}
                    />
                  </Field>
                )}
              </div>
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-waste-toggle"
                  checked={encounter.details?.waste ?? false}
                  onChange={(event) => patchDetails({ waste: event.currentTarget.checked })}
                />
                <label for="inj-waste-toggle">Document medication waste</label>
              </div>
              {encounter.details?.waste && (
                <div class="wfp-row">
                  <Field label="Waste amount / unit" hint="required">
                    <input
                      value={encounter.details?.wasteAmount ?? ""}
                      placeholder="e.g., 0.4 mL"
                      onInput={(event) => patchDetails({ wasteAmount: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Waste witness" hint="required">
                    <input
                      value={encounter.details?.wasteWitness ?? ""}
                      placeholder="Name / initials"
                      onInput={(event) => patchDetails({ wasteWitness: event.currentTarget.value })}
                    />
                  </Field>
                </div>
              )}
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-issue-toggle"
                  checked={encounter.details?.productIssue ?? false}
                  onChange={(event) => patchDetails({ productIssue: event.currentTarget.checked })}
                />
                <label for="inj-issue-toggle">Document product or device issue</label>
              </div>
              {encounter.details?.productIssue && (
                <>
                  <Field label="Product / device issue" hint="required">
                    <textarea
                      value={encounter.details?.productIssueDetail ?? ""}
                      onInput={(event) => patchDetails({ productIssueDetail: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Immediate action / product disposition" hint="required">
                    <textarea
                      value={encounter.details?.productIssueAction ?? ""}
                      onInput={(event) => patchDetails({ productIssueAction: event.currentTarget.value })}
                    />
                  </Field>
                  <div class="wfp-row">
                    <Field label="Recipient notified" hint="required">
                      <input
                        value={encounter.details?.productIssueRecipient ?? ""}
                        onInput={(event) => patchDetails({ productIssueRecipient: event.currentTarget.value })}
                      />
                    </Field>
                    <Field label="Notification / decision time" hint="required">
                      <input
                        type="datetime-local"
                        value={encounter.details?.productIssueNotificationTime ?? ""}
                        onInput={(event) =>
                          patchDetails({ productIssueNotificationTime: event.currentTarget.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Direction received" hint="required">
                    <textarea
                      value={encounter.details?.productIssueDirection ?? ""}
                      onInput={(event) => patchDetails({ productIssueDirection: event.currentTarget.value })}
                    />
                  </Field>
                  <Field label="Next step / owner / timing" hint="required">
                    <textarea
                      value={encounter.details?.productIssueNextStep ?? ""}
                      onInput={(event) => patchDetails({ productIssueNextStep: event.currentTarget.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "verification" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Verification &amp; safety</div>
            <div class="wfp-section-body">
              <CheckList
                items={INJECTION_ATTESTATION_OPTIONS}
                checked={(key) => Boolean(encounter.attestations[key as keyof InjectionEncounter["attestations"]])}
                onToggle={toggleAttestation}
              />
              {medication && medication.verifications.length > 0 && (
                <>
                  <div class="wfp-section-head">{medication.label} safety</div>
                  <CheckList
                    items={medication.verifications.map((key) => ({
                      key,
                      label: verificationLabels[key],
                    }))}
                    checked={(key) =>
                      Boolean(encounter.verifications[key as MedicationVerificationKey])
                    }
                    onToggle={toggleVerification}
                  />
                </>
              )}
              <div class="wfp-row">
                <Field label="Allergy status" hint="required">
                  <input
                    value={encounter.allergies}
                    placeholder="Verify in active record; enter NKDA only if confirmed"
                    onInput={(event) => patch({ allergies: event.currentTarget.value })}
                  />
                </Field>
                <Field label="BP">
                  <input
                    value={encounter.vitals?.bp ?? ""}
                    placeholder="124/78"
                    onInput={(event) =>
                      patch({ vitals: { ...encounter.vitals, bp: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="HR">
                  <input
                    value={encounter.vitals?.hr ?? ""}
                    placeholder="72"
                    onInput={(event) =>
                      patch({ vitals: { ...encounter.vitals, hr: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="Temp">
                  <input
                    value={encounter.vitals?.temperature ?? ""}
                    placeholder="98.6"
                    onInput={(event) =>
                      patch({ vitals: { ...encounter.vitals, temperature: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="RR" hint="optional">
                  <input
                    value={encounter.vitals?.rr ?? ""}
                    onInput={(event) =>
                      patch({ vitals: { ...encounter.vitals, rr: event.currentTarget.value } })
                    }
                  />
                </Field>
                <Field label="SpO2" hint="optional">
                  <input
                    value={encounter.vitals?.spo2 ?? ""}
                    onInput={(event) =>
                      patch({ vitals: { ...encounter.vitals, spo2: event.currentTarget.value } })
                    }
                  />
                </Field>
              </div>
              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-safety-none"
                  checked={encounter.acuteSafetyScreenConfirmed}
                  onChange={(event) => patch({ acuteSafetyScreenConfirmed: event.currentTarget.checked })}
                />
                <label for="inj-safety-none">No acute concerns today confirmed</label>
              </div>
              {safetyTriggers.length > 0 && (
                <>
                  <div class="wfp-section-head">Provider review triggers</div>
                  <CheckList
                    items={safetyTriggers.map((trigger) => ({
                      key: trigger.key,
                      label: trigger.label,
                      description: trigger.description,
                    }))}
                    checked={(key) => activeSafetyConcerns.has(key)}
                    onToggle={toggleSafetyConcern}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "outcome" && (
        <div class="wfp-tabpanel" role="tabpanel">
          <div class="wfp-section">
            <div class="wfp-section-head">Response &amp; follow-up</div>
            <div class="wfp-section-body">
              <Field label="Patient response">
                <OptionList<InjectionResponse["kind"]>
                  name="inj-response"
                  value={encounter.response.kind}
                  onChange={(value) => patch({ response: { ...encounter.response, kind: value } })}
                  options={INJECTION_RESPONSE_OPTIONS}
                  inline
                />
              </Field>
              {encounter.response.kind === "custom" && (
                <Field label="Describe response">
                  <input
                    value={encounter.response.custom ?? ""}
                    onInput={(event) =>
                      patch({ response: { ...encounter.response, custom: event.currentTarget.value } })
                    }
                  />
                </Field>
              )}

              <div class="wfp-checkbox-row">
                <input
                  type="checkbox"
                  id="inj-exception-toggle"
                  checked={encounter.details?.administrationException ?? false}
                  onChange={(event) => patchDetails({ administrationException: event.currentTarget.checked })}
                />
                <label for="inj-exception-toggle">
                  Administration exception / escalation — use only when something changed after or during the
                  administered encounter
                </label>
              </div>
              {encounter.details?.administrationException && (
                <>
                  <Field label="What changed / what was observed" hint="required">
                    <textarea
                      value={encounter.details?.exceptionSummary ?? ""}
                      onInput={(event) => patchDetails({ exceptionSummary: event.currentTarget.value })}
                    />
                  </Field>
                  <div class="wfp-row">
                    <Field label="Recipient notified" hint="required">
                      <input
                        value={encounter.details?.exceptionRecipient ?? ""}
                        onInput={(event) => patchDetails({ exceptionRecipient: event.currentTarget.value })}
                      />
                    </Field>
                    <Field label="Notification / decision time" hint="required">
                      <input
                        type="datetime-local"
                        value={encounter.details?.exceptionTime ?? ""}
                        onInput={(event) => patchDetails({ exceptionTime: event.currentTarget.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Direction, action, and next step" hint="required">
                    <textarea
                      value={encounter.details?.exceptionOutcome ?? ""}
                      onInput={(event) => patchDetails({ exceptionOutcome: event.currentTarget.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Clinical disposition</div>
            <div class="wfp-section-body">
              <p class="wfp-field-hint">
                Use the checked routine review items as a fast review-by-exception sheet, then make one final
                documentation choice. An administration note and AVS remain unavailable until a complete
                administration is documented.
              </p>
              <div class="wfp-option-list wfp-option-list-inline">
                {(
                  [
                    ["administered", "Review complete — document administration"],
                    ["held", "Held"],
                    ["escalated", "Escalated"],
                    ["provider", "Provider-directed plan"],
                  ] as Array<[InjectionDisposition["kind"], string]>
                ).map(([kind, label]) => (
                  <label
                    key={kind}
                    class={`wfp-option-row ${encounter.disposition.kind === kind ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="inj-disposition"
                      checked={encounter.disposition.kind === kind}
                      onChange={() => patchDisposition({ kind })}
                    />
                    <span class="wfp-option-title">{label}</span>
                  </label>
                ))}
              </div>
              {encounter.disposition.kind && encounter.disposition.kind !== "administered" && (
                <div class="wfp-section">
                  <div class="wfp-section-head">Required handoff details</div>
                  <div class="wfp-section-body">
                    <div class="wfp-row">
                      <Field label="Provider / recipient" hint="required">
                        <input
                          value={encounter.disposition.provider ?? ""}
                          placeholder="Name and role"
                          onInput={(event) => patchDisposition({ provider: event.currentTarget.value })}
                        />
                      </Field>
                      <Field label="Contact / decision time" hint="required">
                        <input
                          type="datetime-local"
                          value={encounter.disposition.time ?? ""}
                          onInput={(event) => patchDisposition({ time: event.currentTarget.value })}
                        />
                      </Field>
                    </div>
                    <Field label="Direction / outcome" hint="required">
                      <textarea
                        value={encounter.disposition.outcome ?? ""}
                        placeholder="Concise direction, follow-up, and where responsibility was handed off"
                        onInput={(event) => patchDisposition({ outcome: event.currentTarget.value })}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div class="wfp-section">
            <div class="wfp-section-head">Administration note</div>
            <div class="wfp-section-body">
              <div class="wfp-preview">{noteText || "Document the encounter to build the note."}</div>
              <div class="wfp-actions">
                <button
                  type="button"
                  class="cd2004-command-button"
                  onClick={() => clickLegacyControl("printAVS")}
                  disabled={!administered}
                >
                  Print AVS
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("injWorksheetPrint")}
                >
                  Print injection worksheet
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => clickLegacyControl("injWorksheetBlank")}
                >
                  Blank worksheet
                </button>
                <button
                  type="button"
                  class="cd2004-link-button"
                  onClick={() => navigator.clipboard?.writeText(noteText)}
                  disabled={!noteText}
                >
                  Copy Tebra blocks
                </button>
              </div>
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
              Read-only completed record. The original encounter snapshot is locked. Add a dated addendum
              instead of changing the completed documentation.
            </p>
            {addenda.map((entry, index) => (
              <div class="wfp-preview" key={index}>
                <strong>{entry.author || "Staff"}</strong>
                <br />
                {entry.text}
              </div>
            ))}
            <Field label="Addendum entered by">
              <input
                value={addendumAuthor}
                placeholder="Current staff name or initials"
                onInput={(event) => onAddendumAuthorChange(event.currentTarget.value)}
              />
            </Field>
            <Field label="Dated addendum">
              <textarea
                value={addendumText}
                placeholder="Clarification, correction, or follow-up. The original completed record remains unchanged."
                onInput={(event) => onAddendumTextChange(event.currentTarget.value)}
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

      <p class="wfp-field-hint">
        Drug defaults &amp; windows are editable guidance — verify against the active Rx, current PI, and site
        protocol.
      </p>
    </div>
  );
}
