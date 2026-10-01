const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');

async function boot(page, size) {
  await page.setViewportSize(size);
  await page.clock.install({ time: new Date('2026-10-01T10:00:00-07:00') });
  await page.goto('/');
  await expect(page.locator('#lf-workstation')).toBeVisible();
  const logo = page.getByRole('img', { name: 'Inland Psychiatric Medical Group' });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await logo.evaluate(img => img.complete && img.naturalWidth === 147)).toBe(true);
  await expect(page.locator('[data-workspace-badge="local"]')).toBeVisible();
}

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
  test(`IPMG shell and review cues remain usable at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, size);
    await page.screenshot({ path: testInfo.outputPath('worklist.png') });
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    const panel = page.locator('.wfp-panel');
    const name = panel.locator('[data-field-path="patient.name"] input');
    await name.fill('Review QA, Synthetic');
    await panel.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
    await panel.locator('[name="inj-medication"]').selectOption('maintena');
    await expect(page.locator('.lf-service-heading h1')).toHaveCSS('font-family', /Plus Jakarta Sans/);
    await expect(page.locator('[data-review-cue="administer"]')).toContainText('Recheck any value you change');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const cue = await page.locator('[data-review-cue]').boundingBox();
    expect(cue.x).toBeGreaterThanOrEqual(0);
    expect(cue.x + cue.width).toBeLessThanOrEqual(size.width + 1);
    const form = await panel.boundingBox();
    expect(form.height).toBeGreaterThan(80);
    await page.clock.runFor(4500);
    await page.screenshot({ path: testInfo.outputPath('injection.png') });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-review-cue="preview"]')).toContainText('File and verify separately in Tebra');
    await expect(page.locator('.cd2004-note-sections')).not.toContainText('Before you finish');
    await page.screenshot({ path: testInfo.outputPath('preview.png') });
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(name).toHaveValue('Review QA, Synthetic');
    await expect(panel.locator('[name="inj-medication"]')).toHaveValue('maintena');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

for (const [title, workflow, detail] of [
  ['UDS', 'uds', 'unknown findings unconfirmed'],
  ['Samples', 'samples', 'quantity and lot'],
  ['Forms', 'forms', 'recipient and dates'],
]) {
  test(`${title} keeps its original workflow with a contextual review reminder`, async ({ page }, testInfo) => {
    await boot(page, { width: 1440, height: 900 });
    await clickWorkspace(page, `.cd2004-nav-item[title="${title}"]`);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', workflow);
    await expect(page.locator(`[data-review-cue="${workflow}"]`)).toContainText(detail);
    await expect(page.locator('.wfp-panel')).toBeVisible();
    await page.clock.runFor(4500);
    await page.screenshot({ path: testInfo.outputPath(`${workflow}.png`) });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-review-cue]')).not.toBeVisible();
  });
}

test('review presentation does not alter a saved draft or silently complete checks', async ({ page }) => {
  await boot(page, { width: 1440, height: 900 });
  await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  await page.locator('[data-field-path="patient.name"] input').fill('Preservation QA, Synthetic');
  await page.locator('[data-injection-save]').click();
  await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
  const records = () => page.evaluate(() => JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]').map(({ updatedAt, ...record }) => record));
  const before = await records();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  expect(await records()).toEqual(before);
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
});
