import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import goldenFixture from "../fixtures/clinical-parity-v1.json";
import {
  FormsEngine,
  InjectionEngine,
  SamplesEngine,
  UDS_PANELS,
  UdsEngine,
  confirmSampleReview,
  emptyFormsEncounter,
  emptyInjectionEncounter,
  emptyInjectionInitiation,
  emptySamplesEncounter,
  emptyUdsEncounter,
  type FormsEncounter,
  type InjectionEncounter,
  type SamplesEncounter,
  type UdsEncounter,
} from "../../src/domain";
import {
  DocumentationEngine,
  type FormsDocumentationInput,
  type InjectionDocumentationInput,
  type SamplesDocumentationInput,
  type UdsDocumentationInput,
} from "../../src/documentation";
import {
  INJECTION_RECORDS_STORAGE_KEY,
  InjectionRecordRepository,
  SafeStorage,
  type StorageLike,
} from "../../src/persistence";

const BASELINE = {
  commit: "bc4a255d351793b59184760b537c7aef9abcf0bb",
  shortCommit: "bc4a255",
  indexBlob: "2db13bcc1d79374f40364d22ef2fe675881ddef9",
  browserTestBlob: "3e0b705308442460d87b06f518d58da2d994d6dd",
  branch: "origin/main",
  capturedAt: "2026-07-30T21:08:23.000Z",
  captureMethod:
    "Typed parity projection from the production monolith, storage records, note outputs, and print roots at the named baseline commit.",
} as const;

const PRINT_MODELS = [
  {
    workflow: "injection",
    id: "avsSheet",
    printClass: "print-avs",
    title: "Injection after-visit summary",
  },
  {
    workflow: "forms",
    id: "letterSheet",
    printClass: "print-letter",
    title: "Provider Letter",
  },
  {
    workflow: "uds",
    id: "udsSheet",
    printClass: "print-uds",
    title: "Point-of-Care Urine Drug Screen Report",
  },
  {
    workflow: "uds",
    id: "udsPatientSheet",
    printClass: "print-uds-patient",
    title: "Urine drug screen visit summary",
  },
  {
    workflow: "forms",
    id: "dailySheet",
    printClass: "print-daily",
    title: "Daily Activity Closeout",
  },
  {
    workflow: "samples",
    id: "sampleSheet",
    printClass: "print-sample",
    title: "Medication sample instructions",
  },
  {
    workflow: "samples",
    id: "sampleWorksheetSheet",
    printClass: "print-sample-worksheet",
    title: "Sample Dispensing Worksheet",
  },
  {
    workflow: "injection",
    id: "injWorksheetSheet",
    printClass: "print-inj-worksheet",
    title: "Injection Start Worksheet",
  },
] as const;

const routineAttestations = {
  id2: true,
  rights: true,
  allergy: true,
  consent: true,
  screen: true,
  hygiene: true,
};

const routineSustennaEncounter = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "PARITY, ROUTINE", dob: "01/01/1990" },
  medicationKey: "sustenna",
  dose: "156 mg",
  route: "IM",
  site: "L deltoid",
  intervalKey: "q4wk",
  reason: "initiation",
  priorSite: "R deltoid",
  administrationDate: "2026-01-08",
  nextDoseDate: "2026-02-05",
  orderingProvider: "A. Provider, PMHNP",
  administeredBy: "M. Staff, MA",
  administrationTime: "09:15",
  allergies: "NKDA verified",
  traceability: {
    ndc: "50458-0564-01",
    lot: "SUS-A",
    expiration: "2027-12",
  },
  vitals: { bp: "118/74", hr: "72", temperature: "98.4 F" },
  response: { kind: "well" },
  attestations: routineAttestations,
  verifications: { resuspend: true, invegaInit: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  initiation: {
    ...emptyInjectionInitiation(),
    protocol: "sustenna-day8",
    planVerified: true,
    sustennaOrder: "standard",
    day1Date: "2026-01-01",
  },
  details: {
    purpose: "Day 8 initiation",
    productSource: "Clinic stock",
    preparation: "Inspected and mixed per current product instructions",
    volume: "1",
    volumeUnit: "mL",
    device: "Prefilled syringe",
    siteCondition: "Skin/site intact before administration",
  },
});

