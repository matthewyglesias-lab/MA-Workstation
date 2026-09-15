import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/server/app.js';
import { DemoRepository } from '../src/server/platform/demo-repository.js';
import { readConfig, clinicDate } from '../src/server/platform/config.js';
import { validateClaims } from '../src/server/platform/auth.js';
import { validateActivityUpdate } from '../src/server/modules/work.js';
import type { Activity } from '../src/shared/contracts.js';
const clinicId=randomUUID();
const config=readConfig({CONSOLE_MODE:'demo',CLINIC_ID:clinicId});
describe('API trust boundaries',()=>{
  it('refuses implicit demo, production demo, and public demo binding',()=>{
    expect(()=>readConfig({CLINIC_ID:clinicId})).toThrow();
    expect(()=>readConfig({CONSOLE_MODE:'demo',CLINIC_ID:clinicId,NODE_ENV:'production'})).toThrow('restricted');
    expect(()=>readConfig({CONSOLE_MODE:'demo',CLINIC_ID:clinicId,HOST:'0.0.0.0'})).toThrow('restricted');
  });
  it('uses the clinic date across UTC midnight',()=>{expect(clinicDate('America/Los_Angeles',new Date('2026-09-15T01:00:00Z'))).toBe('2026-09-14');});
  it('requires audience validation separately, correct tenant, application, scope and staff roles',()=>{
    const c={...config,tenantId:randomUUID(),webClientId:randomUUID()};
    const claims={tid:c.tenantId,azp:c.webClientId,ver:'2.0',oid:randomUUID(),scp:'access_as_user',roles:['Console.Reader']};
    expect(validateClaims(claims,c).roles).toEqual(['Console.Reader']);
    for (const change of [{tid:randomUUID()},{azp:randomUUID()},{scp:'User.Read'},{roles:[]},{oid:undefined}]) expect(()=>validateClaims({...claims,...change},c)).toThrow();
  });
  it('requires authentication in SQL mode',async()=>{
    const app=await buildApp({...config,mode:'sql',tenantId:randomUUID(),apiClientId:randomUUID(),webClientId:randomUUID()},new DemoRepository());
    const result=await app.inject({url:'/api/v1/overview'});expect(result.statusCode).toBe(401);await app.close();
  });
  it('blocks reader writes and untrusted origins',async()=>{
    const app=await buildApp(config,new DemoRepository(),async()=>({id:'reader',roles:['Console.Reader']}));
    expect((await app.inject({method:'POST',url:'/api/v1/patients',payload:{}})).statusCode).toBe(403);
    expect((await app.inject({url:'/api/v1/overview',headers:{origin:'https://untrusted.example'}})).statusCode).toBe(403);
    expect((await app.inject({url:'/api/v1/overview',headers:{host:'untrusted.example'}})).statusCode).toBe(403);
    await app.close();
  });
  it('enforces schema, retry keys and uniqueness at the API boundary',async()=>{
    const app=await buildApp(config,new DemoRepository());
    const payload={tebraId:'SYNTHETIC-1',displayName:'Synthetic Patient',dob:'1990-01-01',verifiedInTebra:true};
    expect((await app.inject({method:'POST',url:'/api/v1/patients',payload})).statusCode).toBe(400);
    const headers={'idempotency-key':randomUUID()};
    const first=await app.inject({method:'POST',url:'/api/v1/patients',headers,payload});expect(first.statusCode).toBe(201);
    const retry=await app.inject({method:'POST',url:'/api/v1/patients',headers,payload});expect(retry.json()).toEqual(first.json());
    expect((await app.inject({method:'POST',url:'/api/v1/patients',headers,payload:{...payload,displayName:'Changed'}})).statusCode).toBe(409);
    expect((await app.inject({method:'POST',url:'/api/v1/patients',headers:{'idempotency-key':randomUUID()},payload:{...payload,clinicalDiagnosis:'invented'}})).statusCode).toBe(400);
    const overview=await app.inject({url:'/api/v1/overview'});expect(overview.headers['cache-control']).toBe('no-store');expect(overview.json().patients).toHaveLength(1);await app.close();
  });
});
describe('Tebra handoff remains explicit',()=>{
  const activity: Activity={id:randomUUID(),patientId:randomUUID(),service:'Injection',status:'in_progress',handoff:'pending',tebraReference:null,version:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const update={expectedVersion:2,status:'completed' as const,handoff:'prepared' as const,tebraReference:null};
  it('does not require filing just to complete a service',()=>{expect(()=>validateActivityUpdate(activity,update)).not.toThrow();});
  it('requires a filing reference and completed service',()=>{expect(()=>validateActivityUpdate(activity,{...update,handoff:'filed'})).toThrow('filing reference');});
  it('rejects stale writes and overwriting filed handoffs',()=>{
    expect(()=>validateActivityUpdate(activity,{...update,expectedVersion:1})).toThrow('Another staff');
    expect(()=>validateActivityUpdate({...activity,handoff:'filed'},update)).toThrow('overwritten');
  });
});
