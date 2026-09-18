const { clickWorkspace } = require('./workspace-navigation');
const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.clock.install({ time: new Date('2026-09-17T16:00:00-07:00') });
  await page.goto('/');
  await expect(page.locator('.lf-workstation')).toBeVisible();
  await expect(page.locator('[data-workspace-badge="local"]')).toBeVisible();
}

test.describe('Lightfully standalone shell', () => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 800, height: 600 }]) {
    test(`keeps the home and command tools usable at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await boot(page);
      await expect(page.getByRole('heading', { name: 'Worklist', exact: true })).toBeVisible();
      await expect(page.locator('.lf-quick-tool')).toHaveCount(0);
      await expect(page.locator('.lf-document-action')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      for (const selector of ['.lf-command-trigger', '.lf-density-toggle', '.tebra-account-trigger']) {
        const box = await page.locator(selector).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      await expect(page.locator('.cd2004-worklist-tabs')).toBeInViewport();
      const worklistVisibleHeight = await page.locator('.cd2004-worklist-sheet').evaluate(node => {
        const r = node.getBoundingClientRect();
        const host = node.closest('.lf-start-center').getBoundingClientRect();
        return Math.max(0, Math.min(r.bottom, host.bottom, innerHeight) - Math.max(r.top, host.top, 0));
      });
      expect(worklistVisibleHeight).toBeGreaterThanOrEqual(40);
      await expect(page).toHaveScreenshot(`lightfully-home-${size.width}x${size.height}.png`, { animations: 'disabled' });
      await page.keyboard.press('Control+k');
      const search = page.getByRole('combobox', { name: 'Search commands' });
      await expect(search).toBeFocused();
      await search.fill('urine');
      await expect(page.getByRole('option')).toHaveCount(1);
      await page.keyboard.press('Enter');
      await expect(page.locator('.lf-workstation')).toHaveAttribute('data-active-workflow', 'uds');
      await expect(page.locator('.lf-command-dialog')).toHaveCount(0);
      await expect(page.locator('.cd2004-patient-banner')).toBeVisible();
    });
  }
  test('keeps searches temporary and persists only the display-density choice', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Compact workspace', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-lf-density', 'compact');
    expect(await page.evaluate(() => localStorage.getItem('ipmg.lightfully.ui-density.v1'))).toBe('compact');
    await page.getByRole('button', { name: 'Search workspace commands' }).click();
    await page.getByRole('combobox', { name: 'Search commands' }).fill('QA temporary search');
    await expect(page.locator('.lf-command-empty')).toBeVisible();
    expect(await page.evaluate(() => Object.values(localStorage).some(v => v.includes('QA temporary search')))).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Search workspace commands' })).toBeFocused();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Compact workspace', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
  test('does not open command search over an identity dialog', async ({ page }) => {
    await boot(page);
    await page.locator('.tebra-account-trigger').click();
    await page.locator('[data-account-action="staff"]').click();
    const dialog = page.getByRole('dialog', { name: 'Staff Sign-In' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('.lf-command-dialog')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name or initials' })).toBeFocused();
  });
  test('retains a draft through command navigation and supports arrow-key work filters', async ({ page }) => {
    await boot(page);
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    const name = page.locator('input[name="inj-patient-name"]');
    // Use the panel label when the underlying field has no native name.
    const patient = await name.count() ? name : page.locator('.wfp-panel').getByRole('textbox', { name: /^Patient name/ });
    await patient.fill('Lightfully QA, Synthetic');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Search commands' }).fill('Dashboard');
    await page.keyboard.press('Enter');
    await expect(page.locator('.lf-workstation')).toHaveAttribute('data-active-workflow', 'home');
    const first = page.getByRole('tab', { name: /^All work/ });
    await first.focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /^Drafts/ })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    await expect(patient).toHaveValue('Lightfully QA, Synthetic');
  });
  test('enters the existing injection focus workflow, not a parallel form', async ({ page }) => {
    await boot(page);
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    await page.getByRole('button', { name: 'Open focused injection workspace', exact: true }).click();
    await expect(page.locator('.lf-workstation')).toHaveAttribute('data-kiosk-mode', 'true');
    await expect(page.locator('.kiosk-stepper [data-kiosk-step]')).toHaveCount(7);
    await expect(page.locator('.wfp-panel')).toHaveCount(1);
    await page.getByRole('button', { name: 'Exit injection focus', exact: true }).click();
    await expect(page.locator('.lf-workstation')).not.toHaveAttribute('data-kiosk-mode', 'true');
  });
  test('keeps command navigation inert below the supported workstation size', async ({ page }) => {
    await boot(page);
    await page.setViewportSize({ width: 799, height: 600 });
    await expect(page.locator('.meditech-workstation-gate')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('.lf-command-dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 800, height: 600 });
    await expect(page.locator('.lf-workstation')).toBeVisible();
  });
});
