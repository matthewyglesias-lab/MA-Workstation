import type { Activity, ActivityInput, ActivityUpdate, Actor, Lot, LotInput, Movement, MovementInput, Overview, Patient, PatientInput, Product, ProductInput } from '../../shared/contracts.js';
export interface Command { key: string; actor: Actor }
/** A clinic-scoped port. Adapters must commit each command, audit, and outbox event atomically. */
export interface Repository {
  overview(actor: Actor): Promise<Overview>;
  createPatient(input: PatientInput, command: Command): Promise<Patient>;
  createActivity(input: ActivityInput, command: Command): Promise<Activity>;
  updateActivity(id: string, input: ActivityUpdate, command: Command): Promise<Activity>;
  createProduct(input: ProductInput, command: Command): Promise<Product>;
  createLot(input: LotInput, command: Command): Promise<Lot>;
  postMovement(input: MovementInput, command: Command): Promise<Movement>;
  close(): Promise<void>;
}
