import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { migrate } from '../src/server/platform/migrate.js';
import { connectSql } from '../src/server/platform/sql-connection.js';
import { SqlRepository } from '../src/server/platform/sql-repository.js';
import type { Actor, MovementInput } from '../src/shared/contracts.js';

// This suite creates a disposable LOCAL SQL Server database. It refuses Azure or production targets.
const database=process.env.SQL_DATABASE || 'console_test';
assert.match(database,/^console_test[a-zA-Z0-9_]*$/);
assert.ok(['127.0.0.1','localhost'].includes(process.env.SQL_SERVER || ''));
assert.notEqual(process.env.NODE_ENV,'production');
let admin: sql.ConnectionPool | undefined;
for(let attempt=0;attempt<45;attempt++) {
  try { admin=await connectSql({...process.env,SQL_DATABASE:'master'}); break; }
  catch(error) { if(attempt===44) throw error; await new Promise(r=>setTimeout(r,1000)); }
}
assert.ok(admin);
await admin.request().query(`IF DB_ID('${database}') IS NULL CREATE DATABASE [${database}]`);
await admin.close();
const pool=await connectSql({...process.env,SQL_DATABASE:database});
try {
  await migrate(pool); await migrate(pool); // Repeat migrations must be safe.
  const clinic=randomUUID(), otherClinic=randomUUID();
  await pool.request().input('a',sql.UniqueIdentifier,clinic).input('b',sql.UniqueIdentifier,otherClinic).query("INSERT dbo.Clinics(id,name,timezone) VALUES(@a,'Synthetic A','America/Los_Angeles'),(@b,'Synthetic B','America/Los_Angeles')");
  const repo=new SqlRepository(pool,clinic,'America/Los_Angeles');
  const other=new SqlRepository(pool,otherClinic,'America/Los_Angeles');
  const actor: Actor={id:randomUUID(),roles:['Console.Operator','Inventory.Manager']};
  const c=()=>({key:randomUUID(),actor});
  const patient=await repo.createPatient({tebraId:'TEST-1',displayName:'Synthetic SQL Patient',dob:'1990-01-01',verifiedInTebra:true},c());
  await assert.rejects(repo.createPatient({tebraId:'TEST-1',displayName:'Duplicate',dob:'1990-01-01',verifiedInTebra:true},c()),/matching record/);
  await assert.rejects(other.createActivity({patientId:patient.id,service:'Injection'},c()),/linked record/);
  const product=await repo.createProduct({name:'Synthetic SQL kit',strength:'Training only',unit:'kit',ndc:null},c());
  const lot=await repo.createLot({productId:product.id,lotNumber:'SQL-TEST',expiresOn:'2035-01-01',location:'Test cabinet',ownership:'clinic',ownerPatientId:null},c());
  const input=(change:Partial<MovementInput>):MovementInput=>({lotId:lot.id,kind:'receive',quantity:2,patientId:null,reason:'Synthetic SQL test',reversesId:null,...change});
  const receiveKey=c();
  const receipts=await Promise.all(Array.from({length:12},()=>repo.postMovement(input({}),receiveKey)));
  assert.equal(new Set(receipts.map(r=>r.id)).size,1,'Duplicate request applied twice');
  await assert.rejects(repo.postMovement(input({quantity:3}),receiveKey),/request key/);
  const races=await Promise.allSettled(Array.from({length:8},()=>repo.postMovement(input({kind:'reserve',quantity:1,patientId:patient.id}),c())));
  assert.equal(races.filter(r=>r.status==='fulfilled').length,2,'Concurrent reservations over-allocated stock');
  let state=await repo.overview(actor); assert.equal(state.lots[0]!.onHand,2); assert.equal(state.lots[0]!.reserved,2);
  const usage=await repo.postMovement(input({kind:'use',quantity:1,patientId:patient.id}),c());
  const beforeFailure=(await repo.overview(actor)).movements.length;
  await assert.rejects(repo.postMovement(input({kind:'waste',quantity:2}),c()),/available stock/);
  state=await repo.overview(actor); assert.equal(state.movements.length,beforeFailure); assert.equal(state.lots[0]!.onHand,1);
  await repo.postMovement(input({kind:'reverse',quantity:0,reversesId:usage.id,patientId:patient.id}),c());
  await assert.rejects(repo.postMovement(input({kind:'reverse',quantity:0,reversesId:usage.id,patientId:patient.id}),c()),/already reversed/);
  state=await repo.overview(actor);
  assert.equal(state.lots[0]!.onHand,state.movements.reduce((sum,m)=>sum+m.stockDelta,0));
  assert.equal(state.lots[0]!.reserved,state.movements.reduce((sum,m)=>sum+m.reservedDelta,0));
  assert.equal((await other.overview(actor)).patients.length,0,'Clinic records leaked');
  const activity=await repo.createActivity({patientId:patient.id,service:'Injection'},c());
  const update={expectedVersion:1,status:'completed' as const,handoff:'prepared' as const,tebraReference:null};
  const activityRace=await Promise.allSettled([repo.updateActivity(activity.id,update,c()),repo.updateActivity(activity.id,update,c())]);
  assert.equal(activityRace.filter(r=>r.status==='fulfilled').length,1,'Stale activity edit succeeded');
  const finalized=await repo.updateActivity(activity.id,{...update,expectedVersion:2,handoff:'filed',tebraReference:'Synthetic Tebra filing'},c());
  assert.equal(finalized.handoff,'filed');
  await assert.rejects(repo.updateActivity(activity.id,{...update,expectedVersion:3},c()),/overwritten/);
  const counts=await pool.request().input('clinic',sql.UniqueIdentifier,clinic).query("SELECT (SELECT COUNT(*) FROM dbo.CommandReceipts WHERE clinicId=@clinic) receipts,(SELECT COUNT(*) FROM dbo.OutboxEvents WHERE clinicId=@clinic) events,(SELECT COUNT(*) FROM dbo.AuditEvents WHERE clinicId=@clinic AND action NOT LIKE '%.read') audits");
  assert.equal(counts.recordset[0].receipts,counts.recordset[0].events); assert.equal(counts.recordset[0].receipts,counts.recordset[0].audits);
  // Confirm the database denies mutation of ledger history to the runtime role.
  await pool.request().query("IF USER_ID('console_role_test') IS NULL BEGIN CREATE USER console_role_test WITHOUT LOGIN; ALTER ROLE console_runtime ADD MEMBER console_role_test; END");
  const permissions=await pool.request().query("EXECUTE AS USER='console_role_test'; SELECT HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','UPDATE') canUpdate,HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','DELETE') canDelete,HAS_PERMS_BY_NAME('dbo.StockMovements','OBJECT','INSERT') canInsert; REVERT;");
  assert.equal(permissions.recordset[0].canUpdate,0);assert.equal(permissions.recordset[0].canDelete,0);assert.equal(permissions.recordset[0].canInsert,1);
  console.log('SQL integration passed: migrations, tenant isolation, concurrent reservations, idempotency, rollback, reversals, version conflicts, handoffs, audit/outbox consistency, immutable ledger role.');
} finally { await pool.close(); }
