const {test, expect} = require('@playwright/test');
const {clickWorkspace} = require('./workspace-navigation');

for (const width of [1440, 800]) {
  test(`navigation is announced quietly and nonclinical tools avoid an empty patient band at ${width}`, async ({page}, info) => {
    await page.setViewportSize({width, height: width === 800 ? 600 : 900});
    await page.goto('/');
    await clickWorkspace(page, '.cd2004-nav-item[title="Reference"]');
    await expect(page.locator('#lf-workstation')).toHaveAttribute('data-active-workflow', 'reference');
    await expect(page.locator('.lf-reference-panel')).toBeVisible();
    await expect(page.locator('.cd2004-patient-banner')).toHaveCount(0);
    const announcement = page.locator('[data-navigation-announcement]');
    await expect(announcement).toContainText('Reference opened.');
    // It remains in the existing polite status region; no new floating popup.
    await expect(announcement.locator('..')).toHaveAttribute('role', 'status');
    await expect(page.locator('[data-toast]')).toHaveCount(0);
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    await expect(page.locator('.cd2004-patient-banner')).toBeVisible();
    await expect(page.locator('[data-navigation-announcement]')).toContainText('Injection opened.');
    await expect(page.locator('[data-toast]')).toHaveCount(0);
    await page.screenshot({path: info.outputPath(`quiet-navigation-${width}.png`)});
  });
}
