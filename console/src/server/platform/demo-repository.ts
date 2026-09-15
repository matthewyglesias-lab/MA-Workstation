import { workstationStateForRecord } from "../../shared/workstation-bridge.js";
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
import {
  createInjectionCase,
  reviseInjection,
  reviewInjectionCase,
  administerInjectionCase,
  disposeInjection,
  amendInjectionCase,
  fileInjectionCase,
} from "../modules/injections.js";
const randomUUID = () => globalThis.crypto.randomUUID();
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
import { evaluateMovement } from "../modules/inventory.js";
import { validateActivityUpdate } from "../modules/work.js";
import { clinicDate } from "./config.js";
import { invariant } from "./errors.js";
import type { Command, Repository } from "./repository.js";

export class DemoRepository implements Repository {
  private data: Overview = {
    patients: [],
    activities: [],
    products: [],
    lots: [],
    movements: [],
  };
  private injections: InjectionCase[] = [];
  private injectionStockLinks = new Set<string>();
  private receipts = new Map<
    string,
    { fingerprint: string; result: unknown }
  >();
  constructor(private timezone = "America/Los_Angeles") {}
  async overview(_actor: Actor) {
    return structuredClone(this.data);
  }
  private run<T>(action: string, input: unknown, c: Command, work: () => T): T {
    const fingerprint = JSON.stringify([action, c.actor.id, input]);
    const old = this.receipts.get(c.key);
    if (old) {
      invariant(
        old.fingerprint === fingerprint,
        "idempotency_conflict",
        "Request key already used for another operation.",
      );
      return structuredClone(old.result) as T;
    }
    const before = structuredClone(this.data);
    const beforeInjections = structuredClone(this.injections);
    const beforeLinks = new Set(this.injectionStockLinks);
    let result: T;
    try {
      result = work();
    } catch (error) {
      this.data = before;
      this.injections = beforeInjections;
      this.injectionStockLinks = beforeLinks;
      throw error;
    }
    this.receipts.set(c.key, { fingerprint, result: structuredClone(result) });
    return structuredClone(result);
  }
  async createPatient(input: PatientInput, c: Command) {
    return this.run("patient", input, c, () => {
      invariant(
        input.dob <= clinicDate(this.timezone),
        "dob_future",
        "Date of birth cannot be in the future.",
        400,
      );
      invariant(
        !this.data.patients.some(
          (p) => p.tebraId.toLowerCase() === input.tebraId.toLowerCase(),
        ),
        "duplicate",
        "This Tebra chart is already linked.",
      );
      const value: Patient = {
        id: randomUUID(),
        tebraId: input.tebraId,
        displayName: input.displayName,
        dob: input.dob,
        verifiedAt: new Date().toISOString(),
        verifiedBy: c.actor.id,
      };
      this.data.patients.push(value);
      return value;
    });
  }
  private patient(id: string | null) {
    invariant(
      id && this.data.patients.some((p) => p.id === id),
      "not_found",
      "Linked patient not found.",
      404,
    );
  }
  async createActivity(input: ActivityInput, c: Command) {
    return this.run("activity", input, c, () => {
      this.patient(input.patientId);
      const at = new Date().toISOString();
      const value: Activity = {
        ...input,
        id: randomUUID(),
        status: "planned",
        handoff: "pending",
        tebraReference: null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      this.data.activities.unshift(value);
      return value;
    });
  }
  async updateActivity(id: string, input: ActivityUpdate, c: Command) {
    return this.run("activity.update", { id, ...input }, c, () => {
      const current = this.data.activities.find((x) => x.id === id);
      invariant(current, "not_found", "Activity not found.", 404);
      validateActivityUpdate(current, input);
      const { expectedVersion: _, ...changes } = input;
      Object.assign(current, changes, {
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      });
      return current;
    });
  }
  async createProduct(input: ProductInput, c: Command) {
    return this.run("product", input, c, () => {
      invariant(
        !this.data.products.some(
          (p) =>
            [p.name, p.strength, p.unit].join("|").toLowerCase() ===
            [input.name, input.strength, input.unit].join("|").toLowerCase(),
        ),
        "duplicate",
        "This product already exists.",
      );
      const value: Product = { ...input, id: randomUUID() };
      this.data.products.push(value);
      return value;
    });
  }
  async createLot(input: LotInput, c: Command) {
    return this.run("lot", input, c, () => {
      invariant(
        this.data.products.some((p) => p.id === input.productId),
        "not_found",
        "Product not found.",
        404,
      );
      if (input.ownerPatientId) this.patient(input.ownerPatientId);
      invariant(
        !this.data.lots.some(
          (l) =>
            l.productId === input.productId &&
            l.lotNumber === input.lotNumber &&
            l.location === input.location &&
            l.ownership === input.ownership &&
            l.ownerPatientId === input.ownerPatientId,
        ),
        "duplicate",
        "This stock bucket already exists.",
      );
      const value: Lot = {
        ...input,
        id: randomUUID(),
        status: "active",
        onHand: 0,
        reserved: 0,
      };
      this.data.lots.push(value);
      return value;
    });
  }
  async postMovement(input: MovementInput, c: Command) {
    return this.run("movement", input, c, () => this.applyMovement(input, c));
  }
  private applyMovement(
    input: MovementInput,
    c: Command,
    injectionId?: string,
    expectedProductId?: string,
  ) {
    const lot = this.data.lots.find((l) => l.id === input.lotId);
    invariant(lot, "not_found", "Stock lot not found.", 404);
    invariant(
      !expectedProductId || lot.productId === expectedProductId,
      "injection_product",
      "The stock product no longer matches this injection.",
    );
    if (input.patientId) this.patient(input.patientId);
    const original = this.data.movements.find((m) => m.id === input.reversesId);
    const alreadyReversed =
      input.reversesId !== null &&
      this.data.movements.some((m) => m.reversesId === input.reversesId);
    const patientReserved = this.data.movements
      .filter((m) => m.lotId === lot.id && m.patientId === input.patientId)
      .reduce((sum, m) => sum + m.reservedDelta, 0);
    invariant(
      !input.reversesId || !this.injectionStockLinks.has(input.reversesId),
      "injection_stock",
      "Injection stock history cannot be reversed. Add an administration amendment; reconcile stock separately.",
    );
    const change = evaluateMovement(
      input,
      lot,
      patientReserved,
      c.actor,
      clinicDate(this.timezone),
      original,
      alreadyReversed,
    );
    if (!injectionId && change.reservedDelta < 0) {
      const protectedUnits = this.injections
        .filter(
          (i) =>
            i.status === "reviewed" &&
            i.review?.lotId === lot.id &&
            i.patientId === change.patientId,
        )
        .reduce((sum, i) => sum + i.review!.stockUnits, 0);
      invariant(
        patientReserved + change.reservedDelta >= protectedUnits,
        "injection_reservation",
        "This stock is reserved for a reviewed injection. Change that injection to release it.",
      );
    }
    const value: Movement = {
      ...input,
      id: randomUUID(),
      stockDelta: change.stockDelta,
      reservedDelta: change.reservedDelta,
      patientId: change.patientId,
      actorId: c.actor.id,
      createdAt: new Date().toISOString(),
    };
    lot.onHand = change.onHand;
    lot.reserved = change.reserved;
    this.data.movements.unshift(value);
    if (injectionId) this.injectionStockLinks.add(value.id);
    return value;
  }
  async listInjections(_actor: Actor) {
    return structuredClone(this.injections.slice(0, 250));
  }
  private injection(id: string) {
    const value = this.injections.find((i) => i.id === id);
    invariant(value, "not_found", "Injection not found.", 404);
    return value;
  }
  private saveInjection(value: InjectionCase) {
    this.patient(value.patientId);
    invariant(
      this.data.products.some((p) => p.id === value.productId),
      "not_found",
      "Product not found.",
      404,
    );
    invariant(
      !this.injections.some(
        (i) =>
          i.id !== value.id &&
          i.status !== "cancelled" &&
          value.status !== "cancelled" &&
          i.patientId === value.patientId &&
          i.productId === value.productId &&
          i.tebraOrderReference.toLowerCase() ===
            value.tebraOrderReference.toLowerCase() &&
          i.plannedOn === value.plannedOn &&
          i.doseSequence === value.doseSequence,
      ),
      "duplicate",
      "This ordered injection is already scheduled for this date.",
    );
    const index = this.injections.findIndex((i) => i.id === value.id);
    if (index === -1) this.injections.unshift(value);
    else this.injections[index] = value;
    return value;
  }
  private injectionMovement(
    current: InjectionCase,
    c: Command,
    kind: "reserve" | "release" | "use",
    lotId: string,
    quantity: number,
  ) {
    return this.applyMovement(
      {
        lotId,
        kind,
        quantity,
        patientId: current.patientId,
        reason: `Injection ${current.id}: ${kind}`,
        reversesId: null,
      },
      c,
      current.id,
      current.productId,
    );
  }
  async createInjection(input: InjectionInput, c: Command) {
    return this.run("injection.created", input, c, () =>
      this.saveInjection(createInjectionCase(input)),
    );
  }
  async updateInjection(id: string, input: InjectionUpdate, c: Command) {
    return this.run("injection.updated", { id, ...input }, c, () => {
      const current = this.injection(id),
        next = reviseInjection(current, input);
      if (current.status === "reviewed" && current.review)
        this.injectionMovement(
          current,
          c,
          "release",
          current.review.lotId,
          current.review.stockUnits,
        );
      return this.saveInjection(next);
    });
  }
  private pairedInjection(
    current: InjectionCase,
    pairedId?: string,
  ): InjectionCase | undefined {
    if (!pairedId) return undefined;
    invariant(
      pairedId !== current.id,
      "paired_self",
      "An injection cannot be its own paired component.",
      400,
    );
    const pair = this.injection(pairedId);
    const reused = this.injections.some(
      (value) =>
        value.id !== current.id &&
        value.id !== pairedId &&
        workstationStateForRecord(value)?.pairedCaseId === pairedId &&
        value.status !== "cancelled",
    );
    invariant(
      !reused,
      "paired_case_reused",
      "The selected component is already linked to another injection.",
      400,
    );
    return pair;
  }
  async reviewInjection(id: string, input: InjectionReviewInput, c: Command) {
    return this.run("injection.reviewed", { id, ...input }, c, () => {
      const current = this.injection(id);
      const patient = this.data.patients.find(
          (p) => p.id === current.patientId,
        ),
        product = this.data.products.find((p) => p.id === current.productId),
        lot = this.data.lots.find((l) => l.id === input.lotId);
      invariant(
        patient && product && lot,
        "not_found",
        "Patient, product, or lot not found.",
        404,
      );
      const next = reviewInjectionCase(
        current,
        input,
        c.actor,
        patient,
        product,
        lot,
        clinicDate(this.timezone),
        "",
        this.timezone,
        this.pairedInjection(current, input.workstation?.pairedCaseId),
      );
      const movement = this.injectionMovement(
        current,
        c,
        "reserve",
        lot.id,
        input.stockUnits,
      );
      next.review!.reservationMovementId = movement.id;
      return this.saveInjection(next);
    });
  }
  async administerInjection(
    id: string,
    input: InjectionAdministrationInput,
    c: Command,
  ) {
    return this.run("injection.administered", { id, ...input }, c, () => {
      const current = this.injection(id);
      const next = administerInjectionCase(
        current,
        input,
        c.actor,
        clinicDate(this.timezone),
        "",
        this.timezone,
        this.pairedInjection(
          current,
          current.review?.workstation?.pairedCaseId,
        ),
      );
      const movement = this.injectionMovement(
        current,
        c,
        "use",
        current.review!.lotId,
        current.review!.stockUnits,
      );
      next.administration!.stockMovementId = movement.id;
      return this.saveInjection(next);
    });
  }
  async dispositionInjection(
    id: string,
    input: InjectionDispositionInput,
    c: Command,
  ) {
    return this.run("injection.disposition", { id, ...input }, c, () => {
      const current = this.injection(id),
        next = disposeInjection(current, input, c.actor);
      if (current.status === "reviewed" && current.review)
        this.injectionMovement(
          current,
          c,
          "release",
          current.review.lotId,
          current.review.stockUnits,
        );
      return this.saveInjection(next);
    });
  }
  async amendInjection(id: string, input: InjectionAmendmentInput, c: Command) {
    return this.run("injection.amended", { id, ...input }, c, () =>
      this.saveInjection(
        amendInjectionCase(this.injection(id), input, c.actor),
      ),
    );
  }
  async fileInjection(id: string, input: InjectionFilingInput, c: Command) {
    return this.run("injection.filed", { id, ...input }, c, () =>
      this.saveInjection(fileInjectionCase(this.injection(id), input, c.actor)),
    );
  }
  async close() {}
}
export async function seededDemo(timezone: string) {
  const repo = new DemoRepository(timezone);
  const command = (): Command => ({
    key: randomUUID(),
    actor: {
      id: "synthetic-demo-staff",
      roles: ["Console.Operator", "Inventory.Manager"],
    },
  });
  const patients = [];
  for (const [displayName, dob, tebraId] of [
    ["Alex Morgan (demo)", "1987-04-12", "DEMO-1001"],
    ["Jordan Lee (demo)", "1992-11-08", "DEMO-1002"],
    ["Taylor Rivera (demo)", "1978-06-21", "DEMO-1003"],
  ]) {
    patients.push(
      await repo.createPatient(
        {
          displayName: displayName!,
          dob: dob!,
          tebraId: tebraId!,
          verifiedInTebra: true,
        },
        command(),
      ),
    );
  }
  const product = await repo.createProduct(
    {
      name: "Demonstration injection kit",
      strength: "Training stock only",
      unit: "kit",
      ndc: "00000-0000-00", // Synthetic package identifier; no real medication.
    },
    command(),
  );
  const lot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "DEMO-2609",
      expiresOn: "2028-03-31",
      location: "San Bernardino · medication cabinet",
      ownership: "sample",
      ownerPatientId: null,
    },
    command(),
  );
  await repo.postMovement(
    {
      lotId: lot.id,
      kind: "receive",
      quantity: 12,
      patientId: null,
      reason: "Synthetic opening delivery",
      reversesId: null,
    },
    command(),
  );
  await repo.postMovement(
    {
      lotId: lot.id,
      kind: "reserve",
      quantity: 1,
      patientId: patients[0]!.id,
      reason: "Demonstration reservation",
      reversesId: null,
    },
    command(),
  );
  for (const [index, service] of ["Injection", "UDS", "TMS"].entries())
    await repo.createActivity(
      {
        patientId: patients[index]!.id,
        service: service as ActivityInput["service"],
      },
      command(),
    );
  await repo.createInjection(
    {
      doseSequence: 1,
      patientId: patients[0]!.id,
      productId: product.id,
      tebraOrderReference: "DEMO-ORDER-1001",
      orderingProvider: "Training provider",
      dose: 1,
      doseUnit: "mL",
      route: "IM",
      site: "Left deltoid",
      plannedOn: clinicDate(timezone),
      lastAdministrationAt: null,
      timingCategory: "initiation",
      timingPlan:
        "Synthetic training order. Verify the actual order in Tebra before patient care.",
      nextDueOn: null,
    },
    command(),
  );
  return repo;
}
