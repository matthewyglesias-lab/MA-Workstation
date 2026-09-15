import { verifyPinSql } from "./pin.sql.js";
import { clinicDate } from "../src/server/platform/config.js";
import type {
  InjectionInput,
  InjectionReviewInput,
} from "../src/shared/injections.js";
import { getInjectionReviewChecks } from "../src/shared/injection-readiness.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { migrate } from "../src/server/platform/migrate.js";
import { connectSql } from "../src/server/platform/sql-connection.js";
import { SqlRepository } from "../src/server/platform/sql-repository.js";
import type { Actor, MovementInput } from "../src/shared/contracts.js";

// This suite creates a disposable LOCAL SQL Server database. It refuses Azure or production targets.
const database = process.env.SQL_DATABASE || "console_test";
assert.match(database, /^console_test[a-zA-Z0-9_]*$/);
assert.ok(["127.0.0.1", "localhost"].includes(process.env.SQL_SERVER || ""));
assert.notEqual(process.env.NODE_ENV, "production");
let admin: sql.ConnectionPool | undefined;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    admin = await connectSql({ ...process.env, SQL_DATABASE: "master" });
    break;
  } catch (error) {
    if (attempt === 44) throw error;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
assert.ok(admin);
await admin
  .request()
  .query(`IF DB_ID('${database}') IS NULL CREATE DATABASE [${database}]`);
await admin.close();
const pool = await connectSql({ ...process.env, SQL_DATABASE: database });
try {
  await migrate(pool);
  await migrate(pool); // Repeat migrations must be safe.
  const clinic = randomUUID(),
    otherClinic = randomUUID();
  await pool
    .request()
    .input("a", sql.UniqueIdentifier, clinic)
    .input("b", sql.UniqueIdentifier, otherClinic)
    .query(
      "INSERT dbo.Clinics(id,name,timezone) VALUES(@a,'Synthetic A','America/Los_Angeles'),(@b,'Synthetic B','America/Los_Angeles')",
    );
  const repo = new SqlRepository(pool, clinic, "America/Los_Angeles");
  const other = new SqlRepository(pool, otherClinic, "America/Los_Angeles");
  const actor: Actor = {
    id: randomUUID(),
    roles: ["Console.Operator", "Inventory.Manager"],
  };
  const c = () => ({ key: randomUUID(), actor });
  const patient = await repo.createPatient(
    {
      tebraId: "TEST-1",
      displayName: "Synthetic SQL Patient",
      dob: "1990-01-01",
      verifiedInTebra: true,
    },
    c(),
  );
  await assert.rejects(
    repo.createPatient(
      {
        tebraId: "TEST-1",
        displayName: "Duplicate",
        dob: "1990-01-01",
        verifiedInTebra: true,
      },
      c(),
    ),
    /matching record/,
  );
  await assert.rejects(
    other.createActivity({ patientId: patient.id, service: "Injection" }, c()),
    /linked record/,
  );
  const product = await repo.createProduct(
    {
      name: "Synthetic SQL kit",
      strength: "Training only",
      unit: "kit",
      ndc: null,
    },
    c(),
  );
  const lot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "SQL-TEST",
      expiresOn: "2035-01-01",
      location: "Test cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    c(),
  );
  const input = (change: Partial<MovementInput>): MovementInput => ({
    lotId: lot.id,
    kind: "receive",
    quantity: 2,
    patientId: null,
    reason: "Synthetic SQL test",
    reversesId: null,
    ...change,
  });
  const receiveKey = c();
  const receipts = await Promise.all(
    Array.from({ length: 12 }, () => repo.postMovement(input({}), receiveKey)),
  );
  assert.equal(
    new Set(receipts.map((r) => r.id)).size,
    1,
    "Duplicate request applied twice",
  );
  await assert.rejects(
    repo.postMovement(input({ quantity: 3 }), receiveKey),
    /request key/,
  );
  const races = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      repo.postMovement(
        input({ kind: "reserve", quantity: 1, patientId: patient.id }),
        c(),
      ),
    ),
  );
  assert.equal(
    races.filter((r) => r.status === "fulfilled").length,
    2,
    "Concurrent reservations over-allocated stock",
  );
  let state = await repo.overview(actor);
  assert.equal(state.lots[0]!.onHand, 2);
  assert.equal(state.lots[0]!.reserved, 2);
  const usage = await repo.postMovement(
    input({ kind: "use", quantity: 1, patientId: patient.id }),
    c(),
  );
  const beforeFailure = (await repo.overview(actor)).movements.length;
  await assert.rejects(
    repo.postMovement(input({ kind: "waste", quantity: 2 }), c()),
    /available stock/,
  );
  state = await repo.overview(actor);
  assert.equal(state.movements.length, beforeFailure);
  assert.equal(state.lots[0]!.onHand, 1);
  await repo.postMovement(
    input({
      kind: "reverse",
      quantity: 0,
      reversesId: usage.id,
      patientId: patient.id,
    }),
    c(),
  );
  await assert.rejects(
    repo.postMovement(
      input({
        kind: "reverse",
        quantity: 0,
        reversesId: usage.id,
        patientId: patient.id,
      }),
      c(),
    ),
    /already reversed/,
  );
  state = await repo.overview(actor);
  assert.equal(
    state.lots[0]!.onHand,
    state.movements.reduce((sum, m) => sum + m.stockDelta, 0),
  );
  assert.equal(
    state.lots[0]!.reserved,
    state.movements.reduce((sum, m) => sum + m.reservedDelta, 0),
  );
  assert.equal(
    (await other.overview(actor)).patients.length,
    0,
    "Clinic records leaked",
  );
  const activity = await repo.createActivity(
    { patientId: patient.id, service: "Injection" },
    c(),
  );
  const update = {
    expectedVersion: 1,
    status: "completed" as const,
    handoff: "prepared" as const,
    tebraReference: null,
  };
  const activityRace = await Promise.allSettled([
    repo.updateActivity(activity.id, update, c()),
    repo.updateActivity(activity.id, update, c()),
  ]);
  assert.equal(
    activityRace.filter((r) => r.status === "fulfilled").length,
    1,
    "Stale activity edit succeeded",
  );
  const finalized = await repo.updateActivity(
    activity.id,
    {
      ...update,
      expectedVersion: 2,
      handoff: "filed",
      tebraReference: "Synthetic Tebra filing",
    },
    c(),
  );
  assert.equal(finalized.handoff, "filed");
  await assert.rejects(
    repo.updateActivity(activity.id, { ...update, expectedVersion: 3 }, c()),
    /overwritten/,
  );
  // Injection review, stock reservation, administration, and record history share one transaction.
  const injectionLot = await repo.createLot(
    {
      productId: product.id,
      lotNumber: "INJECTION-SQL",
      expiresOn: "2035-01-01",
      location: "Injection cabinet",
      ownership: "clinic",
      ownerPatientId: null,
    },
    c(),
  );
  await repo.postMovement(
    input({ lotId: injectionLot.id, kind: "receive", quantity: 2 }),
    c(),
  );
  const injectionInput: InjectionInput = {
    patientId: patient.id,
    productId: product.id,
    doseSequence: 1,
    tebraOrderReference: "SQL-INJECTION-ORDER",
    orderingProvider: "Synthetic provider",
    dose: 100,
    doseUnit: "mg",
    route: "IM",
    site: "Left deltoid",
    plannedOn: clinicDate("America/Los_Angeles"),
    lastAdministrationAt: null,
    timingCategory: "initiation",
    timingPlan: "Verified synthetic provider plan",
    nextDueOn: null,
    clinicalContext: {
      phase: "initiation",
      indication: "Synthetic local SQL test; no patient care",
      schedule: null,
      historySource: null,
      priorProduct: null,
      priorDose: null,
      linkedPlan: "SQL-INJECTION-ORDER",
    },
  };
  const reviewInput: InjectionReviewInput = {
    expectedVersion: 1,
    lotId: injectionLot.id,
    stockUnits: 1,
    checks: {
      identity: true,
      order: true,
      allergy: true,
      medication: true,
      timing: true,
      consent: true,
    },
    allergyReview: "Reviewed synthetic chart",
    clinicalReview: "Screened per synthetic order",
    preparation: "Prepared per instructions",
    siteAssessment: "Reviewed site",
    vitals: {
      status: "not_recorded",
      bpSystolic: null,
      bpDiastolic: null,
      pulse: null,
      temperatureC: null,
      oxygenSaturation: null,
      reason: "Test only",
    },
    observationPlan: "Synthetic order",
    assessment: {
      screening: getInjectionReviewChecks(product.name).map(
        ({ id, label }) => ({
          id,
          label,
          result: "no_concern",
          detail: "Synthetic local SQL test; no patient assessment",
        }),
      ),
      weightKg: null,
      needle: null,
      providerCommunication: {
        provider: "Synthetic SQL provider",
        contactedAt: new Date().toISOString(),
        decision: "proceed_as_ordered",
        instructions:
          "Synthetic initiation plan for local SQL verification only",
        reference: "SQL-INJECTION-ORDER",
      },
      education: [],
    },
  };
  await assert.rejects(
    other.createInjection(injectionInput, c()),
    /linked record/,
  );
  const injection = await repo.createInjection(injectionInput, c());
  await assert.rejects(
    repo.createInjection(injectionInput, c()),
    /matching record/,
  );
  const reviewRace = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      repo.reviewInjection(injection.id, reviewInput, c()),
    ),
  );
  assert.equal(
    reviewRace.filter((r) => r.status === "fulfilled").length,
    1,
    "Concurrent review reserved twice",
  );
  let injectionState = (await repo.listInjections(actor))[0]!;
  assert.equal(injectionState.review!.productSnapshot.name, product.name);
  await assert.rejects(
    other.reviewInjection(injection.id, reviewInput, c()),
    /not found/,
  );
  assert.equal((await other.listInjections(actor)).length, 0);
  for (const kind of ["use", "release"] as const)
    await assert.rejects(
      repo.postMovement(
        input({
          lotId: injectionLot.id,
          kind,
          quantity: 1,
          patientId: patient.id,
        }),
        c(),
      ),
      /reserved for a reviewed injection/,
    );
  await assert.rejects(
    repo.postMovement(
      input({
        lotId: injectionLot.id,
        kind: "reverse",
        quantity: 0,
        patientId: patient.id,
        reversesId: injectionState.review!.reservationMovementId,
      }),
      c(),
    ),
    /cannot be reversed/,
  );
  // An invalid cross-clinic/unknown patient edit releases stock first internally, then must roll everything back.
  await assert.rejects(
    repo.updateInjection(
      injection.id,
      { ...injectionInput, patientId: randomUUID(), expectedVersion: 2 },
      c(),
    ),
    /linked record/,
  );
  assert.equal((await repo.listInjections(actor))[0]!.status, "reviewed");
  assert.equal(
    (await repo.overview(actor)).lots.find((l) => l.id === injectionLot.id)!
      .reserved,
    1,
  );
  await pool
    .request()
    .input("clinic", sql.UniqueIdentifier, clinic)
    .input("id", sql.UniqueIdentifier, injectionLot.id)
    .query(
      "UPDATE dbo.StockLots SET status='quarantined' WHERE clinicId=@clinic AND id=@id",
    );
  const administration = {
    expectedVersion: 2,
    administeredAt: new Date().toISOString(),
    administeredByName: "SQL test staff",
    tolerance: "Synthetic",
    observation: "Synthetic",
    delivery: "complete" as const,
    actualDose: null,
    issueAction: null,
  };
  await assert.rejects(
    repo.administerInjection(injection.id, administration, c()),
    /quarantined/,
  );
  await pool
    .request()
    .input("clinic", sql.UniqueIdentifier, clinic)
    .input("id", sql.UniqueIdentifier, injectionLot.id)
    .query(
      "UPDATE dbo.StockLots SET status='active' WHERE clinicId=@clinic AND id=@id",
    );
  const administrationKey = c();
  const administrations = await Promise.all(
    Array.from({ length: 10 }, () =>
      repo.administerInjection(injection.id, administration, administrationKey),
    ),
  );
  assert.equal(
    new Set(administrations.map((i) => i.administration!.id)).size,
    1,
    "Idempotent administration consumed twice",
  );
  injectionState = administrations[0]!;
  assert.equal(
    (await repo.overview(actor)).lots.find((l) => l.id === injectionLot.id)!
      .onHand,
    1,
  );
  await assert.rejects(
    repo.updateInjection(
      injection.id,
      { ...injectionInput, expectedVersion: 3 },
      c(),
    ),
    /cannot be edited/,
  );
  await assert.rejects(
    repo.postMovement(
      input({
        lotId: injectionLot.id,
        kind: "reverse",
        quantity: 0,
        patientId: patient.id,
        reversesId: injectionState.administration!.stockMovementId,
      }),
      c(),
    ),
    /cannot be reversed/,
  );
  await repo.fileInjection(
    injection.id,
    { expectedVersion: 3, tebraReference: "Tebra SQL note" },
    c(),
  );
  const amended = await repo.amendInjection(
    injection.id,
    {
      expectedVersion: 4,
      reason: "Test correction",
      text: "Appended observation",
    },
    c(),
  );
  assert.deepEqual(amended.administration, injectionState.administration);
  assert.equal(amended.handoff, "pending");
  assert.equal(amended.filings.length, 1);
  const secondDose = await repo.createInjection(
    { ...injectionInput, doseSequence: 2, site: "Right deltoid" },
    c(),
  );
  await repo.reviewInjection(secondDose.id, reviewInput, c());
  const distinctRaces = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      repo.administerInjection(
        secondDose.id,
        { ...administration, administeredAt: new Date().toISOString() },
        c(),
      ),
    ),
  );
  assert.equal(
    distinctRaces.filter((r) => r.status === "fulfilled").length,
    1,
    "Stale concurrent administration consumed stock",
  );
  const finalLot = (await repo.overview(actor)).lots.find(
    (l) => l.id === injectionLot.id,
  )!;
  assert.deepEqual([finalLot.onHand, finalLot.reserved], [0, 0]);
  const history = await pool
    .request()
    .input("clinic", sql.UniqueIdentifier, clinic)
    .query(
      "SELECT (SELECT COUNT(*) FROM dbo.InjectionAdministrations WHERE clinicId=@clinic) administrations,(SELECT COUNT(*) FROM dbo.InjectionAmendments WHERE clinicId=@clinic) amendments,(SELECT COUNT(*) FROM dbo.InjectionFilings WHERE clinicId=@clinic) filings,(SELECT COUNT(*) FROM dbo.InjectionEvents WHERE clinicId=@clinic) events",
    );
  assert.deepEqual(history.recordset[0], {
    administrations: 2,
    amendments: 1,
    filings: 1,
    events: 8,
  });
  const counts = await pool
    .request()
    .input("clinic", sql.UniqueIdentifier, clinic)
    .query(
      "SELECT (SELECT COUNT(*) FROM dbo.CommandReceipts WHERE clinicId=@clinic) receipts,(SELECT COUNT(*) FROM dbo.OutboxEvents WHERE clinicId=@clinic) events,(SELECT COUNT(*) FROM dbo.AuditEvents WHERE clinicId=@clinic AND action NOT LIKE '%.read') audits",
    );
  assert.equal(counts.recordset[0].receipts, counts.recordset[0].events);
  assert.equal(counts.recordset[0].receipts, counts.recordset[0].audits);
  // Confirm the database denies mutation of ledger history to the runtime role.
  await pool
    .request()
    .query(
      "IF USER_ID('console_role_test') IS NULL BEGIN CREATE USER console_role_test WITHOUT LOGIN; ALTER ROLE console_runtime ADD MEMBER console_role_test; END",
    );
  const permissions = await pool
    .request()
    .query(
      "EXECUTE AS USER='console_role_test'; SELECT HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','UPDATE') canUpdate,HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','DELETE') canDelete,HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','INSERT') canInsert; REVERT;",
    );
  assert.equal(permissions.recordset[0].canUpdate, 0);
  assert.equal(permissions.recordset[0].canDelete, 0);
  assert.equal(permissions.recordset[0].canInsert, 1);
  const injectionPermissions = await pool
    .request()
    .query(
      "EXECUTE AS USER='console_role_test'; SELECT HAS_PERMS_BY_NAME('dbo.InjectionAdministrations','OBJECT','UPDATE') canUpdate,HAS_PERMS_BY_NAME('dbo.InjectionEvents','OBJECT','DELETE') canDelete,HAS_PERMS_BY_NAME('dbo.InjectionAmendments','OBJECT','INSERT') canAmend; REVERT;",
    );
  assert.deepEqual(injectionPermissions.recordset[0], {
    canUpdate: 0,
    canDelete: 0,
    canAmend: 1,
  });
  await verifyPinSql(pool, clinic, otherClinic);
  console.log(
    "SQL integration passed: migrations, tenant isolation, concurrent reservations, idempotency, rollback, reversals, version conflicts, handoffs, audit/outbox consistency, immutable ledger role.",
  );
} finally {
  await pool.close();
}
