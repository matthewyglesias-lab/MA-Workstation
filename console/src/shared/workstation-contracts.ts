import { z } from "zod";
import { uuid, date } from "./contracts.js";

/** Supplemental staff-entered facts only. Identity, medication, stock, dates and
 * actual administration are derived from the console's authoritative records. */
const s = (max = 2000) => z.string().trim().max(max);
const bools = <T extends readonly [string, ...string[]]>(keys: T) =>
  z.partialRecord(z.enum(keys), z.boolean());
const medicationKey = z.enum([
  "aristada",
  "initio",
  "sustenna",
  "erzofri",
  "trinza",
  "hafyera",
  "uzedy",
  "maintena",
  "asimtufii",
  "vivitrol",
  "haldol",
  "prolixin",
  "other",
]);
const ndcSelection = z
  .object({
    ndc: s(60).optional(),
    source: z.enum(["bundled", "remote", "custom"]).optional(),
    packageLabel: s(500).optional(),
    package: s(500).optional(),
    labeler: s(300).optional(),
    packageKind: z.enum(["commercial", "sample"]).optional(),
    medicationKey: medicationKey.or(z.literal("")).optional(),
    dose: s(100).optional(),
    referenceVersion: s(100).optional(),
  })
  .strict();
export const workstationDetails = z
  .object({
    purpose: s().optional(),
    productSource: s(300).optional(),
    volume: s(100).optional(),
    volumeUnit: s(40).optional(),
    device: s(300).optional(),
    deviceOther: s(500).optional(),
    siteCondition: s(300).optional(),
    siteConditionOther: s(500).optional(),
    waste: z.boolean().optional(),
    wasteAmount: s(300).optional(),
    wasteWitness: s(160).optional(),
    productIssue: z.boolean().optional(),
    productIssueDetail: s().optional(),
    productIssueAction: s().optional(),
    productIssueRecipient: s(160).optional(),
    productIssueNotificationTime: s(100).optional(),
    productIssueDirection: s().optional(),
    productIssueNextStep: s().optional(),
    administrationException: z.boolean().optional(),
    exceptionSummary: s().optional(),
    exceptionRecipient: s(160).optional(),
    exceptionTime: s(100).optional(),
    exceptionOutcome: s().optional(),
    lateDoseReview: z.enum(["", "provider-authorized", "other"]).optional(),
    lateDoseReviewNote: s().optional(),
    lateDoseReviewProvider: s(160).optional(),
    lateDoseReviewTime: s(100).optional(),
    lateDoseReviewFingerprint: s(5000).optional(),
    siteAssessed: z.boolean().optional(),
    postInjectionObservation: z.boolean().optional(),
    educationProvided: z.boolean().optional(),
    departureStatus: z
      .enum([
        "",
        "ambulatory",
        "observed",
        "escorted",
        "wheelchair",
        "continued-observation",
        "provider-evaluation",
        "custom",
      ])
      .optional(),
    departureStatusNote: s().optional(),
    ndcSelection: z
      .object({
        primary: ndcSelection.optional(),
        pairedSecond: ndcSelection.optional(),
      })
      .strict()
      .optional(),
    nextDose: z
      .object({
        value: s(10).optional(),
        source: z.enum(["calculated", "manual"]).optional(),
        calculatedFrom: s(5000).optional(),
        overrideKind: z.enum(["active-order", "provider-direction"]).optional(),
        overrideReason: s().optional(),
        overrideProvider: s(160).optional(),
        recordedAt: s(100).optional(),
      })
      .strict()
      .optional(),
    clinicalReferenceVersion: s(100).optional(),
  })
  .strict();
