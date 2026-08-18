/**
 * Shared locators for the workstation's schedule register.
 *
 * The register replaced the old floating readout card and the tinted banner
 * beside it. Its facts are labeled rows rather than one prose sentence, so
 * assertions read a named row instead of matching substrings in a message.
 *
 * State appears in three places on purpose and every one of them is worth
 * asserting: the container class (the left spine), the verdict chip (the
 * word), and the band (the sentence). A test that only checks the class would
 * pass on a register that had gone silently colour-only, which is exactly the
 * failure mode the register was built to avoid.
 */

function scheduleRegister(scope, title) {
  const registers = scope.locator('.wfp-schedule-register');
  return title ? registers.filter({ hasText: title }) : registers;
}

function registerVerdict(register) {
  return register.locator('.wfp-schedule-verdict');
}

function registerMarker(register) {
  return register.locator('.wfp-schedule-mark');
}

/** The value cell of one labeled row, by its exact label. */
function registerRow(register, label) {
  return register.locator('.wfp-schedule-row').filter({
    has: register.page().locator('dt', { hasText: new RegExp(`^${label}$`) }),
  });
}

function registerValue(register, label) {
  return registerRow(register, label).locator('.wfp-schedule-value');
}

function registerNote(register, label) {
  return registerRow(register, label).locator('.wfp-schedule-note');
}

function registerFlag(register, label) {
  return registerRow(register, label).locator('.wfp-schedule-flag');
}

function registerBand(register) {
  return register.locator('.wfp-schedule-band');
}

module.exports = {
  scheduleRegister,
  registerVerdict,
  registerMarker,
  registerRow,
  registerValue,
  registerNote,
  registerFlag,
  registerBand,
};
