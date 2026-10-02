const { test, expect } = require('@playwright/test');

// Exercise the real application and shared event ownership, not a mock UI.
for (const size of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
  test(`one coherent shell and retained clinical entry at ${size.width}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`worklist-${size.width}.png`) });
    await expect(page.locator('.lf-masthead')).toHaveCount(1);
    await expect(page.locator('.lf-section-rail')).toHaveCount(1);
    await expect(page.locator('.meditech-command-deck,.lf-shortcuts-disclosure,.cd2004-window-titlebar,.lf-current-service')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Find local patient records' })).toBeVisible();
    for (const service of ['administer', 'uds', 'samples', 'forms']) {
      if (service === 'administer') await page.locator('.lf-service-administer').click();
      else {
        await page.getByRole('button', { name: 'Change service', exact: true }).click();
        await page.locator(`[data-service-open="${service}"]`).click();
      }
      const panel = page.locator('.wfp-panel');
      const name = panel.locator('input[placeholder="Last, First"]');
      // Use one fully identified patient across services. A deliberately
      // mismatched patient correctly expands the safety banner and is not
      // the ordinary-space baseline; that guard is exercised separately.
      const patientName = 'Premium review, Synthetic';
      await name.fill(patientName);
      const dob = panel.locator('input[placeholder="MM/DD/YYYY"]');
      await dob.fill('01/02/1990');
      await dob.press('Tab');
      const primary = page.locator('[data-active-patient-name]');
      const mismatch = page.locator('.cd2004-context-mismatch');
      await expect.poll(async () => (await primary.textContent())?.includes(patientName) || await mismatch.isVisible()).toBe(true);
      if (await mismatch.isVisible()) await mismatch.getByRole('button', { name: 'Make active', exact: true }).click();
      await expect(primary).toContainText(patientName);
      await expect(mismatch).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${service}-${size.width}.png`) });
      await expect(page.locator('.lf-service-heading h1')).toHaveCount(1);
      // Hidden compatibility mirrors remain non-interactive; only one actual
      // entry control and one accessible identifier may be visible.
      await expect(page.locator('input[placeholder="Last, First"]:visible')).toHaveCount(1);
      const duplicateIds = await page.evaluate(() => {
        const seen = new Set(); const duplicates = [];
        for (const node of document.querySelectorAll('[id]')) {
          if (!node.getClientRects().length || node.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
          if (seen.has(node.id)) duplicates.push(node.id); else seen.add(node.id);
        }
        return duplicates;
      });
      expect(duplicateIds).toEqual([]);
      const form = await panel.locator('.wfp-transaction-page,.lf-service-scroll').boundingBox();
      expect(form, 'A visible clinical working area is required').not.toBeNull();
      expect(form.height).toBeGreaterThanOrEqual(size.width === 800 ? 230 : 400);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(page.getByRole('article', { name: 'Generated documentation' })).toContainText(patientName);
      await page.screenshot({ path: info.outputPath(`${service}-preview-${size.width}.png`) });
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await expect(name).toHaveValue(patientName);
    }
  });
}

test('popover listeners stay balanced and one Escape dismisses one surface', async ({ page }, info) => {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const active = new Map();
    EventTarget.prototype.addEventListener = function (type, fn, options) {
      if (this === document && ['pointerdown', 'focusin', 'keydown'].includes(type)) {
        if (!active.has(type)) active.set(type, new Set());
        active.get(type).add(fn);
      }
      return add.call(this, type, fn, options);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, options) {
      if (this === document) active.get(type)?.delete(fn);
      return remove.call(this, type, fn, options);
    };
    window.__listenerCounts = () => ['pointerdown', 'focusin', 'keydown'].map(type => active.get(type)?.size || 0);
  });
  await page.goto('/');
  await page.locator('.lf-service-administer').click();
  const field = page.locator('.wfp-panel input[placeholder="Last, First"]');
  await field.fill('Ownership, Synthetic');
  await page.locator('.lf-service-heading h1').click();
  const counts = () => page.evaluate(() => window.__listenerCounts());
  const resting = await counts();
  const workspace = page.locator('.lf-workspace-shelf');
  const review = page.locator('.lf-review-disclosure');
  for (let n = 0; n < 12; n++) {
    await workspace.locator(':scope > summary').click();
    await expect(workspace).toHaveAttribute('open', '');
    expect(await counts()).toEqual(resting.map(value => value + 1));
    await review.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(workspace).not.toHaveAttribute('open', '');
    await expect(review).toHaveAttribute('open', '');
    expect(await counts()).toEqual(resting.map(value => value + 1));
    await page.keyboard.press('Escape');
    await expect(review).not.toHaveAttribute('open', '');
    await expect(review.locator(':scope > summary')).toBeFocused();
    expect(await counts()).toEqual(resting);
    await expect(field).toHaveValue('Ownership, Synthetic');
  }
  await workspace.locator(':scope > summary').focus();
  await page.keyboard.press('ArrowDown');
  await expect(workspace.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(workspace.getByRole('button').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(field).toHaveValue('Ownership, Synthetic');
  expect(await counts()).toEqual(resting);
  await page.screenshot({ path: info.outputPath('single-owner-workspace.png') });
});

test('save and lookup commands fire once and preserve native modal focus', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lf-service-uds').click();
  await page.locator('.wfp-panel input[placeholder="Last, First"]').fill('Single action, Synthetic');
  await page.evaluate(() => {
    window.__saveRequests = 0;
    window.addEventListener('ipmg:workstation-draft-save-request', () => window.__saveRequests++);
  });
  await page.keyboard.press('Control+s');
  expect(await page.evaluate(() => window.__saveRequests)).toBe(1);
  await page.keyboard.press('F12');
  expect(await page.evaluate(() => window.__saveRequests)).toBe(2);
  // Repeated owned keys are consumed, not executed again. Browser modifier
  // combinations are not claimed by the workstation.
  const chords = await page.evaluate(() => {
    const send = init => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      document.activeElement.dispatchEvent(event); return event.defaultPrevented; };
    return [send({key:'s',ctrlKey:true,repeat:true}),send({key:'F12',repeat:true}),
      send({key:'s',ctrlKey:true,altKey:true}),send({key:'s',ctrlKey:true,shiftKey:true})];
  });
  expect(chords).toEqual([true,true,false,false]);
  expect(await page.evaluate(() => window.__saveRequests)).toBe(2);
  const provider = page.locator('.wfp-panel select').first();
  await provider.focus();
  await page.keyboard.press('F9');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(provider).toBeFocused();
  expect(await page.evaluate(() => window.__saveRequests)).toBe(2);
});


test('legacy and shell notices share one surface without dropping either message', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('.lf-service-administer').click();
  await expect(page.locator('[data-toast]')).toContainText('Injection opened.');
  await page.evaluate(() => window.toast('Synthetic compatibility notice'));
  await expect(page.locator('#toast')).toBeHidden();
  await expect(page.locator('#toast')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-toast]')).toHaveCount(1);
  await expect(page.locator('[data-toast]')).toContainText('Injection opened.');
  await expect(page.locator('[data-toast]')).toContainText('Synthetic compatibility notice');
  await page.clock.runFor(1700);
  await expect(page.locator('[data-toast]')).not.toContainText('Synthetic compatibility notice');
  await page.clock.runFor(4000);
  await expect(page.locator('[data-toast]')).toHaveCount(0);
  await page.evaluate(() => window.toast('Synthetic compatibility notice'));
  await expect(page.locator('[data-toast]')).toHaveCount(1);
  await expect(page.locator('[data-toast]')).toHaveText('Synthetic compatibility notice');
});