export const workstationState = z
  .object({
    intervalKey: z.enum([
      "",
      "q1wk",
      "q2wk",
      "q3wk",
      "q4wk",
      "q6wk",
      "q8wk",
      "q12wk",
      "q26wk",
      "once",
    ]),
    reason: z.enum(["", "scheduled", "initiation", "reinit", "loading", "prn"]),
    priorSite: s(100),
    technique: s(500),
    habitus: z.enum(["lean", "average", "larger"]).optional(),
    response: z
      .object({
        kind: z.enum([
          "",
          "well",
          "bleed",
          "disc",
          "obsok",
          "flowres",
          "devicehold",
          "reaction",
          "vasovagal",
          "anxiety",
          "custom",
        ]),
        detail: s(300).optional(),
        custom: s().optional(),
      })
      .strict(),
    attestations: bools([
      "id2",
      "rights",
      "allergy",
      "consent",
      "prior",
      "screen",
      "hygiene",
    ]),
    verifications: bools([
      "opioidFree",
      "naltrexHS",
      "suppliedNeedle",
      "resuspend",
      "visualInspection",
      "invegaInit",
      "oralOverlap",
      "stabilized",
      "paliperidoneTolerability",
      "aripiprazoleTolerability",
      "glutealOnly",
      "noMassage",
      "deepZtrack",
    ]),
    acuteSafetyScreenConfirmed: z.boolean(),
    activeSafetyConcerns: z.array(s(100)).max(30),
    recordingMode: z.enum(["prospective", "retrospective"]).optional(),
    retrospectiveReason: s(2000).optional(),
    stockNotPreviouslyRecorded: z.boolean().optional(),
    pairedCaseId: uuid.optional(),
    priorMaintenanceDoses: z.number().int().min(0).max(10000).optional(),
    oral: z
      .object({
        product: s(200).min(1),
        dose: s(200).min(1),
        status: z.enum(["administered", "verified"]),
        administeredAt: z.iso.datetime({ offset: true }).optional(),
        source: s(1000).min(1),
        startOn: date.optional(),
        endOn: date.optional(),
      })
      .strict()
      .optional(),
    initiation: z
      .object({
        version: z.number().int().min(1).max(100).optional(),
        protocol: z.enum([
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
        ]),
        planVerified: z.boolean(),
        oralStatus: z.enum(["", "administered", "verified"]),
        providerNote: s(),
        sustennaOrder: z.enum(["", "standard", "mild", "other"]),
        day1Date: s(10),
        second: z
          .object({
            productKey: medicationKey.optional(),
            dose: s(100),
            site: s(100),
            ndc: s(60),
            lot: s(100),
            expiration: s(10),
            given: z.literal(false),
            orderVerified: z.boolean(),
            note: s().optional(),
          })
          .strict(),
      })
      .strict(),
    details: workstationDetails,
  })
  .strict();
export type WorkstationState = z.infer<typeof workstationState>;
export const WORKSTATION_ENGINE_VERSION = "ma-engine-2026-09-15.1";
export function emptyWorkstationState(): WorkstationState {
  return {
    intervalKey: "",
    reason: "",
    priorSite: "",
    technique: "",
    response: { kind: "" },
    attestations: {},
    verifications: {},
    acuteSafetyScreenConfirmed: false,
    activeSafetyConcerns: [],
    initiation: {
      version: 1,
      protocol: "",
      planVerified: false,
      oralStatus: "",
      providerNote: "",
      sustennaOrder: "",
      day1Date: "",
      second: {
        dose: "",
        site: "",
        ndc: "",
        lot: "",
        expiration: "",
        given: false,
        orderVerified: false,
      },
    },
    details: {},
  };
}

/** Exact oral component for named one-day regimens, verified against current
 * DailyMed labeling sections 2.2 (Maintena/Asimtufii) and 2.1 (Initio).
 * Provider-directed missed-dose paths are deliberately not assigned this dose. */
export function workstationOralComponentIssue(
  state: WorkstationState,
  plannedOn: string,
  timezone = "America/Los_Angeles",
): string | undefined {
  const expectedDose =
    state.initiation.protocol === "aristada-initio-sameday"
      ? 30
      : ["maintena-1day", "asimtufii-1day"].includes(state.initiation.protocol)
        ? 20
        : undefined;
  if (expectedDose === undefined) return undefined;
  const oral = state.oral;
  if (
    !oral ||
    !state.initiation.oralStatus ||
    oral.status !== state.initiation.oralStatus ||
    !oral.source.trim()
  )
    return "Document the named one-day regimen's oral aripiprazole component and its source.";
  const product = oral.product
    .normalize("NFKC")
    .replace(/[®™]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const matchedProduct =
    /^(?:oral )?(?:aripiprazole|abilify)(?: \((?:aripiprazole|abilify)\))?(?: oral)?(?: tablets?| capsules?| solution)?$/.test(
      product,
    );
  const dose = /^(\d+(?:\.\d+)?)\s*mg$/i.exec(oral.dose.trim());
  if (!matchedProduct || !dose || Number(dose[1]) !== expectedDose)
    return `This named one-day regimen requires oral aripiprazole ${expectedDose} mg. Verify the exact product and dose, or use the documented provider-directed pathway.`;
  if (oral.status === "administered") {
    if (
      !oral.administeredAt ||
      !Number.isFinite(Date.parse(oral.administeredAt)) ||
      Date.parse(oral.administeredAt) > Date.now()
    )
      return "Record a valid actual oral administration time that is not in the future.";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(oral.administeredAt));
    const p = (key: string) =>
      parts.find((part) => part.type === key)?.value || "";
    if (`${p("year")}-${p("month")}-${p("day")}` !== plannedOn)
      return "The oral dose for this named one-day regimen must be documented on the same clinic date as the injection.";
  }
  return undefined;
}
