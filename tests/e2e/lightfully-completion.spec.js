const { test, expect } = require('@playwright/test');
const { prepareRefinementInjection } = require('./refinement-fixture');
const RECORDS = 'ipmgMedAssistInjectionRecordsV1';

async function textContrast(locator) {
  return locator.evaluate(el => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
    const mix = (front, back) => {
      const a = front[3] === undefined ? 1 : front[3];
      return front.slice(0, 3).map((v, i) => v * a + back[i] * (1 - a));
    };
    const layers = [];
    for (let node = el; node; node = node.parentElement) layers.push(rgba(getComputedStyle(node).backgroundColor));
    let background = [255, 255, 255];
    for (const layer of layers.reverse()) background = mix(layer, background);
    const foreground = mix(rgba(getComputedStyle(el).color), background);
    const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
}

for (const width of [1440, 800]) {
  for (const [kind, allergy] of [
    ['unknown', ''],
    ['negative-record', 'No known drug allergies documented in the active record'],
    ['positive-record', 'Latex — hives; see active chart for the complete allergy record'],
    ['long-record', 'Reported medication sensitivity; reaction and verification remain pending. Do not assume a negative allergy finding.'],
  ]) {
    test(`browsed patient context remains readable and read-only: ${kind} at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
      await page.clock.install({ time: new Date('2026-10-02T10:30:00-07:00') });
      await page.goto('/');
      const panel = await prepareRefinementInjection(page);
      await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
      const name = 'PatientCtx, Alexandria-Synthetic Longname';
      await panel.locator('[data-field-path="patient.name"] input').fill(name);
      await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
      await panel.locator('[data-field-path="allergies"] input').fill(allergy);
      await page.locator('[data-injection-save]').click();
      await page.clock.runFor(4500);
      const before = await page.evaluate(key => localStorage.getItem(key), RECORDS);
      expect(before).toBeTruthy();
      await page.locator('[data-patient-search] input').fill('PatientCtx');
      const option = page.locator('[data-patient-result]').filter({ hasText: name });
      await expect(option).toHaveCount(1);
      await option.click();
      const banner = page.locator('.tebra-facesheet-banner');
      await expect(banner).toBeVisible();
      await expect(banner.locator('.tebra-patient-card-trigger')).toHaveText(name);
      await expect(banner.locator('.tebra-facesheet-meta')).toContainText('01/02/1990');
      await expect(banner.locator('.tebra-facesheet-allergies b')).toContainText(allergy || 'Not recorded');
      for (const selector of ['.tebra-patient-card-trigger', '.tebra-facesheet-meta', '.tebra-facesheet-allergies strong', '.tebra-facesheet-allergies b', '.tebra-facesheet-scope']) {
        const text = banner.locator(selector);
        await expect(text).toBeVisible();
        expect(await textContrast(text), selector).toBeGreaterThanOrEqual(4.5);
      }
      const action = banner.locator('[data-action-new-note]');
      await action.focus(); await expect(action).toBeFocused();
      expect(await action.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`patient-context-${kind}-${width}.png`) });
      await page.getByRole('button', { name: 'Return to active service', exact: true }).click();
      await expect(panel).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), RECORDS)).toBe(before);
    });
  }
}

for (const width of [1440, 800]) {
  test(`routine missing response is a quiet correction, not clinical clearance at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.clock.install({ time: new Date('2026-10-02T10:30:00-07:00') });
    await page.goto('/');
    const panel = await prepareRefinementInjection(page, { response: false, review: false });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.locator('.cd2004-document-split');
    const correction = preview.locator('.lf-progress-requirement').filter({ hasText: 'observed post-injection response' });
    await expect(correction).toBeVisible();
    await expect(preview.locator('.lf-progress-issue').filter({ hasText: 'observed post-injection response' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`documentation-attention-${width}.png`) });
    await correction.click();
    await expect(panel.locator('select[name="inj-response"]')).toBeFocused();
    await panel.locator('select[name="inj-response"]').selectOption('well');
    await expect(panel.getByText('Review complete — document administration', { exact: true })).toBeEnabled();
  });
}
