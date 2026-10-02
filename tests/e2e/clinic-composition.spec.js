const { test, expect } = require('@playwright/test');

// Actual transitions, not CSS snapshots: a responsive rail cannot strand focus,
// discard entered patient data or disconnect the form from its documentation.
for (const service of ['administer', 'uds', 'samples', 'forms']) {
  test(`${service} section navigation survives resizing and document review`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator(`.lf-service-shortcut.lf-service-${service}`).click();
    const panel = page.locator('.wfp-panel');
    const tabs = panel.locator('[role="tablist"]');
    const first = tabs.getByRole('tab').first();
    const last = tabs.getByRole('tab').last();
    await expect(tabs).toHaveAttribute('aria-orientation', 'vertical');
    const name = panel.locator('input[placeholder="Last, First"]');
    await name.fill('Navigation, Synthetic');
    await first.focus();
    await page.keyboard.press('End');
    await expect(last).toBeFocused();
    await expect(last).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(name).toHaveValue('Navigation, Synthetic');

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(tabs).toHaveAttribute('aria-orientation', 'horizontal');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab').nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(name).toHaveValue('Navigation, Synthetic');

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Generated documentation' })).toContainText('Navigation, Synthetic');
    await expect(page.locator('.lf-document-checks')).toBeVisible();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(name).toHaveValue('Navigation, Synthetic');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(tabs).toHaveAttribute('aria-orientation', 'vertical');
    await page.screenshot({ path: info.outputPath(`${service}-section-rail.png`), animations: 'disabled' });
  });
}
