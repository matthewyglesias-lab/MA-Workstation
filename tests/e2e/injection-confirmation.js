/** Complete a synthetic fixture through the same individual checks staff use. */
async function confirmInjectionChecks(panel) {
  for (const name of ['Two-identifier ID','Medication ‘rights’','Allergies reviewed','Consent reaffirmed','No contraindications','Aseptic technique']) {
    await panel.getByRole('checkbox', { name: new RegExp(name) }).check();
  }
}
module.exports = { confirmInjectionChecks };
