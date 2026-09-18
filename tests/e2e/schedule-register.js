/** Stable, accessible locators for the original evaluator readouts. */
function scheduleRegister(scope, title) {
  const registers = scope.locator('.wfp-schedule-register');
  // Display headings are sentence-cased. Accessible titles retain the same
  // clinical identity; never change the asserted values or verdicts to match a theme.
  return title
    ? scope.locator(`.wfp-schedule-register[aria-label^=${JSON.stringify(title)}]`)
    : registers;
}
function registerVerdict(register) { return register.locator('.wfp-schedule-verdict'); }
function registerMarker(register) { return register.locator('.wfp-schedule-mark'); }
function registerRow(register, label) {
  return register.locator('.wfp-schedule-row').filter({
    has: register.page().locator('dt', { hasText: new RegExp(`^${label}$`) }),
  });
}
function registerValue(register, label) { return registerRow(register, label).locator('.wfp-schedule-value'); }
function registerNote(register, label) { return registerRow(register, label).locator('.wfp-schedule-note'); }
function registerFlag(register, label) { return registerRow(register, label).locator('.wfp-schedule-flag'); }
function registerBand(register) { return register.locator('.wfp-schedule-band'); }
module.exports = { scheduleRegister, registerVerdict, registerMarker, registerRow, registerValue, registerNote, registerFlag, registerBand };
