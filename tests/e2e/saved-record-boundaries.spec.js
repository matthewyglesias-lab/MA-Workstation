const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const { seedRefinementWorklist } = require('./refinement-worklist-fixture');

for (const width of [1440, 800]) {
  test(`saved record windows name the task and browser scope at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.addInitScript(seedRefinementWorklist);
    await page.goto('/');
    await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
    const stored = () => page.evaluate(() => [
      localStorage.getItem('ipmgMedAssistInjectionRecordsV1'),
      localStorage.getItem('ipmgMedAssistUdsRecordsV1')
    ]);
    const before = await stored();
    const injectionTrigger = page.getByRole('button', { name: 'Open saved notes (F11)' });
    await injectionTrigger.click();
    const injection = page.getByRole('dialog', { name: 'Saved injection records', exact: true });
    await expect(injection).toBeVisible();
    await expect(injection.getByText('Records saved in this browser on this workstation', { exact: true })).toBeVisible();
    await expect(injection.locator('#recordsDrawerSearch')).toBeFocused();
    await expect(injection.locator('tbody [data-records-open]')).toHaveCount(6);
    await page.screenshot({ path: info.outputPath(`saved-injection-records-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(injectionTrigger).toBeFocused();
    await clickWorkspace(page, '.cd2004-nav-item[title="UDS"]');
    const udsTrigger = page.getByRole('button', { name: 'Open UDS notes…', exact: true });
    await udsTrigger.click();
    const uds = page.getByRole('dialog', { name: 'Saved UDS records', exact: true });
    await expect(uds).toBeVisible();
    await expect(uds.getByText('Records saved in this browser on this workstation', { exact: true })).toBeVisible();
    await expect(uds.locator('#udsRecordsDrawerSearch')).toBeFocused();
    await page.screenshot({ path: info.outputPath(`saved-uds-records-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(udsTrigger).toBeFocused();
    expect(await stored()).toEqual(before);
  });
}
