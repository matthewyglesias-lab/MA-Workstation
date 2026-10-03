import { useEffect, useRef, useState } from "preact/hooks";
import type { Actor, Overview } from "../shared/contracts.js";
import type {
  InjectionCase,
  InjectionInput,
  InjectionAssessment,
} from "../shared/injections.js";
import { request } from "./api.js";
import {
  emptyWorkstationState,
  type WorkstationState,
} from "../shared/workstation-contracts.js";
import {
  buildWorkstationEncounter,
  workstationStateForRecord,
} from "../shared/workstation-bridge.js";
import {
  evaluateWorkstationClinical,
  workstationSchedule,
} from "../shared/workstation-clinical-policy.js";
import { injectionResponseNote } from "../shared/workstation/domain/injection.js";
import { WorkstationEngineFields } from "./WorkstationEngineFields.js";
import { WorkstationEngineSummary } from "./WorkstationEngineSummary.js";
import { getInjectionReference } from "../shared/injection-catalog.js";
import { getInjectionGuidance } from "../shared/injection-guidance.js";
import {
  getInjectionReviewChecks,
  reviewIssues,
} from "../shared/injection-readiness.js";
import {
  InjectionAssessmentFields,
  InjectionPreparationGuide,
  InjectionFollowUpFields,
} from "./InjectionAssessmentFields.js";
import { InjectionOrderContext } from "./InjectionOrderContext.js";
import { Badge, ErrorText, Field, Icon, dateLabel } from "./components.js";
import {
  clinicDay,
  clinicInputToIso,
  clinicLocalInput,
  momentLabel,
} from "./injection-time.js";
export type InjectionAction =
  | "create"
  | "edit"
  | "review"
  | "administer"
  | "hold"
  | "cancel"
  | "amend"
  | "file";
const titles: Record<InjectionAction, string> = {
  create: "New injection",
  edit: "Review order",
  review: "Safety review",
  administer: "Record administration",
  hold: "Hold injection",
  cancel: "Cancel injection",
  amend: "Add addendum",
  file: "Confirm Tebra filing",
};
const submitLabels: Record<InjectionAction, string> = {
  create: "Save order",
  edit: "Save order",
  review: "Complete review & reserve stock",
  administer: "Save administration",
  hold: "Place on hold",
  cancel: "Cancel injection",
  amend: "Save addendum",
  file: "Confirm filed",
};
const unusedRouteSiteConfirmation =
  "Route/site confirmation: No route or site was used.";
