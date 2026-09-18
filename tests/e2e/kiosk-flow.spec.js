const { test, expect } = require('@playwright/test');
const { setProvider } = require('./provider-entry');
const { fillDate } = require('./date-entry');
const { scheduleRegister } = require('./schedule-register');

const KIOSK_STORAGE_KEY = 'ipmgMedAssistKioskMode_v1';

const kioskStep = (page, id) =>
  page.locator(`.kiosk-stepper button[data-kiosk-step="${id}"]`);

async function signInLocalStaff(page, staff = 'Kiosk QA Staff, MA') {
  await page.locator('.tebra-account-trigger').click();
  await page.locator('[data-account-action="staff"]').click();
  const dialog = page.getByRole('dialog', { name: 'Staff Sign-In' });
  await dialog.getByRole('textbox', { name: 'Name or initials' }).fill(staff);
  await dialog.getByRole('button', { name: 'Use for encounter', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function confirmLocalSignature(page) {
  const dialog = page.getByRole('dialog', { name: 'Sign' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('checkbox', { name: /^I reviewed this note and am ready to sign it\./ })
    .check();
  await dialog.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Injection focus workspace', () => {
  test('supports query, persistence, account entry, full screen, and full-shell exit', async ({ page }) => {
    await page.addInitScript(() => {
      let fullscreenElement = null;
      window.__kioskFullscreenRequests = 0;
      window.__kioskFullscreenExits = 0;
      Object.defineProperty(Document.prototype, 'fullscreenElement', {
        configurable: true,
        get: () => fullscreenElement,
      });
      // Init scripts run before documentElement exists. Install the browser
      // contract on the prototypes the eventual root/document inherit from.
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: async function requestFullscreen() {
          window.__kioskFullscreenRequests += 1;
          fullscreenElement = this;
          document.dispatchEvent(new Event('fullscreenchange'));
        },
      });
      Object.defineProperty(Document.prototype, 'exitFullscreen', {
        configurable: true,
        value: async function exitFullscreen() {
          window.__kioskFullscreenExits += 1;
          fullscreenElement = null;
          document.dispatchEvent(new Event('fullscreenchange'));
        },
      });
    });

    await page.goto('/?kiosk=1');
    const shell = page.locator('.cd2004-shell');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(shell).toHaveAttribute('data-kiosk-mode', 'true');
    await expect(page.locator('.kiosk-stepper [data-kiosk-step]')).toHaveCount(7);
    await expect(page.locator('#lf-workstation > .tebra-context-rail')).toHaveCount(0);
    await expect(page.locator('[data-workspace-badge="local"]')).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KIOSK_STORAGE_KEY))
      .toBe('1');

    await page.locator('[data-kiosk-exit]').click();
    await expect(shell).not.toHaveAttribute('data-kiosk-mode', 'true');
    await expect(page.locator('#lf-workstation > .tebra-context-rail')).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has('kiosk')).toBe(false);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KIOSK_STORAGE_KEY))
      .toBe('0');

    await page.reload();
    await expect(shell).not.toHaveAttribute('data-kiosk-mode', 'true');

    await page.locator('.tebra-account-trigger').click();
    await page.getByRole('menuitem', { name: 'Open Injection focus' }).click();
    await expect(shell).toHaveAttribute('data-kiosk-mode', 'true');
    await expect.poll(() => page.evaluate(() => window.__kioskFullscreenRequests)).toBe(1);
    await expect(page.locator('[data-kiosk-fullscreen]')).toHaveText('Exit full screen');

    await page.locator('[data-kiosk-exit]').click();
    await expect(shell).not.toHaveAttribute('data-kiosk-mode', 'true');
    await expect.poll(() => page.evaluate(() => window.__kioskFullscreenExits)).toBe(1);
  });

  test('keeps steps keyboard-operable and touch-sized at the 800 by 600 floor', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?kiosk=1');

    const panel = page.locator('.wfp-panel');
    await panel.locator('select[name="inj-medication"]').selectOption({
      label: 'Abilify Maintena',
    });

    const prepare = kioskStep(page, 'prepare');
    await prepare.focus();
    await page.keyboard.press('Enter');
    await expect(prepare).toHaveAttribute('aria-current', 'step');
    await expect(panel.getByRole('tabpanel', { name: 'Product' })).toBeVisible();
    await expect(panel.locator('input[placeholder="00000-0000-00"]')).toBeFocused();

    await kioskStep(page, 'site').click();
    await expect(panel.getByRole('tabpanel', { name: 'Administration' })).toBeVisible();
    const siteGrid = panel.locator('.wfp-site-tile-grid').first();
    await expect(siteGrid).toBeVisible();
    expect(await siteGrid.evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length
    )).toBe(2);
    const siteTile = siteGrid.locator('.wfp-site-tile').first();
    expect((await siteTile.boundingBox()).height).toBeGreaterThanOrEqual(44);

    const stepButtons = page.locator('.kiosk-stepper [data-kiosk-step]');
    for (let index = 0; index < await stepButtons.count(); index += 1) {
      const button = stepButtons.nth(index);
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await expect(button.locator('.kiosk-step-copy small svg')).toHaveCount(1);
      await expect(button.locator('.kiosk-step-copy small')).not.toHaveText('');
    }
    const checklistItems = page.locator('.kiosk-checklist li');
    expect(await checklistItems.count()).toBeGreaterThan(0);
    for (let index = 0; index < await checklistItems.count(); index += 1) {
      await expect(checklistItems.nth(index).locator('.kiosk-checklist-icon svg'))
        .toHaveCount(1);
      await expect(checklistItems.nth(index).locator('small')).not.toHaveText('');
    }

    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    )).toBeLessThanOrEqual(1);
    // Reduced motion here is off, not absent. `clinical-desktop.css` applies
    // the standard `transition-duration: 0.01ms !important` reset rather than
    // 0, deliberately, so a `transitionend` listener still fires and no
    // handler waiting on one can hang. An exact zero is therefore a value this
    // repository never produces; assert no perceptible motion instead.
    expect(await prepare.evaluate((node) => Math.max(
      0,
      ...getComputedStyle(node).transitionDuration.split(',').map((value) =>
        value.trim().endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000
      ),
    ))).toBeLessThanOrEqual(0.01);
  });

  test('states the waiting prompt and every shell action in full at both kiosk widths', async ({ page }) => {
    /*
     * `.kiosk-patient-summary` is `overflow: hidden`, and the cells inside it
     * were clipping their own copy: the identity cell truncated the prompt
     * that stands in for a patient name to "Identify the patient to b", and
     * the shell actions ellipsised the exit control to "Return to full w".
     *
     * A name may truncate - a long legal name must not reflow the banner the
     * rest of the kiosk is measured against - but a sentence and a control
     * label may not. Nothing else pins this: the visual baselines cover the
     * ordinary workstation only, so kiosk chrome has no pixel coverage at all.
     * Measuring the overflow directly holds on any platform and needs no
     * baseline to maintain.
     */
    for (const size of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
      await page.setViewportSize(size);
      await page.goto('/?kiosk=1');

      const banner = page.locator('.kiosk-patient-summary');
      await expect(banner).toBeVisible();

      // No patient has been identified, so the prompt occupies the name slot.
      const prompt = banner.locator('.kiosk-patient-identity strong');
      await expect(prompt).toHaveText('Identify the patient to begin');
      await expect(prompt).toHaveClass(/\bis-unidentified\b/);

      const clipped = (locator) => locator.evaluate((node) =>
        node.scrollWidth > node.clientWidth + 1
      );

      expect(await clipped(prompt), `prompt clipped at ${size.width}`).toBe(false);

      const actions = banner.locator('.kiosk-shell-actions button');
      const actionCount = await actions.count();
      expect(actionCount).toBeGreaterThan(0);
      for (let index = 0; index < actionCount; index += 1) {
        const action = actions.nth(index);
        const label = (await action.textContent()).trim();
        expect(label).not.toBe('');
        expect(await clipped(action), `"${label}" clipped at ${size.width}`).toBe(false);
      }

      // The banner clips its own overflow, so wrapping a label must not simply
      // move the loss from the horizontal axis to the vertical one.
      expect(await banner.evaluate((node) =>
        node.scrollHeight > node.clientHeight + 1
      ), `banner clipped vertically at ${size.width}`).toBe(false);
    }
  });

  test('moves a synthetic note from Identify through Sign and starts the next patient', async ({ page }) => {
    await page.goto('/?kiosk=1');
    await signInLocalStaff(page);
    const panel = page.locator('.wfp-panel');

    await kioskStep(page, 'identify').click();
    await panel.locator('input[placeholder="Last, First"]').fill('Kiosk, Synthetic');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');

    await kioskStep(page, 'verify-order').click();
    await setProvider(panel, 'Kiosk Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('.wfp-field:has-text("Medication name") input').fill('Synthetic medication');
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await fillDate(
      panel.locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]'),
      '2026-07-30',
    );
    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await register.getByRole('button', { name: 'Set return date…' }).click();
    const returnDate = page.getByRole('dialog', { name: 'Record ordered return date' });
    await fillDate(returnDate.getByLabel('Return date'), '2026-08-27');
    await returnDate.locator('.wfp-field', { hasText: 'Reason / order context' })
      .locator('textarea')
      .fill('Synthetic active-order return date');
    await returnDate.getByRole('button', { name: 'Record return date', exact: true }).click();

    await kioskStep(page, 'prepare').click();
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
    await panel.locator('input[placeholder="LOT123"]').fill('KIOSK-LOT-42');
    await panel.locator('input[type="month"]').first().fill('2027-12');
    await panel.locator('.wfp-field:has-text("Medication source") select')
      .selectOption({ label: 'Clinic sample' });

    await kioskStep(page, 'site').click();
    await panel.locator('input[placeholder="Actual site / location per active order"]')
      .fill('R deltoid per synthetic order');
    const technique = panel.getByText('Ordered route / technique verified', { exact: true });
    if (await technique.first().isVisible()) await technique.first().click();
    await panel.locator('.wfp-field:has-text("Allergy status") input')
      .fill('No known allergies confirmed');
    await panel.locator('.wfp-checkbox-row label', {
      hasText: 'No acute concerns today confirmed',
    }).click();

    await kioskStep(page, 'administer').click();
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Kiosk QA Staff, MA');
    await panel.locator('input[type="time"]').first().fill('09:41');

    await kioskStep(page, 'response').click();
    await panel.locator('select[name="inj-response"]').selectOption('well');
    await panel.locator('label.wfp-option-row', {
      hasText: 'Review complete — document administration',
    }).click();

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await kioskStep(page, 'sign').click();
    await expect(finish).toBeFocused();
    await finish.click();
    await confirmLocalSignature(page);

    const completion = page.locator('[data-kiosk-completion]');
    await expect(completion).toBeVisible();
    await expect(completion).toContainText('Injection note signed');
    await expect(completion.getByRole('button', { name: 'Print patient handout' }))
      .toBeEnabled();
    await expect(completion).toBeFocused();
    await expect(page.locator('.is-primary:visible')).toHaveCount(1);

    await completion.getByRole('button', { name: 'Start next patient' }).click();
    await expect(completion).toBeHidden();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-kiosk-step', 'identify');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeFocused();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KIOSK_STORAGE_KEY))
      .toBe('1');
  });
});