const pairedSameMuscleEncounter = (): InjectionEncounter => ({
  ...emptyInjectionEncounter(),
  patient: { name: "PARITY, EXCEPTION", dob: "02/02/1985" },
  medicationKey: "maintena",
  dose: "400 mg",
  route: "IM",
  site: "R deltoid",
  intervalKey: "q4wk",
  reason: "initiation",
  administrationDate: "2026-07-30",
  nextDoseDate: "2026-08-27",
  orderingProvider: "B. Provider, MD",
  administeredBy: "M. Staff, MA",
  administrationTime: "11:02",
  secondAdministrationTime: "11:07",
  allergies: "No known medication allergies documented",
  traceability: {
    ndc: "59148-0072-80",
    lot: "MAIN-A",
    expiration: "2028-03",
  },
  response: { kind: "well" },
  attestations: routineAttestations,
  verifications: { resuspend: true },
  acuteSafetyScreenConfirmed: true,
  disposition: { kind: "administered" },
  initiation: {
    ...emptyInjectionInitiation(),
    protocol: "maintena-1day",
    planVerified: true,
    oralStatus: "administered",
    second: {
      dose: "400 mg",
      site: "R deltoid",
      ndc: "59148-0072-80",
      lot: "MAIN-B",
      expiration: "2028-04",
      given: true,
      orderVerified: true,
      note: "Component 2 from a separately traced kit.",
    },
  },
});

const routineInjectionDocumentation: InjectionDocumentationInput = {
  chiefComplaint: {
    summary: "Invega Sustenna Day 8 initiation visit.",
    visitType: "LAI initiation",
    purpose: "Day 8 dose per active order",
    encounterDate: "Jan 8, 2026",
  },
  disposition: { kind: "administered" },
  preAdministration: {
    orderPurpose: "Day 8 initiation",
    orderVerification: "Day 1 record and active Day 8 order verified",
    previousDoseDate: "Jan 1, 2026",
    previousSite: "Right deltoid",
    timingReview: "Scheduled on calculated Day 8 target",
    allergiesReview: "NKDA verified",
    vitals: {
      bloodPressure: "118/74",
      heartRate: "72",
      temperature: "98.4 F",
    },
    reviewItems: [
      "Patient identity and medication rights verified.",
      "Left deltoid selected for site rotation.",
    ],
  },
  components: [
    {
      medication: "Invega Sustenna",
      dose: "156 mg",
      route: "IM",
      site: "Left deltoid",
      administrationDate: "Jan 8, 2026",
      administrationTime: "9:15 AM",
      administeredBy: "M. Staff, MA",
      amount: "1 mL",
      device: "Prefilled syringe",
      siteCondition: "Skin/site intact before administration",
      response: "Tolerated without immediate concern reported by staff.",
      ndc: "50458-0564-01",
      lot: "SUS-A",
      expiration: "12/2027",
      source: "Clinic stock",
      preparation: "Inspected and mixed per current product instructions",
    },
  ],
  initiation: {
    kind: "sustenna-day-8",
    orderVerification: "Day 1 record and active Day 8 order verified",
    day1Date: "Jan 1, 2026",
    day8TargetDate: "Jan 8, 2026",
    windowStart: "Jan 4, 2026",
    windowEnd: "Jan 12, 2026",
    scheduledOrAdministeredDate: "Jan 8, 2026",
    timingReview: "Given on target date",
  },
  followUp: {
    nextDoseDate: "Feb 5, 2026",
    orderingProvider: "A. Provider, PMHNP",
    appointmentStatus: "Return date reviewed with patient",
  },
};

