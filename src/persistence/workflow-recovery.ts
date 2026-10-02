import { emptyFormsEncounter, type FormsEncounter } from '../domain/forms';
import { emptySamplesEncounter, type SamplesEncounter } from '../domain/samples';
import { SafeStorage, failure, isPlainObject, success, type PersistenceResult } from './storage';

export type RecoverableWorkflow = 'forms' | 'samples';
type Encounters = { forms: FormsEncounter; samples: SamplesEncounter };
export type RecoveryStatus = 'empty' | 'recovered' | 'saved' | 'error';
export const recoveryKey = (workflow: RecoverableWorkflow) => `ipmg.tab-recovery.${workflow}.v1`;

/** Shape validation only: incomplete clinical values are retained verbatim. */
function matchesShape(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) return Array.isArray(value);
  if (isPlainObject(template)) {
    return isPlainObject(value) && Object.entries(template).every(([key, expected]) =>
      // Optional fields may be absent in an encounter created by an older panel.
      value[key] === undefined || matchesShape(value[key], expected));
  }
  return typeof value === typeof template;
}
export function isRecoverableEncounter<K extends RecoverableWorkflow>(workflow: K, value: unknown): value is Encounters[K] {
  if (!isPlainObject(value) || !isPlainObject(value.patient) ||
      typeof value.patient.name !== 'string' || typeof value.patient.dob !== 'string') return false;
  const template = workflow === 'forms' ? emptyFormsEncounter() : emptySamplesEncounter();
  if (!matchesShape(value, template)) return false;
  const required = workflow === 'forms'
    ? ['requestType', 'status', 'letterType', 'requestDate', 'targetDate', 'provider', 'staff', 'feeStatus', 'deliveryMethod', 'notificationStatus']
    : ['prescriber', 'staff', 'dispenseDate', 'startDate', 'medicationKey', 'medicationLabel', 'quantity', 'directions', 'purpose', 'medicationReview', 'education'];
  if (!required.every(key => typeof value[key] === 'string')) return false;
  if (workflow === 'forms') {
    return ['work','disability','fmla','records','med','other'].includes(String(value.requestType)) &&
      ['received','provider_review','fee_pending','in_progress','ready','notified','completed'].includes(String(value.status)) &&
      ['dx','offwork','return','restrictions','custom'].includes(String(value.letterType));
  }
  const strings = (row: unknown, keys: string[]) => isPlainObject(row) && keys.every(key => typeof row[key] === 'string');
  return Array.isArray(value.packages) && value.packages.every(row => strings(row, ['id','medicationStrength','quantity','lot','expiration']) &&
      isPlainObject(row) && (row.label === undefined || typeof row.label === 'string')) &&
    Array.isArray(value.plan) && value.plan.every(row => strings(row, ['id','strength','quantity','directions']) &&
      isPlainObject(row) && (row.days === undefined || typeof row.days === 'string')) &&
    strings(value.review, ['confirmedAt','fingerprint']);
}

/**
 * Reload recovery for the current tab, intentionally separate from the signed
 * record repositories. sessionStorage isolates tabs and survives reloads, but
 * is not a durable record or a backup. Corrupt/newer recovery is never replaced.
 */
export class WorkflowRecovery<K extends RecoverableWorkflow> {
  private expected: string | null = null;
  private blocked = false;
  private currentEncounter = '';
  status: RecoveryStatus = 'empty';
  readonly initial: Encounters[K] | null;

  constructor(readonly workflow: K, private readonly storage: SafeStorage) {
    const read = storage.read(recoveryKey(workflow));
    this.initial = null;
    if (!read.ok) { this.blocked = true; this.status = 'error'; return; }
    this.expected = read.value;
    if (read.value === null) return;
    try {
      const data: unknown = JSON.parse(read.value);
      if (!isPlainObject(data) || data.version !== 1 || data.workflow !== workflow ||
          !isRecoverableEncounter(workflow, data.encounter)) throw new Error('Invalid recovery');
      this.initial = data.encounter;
      this.currentEncounter = JSON.stringify(data.encounter);
      this.status = 'recovered';
    } catch { this.blocked = true; this.status = 'error'; }
  }

  isCurrent(encounter: Encounters[K]): boolean {
    return !this.blocked && this.status !== 'error' && this.unchanged() && this.currentEncounter === JSON.stringify(encounter);
  }

  private unchanged(): boolean {
    const read = this.storage.read(recoveryKey(this.workflow));
    return read.ok && read.value === this.expected;
  }

  save(encounter: Encounters[K]): PersistenceResult<void> {
    if (this.isCurrent(encounter)) return success(undefined);
    if (this.blocked || !this.unchanged() || !isRecoverableEncounter(this.workflow, encounter)) {
      this.blocked = true; this.status = 'error';
      return failure('invalid-data', 'Recovery data could not be verified. Existing data was left unchanged.');
    }
    const serialized = JSON.stringify(encounter);
    const bytes = JSON.stringify({ version: 1, workflow: this.workflow, encounter });
    const written = this.storage.write(recoveryKey(this.workflow), bytes);
    if (!written.ok) { this.status = 'error'; return written; }
    this.expected = bytes;
    this.currentEncounter = serialized;
    this.status = 'saved';
    return success(undefined);
  }

  clear(): PersistenceResult<void> {
    if (this.blocked || !this.unchanged()) {
      this.status = 'error';
      return failure('invalid-data', 'Recovery data changed. The current work stayed open.');
    }
    const removed = this.storage.remove(recoveryKey(this.workflow));
    if (!removed.ok) { this.status = 'error'; return removed; }
    this.expected = null; this.currentEncounter = ''; this.status = 'empty';
    return success(undefined);
  }
}

export const browserRecoveryStorage = (): SafeStorage => {
  try { return new SafeStorage(window.sessionStorage); }
  catch { return new SafeStorage(null); }
};
