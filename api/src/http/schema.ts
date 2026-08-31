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
/** Trims before enforcing a minimum length, so a whitespace-only value fails exactly like an empty one. */
const nonBlankText = (max = 500) => z.string().trim().min(1).max(max);
const isUtcInstant = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
};
/** A real UTC ISO-8601 instant (e.g. 2026-08-31T12:00:00.000Z) — required for every persisted acknowledgement/attestation/finalization timestamp so audit reconstruction never depends on an ambiguous local time or a malformed string that happens to parse. */
export const utcInstant = z
  .string()
  .refine(isUtcInstant, "Use a UTC ISO-8601 instant, e.g. 2026-08-31T12:00:00.000Z.");
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

/**
 * Protected identifiers are trimmed before the minimum-length check, so a
 * whitespace-only value (" ") fails exactly like an empty one rather than
 * comparing as a "matching" non-empty string against the protected
 * Dataverse record.
 */
const sourceIdentitySchema = z
  .object({
    actionId: nonBlankText(128),
    checkInId: nonBlankText(128),
    patientId: nonBlankText(128),
    orderId: nonBlankText(128),
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

/**
 * Order snapshot checked against the encounter when the tenant configures
 * DATAVERSE_ORDER_CONTEXT_COLUMN. Whether the check runs at all is a
 * documented acceptance-gate limitation (the column is optional); once
 * configured, every row must carry a complete, strictly valid snapshot —
 * a blank string, `{}`, or a partially populated order is rejected rather
 * than treated as "no order context to check."
 */
export const orderContextSchema = z
  .object({
    medicationKey: medicationKey.refine(
      (value) => value !== "",
      "medicationKey is required.",
    ),
    dose: nonBlankText(80),
    orderingProvider: nonBlankText(200),
    route: nonBlankText(50),
    intervalKey: intervalKey.refine(
      (value) => value !== "",
      "intervalKey is required.",
    ),
  })
  .strict();

/**
 * Protected patient-identity snapshot (name/DOB/MRN), read from the
 * board/integration-owned Dataverse patient-context column. This is
 * authoritative for the final clinical note and AVS — Canvas-supplied Draft
 * JSON never determines final-document patient demographics.
 */
export const patientContextSchema = z
  .object({
    name: nonBlankText(200),
    dob: isoDate,
    mrn: nonBlankText(128),
  })
  .strict();

export const recordLookupHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    injectionId: z.string().uuid(),
  })
  .strict();

export const evaluateHttpBodySchema = recordLookupHttpBodySchema;

/**
 * GetInjectionDocuments preview: no locale field, matching the Swagger
 * GetInjectionDocumentsRequest contract exactly (locale is not part of note
 * generation).
 */
export const documentPreviewHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    source: sourceSchema,
    encounterJson: z.string().min(2).max(MAX_ENCOUNTER_JSON_BYTES),
  })
  .strict();

/**
 * GenerateInjectionAvs preview: locale is required here, matching the
 * Swagger GenerateInjectionAvsRequest contract exactly (both declare it
 * required, unlike the previous single shared preview schema which left it
 * optional and diverged from the documented contract).
 */
export const avsPreviewHttpBodySchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    source: sourceSchema,
    encounterJson: z.string().min(2).max(MAX_ENCOUNTER_JSON_BYTES),
    locale: z.literal("en-US"),
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

/** Deterministic sha256 hex digest binding a finalize attempt to its complete request content. */
export const requestFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

const finalAttestationSchema = z
  .object({
    staff: z.string().min(1),
    subject: z.string().min(1),
    timestamp: utcInstant,
    statementVersion: z.string().min(1),
    acknowledgementKind: z.enum(["tebra", "manual"]),
    manualReason: z.string().optional(),
    manualSource: z.string().optional(),
  })
  .strict();

const finalAcknowledgementSchema = z
  .object({
    kind: z.enum(["tebra", "manual"]),
    acknowledgedAtUtc: utcInstant,
    acknowledgedByUserId: z.string().min(1),
    acknowledgedByDisplayName: z.string().min(1),
    reason: z.string().optional(),
    source: z.string().optional(),
    boardSource: z.string().optional(),
    boardAcknowledgedAtUtc: utcInstant.optional(),
    boardAcknowledgedBy: z.string().optional(),
    boardCheckInId: z.string().optional(),
  })
  .strict();

