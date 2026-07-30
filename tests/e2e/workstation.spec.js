const { test, expect } = require('@playwright/test');

test.describe('MA Workstation browser journeys', () => {
  async function openInjectionCard(page, cardClass) {
    const card = page.locator(`#panel-administer .${cardClass}`);
    await expect(card).toBeVisible();
    const isCollapsed = () => card.evaluate(node =>
      node.classList.contains('rc530-collapsed') || node.classList.contains('rc526-collapsed')
    );
    if (await isCollapsed()) {
      const receipt = card.locator('.rc530-summary:visible, .rc526-summary:visible').first();
      if (await receipt.count()) {
        await receipt.click();
      } else {
        await card.locator('.card-head').click();
      }
    }
    await expect.poll(isCollapsed).toBe(false);
    return card;
  }

  async function prepareRoutineInjection(page, options = {}) {
    const {
      patient = 'QA, Browser',
      dob = '01/02/1990',
      administrationTime = '09:41',
      includeAdministrationTime = true,
      medication = 'Other'
    } = options;

    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();
    await expect(page.locator('#injRecordWorkspace')).toBeVisible();

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#ptName').fill(patient);
    await page.locator('#ptDOB').fill(dob);
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#reasonChips').getByRole('button', { name: 'PRN / ordered', exact: true }).click();

    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: medication, exact: true }).click();
    if (medication === 'Other') {
      await page.locator('#doseChips input').fill('100 mg');
    } else {
      await page.locator('#doseChips').getByRole('button', { name: '50 mg', exact: true }).click();
    }
    await page.locator('#routeChips').getByRole('button', { name: 'IM', exact: true }).click();
    await page.locator('#bodyMap [data-site="' + (medication === 'Other' ? 'R deltoid' : 'R ventrogluteal') + '"]').click();
    await openInjectionCard(page, 'card-medication');
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    await openInjectionCard(page, 'card-trace');
    await page.locator('#ndc').fill('00000-0000-42');
    await page.locator('#lot').fill('BROWSER-LOT-42');
    await page.locator('#exp').fill('2027-12');

    await openInjectionCard(page, 'card-safety');
    if (medication !== 'Other') {
      await page.locator('#medSpecChips').getByRole('button', { name: 'Ordered route / technique verified', exact: true }).click();
    }
    await page.locator('#allergies').fill('NKDA verified in active record');
    await page.locator('[data-rc530-noacute]').click();

    await openInjectionCard(page, 'card-response');
    await page.locator('#adminDate').fill('2026-07-30');
    if (includeAdministrationTime) {
      await page.locator('#injAdminTime').fill(administrationTime);
    }
    await page.locator('#admin').fill('QA Staff, MA');

    await openInjectionCard(page, 'card-return');
    await page.locator('#nextDate').fill('2026-08-27');
    return page.locator('#clinicalDisposition');
  }

  test('boots without page errors and exposes the local injection-record drawer', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('.tab[data-tab="administer"]')).toBeVisible();
    await page.locator('.tab[data-tab="administer"]').click();

    const drawerLauncher = page.locator('#recordsDrawerTrigger');
    await expect(drawerLauncher).toBeVisible();
    await drawerLauncher.click();

    const drawer = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    await expect(page.locator('[data-records-filter="draft"]')).toBeVisible();

    const drawerClose = page.locator('.records-drawer-close');
    const drawerNew = page.locator('[data-records-new]');
    await drawerClose.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(drawerNew).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawerClose).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(drawerLauncher).toHaveAttribute('aria-expanded', 'false');
    await expect(drawerLauncher).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test('uses one keyboard-accessible module navigator with stable ARIA and quick-action routing', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('.tab[data-tab]');
    const home = page.locator('.tab[data-tab="home"]');
    const administer = page.locator('.tab[data-tab="administer"]');

    await home.focus();
    await page.keyboard.press('ArrowRight');
    await expect(administer).toBeFocused();
    await expect(administer).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-administer')).toHaveClass(/on/);
    await expect(page.locator('.tab[data-tab][aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('.tab[data-tab][tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('.tabs')).toHaveAttribute('role', 'tablist');

    await page.evaluate(() => {
      window.__ipmgTabChanges = 0;
      document.addEventListener('ipmg:tabchange', () => { window.__ipmgTabChanges += 1; });
    });
    await home.click();
    await page.locator('#panel-home .home-action[data-jump-tab="uds"]').click();
    await expect(page.locator('.tab[data-tab="uds"]')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.evaluate(() => window.__ipmgTabChanges)).toBe(2);
    await expect(page.locator('#panel-uds h2').first()).toBeFocused();

    await page.evaluate(() => {
      window.__ipmgQuickRoute = { uds: 0, injection: 0 };
      document.getElementById('udsCopyAll').click = () => { window.__ipmgQuickRoute.uds += 1; };
      document.getElementById('copyAll').click = () => { window.__ipmgQuickRoute.injection += 1; };
    });
    await home.click();
    await page.locator('[data-home-action="copy-note"]').click();
    await expect.poll(() => page.evaluate(() => window.__ipmgQuickRoute)).toEqual({ uds: 1, injection: 0 });

    await page.locator('.tab[data-tab="samples"]').click();
    const savedScroll = await page.evaluate(() => {
      const target = Math.min(1200, Math.max(0, document.documentElement.scrollHeight - innerHeight));
      scrollTo(0, target);
      return scrollY;
    });
    await page.locator('.tab[data-tab="uds"]').click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(220);
    await page.locator('.tab[data-tab="samples"]').click();
    await expect.poll(() => page.evaluate(expected => Math.abs(scrollY - expected), savedScroll)).toBeLessThan(80);
  });

  test('keeps Samples guide ownership, ARIA, and output highlighting in the Samples panel', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="samples"]').click();
    const guides = page.locator('#panel-samples [data-guide]');
    await expect(guides).toHaveCount(6);
    expect(await guides.evaluateAll(nodes => nodes.map(node => node.dataset.guide)))
      .toEqual(['patient', 'selected', 'plan', 'trace', 'safety', 'output']);

    const selected = page.locator('#panel-samples [data-guide="selected"]');
    await selected.locator('[data-guided-head]').focus();
    await page.keyboard.press('Enter');
    await expect(selected).toHaveClass(/open/);
    await expect(selected.locator('[data-guided-head]')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => guides.evaluateAll(nodes => nodes.filter(node => node.classList.contains('open')).length)).toBe(1);
    await expect.poll(() => guides.evaluateAll(nodes =>
      nodes.filter(node => node.querySelector('[data-guided-head]')?.getAttribute('aria-expanded') === 'true').length
    )).toBe(1);

    const output = page.locator('#panel-samples [data-guide="output"]');
    await output.locator('[data-guided-head]').click();
    await output.locator('button.secondary').click();
    await expect(page.locator('#panel-samples .preview-col')).toHaveClass(/output-pulse/);
    await expect(page.locator('#panel-administer .preview-col')).not.toHaveClass(/output-pulse/);
  });

  test('reopens a collapsed injection receipt from the progress rail with the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();
    const encounter = page.locator('#panel-administer .card-encounter');
    await page.locator('#ptName').fill('QA, Receipt');
    await page.locator('#ptDOB').fill('01/02/1990');
    await page.locator('#orderingProvider').fill('QA Provider');

    await expect.poll(() => encounter.evaluate(node => node.classList.contains('rc530-collapsed'))).toBe(true);
    const receipt = encounter.locator('.rc530-summary');
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveJSProperty('tagName', 'BUTTON');
    await expect(receipt).toHaveAttribute('aria-expanded', 'false');
    await expect(receipt).toHaveAttribute('aria-label', /Patient & order — complete:/);

    const progressStep = page.locator('[data-rc526-jump="encounter"]');
    await progressStep.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => encounter.evaluate(node => node.classList.contains('rc530-collapsed'))).toBe(false);
    await expect(encounter).toHaveClass(/rc530-open/);
    await expect(progressStep).toBeFocused();
  });

  test('keeps module navigation and the records drawer contained at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    const homeTab = page.locator('.tab[data-tab="home"]');
    const logTab = page.locator('.tab[data-tab="log"]');
    await homeTab.focus();
    await page.keyboard.press('End');
    await expect(logTab).toBeFocused();
    await expect(logTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.evaluate(() => {
      const rail = document.querySelector('.tabs');
      const target = document.querySelector('.tab[data-tab="log"]');
      if (!rail || !target) return false;
      const railRect = rail.getBoundingClientRect(), targetRect = target.getBoundingClientRect();
      return targetRect.left >= railRect.left - 1 && targetRect.right <= railRect.right + 1;
    })).toBe(true);

    await page.locator('.tab[data-tab="samples"]').click();
    await expect(page.locator('.tab[data-tab="samples"]')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#recordsDrawerTrigger').click();
    const drawer = page.locator('.records-drawer');
    await expect(drawer).toBeVisible();
    const bounds = await drawer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeLessThanOrEqual(390);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.locator('#recordsDrawerTrigger')).toBeFocused();
  });

  test('renders a blank sample worksheet through the browser print path', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ipmgPrintCalls = 0;
      window.print = () => { window.__ipmgPrintCalls += 1; };
    });

    await page.goto('/');
    await page.locator('.tab[data-tab="samples"]').click();
    await expect(page.locator('#sampleWorksheetBlank')).toBeVisible();

    await page.locator('#sampleWorksheetBlank').click();
    await expect.poll(() => page.evaluate(() => window.__ipmgPrintCalls)).toBe(1);
    await expect(page.locator('#sampleWorksheetSheet .sw-page')).toContainText(/Medication Sample|Sample/i);

    // The product deliberately clears its print class after invoking the system dialog.
    // Let that cleanup finish, then restore it so Chromium renders the exact
    // print stylesheet to a PDF without racing the production cleanup timer.
    await page.waitForTimeout(650);
    await page.evaluate(() => document.body.classList.add('print-sample-worksheet'));
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('#sampleWorksheetSheet')).toBeVisible();
    await expect(page.locator('.app-shell')).toBeHidden();

    const pdf = await page.pdf({ format: 'Letter', printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  test('requires a distinct trace and current review for each added sample package', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="samples"]').click();

    async function openGuide(id) {
      const guide = page.locator(`#panel-samples [data-guide="${id}"]`);
      await expect(guide).toBeVisible();
      if (!await guide.evaluate(card => card.classList.contains('open'))) {
        await guide.locator('[data-guided-head]').click();
      }
      await expect(guide).toHaveClass(/open/);
    }

    await openGuide('selected');
    await page.locator('#sampleMedChips button').first().click();

    const packageOption = page.locator('#samplePackageButtons button:not(.manual)').first();
    await expect(packageOption).toBeVisible();
    // RC5.38 intentionally starts with no physical package. The first click makes
    // the primary package; the second is the separate package we need to trace.
    await packageOption.click();
    await packageOption.click();

    const doseRow = page.locator('#sampleDoseRows [data-sample-package-trace]');
    const traceRow = page.locator('#samplePackageTraceList [data-sample-package-trace-row]');
    await expect(doseRow).toHaveCount(1);
    await expect(traceRow).toHaveCount(1);

    await openGuide('patient');
    await page.locator('#samplePtName').fill('QA, Browser');
    await page.locator('#sampleDOB').fill('01/02/1990');
    await page.locator('#samplePrescriber').fill('QA Prescriber');
    await page.locator('#sampleStaff').fill('QA Staff');
    await page.locator('#sampleDate').fill('2026-07-29');

    await openGuide('plan');
    await page.locator('#sampleStart').fill('2026-07-29');
    await page.locator('#sampleSig').fill('Take as prescribed.');

    await openGuide('safety');
    await page.locator('#sampleMedCheck').selectOption({ label: 'Prescriber reviewed / ok to dispense' });
    await page.locator('#sampleEdu').selectOption({ label: 'Reviewed with patient' });

    await openGuide('trace');
    await page.locator('#sampleLot').fill('PRIMARY-LOT-42');
    await page.locator('#sampleExp').fill('2027-12');

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 expiration');

    const reviewButton = page.locator('#sampleReviewedToday');
    await openGuide('safety');
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');

    await openGuide('trace');
    await traceRow.locator('[data-sample-package-trace-field="lot"]').fill('SECONDARY-LOT-42');
    await traceRow.locator('[data-sample-package-trace-field="exp"]').fill('2028-01');

    const entries = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ label: 'Primary package', lot: 'PRIMARY-LOT-42', exp: '2027-12' });
    expect(entries[1]).toMatchObject({ label: 'Added package 2', lot: 'SECONDARY-LOT-42', exp: '2028-01' });

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('final dispense review confirmation');
    await expect(page.locator('#samplePrint')).toBeDisabled();

    await openGuide('safety');
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sampleReviewedTodayStatus')).toContainText('Final dispense review confirmed today');
    await expect(page.locator('#samplePrint')).toBeEnabled();

    await openGuide('trace');
    await traceRow.locator('[data-sample-package-trace-field="lot"]').fill('SECONDARY-LOT-43');
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#samplePrint')).toBeDisabled();
  });

  test('gates actual administration, product handling, and exception detail before administration can be documented', async ({ page }) => {
    const disposition = await prepareRoutineInjection(page, {
      patient: 'QA, Conditional',
      includeAdministrationTime: false
    });
    const administered = disposition.locator('[data-disposition="administered"]');

    await expect(disposition).toContainText('Document the actual administration time.');
    await expect(administered).toBeDisabled();

    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminTime').fill('09:41');
    await expect(administered).toBeEnabled();

    await openInjectionCard(page, 'card-trace');
    await page.locator('#injHandlingToggle').click();
    await expect(page.locator('#injHandlingFields')).toBeVisible();
    await page.locator('#injWasteToggle').check();
    await expect(page.locator('#injWasteFields')).toBeVisible();
    await expect(disposition).toContainText('Document the medication waste amount and unit.');
    await expect(administered).toBeDisabled();

    await page.locator('#injWasteAmount').fill('0.2 mL');
    await page.locator('#injWasteWitness').fill('QA Witness');
    await expect(administered).toBeEnabled();

    await openInjectionCard(page, 'card-response');
    await page.locator('#injExceptionToggle').check();
    await expect(page.locator('#injExceptionFields')).toBeVisible();
    await expect(disposition).toContainText('Describe what changed or was observed for the administration exception.');
    await expect(administered).toBeDisabled();

    await page.locator('#injExceptionSummary').fill('Patient reported transient dizziness after injection.');
    await page.locator('#injExceptionRecipient').fill('QA Provider, notified');
    await page.locator('#injExceptionTime').fill('2026-07-30T09:48');
    await page.locator('#injExceptionOutcome').fill('Provider advised seated observation; staff reassessed and reviewed return precautions.');
    await expect(administered).toBeEnabled();
  });

  test('formats the administered Tebra copy and preserves new fields in a locked record snapshot', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173'
    });
    const disposition = await prepareRoutineInjection(page, {
      patient: 'QA, Formatted Note',
      medication: 'Haldol Dec.'
    });

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#injOrderPurpose').fill('Active order follow-up context');

    await openInjectionCard(page, 'card-trace');
    await page.locator('#injHandlingToggle').click();
    await page.locator('#injProductSource').selectOption({ label: 'Clinic stock' });

    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminDetailToggle').click();
    await page.locator('#injVolume').fill('2');
    await page.locator('#injVolumeUnit').selectOption('mL');
    await page.locator('#injDevice').selectOption({ label: 'Prefilled syringe' });
    await page.locator('#injSiteCondition').selectOption({ label: 'Skin/site intact before administration' });

    const administered = disposition.locator('[data-disposition="administered"]');
    await expect(administered).toBeEnabled();
    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');
    await expect(page.locator('#outCC')).toContainText('→ Verified active-order purpose / encounter context: Active order follow-up context.');
    await expect(page.locator('#outPL')).toContainText('→ Administered');
    await expect(page.locator('#outPL')).toContainText('actual administration time: 9:41 AM');
    await expect(page.locator('#outPL')).toContainText('Administration amount: 2 mL · Delivery device: Prefilled syringe · Site condition: Skin/site intact before administration.');
    await expect(page.locator('#outPL')).toContainText('• Traceability');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic stock.');

    await page.locator('#copyAll').click();
    await expect.poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return ['→ Administered', 'actual administration time: 9:41 AM', '• Traceability']
        .every(fragment => copied.includes(fragment));
    }).toBe(true);
    const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedNote).not.toMatch(/(?:^|\n)(?:CC|ASSESSMENT|PLAN):/);

    const complete = page.locator('#injRecordWorkspace [data-inj-complete]');
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(page.locator('#injCompletionOverlay')).toBeVisible();
    await expect(page.locator('#injCompletionOverlay button')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#injCompletionOverlay')).toBeHidden();
    await expect(page.locator('#injRecordWorkspace')).toBeFocused();
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(page.locator('#rc526Flow .rc526-mode b')).toHaveText('Locked injection record');
    await expect(page.locator('#injRecordWorkspace [data-inj-new]')).toHaveAttribute('aria-label', 'Start a new injection');
    await expect(page.locator('#ptName')).toBeDisabled();
    await openInjectionCard(page, 'card-medication');
    await expect(page.locator('#medClear')).toHaveAttribute('aria-disabled', 'true');
    const lockedMedication = await page.locator('#medHdrName').textContent();
    expect(lockedMedication).toBeTruthy();
    await page.locator('#medClear').click();
    await expect(page.locator('#medHdrName')).toHaveText(lockedMedication || '');
    await expect(page.locator('#outPL')).toContainText('actual administration time: 9:41 AM');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic stock.');

    await page.locator('#injAddendumAuthor').fill('QA Addendum Staff');
    await page.locator('#injAddendumText').fill('Saved clarification by the current reviewer.');
    await page.locator('[data-inj-addendum]').click();
    await expect(page.locator('.record-addenda-item').first()).toContainText('QA Addendum Staff');
    await expect(page.locator('.record-addenda-item').first()).toContainText('Saved clarification by the current reviewer.');

    await page.locator('#injAddendumText').fill('Pending clarification that must not be abandoned.');
    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#injAddendumText')).toHaveValue('Pending clarification that must not be abandoned.');
    await expect(page.locator('#injAddendumText')).toBeFocused();
    await expect(page.locator('#ptName')).toHaveValue('QA, Formatted Note');
  });

  test('locks a paired aripiprazole initiation with both injection components in the completion receipt', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#ptName').fill('QA, Paired Initiation');
    await page.locator('#ptDOB').fill('04/05/1993');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#reasonChips').getByRole('button', { name: 'Initiation', exact: true }).click();

    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Abilify Maintena', exact: true }).click();
    await page.locator('#doseChips').getByRole('button', { name: '400 mg', exact: true }).click();
    await page.locator('#routeChips').getByRole('button', { name: 'IM', exact: true }).click();
    await page.locator('#bodyMap [data-site="R deltoid"]').click();
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    const initiation = page.locator('#initiationProtocolCard');
    await expect(initiation).toBeVisible();
    await initiation.getByRole('button', { name: /1-day initiation/ }).click();
    await page.evaluate(() => {
      const setValue = (id, value) => {
        const control = document.getElementById(id);
        control.value = value;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const setChecked = id => {
        const control = document.getElementById(id);
        control.checked = true;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setChecked('initPlanVerified');
      setValue('initSecondDose', '400 mg');
      setValue('initSecondSite', 'L deltoid');
      setValue('initSecondNdc', '00000-0000-22');
      setValue('initSecondLot', 'PAIR-LOT-2');
      setValue('initSecondExp', '2028-06');
      setChecked('initSecondOrderVerified');
      setChecked('initSecondGiven');
      document.querySelector('[data-init-oral="administered"]').click();
    });
    await expect(initiation).toContainText('Protocol fields complete');

    await openInjectionCard(page, 'card-trace');
    await page.locator('#ndc').fill('00000-0000-11');
    await page.locator('#lot').fill('PAIR-LOT-1');
    await page.locator('#exp').fill('2028-05');

    await openInjectionCard(page, 'card-safety');
    await page.locator('#medSpecChips').getByRole('button', { name: 'Suspension inspected & mixed', exact: true }).click();
    await page.locator('#medSpecChips').getByRole('button', { name: 'Ordered oral initiation plan documented', exact: true }).click();
    await page.locator('#allergies').fill('NKDA verified in active record');
    await page.locator('[data-rc530-noacute]').click();

    await openInjectionCard(page, 'card-response');
    await page.locator('#adminDate').fill('2026-07-30');
    await page.locator('#injAdminTime').fill('10:15');
    await page.locator('#injSecondAdminTime').fill('10:18');
    await page.locator('#admin').fill('QA Staff, MA');

    await openInjectionCard(page, 'card-return');
    await page.locator('#nextDate').fill('2026-08-27');

    const administered = page.locator('#clinicalDisposition [data-disposition="administered"]');
    await expect(administered).toBeEnabled();
    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    const complete = page.locator('#injRecordWorkspace [data-inj-complete]');
    await expect(complete).toBeEnabled();
    await complete.click();
    const receipt = page.locator('#injCompletionOverlay .inj-completion-receipt');
    await expect(receipt).toContainText('Component 1');
    await expect(receipt).toContainText('400 mg · IM · R deltoid · at 10:15');
    await expect(receipt).toContainText('NDC 00000-0000-11 · Lot PAIR-LOT-1 · Exp 2028-05');
    await expect(receipt).toContainText('Component 2 · Abilify Maintena');
    await expect(receipt).toContainText('400 mg · IM · L deltoid · at 10:18');
    await expect(receipt).toContainText('NDC 00000-0000-22 · Lot PAIR-LOT-2 · Exp 2028-06');
  });

  test('round-trips structured injection draft fields through the local records drawer', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();
    await expect(page.locator('#injRecordWorkspace')).toBeVisible();

    await page.locator('#ptName').fill('QA, Draft Detail');
    await page.locator('#ptDOB').fill('02/03/1991');
    await page.locator('#orderingProvider').fill('QA Draft Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#injOrderPurpose').fill('Draft order-linked encounter context');
    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminTime').fill('14:06');

    // Switch immediately: the record lifecycle must flush the pending sub-700 ms
    // autosave instead of losing the most recent structured fields.
    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');

    await page.locator('#recordsDrawerTrigger').click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Draft Detail');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#ptName')).toHaveValue('QA, Draft Detail');
    await expect(page.locator('#injOrderPurpose')).toHaveValue('Draft order-linked encounter context');
    await expect(page.locator('#injAdminTime')).toHaveValue('14:06');
  });

  test('resets smart-vitals state for a new injection and restores it with its draft', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();

    await page.locator('#ptName').fill('QA, Smart Vitals Draft');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Other', exact: true }).click();
    await openInjectionCard(page, 'card-safety');
    await page.locator('[data-rc526-toggle-vitals]').click();
    await expect(page.locator('#rr')).toBeVisible();

    await page.locator('#rr').fill('10');
    await page.locator('#spo2').fill('93');
    await page.locator('#vitalRepeatNote').fill('Repeat sitting after five minutes: 96%.');
    // Blurring the repeat-note field redraws the smart-vitals panel; interact with
    // the freshly rendered recheck action rather than its pre-blur instance.
    await page.locator('#vitalRepeatNote').blur();
    const recheck = page.locator('#vitalsRecheckChip');
    await expect(recheck).toBeVisible();
    await recheck.click();
    await expect(recheck).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#injRecordWorkspace [data-inj-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    await expect(page.locator('#rr')).toHaveValue('');
    await expect(page.locator('#spo2')).toHaveValue('');
    await expect(page.locator('#vitalRepeatNote')).toHaveValue('');
    await expect.poll(() => page.evaluate(() => window.ipmgSmartVitalsSnapshot().recheck)).toBe(false);

    await page.locator('#recordsDrawerTrigger').click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Smart Vitals Draft');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#rr')).toHaveValue('10');
    await expect(page.locator('#spo2')).toHaveValue('93%');
    await expect(page.locator('#vitalRepeatNote')).toHaveValue('Repeat sitting after five minutes: 96%.');
    await expect(recheck).toHaveAttribute('aria-pressed', 'true');
  });

  test('clearing the first meaningful draft field cancels autosave without creating a record', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();

    const recordStatus = page.locator('#injRecordStatus');
    // Dispatch both edits in one browser task so the test exercises the actual
    // pre-autosave clear path without becoming timing-sensitive under CI load.
    await page.evaluate(() => {
      const patient = document.getElementById('ptName');
      patient.value = 'QA, Transient Draft';
      patient.dispatchEvent(new Event('input', { bubbles: true }));
      patient.value = '';
      patient.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Let the original 700 ms autosave window elapse before verifying its cancellation.
    await page.waitForTimeout(850);
    await expect(recordStatus).toHaveText('New draft');
    await expect(page.locator('#recordsDrawerCount')).toHaveText('0');
    await expect.poll(() => page.evaluate(() => {
      return JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
    })).toEqual([]);
  });

  test('never reports a draft as saved or abandons it when browser persistence fails', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'ipmgMedAssistInjectionRecordsV1') {
          throw new DOMException('Storage blocked for test', 'QuotaExceededError');
        }
        return nativeSetItem.call(this, key, value);
      };
    });
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();
    await page.locator('#ptName').fill('QA, Persistence Guard');
    await page.locator('#ptDOB').fill('03/04/1992');
    await page.locator('#orderingProvider').fill('QA Provider');

    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('QA, Persistence Guard');
    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#panel-administer')).not.toHaveClass(/record-readonly/);
  });

  test('uses prior administration context to recommend, but never auto-select, the actual site', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('.tab[data-tab="administer"]').click();

    await page.locator('#ptName').fill('QA, Smart Rotation');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Other', exact: true }).click();
    await page.locator('#doseChips input').fill('100 mg');
    await page.locator('#priorDose').fill('2026-07-02');
    await page.locator('#priorSite').selectOption('R deltoid');

    await expect(page.locator('#injPriorContextCopy')).toContainText('A valid alternate is L deltoid');
    await expect(page.locator('#bodyMap .bm-lm.recommended[data-site="L deltoid"]')).toBeVisible();
    await expect(page.locator('#bodyMap .bz-sel,#bodyMap .bm-lm.on')).toHaveCount(0);

    await page.locator('#bodyMap .bm-rot-alt').click();
    await expect(page.locator('#adminGuideSummaryLine')).toContainText('IM · L deltoid');
    await expect(page.locator('#adminGuideDetail')).toHaveClass(/hidden/);
    await expect(page.locator('#panel-administer .card-medication')).not.toHaveClass(/rc530-collapsed/);
    await expect(page.locator('#intChips')).toBeVisible();
    await page.locator('#adminGuideEdit').click();
    await expect(page.locator('#bodyMap')).toBeVisible();
    await expect(page.locator('#bodyMap [role="button"][tabindex="0"]').first()).toBeFocused();
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    await openInjectionCard(page, 'card-response');
    await expect(page.locator('#injAdministrationCoreSub')).toContainText('Other · 100 mg · IM · L deltoid');
    await expect(page.locator('#panel-administer .card-response')).not.toHaveClass(/rc530-collapsed/);
    await expect(page.locator('#panel-administer .card-safety')).toHaveClass(/rc530-collapsed/);
    await expect(page.getByLabel('Actual administration time *')).toBeVisible();
  });
});
