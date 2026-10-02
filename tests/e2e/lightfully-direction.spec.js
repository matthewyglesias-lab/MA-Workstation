const { openWorkspaceOptions } = require('./workspace-navigation');
const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');

async function boot(page, viewport) {
  await page.setViewportSize(viewport);
  await page.clock.install({ time: new Date('2026-10-01T10:00:00-07:00') });
  await page.goto('/');
  await expect(page.locator('#lf-workstation')).toBeVisible();
}
async function capture(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
}
async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
function contrast(a, b) {
  const lum = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
  test(`editorial masthead, service choices and original editor at ${viewport.width}`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page, viewport);
    const masthead = await page.locator('.tebra-context-rail').boundingBox();
    expect(masthead.width).toBeGreaterThanOrEqual(viewport.width - 2);
    await expect(page.locator('#currentWorklistTitle')).toHaveCSS('font-family', /Workstation Lora/);
    await expect(page.locator('.lf-service-shortcut')).toHaveCount(4);
    await expect(page.locator('[data-workspace-badge=local]')).toBeInViewport();
    const buttonStyle = await page.locator('.lf-document-action').evaluate(n => ({ fg: getComputedStyle(n).color, bg: getComputedStyle(n).backgroundColor }));
    expect(contrast(buttonStyle.fg, buttonStyle.bg)).toBeGreaterThanOrEqual(4.5);
    await noHorizontalOverflow(page);
    await capture(page, info, '01-worklist');
    await page.locator('.lf-document-action').click();
    await expect(page.getByRole('dialog', { name: 'Document a service' })).toBeVisible();
    await capture(page, info, '02-service-chooser');
    await page.keyboard.press('Escape');
    await expect(page.locator('.lf-document-action')).toBeFocused();
    await page.locator('.lf-service-shortcut.lf-service-administer').click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    const panel = page.locator('.wfp-panel');
    await expect(panel).toHaveCount(1);
    await panel.locator('[data-field-path="patient.name"] input').fill('Design review, Synthetic');
    await panel.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
    await panel.locator('[name="inj-medication"]').selectOption('maintena');
    await expect(page.locator('.cd2004-patient-banner')).toContainText('Design review, Synthetic');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    await page.clock.runFor(4500);
    await noHorizontalOverflow(page);
    const visibleEditor = await page.locator('.wfp-transaction-page').evaluate(el => {
      const r = el.getBoundingClientRect();
      const p = el.closest('.wfp-panel').getBoundingClientRect();
      return Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top);
    });
    expect(visibleEditor).toBeGreaterThanOrEqual(150);
    await capture(page, info, '03-injection');
    for (const [index, tab] of (await panel.getByRole('tab').all()).entries()) {
      await tab.click();
      await noHorizontalOverflow(page);
      await capture(page, info, `04-section-${index}`);
    }
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('[data-review-cue=preview]')).toContainText('Tebra');
    await capture(page, info, '05-preview');
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await panel.getByRole('tab').first().click();
    await expect(panel.locator('[data-field-path="patient.name"] input')).toHaveValue('Design review, Synthetic');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    await openWorkspaceOptions(page);
  await page.getByRole('button', { name: 'Open focused injection workspace', exact: true }).click();
    await expect(page.locator('.kiosk-stepper [data-kiosk-step]')).toHaveCount(7);
    await capture(page, info, '06-focus');
    // The guided view already has a dedicated, visible return control.
    // Do not reach back into the now-collapsed Workspace extras to exit it.
    await expect(page.locator('[data-kiosk-exit]')).toBeInViewport();
    await page.locator('[data-kiosk-exit]').click();
    await expect(page.locator('.kiosk-stepper')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const [title, id] of [['UDS', 'uds'], ['Samples', 'samples'], ['Forms', 'forms']]) {
  test(`${title} sections and previews keep the original form at desktop and minimum size`, async ({ page }, info) => {
    await boot(page, { width: 1440, height: 900 });
    await page.locator(`.lf-service-shortcut.lf-service-${id}`).click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', id);
    const panel = page.locator('.wfp-panel');
    await expect(panel).toHaveCount(1);
    for (const [index, tab] of (await panel.getByRole('tab').all()).entries()) {
      await tab.click();
      await capture(page, info, `${id}-section-${index}`);
    }
    await page.setViewportSize({ width: 800, height: 600 });
    await panel.getByRole('tab').first().click();
    await noHorizontalOverflow(page);
    await capture(page, info, `${id}-small`);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await capture(page, info, `${id}-preview`);
  });
}

test('tools close on Escape and genuine field lookup is not covered by open shortcuts', async ({ page }, info) => {
  await boot(page, { width: 1024, height: 768 });
  await page.locator('.lf-tools-navigation > summary').click();
  await expect(page.locator('.lf-tools-navigation')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.lf-tools-navigation')).not.toHaveAttribute('open', '');
  await expect(page.locator('.lf-tools-navigation > summary')).toBeFocused();
  await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  await page.locator('.tebra-power-commands > summary').click();
  const lookup = page.locator('.wfp-panel').getByRole('button', { name: 'Open Encounter type field lookup (F9)' });
  await lookup.click(); // Deliberately no force: an overlay must not intercept this.
  await expect(page.locator('.cd2004-lookup-dialog')).toBeVisible();
  await capture(page, info, 'field-lookup');
  await page.keyboard.press('Escape');
  await capture(page, info, 'shortcuts-in-flow');
});