/** Mirrors DocumentationSection from src/documentation/types.ts exactly. */
const documentationSectionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    destination: z.enum(["CC", "Assessment", "Plan", "Note"]),
    content: z.string(),
  })
  .strict();

/** Mirrors InjectionDocumentationResult from src/documentation/types.ts exactly. */
const finalNoteSchema = z
  .object({
    workflow: z.literal("injection"),
    sections: z.array(documentationSectionSchema),
    text: z.string(),
    cc: z.string(),
    assessment: z.string(),
    plan: z.string(),
    all: z.string(),
  })
  .strict();

const finalAvsSchema = z
  .object({
    documentStatus: z.enum(["PATIENT COPY", "STAFF PREVIEW - NOT FINAL", "CARE HANDOFF"]),
    contentType: z.literal("text/html"),
    fileName: z.string().min(1),
    html: z.string().min(1),
    generatedAt: utcInstant,
    kind: z.enum(["patient-avs", "care-handoff"]),
    locale: z.literal("en-US"),
  })
  .strict();

const clinicalIssueSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["stop", "warning", "info"]),
    field: z.string().optional(),
    section: z.string().optional(),
  })
  .strict();

const clinicalRecommendationSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    action: z.string().optional(),
  })
  .strict();

/** Curated medication summary publicEvaluation() echoes — not the full catalog InjectionMedication. */
const finalMedicationSummarySchema = z
  .object({
    key: z.string().min(1),
    name: z.string(),
    genericName: z.string(),
  })
  .strict();

/** Mirrors InjectionTimingEvaluation from src/domain/injection.ts exactly. */
const finalTimingEvaluationSchema = z
  .object({
    state: z.enum(["idle", "ok", "warning", "stop"]),
    daysSincePrior: z.number().nullable(),
    earliestDay: z.number().nullable(),
    latestDay: z.number().nullable(),
    expectedDate: z.string().optional(),
    earliestDate: z.string().optional(),
    latestDate: z.string().optional(),
    cadenceLabel: z.string().optional(),
    late: z.boolean(),
    relativeToExpected: z.enum(["before", "on", "after"]).optional(),
    message: z.string(),
  })
  .strict();

/** publicEvaluation() flattens InjectionEvaluationOutput's requirements Record into {field, ...requirement} entries. */
const finalRequirementEntrySchema = z
  .object({
    field: z.string(),
    state: z.enum(["pending", "required", "optional", "hidden"]),
    section: z.string(),
    reason: z.string().optional(),
  })
  .strict();

const clinicalReferenceClassificationSchema = z.enum([
  "label constraint",
  "order-dependent review",
  "local policy",
]);

/** Mirrors InjectionGuidanceCard from src/domain/injection.ts exactly. */
const finalGuidanceCardSchema = z
  .object({
    key: z.string(),
    section: z.string(),
    title: z.string(),
    message: z.string(),
    classification: clinicalReferenceClassificationSchema,
    action: z.string().optional(),
  })
  .strict();

const clinicalReferenceSourceSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    labelRevision: z.string(),
    reviewedOn: z.string(),
  })
  .strict();

/** Mirrors InjectionTechniqueNote (extends InjectionClinicalReferenceFact) from src/domain/injection-clinical-reference.ts exactly. */
const finalTechniqueNoteSchema = z
  .object({
    id: z.string(),
    classification: clinicalReferenceClassificationSchema,
    statement: z.string(),
    source: clinicalReferenceSourceSchema,
    phase: z.enum(["preparation", "needle", "mechanics", "aftercare"]),
    severity: z.enum(["info", "caution"]),
    doses: z.array(z.string()).optional(),
    siteGroups: z.array(z.enum(["deltoid", "gluteal", "subq"])).optional(),
  })
  .strict();

