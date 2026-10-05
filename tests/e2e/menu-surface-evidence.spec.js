const { test, expect } = require('@playwright/test');
const { openWorkspaceOptions } = require('./workspace-navigation');
for (const width of [1440, 800]) {
  test(`navigation menus keep their task and focus at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.goto('/');
    const chooserTrigger = page.locator('.lf-document-action');
    await chooserTrigger.click();
    const chooser = page.locator('.lf-service-dialog');
    await expect(chooser.getByRole('button').filter({ has: page.locator('.lf-service-icon') })).toHaveCount(4);
    for (const button of await chooser.locator('.lf-service-option').all()) {
      await expect(button).toBeInViewport();
      expect(await button.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath(`service-chooser-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(chooserTrigger).toBeFocused();
    await openWorkspaceOptions(page);
    await page.screenshot({ path: info.outputPath(`workspace-menu-${width}.png`) });
    await page.keyboard.press('Escape');
    const account = page.locator('button.tebra-account-trigger');
    await account.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Documenting staff');
    await page.screenshot({ path: info.outputPath(`account-menu-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
