const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
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
      await page.clock.runFor(4500); // settle the existing debounced legacy boundary
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
    await expect(panel.getByRole('radio', { name: 'Review complete — document administration', exact: true })).toBeEnabled();
  });
}

for (const width of [1440, 800]) {
  test(`provider lookup stays scoped and cancellation preserves the field at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.goto('/');
    await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
    const provider = page.locator('[data-field-path="orderingProvider"] select');
    await provider.focus();
    const before = await provider.inputValue();
    await provider.press('F9');
    const dialog = page.locator('[data-field-lookup-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Choose the provider for this field.');
    await expect(dialog.locator('.cd2004-lookup-row small')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`provider-lookup-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(provider).toBeFocused();
    await expect(provider).toHaveValue(before);
    await provider.press('F9');
    const search = dialog.getByRole('searchbox');
    await search.press('ArrowDown');
    const option = dialog.locator('[role="option"]:focus');
    await expect(option).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    expect(await provider.inputValue()).not.toBe('');
  });
  test(`reference browsing is a reading surface without creating clinical records at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.goto('/');
    const before = await page.evaluate(key => localStorage.getItem(key), RECORDS);
    await clickWorkspace(page, '.cd2004-nav-item[title="Reference"]');
    const panel = page.locator('.lf-reference-panel');
    await panel.getByRole('searchbox').fill('Invega');
    const choices = panel.getByRole('radio');
    expect(await choices.count()).toBeGreaterThan(0);
    await choices.first().check();
    const article = panel.locator('.lf-reference-article');
    await expect(article).toBeVisible();
    await expect(article.locator('label,input,select,textarea')).toHaveCount(0);
    expect(await article.locator('.lf-reference-fact').count()).toBeGreaterThan(0);
    expect(await page.evaluate(key => localStorage.getItem(key), RECORDS)).toBe(before);
    await page.screenshot({ path: info.outputPath(`reference-reading-${width}.png`) });
  });
  test(`closeout separates output from deliberate data management at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 800 ? 600 : 900 });
    await page.goto('/');
    await clickWorkspace(page, '.cd2004-nav-item[title="Daily Closeout"]');
    const panel = page.locator('.lf-closeout-panel');
    await expect(panel.getByRole('button', { name: 'Print daily log', exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Clear log', exact: true })).toBeHidden();
    const output = panel.locator('.lf-closeout-outputs');
    await output.locator('summary').click();
    await expect(output.getByRole('button', { name: 'Export CSV', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    const before = await page.evaluate(key => localStorage.getItem(key), RECORDS);
    const management = panel.locator('.lf-closeout-management');
    await management.locator('summary').click();
    await expect(management.getByRole('button', { name: 'Clear log', exact: true })).toBeVisible();
    await expect(management).toContainText('not the clinical chart');
    await page.screenshot({ path: info.outputPath(`closeout-actions-${width}.png`) });
    await page.keyboard.press('Escape');
    expect(await page.evaluate(key => localStorage.getItem(key), RECORDS)).toBe(before);
  });
}
