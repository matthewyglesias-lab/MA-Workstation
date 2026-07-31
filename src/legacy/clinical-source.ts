import type {
  ClinicalEncounterSource,
  WorkflowObservation,
} from "../application/clinical-coordinator";
import type {
  ClinicalWorkflow,
  EncounterByWorkflow,
  EncounterLifecycle,
} from "../application/store";
import {
  INJECTION_INTERVAL_DAYS,
  INJECTION_MEDICATIONS,
  type InjectionIntervalKey,
  type InjectionMedicationKey,
  type MedicationVerificationKey,
} from "../domain/injection-catalog";
import type {
  InjectionDisposition,
  InjectionEncounter,
  InjectionInitiationProtocol,
  InjectionInitiationState,
  InjectionReason,
  InjectionResponse,
} from "../domain/injection";
import {
  sampleReviewFingerprint,
  type SamplesEncounter,
} from "../domain/samples";
import {
  UDS_PANELS,
  type UdsEncounter,
  type UdsPanel,
  type UdsResultState,
} from "../domain/uds";
import type {
  FormRequestStatus,
  FormRequestType,
  FormsEncounter,
  LetterSignatureMode,
  LetterType,
} from "../domain/forms";
import type { PatientIdentity } from "../domain/contracts";

interface LegacyClinicalBridgeSnapshot {
  version?: number;
  injection?: {
    medicationKey?: string;
    customMedication?: string;
    dose?: string;
    site?: string;
    route?: string;
    intervalKey?: string;
    reason?: string;
    response?: string;
    attestations?: Record<string, unknown>;
    verifications?: Record<string, unknown>;
    safetyConcerns?: Record<string, unknown>;
    initiation?: Record<string, unknown>;
    disposition?: Record<string, unknown>;
  };
  uds?: {
    reason?: string;
    temperature?: string;
    control?: string;
    results?: Record<string, unknown>;
    validity?: string;
    medicationAlignment?: string;
    labPlan?: string;
  };
  samples?: { medicationKey?: string };
  forms?: {
    requestType?: string;
    status?: string;
    letterType?: string;
  };
}

declare global {
  interface Window {
    ipmgLegacyClinicalStateSnapshot?: () => LegacyClinicalBridgeSnapshot;
    __IPMG_RC530__?: { safetyNone?: boolean };
    __IPMG_RC538_UDS_PROFILE__?: {
      omitted?: string;
      readingsVerified?: boolean;
    };
    samplePackageTraceEntries?: () => Array<{
      id?: string;
      label?: string;
      strength?: string;
      quantity?: string;
      lot?: string;
      exp?: string;
    }>;
    sampleReviewConfirmationCurrent?: () => boolean;
  }
}

export interface LegacyClinicalSourceOptions {
  document?: Document;
  window?: Window;
  now?: () => Date;
}

const INJECTION_REASONS = new Set<InjectionReason>([
  "scheduled",
  "initiation",
  "reinit",
  "loading",
  "prn",
]);
const INJECTION_RESPONSES = new Set<InjectionResponse["kind"]>([
  "well",
  "bleed",
  "disc",
  "custom",
  "",
]);
const INITIATION_PROTOCOLS = new Set<InjectionInitiationProtocol>([
  "",
  "maintena-1day",
  "maintena-14day",
  "maintena-provider",
  "asimtufii-1day",
  "asimtufii-14day",
  "asimtufii-provider",
  "aristada-initio-sameday",
  "aristada-21day",
  "aristada-provider",
  "sustenna-day1",
  "sustenna-day8",
  "sustenna-provider",
]);
const FORM_REQUEST_TYPES = new Set<FormRequestType>([
  "work",
  "disability",
  "fmla",
  "records",
  "med",
  "other",
]);
const FORM_STATUSES = new Set<FormRequestStatus>([
  "received",
  "provider_review",
  "fee_pending",
  "in_progress",
  "ready",
  "notified",
  "completed",
]);
const LETTER_TYPES = new Set<LetterType>([
  "dx",
  "offwork",
  "return",
  "restrictions",
  "custom",
]);
const LETTER_SIGNATURE_MODES = new Set<LetterSignatureMode>([
  "wet",
  "electronic",
  "none",
]);

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const boolRecord = <T extends string>(
  source: Record<string, unknown> | undefined,
  allowed: readonly T[],
): Partial<Record<T, boolean>> =>
  Object.fromEntries(
    allowed.map((key) => [key, Boolean(source?.[key])]),
  ) as Partial<Record<T, boolean>>;

