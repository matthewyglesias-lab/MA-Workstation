import { z } from "zod";

import {
  POWER_APPS_INJECTION_SCHEMA_VERSION,
  type InjectionSourceReference,
} from "../../../src/integrations/power-apps";
import type { InjectionEncounter } from "../../../src/domain/injection";
import { normalizeSourceRecordVersion } from "../source-version";

export const MAX_ENCOUNTER_JSON_BYTES = 262_144;

const text = (max = 500) => z.string().max(max);
const optionalText = (max = 500) => text(max).optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd format.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, "Use a real calendar date.");
const dateOrEmpty = z.union([z.literal(""), isoDate]);
const monthOrEmpty = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use yyyy-mm format."),
]);
const timeOrEmpty = z.union([
  z.literal(""),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm format."),
]);

const medicationKey = z.enum([
  "",
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
const intervalKey = z.enum([
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
]);
const verificationKeyShape = {
  opioidFree: z.boolean().optional(),
  naltrexHS: z.boolean().optional(),
  suppliedNeedle: z.boolean().optional(),
  resuspend: z.boolean().optional(),
  visualInspection: z.boolean().optional(),
  invegaInit: z.boolean().optional(),
  oralOverlap: z.boolean().optional(),
  stabilized: z.boolean().optional(),
  paliperidoneTolerability: z.boolean().optional(),
  aripiprazoleTolerability: z.boolean().optional(),
  glutealOnly: z.boolean().optional(),
  noMassage: z.boolean().optional(),
  deepZtrack: z.boolean().optional(),
} as const;

const ndcSelection = z
  .object({
    ndc: optionalText(40),
    source: z.enum(["bundled", "remote", "custom"]).optional(),
    packageLabel: optionalText(300),
    package: optionalText(300),
    labeler: optionalText(200),
    packageKind: z.enum(["commercial", "sample"]).optional(),
    medicationKey: medicationKey.optional(),
    dose: optionalText(80),
    referenceVersion: optionalText(100),
  })
  .strict();

const detailsSchema = z
  .object({
    purpose: optionalText(1000),
    productSource: optionalText(200),
    volume: optionalText(40),
    volumeUnit: optionalText(40),
    device: optionalText(200),
    deviceOther: optionalText(500),
    siteCondition: optionalText(200),
    siteConditionOther: optionalText(1000),
    waste: z.boolean().optional(),
    wasteAmount: optionalText(100),
    wasteWitness: optionalText(200),
    productIssue: z.boolean().optional(),
    productIssueDetail: optionalText(2000),
    productIssueAction: optionalText(2000),
    productIssueRecipient: optionalText(200),
    productIssueNotificationTime: optionalText(40),
    productIssueDirection: optionalText(2000),
    productIssueNextStep: optionalText(2000),
    administrationException: z.boolean().optional(),
    exceptionSummary: optionalText(2000),
    exceptionRecipient: optionalText(200),
    exceptionTime: optionalText(40),
    exceptionOutcome: optionalText(2000),
    lateDoseReview: z.enum(["", "provider-authorized", "other"]).optional(),
    lateDoseReviewNote: optionalText(2000),
    lateDoseReviewProvider: optionalText(200),
    lateDoseReviewTime: optionalText(40),
    lateDoseReviewFingerprint: optionalText(262_144),
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
    departureStatusNote: optionalText(1000),
    ndcSelection: z
      .object({
        primary: ndcSelection.optional(),
        pairedSecond: ndcSelection.optional(),
      })
      .strict()
      .optional(),
    nextDose: z
      .object({
        value: dateOrEmpty.optional(),
        source: z.enum(["calculated", "manual"]).optional(),
        calculatedFrom: optionalText(300),
        overrideKind: z.enum(["active-order", "provider-direction"]).optional(),
        overrideReason: optionalText(1000),
        overrideProvider: optionalText(200),
        recordedAt: optionalText(40),
      })
      .strict()
      .optional(),
    clinicalReferenceVersion: optionalText(100),
  })
  .strict();

export const injectionEncounterSchema = z
  .object({
    patient: z
      .object({
        name: text(200),
        dob: dateOrEmpty,
      })
      .strict(),
    medicationKey,
    customMedication: optionalText(200),
    dose: text(80),
    route: text(50),
    site: text(120),
    intervalKey,
    reason: z.enum(["", "scheduled", "initiation", "reinit", "loading", "prn"]),
    priorDoseDate: dateOrEmpty,
    priorSite: optionalText(120),
    administrationDate: dateOrEmpty,
    nextDoseDate: dateOrEmpty,
    orderingProvider: text(200),
    administeredBy: text(200),
    administrationTime: timeOrEmpty,
    secondAdministrationTime: timeOrEmpty.optional(),
    allergies: text(1000),
    technique: optionalText(1000),
    habitus: z.enum(["lean", "average", "larger"]).optional(),
    traceability: z
      .object({
        ndc: text(40),
        lot: text(100),
        expiration: monthOrEmpty,
      })
      .strict(),
    vitals: z
      .object({
        bp: optionalText(40),
        hr: optionalText(40),
        temperature: optionalText(40),
        rr: optionalText(40),
        spo2: optionalText(40),
        weight: optionalText(40),
        weightUnit: z.enum(["kg", "lb"]).optional(),
      })
      .strict()
      .optional(),
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
        detail: optionalText(80),
        custom: optionalText(2000),
      })
      .strict(),
    attestations: z
      .object({
        id2: z.boolean().optional(),
        rights: z.boolean().optional(),
        allergy: z.boolean().optional(),
        consent: z.boolean().optional(),
        prior: z.boolean().optional(),
        screen: z.boolean().optional(),
        hygiene: z.boolean().optional(),
      })
      .strict(),
    verifications: z.object(verificationKeyShape).strict(),
    acuteSafetyScreenConfirmed: z.boolean(),
    activeSafetyConcerns: z
      .array(z.enum(["dizzy", "cardiac", "nms", "eps", "site", "opioid", "liver"]))
      .max(7)
      .optional(),
    disposition: z
      .object({
        kind: z.enum(["", "administered", "held", "escalated", "provider"]),
        provider: optionalText(200),
        time: optionalText(40),
        outcome: optionalText(2000),
        reviewedBy: optionalText(200),
        reviewedAt: optionalText(40),
        reviewFingerprint: optionalText(262_144),
      })
      .strict(),
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
        providerNote: text(2000),
        sustennaOrder: z.enum(["", "standard", "mild", "other"]),
        day1Date: dateOrEmpty,
        second: z
          .object({
            productKey: medicationKey.optional(),
            dose: text(80),
            site: text(120),
            ndc: text(40),
            lot: text(100),
            expiration: monthOrEmpty,
            given: z.boolean(),
            orderVerified: z.boolean(),
            note: optionalText(1000),
          })
          .strict(),
      })
      .strict()
      .optional(),
    details: detailsSchema.optional(),
  })
  .strict();

const sourceRecordVersionSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => normalizeSourceRecordVersion(value) !== null,
    "Use the opaque Dataverse weak ETag returned by EvaluateInjection.",
  )
  .transform((value) => normalizeSourceRecordVersion(value) as string);

const sourceIdentitySchema = z
  .object({
    actionId: z.string().min(1).max(128),
    checkInId: z.string().min(1).max(128),
    patientId: z.string().min(1).max(128),
    orderId: z.string().min(1).max(128),
    patientRecordNumber: z.string().max(128).optional(),
  })
  .strict();

const sourceSchema = sourceIdentitySchema.extend({
  sourceRecordVersion: sourceRecordVersionSchema,
});

export const storedDraftEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    source: sourceIdentitySchema,
    encounterJson: z.string().min(2).max(MAX_ENCOUNTER_JSON_BYTES),
  })
  .strict();

export const recordLookupHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    injectionId: z.string().uuid(),
  })
  .strict();

export const evaluateHttpBodySchema = recordLookupHttpBodySchema;

export const previewHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    source: sourceSchema,
    encounterJson: z.string().min(2).max(MAX_ENCOUNTER_JSON_BYTES),
    locale: z.literal("en-US").optional(),
  })
  .strict();

export const finalizeHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    injectionId: z.string().uuid(),
    sourceRecordVersion: sourceRecordVersionSchema,
    evaluationFingerprint: z.string().regex(/^[0-9a-f]{16}$/),
    confirmation: z
      .object({
        confirmed: z.literal(true),
        acknowledgementKind: z.enum(["tebra", "manual"]),
        manualReason: z.string().max(1000).optional(),
        manualSource: z.string().max(500).optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (
          value.acknowledgementKind === "manual" &&
          (!value.manualReason?.trim() || !value.manualSource?.trim())
        ) {
          context.addIssue({
            code: "custom",
            message: "Manual acknowledgement requires both reason and source.",
          });
        }
        if (
          value.acknowledgementKind === "tebra" &&
          (value.manualReason?.trim() || value.manualSource?.trim())
        ) {
          context.addIssue({
            code: "custom",
            message: "Tebra acknowledgement cannot include manual provenance.",
          });
        }
      }),
  })
  .strict();

export const generateFinalAvsHttpBodySchema = recordLookupHttpBodySchema.extend({
  locale: z.literal("en-US"),
});

type EncounterParseResult =
  | { success: true; data: InjectionEncounter }
  | { success: false; error: z.ZodError };

export const parseEncounterJson = (
  encounterJson: string,
): EncounterParseResult => {
  if (Buffer.byteLength(encounterJson, "utf8") > MAX_ENCOUNTER_JSON_BYTES) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "too_big",
          origin: "string",
          maximum: MAX_ENCOUNTER_JSON_BYTES,
          inclusive: true,
          path: ["encounterJson"],
          message: "Encounter JSON exceeds the maximum UTF-8 size.",
        },
      ]),
    };
  }
  try {
    return injectionEncounterSchema.safeParse(
      JSON.parse(encounterJson),
    ) as EncounterParseResult;
  } catch {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          path: ["encounterJson"],
          message: "Encounter JSON is malformed.",
        },
      ]),
    };
  }
};

export type EvaluateHttpBody = z.infer<typeof evaluateHttpBodySchema>;
export type FinalizeHttpBody = z.infer<typeof finalizeHttpBodySchema>;
export type RecordLookupHttpBody = z.infer<typeof recordLookupHttpBodySchema>;

export const asSourceReference = (
  value: z.infer<typeof sourceSchema>,
): InjectionSourceReference => value;