const needleSpecSchema = z
  .object({
    gauge: z.string().optional(),
    length: z.string().optional(),
    descriptor: z.string().optional(),
  })
  .strict();

/** Mirrors NeedleResolution from src/domain/injection-needle.ts exactly. */
const finalNeedleResolutionSchema = z
  .object({
    needle: needleSpecSchema.optional(),
    alternate: needleSpecSchema.optional(),
    rationale: z.string().optional(),
    siteGroup: z.enum(["deltoid", "gluteal", "subq"]).optional(),
    unresolved: z.boolean(),
    unresolvedReason: z.string().optional(),
    needs: z.array(z.enum(["habitus", "weight"])).optional(),
  })
  .strict();

/** Mirrors InjectionNeedleProjection from src/domain/injection.ts exactly. */
const finalNeedleProjectionSchema = z
  .object({
    resolution: finalNeedleResolutionSchema,
    notes: z.array(finalTechniqueNoteSchema),
    angle: z.object({ degrees: z.string(), note: z.string() }).strict().optional(),
    siteRestriction: z
      .object({ headline: z.string(), detail: z.string() })
      .strict()
      .optional(),
    maxVolumePerSite: z.number().optional(),
    weightKg: z.number().nullable(),
  })
  .strict();

const medicationVerificationKeySchema = z.enum([
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
]);

/**
 * Mirrors the exact shape publicEvaluation() (api/src/functions/injections.ts)
 * builds from InjectionEvaluationOutput — a curated projection, not the raw
 * domain type, so this schema intentionally tracks that projection's field
 * list rather than every field on InjectionEvaluationOutput itself.
 */