const exceptionalInjectionDocumentation: InjectionDocumentationInput = {
  chiefComplaint: {
    summary: "Aripiprazole one-day initiation requires correction.",
  },
  disposition: { kind: "administered" },
  components: [
    {
      label: "Component 1",
      medication: "Abilify Maintena",
      dose: "400 mg",
      route: "IM",
      site: "Right deltoid",
      administrationTime: "11:02 AM",
      ndc: "59148-0072-80",
      lot: "MAIN-A",
      expiration: "03/2028",
    },
    {
      label: "Component 2",
      medication: "Abilify Maintena",
      dose: "400 mg",
      route: "IM",
      site: "Right deltoid",
      administrationTime: "11:07 AM",
      ndc: "59148-0072-80",
      lot: "MAIN-B",
      expiration: "04/2028",
    },
  ],
  initiation: {
    kind: "aripiprazole-two-injection",
    orderVerification: "One-day initiation order verified",
    oralDose: "Aripiprazole PO dose administered per active order",
    notes: [
      "Both documented components currently identify the same muscle; correct the site record before finalization.",
    ],
  },
  exception: {
    summary: "Separate-muscle requirement is not satisfied by the entered sites.",
    notified: "B. Provider, MD",
    notificationTime: "Jul 30, 2026 at 11:12 AM",
    direction: "Hold finalization and reconcile the actual sites.",
    nextStep: "Correct the component site documentation before locking.",
  },
};

const routineUdsEncounter = (): UdsEncounter => ({
  ...emptyUdsEncounter(),
  patient: { name: "PARITY, ROUTINE", dob: "03/03/1991" },
  collectionDateTime: "2026-07-30T09:00",
  reason: "routine",
  device: "SAFE life 14-Panel Cup",
  physicalReadingsVerified: true,
  lot: "UDS-A",
  expiration: "2027-06",
  collector: "M. Staff, MA",
  temperature: "acceptable",
  control: "valid",
  validity: "acceptable",
  medicationAlignment: "no unexpected",
  results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, "neg"])),
  labPlan: "provider to decide",
});

const exceptionalUdsEncounter = (): UdsEncounter => {
  const results = Object.fromEntries(
    UDS_PANELS.map((panel) => [panel, "neg"]),
  ) as UdsEncounter["results"];
  results.THC = "pos";
  results.MET = "invalid";
  return {
    ...emptyUdsEncounter(),
    patient: { name: "PARITY, EXCEPTION", dob: "04/04/1986" },
    collectionDateTime: "2026-07-30T10:20",
    reason: "ordered",
    device: "SAFE life 13-Panel Cup",
    omittedPanel: "PPX",
    physicalReadingsVerified: true,
    lot: "UDS-B",
    expiration: "2027-08",
    collector: "M. Staff, MA",
    temperature: "acceptable",
    control: "valid",
    validity: "acceptable",
    medicationAlignment: "not aligned",
    results,
    labPlan: "recommended",
  };
};

const routineUdsDocumentation: UdsDocumentationInput = {
  summary: "Point-of-care UDS completed for routine monitoring.",
  patient: "PARITY, ROUTINE",
  dob: "03/03/1991",
  collection: {
    reason: "Routine monitoring",
    collectedAt: "Jul 30, 2026 at 9:00 AM",
    collectedBy: "M. Staff, MA",
    specimen: "Urine",
    device: "SAFE life 14-Panel Cup",
    lot: "UDS-A",
    expiration: "06/2027",
    temperature: "Acceptable",
  },
  controlReview: {
    control: "Valid control line observed",
    validity: "Acceptable validity markers",
    integrity: ["Physical cup and displayed panel readings verified."],
  },
  resultGroups: [
    {
      label: "All displayed panels",
      results: UDS_PANELS.map((panel) => ({
        analyte: panel,
        result: "Negative",
      })),
    },
  ],
  medicationAlignment: "No unexpected findings noted by staff.",
  plan: ["Route to ordering clinician for review in clinical context."],
  outsideLabPlan: "Provider to decide.",
};

