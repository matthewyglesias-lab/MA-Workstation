import { createHash, randomUUID } from 'node:crypto';
import sql from 'mssql';
import type { Activity, ActivityInput, ActivityUpdate, Actor, Lot, LotInput, Movement, MovementInput, Overview, Patient, PatientInput, Product, ProductInput } from '../../shared/contracts.js';
import { evaluateMovement } from '../modules/inventory.js';
import { validateActivityUpdate } from '../modules/work.js';
import { clinicDate } from './config.js';
import { DomainError, invariant } from './errors.js';
import type { Command, Repository } from './repository.js';

const patientColumns = 'id,tebraId,displayName,CONVERT(char(10),dob,23) dob,CONVERT(varchar(30),verifiedAt,126)+\'Z\' verifiedAt,verifiedBy';
const activityColumns = 'id,patientId,service,status,handoff,tebraReference,version,CONVERT(varchar(30),createdAt,126)+\'Z\' createdAt,CONVERT(varchar(30),updatedAt,126)+\'Z\' updatedAt';
const lotColumns = 'id,productId,lotNumber,CONVERT(char(10),expiresOn,23) expiresOn,location,ownership,ownerPatientId,status,onHand,reserved';
const movementColumns = 'id,lotId,kind,quantity,patientId,reason,reversesId,stockDelta,reservedDelta,actorId,CONVERT(varchar(30),createdAt,126)+\'Z\' createdAt';

