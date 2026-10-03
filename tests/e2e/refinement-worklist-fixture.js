// Only synthetic local records. Real application owns projection/open commands.
function seedRefinementWorklist() {
  const day = '2026-10-02';
  const records = Array.from({ length: 6 }, (_, i) => ({
    id: `refinement-draft-${i}`, type: 'injection', status: 'draft',
    completedAt: '', createdAt: `${day}T08:00:00-07:00`, updatedAt: `${day}T08:0${i}:00-07:00`,
    patient: { name: i === 5 ? 'Long-Surname-With-Many-Parts, Synthetic Example Patient' : `Draft, Synthetic ${i}`, dob: '01/02/1990' },
    summary: 'Haldol Dec. · 50 mg', addenda: [],
    snapshot: { version: 4, medKey: 'haldol', state: { dose: '50 mg' }, initiation: {}, smartVitals: {}, disposition: {},
      fields: { ptName: i === 5 ? 'Long-Surname-With-Many-Parts, Synthetic Example Patient' : `Draft, Synthetic ${i}`, ptDOB: '01/02/1990', adminDate: day }, safetyNone: false, note: { cc: '', as: '', pl: '' }, documentation: {} },
  }));
  localStorage.setItem('ipmgMedAssistInjectionRecordsV1', JSON.stringify(records));
  const activities = Array.from({ length: 8 }, (_, i) => ({
    type: ['injection', 'uds', 'sample', 'forms'][i % 4], status: i % 3 === 0 ? 'needs_review' : 'completed',
    pt: `Activity, Synthetic ${i}`, time: '9:41 AM', summary: ['Injection review', 'Drug screen collection', 'Medication handoff', 'Forms documentation'][i % 4],
  }));
  localStorage.setItem(`ipmgMedAssistActivityLog_${day}`, JSON.stringify(activities));
}
module.exports = { seedRefinementWorklist };