const exceptionalUdsDocumentation: UdsDocumentationInput = {
  summary: "Point-of-care UDS requires device-profile and clinician review.",
  patient: "PARITY, EXCEPTION",
  dob: "04/04/1986",
  collection: {
    reason: "Provider ordered",
    collectedAt: "Jul 30, 2026 at 10:20 AM",
    collectedBy: "M. Staff, MA",
    specimen: "Urine",
    device: "SAFE life 13-Panel Cup",
    lot: "UDS-B",
    expiration: "08/2027",
    temperature: "Acceptable",
  },
  controlReview: {
    control: "Valid control line observed",
    validity: "Physical panel profile does not reconcile",
    integrity: [
      "PPX is identified as omitted from the physical cup but has an entered result.",
    ],
  },
  resultGroups: [
    {
      label: "Flagged panels",
      results: [
        { analyte: "THC", result: "Preliminary positive" },
        { analyte: "MET", result: "Invalid / unreadable" },
        { analyte: "PPX", result: "Entered but not present on device" },
      ],
    },
  ],
  medicationAlignment: "Findings are not readily aligned to the available list.",
  clinicianAttention: [
    "Preliminary THC positive requires clinician review.",
    "MET is invalid and must not be interpreted.",
    "Correct the omitted-panel reconciliation before finalization.",
  ],
  patientContext: "No additional patient explanation documented by staff.",
  plan: [
    "Route screen to the ordering clinician for interpretation.",
    "Do not finalize the 13-panel profile until PPX is marked Not tested.",
  ],
  outsideLabPlan: "Confirmation recommended if clinically indicated.",
};

const routineSamplesEncounter = (): SamplesEncounter => ({
  ...emptySamplesEncounter(),
  patient: { name: "PARITY, ROUTINE", dob: "05/05/1992" },
  prescriber: "A. Provider, PMHNP",
  staff: "M. Staff, MA",
  dispenseDate: "2026-07-30",
  startDate: "2026-07-31",
  medicationKey: "vraylar",
  medicationLabel: "Vraylar 1.5 mg",
  quantity: "1 package / 7 capsules",
  directions: "Take one capsule by mouth daily as directed.",
  purpose: "Starter supply",
  medicationReview: "Prescriber reviewed / ok to dispense",
  education: "Reviewed with patient",
  packages: [
    {
      id: "primary",
      label: "Starter package",
      medicationStrength: "Vraylar 1.5 mg",
      quantity: "7 capsules",
      lot: "SAMPLE-A",
      expiration: "2027-10",
    },
  ],
  plan: [],
});

const exceptionalSamplesEncounter = (): SamplesEncounter => ({
  ...emptySamplesEncounter(),
  patient: { name: "PARITY, EXCEPTION", dob: "06/06/1988" },
  prescriber: "B. Provider, MD",
  staff: "M. Staff, MA",
  dispenseDate: "2026-07-30",
  startDate: "2026-07-31",
  medicationKey: "vraylar",
  medicationLabel: "Vraylar titration",
  quantity: "2 packages",
  directions: "Follow the two-step prescriber sequence.",
  purpose: "Starter titration",
  medicationReview: "Pending provider confirmation",
  education: "Needs additional counseling",
  packages: [
    {
      id: "starter",
      label: "Starter package",
      medicationStrength: "Vraylar 1.5 mg",
      quantity: "7 capsules",
      lot: "SAMPLE-B1",
      expiration: "2027-10",
    },
    {
      id: "continuation",
      label: "Continuation package",
      medicationStrength: "Vraylar 3 mg",
      quantity: "7 capsules",
      lot: "SAMPLE-B2",
      expiration: "2026-06",
    },
  ],
  plan: [
    {
      id: "step-1",
      strength: "1.5 mg",
      quantity: "7 capsules",
      days: "7",
      directions: "Take one capsule daily for 7 days.",
    },
    {
      id: "step-2",
      strength: "3 mg",
      quantity: "7 capsules",
      days: "7",
      directions: "Then take one capsule daily as directed.",
    },
  ],
  review: {
    confirmedAt: "2026-07-30T10:30:00",
    fingerprint: "stale-baseline-fingerprint",
  },
});

const routineSamplesDocumentation: SamplesDocumentationInput = {
  summary: "Oral medication sample provided per prescriber direction.",
  patient: "PARITY, ROUTINE",
  dob: "05/05/1992",
  purpose: "Starter supply",
  prescriber: "A. Provider, PMHNP",
  dispensedBy: "M. Staff, MA",
  packages: [
    {
      label: "Starter package",
      medication: "Vraylar",
      strength: "1.5 mg",
      dosageForm: "Capsules",
      quantity: "7 capsules",
      packageId: "Primary package",
      lot: "SAMPLE-A",
      expiration: "10/2027",
    },
  ],
  patientInstructions: [
    "Take one capsule by mouth daily as directed.",
  ],
  counseling: [
    "Medication review and patient education completed.",
  ],
  handoutStatus: "Provided",
  reviewedToday: {
    reviewedAt: "Jul 30, 2026 at 10:00 AM",
    reviewedBy: "M. Staff, MA",
  },
  followUp: ["Call the clinic before changing the prescribed plan."],
};

