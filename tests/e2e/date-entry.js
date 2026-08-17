/**
 * Shared helper for the workstation's typed date fields.
 *
 * Encounter dates are no longer `<input type="date">`. They are typed text
 * fields that commit on Enter or blur, the way a terminal field does, so a
 * bare `locator.fill(...)` sets the visible text without ever committing it -
 * Playwright's fill dispatches `input` but not `change`.
 *
 * Always enter dates through this helper. It accepts the same ISO strings the
 * records store, so call sites keep their existing values.
 */
async function fillDate(locator, value) {
  await locator.fill(value);
  await locator.blur();
}

module.exports = { fillDate };
