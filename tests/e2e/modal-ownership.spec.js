const { test, expect } = require('@playwright/test');

// Inspect settled surfaces, not a translucent frame midway through its reveal.
// This also exercises a non-modal -> native modal ownership handoff.
test('lookup has one opaque surface and exclusive keyboard ownership at both working widths', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-01T10:00:00-07:00') });
  for (const width of [1440, 800]) {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.goto('/');
    await page.locator('.lf-service-administer').click();
    const name = page.locator('.wfp-panel input[placeholder="Last, First"]');
    await name.fill('Modal review, Synthetic');
    const review = page.locator('.lf-review-disclosure');
    await review.locator(':scope > summary').click();
    await expect(review).toHaveAttribute('open', '');
    const lookup = page.getByRole('button', { name: 'Open Ordering provider field lookup (F9)', exact: true });
    const provider = page.locator('.wfp-field').filter({ has: lookup }).locator('select');
    const originalValue = await provider.inputValue();
    await provider.focus();
    await page.keyboard.press('F9');
    await expect(review).not.toHaveAttribute('open', '');
    const dialog = page.getByRole('dialog');
    const frame = page.locator('[data-field-lookup-dialog]');
    await expect(dialog).toHaveCount(1);
    await page.clock.runFor(250);
    await expect(frame).toHaveCSS('opacity', '1');
    await expect(frame).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const search = dialog.getByRole('searchbox');
    await expect(search).toBeFocused();
    await name.evaluate(node => node.focus());
    await expect(search).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(dialog).toHaveCount(1);
    await expect(page.locator('.lf-command-dialog')).toHaveCount(0);
    await expect(search).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`opaque-lookup-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(provider).toBeFocused();
    await expect(provider).toHaveValue(originalValue);
    await expect(name).toHaveValue('Modal review, Synthetic');
  }
});