const exceptionalSamplesDocumentation: SamplesDocumentationInput = {
  summary: "Sample dispense remains blocked pending package and counseling review.",
  patient: "PARITY, EXCEPTION",
  dob: "06/06/1988",
  purpose: "Starter titration",
  prescriber: "B. Provider, MD",
  dispensedBy: "M. Staff, MA",
  packages: [
    {
      label: "Starter package",
      medication: "Vraylar",
      strength: "1.5 mg",
      dosageForm: "Capsules",
      quantity: "7 capsules",
      packageId: "Package 1 of 2",
      lot: "SAMPLE-B1",
      expiration: "10/2027",
    },
    {
      label: "Continuation package",
      medication: "Vraylar",
      strength: "3 mg",
      dosageForm: "Capsules",
      quantity: "7 capsules",
      packageId: "Package 2 of 2",
      lot: "SAMPLE-B2",
      expiration: "06/2026",
    },
  ],
  planSteps: [
    {
      medication: "Vraylar",
      strength: "1.5 mg",
      quantity: "7 capsules",
      dateRange: "Jul 31–Aug 6, 2026",
      directions: "Take one capsule daily for 7 days.",
    },
    {
      medication: "Vraylar",
      strength: "3 mg",
      quantity: "7 capsules",
      dateRange: "Aug 7–Aug 13, 2026",
      directions: "Then take one capsule daily as directed.",
    },
  ],
  counseling: [
    "Additional counseling remains required before dispensing.",
  ],
  patientContext: "Final reviewed-today confirmation is stale.",
  handoutStatus: "Draft only",
  followUp: [
    "Replace the expired continuation package.",
    "Confirm the sequence and counseling before output.",
  ],
};

const routineFormsEncounter = (): FormsEncounter => ({
  ...emptyFormsEncounter(),
  patient: { name: "PARITY, ROUTINE", dob: "07/07/1989" },
  requestType: "work",
  status: "completed",
  letterType: "dx",
  requestDate: "2026-07-29",
  targetDate: "2026-07-30",
  provider: "A. Provider, PMHNP",
  staff: "M. Staff, MA",
  feeStatus: "No fee / not applicable",
  deliveryMethod: "Patient portal",
  notificationStatus: "Portal message sent",
  notes: "Diagnosis verification letter completed.",
  diagnosisWording: "Provider-approved clinical wording.",
  providerApprovalConfirmed: true,
});

const exceptionalFormsEncounter = (): FormsEncounter => ({
  ...emptyFormsEncounter(),
  patient: { name: "PARITY, EXCEPTION", dob: "08/08/1984" },
  requestType: "work",
  status: "ready",
  letterType: "return",
  requestDate: "2026-07-30",
  targetDate: "2026-07-31",
  provider: "B. Provider, MD",
  staff: "M. Staff, MA",
  feeStatus: "No fee / not applicable",
  deliveryMethod: "Patient portal after approval",
  notificationStatus: "Patient advised request is under review",
  notes: "Return-to-work draft is ready for provider review.",
  returnDate: "2026-08-03",
  restrictions: "Return without restrictions if approved by provider.",
  providerApprovalConfirmed: false,
});

const routineFormsDocumentation: FormsDocumentationInput = {
  summary: "Diagnosis verification letter completed.",
  patient: "PARITY, ROUTINE",
  dob: "07/07/1989",
  requestCategory: "Work / school",
  documentType: "Diagnosis verification letter",
  requestDate: "Jul 29, 2026",
  requestNotes: "Provider-approved clinical wording used.",
  status: "Completed",
  assignedProvider: "A. Provider, PMHNP",
  assignedStaff: "M. Staff, MA",
  targetDate: "Jul 30, 2026",
  feeStatus: "No fee / not applicable",
  deliveryMethod: "Patient portal",
  patientNotification: "Portal message sent",
  approvalStatus: "Provider approval confirmed",
  actions: ["Final letter saved for release."],
  followUp: ["No additional operational follow-up documented."],
};

