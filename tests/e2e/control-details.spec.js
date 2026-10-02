const { test, expect } = require('@playwright/test');

const contrast = (a, b) => {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
    .map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};

for (const service of ['administer', 'uds', 'samples', 'forms']) {
  test(`${service} fields remain legible, aligned and keyboard usable`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator(`.lf-service-shortcut.lf-service-${service}`).click();
    await page.evaluate(() => document.fonts.ready);
    const panel = page.locator('.wfp-panel');
    const name = panel.locator('input[placeholder="Last, First"]');
    await name.fill('Control review, Synthetic');
    const provider = panel.locator('select').first();
    const sizes = await Promise.all([name, provider].map(control => control.boundingBox()));
    expect(Math.abs(sizes[0].height - sizes[1].height)).toBeLessThanOrEqual(1);
    expect(sizes[0].height).toBeGreaterThanOrEqual(40);
    await provider.focus();
    const field = await name.evaluate(el => {
      const s = getComputedStyle(el);
      return { border: s.borderColor, background: s.backgroundColor, text: s.color, font: s.fontFamily };
    });
    expect(contrast(field.border, field.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(field.text, field.background)).toBeGreaterThanOrEqual(4.5);
    expect(field.font).toContain('Workstation Mulish');
    expect(await page.evaluate(() => document.fonts.check('14px "Workstation Mulish"'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('32px "Workstation Lora"'))).toBe(true);
    await expect(provider).toHaveCSS('outline-style', 'solid');
    await expect(provider).toHaveCSS('outline-width', '2px');

    const entry = provider.locator('xpath=ancestor::div[@class="wfp-field-entry"]');
    if (await entry.count()) {
      const lookup = entry.locator('.wfp-field-lookup-button');
      const [selectBox, lookupBox] = await Promise.all([provider.boundingBox(), lookup.boundingBox()]);
      expect(Math.abs(selectBox.y - lookupBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(selectBox.height - lookupBox.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(selectBox.x + selectBox.width - lookupBox.x)).toBeLessThanOrEqual(1);
      await provider.press('F9');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(provider).toBeFocused();
    }

    if (service === 'uds') {
      await panel.getByRole('tab', { name: /^Review/ }).click();
      const heading = await panel.locator('.wfp-schedule-head > strong').evaluate(el => ({
        text: getComputedStyle(el).color,
        background: getComputedStyle(el.parentElement).backgroundColor,
      }));
      expect(contrast(heading.text, heading.background)).toBeGreaterThanOrEqual(4.5);
      await panel.getByRole('tab').first().click();
    }
    await page.setViewportSize({ width: 800, height: 600 });
    await name.focus();
    await expect(name).toBeInViewport();
    await expect(name).toHaveValue('Control review, Synthetic');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(provider).toHaveCSS('appearance', 'auto');
    await expect(name).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: info.outputPath(`${service}-forced-colors.png`) });
  });
}