const finalEvaluationOutputSchema = z
  .object({
    medication: finalMedicationSummarySchema.optional(),
    timing: finalTimingEvaluationSchema,
    lateDoseWarning: z.boolean(),
    allowedRoutes: z.array(z.string()),
    allowedSites: z.array(z.string()),
    recommendedSite: z.string(),
    repeatsPreviousSite: z.boolean(),
    administrationDocumented: z.boolean(),
    canFinalize: z.boolean(),
    recordStatus: z.enum(["draft", "ready-to-lock", "handoff-ready"]),
    initiationProtocol: z.enum([
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
    phase: z.enum(["maintenance", "initiation", "reinitiation", "loading", "prn"]),
    requiredVerifications: z.array(medicationVerificationKeySchema),
    requirements: z.array(finalRequirementEntrySchema),
    guidance: z.array(finalGuidanceCardSchema),
    needle: finalNeedleProjectionSchema,
    expectedNextDoseDate: z.string(),
  })
  .strict();

/**
 * Exact schema for the persisted evaluation snapshot — mirrors
 * ClinicalEvaluation<InjectionEvaluationOutput> (src/domain/contracts.ts) as
 * projected by publicEvaluation(). Replaces a prior z.record(unknown) that
 * would have accepted any shape at all for a clinical decision record.
 */
const finalEvaluationSchema = z
  .object({
    workflow: z.literal("injection"),
    readiness: z.enum(["idle", "blocked", "review", "ready"]),
    stops: z.array(clinicalIssueSchema),
    warnings: z.array(clinicalIssueSchema),
    recommendations: z.array(clinicalRecommendationSchema),
    calculatedDates: z.record(z.string(), z.string()),
    output: finalEvaluationOutputSchema,
  })
  .strict();

/**
 * Strict schema for the JSON persisted into the Dataverse final-JSON column.
 * Retrieval and replay both validate against this before trusting or
 * returning any stored content — a malformed, incomplete, identity-
 * mismatched, or internally-inconsistent record is rejected rather than
 * echoed.
 */
export const storedFinalEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(POWER_APPS_INJECTION_SCHEMA_VERSION),
    source: sourceSchema,
    injectionId: z.string().uuid(),
    status: z.literal("finalized"),
    disposition: z.enum(["administered", "held", "escalated", "provider"]),
    idempotencyKey: z.string().min(16).max(200),
    requestFingerprint: requestFingerprintSchema,
    finalEncounter: injectionEncounterSchema,
    evaluation: finalEvaluationSchema,
    evaluationFingerprint: z.string().regex(/^[0-9a-f]{16}$/),
    finalizedAt: utcInstant,
    attestation: finalAttestationSchema,
    acknowledgement: finalAcknowledgementSchema,
    documents: z.object({ note: finalNoteSchema }).strict(),
    avs: finalAvsSchema,
    clinicalReferenceVersion: z.string().min(1),
    /** Documentation-formatting template version, persisted for audit reconstruction. */
    noteTemplateVersion: z.string().min(1),
    /** AVS-rendering template version, persisted for audit reconstruction. */
    avsTemplateVersion: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const isBlank = (candidate?: string): boolean => !candidate || !candidate.trim();

    if (value.injectionId.toLowerCase() !== value.source.actionId.toLowerCase()) {
      context.addIssue({
        code: "custom",
        path: ["source", "actionId"],
        message: "injectionId and source.actionId must match.",
      });
    }

    if (value.disposition !== value.finalEncounter.disposition.kind) {
      context.addIssue({
        code: "custom",
        path: ["finalEncounter", "disposition", "kind"],
        message: "The envelope disposition must match finalEncounter.disposition.kind.",
      });
    }

    if (value.avs.documentStatus === "STAFF PREVIEW - NOT FINAL") {
      context.addIssue({
        code: "custom",
        path: ["avs", "documentStatus"],
        message: "A finalized envelope can never carry a staff-preview AVS.",
      });
    }
    if (value.disposition === "administered") {
      if (value.avs.documentStatus !== "PATIENT COPY") {
        context.addIssue({
          code: "custom",
          path: ["avs", "documentStatus"],
          message: "An administered disposition requires a PATIENT COPY AVS.",
        });
      }
      if (value.avs.kind !== "patient-avs") {
        context.addIssue({
          code: "custom",
          path: ["avs", "kind"],
          message: "An administered disposition requires a patient-avs AVS kind.",
        });
      }
    } else {
      if (value.avs.documentStatus !== "CARE HANDOFF") {
        context.addIssue({
          code: "custom",
          path: ["avs", "documentStatus"],
          message: "A held, escalated, or provider disposition requires a CARE HANDOFF AVS.",
        });
      }
      if (value.avs.kind !== "care-handoff") {
        context.addIssue({
          code: "custom",
          path: ["avs", "kind"],
          message: "A held, escalated, or provider disposition requires a care-handoff AVS kind.",
        });
      }
    }

    if (value.attestation.acknowledgementKind !== value.acknowledgement.kind) {
      context.addIssue({
        code: "custom",
        path: ["acknowledgement", "kind"],
        message: "attestation.acknowledgementKind and acknowledgement.kind must agree.",
      });
    }

    if (value.acknowledgement.kind === "manual") {
      if (isBlank(value.acknowledgement.reason) || isBlank(value.acknowledgement.source)) {
        context.addIssue({
          code: "custom",
          path: ["acknowledgement", "reason"],
          message: "A manual acknowledgement requires a nonblank reason and source.",
        });
      }
    } else if (!isBlank(value.acknowledgement.reason) || !isBlank(value.acknowledgement.source)) {
      context.addIssue({
        code: "custom",
        path: ["acknowledgement", "reason"],
        message: "A Tebra acknowledgement cannot carry manual reason/source values.",
      });
    }

    if (value.attestation.acknowledgementKind === "manual") {
      if (isBlank(value.attestation.manualReason) || isBlank(value.attestation.manualSource)) {
        context.addIssue({
          code: "custom",
          path: ["attestation", "manualReason"],
          message: "A manual attestation requires a nonblank manualReason and manualSource.",
        });
      }
    } else if (
      !isBlank(value.attestation.manualReason) ||
      !isBlank(value.attestation.manualSource)
    ) {
      context.addIssue({
        code: "custom",
        path: ["attestation", "manualReason"],
        message: "A Tebra attestation cannot carry manualReason/manualSource values.",
      });
    }
  });

export type StoredFinalEnvelope = z.infer<typeof storedFinalEnvelopeSchema>;

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
