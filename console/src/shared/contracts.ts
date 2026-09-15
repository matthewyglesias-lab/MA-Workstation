import { z } from 'zod';

export const uuid = z.string().uuid().toLowerCase();
const text = (max: number) => z.string().trim().min(1).max(max);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid calendar date.');
export const patientInput = z.object({
  tebraId: text(64).regex(/^[A-Za-z0-9_-]+$/), displayName: text(160), dob: date,
  verifiedInTebra: z.literal(true),
}).strict();
export type PatientInput = z.infer<typeof patientInput>;
export interface Patient { id: string; tebraId: string; displayName: string; dob: string; verifiedAt: string; verifiedBy: string }
export const activityInput = z.object({
  patientId: uuid, service: z.enum(['Injection', 'UDS', 'TMS', 'Samples', 'Forms']),
}).strict();
export type ActivityInput = z.infer<typeof activityInput>;
export interface Activity extends ActivityInput {
  id: string; status: 'planned' | 'in_progress' | 'completed';
  handoff: 'pending' | 'prepared' | 'filed'; tebraReference: string | null;
  version: number; createdAt: string; updatedAt: string;
}
export const activityUpdate = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(['planned', 'in_progress', 'completed']),
  handoff: z.enum(['pending', 'prepared', 'filed']),
  tebraReference: text(200).nullable(),
}).strict();
export type ActivityUpdate = z.infer<typeof activityUpdate>;
export const productInput = z.object({ name: text(160), strength: text(80), unit: z.enum(['syringe', 'kit', 'tablet', 'capsule', 'vial']), ndc: text(30).nullable() }).strict();
export type ProductInput = z.infer<typeof productInput>;
export interface Product extends ProductInput { id: string }
export const lotInput = z.object({
  productId: uuid, lotNumber: text(80), expiresOn: date, location: text(100),
  ownership: z.enum(['clinic', 'sample', 'patient']), ownerPatientId: uuid.nullable(),
}).strict().refine(x => (x.ownership === 'patient') === (x.ownerPatientId !== null), { message: 'Patient-owned stock requires its patient; other stock cannot have an owner.' });
export type LotInput = z.infer<typeof lotInput>;
export interface Lot extends LotInput { id: string; status: 'active' | 'quarantined'; onHand: number; reserved: number }
export const movementInput = z.object({
  lotId: uuid, kind: z.enum(['receive', 'reserve', 'release', 'use', 'waste', 'adjust', 'reverse']),
  quantity: z.number().int().min(-1000000).max(1000000),
  patientId: uuid.nullable(), reason: text(300), reversesId: uuid.nullable(),
}).strict().superRefine((x, ctx) => {
  if ((x.kind === 'reverse') !== (x.reversesId !== null)) ctx.addIssue({ code: 'custom', message: 'A reversal must identify the original movement.' });
  if (x.kind === 'reverse' && x.quantity !== 0) ctx.addIssue({ code: 'custom', message: 'Reversal quantities are calculated from the original movement.' });
  if (x.kind !== 'reverse' && (x.quantity === 0 || (x.kind !== 'adjust' && x.quantity < 0))) ctx.addIssue({ code: 'custom', message: 'Enter a positive whole number of stock units.' });
  if (['reserve', 'release', 'use'].includes(x.kind) && !x.patientId) ctx.addIssue({ code: 'custom', message: 'Select the patient.' });
});
export type MovementInput = z.infer<typeof movementInput>;
export interface Movement extends MovementInput {
  id: string; stockDelta: number; reservedDelta: number; actorId: string; createdAt: string;
}
export type Role = 'Console.Reader' | 'Console.Operator' | 'Inventory.Manager';
export interface Actor { id: string; roles: Role[] }
export interface Overview { patients: Patient[]; activities: Activity[]; products: Product[]; lots: Lot[]; movements: Movement[] }
export interface RuntimeInfo { mode: 'demo' | 'sql'; clinicTimezone: string; tenantId?: string; webClientId?: string; apiScope?: string }
