const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');

async function boot(page, width) {
  await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.__disclosureCopiedText = text; }
    } });
  });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}
const open = (page, name) => clickWorkspace(page, `.cd2004-nav-item[title="${name}"]`);
const recovery = (page, workflow) => page.evaluate(w => sessionStorage.getItem(`ipmg.tab-recovery.${w}.v1`), workflow);
async function copyNote(page) {
  await page.locator('.wfp-panel').getByRole('button', { name: /^(Copy note|Copied)$/ }).click();
  return page.evaluate(() => window.__disclosureCopiedText);
}

for (const width of [1440, 800]) {
  test(`Samples optional intent preserves exact recovery and copied output at ${width}`, async ({ page }, info) => {
    await boot(page, width);
    await open(page, 'Samples');
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('textbox', { name: 'Patient name', exact: true }).fill('Disclosure, Synthetic');
    await panel.getByRole('textbox', { name: 'DOB', exact: true }).fill('01/02/1990');
    await panel.getByRole('tab', { name: /^Medication/ }).click();
    const instructions = panel.getByRole('textbox', { name: 'Patient instructions', exact: true });
    const intent = panel.getByRole('textbox', { name: 'Titration / prescriber intent', exact: true });
    const disclosure = panel.getByRole('button', { name: /^Titration \/ prescriber intent/ });
    await expect(instructions).toBeVisible();
    await instructions.fill('Follow the synthetic prescriber instruction.');
    await expect(disclosure).toContainText('Optional');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(intent).toHaveCount(0);
    const blankBytes = await recovery(page, 'samples');
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(intent).toBeVisible();
    await expect(intent).toHaveValue('');
    await disclosure.press('Space');
    await expect(intent).toHaveCount(0);
    expect(await recovery(page, 'samples')).toBe(blankBytes);
    await disclosure.click();
    await disclosure.press('Tab');
    await expect(intent).toBeFocused();
    await intent.fill('Synthetic plan: keep the current dose until provider review.');
    await disclosure.click();
    await expect(disclosure).toContainText('Instructions entered');
    await expect(disclosure).not.toContainText('Review needed');
    const bytes = await recovery(page, 'samples');
    const encounter = JSON.parse(bytes).encounter;
    expect(encounter.titration).toBe('Synthetic plan: keep the current dose until provider review.');
    await panel.getByRole('tab', { name: /^Safety & review/ }).click();
    const beforeNote = await copyNote(page);
    expect(beforeNote).toContain(encounter.titration);
    await panel.getByRole('tab', { name: /^Medication/ }).click();
    for (let i = 0; i < 10; i++) {
      await disclosure.click();
      await expect(intent).toHaveValue(encounter.titration);
      await disclosure.click();
    }
    expect(await recovery(page, 'samples')).toBe(bytes);
    await page.screenshot({ path: info.outputPath(`samples-optional-${width}.png`) });
    await open(page, 'Dashboard');
    await page.locator('[data-worklist-open="session:samples"]').click();
    await panel.getByRole('tab', { name: /^Medication/ }).click();
    await expect(disclosure).toContainText('Instructions entered');
    await expect(intent).toHaveCount(0);
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
    await open(page, 'Samples');
    await panel.getByRole('tab', { name: /^Medication/ }).click();
    await expect(instructions).toHaveValue(encounter.directions);
    await disclosure.click();
    await expect(intent).toHaveValue(encounter.titration);
    expect(await recovery(page, 'samples')).toBe(bytes);
    await panel.getByRole('tab', { name: /^Safety & review/ }).click();
    expect(await copyNote(page)).toBe(beforeNote);
  });

  test(`Forms availability keeps request tracking and exact copied output at ${width}`, async ({ page }, info) => {
    await boot(page, width);
    await open(page, 'Forms');
    const panel = page.locator('.wfp-panel');
    await expect(panel.getByRole('tab', { name: /Letter builder/ })).toHaveCount(0);
    await panel.getByRole('textbox', { name: 'Patient name', exact: true }).fill('Availability, Synthetic');
    await panel.getByRole('textbox', { name: /^Follow-up \/ next owner/ }).fill('Synthetic owner: provider review tomorrow.');
    const disclosure = panel.getByRole('button', { name: /^Letter drafting availability/ });
    await expect(disclosure).toContainText('Unavailable');
    const bytes = await recovery(page, 'forms');
    const beforeNote = await copyNote(page);
    await disclosure.focus();
    await disclosure.press('Enter');
    const explanation = panel.getByText('Continue to prepare approved letters', { exact: false });
    await expect(explanation).toBeVisible();
    await expect(panel.getByRole('combobox', { name: 'Requested document', exact: true })).toBeVisible();
    await explanation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`forms-availability-${width}.png`) });
    await disclosure.focus();
    await disclosure.press('Space');
    for (let i = 0; i < 10; i++) { await disclosure.click(); await disclosure.click(); }
    expect(await recovery(page, 'forms')).toBe(bytes);
    expect(await copyNote(page)).toBe(beforeNote);
    await expect(panel.getByRole('button', { name: /Copy letter|Print letter/ })).toHaveCount(0);
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
    await open(page, 'Forms');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(panel.getByRole('textbox', { name: /^Follow-up \/ next owner/ })).toHaveValue('Synthetic owner: provider review tomorrow.');
    expect(await recovery(page, 'forms')).toBe(bytes);
    expect(await copyNote(page)).toBe(beforeNote);
  });
}