export function InjectionDialog({
  action,
  record,
  patientId,
  cases = [],
  data,
  actor,
  timezone,
  onClose,
  onSaved,
}: {
  action: InjectionAction;
  record?: InjectionCase;
  patientId?: string;
  cases?: InjectionCase[];
  data: Overview;
  actor: Actor;
  timezone: string;
  onClose: () => void;
  onSaved: (record: InjectionCase) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const [workstation, setWorkstation] = useState<WorkstationState>(() => {
    const state = structuredClone(
      record
        ? workstationStateForRecord(record) || emptyWorkstationState()
        : emptyWorkstationState(),
    );
    if (["edit", "review"].includes(action)) {
      state.attestations = {};
      state.verifications = {};
      state.acuteSafetyScreenConfirmed = false;
      state.activeSafetyConcerns = [];
      state.response = { kind: "" };
      state.initiation.planVerified = false;
      state.initiation.oralStatus = "";
      state.oral = undefined;
      state.details = { nextDose: state.details.nextDose };
      state.habitus = undefined;
      state.technique = "";
    }
    return state;
  });
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patient, setPatient] = useState(record?.patientId || patientId || "");
  const [product, setProduct] = useState(record?.productId || "");
  const [route, setRoute] = useState(record?.route || "");
  const [doseUnit, setDoseUnit] = useState(record?.doseUnit || "");
  const [timing, setTiming] = useState(record?.timingCategory || "unknown");
  const [vitalsStatus, setVitalsStatus] = useState("recorded");
  const [delivery, setDelivery] = useState("");
  const [noRouteSiteUsed, setNoRouteSiteUsed] = useState(false);
  const [replacePriorTime, setReplacePriorTime] = useState(false);
  const [unknownDose, setUnknownDose] = useState(false);
  const [atNow, setAtNow] = useState(
    workstation.recordingMode !== "retrospective",
  );
  const [lotId, setLotId] = useState("");
  const [stockUnits, setStockUnits] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const attempt = useRef<{ payload: string; key: string }>();
  const administrationInstant = useRef<{
    fingerprint: string;
    value: string;
  }>();
  const chosenPatient = data.patients.find((p) => p.id === patient);
  const chosenProduct = data.products.find((p) => p.id === product);
  const confirmedUnusedRouteSite =
    delivery === "not_delivered" && noRouteSiteUsed;
  const routeSiteConfirmationPrefix = confirmedUnusedRouteSite
    ? `${unusedRouteSiteConfirmation}\n\n`
    : "";
  const medicationReference = getInjectionReference(chosenProduct?.name || "");
  const today = clinicDay(timezone);
  const lotOptions = data.lots
    .filter(
      (l) =>
        l.productId === record?.productId &&
        l.status === "active" &&
        l.expiresOn >= today &&
        (!l.ownerPatientId || l.ownerPatientId === record.patientId) &&
        l.onHand - l.reserved >= stockUnits,
    )
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  const selectedLot = data.lots.find((l) => l.id === lotId);
  function readForm() {
    if (!formElement.current) return;
    const values = Object.fromEntries(
      Array.from(new FormData(formElement.current).entries()).map(
        ([key, value]) => [key, String(value)],
      ),
    );
    setFormValues(values);
  }
  useEffect(() => {
    dialog.current?.showModal();
    readForm();
  }, []);
  const isOrder = action === "create" || action === "edit";
  const fv = (key: string, fallback = "") => formValues[key] ?? fallback;
  const checked = (key: string) => formValues[key] === "on";
  const previewState: WorkstationState = {
    ...workstation,
    ...(action === "review"
      ? {
          technique: fv("needle"),
          attestations:
            workstation.recordingMode === "retrospective"
              ? workstation.attestations
              : {
                  ...workstation.attestations,
                  id2: checked("identity"),
                  rights: checked("order"),
                  allergy: checked("allergy"),
                  consent: checked("consent"),
                  screen: getInjectionReviewChecks(
                    chosenProduct?.name || "",
                  ).every((check) => !!fv(`screen-${check.id}`)),
                },
          details: {
            ...workstation.details,
            ...(workstation.details.lateDoseReview === "provider-authorized"
              ? {
                  lateDoseReviewProvider: fv("consultProvider"),
                  lateDoseReviewTime: fv("consultAt"),
                  lateDoseReviewNote: fv("consultInstructions"),
                }
              : {}),
          },
        }
      : {}),
  };
  const previewRecord: InjectionCase = {
    id: "preview",
    status: "draft",
    version: 1,
    review: null,
    administration: null,
    disposition: null,
    amendments: [],
    filings: [],
    handoff: "pending",
    createdAt: "",
    updatedAt: "",
    patientId: patient,
    productId: product,
    tebraOrderReference: "",
    orderingProvider: "",
    dose: 0,
    doseUnit: "mg",
    route: "IM",
    site: "",
    plannedOn: today,
    lastAdministrationAt: null,
    lastAdministrationOn: null,
    timingCategory: "unknown",
    timingPlan: "",
    nextDueOn: null,
    doseSequence: 1,
    ...record,
    ...(isOrder
      ? {
          patientId: patient,
          productId: product,
          orderingProvider: fv("provider", record?.orderingProvider),
          dose: Number(fv("dose", String(record?.dose || 0))),
          doseUnit: (doseUnit || "mg") as InjectionInput["doseUnit"],
          route: (route || "IM") as InjectionInput["route"],
          site: fv("site", record?.site),
          plannedOn: fv("planned", record?.plannedOn || today),
          timingCategory: timing as InjectionInput["timingCategory"],
          lastAdministrationOn:
            fv("lastDate", record?.lastAdministrationOn || "") || null,
          lastAdministrationAt:
            record?.lastAdministrationAt && !replacePriorTime
              ? record.lastAdministrationAt
              : null,
          nextDueOn: fv("nextDue", record?.nextDueOn || "") || null,
          clinicalContext: {
            phase: fv(
              "phase",
              record?.clinicalContext?.phase || "maintenance",
            ) as NonNullable<InjectionInput["clinicalContext"]>["phase"],
            indication: fv("indication") || null,
            schedule:
              !medicationReference && fv("scheduleUnit")
                ? {
                    every: Number(fv("scheduleEvery")),
                    unit: fv("scheduleUnit") as "days" | "weeks" | "months",
                  }
                : null,
            historySource: fv("historySource") || null,
            priorProduct: fv("priorProduct") || null,
            priorDose: fv("priorDose") || null,
            linkedPlan: fv("linkedPlan") || null,
          },
        }
      : {}),
    workstation: previewState,
  };
  if (isOrder) {
    previewRecord.review = null;
    previewRecord.administration = null;
    previewRecord.disposition = null;
    previewRecord.status = "draft";
  }
  if (action === "review" && chosenPatient && chosenProduct) {
    const n = (key: string) => (fv(key) ? Number(fv(key)) : null);
    previewRecord.review = {
      lotId,
      stockUnits,
      workstation: previewState,
      checks: {
        identity: true,
        order: true,
        allergy: true,
        medication: true,
        timing: true,
        consent: true,
      },
      allergyReview: fv("allergyReview"),
      clinicalReview: fv("clinicalReview"),
      preparation: fv("preparation"),
      siteAssessment: fv("siteAssessment"),
      observationPlan: fv("observationPlan"),
      vitals: {
        status: vitalsStatus as "recorded" | "not_recorded",
        bpSystolic: n("systolic"),
        bpDiastolic: n("diastolic"),
        pulse: n("pulse"),
        temperatureC: n("temp"),
        oxygenSaturation: n("oxygen"),
        reason: fv("vitalsReason") || null,
      },
      assessment: {
        screening: [],
        weightKg: n("weightKg"),
        needle: fv("needle") || null,
        providerCommunication: null,
        education: [],
      },
      reviewedAt: "",
      reviewedBy: "",
      patientSnapshot: chosenPatient,
      productSnapshot: chosenProduct,
      lotSnapshot: {
        lotNumber: selectedLot?.lotNumber || "",
        expiresOn: selectedLot?.expiresOn || "",
        location: selectedLot?.location || "",
        ownership: selectedLot?.ownership || "clinic",
        ownerPatientId: selectedLot?.ownerPatientId || null,
      },
      reservationMovementId: "",
    };
  } else if (previewRecord.review)
    previewRecord.review = {
      ...previewRecord.review,
      workstation: previewState,
    };
  const pairedCase = cases.find(
    (candidate) => candidate.id === previewState.pairedCaseId,
  );
  const engineEncounter = buildWorkstationEncounter(
    previewRecord,
    chosenPatient,
    chosenProduct,
    timezone,
    pairedCase,
  );
  if (action === "administer") engineEncounter.response = previewState.response;
  const engineContext = {
    today,
    indication: previewRecord.clinicalContext?.indication || undefined,
    priorMaintenanceDoses: previewState.priorMaintenanceDoses,
    priorDose: previewRecord.clinicalContext?.priorDose,
    priorProduct: previewRecord.clinicalContext?.priorProduct,
  };
  const engineEvaluation = evaluateWorkstationClinical(
    engineEncounter,
    engineContext,
  );
  function updateWorkstation(next: WorkstationState) {
    if (isOrder && next.reason !== workstation.reason) {
      const phaseInput = formElement.current?.elements.namedItem(
        "phase",
      ) as HTMLSelectElement | null;
      if (phaseInput)
        phaseInput.value =
          next.reason === "reinit"
            ? "restart"
            : next.reason === "loading"
              ? "day_1"
              : next.reason === "initiation"
                ? "initiation"
                : "maintenance";
      setTiming(
        next.reason === "reinit"
          ? "late_or_missed"
          : ["initiation", "loading"].includes(next.reason)
            ? "initiation"
            : "scheduled",
      );
    }
    if (
      ["sustenna-day1", "sustenna-day8"].includes(next.initiation.protocol) &&
      workstation.initiation.protocol !== next.initiation.protocol
    ) {
      const phaseInput = formElement.current?.elements.namedItem(
        "phase",
      ) as HTMLSelectElement | null;
      if (phaseInput)
        phaseInput.value =
          next.initiation.protocol === "sustenna-day8" ? "day_8" : "day_1";
      next.reason = "loading";
    }
    setWorkstation(next);
    setDirty(true);
    readForm();
  }
  function useReturnDate(value: string) {
    const input = formElement.current?.elements.namedItem(
      "nextDue",
    ) as HTMLInputElement | null;
    if (input) input.value = value;
    readForm();
  }
  function close() {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const val = (name: string) => String(form.get(name) || "").trim();
    const num = (name: string) => (val(name) ? Number(val(name)) : null);
    setError("");
    let body: unknown,
      path = `/injections${record ? `/${record.id}` : ""}`,
      method = "POST";
    try {
      if (action === "create" || action === "edit") {
        const preservePriorTime =
          !!record?.lastAdministrationAt && !replacePriorTime;
        const input: InjectionInput = {
          patientId: patient,
          productId: product,
          tebraOrderReference: val("reference"),
          orderingProvider: val("provider"),
          dose: Number(val("dose")),
          doseUnit: doseUnit as InjectionInput["doseUnit"],
          route: route as InjectionInput["route"],
          site: val("site"),
          plannedOn: val("planned"),
          lastAdministrationAt: preservePriorTime
            ? record!.lastAdministrationAt
            : null,
          lastAdministrationOn: preservePriorTime
            ? null
            : val("lastDate") || null,
          timingCategory: timing as InjectionInput["timingCategory"],
          timingPlan: val("timingPlan"),
          nextDueOn: val("nextDue") || null,
          doseSequence: Number(val("sequence")),
          workstation: previewState,
          clinicalContext: {
            phase: val("phase") as NonNullable<
              InjectionInput["clinicalContext"]
            >["phase"],
            indication: val("indication") || null,
            schedule:
              engineEncounter.medicationKey !== "other"
                ? workstationSchedule(engineEncounter)
                : val("scheduleUnit")
                  ? {
                      every: Number(val("scheduleEvery")),
                      unit: val("scheduleUnit") as "days" | "weeks" | "months",
                    }
                  : null,
            historySource: val("historySource") || null,
            priorProduct: val("priorProduct") || null,
            priorDose: val("priorDose") || null,
            linkedPlan: val("linkedPlan") || null,
          },
        };
        body =
          action === "edit"
            ? { ...input, expectedVersion: record!.version }
            : input;
        if (action === "edit") method = "PATCH";
      } else if (action === "review") {
        if (!lotOptions.some((l) => l.id === lotId))
          throw new Error(
            "Select an available, unexpired stock lot for this patient.",
          );
        const assessment: InjectionAssessment = {
          screening: getInjectionReviewChecks(chosenProduct?.name || "").map(
            (check) => ({
              id: check.id,
              label: check.label,
              result: val(
                `screen-${check.id}`,
              ) as InjectionAssessment["screening"][number]["result"],
              detail: val(`screen-detail-${check.id}`) || null,
            }),
          ),
          weightKg: num("weightKg"),
          needle: val("needle") || null,
          providerCommunication: val("includeProviderCommunication")
            ? {
                provider: val("consultProvider"),
                contactedAt: clinicInputToIso(val("consultAt"), timezone),
                decision: val("consultDecision") as
                  "proceed_as_ordered" | "hold" | "clarify",
                instructions: val("consultInstructions"),
                reference: val("consultReference"),
              }
            : null,
          education: [],
        };
        const issues = reviewIssues(
          record!,
          assessment,
          chosenProduct?.name || "",
        ).filter(
          (issue) =>
            previewState.recordingMode !== "retrospective" ||
            [
              "assessment_required",
              "screening_incomplete",
              "screening_detail",
              "future_provider_communication",
            ].includes(issue.code),
        );
        if (issues.length)
          throw new Error(issues.map((issue) => issue.message).join(" "));
        path += "/review";
        body = {
          expectedVersion: record!.version,
          lotId,
          stockUnits,
          checks: {
            identity: form.get("identity") === "on",
            order: form.get("order") === "on",
            allergy: form.get("allergy") === "on",
            medication: form.get("medication") === "on",
            timing: form.get("timing") === "on",
            consent: form.get("consent") === "on",
          },
          allergyReview: val("allergyReview"),
          vitals: {
            status: vitalsStatus,
            bpSystolic: vitalsStatus === "recorded" ? num("systolic") : null,
            bpDiastolic: vitalsStatus === "recorded" ? num("diastolic") : null,
            pulse: vitalsStatus === "recorded" ? num("pulse") : null,
            temperatureC: vitalsStatus === "recorded" ? num("temp") : null,
            oxygenSaturation:
              vitalsStatus === "recorded" ? num("oxygen") : null,
            reason:
              vitalsStatus === "not_recorded" ? val("vitalsReason") : null,
          },
          observationPlan: val("observationPlan"),
          clinicalReview: val("clinicalReview"),
          preparation: val("preparation"),
          siteAssessment: val("siteAssessment"),
          assessment,
          workstation: previewState,
        };
      } else if (action === "administer") {
        if (
          !confirmedUnusedRouteSite &&
          (!val("actualRoute") || !val("actualSite"))
        )
          throw new Error("Confirm the actual route and site used.");
        const issueAction =
          delivery === "complete"
            ? null
            : `${routeSiteConfirmationPrefix}${val("issueAction")}`;
        if (delivery !== "complete" && !val("issueAction"))
          throw new Error("Record the issue and provider-directed action.");
        if (issueAction && issueAction.length > 2000)
          throw new Error(
            `Keep the issue and provider-directed action within ${2000 - routeSiteConfirmationPrefix.length} characters to include the route/site confirmation.`,
          );
        const fingerprint = JSON.stringify([
          Array.from(form.entries()),
          delivery,
          confirmedUnusedRouteSite,
          unknownDose,
          atNow,
          record!.version,
          previewState,
        ]);
        if (
          !administrationInstant.current ||
          administrationInstant.current.fingerprint !== fingerprint
        )
          administrationInstant.current = {
            fingerprint,
            value: new Date().toISOString(),
          };
        path += "/administer";
        const counseling =
          getInjectionGuidance(chosenProduct?.name || "")?.counseling || [];
        const educationProvided = form
          .getAll("educationProvided")
          .map((value) => counseling[Number(value)])
          .filter((value): value is string => !!value);
        if (val("otherEducation"))
          educationProvided.push(val("otherEducation"));
        body = {
          expectedVersion: record!.version,
          administeredAt: atNow
            ? administrationInstant.current.value
            : clinicInputToIso(val("adminAt"), timezone),
          administeredByName: val("staff"),
          tolerance: injectionResponseNote(previewState.response),
          workstation: previewState,
          observation: val("observation"),
          delivery,
          ...(!confirmedUnusedRouteSite
            ? {
                actualSite: val("actualSite"),
                actualRoute: val("actualRoute"),
              }
            : {}),
          actualDose:
            delivery === "complete"
              ? null
              : delivery === "not_delivered"
                ? 0
                : unknownDose
                  ? null
                  : num("actualDose"),
          issueAction,
          followUp: {
            instructions: val("followUpInstructions") || null,
            educationProvided,
            observationMinutes: num("observationMinutes"),
            observationOutcome: val("observationOutcome") || null,
            observationNote: val("observationNote") || null,
          },
        };
      } else if (action === "hold" || action === "cancel") {
        path += "/disposition";
        body = {
          expectedVersion: record!.version,
          status: action === "hold" ? "held" : "cancelled",
          reason: val("reason"),
        };
      } else if (action === "amend") {
        path += "/amend";
        body = {
          expectedVersion: record!.version,
          reason: val("reason"),
          text: val("text"),
        };
      } else {
        path += "/file";
        body = {
          expectedVersion: record!.version,
          tebraReference: val("reference"),
        };
      }
      const payload = JSON.stringify([path, method, body]);
      if (!attempt.current || attempt.current.payload !== payload)
        attempt.current = { payload, key: crypto.randomUUID() };
      setSaving(true);
      const saved = await request<InjectionCase>(
        path,
        method,
        body,
        attempt.current.key,
      );
      await onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      class={`editor-dialog injection-dialog ${["create", "edit", "review", "administer"].includes(action) ? "wide" : ""}`}
      aria-labelledby="injection-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div class="dialog-header">
        <div>
          <p class="eyebrow">INJECTIONS</p>
          <h2 id="injection-dialog-title">{titles[action]}</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="Close dialog"
          disabled={saving}
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      <form
        ref={formElement}
        onSubmit={submit}
        onChange={readForm}
        onInput={(event) => {
          setDirty(true);
          setDiscard(false);
          // Checkbox input fires before its change event. Let the checkbox's
          // controlled state update there; the form change handler snapshots
          // the complete form immediately afterward.
          const target = event.target as HTMLInputElement;
          if (["checkbox", "radio"].includes(target.type)) return;
          readForm();
        }}
      >
        <div class="dialog-body">
          <ErrorText error={error} />
          {discard && (
            <div class="discard-notice" role="alert">
              <span>Discard these unsaved changes?</span>
              <button
                type="button"
                class="button secondary small"
                onClick={() => setDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                class="button secondary small"
                onClick={onClose}
              >
                Discard
              </button>
            </div>
          )}
          {chosenPatient && (
            <div class="dialog-patient">
              <span class="avatar">
                {chosenPatient.displayName.slice(0, 1)}
              </span>
              <div>
                <strong>{chosenPatient.displayName}</strong>
                <small>
                  DOB {dateLabel(chosenPatient.dob)} · Tebra #
                  {chosenPatient.tebraId}
                </small>
              </div>
              {chosenProduct && (
                <span class="dialog-drug">
                  {chosenProduct.name}
                  <small>
                    {record?.dose} {record?.doseUnit} · {record?.route}
                  </small>
                </span>
              )}
            </div>
          )}
          {(action === "create" || action === "edit") && (
            <>
              {record?.review && (
                <div class="clinical-callout">
                  Saving releases reserved stock and requires a new safety
                  review.
                </div>
              )}
              <section class="form-section">
                <h3>Patient & order</h3>
                <div class="form-grid">
                  <Field label="Patient">
                    <select
                      required
                      value={patient}
                      disabled={!!record || !!patientId}
                      onChange={(e) => setPatient(e.currentTarget.value)}
                    >
                      <option value="">Select patient</option>
                      {data.patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName} · {dateLabel(p.dob)} · #{p.tebraId}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ordering provider">
                    <input
                      name="provider"
                      required
                      maxLength={160}
                      defaultValue={record?.orderingProvider}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Tebra order reference">
                    <input
                      name="reference"
                      required
                      maxLength={200}
                      defaultValue={record?.tebraOrderReference}
                      placeholder="Order / encounter date and reference"
                    />
                  </Field>
                  <Field label="Planned clinic date">
                    <input
                      name="planned"
                      type="date"
                      required
                      defaultValue={record?.plannedOn || today}
                    />
                  </Field>
                </div>
              </section>
              <section class="form-section">
                <h3>Medication</h3>
                <Field label="Product / formulation">
                  <select
                    required
                    value={product}
                    onChange={(e) => setProduct(e.currentTarget.value)}
                  >
                    <option value="">Select product</option>
                    {data.products
                      .filter((p) =>
                        ["kit", "syringe", "vial"].includes(p.unit),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.strength}
                        </option>
                      ))}
                  </select>
                </Field>
                {!data.products.some((p) =>
                  ["kit", "syringe", "vial"].includes(p.unit),
                ) && (
                  <p class="form-note">
                    Add the medication in Inventory first.
                  </p>
                )}
                <div class="form-grid four">
                  <Field label="Ordered dose">
                    <input
                      name="dose"
                      type="number"
                      min="0.000001"
                      max="1000000"
                      step="any"
                      required
                      list="workstation-reference-doses"
                      defaultValue={record?.dose}
                    />
                  </Field>
                  <Field label="Dose unit">
                    <select
                      name="doseUnit"
                      required
                      value={doseUnit}
                      onChange={(e) => setDoseUnit(e.currentTarget.value)}
                    >
                      <option value="">Select</option>
                      {["mg", "mcg", "mL", "units"].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Route">
                    <select
                      required
                      value={route}
                      onChange={(e) => setRoute(e.currentTarget.value)}
                    >
                      <option value="">Select</option>
                      <option value="IM">IM</option>
                      <option value="SC">SC</option>
                    </select>
                  </Field>
                  <Field label="Dose sequence">
                    <input
                      name="sequence"
                      type="number"
                      min="1"
                      max="10"
                      step="1"
                      required
                      defaultValue={record?.doseSequence || 1}
                    />
                  </Field>
                </div>
                <datalist id="workstation-reference-doses">
                  {engineEvaluation.output.medication?.doses.map((dose) => (
                    <option key={dose} value={parseFloat(dose)}>
                      {dose}
                    </option>
                  ))}
                </datalist>
                <Field label="Planned injection site">
                  <input
                    name="site"
                    list="injection-sites"
                    required
                    maxLength={100}
                    defaultValue={record?.site}
                    placeholder="Site and laterality"
                  />
                </Field>
                <datalist id="injection-sites">
                  {(engineEvaluation.output.allowedSites.length
                    ? engineEvaluation.output.allowedSites
                    : route === "IM"
                      ? [
                          "Left deltoid",
                          "Right deltoid",
                          "Left ventrogluteal",
                          "Right ventrogluteal",
                          "Left dorsogluteal",
                          "Right dorsogluteal",
                        ]
                      : [
                          "Left abdomen",
                          "Right abdomen",
                          "Left upper arm",
                          "Right upper arm",
                        ]
                  ).map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <p class="field-help">
                  Enter the exact formulation, dose, route, and site from the
                  current order. Use a separate sequence for each ordered
                  injection.
                </p>
              </section>
              <section class="form-section">
                <h3>Timing</h3>
                <div class="form-grid">
                  <Field label="Timing category">
                    <select
                      value={timing}
                      onChange={(e) =>
                        setTiming(
                          e.currentTarget
                            .value as InjectionInput["timingCategory"],
                        )
                      }
                    >
                      <option value="unknown">Not yet confirmed</option>
                      <option value="scheduled">Scheduled dose</option>
                      <option value="initiation">Initiation</option>
                      <option value="late_or_missed">Late / missed dose</option>
                    </select>
                  </Field>
                  <Field label="Last administration date (optional)">
                    <input
                      name="lastDate"
                      type="date"
                      disabled={
                        !!record?.lastAdministrationAt && !replacePriorTime
                      }
                      defaultValue={
                        record?.lastAdministrationOn ||
                        (record?.lastAdministrationAt
                          ? clinicLocalInput(
                              record.lastAdministrationAt,
                              timezone,
                            ).slice(0, 10)
                          : "")
                      }
                    />
                  </Field>
                </div>
                {record?.lastAdministrationAt && (
                  <div class="prior-time-preserved">
                    <p>
                      Verified prior time:{" "}
                      {momentLabel(record.lastAdministrationAt, timezone)}
                    </p>
                    <label class="checkbox">
                      <input
                        type="checkbox"
                        checked={replacePriorTime}
                        onChange={(e) =>
                          setReplacePriorTime(e.currentTarget.checked)
                        }
                      />
                      Replace the known timestamp with date-only or unknown
                      history.
                    </label>
                  </div>
                )}
                <Field label="Provider-confirmed timing plan">
                  <textarea
                    name="timingPlan"
                    required
                    maxLength={1000}
                    rows={3}
                    defaultValue={record?.timingPlan}
                    placeholder="Schedule, initiation or missed-dose instructions, and order reference"
                  />
                </Field>
                <Field label="Next due date per order (optional)">
                  <input
                    name="nextDue"
                    type="date"
                    defaultValue={record?.nextDueOn || ""}
                  />
                </Field>
                <p class="field-help">
                  Use confirmed dates from Tebra. Leave an unknown last-dose
                  date blank; document the provider’s clearance in the timing
                  plan.
                </p>
              </section>
              <InjectionOrderContext
                record={record}
                hideSchedule={engineEncounter.medicationKey !== "other"}
                medicationKey={engineEncounter.medicationKey}
              />
              <WorkstationEngineFields
                stage="order"
                value={previewState}
                encounter={engineEncounter}
                evaluation={engineEvaluation}
                onChange={updateWorkstation}
                onReturnDate={useReturnDate}
                cases={cases}
                record={previewRecord}
                timezone={timezone}
              />
              <WorkstationEngineSummary
                stage="order"
                encounter={engineEncounter}
                evaluation={engineEvaluation}
              />
            </>
          )}
          {action === "review" && record && (
            <>
              {record.plannedOn !== today &&
                workstation.recordingMode !== "retrospective" && (
                  <div class="error">
                    Safety review must be completed on the planned clinic date.
                    Edit the order before proceeding.
                  </div>
                )}
              {record.timingCategory === "unknown" &&
                workstation.recordingMode !== "retrospective" && (
                  <div class="error">
                    Confirm the timing category and provider plan in the order
                    first.
                  </div>
                )}
              <section class="form-section">
                <h3>Confirm in Tebra</h3>
                <div class="checklist">
                  <label>
                    <input type="checkbox" name="identity" required />
                    <span>
                      {workstation.recordingMode === "retrospective"
                        ? "Patient name and DOB match the source clinical record being entered."
                        : "Patient name and DOB match the chart and patient."}
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" name="order" required />
                    <span>
                      {workstation.recordingMode === "retrospective"
                        ? "I reviewed the historical order and source medication, dose, route, and site."
                        : "Current provider order matches the medication, dose, route, and site."}
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" name="timing" required />
                    <span>
                      {workstation.recordingMode === "retrospective"
                        ? "I reviewed the available administration history and timing documentation."
                        : "Last dose, timing plan, and any initiation or missed-dose instructions are confirmed."}
                    </span>
                  </label>
                  <label>
                    <input type="checkbox" name="consent" required />
                    <span>
                      {workstation.recordingMode === "retrospective"
                        ? "I reviewed the available consent and education documentation without inferring missing actions."
                        : "Required consent and patient education are complete."}
                    </span>
                  </label>
                </div>
              </section>
              <section class="form-section">
                <h3>Screening</h3>
                {medicationReference && (
                  <details class="medication-reference">
                    <summary>{medicationReference.name} review points</summary>
                    {medicationReference.requiresSpecialistSetting && (
                      <div class="clinical-callout">
                        Specialist setting and monitoring requirements apply.
                        Verify eligibility and protocol before proceeding.
                      </div>
                    )}
                    <ul>
                      {medicationReference.reviewPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <a
                      href={medicationReference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Current prescribing information ↗
                    </a>
                  </details>
                )}
                <Field label="Allergies / reactions reviewed">
                  <textarea
                    name="allergyReview"
                    required
                    rows={2}
                    maxLength={1000}
                    placeholder="Allergies, prior reactions, or verified none"
                  />
                </Field>
                <label class="checkbox">
                  <input name="allergy" type="checkbox" required />
                  {workstation.recordingMode === "retrospective"
                    ? "I reviewed the documented allergy information available for this historical administration."
                    : "Allergy review is complete; concerns are resolved with the provider."}
                </label>
                <Field label="Medication-specific review">
                  <textarea
                    name="clinicalReview"
                    required
                    rows={3}
                    maxLength={2000}
                    placeholder="Required screening, oral coverage, symptoms, and any provider clearance"
                  />
                </Field>
                <p class="field-help">
                  Use the current product instructions and clinic protocol. Hold
                  unresolved concerns.
                </p>
              </section>
              <InjectionAssessmentFields
                record={record}
                productName={chosenProduct?.name || ""}
                timezone={timezone}
                requireProviderReview={engineEvaluation.stops.some(
                  (issue) => issue.field === "details.lateDoseReview",
                )}
                retrospective={previewState.recordingMode === "retrospective"}
              />
              <WorkstationEngineFields
                stage="review"
                value={previewState}
                encounter={engineEncounter}
                evaluation={engineEvaluation}
                onChange={updateWorkstation}
                cases={cases}
                record={record}
                timezone={timezone}
              />
              <section class="form-section">
                <h3>Vitals</h3>
                <Field label="Measured weight (kg)">
                  <input
                    name="weightKg"
                    type="number"
                    min="0.1"
                    max="1000"
                    step="0.1"
                    placeholder="Current measured weight, if obtained"
                  />
                </Field>
                <Field label="Vital signs">
                  <select
                    value={vitalsStatus}
                    onChange={(e) => setVitalsStatus(e.currentTarget.value)}
                  >
                    <option value="recorded">Record measurements</option>
                    <option value="not_recorded">
                      Not recorded — give reason
                    </option>
                  </select>
                </Field>
                {vitalsStatus === "recorded" ? (
                  <div class="form-grid vitals-grid">
                    <Field label="Systolic BP">
                      <input
                        name="systolic"
                        type="number"
                        min="1"
                        max="400"
                        step="1"
                      />
                    </Field>
                    <Field label="Diastolic BP">
                      <input
                        name="diastolic"
                        type="number"
                        min="1"
                        max="300"
                        step="1"
                      />
                    </Field>
                    <Field label="Pulse / min">
                      <input
                        name="pulse"
                        type="number"
                        min="1"
                        max="400"
                        step="1"
                      />
                    </Field>
                    <Field label="Temperature °C">
                      <input
                        name="temp"
                        type="number"
                        min="20"
                        max="50"
                        step="0.1"
                      />
                    </Field>
                    <Field label="SpO₂ %">
                      <input
                        name="oxygen"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                      />
                    </Field>
                  </div>
                ) : (
                  <Field label="Reason vitals not recorded">
                    <input name="vitalsReason" required maxLength={300} />
                  </Field>
                )}
              </section>
              <section class="form-section">
                <h3>Stock & preparation</h3>
                <InjectionPreparationGuide
                  productName={chosenProduct?.name || ""}
                />
                {workstation.recordingMode === "retrospective" && (
                  <div class="clinical-callout">
                    <strong>Use the exact historical lot.</strong>
                    <p>
                      This flow can record only stock that is still active,
                      unexpired, available, and eligible for this patient today.
                      If the historical lot is now expired, missing, or
                      otherwise unavailable, this administration cannot be
                      entered through this flow. Do not select a different lot.
                    </p>
                  </div>
                )}
                <div class="form-grid stock-fields">
                  <Field label="Whole packages to use">
                    <input
                      name="stockUnits"
                      value={stockUnits}
                      onInput={(e) => {
                        setStockUnits(Number(e.currentTarget.value));
                        setLotId("");
                      }}
                      required
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                    />
                  </Field>
                  <Field label="Available stock lot">
                    <select
                      required
                      value={lotId}
                      onChange={(e) => setLotId(e.currentTarget.value)}
                    >
                      <option value="">Select a lot</option>
                      {lotOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotNumber} · exp {dateLabel(l.expiresOn)} ·{" "}
                          {l.onHand - l.reserved} available ·{" "}
                          {l.ownership === "patient"
                            ? "Patient supply"
                            : l.ownership === "sample"
                              ? "Sample"
                              : "Clinic stock"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {selectedLot && (
                  <div class="stock-selection">
                    <Badge tone="teal">
                      {selectedLot.ownership === "patient"
                        ? "Patient supply"
                        : selectedLot.ownership === "sample"
                          ? "Sample"
                          : "Clinic stock"}
                    </Badge>
                    <span>
                      {selectedLot.location} · expires{" "}
                      {dateLabel(selectedLot.expiresOn)}
                    </span>
                  </div>
                )}
                {!lotOptions.length && (
                  <p class="danger-text">
                    {workstation.recordingMode === "retrospective"
                      ? "No eligible stock is available. This historical administration cannot be recorded through this flow without its exact eligible lot."
                      : "No eligible stock is available. Check Inventory before continuing."}
                  </p>
                )}
                <label class="checkbox">
                  <input type="checkbox" name="medication" required />
                  {workstation.recordingMode === "retrospective"
                    ? "I reconciled the historical package documentation with the inventory entry and noted any unavailable details."
                    : "I verified formulation, strength, lot, expiration, storage, and patient ownership."}
                </label>
                <Field label="Preparation / product checks">
                  <textarea
                    name="preparation"
                    required
                    rows={2}
                    maxLength={1000}
                    placeholder="Product-specific preparation and package checks completed"
                  />
                </Field>
                <Field label="Site assessment">
                  <input
                    name="siteAssessment"
                    required
                    maxLength={1000}
                    placeholder="Site, laterality, and skin assessment"
                  />
                </Field>
                <Field label="Needle selected / equipment">
                  <input
                    name="needle"
                    maxLength={300}
                    placeholder="Gauge, length, supplied needle, and relevant selection details"
                  />
                </Field>
                <Field label="Observation plan">
                  <textarea
                    name="observationPlan"
                    required
                    rows={2}
                    maxLength={1000}
                    placeholder="Required observation and instructions per provider / clinic protocol"
                  />
                </Field>
                <p class="field-help">
                  Completing review reserves {stockUnits || 0} whole{" "}
                  {chosenProduct?.unit || "package"}
                  {stockUnits !== 1 ? "s" : ""}. Medication dose is recorded
                  separately.
                </p>
              </section>
              <WorkstationEngineSummary
                stage="review"
                encounter={engineEncounter}
                evaluation={engineEvaluation}
              />
            </>
          )}
          {action === "administer" && record && (
            <>
              <div class="clinical-callout">
                <strong>
                  Ordered: {record.dose} {record.doseUnit} {record.route} ·{" "}
                  {record.site}
                </strong>
                <p>
                  Lot {record.review?.lotSnapshot.lotNumber} ·{" "}
                  {record.review?.stockUnits} whole package
                  {record.review?.stockUnits !== 1 ? "s" : ""}
                </p>
              </div>
              <Field label="Delivery">
                <select
                  required
                  value={delivery}
                  onChange={(e) => {
                    setDelivery(e.currentTarget.value);
                    setNoRouteSiteUsed(false);
                  }}
                >
                  <option value="">Select the actual outcome</option>
                  <option value="complete">Full ordered dose delivered</option>
                  <option value="partial">Partial dose delivered</option>
                  <option value="not_delivered">
                    Attempted — no dose delivered
                  </option>
                  <option value="error">
                    Dose / route / site error occurred
                  </option>
                </select>
              </Field>
              {(delivery === "partial" || delivery === "error") && (
                <>
                  <label class="checkbox">
                    <input
                      type="checkbox"
                      checked={unknownDose}
                      onChange={(e) => setUnknownDose(e.currentTarget.checked)}
                    />
                    Delivered amount is unknown
                  </label>
                  {!unknownDose && (
                    <Field label={`Actual dose delivered (${record.doseUnit})`}>
                      <input
                        name="actualDose"
                        required
                        type="number"
                        min={delivery === "error" ? "0" : "0.000001"}
                        max={delivery === "error" ? 1000000 : record.dose}
                        step="any"
                      />
                    </Field>
                  )}
                </>
              )}
              {delivery && delivery !== "complete" && (
                <>
                  <Field label="Issue and provider-directed action">
                    <textarea
                      name="issueAction"
                      required
                      maxLength={2000 - routeSiteConfirmationPrefix.length}
                      rows={3}
                      placeholder="What occurred, provider notification, and instructions received"
                    />
                  </Field>
                  <div class="clinical-callout">
                    This records an opened or attempted package as used. It does
                    not recommend a replacement dose. If no package was opened
                    or used, place the injection on hold instead.
                  </div>
                </>
              )}
              {delivery === "not_delivered" && (
                <div>
                  <label class="checkbox">
                    <input
                      name="noRouteSiteUsed"
                      type="checkbox"
                      checked={noRouteSiteUsed}
                      onChange={(e) =>
                        setNoRouteSiteUsed(e.currentTarget.checked)
                      }
                    />
                    No route or site was used
                  </label>
                  <p class="field-help">
                    Select only if the package was opened but no route or
                    injection site was used. This confirmation is saved with the
                    issue and provider action.
                  </p>
                </div>
              )}
              {!confirmedUnusedRouteSite && (
                <div class="form-grid">
                  <Field label="Actual route">
                    <select name="actualRoute" required defaultValue="">
                      <option value="">Confirm actual route</option>
                      <option value="IM">IM</option>
                      <option value="SC">SC</option>
                    </select>
                  </Field>
                  <Field label="Actual site and laterality">
                    <input
                      name="actualSite"
                      required
                      maxLength={100}
                      list="actual-injection-sites"
                      placeholder="Record the site actually used"
                    />
                  </Field>
                </div>
              )}
              <datalist id="actual-injection-sites">
                <option value={record.site} />
              </datalist>
              <div class="form-grid">
                <Field
                  label={
                    delivery === "not_delivered"
                      ? "Performed by"
                      : "Administered by"
                  }
                >
                  <input
                    name="staff"
                    required
                    maxLength={160}
                    defaultValue={actor.displayName || ""}
                  />
                </Field>
                <div class="field">
                  <label class="checkbox">
                    <input
                      type="checkbox"
                      checked={atNow}
                      onChange={(e) => setAtNow(e.currentTarget.checked)}
                    />
                    Record time as now
                  </label>
                  {!atNow && (
                    <Field label="Actual administration time">
                      <input
                        name="adminAt"
                        type="datetime-local"
                        step="1"
                        required
                        defaultValue={
                          workstation.recordingMode === "retrospective"
                            ? ""
                            : clinicLocalInput(
                                new Date().toISOString(),
                                timezone,
                              )
                        }
                      />
                    </Field>
                  )}
                  <small class="field-help">{timezone}</small>
                </div>
              </div>
              <WorkstationEngineFields
                stage="administer"
                value={previewState}
                encounter={engineEncounter}
                evaluation={engineEvaluation}
                onChange={updateWorkstation}
                cases={cases}
                record={record}
                timezone={timezone}
              />
              <Field label="Observation and follow-up">
                <textarea
                  name="observation"
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder="Observation performed, outcome, and instructions given"
                />
              </Field>
              <InjectionFollowUpFields
                productName={chosenProduct?.name || ""}
                requireInstructions={
                  !!previewState.pairedCaseId &&
                  pairedCase?.administration?.delivery !== "complete"
                }
              />
              <label class="checkbox confirmation">
                <input type="checkbox" required />
                <span>
                  I confirm the actual delivery, time, route/site use, and
                  patient response above.
                </span>
              </label>
              <p class="field-help">
                Saving records this administration and consumes the reserved
                stock once. Corrections use an addendum.
              </p>
            </>
          )}
          {(action === "hold" || action === "cancel") && (
            <>
              <Field
                label={
                  action === "hold"
                    ? "Reason / next action"
                    : "Cancellation reason"
                }
              >
                <textarea name="reason" required maxLength={1000} rows={4} />
              </Field>
              <p class="form-note">
                {action === "hold"
                  ? "Reserved stock will be released. Resume when the concern is resolved."
                  : "Reserved stock will be released. A cancelled injection cannot be resumed."}
              </p>
            </>
          )}
          {action === "amend" && (
            <>
              <Field label="Reason for addendum">
                <input name="reason" required maxLength={500} />
              </Field>
              <Field label="Addendum">
                <textarea name="text" required maxLength={4000} rows={7} />
              </Field>
              <p class="form-note">
                The original record stays intact. File the updated note in Tebra
                after saving. Inventory corrections are recorded separately.
              </p>
            </>
          )}
          {action === "file" && (
            <>
              <p class="form-note">
                Review and file the note in the correct Tebra chart first.
              </p>
              <Field label="Tebra encounter / document reference">
                <input
                  name="reference"
                  required
                  maxLength={200}
                  placeholder="Encounter date and document reference"
                />
              </Field>
              <label class="checkbox confirmation">
                <input type="checkbox" required />I verified the saved document
                in this patient’s Tebra chart, including any addenda.
              </label>
              {record?.administration && (
                <small class="field-help">
                  Administration:{" "}
                  {momentLabel(record.administration.administeredAt, timezone)}
                </small>
              )}
            </>
          )}
        </div>
        <div class="dialog-footer">
          <button
            type="button"
            class="button secondary"
            disabled={saving}
            onClick={close}
          >
            Close
          </button>
          <button
            class="button primary"
            type="submit"
            disabled={
              saving ||
              (action === "review" &&
                ((record?.plannedOn !== today &&
                  workstation.recordingMode !== "retrospective") ||
                  (record?.timingCategory === "unknown" &&
                    workstation.recordingMode !== "retrospective")))
            }
          >
            {saving ? "Saving…" : submitLabels[action]}
            <Icon name="check" size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
