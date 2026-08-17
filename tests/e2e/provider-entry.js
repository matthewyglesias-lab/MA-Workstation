const { expect } = require('@playwright/test');

/**
 * Shared helpers for the provider register fields.
 *
 * Ordering provider, prescriber, and assigned provider are no longer plain
 * text inputs. When the register holds entries they render a lookup with an
 * "Other…" escape, so a bare `fill()` on a text input no longer finds them.
 *
 * These helpers deliberately enter arbitrary names through "Other…" rather
 * than selecting a registered provider, which stores the typed string verbatim
 * exactly as the old free-text field did. Tests keep their existing provider
 * strings, so generated notes and print baselines are unchanged. Use
 * `selectRegisteredProvider` when a test specifically wants a roster entry.
 */

/** The provider control inside `scope`; each workflow panel has exactly one. */
function providerControl(scope) {
  return scope.locator('[data-provider-field]').first();
}

async function isRegisterMode(scope) {
  return (await providerControl(scope).getAttribute('data-provider-field')) === 'register';
}

/** Enters a free-text provider name, whichever mode the field is in. */
async function setProvider(scope, value) {
  const control = providerControl(scope);
  if (!(await isRegisterMode(scope))) {
    await control.fill(value);
    return;
  }
  await control.locator('select').selectOption('__other__');
  const other = control.locator('.wfp-provider-other');
  await other.waitFor({ state: 'visible' });
  await other.fill(value);
}

/** Picks a provider from the register by id (e.g. "syed-hozair"). */
async function selectRegisteredProvider(scope, id) {
  await providerControl(scope).locator('select').selectOption(id);
}

/** Asserts the entered provider name, whichever mode the field is in. */
async function expectProviderValue(scope, value) {
  const control = providerControl(scope);
  const target = (await isRegisterMode(scope))
    ? control.locator('.wfp-provider-other')
    : control;
  await expect(target).toHaveValue(value);
}

module.exports = {
  setProvider,
  selectRegisteredProvider,
  expectProviderValue,
  providerControl,
};