const exceptionalFormsDocumentation: FormsDocumentationInput = {
  summary: "Return-to-work letter draft requires provider approval.",
  patient: "PARITY, EXCEPTION",
  dob: "08/08/1984",
  requestCategory: "Work / school",
  documentType: "Return-to-work letter",
  requestDate: "Jul 30, 2026",
  requestNotes: "Requested return date is Aug 3, 2026.",
  status: "Provider review",
  assignedProvider: "B. Provider, MD",
  assignedStaff: "M. Staff, MA",
  targetDate: "Jul 31, 2026",
  feeStatus: "No fee / not applicable",
  deliveryMethod: "Patient portal after approval",
  patientNotification: "Patient advised request is under review",
  actions: ["Draft routed to assigned provider."],
  followUp: ["Release only after provider approval is documented."],
};

const projectInjection = (
  encounter: InjectionEncounter,
  context: { today: string },
) => {
  const result = InjectionEngine.evaluate(encounter, context);
  const medication = result.output.medication;
  // The pre-cutover parity golden deliberately records the legacy timing
  // shape. Calendar-cadence dates and clinical-reference metadata are covered
  // by the new Injection unit suite rather than mutating that historical
  // comparison fixture.
  const {
    expectedDate: _expectedDate,
    earliestDate: _earliestDate,
    latestDate: _latestDate,
    cadenceLabel: _cadenceLabel,
    ...timing
  } = result.output.timing;
  const { expectedNextDoseDate: _expectedNextDoseDate, ...calculatedDates } = result.calculatedDates;
  return {
    workflow: result.workflow,
    readiness: result.readiness,
    stops: result.stops,
    warnings: result.warnings,
    recommendations: result.recommendations,
    calculatedDates,
    decisions: {
      medication: medication
        ? {
            key: medication.key,
            label: medication.label,
            intervalKey: medication.intervalKey,
            timingMode: medication.timingMode ?? "window",
          }
        : null,
      timing,
      allowedRoutes: result.output.allowedRoutes,
      allowedSites: result.output.allowedSites,
      recommendedSite: result.output.recommendedSite,
      repeatsPreviousSite: result.output.repeatsPreviousSite,
      administrationDocumented: result.output.administrationDocumented,
      canFinalize: result.output.canFinalize,
      recordStatus: result.output.recordStatus,
      initiationProtocol: result.output.initiationProtocol,
    },
  };
};

const projectUds = (encounter: UdsEncounter, context: { today: string }) => {
  const result = UdsEngine.evaluate(encounter, context);
  return {
    workflow: result.workflow,
    readiness: result.readiness,
    stops: result.stops,
    warnings: result.warnings,
    recommendations: result.recommendations,
    calculatedDates: result.calculatedDates,
    decisions: result.output,
  };
};

const projectSamples = (
  encounter: SamplesEncounter,
  context: { today: string },
) => {
  const result = SamplesEngine.evaluate(encounter, context);
  const { currentFingerprint: _fingerprint, ...decisions } = result.output;
  return {
    workflow: result.workflow,
    readiness: result.readiness,
    stops: result.stops,
    warnings: result.warnings,
    recommendations: result.recommendations,
    calculatedDates: result.calculatedDates,
    decisions,
  };
};

