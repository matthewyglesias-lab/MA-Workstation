const { test, expect } = require('@playwright/test');
const { prepareRefinementInjection } = require('./refinement-fixture');

const sizes = [{ width: 1440, height: 900 }, { width: 1366, height: 768 },
  { width: 1024, height: 768 }, { width: 800, height: 600 }];
for (const size of sizes) for (const density of ['compact', 'comfortable']) {
  test(`expanded concerns and long signed preview at ${size.width} ${density}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.addInitScript(density => localStorage.setItem('ipmg.lightfully.ui-density.v1', density), density);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-lf-density', density);
    const panel = await prepareRefinementInjection(page);
    for (const name of [/Vitals \(optional\)/, /Additional note items/, /Administration exception/]) {
      // The fixture completed all legitimate required work without opening optional groups.
      const trigger = panel.getByRole('button', { name });
      if (await trigger.count()) await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
    const response = panel.locator('select[name="inj-response"]');
    const lookup = response.locator('xpath=ancestor::div[@class="wfp-field-entry"]').locator('.wfp-field-lookup-button');
    const [control, command] = await Promise.all([response.boundingBox(), lookup.boundingBox()]);
    expect(control.height).toBe(density === 'compact' ? 34 : 42);
    expect(Math.abs(control.height - command.height)).toBeLessThanOrEqual(1);

    await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
    const exception = panel.getByRole('button', { name: /Administration exception/ });
    await exception.click();
    await panel.getByRole('checkbox', { name: 'Record an administration exception', exact: true }).check();
    const summary = panel.locator('[data-field-path="details.exceptionSummary"] textarea');
    await summary.fill('Synthetic observation for layout review. '.repeat(12));
    await expect(exception).toContainText('Needs details');
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`exception-expanded-${size.width}-${density}.png`), style: '.tebra-toast-region,#toast {visibility:hidden}' });
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('#lf-document-preview .lf-progress-concerns')).toContainText('Document who was notified');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`preview-blocked-${size.width}-${density}.png`), style: '.tebra-toast-region,#toast {visibility:hidden}' });
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await panel.getByRole('button', { name: 'Remove exception', exact: true }).click();
    await panel.getByRole('tab', { name: 'Review', exact: true }).click();
    await response.selectOption('custom');
    const longText = 'Synthetic observed response recorded by staff for long-document layout verification. '.repeat(18);
    await panel.locator('[data-field-path="response.custom"] input').fill(longText);
    await page.locator('.tebra-account-trigger').click();
    await page.locator('[data-account-action="staff"]').click();
    const staff = page.getByRole('dialog', { name: 'Documenting staff' });
    await staff.getByRole('textbox', { name: 'Name or initials' }).fill('Synthetic Staff, MA');
    await staff.getByRole('button', { name: 'Use for encounter', exact: true }).click();
    await panel.getByText('Review complete — document administration', { exact: true }).click();
    await page.locator('[data-injection-finish]').click();
    const sign = page.getByRole('dialog', { name: 'Sign', exact: true });
    await sign.getByRole('checkbox', { name: /I reviewed this note/ }).check();
    await sign.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(sign).toBeHidden();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.locator('#lf-document-preview');
    await expect(preview.locator('.lf-progress-heading')).toContainText('Signed locally');
    await expect(preview.locator('.cd2004-note-mode')).toHaveText('Signed locally · read-only');
    await expect(preview.getByRole('article')).toContainText(longText.trim());
    expect(await preview.getByRole('article').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`preview-long-signed-${size.width}-${density}.png`), style: '.tebra-toast-region,#toast {visibility:hidden}' });
    await preview.locator('.cd2004-inspector').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await expect(preview.locator('.cd2004-note-eod')).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`preview-long-end-${size.width}-${density}.png`), style: '.tebra-toast-region,#toast {visibility:hidden}' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
