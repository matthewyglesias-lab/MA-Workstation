import type {
  InjectionCase,
  InjectionInput,
  InjectionUpdate,
  InjectionReviewInput,
  InjectionAdministrationInput,
  InjectionDispositionInput,
  InjectionAmendmentInput,
  InjectionFilingInput,
} from "../../shared/injections.js";
import type {
  Activity,
  ActivityInput,
  ActivityUpdate,
  Actor,
  Lot,
  LotInput,
  Movement,
  MovementInput,
  Overview,
  Patient,
  PatientInput,
  Product,
  ProductInput,
} from "../../shared/contracts.js";
export interface Command {
  key: string;
  actor: Actor;
}
/** A clinic-scoped port. Adapters must commit each command, audit, and outbox event atomically. */
export interface Repository {
  overview(actor: Actor): Promise<Overview>;
  createPatient(input: PatientInput, command: Command): Promise<Patient>;
  createActivity(input: ActivityInput, command: Command): Promise<Activity>;
  updateActivity(
    id: string,
    input: ActivityUpdate,
    command: Command,
  ): Promise<Activity>;
  createProduct(input: ProductInput, command: Command): Promise<Product>;
  createLot(input: LotInput, command: Command): Promise<Lot>;
  postMovement(input: MovementInput, command: Command): Promise<Movement>;
  listInjections(actor: Actor): Promise<InjectionCase[]>;
  createInjection(
    input: InjectionInput,
    command: Command,
  ): Promise<InjectionCase>;
  updateInjection(
    id: string,
    input: InjectionUpdate,
    command: Command,
  ): Promise<InjectionCase>;
  reviewInjection(
    id: string,
    input: InjectionReviewInput,
    command: Command,
  ): Promise<InjectionCase>;
  administerInjection(
    id: string,
    input: InjectionAdministrationInput,
    command: Command,
  ): Promise<InjectionCase>;
  dispositionInjection(
    id: string,
    input: InjectionDispositionInput,
    command: Command,
  ): Promise<InjectionCase>;
  amendInjection(
    id: string,
    input: InjectionAmendmentInput,
    command: Command,
  ): Promise<InjectionCase>;
  fileInjection(
    id: string,
    input: InjectionFilingInput,
    command: Command,
  ): Promise<InjectionCase>;
  close(): Promise<void>;
}