const asPatient = (
  read: (id: string) => string,
  nameId: string,
  dobId: string,
): PatientIdentity => ({ name: read(nameId), dob: read(dobId) });

const isEmptyPatient = (patient: PatientIdentity): boolean =>
  !patient.name && !patient.dob;

export function createLegacyClinicalSource(
  options: LegacyClinicalSourceOptions = {},
): ClinicalEncounterSource {
  const doc = options.document ?? globalThis.document;
  const browserWindow = options.window ?? globalThis.window;
  const now = options.now ?? (() => new Date());
  let observedSampleReviewAt = "";

  const control = (
    id: string,
  ): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null =>
    doc.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
  const value = (id: string): string => String(control(id)?.value ?? "").trim();
  const checked = (id: string): boolean =>
    Boolean((control(id) as HTMLInputElement | null)?.checked);
  const bridge = (): LegacyClinicalBridgeSnapshot => {
    try {
      return browserWindow.ipmgLegacyClinicalStateSnapshot?.() ?? {};
    } catch {
      return {};
    }
  };

  const pairedSecondProductKey = (
    protocol: InjectionInitiationProtocol,
    primary: InjectionMedicationKey | "",
  ): InjectionMedicationKey | undefined => {
    if (protocol === "maintena-1day" && primary === "maintena") {
      return "maintena";
    }
    if (protocol === "asimtufii-1day" && primary === "asimtufii") {
      return "maintena";
    }
    if (protocol === "aristada-initio-sameday") {
      if (primary === "aristada") return "initio";
      if (primary === "initio") return "aristada";
    }
    return undefined;
  };

  const normalizeInitiation = (
    raw: Record<string, unknown> | undefined,
    primaryMedication: InjectionMedicationKey | "",
  ): InjectionInitiationState | undefined => {
    const protocolValue = asString(raw?.protocol);
    const protocol = INITIATION_PROTOCOLS.has(
      protocolValue as InjectionInitiationProtocol,
    )
      ? (protocolValue as InjectionInitiationProtocol)
      : "";
    if (!protocol) return undefined;
    const rawSecond =
      raw?.second && typeof raw.second === "object"
        ? (raw.second as Record<string, unknown>)
        : {};
    return {
      version: typeof raw?.version === "number" ? raw.version : 1,
      protocol,
      planVerified: Boolean(raw?.planVerified),
      oralStatus:
        raw?.oralStatus === "administered" || raw?.oralStatus === "verified"
          ? raw.oralStatus
          : "",
      providerNote: asString(raw?.providerNote),
      sustennaOrder:
        raw?.sustennaOrder === "standard" ||
        raw?.sustennaOrder === "mild" ||
        raw?.sustennaOrder === "other"
          ? raw.sustennaOrder
          : "",
      day1Date: asString(raw?.day1Date),
      second: {
        productKey: pairedSecondProductKey(protocol, primaryMedication),
        dose: asString(rawSecond.dose),
        site: asString(rawSecond.site),
        ndc: asString(rawSecond.ndc),
        lot: asString(rawSecond.lot),
        expiration: asString(rawSecond.exp ?? rawSecond.expiration),
        given: Boolean(rawSecond.given),
        orderVerified: Boolean(rawSecond.orderVerified),
        note: asString(rawSecond.note),
      },
    };
  };

  const normalizeInjection = (
    state: LegacyClinicalBridgeSnapshot,
  ): WorkflowObservation<"injection"> => {
    const raw = state.injection ?? {};
    const medicationKey = Object.hasOwn(
      INJECTION_MEDICATIONS,
      asString(raw.medicationKey),
    )
      ? (asString(raw.medicationKey) as InjectionMedicationKey)
      : "";
    const intervalKey = Object.hasOwn(
      INJECTION_INTERVAL_DAYS,
      asString(raw.intervalKey),
    )
      ? (asString(raw.intervalKey) as InjectionIntervalKey)
      : "";
    const reason = INJECTION_REASONS.has(raw.reason as InjectionReason)
      ? (raw.reason as InjectionReason)
      : "scheduled";
    const responseKind = INJECTION_RESPONSES.has(
      raw.response as InjectionResponse["kind"],
    )
      ? (raw.response as InjectionResponse["kind"])
      : "";
    const rawDisposition = raw.disposition ?? {};
    const dispositionKind = ["", "administered", "held", "escalated", "provider"].includes(
      asString(rawDisposition.kind),
    )
      ? (asString(rawDisposition.kind) as InjectionDisposition["kind"])
      : "";
    const patient = asPatient(value, "ptName", "ptDOB");
    const encounter: InjectionEncounter = {
      patient,
      medicationKey,
      customMedication: asString(raw.customMedication),
      dose: asString(raw.dose),
      route: asString(raw.route),
      site: asString(raw.site),
      intervalKey,
      reason,
      priorDoseDate: value("priorDose"),
      priorSite: value("priorSite"),
      administrationDate: value("adminDate"),
      nextDoseDate: value("nextDate"),
      orderingProvider: value("orderingProvider"),
      administeredBy: value("admin"),
      administrationTime: value("injAdminTime"),
      secondAdministrationTime: value("injSecondAdminTime"),
      allergies: value("allergies"),
      traceability: {
        ndc: value("ndc"),
        lot: value("lot"),
        expiration: value("exp"),
      },
      vitals: {
        bp: value("bp"),
        hr: value("hr"),
        temperature: value("temp"),
        rr: value("rr"),
        spo2: value("spo2"),
      },
      response: {
        kind: responseKind,
        ...(responseKind === "custom" ? { custom: value("respCustom") } : {}),
      },
      attestations: boolRecord(raw.attestations, [
        "id2",
        "rights",
        "allergy",
        "consent",
        "prior",
        "screen",
        "hygiene",
      ] as const),
      verifications: boolRecord<MedicationVerificationKey>(
        raw.verifications,
        [
          "opioidFree",
          "naltrexHS",
          "suppliedNeedle",
          "resuspend",
          "invegaInit",
          "oralOverlap",
          "stabilized",
          "paliperidoneTolerability",
          "aripiprazoleTolerability",
          "glutealOnly",
          "noMassage",
          "deepZtrack",
        ],
      ),
      acuteSafetyScreenConfirmed: Boolean(
        browserWindow.__IPMG_RC530__?.safetyNone,
      ),
      activeSafetyConcerns: Object.entries(raw.safetyConcerns ?? {})
        .filter(([, active]) => Boolean(active))
        .map(([key]) => key),
      disposition: {
        kind: dispositionKind,
        provider: asString(rawDisposition.provider),
        time: asString(rawDisposition.time),
        outcome: asString(rawDisposition.outcome),
      },
      initiation: normalizeInitiation(raw.initiation, medicationKey),
      details: {
        purpose: value("injOrderPurpose"),
        productSource: value("injProductSource"),
        productSourceOther: value("injProductSourceOther"),
        preparation: value("injPreparation"),
        preparationOther: value("injPreparationDetail"),
        volume: value("injVolume"),
        volumeUnit: value("injVolumeUnit"),
        device: value("injDevice"),
        deviceOther: value("injDeviceOther"),
        siteCondition: value("injSiteCondition"),
        siteConditionOther: value("injSiteConditionDetail"),
        waste: checked("injWasteToggle"),
        wasteAmount: value("injWasteAmount"),
        wasteWitness: value("injWasteWitness"),
        productIssue: checked("injProductIssueToggle"),
        productIssueDetail: value("injProductIssueDetail"),
        productIssueAction: value("injProductIssueAction"),
        productIssueRecipient: value("injProductIssueRecipient"),
        productIssueNotificationTime: value(
          "injProductIssueNotificationTime",
        ),
        productIssueDirection: value("injProductIssueDirection"),
        productIssueNextStep: value("injProductIssueNextStep"),
        administrationException: checked("injExceptionToggle"),
        exceptionSummary: value("injExceptionSummary"),
        exceptionRecipient: value("injExceptionRecipient"),
        exceptionTime: value("injExceptionTime"),
        exceptionOutcome: value("injExceptionOutcome"),
      },
    };
    const started = Boolean(
      patient.name ||
        patient.dob ||
        encounter.orderingProvider ||
        medicationKey ||
        encounter.dose ||
        encounter.traceability.lot,
    );
    const locked = doc
      .getElementById("panel-administer")
      ?.classList.contains("record-readonly");
    const saved = /saved/i.test(
      doc.getElementById("injRecordStatus")?.textContent ?? "",
    );
    return {
      workflow: "injection",
      encounter,
      lifecycle: locked
        ? "completed"
        : saved
          ? "draft"
          : started
            ? "started"
            : "empty",
    };
  };

  const normalizeUds = (
    state: LegacyClinicalBridgeSnapshot,
  ): WorkflowObservation<"uds"> => {
    const raw = state.uds ?? {};
    const patient = asPatient(value, "udsPtName", "udsDOB");
    const device = value("udsDevice");
    const profile = browserWindow.__IPMG_RC538_UDS_PROFILE__ ?? {};
    const resultSource = raw.results ?? {};
    const meaningfulCollection = Boolean(
      patient.name ||
        patient.dob ||
        device ||
        value("udsLot") ||
        value("udsExp") ||
        value("udsCollector"),
    );
    const results = Object.fromEntries(
      UDS_PANELS.map((panel) => {
        const candidate = asString(resultSource[panel]);
        const normalized: UdsResultState =
          meaningfulCollection &&
          (candidate === "neg" ||
            candidate === "pos" ||
            candidate === "invalid" ||
            candidate === "nt")
            ? candidate
            : "nt";
        return [panel, normalized];
      }),
    ) as Record<UdsPanel, UdsResultState>;
    const omitted = UDS_PANELS.includes(profile.omitted as UdsPanel)
      ? (profile.omitted as UdsPanel)
      : "";
    const encounter: UdsEncounter = {
      patient,
      collectionDateTime: value("udsDateTime"),
      reason:
        raw.reason === "routine" ||
        raw.reason === "medmgmt" ||
        raw.reason === "preinj" ||
        raw.reason === "ordered" ||
        raw.reason === "other"
          ? raw.reason
          : "routine",
      device,
      omittedPanel: omitted,
      physicalReadingsVerified: Boolean(profile.readingsVerified),
      customPanelSetVerified: false,
      lot: value("udsLot"),
      expiration: value("udsExp"),
      collector: value("udsCollector"),
      temperature:
        raw.temperature === "acceptable" ||
        raw.temperature === "not documented" ||
        raw.temperature === "not acceptable"
          ? raw.temperature
          : "not documented",
      control:
        raw.control === "valid" ||
        raw.control === "invalid" ||
        raw.control === "not documented"
          ? raw.control
          : "not documented",
      validity:
        raw.validity === "acceptable" ||
        raw.validity === "needs review" ||
        raw.validity === "not documented"
          ? raw.validity
          : "not documented",
      medicationAlignment:
        raw.medicationAlignment === "no unexpected" ||
        raw.medicationAlignment === "not aligned" ||
        raw.medicationAlignment === "needs review" ||
        raw.medicationAlignment === "patient explanation" ||
        raw.medicationAlignment === "unavailable"
          ? raw.medicationAlignment
          : "unavailable",
      results,
      labPlan: asString(raw.labPlan) || value("udsLab"),
      comment: value("udsComment"),
    };
    return {
      workflow: "uds",
      encounter,
      lifecycle: meaningfulCollection ? "started" : "empty",
    };
  };

  const normalizeSamples = (
    state: LegacyClinicalBridgeSnapshot,
  ): WorkflowObservation<"samples"> => {
    const patient = asPatient(value, "samplePtName", "sampleDOB");
    const rawMedicationKey = asString(state.samples?.medicationKey);
    const hasMeaningfulEntry = Boolean(
      patient.name ||
        patient.dob ||
        value("samplePrescriber") ||
        value("sampleStaff") ||
        value("sampleLot") ||
        value("sampleExp") ||
        value("sampleExtra") ||
        value("sampleHandoutStatus") ||
        value("sampleFollowUp") ||
        (rawMedicationKey && rawMedicationKey !== "trintellix"),
    );
    const packageEntries = (() => {
      try {
        return browserWindow.samplePackageTraceEntries?.() ?? [];
      } catch {
        return [];
      }
    })();
    const medicationKey = hasMeaningfulEntry ? rawMedicationKey : "";
    const encounter: SamplesEncounter = {
      patient,
      prescriber: value("samplePrescriber"),
      staff: value("sampleStaff"),
      dispenseDate: value("sampleDate"),
      startDate: value("sampleStart"),
      medicationKey,
      medicationLabel: hasMeaningfulEntry ? value("sampleMedLabel") : "",
      quantity: hasMeaningfulEntry ? value("sampleQty") : "",
      directions: hasMeaningfulEntry ? value("sampleSig") : "",
      purpose: hasMeaningfulEntry ? value("samplePurpose") : "",
      foodInstructions: hasMeaningfulEntry ? value("sampleFood") : "",
      titration: hasMeaningfulEntry ? value("sampleTitration") : "",
      medicationReview:
        (hasMeaningfulEntry ? value("sampleMedCheck") : "not documented") as SamplesEncounter["medicationReview"],
      education: hasMeaningfulEntry
        ? value("sampleEdu") || "not documented"
        : "not documented",
      packages: hasMeaningfulEntry
        ? packageEntries.map((entry, index) => ({
            id: asString(entry.id) || `package-${index + 1}`,
            label: asString(entry.label),
            medicationStrength: asString(entry.strength),
            quantity: asString(entry.quantity),
            lot: asString(entry.lot),
            expiration: asString(entry.exp),
          }))
        : [],
      plan: hasMeaningfulEntry
        ? [
            ...doc.querySelectorAll<HTMLElement>(
              "#sampleDoseRows .sample-dose-row",
            ),
          ].map((row, index) => ({
            id: row.dataset.samplePackageTrace || `step-${index + 1}`,
            strength: String(
              row.querySelector<HTMLInputElement>("[data-dose-strength]")?.value ??
                "",
            ).trim(),
            quantity: String(
              row.querySelector<HTMLInputElement>("[data-dose-qty]")?.value ?? "",
            ).trim(),
            days: String(
              row.querySelector<HTMLInputElement>("[data-dose-days]")?.value ?? "",
            ).trim(),
            directions: String(
              row.querySelector<HTMLInputElement>("[data-dose-sig]")?.value ?? "",
            ).trim(),
          }))
        : [],
      extra: hasMeaningfulEntry ? value("sampleExtra") : "",
      review: { confirmedAt: "", fingerprint: "" },
    };
    let reviewCurrent = false;
    try {
      reviewCurrent = Boolean(browserWindow.sampleReviewConfirmationCurrent?.());
    } catch {
      reviewCurrent = false;
    }
    if (reviewCurrent) {
      observedSampleReviewAt ||= now().toISOString();
      encounter.review = {
        confirmedAt: observedSampleReviewAt,
        fingerprint: sampleReviewFingerprint(encounter),
      };
    } else {
      observedSampleReviewAt = "";
    }
    return {
      workflow: "samples",
      encounter,
      lifecycle: hasMeaningfulEntry ? "started" : "empty",
    };
  };

  const normalizeForms = (
    state: LegacyClinicalBridgeSnapshot,
  ): WorkflowObservation<"forms"> => {
    const raw = state.forms ?? {};
    const patient = asPatient(value, "formsPtName", "formsDOB");
    const requestType = FORM_REQUEST_TYPES.has(raw.requestType as FormRequestType)
      ? (raw.requestType as FormRequestType)
      : "work";
    const status = FORM_STATUSES.has(raw.status as FormRequestStatus)
      ? (raw.status as FormRequestStatus)
      : "received";
    const letterType = LETTER_TYPES.has(raw.letterType as LetterType)
      ? (raw.letterType as LetterType)
      : "dx";
    const signatureMode = value("letterSignatureMode");
    const encounter: FormsEncounter = {
      patient,
      requestType,
      status,
      letterType,
      requestDate: value("formsDate"),
      targetDate: value("formsDue"),
      provider: value("formsProvider") || value("letterProvider"),
      staff: value("formsStaff"),
      feeStatus: value("formsFee"),
      deliveryMethod: value("formsDelivery"),
      notificationStatus: value("formsNotified"),
      notes: value("formsNotes"),
      actionNotes: value("formsAction"),
      followUpNotes: value("formsFollowUp"),
      diagnosisWording: value("letterDx"),
      restrictions: value("letterRestrictions"),
      offWorkStart: value("letterOffStart"),
      offWorkEnd: value("letterOffEnd"),
      returnDate: value("letterReturn"),
      providerApprovalConfirmed:
        value("formsApproval") === "Provider approved for release",
      letterProviderName: value("letterProvider"),
      letterCredentials: value("letterCreds"),
      letterDate: value("letterDate"),
      letterRecipient: value("letterRecipient"),
      letterRecipientAddress: value("letterRecipientAddress"),
      letterSubject: value("letterSubject"),
      letterSignatureMode: LETTER_SIGNATURE_MODES.has(
        signatureMode as LetterSignatureMode,
      )
        ? (signatureMode as LetterSignatureMode)
        : "wet",
      letterPreparedBy: value("letterPreparedBy"),
    };
    const started = Boolean(
      patient.name ||
        patient.dob ||
        encounter.provider ||
        encounter.staff ||
        encounter.notes ||
        value("formsApproval") ||
        value("formsAction") ||
        value("formsFollowUp") ||
        encounter.diagnosisWording ||
        encounter.restrictions,
    );
    return {
      workflow: "forms",
      encounter,
      lifecycle: started ? "started" : "empty",
    };
  };

  const read = (workflow: ClinicalWorkflow) => {
    const state = bridge();
    switch (workflow) {
      case "injection":
        return normalizeInjection(state);
      case "uds":
        return normalizeUds(state);
      case "samples":
        return normalizeSamples(state);
      case "forms":
        return normalizeForms(state);
    }
  };

  const patientFields: Record<
    ClinicalWorkflow,
    { name: string; dob: string }
  > = {
    injection: { name: "ptName", dob: "ptDOB" },
    uds: { name: "udsPtName", dob: "udsDOB" },
    samples: { name: "samplePtName", dob: "sampleDOB" },
    forms: { name: "formsPtName", dob: "formsDOB" },
  };

  const applyPatientIfEmpty = (
    workflow: ClinicalWorkflow,
    patient: PatientIdentity,
  ): boolean => {
    if (isEmptyPatient(patient)) return false;
    const fields = patientFields[workflow];
    const name = control(fields.name) as HTMLInputElement | null;
    const dob = control(fields.dob) as HTMLInputElement | null;
    if (!name || !dob || name.value.trim() || dob.value.trim()) return false;
    name.value = patient.name;
    dob.value = patient.dob;
    for (const field of [name, dob]) {
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  };

  return {
    read,
    applyPatientIfEmpty,
  };
}
