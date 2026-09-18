const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const file = path.resolve('standalone/IPMG-MA-Workstation-Lightfully.html');

// Package-specific tests are opt-in so the normal hosted-artifact pipeline
// remains unchanged. The standalone review workflow always sets this flag.
test.describe('Self-contained file artifact', () => {
  test.skip(!process.env.TEST_STANDALONE_FILE, 'Run the standalone package workflow.');
  test('boots with native storage and no remote asset requests, then retains a saved draft', async ({ page }) => {
    expect(fs.existsSync(file)).toBe(true);
    const remoteAssets = [];
    page.on('request', req => { if (/^https?:/.test(req.url())) remoteAssets.push(req.url()); });
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('.lf-workstation')).toBeVisible();
    await expect(page.locator('[data-workspace-badge="local"]')).toBeVisible();
    expect(await page.evaluate(() => typeof navigator.locks?.request)).toBe('function');
    await page.locator('.lf-quick-tool.is-administer').click();
    const patient = page.locator('.wfp-panel input[placeholder="Last, First"]');
    await patient.fill('Standalone QA, Synthetic');
    await page.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0].patient.name).toBe('Standalone QA, Synthetic');
    await page.reload();
    await expect(page.locator('.lf-workstation')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]').length)).toBe(1);
    await page.keyboard.press('F11');
    await page.locator('#recordsDrawerSearch').fill('Standalone QA');
    await page.locator('[data-records-open]').click();
    await expect(patient).toHaveValue('Standalone QA, Synthetic');
    expect(remoteAssets).toEqual([]);
  });
});