const projectForms = (encounter: FormsEncounter) => {
  const result = FormsEngine.evaluate(encounter, {});
  return {
    workflow: result.workflow,
    readiness: result.readiness,
    stops: result.stops,
    warnings: result.warnings,
    recommendations: result.recommendations,
    calculatedDates: result.calculatedDates,
    decisions: result.output,
  };
};

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const capturePersistenceParity = () => {
  const memory = new MemoryStorage();
  memory.values.set(
    INJECTION_RECORDS_STORAGE_KEY,
    JSON.stringify([
      {
        id: "draft-parity",
        type: "injection",
        status: "draft",
        createdAt: "2026-01-01T08:00:00.000Z",
        updatedAt: "2026-01-01T08:00:00.000Z",
        completedAt: "",
        patient: { name: "LEGACY, PATIENT", dob: "09/09/1979" },
        summary: "Legacy Sustenna draft",
        snapshot: {
          version: 3,
          medKey: "sustenna",
          state: {
            dose: "117 mg",
            futureStateField: { keep: "state-value" },
          },
          initiation: { futureInitiationField: "keep-initiation" },
          smartVitals: { bp: "120/80" },
          disposition: { kind: "" },
          fields: { lot: "LEGACY-LOT", futureFieldValue: 42 },
          safetyNone: false,
          note: {
            cc: "Legacy CC",
            as: "Legacy assessment",
            pl: "Legacy plan",
            futureNoteField: "keep-note",
          },
          futureSnapshotField: { keep: true },
        },
        addenda: [],
        futureRecordField: "keep-record",
      },
    ]),
  );

  let timestamp = "2026-07-30T10:00:00.000Z";
  const repository = new InjectionRecordRepository(new SafeStorage(memory), {
    now: () => timestamp,
    createAddendumId: () => "add-parity-1",
  });
  const beforeOpenWrites = memory.writes;
  const opened = repository.open("draft-parity");
  const openWrites = memory.writes - beforeOpenWrites;
  if (!opened.ok) throw new Error(opened.error.message);

  const update = {
    id: "draft-parity",
    patient: { name: "PARITY, PERSISTENCE", dob: "09/09/1979" },
    summary: "Invega Sustenna 156 mg",
    snapshot: {
      medKey: "sustenna",
      state: { dose: "156 mg", site: "L deltoid" },
      fields: { lot: "UPDATED-LOT" },
      safetyNone: true,
      note: {
        cc: "Updated CC",
        as: "Updated assessment",
        pl: "Updated plan",
      },
    },
  };
  const draft = repository.saveDraft(update);
  if (!draft.ok) throw new Error(draft.error.message);

  timestamp = "2026-07-30T10:30:00.000Z";
  const completed = repository.complete(update);
  if (!completed.ok) throw new Error(completed.error.message);
  const lockedSnapshot = JSON.stringify(completed.value.snapshot);

  const immutableEdit = repository.saveDraft(update);
  timestamp = "2026-07-30T11:00:00.000Z";
  const addendum = repository.addAddendum({
    recordId: "draft-parity",
    author: "M. Staff, MA",
    text: "Clarified the documented return instructions.",
  });
  if (!addendum.ok) throw new Error(addendum.error.message);

  return {
    storageKey: INJECTION_RECORDS_STORAGE_KEY,
    openedWithoutRewrite: openWrites === 0,
    draft: {
      status: draft.value.status,
      version: draft.value.snapshot.version,
      createdAt: draft.value.createdAt,
      updatedAt: draft.value.updatedAt,
      completedAt: draft.value.completedAt,
      patient: draft.value.patient,
      state: draft.value.snapshot.state,
      fields: draft.value.snapshot.fields,
      note: draft.value.snapshot.note,
      futureSnapshotField: draft.value.snapshot.futureSnapshotField,
      futureRecordField: draft.value.futureRecordField,
    },
    completed: {
      status: completed.value.status,
      version: completed.value.snapshot.version,
      createdAt: completed.value.createdAt,
      updatedAt: completed.value.updatedAt,
      completedAt: completed.value.completedAt,
      futureSnapshotField: completed.value.snapshot.futureSnapshotField,
      futureRecordField: completed.value.futureRecordField,
    },
    immutableEdit: immutableEdit.ok
      ? { ok: true }
      : {
          ok: false,
          code: immutableEdit.error.code,
          message: immutableEdit.error.message,
        },
    addendum: addendum.value.addenda,
    snapshotUnchangedAfterAddendum:
      JSON.stringify(addendum.value.snapshot) === lockedSnapshot,
  };
};

const projectDocumentation = (
  workflow: "injection" | "uds" | "samples" | "forms",
  input:
    | InjectionDocumentationInput
    | UdsDocumentationInput
    | SamplesDocumentationInput
    | FormsDocumentationInput,
) => {
  const result = DocumentationEngine.format(
    workflow,
    input as never,
  );
  return {
    workflow: result.workflow,
    sections: result.sections,
  };
};

