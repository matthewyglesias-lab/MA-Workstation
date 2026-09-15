import { z } from "zod";
import { date, uuid, type Patient, type Product } from "./contracts.js";
const text = (max: number) => z.string().trim().min(1).max(max);
const instant = z.iso.datetime({ offset: true });
const version = z.number().int().positive();
export const injectionInput = z
  .object({
    patientId: uuid,
    doseSequence: z.number().int().min(1).max(10).default(1),
    productId: uuid,
    tebraOrderReference: text(200),
    orderingProvider: text(160),
    dose: z.number().positive().max(1000000),
    doseUnit: z.enum(["mg", "mcg", "mL", "units"]),
    route: z.enum(["IM", "SC"]),
    site: text(100),
    plannedOn: date,
    lastAdministrationAt: instant.nullable(),
    lastAdministrationOn: date.nullable().optional(),
    timingCategory: z.enum([
      "scheduled",
      "initiation",
      "late_or_missed",
      "unknown",
    ]),
    timingPlan: text(1000),
    nextDueOn: date.nullable(),
  })
  .strict();
export type InjectionInput = z.infer<typeof injectionInput>;
export const injectionUpdate = injectionInput
  .extend({ expectedVersion: version })
  .strict();
export type InjectionUpdate = z.infer<typeof injectionUpdate>;
export const injectionVitals = z
  .object({
    status: z.enum(["recorded", "not_recorded"]),
    bpSystolic: z.number().int().min(1).max(400).nullable(),
    bpDiastolic: z.number().int().min(1).max(300).nullable(),
    pulse: z.number().int().min(1).max(400).nullable(),
    temperatureC: z.number().min(20).max(50).nullable(),
    oxygenSaturation: z.number().min(1).max(100).nullable(),
    reason: text(300).nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const values = [
      v.bpSystolic,
      v.bpDiastolic,
      v.pulse,
      v.temperatureC,
      v.oxygenSaturation,
    ];
    if ((v.bpSystolic === null) !== (v.bpDiastolic === null))
      ctx.addIssue({
        code: "custom",
        message: "Record both blood pressure values.",
      });
    if (v.status === "recorded" && !values.some((x) => x !== null))
      ctx.addIssue({
        code: "custom",
        message: "Enter at least one measured vital.",
      });
    if (
      v.status === "not_recorded" &&
      (!v.reason || values.some((x) => x !== null))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Give a reason for unrecorded vitals and leave measurements blank.",
      });
  });
export const injectionReview = z
  .object({
    expectedVersion: version,
    lotId: uuid,
    stockUnits: z.number().int().min(1).max(100),
    checks: z
      .object({
        identity: z.literal(true),
        order: z.literal(true),
        allergy: z.literal(true),
        medication: z.literal(true),
        timing: z.literal(true),
        consent: z.literal(true),
      })
      .strict(),
    allergyReview: text(1000),
    clinicalReview: text(2000),
    preparation: text(1000),
    siteAssessment: text(1000),
    vitals: injectionVitals,
    observationPlan: text(1000),
  })
  .strict();
export type InjectionReviewInput = z.infer<typeof injectionReview>;
export const injectionAdministration = z
  .object({
    expectedVersion: version,
    administeredAt: instant,
    administeredByName: text(160),
    tolerance: text(1000),
    observation: text(2000),
    delivery: z.enum(["complete", "partial", "not_delivered"]),
    actualDose: z.number().min(0).max(1000000).nullable(),
    issueAction: text(2000).nullable(),
  })
  .strict();
export type InjectionAdministrationInput = z.infer<
  typeof injectionAdministration
>;
export const injectionDisposition = z
  .object({
    expectedVersion: version,
    status: z.enum(["held", "cancelled"]),
    reason: text(1000),
  })
  .strict();
export type InjectionDispositionInput = z.infer<typeof injectionDisposition>;
export const injectionAmendment = z
  .object({ expectedVersion: version, reason: text(500), text: text(4000) })
  .strict();
export type InjectionAmendmentInput = z.infer<typeof injectionAmendment>;
export const injectionFiling = z
  .object({ expectedVersion: version, tebraReference: text(200) })
  .strict();
export type InjectionFilingInput = z.infer<typeof injectionFiling>;
export interface InjectionReview extends Omit<
  InjectionReviewInput,
  "expectedVersion"
> {
  reviewedAt: string;
  reviewedBy: string;
  patientSnapshot: Patient;
  productSnapshot: Product;
  lotSnapshot: {
    lotNumber: string;
    expiresOn: string;
    location: string;
    ownership: "clinic" | "sample" | "patient";
    ownerPatientId: string | null;
  };
  reservationMovementId: string;
}
export interface InjectionAdministration extends Omit<
  InjectionAdministrationInput,
  "expectedVersion"
> {
  id: string;
  recordedAt: string;
  actorId: string;
  stockMovementId: string;
  orderSnapshot: InjectionInput;
  reviewSnapshot: InjectionReview;
}
export interface InjectionAmendment extends Omit<
  InjectionAmendmentInput,
  "expectedVersion"
> {
  id: string;
  actorId: string;
  createdAt: string;
}
export interface InjectionFiling {
  id: string;
  actorId: string;
  filedAt: string;
  tebraReference: string;
  amendmentCount: number;
}
export interface InjectionCase extends InjectionInput {
  id: string;
  status: "draft" | "reviewed" | "administered" | "held" | "cancelled";
  version: number;
  review: InjectionReview | null;
  administration: InjectionAdministration | null;
  disposition: {
    status: "held" | "cancelled";
    reason: string;
    actorId: string;
    at: string;
    reviewSnapshot: InjectionReview | null;
  } | null;
  amendments: InjectionAmendment[];
  filings: InjectionFiling[];
  handoff: "pending" | "filed";
  createdAt: string;
  updatedAt: string;
}