export class SqlRepository implements Repository {
  constructor(private pool: sql.ConnectionPool, private clinicId: string, private timezone: string) {}
  private request(tx?: sql.Transaction) { return (tx ? tx.request() : this.pool.request()).input('clinic', sql.UniqueIdentifier, this.clinicId); }
  private async command<T extends { id: string }>(action: string, input: unknown, command: Command, work: (tx: sql.Transaction) => Promise<T>): Promise<T> {
    const fingerprint = createHash('sha256').update(JSON.stringify([action, command.actor.id, input])).digest('hex');
    const tx = this.pool.transaction();
    await tx.begin();
    try {
      await tx.request().input('resource', sql.NVarChar(255), `command:${this.clinicId}:${command.key}`).query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Command lock unavailable',1;");
      const receipt = (await this.request(tx).input('key', sql.UniqueIdentifier, command.key).query('SELECT fingerprint,response FROM dbo.CommandReceipts WHERE clinicId=@clinic AND id=@key')).recordset[0];
      if (receipt) {
        invariant(receipt.fingerprint === fingerprint, 'idempotency_conflict', 'This request key was already used for a different operation.');
        await tx.commit();
        return JSON.parse(receipt.response) as T;
      }
      const result = await work(tx);
      await this.request(tx).input('id', sql.UniqueIdentifier, randomUUID()).input('actor', sql.NVarChar(100), command.actor.id).input('action', sql.NVarChar(80), action).input('entity', sql.UniqueIdentifier, result.id)
        .query('INSERT dbo.AuditEvents(clinicId,id,actorId,action,entityId) VALUES(@clinic,@id,@actor,@action,@entity)');
      await this.request(tx).input('id', sql.UniqueIdentifier, randomUUID()).input('action', sql.NVarChar(80), `${action}.v1`).input('entity', sql.UniqueIdentifier, result.id)
        .query('INSERT dbo.OutboxEvents(clinicId,id,eventType,entityId) VALUES(@clinic,@id,@action,@entity)');
      await this.request(tx).input('key', sql.UniqueIdentifier, command.key).input('fingerprint', sql.Char(64), fingerprint).input('response', sql.NVarChar(sql.MAX), JSON.stringify(result))
        .query('INSERT dbo.CommandReceipts(clinicId,id,fingerprint,response) VALUES(@clinic,@key,@fingerprint,@response)');
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      if (error instanceof sql.RequestError && [2601, 2627].includes(error.number ?? 0)) throw new DomainError('duplicate', 'A matching record already exists. Refresh to use the existing record.');
      if (error instanceof sql.RequestError && error.number === 547) throw new DomainError('relationship', 'The operation conflicts with a linked record or stock constraint.');
      throw error;
    }
  }
  async overview(actor: Actor): Promise<Overview> {
    await this.request().input('id', sql.UniqueIdentifier, randomUUID()).input('actor', sql.NVarChar(100), actor.id).query("INSERT dbo.AuditEvents(clinicId,id,actorId,action) VALUES(@clinic,@id,@actor,'console.overview.read')");
    const result = await this.request().query(`
      SELECT TOP(250) ${patientColumns} FROM dbo.Patients WHERE clinicId=@clinic ORDER BY displayName,id;
      SELECT TOP(250) ${activityColumns} FROM dbo.Activities WHERE clinicId=@clinic ORDER BY createdAt DESC,id;
      SELECT TOP(250) id,name,strength,unit,ndc FROM dbo.Products WHERE clinicId=@clinic ORDER BY name,id;
      SELECT TOP(250) ${lotColumns} FROM dbo.StockLots WHERE clinicId=@clinic ORDER BY expiresOn,id;
      SELECT TOP(250) ${movementColumns} FROM dbo.StockMovements WHERE clinicId=@clinic ORDER BY createdAt DESC,id;
    `);
    const sets = result.recordsets as sql.IRecordSet<unknown>[];
    return { patients: sets[0] as Patient[], activities: sets[1] as Activity[], products: sets[2] as Product[], lots: sets[3] as Lot[], movements: sets[4] as Movement[] };
  }
  async createPatient(input: PatientInput, c: Command) {
    return this.command('patient.linked', input, c, async tx => {
      invariant(input.dob <= clinicDate(this.timezone), 'dob_future', 'Date of birth cannot be in the future.', 400);
      const value: Patient = { id: randomUUID(), tebraId: input.tebraId, displayName: input.displayName, dob: input.dob, verifiedAt: new Date().toISOString(), verifiedBy: c.actor.id };
      await this.request(tx).input('id', sql.UniqueIdentifier, value.id).input('tebraId', sql.NVarChar(64), value.tebraId).input('name', sql.NVarChar(160), value.displayName).input('dob', sql.Date, value.dob).input('at', sql.DateTime2(3), new Date(value.verifiedAt)).input('actor', sql.NVarChar(100), value.verifiedBy)
        .query('INSERT dbo.Patients(clinicId,id,tebraId,displayName,dob,verifiedAt,verifiedBy) VALUES(@clinic,@id,@tebraId,@name,@dob,@at,@actor)');
      return value;
    });
  }
  async createActivity(input: ActivityInput, c: Command) {
    return this.command('activity.created', input, c, async tx => {
      const at = new Date().toISOString();
      const value: Activity = { ...input, id: randomUUID(), status: 'planned', handoff: 'pending', tebraReference: null, version: 1, createdAt: at, updatedAt: at };
      await this.request(tx).input('id', sql.UniqueIdentifier, value.id).input('patient', sql.UniqueIdentifier, value.patientId).input('service', sql.NVarChar(30), value.service).input('at', sql.DateTime2(3), new Date(at))
        .query('INSERT dbo.Activities(clinicId,id,patientId,service,createdAt,updatedAt) VALUES(@clinic,@id,@patient,@service,@at,@at)');
      return value;
    });
  }
  async updateActivity(id: string, input: ActivityUpdate, c: Command) {
    return this.command('activity.updated', { id, ...input }, c, async tx => {
      const current = (await this.request(tx).input('id', sql.UniqueIdentifier, id).query(`SELECT ${activityColumns} FROM dbo.Activities WITH(UPDLOCK,HOLDLOCK) WHERE clinicId=@clinic AND id=@id`)).recordset[0] as Activity | undefined;
      invariant(current, 'not_found', 'Activity not found.', 404);
      validateActivityUpdate(current, input);
      const { expectedVersion: _, ...changes } = input;
      const value: Activity = { ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString() };
      await this.request(tx).input('id', sql.UniqueIdentifier, id).input('status', sql.VarChar(20), value.status).input('handoff', sql.VarChar(20), value.handoff).input('reference', sql.NVarChar(200), value.tebraReference).input('at', sql.DateTime2(3), new Date(value.updatedAt))
        .query('UPDATE dbo.Activities SET status=@status,handoff=@handoff,tebraReference=@reference,version=version+1,updatedAt=@at WHERE clinicId=@clinic AND id=@id');
      return value;
    });
  }
  async createProduct(input: ProductInput, c: Command) {
    return this.command('product.created', input, c, async tx => {
      const value: Product = { ...input, id: randomUUID() };
      await this.request(tx).input('id', sql.UniqueIdentifier, value.id).input('name', sql.NVarChar(160), input.name).input('strength', sql.NVarChar(80), input.strength).input('unit', sql.NVarChar(20), input.unit).input('ndc', sql.NVarChar(30), input.ndc)
        .query('INSERT dbo.Products(clinicId,id,name,strength,unit,ndc) VALUES(@clinic,@id,@name,@strength,@unit,@ndc)');
      return value;
    });
  }
  async createLot(input: LotInput, c: Command) {
    return this.command('stock.lot.created', input, c, async tx => {
      const value: Lot = { ...input, id: randomUUID(), status: 'active', onHand: 0, reserved: 0 };
      await this.request(tx).input('id', sql.UniqueIdentifier, value.id).input('product', sql.UniqueIdentifier, input.productId).input('lot', sql.NVarChar(80), input.lotNumber).input('expires', sql.Date, input.expiresOn).input('location', sql.NVarChar(100), input.location).input('ownership', sql.VarChar(20), input.ownership).input('patient', sql.UniqueIdentifier, input.ownerPatientId)
        .query('INSERT dbo.StockLots(clinicId,id,productId,lotNumber,expiresOn,location,ownership,ownerPatientId) VALUES(@clinic,@id,@product,@lot,@expires,@location,@ownership,@patient)');
      return value;
    });
  }
  async postMovement(input: MovementInput, c: Command) {
    return this.command('stock.movement.posted', input, c, async tx => {
      // Lock the stock bucket before inspecting reservations or reversal history.
      // Every stock command takes this lock, including receives and corrections.
      const lot = (await this.request(tx).input('lot', sql.UniqueIdentifier, input.lotId).query(`SELECT ${lotColumns} FROM dbo.StockLots WITH(UPDLOCK,HOLDLOCK) WHERE clinicId=@clinic AND id=@lot`)).recordset[0] as Lot | undefined;
      invariant(lot, 'not_found', 'Stock lot not found.', 404);
      const original = input.reversesId ? (await this.request(tx).input('id', sql.UniqueIdentifier, input.reversesId).query(`SELECT ${movementColumns} FROM dbo.StockMovements WHERE clinicId=@clinic AND id=@id`)).recordset[0] as Movement | undefined : undefined;
      const reversed = input.reversesId ? (await this.request(tx).input('id', sql.UniqueIdentifier, input.reversesId).query('SELECT id FROM dbo.StockMovements WHERE clinicId=@clinic AND reversesId=@id')).recordset.length > 0 : false;
      const patientReserved = input.patientId ? (await this.request(tx).input('lot', sql.UniqueIdentifier, input.lotId).input('patient', sql.UniqueIdentifier, input.patientId).query('SELECT COALESCE(SUM(reservedDelta),0) balance FROM dbo.StockMovements WHERE clinicId=@clinic AND lotId=@lot AND patientId=@patient')).recordset[0].balance as number : 0;
      const change = evaluateMovement(input, lot, patientReserved, c.actor, clinicDate(this.timezone), original, reversed);
      const value: Movement = { ...input, id: randomUUID(), stockDelta: change.stockDelta, reservedDelta: change.reservedDelta, patientId: change.patientId, actorId: c.actor.id, createdAt: new Date().toISOString() };
      await this.request(tx).input('lot', sql.UniqueIdentifier, lot.id).input('onHand', sql.Int, change.onHand).input('reserved', sql.Int, change.reserved)
        .query('UPDATE dbo.StockLots SET onHand=@onHand,reserved=@reserved WHERE clinicId=@clinic AND id=@lot');
      await this.request(tx).input('id', sql.UniqueIdentifier, value.id).input('lot', sql.UniqueIdentifier, lot.id).input('kind', sql.VarChar(20), input.kind).input('quantity', sql.Int, input.quantity).input('patient', sql.UniqueIdentifier, value.patientId).input('reason', sql.NVarChar(300), input.reason).input('reverses', sql.UniqueIdentifier, input.reversesId).input('stockDelta', sql.Int, value.stockDelta).input('reservedDelta', sql.Int, value.reservedDelta).input('actor', sql.NVarChar(100), c.actor.id).input('at', sql.DateTime2(3), new Date(value.createdAt))
        .query('INSERT dbo.StockMovements(clinicId,id,lotId,kind,quantity,patientId,reason,reversesId,stockDelta,reservedDelta,actorId,createdAt) VALUES(@clinic,@id,@lot,@kind,@quantity,@patient,@reason,@reverses,@stockDelta,@reservedDelta,@actor,@at)');
      return value;
    });
  }
  async close() { await this.pool.close(); }
}
