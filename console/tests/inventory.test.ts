import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { movementInput, date, type Actor, type Lot, type MovementInput } from '../src/shared/contracts.js';
import { evaluateMovement } from '../src/server/modules/inventory.js';
import { DemoRepository } from '../src/server/platform/demo-repository.js';
const actor: Actor = { id: 'test-staff', roles: ['Console.Operator','Inventory.Manager'] };
const lot: Lot = { id: randomUUID(), productId: randomUUID(), lotNumber: 'TEST', expiresOn: '2030-06-30', location: 'Test cabinet', ownership: 'clinic', ownerPatientId: null, status: 'active', onHand: 3, reserved: 1 };
const patientId = randomUUID();
const input = (patch: Partial<MovementInput> = {}): MovementInput => ({ lotId: lot.id, kind: 'reserve', quantity: 1, patientId, reason: 'Test operation', reversesId: null, ...patch });
describe('inventory invariants', () => {
  it('reserves stock without consuming it', () => { expect(evaluateMovement(input(),lot,0,actor,'2026-09-15')).toMatchObject({ onHand: 3, reserved: 2, stockDelta: 0 }); });
  it('does not allocate someone else’s patient-specific stock', () => { expect(() => evaluateMovement(input(), {...lot,ownership:'patient',ownerPatientId:randomUUID()},0,actor,'2026-09-15')).toThrow('owner'); });
  it.each(['reserve','use'] as const)('blocks %s of expired or quarantined stock', kind => {
    expect(() => evaluateMovement(input({kind}), {...lot,expiresOn:'2026-09-14'},1,actor,'2026-09-15')).toThrow('expired');
    expect(() => evaluateMovement(input({kind}), {...lot,status:'quarantined'},1,actor,'2026-09-15')).toThrow('quarantined');
  });
  it('allows release of an expired reservation', () => { expect(evaluateMovement(input({kind:'release'}),{...lot,expiresOn:'2020-01-01'},1,actor,'2026-09-15').reserved).toBe(0); });
  it('cannot consume another patient’s reservation', () => { expect(() => evaluateMovement(input({kind:'use'}),lot,0,actor,'2026-09-15')).toThrow('patient does not have enough'); });
  it('protects reserved stock from waste and negative adjustment', () => {
    for (const change of [{kind:'waste',quantity:3},{kind:'adjust',quantity:-3}] as const) expect(() => evaluateMovement(input(change),lot,0,actor,'2026-09-15')).toThrow('available stock');
  });
  it('consumes reserved stock with both balances updated', () => { expect(evaluateMovement(input({kind:'use'}),lot,1,actor,'2026-09-15')).toMatchObject({ onHand:2,reserved:0,stockDelta:-1,reservedDelta:-1 }); });
  it('requires manager access for corrections', () => { expect(() => evaluateMovement(input({kind:'adjust'}),lot,0,{id:'operator',roles:['Console.Operator']},'2026-09-15')).toThrow('manager'); });
  it('rejects fractional stock units, impossible dates, and undocumented commands', () => {
    expect(movementInput.safeParse(input({quantity:0.5})).success).toBe(false);
    expect(movementInput.safeParse(input({reason:''})).success).toBe(false);
    expect(date.safeParse('2026-02-30').success).toBe(false);
    expect(date.safeParse('2028-02-29').success).toBe(true);
  });
  it('preserves balances and uniqueness under repeated concurrent demo requests', async () => {
    const repo=new DemoRepository(); const c=()=>({key:randomUUID(),actor});
    const p=await repo.createPatient({tebraId:'TEST',displayName:'Synthetic Test',dob:'1990-01-01',verifiedInTebra:true},c());
    const product=await repo.createProduct({name:'Test kit',strength:'Training',unit:'kit',ndc:null},c());
    const l=await repo.createLot({...lot, productId:product.id},c());
    const receipt=c(); const receive=input({lotId:l.id,kind:'receive',patientId:null,quantity:2});
    const copies=await Promise.all(Array.from({length:20},()=>repo.postMovement(receive,receipt)));
    expect(new Set(copies.map(m=>m.id)).size).toBe(1);
    await expect(repo.postMovement({...receive,quantity:3},receipt)).rejects.toThrow('Request key');
    const results=await Promise.allSettled(Array.from({length:10},()=>repo.postMovement(input({lotId:l.id,patientId:p.id}),c())));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    const overview=await repo.overview(actor); expect(overview.lots[0]).toMatchObject({onHand:2,reserved:2});
    expect(overview.movements.reduce((s,m)=>s+m.stockDelta,0)).toBe(2);
    expect(overview.movements.reduce((s,m)=>s+m.reservedDelta,0)).toBe(2);
  });
  it('reverses by reference and cannot reverse a movement twice', () => {
    const original={...input({kind:'receive',patientId:null}),id:randomUUID(),stockDelta:1,reservedDelta:0,actorId:actor.id,createdAt:new Date().toISOString()};
    const correction=input({kind:'reverse',quantity:0,reversesId:original.id,patientId:null});
    expect(evaluateMovement(correction,lot,0,actor,'2026-09-15',original)).toMatchObject({onHand:2,reserved:1});
    expect(() => evaluateMovement(correction,lot,0,actor,'2026-09-15',original,true)).toThrow('already reversed');
  });
});
