import { randomUUID } from "node:crypto";
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
    const result = work();
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
    return this.run("movement", input, c, () => {
      const lot = this.data.lots.find((l) => l.id === input.lotId);
      invariant(lot, "not_found", "Stock lot not found.", 404);
      if (input.patientId) this.patient(input.patientId);
      const original = this.data.movements.find(
        (m) => m.id === input.reversesId,
      );
      const alreadyReversed =
        input.reversesId !== null &&
        this.data.movements.some((m) => m.reversesId === input.reversesId);
      const patientReserved = this.data.movements
        .filter((m) => m.lotId === lot.id && m.patientId === input.patientId)
        .reduce((sum, m) => sum + m.reservedDelta, 0);
      const change = evaluateMovement(
        input,
        lot,
        patientReserved,
        c.actor,
        clinicDate(this.timezone),
        original,
        alreadyReversed,
      );
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
      return value;
    });
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
      ndc: null,
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
  return repo;
}
