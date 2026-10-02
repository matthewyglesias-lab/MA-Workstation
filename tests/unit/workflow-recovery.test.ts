import { describe, expect, it } from 'vitest';
import { WorkflowRecovery, recoveryKey } from '../../src/persistence/workflow-recovery';
import { SafeStorage, type StorageLike } from '../../src/persistence/storage';
import { emptyFormsEncounter } from '../../src/domain/forms';
import { emptySamplesEncounter } from '../../src/domain/samples';

class Memory implements StorageLike {
  values = new Map<string,string>();
  fail = false; ignore = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if(this.fail) throw Error('quota'); if(!this.ignore) this.values.set(key,value); }
  removeItem(key: string) { if(this.fail) throw Error('blocked'); if(!this.ignore) this.values.delete(key); }
}

describe('isolated tab recovery', () => {
  it.each(['forms','samples'] as const)('restores every %s field without marking work completed', workflow => {
    const memory = new Memory(); const storage = new SafeStorage(memory);
    const draft = workflow === 'forms'
      ? { ...emptyFormsEncounter(), patient: {name:'Synthetic, Recovery',dob:''}, notes:'Line one\nLine two', letterSubject:'Unapproved draft' }
      : { ...emptySamplesEncounter(), patient: {name:'Synthetic, Recovery',dob:''}, packages:[{id:'primary',medicationStrength:'Unknown',quantity:'',lot:'LOT',expiration:''}], plan:[{id:'p',strength:'Unknown',quantity:'',directions:'Reported instructions pending',days:''}] };
    const writer = new WorkflowRecovery(workflow,storage);
    expect(writer.initial).toBeNull(); expect(writer.save(draft).ok).toBe(true);
    const restored = new WorkflowRecovery(workflow,storage);
    expect(restored.initial).toEqual(draft); expect(restored.status).toBe('recovered');
    expect([...memory.values.keys()]).toEqual([recoveryKey(workflow)]);
  });
  it.each(['{broken','null','{"version":2}','{"version":1,"workflow":"forms","encounter":{"patient":{"name":{},"dob":""}}}'])('leaves malformed or future recovery untouched: %s', bytes=>{
    const memory=new Memory();memory.values.set(recoveryKey('forms'),bytes);
    const recovery=new WorkflowRecovery('forms',new SafeStorage(memory));
    expect(recovery.initial).toBeNull();expect(recovery.status).toBe('error');
    expect(recovery.save(emptyFormsEncounter()).ok).toBe(false);expect(recovery.clear().ok).toBe(false);
    expect(memory.getItem(recoveryKey('forms'))).toBe(bytes);
  });
  it('rejects malformed sample rows and preserves the bytes',()=>{
    const memory=new Memory();const bytes=JSON.stringify({version:1,workflow:'samples',encounter:{...emptySamplesEncounter(),packages:[null]}});
    memory.values.set(recoveryKey('samples'),bytes);const recovery=new WorkflowRecovery('samples',new SafeStorage(memory));
    expect(recovery.status).toBe('error');expect(memory.getItem(recoveryKey('samples'))).toBe(bytes);
  });
  it('does not claim a save when writes fail or are silently ignored',()=>{
    for(const mode of ['fail','ignore'] as const){
      const memory=new Memory();memory[mode]=true;const recovery=new WorkflowRecovery('forms',new SafeStorage(memory));
      expect(recovery.save(emptyFormsEncounter()).ok).toBe(false);expect(recovery.status).toBe('error');expect(recovery.isCurrent(emptyFormsEncounter())).toBe(false);
    }
  });
  it('retains the last valid version on quota failure and permits retry',()=>{
    const memory=new Memory();const recovery=new WorkflowRecovery('forms',new SafeStorage(memory));const original=emptyFormsEncounter();
    expect(recovery.save(original).ok).toBe(true);memory.fail=true;
    const changed={...original,notes:'Changed text'};expect(recovery.save(changed).ok).toBe(false);
    expect(new WorkflowRecovery('forms',new SafeStorage(memory)).initial).toEqual(original);
    memory.fail=false;expect(recovery.save(changed).ok).toBe(true);expect(recovery.isCurrent(changed)).toBe(true);
  });
  it('does not overwrite unexpected recovery changes',()=>{
    const memory=new Memory();const recovery=new WorkflowRecovery('forms',new SafeStorage(memory));
    expect(recovery.save(emptyFormsEncounter()).ok).toBe(true);memory.values.set(recoveryKey('forms'),'unexpected');
    expect(recovery.isCurrent(emptyFormsEncounter())).toBe(false);expect(recovery.save(emptyFormsEncounter()).ok).toBe(false);
    expect(memory.getItem(recoveryKey('forms'))).toBe('unexpected');
  });
  it('clears only the requested workflow after confirmed replacement',()=>{
    const memory=new Memory();const storage=new SafeStorage(memory);const forms=new WorkflowRecovery('forms',storage);const samples=new WorkflowRecovery('samples',storage);
    forms.save(emptyFormsEncounter());samples.save(emptySamplesEncounter());expect(forms.clear().ok).toBe(true);
    expect(memory.getItem(recoveryKey('forms'))).toBeNull();expect(memory.getItem(recoveryKey('samples'))).not.toBeNull();
  });
  it('verifies deletion and keeps the last recovery if removal fails',()=>{
    const memory=new Memory();const recovery=new WorkflowRecovery('forms',new SafeStorage(memory));recovery.save(emptyFormsEncounter());memory.ignore=true;
    expect(recovery.clear().ok).toBe(false);expect(memory.getItem(recoveryKey('forms'))).not.toBeNull();
  });
  it('reports inaccessible storage without crashing',()=>{
    const recovery=new WorkflowRecovery('forms',new SafeStorage(null));expect(recovery.status).toBe('error');expect(recovery.save(emptyFormsEncounter()).ok).toBe(false);
  });
});
