/** Stable, accessible locators for the original evaluator readouts. */
function scheduleRegister(scope, title) {
  const registers = scope.locator('.wfp-schedule-register,.lf-timing-register');
  // Display headings are sentence-cased. Accessible titles retain the same
  // clinical identity; never change the asserted values or verdicts to match a theme.
  return title
    ? scope.locator(`:is(.wfp-schedule-register,.lf-timing-register)[aria-label^=${JSON.stringify(title)}]`)
    : registers;
}
function registerVerdict(register) { return register.locator('.wfp-schedule-verdict,.lf-timing-verdict'); }
function registerMarker(register) { return register.locator('.wfp-schedule-mark,.lf-timing-mark'); }
function registerRow(register, label) {
  return register.locator('.wfp-schedule-row,.lf-timing-row').filter({
    has: register.page().locator('dt', { hasText: new RegExp(`^${label}$`) }),
  });
}
function registerValue(register, label) { return registerRow(register, label).locator('.wfp-schedule-value,.lf-timing-value'); }
function registerNote(register, label) { return registerRow(register, label).locator('.wfp-schedule-note,.lf-timing-note'); }
function registerFlag(register, label) { return registerRow(register, label).locator('.wfp-schedule-flag,.lf-timing-flag'); }
function registerBand(register) { return register.locator('.wfp-schedule-band,.lf-timing-status'); }
module.exports = { scheduleRegister, registerVerdict, registerMarker, registerRow, registerValue, registerNote, registerFlag, registerBand };
