import { describe, expect, it } from 'vitest';
import { emptyInjectionEncounter, InjectionEngine } from '../../src/domain/injection';
import { emptySamplesEncounter } from '../../src/domain/samples';
import { injectionEncounterToDocumentationInput } from '../../src/documentation/adapters/injection-from-encounter';
import { DocumentationEngine } from '../../src/documentation';

describe('new encounter documentation starts unconfirmed',()=>{
  it('does not invent allergies, verification, response, or administration',()=>{
    const encounter=emptyInjectionEncounter();
    expect(encounter.allergies).toBe('');expect(Object.values(encounter.attestations).some(Boolean)).toBe(false);
    expect(encounter.response.kind).toBe('');expect(encounter.disposition.kind).toBe('');
    expect(InjectionEngine.evaluate(encounter,{}).readiness).toBe('idle');
    encounter.patient={name:'Unconfirmed, Synthetic',dob:'01/02/1990'};encounter.medicationKey='maintena';encounter.dose='400 mg';
    const input=injectionEncounterToDocumentationInput(encounter,InjectionEngine.evaluate(encounter,{}));
    expect(input).not.toBeNull();const note=DocumentationEngine.format('injection',input!).text;
    expect(note).not.toMatch(/NKDA|tolerated well|consent.*obtained|identity verified/i);
  });
  it('does not let an administration disposition replace missing confirmations',()=>{
    const encounter={...emptyInjectionEncounter(),patient:{name:'Synthetic',dob:'01/02/1990'},medicationKey:'maintena' as const,dose:'400 mg',disposition:{kind:'administered' as const}};
    const evaluation=InjectionEngine.evaluate(encounter,{});
    expect(evaluation.output.administrationDocumented).toBe(false);
    expect(injectionEncounterToDocumentationInput(encounter,evaluation)).toBeNull();
  });
  it('sample reviews and education begin unconfirmed',()=>{
    const sample=emptySamplesEncounter();expect(sample.medicationReview).toBe('not documented');expect(sample.education).toBe('not documented');
    expect(sample.review.confirmedAt).toBe('');
  });
});