const capturePrintParity = () => {
  const markupPath = fileURLToPath(
    new URL("../../src/legacy/legacy-markup.html", import.meta.url),
  );
  const runtimePath = fileURLToPath(
    new URL("../../public/legacy/legacy-runtime.js", import.meta.url),
  );
  const markup = readFileSync(markupPath, "utf8");
  const runtime = readFileSync(runtimePath, "utf8");
  return PRINT_MODELS.map((model) => ({
    ...model,
    rootPresent: new RegExp(
      `id=["']${model.id}["']`,
    ).test(markup),
    titlePresent: runtime.includes(model.title),
    printClassPresent: runtime.includes(model.printClass),
  }));
};

const captureParity = () => {
  const routineSample = confirmSampleReview(
    routineSamplesEncounter(),
    "2026-07-30T10:00:00",
  );
  return {
    fixtureVersion: 1,
    fixtureId: "clinical-desktop-2004-parity-v1",
    baseline: BASELINE,
    scenarios: {
      injection: [
        {
          id: "injection-routine-sustenna-day8",
          kind: "routine",
          description:
            "Day 8 Invega Sustenna administration on target with site rotation and complete traceability.",
          engine: projectInjection(routineSustennaEncounter(), {
            today: "2026-01-08",
          }),
          documentation: projectDocumentation(
            "injection",
            routineInjectionDocumentation,
          ),
        },
        {
          id: "injection-exception-paired-same-muscle",
          kind: "exceptional",
          description:
            "One-day aripiprazole initiation with two separately traced components entered in the same muscle.",
          engine: projectInjection(pairedSameMuscleEncounter(), {
            today: "2026-07-30",
          }),
          documentation: projectDocumentation(
            "injection",
            exceptionalInjectionDocumentation,
          ),
        },
      ],
      uds: [
        {
          id: "uds-routine-14-panel-negative",
          kind: "routine",
          description:
            "Verified in-date 14-panel cup with valid control and all displayed panels negative.",
          engine: projectUds(routineUdsEncounter(), {
            today: "2026-07-30",
          }),
          documentation: projectDocumentation("uds", routineUdsDocumentation),
        },
        {
          id: "uds-exception-13-panel-profile",
          kind: "exceptional",
          description:
            "Thirteen-panel profile with an entered result for the omitted panel, a preliminary positive, and an invalid panel.",
          engine: projectUds(exceptionalUdsEncounter(), {
            today: "2026-07-30",
          }),
          documentation: projectDocumentation(
            "uds",
            exceptionalUdsDocumentation,
          ),
        },
      ],
      samples: [
        {
          id: "samples-routine-reviewed-package",
          kind: "routine",
          description:
            "Single in-date physical package with medication review, counseling, and a current reviewed-today fingerprint.",
          engine: projectSamples(routineSample, { today: "2026-07-30" }),
          documentation: projectDocumentation(
            "samples",
            routineSamplesDocumentation,
          ),
        },
        {
          id: "samples-exception-expired-multistep",
          kind: "exceptional",
          description:
            "Two-step sample plan with an expired continuation package and stale final review.",
          engine: projectSamples(exceptionalSamplesEncounter(), {
            today: "2026-07-30",
          }),
          documentation: projectDocumentation(
            "samples",
            exceptionalSamplesDocumentation,
          ),
        },
      ],
      forms: [
        {
          id: "forms-routine-approved-completed",
          kind: "routine",
          description:
            "Completed diagnosis-verification request with provider approval and patient notification.",
          engine: projectForms(routineFormsEncounter()),
          documentation: projectDocumentation(
            "forms",
            routineFormsDocumentation,
          ),
        },
        {
          id: "forms-exception-release-not-approved",
          kind: "exceptional",
          description:
            "Return-to-work draft marked ready but not yet approved for release by the provider.",
          engine: projectForms(exceptionalFormsEncounter()),
          documentation: projectDocumentation(
            "forms",
            exceptionalFormsDocumentation,
          ),
        },
      ],
    },
    persistence: capturePersistenceParity(),
    printModels: capturePrintParity(),
  };
};

describe("bc4a255 clinical behavior parity", () => {
  it("matches the reviewed typed, documentation, storage, and print golden", () => {
    expect(captureParity()).toEqual(goldenFixture);
  });
});
