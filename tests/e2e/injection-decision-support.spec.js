const { test, expect } = require('@playwright/test');

async function openInjection(page) {
  await page.goto('/');
  await page.locator('.cd2004-nav-item[title="Injection"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
  return page.locator('.wfp-panel');
}

async function openTab(panel, name) {
  await panel.getByRole('tab', { name, exact: true }).click();
}

async function enterRoutineOrder(panel, patient) {
  await openTab(panel, 'Order');
  await panel.locator('input[placeholder="Last, First"]').fill(patient);
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
  await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
  await panel.locator('select[name="inj-dose"]').selectOption('156 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
}

test.describe('Injection decision support', () => {
  test('shows contextual guidance, requires an explicit site choice, and preserves custom NDC input', async ({ page }) => {
    const panel = await openInjection(page);
    await enterRoutineOrder(panel, 'QA, Decision Support');

    const guidance = panel.locator('[data-operator-guidance]');
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText('Operator guidance');
    await expect(guidance).toContainText('Active order');
    await expect(guidance.locator('summary')).toHaveText(/Reference/);

    await openTab(panel, 'Schedule');
    await panel.locator('.wfp-field', { hasText: 'Prior site' }).locator('select').selectOption('R deltoid');
    await openTab(panel, 'Administration');

    // A rotation recommendation is a one-click staff decision, never an
    // automatic documentation change.
    const siteSuggestion = panel.locator('.wfp-site-suggestion');
    await expect(siteSuggestion).toContainText('Suggested rotation site: L deltoid');
    const selectedBefore = panel.locator('input[name="inj-site"]:checked');
    await expect(selectedBefore).toHaveCount(0);
    await siteSuggestion.getByRole('button', { name: 'Use suggested site' }).click();
    await expect(panel.locator('input[name="inj-site"]:checked')).toHaveCount(1);
    await expect(panel.locator('input[name="inj-site"]:checked').locator('xpath=..')).toContainText('L deltoid');

    await openTab(panel, 'Product');
    const ndcPicker = panel.locator('[data-ndc-picker]').first();
    const packagePicker = ndcPicker.getByRole('combobox', { name: 'Known NDC package' });
    await expect(packagePicker).toContainText('50458-563-01');
    const knownPackage = packagePicker.locator('option', { hasText: '50458-563-01' }).first();
    await packagePicker.selectOption(await knownPackage.getAttribute('value'));
    const ndcInput = ndcPicker.getByRole('textbox', { name: 'Scan or enter a different package NDC' });
    await expect(ndcInput).toHaveValue('50458-563-01');
    await expect(ndcPicker).toContainText('Known local package');

    // Do not infer an NDC segment layout from non-catalogued scanner input.
    await ndcInput.fill('00612345678');
    await expect(ndcInput).toHaveValue('00612345678');
    await expect(ndcPicker).toContainText('Custom NDC — verify package');

    await openTab(panel, 'Outcome');
    await panel.getByRole('radio', { name: 'Held', exact: true }).check();
    await expect(panel.getByRole('tab', { name: 'Administration', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('tab', { name: 'Product', exact: true })).toHaveCount(0);
    await openTab(panel, 'Schedule');
    await expect(panel.locator('.wfp-field', { hasText: 'Expected next due' })).toHaveCount(0);
  });

  test('keeps an explicit expected-next-due override after save and resume', async ({ page }) => {
    const panel = await openInjection(page);
    await enterRoutineOrder(panel, 'QA, Next Due');
    await openTab(panel, 'Schedule');

    const administrationDate = panel
      .locator('.wfp-field', { hasText: 'Actual administration date' })
      .locator('input[type="date"]');
    await administrationDate.fill('2026-07-30');
    const dueDate = panel
      .locator('.wfp-field', { hasText: 'Expected next due' })
      .locator('input[type="date"]');
    await expect(dueDate).not.toHaveValue('');
    await expect(panel.locator('.wfp-field', { hasText: 'Expected next due' }).locator('.wfp-calculated-value')).toBeVisible();

    await dueDate.fill('2030-01-15');
    const dueField = panel.locator('.wfp-field', { hasText: 'Expected next due' });
    await expect(dueField.getByRole('button', { name: /Reset to calculated/ })).toBeVisible();

    const actions = page.locator('[data-injection-record-actions]');
    await expect(actions.locator('[data-injection-save]')).toBeEnabled();
    await actions.locator('[data-injection-save]').click();
    await expect(actions).toContainText('SAVED LOCAL DRAFT');

    // Move away from the active draft, then reload it through the only record
    // list. This exercises persisted next-dose provenance rather than merely
    // retaining component state in the same mounted panel.
    await actions.locator('[data-injection-new]').click();
    await page.getByRole('button', { name: /Open saved local records/ }).click();
    await page.getByRole('button', { name: /Resume draft for QA, Next Due/ }).click();

    const resumedPanel = page.locator('.wfp-panel');
    await openTab(resumedPanel, 'Schedule');
    const resumedDue = resumedPanel
      .locator('.wfp-field', { hasText: 'Expected next due' })
      .locator('input[type="date"]');
    await expect(resumedDue).toHaveValue('2030-01-15');
    await expect(
      resumedPanel
        .locator('.wfp-field', { hasText: 'Expected next due' })
        .getByRole('button', { name: /Reset to calculated/ }),
    ).toBeVisible();
  });
});
