const { expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const { fillDate } = require('./date-entry');
const { setProvider } = require('./provider-entry');
const { confirmInjectionChecks } = require('./injection-confirmation');

async function prepareRefinementInjection(page, { response = true, review = true } = {}) {
  await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  const panel = page.locator('.wfp-panel');
  await panel.locator('input[placeholder="Last, First"]').fill('Refinement, Synthetic');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').press('Tab');
  await setProvider(panel, 'Synthetic Ordering Provider');
  await panel.locator('select[name="inj-reason"]').selectOption('scheduled');
  await panel.locator('select[name="inj-medication"]').selectOption('haldol');
  await panel.locator('select[name="inj-dose"]').selectOption('50 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
  await fillDate(panel.locator('[data-field-path="priorDoseDate"] input'), '2026-09-04');
  await fillDate(panel.locator('[data-field-path="administrationDate"] input'), '2026-10-02');
  await panel.getByRole('tab', { name: 'Product', exact: true }).click();
  await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
  await panel.locator('input[placeholder="LOT123"]').fill('SYNTHETIC-LOT-42');
  await panel.locator('input[type="month"]').first().fill('2027-12');
  await panel.locator('[data-field-path="details.productSource"] select').selectOption('Clinic sample');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.locator('input[placeholder="Actual site / location per active order"]').fill('R deltoid');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Synthetic Staff, MA');
  await panel.locator('input[type="time"]').first().fill('09:41');
  await panel.locator('[data-field-path="details.volume"] input').fill('1');
  await panel.locator('[data-field-path="details.volumeUnit"] select').selectOption('mL');
  const technique = panel.getByText('Ordered route / technique verified', { exact: true });
  if (await technique.isVisible()) await technique.click();
  await panel.locator('[data-field-path="allergies"] input').fill('NKDA verified in active record');
  await confirmInjectionChecks(panel);
  await panel.getByRole('checkbox', { name: /HALDOL DECANOATE solution inspection completed/ }).check();
  await panel.locator('label[for="inj-safety-none"]').click();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  if (response) await panel.locator('select[name="inj-response"]').selectOption('well');
  if (review) {
    await expect(panel.getByText('Review complete — document administration', { exact: true })).toBeEnabled();
    await panel.getByText('Review complete — document administration', { exact: true }).click();
  }
  return panel;
}
module.exports = { prepareRefinementInjection };
