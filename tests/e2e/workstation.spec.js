const { test, expect } = require('@playwright/test');
const { setProvider, expectProviderValue, providerControl } = require('./provider-entry');
const { fillDate } = require('./date-entry');
const {
  scheduleRegister,
  registerVerdict,
  registerMarker,
  registerValue,
  registerNote,
  registerFlag,
  registerBand,
} = require('./schedule-register');

test.describe('MA Workstation browser journeys', () => {
  const workflowLabels = {
    home: 'Dashboard',
    administer: 'Injection',
    uds: 'UDS',
    samples: 'Samples',
    forms: 'Forms',
    reference: 'Knowledge',
    log: 'Daily Closeout',
    tms: 'Future / TMS'
  };

  async function openWorkflow(page, workflow) {
    const shell = page.locator('.cd2004-shell');
    // The workflow tab strip is docked along the bottom edge at every width,
    // so a tab is always directly clickable - no pane switching required.
    const navButton = page.locator(`.cd2004-nav-item[title="${workflowLabels[workflow]}"]`);
    await navButton.scrollIntoViewIfNeeded();
    await navButton.click();
    await expect(shell).toHaveAttribute('data-active-workflow', workflow);
    if (
      workflow === 'forms' ||
      workflow === 'uds' ||
      workflow === 'administer' ||
      workflow === 'samples' ||
      workflow === 'tms' ||
      workflow === 'reference' ||
      workflow === 'log'
    ) {
      // Forms, UDS, Injection, Samples, TMS, Knowledge, and Daily Closeout
      // are migrated to real panels. Forms/UDS/Injection/Samples' legacy
      // #panel-* markup stays loaded hidden as a print/readiness
      // compatibility mirror; TMS, Knowledge, and Daily Closeout have no
      // print/readiness dependency on their own panel being mounted, so
      // their legacy panels are never mounted at all.
      await expect(page.locator('.wfp-panel')).toBeVisible();
    } else if (workflow !== 'home') {
      const panelId = workflow === 'reference' ? '#panel-reference' : `#panel-${workflow}`;
      await expect(page.locator(panelId)).toBeVisible();
    }
  }

  async function expectNoHorizontalPageOverflow(page) {
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    )).toBeLessThanOrEqual(1);
  }

  async function maxMotionMilliseconds(locator, property) {
    return locator.evaluate((node, propertyName) => {
      const values = getComputedStyle(node)[propertyName]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000);
      return Math.max(0, ...values);
    }, property);
  }

  async function openInjectionTab(page, tabName) {
    const panel = page.locator('.wfp-panel');
    const currentLabel = {
      Order: 'Order & Timing',
      Schedule: 'Order & Timing',
      Verification: 'Administration',
      Outcome: 'Review'
    }[tabName] ?? tabName;
    await panel.getByRole('tab', { name: currentLabel, exact: true }).click();
    return panel;
  }

  async function confirmLocalAttestation(page) {
    const dialog = page.getByRole('dialog', { name: 'Sign' });
    const acknowledgement = dialog.getByRole('checkbox', {
      name: /^I attest that I reviewed this local record before locking it\./
    });
    const confirm = dialog.getByRole('button', {
      name: 'Sign',
      exact: true
    });

    await expect(dialog).toBeVisible();
    // The safe route is the initial focus; attesting is deliberately gated.
    await expect(dialog.getByRole('button', { name: 'Back to editing', exact: true }))
      .toBeFocused();
    await expect(confirm).toBeDisabled();
    await acknowledgement.check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
  }

  async function signInLocalStaff(page, staff = 'QA Staff, MA') {
    await page.locator('.cd2004-menu[data-menu="tools"] .cd2004-menu-title').click();
    await page.getByRole('menuitem', { name: 'Staff sign-in…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Staff Sign-In' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name or initials' }).fill(staff);
    await dialog.getByRole('button', { name: 'Use for encounter', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cd2004-banner-staff')).toContainText(staff);
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
    await signInLocalStaff(page);
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill(patient);
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill(dob);
    await setProvider(panel, 'QA Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });

    await panel.locator('select[name="inj-medication"]').selectOption({ label: medication });
    if (medication === 'Other') {
      await panel.locator('.wfp-field:has-text("Medication name") input').fill('QA custom medication');
      await panel.locator('input[name="inj-dose"]').fill('100 mg');
    } else {
      await panel
        .locator('select[name="inj-dose"]')
        .selectOption(medication === 'Vivitrol' ? '380 mg' : '50 mg');
    }
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await fillDate(
      panel
        .locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]'), '2026-07-30');

    // An uncatalogued medication cannot inherit a q4wk calculation. The
    // reusable complete-administration fixture therefore records the return
    // date from its active order, while the dedicated Other regression below
    // covers the intentionally blank/manual state before this step.
    if (medication === 'Other') {
      const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
      await register.getByRole('button', { name: 'Set return date…' }).click();
      const returnDate = page.getByRole('dialog', { name: 'Record ordered return date' });
      await fillDate(returnDate.getByLabel('Return date'), '2026-08-27');
      await returnDate
        .locator('.wfp-field', { hasText: 'Reason / order context' })
        .locator('textarea')
        .fill('Active order return date for browser fixture');
      await returnDate.getByRole('button', { name: 'Record return date', exact: true }).click();
    }

    await openInjectionTab(page, 'Administration');
    if (medication === 'Other' || medication === 'Haldol Dec.' || medication === 'Prolixin Dec.') {
      await panel
        .locator('input[placeholder="Actual site / location per active order"]')
        .fill(medication === 'Other' ? 'R deltoid per active order' : 'R ventrogluteal per active order');
    } else {
      await panel
        .getByText('R ventrogluteal', { exact: true })
        .click();
    }

    await openInjectionTab(page, 'Product');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
    await panel.locator('input[placeholder="LOT123"]').fill('BROWSER-LOT-42');
    await panel.locator('input[type="month"]').first().fill('2027-12');
    await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic sample' });

    await openInjectionTab(page, 'Verification');
    // A medication-specific verification is only rendered where its current
    // reference applies. Haldol/Prolixin intentionally do not carry the
    // retired blanket Z-track verification in the new clinical bundle.
    const orderedTechnique = panel.getByText('Ordered route / technique verified', { exact: true });
    if (await orderedTechnique.first().isVisible()) {
      await orderedTechnique.first().click();
    }
    await panel
      .locator('.wfp-field:has-text("Allergy status") input')
      .fill('NKDA confirmed in this local record');
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'No acute concerns today confirmed' })
      .click();

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');
    if (includeAdministrationTime) {
      await panel.locator('input[type="time"]').first().fill(administrationTime);
    }
    await openInjectionTab(page, 'Outcome');
    await panel.locator('select[name="inj-response"]').selectOption('well');
    await openInjectionTab(page, 'Administration');
    return panel;
  }

  async function prepareScheduledVivitrol(page, {
    patient,
    priorDoseDate,
    administrationDate,
    nextDoseDate
  }) {
    const panel = await prepareRoutineInjection(page, {
      patient,
      medication: 'Vivitrol'
    });
    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Scheduled' });
    await fillDate(
      panel
        .locator('.wfp-field', { hasText: 'Prior dose' })
        .locator('input[data-workstation-date="date"]'), priorDoseDate);
    await fillDate(
      panel
        .locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]'), administrationDate);

    // VIVITROL's supplied-needle attestation does not replace the current
    // label-required habitus assessment. Choose a concrete assessment for
    // the normal scheduled-administration fixtures; the dedicated regression
    // below exercises the incomplete path.
    await openInjectionTab(page, 'Administration');
    await panel.locator('label.wfp-needle-band-option', { hasText: 'Average' }).click();

    await openInjectionTab(page, 'Verification');
    for (const label of [
      'VIVITROL reconstitution and suspension check completed',
      'Current opioid-risk / provider plan verified',
      'Naltrexone/hepatic review verified',
      'Supplied needle / body-habitus check'
    ]) {
      await panel.locator('label.wfp-option-row', { hasText: label }).click();
    }
    return panel;
  }

  test('uses purposeful Injection prerequisites and distinguishes current from blank printing', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Product');
    const prerequisite = panel.locator('.wfp-prerequisite-line');
    await expect(prerequisite).toContainText('ORDER REQUIRED');
    await expect(prerequisite).toContainText('load package and traceability fields');
    await expect(panel.getByRole('group', { name: 'Lot & traceability' })).toHaveCount(0);

    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-prerequisite-line')).toContainText(
      'Select the ordered medication before documenting administration details.'
    );

    await openInjectionTab(page, 'Outcome');
    await expect(panel.getByRole('button', { name: 'Print current worksheet' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Blank worksheet' })).toBeEnabled();

    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('.wfp-field:has-text("Medication name") input').fill('QA manual product');
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await openInjectionTab(page, 'Product');
    await expect(panel.locator('.wfp-prerequisite-line')).toHaveCount(0);
    await expect(panel.getByRole('group', { name: 'Lot & traceability' })).toBeVisible();
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
    await expect(panel.locator('.wfp-summary-fact').filter({ hasText: 'PKG' }))
      .toContainText('MANUAL');

    await openInjectionTab(page, 'Outcome');
    await expect(panel.getByRole('button', { name: 'Print current worksheet' })).toBeEnabled();
  });

  test('keeps patient identity typing stable without yellow focus or legacy chip rebuilds', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    await openInjectionTab(page, 'Order');

    await page.evaluate(() => {
      const original = window.ipmgSetInjectionChipState;
      window.__identityChipBridgeCalls = 0;
      window.ipmgSetInjectionChipState = (patch) => {
        window.__identityChipBridgeCalls += 1;
        return original?.(patch);
      };
    });

    const name = panel.locator('input[placeholder="Last, First"]');
    await name.click();
    await name.pressSequentially('Smooth, Alex', { delay: 15 });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Smooth, Alex');
    await expect(page.locator('#ptName')).toHaveValue('Smooth, Alex');
    await expect.poll(() => name.evaluate((input) =>
      getComputedStyle(input.closest('.wfp-field')).backgroundColor,
    )).not.toBe('rgb(255, 244, 188)');

    const dob = panel.locator('input[placeholder="MM/DD/YYYY"]');
    await dob.click();
    await dob.pressSequentially('01021990', { delay: 15 });
    await expect(dob).toBeFocused();
    await expect(dob).toHaveValue('01/02/1990');
    await expect(page.locator('#ptDOB')).toHaveValue('01/02/1990');

    // The debounced compatibility flush keeps the legacy print/save fields
    // current but must not rebuild its entire chip workspace for each letter.
    await page.waitForTimeout(600);
    await expect.poll(() => page.evaluate(() => window.__identityChipBridgeCalls)).toBe(0);
  });

  test('requires Vivitrol habitus selection without auto-documenting the suggested technique', async ({ page }) => {
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Vivitrol Habitus',
      medication: 'Vivitrol'
    });

    // The needle panel is reference guidance. It must not silently write a
    // recommended gauge/length into the actual-technique documentation field.
    await openInjectionTab(page, 'Order');
    const technique = panel.locator('.wfp-field:has-text("Needle / technique") input');
    await expect(technique).toHaveValue('');

    await openInjectionTab(page, 'Verification');
    for (const label of [
      'VIVITROL reconstitution and suspension check completed',
      'Current opioid-risk / provider plan verified',
      'Naltrexone/hepatic review verified',
      'Supplied needle / body-habitus check'
    ]) {
      await panel.locator('label.wfp-option-row', { hasText: label }).click();
    }
    await openInjectionTab(page, 'Outcome');
    const administeredDisposition = panel.locator('label.wfp-option-row', {
      hasText: 'Review complete — document administration'
    });
    await administeredDisposition.click();
    await expect(administeredDisposition).toHaveClass(/is-selected/);

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeDisabled();
    await expect(finish).toHaveAttribute('title', /habitus/i);

    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('[data-needle-unresolved]')).toContainText(
      'body habitus to be assessed before each injection'
    );
    await panel.locator('label.wfp-needle-band-option', { hasText: 'Average' }).click();
    await expect(panel.locator('input[name="inj-habitus"]:checked')).toHaveCount(1);
    await expect(panel.locator('[data-needle-unresolved]')).toHaveCount(0);

    await openInjectionTab(page, 'Order');
    await expect(technique).toHaveValue('');
    await openInjectionTab(page, 'Outcome');
    // Changing a material administration fact clears a prior review choice so
    // it must be explicitly reconfirmed against the resolved needle guidance.
    await expect(administeredDisposition).not.toHaveClass(/is-selected/);
    await administeredDisposition.click();
    await expect(administeredDisposition).toHaveClass(/is-selected/);
    await expect(finish).toBeEnabled();

    // Recommendations remain separate from actual technique documentation
    // across the typed-to-legacy draft bridge.
    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(actions).toContainText('Draft saved');
    await actions.locator('[data-injection-new]').click();
    await page.getByRole('button', { name: /Open saved local records/ }).click();
    await page.getByRole('button', { name: /Resume draft for QA, Vivitrol Habitus/ }).click();
    await openInjectionTab(page, 'Order');
    await expect(technique).toHaveValue('');
  });

  test('does not invent a numeric needle angle for Uzedy', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Uzedy' });
    await panel.locator('select[name="inj-dose"]').selectOption('100 mg');
    await panel.locator('input[name="inj-route"]').fill('SubQ');
    await openInjectionTab(page, 'Administration');

    const needle = panel.getByRole('group', { name: 'Needle and technique' });
    await expect(needle).toBeVisible();
    await expect(needle.locator('.wfp-needle-readout-label', { hasText: /^Angle$/ })).toHaveCount(0);
    await expect(needle).not.toContainText('45–90°');
  });

  test('keeps Other timing manual and preserves an explicit return date through a local draft', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Other Manual Return');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await setProvider(panel, 'QA Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('.wfp-field:has-text("Medication name") input').fill('QA manual product');
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    // A generic cadence may be recorded from the order, but it must never
    // create a calculated target for an uncatalogued product.
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await fillDate(
      panel
        .locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]'),
      '2026-08-14'
    );

    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await expect(registerMarker(register)).toHaveText('PENDING');
    await expect(registerValue(register, 'Next dose due')).toHaveText('—');
    await expect(registerNote(register, 'Next dose due')).toContainText(
      'enter the return date from the active order'
    );
    await expect(register).not.toContainText('CALC');
    await register.getByRole('button', { name: 'Set return date…' }).click();

    const returnDate = page.getByRole('dialog', { name: 'Record ordered return date' });
    await expect(returnDate).toContainText('No product-specific calculated target applies');
    await fillDate(returnDate.getByLabel('Return date'), '2026-09-11');
    await returnDate
      .locator('.wfp-field', { hasText: 'Reason / order context' })
      .locator('textarea')
      .fill('Active order directs this return date');
    await returnDate.getByRole('button', { name: 'Record return date', exact: true }).click();

    await expect(registerMarker(register)).toHaveText('OVR');
    await expect(registerValue(register, 'Next dose due')).toHaveText('09/11/26');
    await expect(registerNote(register, 'Next dose due')).toContainText(
      'Active order directs this return date'
    );
    // Renaming the free-text product must not route through the legacy
    // select-medication reset path and erase an already documented return
    // date/provenance.
    await panel.locator('.wfp-field:has-text("Medication name") input').fill('QA renamed manual product');
    await expect(registerValue(register, 'Next dose due')).toHaveText('09/11/26');
    await expect(registerNote(register, 'Next dose due')).toContainText(
      'Active order directs this return date'
    );
    // A custom-name edit invokes legacy medication selection under the hood.
    // The typed date must be written back after that bridge reset so neither
    // the legacy worksheet nor the resumed typed draft loses the order date.
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('nextDate')?.value ?? ''
    )).toBe('2026-09-11');
    await expect.poll(() => page.evaluate(() => {
      window.renderInjectionWorksheet(false);
      return document.querySelector('#injWorksheetSheet')?.textContent ?? '';
    })).toMatch(/09\/11\/2026/);

    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(actions).toContainText('Draft saved');
    await actions.locator('[data-injection-new]').click();
    await page.getByRole('button', { name: /Open saved local records/ }).click();
    await page.getByRole('button', { name: /Resume draft for QA, Other Manual Return/ }).click();

    await openInjectionTab(page, 'Order');
    await expect(panel.locator('.wfp-field:has-text("Medication name") input')).toHaveValue(
      'QA renamed manual product'
    );
    const resumedRegister = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await expect(registerMarker(resumedRegister)).toHaveText('OVR');
    await expect(registerValue(resumedRegister, 'Next dose due')).toHaveText('09/11/26');
    await expect(registerNote(resumedRegister, 'Next dose due')).toContainText(
      'Active order directs this return date'
    );
    await expect.poll(() => page.evaluate(() =>
      document.getElementById('nextDate')?.value ?? ''
    )).toBe('2026-09-11');
    await expect.poll(() => page.evaluate(() => {
      window.renderInjectionWorksheet(false);
      return document.querySelector('#injWorksheetSheet')?.textContent ?? '';
    })).toMatch(/09\/11\/2026/);
  });

  test('retains a provenance-free Other legacy return date for review instead of calculating it', async ({ page }) => {
    const patient = 'QA, Other Legacy Return';
    const panel = await prepareRoutineInjection(page, { patient });

    await openInjectionTab(page, 'Order');
    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await expect(registerMarker(register)).toHaveText('OVR');
    await expect(registerValue(register, 'Next dose due')).toHaveText('08/27/26');

    // Save a normal current-format draft, then start a genuinely blank record
    // before changing the saved snapshot. This prevents the still-mounted
    // typed editor from racing the historical fixture back to current
    // provenance while we exercise the legacy restore boundary.
    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(actions).toContainText('Draft saved');
    await actions.locator('[data-injection-new]').click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    // This is the actual v4 legacy shape: a visible legacy #nextDate, but no
    // provenance and no retCustom flag. Mutate the already-saved historical
    // snapshot (and browser storage used by the record list) directly.
    const legacyShapePrepared = await page.evaluate((patientName) => {
      const records = window.IPMGRecords?.list?.() ?? [];
      const record = records.find((entry) => entry?.patient?.name === patientName);
      if (!record?.snapshot) return null;
      record.snapshot.documentation = { ...(record.snapshot.documentation ?? {}) };
      delete record.snapshot.documentation.nextDose;
      record.snapshot.state = {
        ...(record.snapshot.state ?? {}),
        retCustom: false,
      };
      record.snapshot.fields = {
        ...(record.snapshot.fields ?? {}),
        nextDate: '2026-08-27',
      };
      localStorage.setItem('ipmgMedAssistInjectionRecordsV1', JSON.stringify(records));
      const snapshot = record.snapshot;
      return {
        nextDose: snapshot?.documentation?.nextDose ?? null,
        retCustom: snapshot?.state?.retCustom ?? null,
      };
    }, patient);
    expect(legacyShapePrepared).toEqual({ nextDose: null, retCustom: false });
    await page.getByRole('button', { name: /Open saved local records/ }).click();
    await page.getByRole('button', { name: new RegExp(`Resume draft for ${patient}`) }).click();

    await openInjectionTab(page, 'Order');
    const restoredRegister = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await expect(registerMarker(restoredRegister)).toHaveText('REVIEW');
    await expect(registerVerdict(restoredRegister)).toHaveText('NEEDS REVIEW');
    await expect(registerValue(restoredRegister, 'Next dose due')).toHaveText('08/27/26');
    await expect(registerNote(restoredRegister, 'Next dose due')).toContainText(
      'legacy return date — verify against the active order'
    );
    await expect(restoredRegister).not.toContainText('CALC');
    await expect.poll(() => page.evaluate(() =>
      window.ipmgLegacyClinicalStateSnapshot().injection.documentation?.nextDose ?? null
    )).toBeNull();
    await expect.poll(() => page.evaluate(() => {
      window.renderInjectionWorksheet(false);
      return document.querySelector('#injWorksheetSheet')?.textContent ?? '';
    })).toMatch(/legacy return date.*verify active order/i);
    // A retained historical date is useful for staff review, but it cannot be
    // presented to the patient as an approved next injection before manual
    // active-order provenance is documented.
    await expect.poll(() => page.evaluate(() => {
      window.renderAVS();
      return document.querySelector('#avsSheet')?.textContent ?? '';
    })).toMatch(/not (?:been )?scheduled|call to schedule|unscheduled|verify active order/i);
    await expect.poll(() => page.evaluate(() => {
      window.renderAVS();
      return document.querySelector('#avsSheet')?.textContent ?? '';
    })).not.toMatch(/08\/27\/(?:20)?26/);

    // The legacy date stays visible, but it is not an authorized return
    // target. Once the disposition is otherwise ready, that missing active-
    // order provenance is the blocker the operator must resolve.
    await openInjectionTab(page, 'Outcome');
    const administeredDisposition = panel.locator('label.wfp-option-row', {
      hasText: 'Review complete — document administration'
    });
    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(administeredDisposition).toHaveClass(/is-disabled/);
    await expect(administeredDisposition).toHaveAttribute(
      'title',
      /Record the Other return date from the active order or provider direction/i
    );
    await expect(finish).toBeDisabled();

    await openInjectionTab(page, 'Order');
    await restoredRegister.getByRole('button', { name: 'Set return date…' }).click();
    const returnDate = page.getByRole('dialog', { name: 'Record ordered return date' });
    await returnDate
      .locator('.wfp-field', { hasText: 'Reason / order context' })
      .locator('textarea')
      .fill('Active order return date confirmed after legacy draft review');
    await returnDate.getByRole('button', { name: 'Record return date', exact: true }).click();
    await expect(registerMarker(restoredRegister)).toHaveText('OVR');

    await openInjectionTab(page, 'Outcome');
    await expect(administeredDisposition).not.toHaveClass(/is-selected/);
    await administeredDisposition.click();
    await expect(finish).toBeEnabled();
  });

  test('mirrors and restores the Haldol visual-inspection verification through the legacy draft bridge', async ({ page }) => {
    const patient = 'QA, Haldol Visual Inspection';
    const panel = await prepareRoutineInjection(page, {
      patient,
      medication: 'Haldol Dec.'
    });

    await openInjectionTab(page, 'Verification');
    const inspection = panel.getByRole('checkbox', {
      name: 'HALDOL DECANOATE solution inspection completed'
    });
    await expect(inspection).not.toBeChecked();
    await inspection.check();
    await expect(inspection).toBeChecked();
    await expect.poll(() => page.evaluate(() =>
      window.ipmgLegacyClinicalStateSnapshot().injection
    )).toMatchObject({
      medicationKey: 'haldol',
      verifications: { visualInspection: true }
    });

    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(actions).toContainText('Draft saved');
    await actions.locator('[data-injection-new]').click();
    await page.getByRole('button', { name: /Open saved local records/ }).click();
    await page.getByRole('button', { name: new RegExp(`Resume draft for ${patient}`) }).click();

    await openInjectionTab(page, 'Order');
    await expect(panel.locator('.wfp-field:has-text("Needle / technique") input')).toHaveValue('');
    await openInjectionTab(page, 'Verification');
    await expect(
      panel.getByRole('checkbox', {
        name: 'HALDOL DECANOATE solution inspection completed'
      })
    ).toBeChecked();
    await expect.poll(() => page.evaluate(() =>
      window.ipmgLegacyClinicalStateSnapshot().injection.verifications.visualInspection
    )).toBe(true);
  });

  test('keeps an expected-date Vivitrol administration neutral and allows attestation', async ({ page }) => {
    const panel = await prepareScheduledVivitrol(page, {
      patient: 'QA, Vivitrol Due',
      priorDoseDate: '2026-07-17',
      administrationDate: '2026-08-14',
      nextDoseDate: '2026-09-11'
    });

    await openInjectionTab(page, 'Schedule');
    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    // State reaches the operator three ways, and all three must agree: the
    // spine class, the verdict word, and the band sentence. Colour alone would
    // be unreadable to a staff member with red/green deficiency.
    await expect(register).toHaveClass(/is-ok/);
    await expect(register).not.toHaveClass(/is-warning/);
    await expect(registerVerdict(register)).toHaveText('ON SCHEDULE');
    await expect(registerBand(register)).toContainText('On schedule.');
    // The window the old banner spelled out in prose is now a labeled row, in
    // the same MM/DD/YY the typed date fields use.
    await expect(registerValue(register, 'Window')).toHaveText('08/11/26 – 08/21/26');
    await expect(registerNote(register, 'Window')).toContainText('expected 08/14/26');
    await expect(registerFlag(register, 'Days since prior')).toHaveText('IN WINDOW');
    await expect(
      panel.getByRole('button', { name: 'Document provider approval / late-dose review' })
    ).toHaveCount(0);
    await expect(
      panel.locator('.wfp-operator-guidance-action', { hasText: 'Verify timing' })
    ).toHaveCount(0);
    await expect(
      panel.locator('.wfp-operator-guidance-action', { hasText: 'expected q4 wk date' })
    ).toHaveCount(0);

    await openInjectionTab(page, 'Outcome');
    const administeredDisposition = panel.locator('label.wfp-option-row', {
      hasText: 'Review complete — document administration'
    });
    await administeredDisposition.click();
    await expect(administeredDisposition).toHaveClass(/is-selected/);
    await expect(administeredDisposition).toHaveCSS(
      'background-color',
      'rgb(235, 240, 239)'
    );
    await expect(administeredDisposition).toHaveCSS(
      'border-left-color',
      'rgb(34, 116, 66)'
    );
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
      'Administration documented'
    );
    await expect(page.locator('#outAS')).toContainText(
      'within expected maintenance interval'
    );

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
  });

  test('keeps the final configured Vivitrol window day neutral', async ({ page }) => {
    const panel = await prepareScheduledVivitrol(page, {
      patient: 'QA, Vivitrol Window Edge',
      priorDoseDate: '2026-07-17',
      administrationDate: '2026-08-21',
      nextDoseDate: '2026-09-18'
    });

    await openInjectionTab(page, 'Schedule');
    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    await expect(register).toHaveClass(/is-ok/);
    await expect(registerVerdict(register)).toHaveText('ON SCHEDULE');
    await expect(registerBand(register)).toContainText('On schedule.');
    // The last day of the window is still inside it: the flag must not read
    // "1 DAYS LATE" on the boundary.
    await expect(registerValue(register, 'Window')).toHaveText('08/11/26 – 08/21/26');
    await expect(registerFlag(register, 'Days since prior')).toHaveText('IN WINDOW');
    await expect(
      panel.getByRole('button', { name: 'Document provider approval / late-dose review' })
    ).toHaveCount(0);
    await expect(
      panel.locator('.wfp-operator-guidance-action', { hasText: 'Verify timing' })
    ).toHaveCount(0);
    await expect(
      panel.locator('.wfp-operator-guidance-action', { hasText: 'expected q4 wk date' })
    ).toHaveCount(0);
  });

  test('documents context-bound provider approval for an overdue Vivitrol dose and carries it into the note', async ({ page }) => {
    const panel = await prepareScheduledVivitrol(page, {
      patient: 'QA, Vivitrol Overdue',
      priorDoseDate: '2026-07-17',
      administrationDate: '2026-08-22',
      nextDoseDate: '2026-09-19'
    });

    await openInjectionTab(page, 'Schedule');
    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    // Overdue is amber, not red: the engine classifies a late dose as needing
    // provider review and reserves its hard stop for a date that cannot be
    // true. The register reports that severity rather than escalating it.
    await expect(register).toHaveClass(/is-warning/);
    await expect(registerVerdict(register)).toHaveText('OVERDUE');
    await expect(registerBand(register)).toContainText('Late — needs provider review.');
    await expect(registerFlag(register, 'Days since prior')).toHaveText('1 DAY LATE');
    await expect(
      panel.getByRole('button', { name: 'Document provider approval / late-dose review' })
    ).toBeVisible();

    await openInjectionTab(page, 'Outcome');
    const reviewDialog = page.getByRole('dialog', { name: 'Late-dose review' });
    await expect(reviewDialog).toBeVisible();
    await reviewDialog.getByRole('textbox', { name: 'Approving provider' })
      .fill('A. Provider, PMHNP');
    await fillDate(
      reviewDialog.getByLabel('Approval / decision time'), '2026-08-22T09:05');
    await reviewDialog.getByRole('textbox', { name: 'Approval direction / context' })
      .fill('Proceed today per active order.');
    await reviewDialog.getByRole('button', { name: 'Record review', exact: true }).click();
    await expect(reviewDialog).toBeHidden();

    await panel
      .locator('label.wfp-option-row', { hasText: 'Review complete — document administration' })
      .click();
    await expect(page.locator('#outAS')).toContainText(
      'Provider approval documented: A. Provider, PMHNP; decision Aug 22, 2026 at 9:05 AM; direction: Proceed today per active order.'
    );

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect.poll(() => page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
      return records.find(record => record?.patient?.name === 'QA, Vivitrol Overdue')
        ?.snapshot?.documentation;
    })).toMatchObject({
      lateDoseReview: 'provider-authorized',
      lateDoseReviewProvider: 'A. Provider, PMHNP',
      lateDoseReviewTime: '2026-08-22T09:05',
      lateDoseReviewNote: 'Proceed today per active order.'
    });
  });

  test('boots in a clearly local environment and exposes the local EMR record list', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('.cd2004-shell')).toBeVisible();
    await expect(page.locator('.cd2004-app-title')).toContainText('MA Workstation');
    await expect(page.locator('.cd2004-app-title small')).toHaveText('WKL');
    await expect(page.locator('.cd2004-app-environment')).toContainText('Local only');
    await expect(page.locator('.cd2004-app-environment')).not.toContainText('LIVE');
    const chartBanner = page.locator('.cd2004-patient-banner');
    await expect(chartBanner).toHaveClass(/is-no-active-chart/);
    await expect(chartBanner).not.toHaveClass(/has-active-chart/);
    await expect(chartBanner).toContainText('No patient selected');
    await expect(chartBanner.getByRole('button', { name: 'Open Notes' })).toBeVisible();
    await openWorkflow(page, 'administer');

    // The persistent Open Notes rail is the one compact navigator. There is
    // intentionally no duplicate top Save / Records / Note command toolbar.
    await expect(page.locator('[role="toolbar"][aria-label="Clinical commands"]')).toHaveCount(0);
    const drawerLauncher = page.getByRole('button', {
      name: /Open saved local records \(F11\)/
    });
    await expect(drawerLauncher).toBeVisible();
    await drawerLauncher.click();

    const drawer = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    // The records window is a native <dialog> opened with showModal(), so the
    // platform inerts the background instead of an author setting .inert on
    // the shell. Assert the guarantee itself: it is the modal, and a control
    // behind it genuinely cannot take focus.
    await expect.poll(() =>
      page.locator('.records-drawer-layer').evaluate(node => node.matches(':modal'))
    ).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const behind = document.querySelector('.cd2004-nav-item');
      behind?.focus();
      return document.activeElement === behind;
    })).toBe(false);
    await expect(page.locator('[data-records-filter="draft"]')).toBeVisible();
    // The records list is a centred modal selection window, not an edge
    // drawer, so the contract is that it sits centred in its layer - equal
    // gap on both sides - rather than flush to the right edge.
    await expect.poll(() => drawer.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const layerBounds = node.parentElement.getBoundingClientRect();
      const leftGap = bounds.left - layerBounds.left;
      const rightGap = layerBounds.right - bounds.right;
      return Math.round(Math.abs(leftGap - rightGap));
    })).toBeLessThanOrEqual(1);

    const drawerVisual = await drawer.evaluate(node => {
      const style = getComputedStyle(node);
      const headerStyle = getComputedStyle(node.querySelector('.records-drawer-head'));
      const searchStyle = getComputedStyle(
        node.querySelector('#recordsDrawerSearch')
      );
      return {
        borderRadius: Number.parseFloat(style.borderRadius),
        fontFamily: style.fontFamily,
        headerBackground: headerStyle.backgroundImage,
        searchRadius: Number.parseFloat(searchStyle.borderRadius),
        horizontalOverflow: node.scrollWidth - node.clientWidth
      };
    });
    expect(drawerVisual.borderRadius).toBeLessThanOrEqual(2);
    expect(drawerVisual.searchRadius).toBeLessThanOrEqual(2);
    expect(drawerVisual.fontFamily).toContain('Inter Variable');
    expect(drawerVisual.headerBackground).toContain('linear-gradient');
    expect(drawerVisual.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(await maxMotionMilliseconds(drawer, 'transitionDuration'))
      .toBeLessThanOrEqual(180);

    const drawerClose = page.locator('.records-drawer-close');
    const drawerNew = page.locator('[data-records-new]');
    await drawerClose.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(drawerNew).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawerClose).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    // No inverse focusability probe here: focusing a background control to
    // prove it is reachable would itself steal the focus that the next
    // assertion checks was restored to the launcher.
    await expect(drawerLauncher).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test('uses the keyboard-accessible MEDITECH record list, launchers, and workflow routing', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');
    const navigator = page.locator('.cd2004-navigator');
    const home = page.locator('.cd2004-nav-item[title="Dashboard"]');
    const administer = page.locator('.cd2004-nav-item[title="Injection"]');

    await expect(navigator).toHaveAttribute(
      'aria-label',
      'Open Notes and clinical functions'
    );
    await expect(navigator.locator('.cd2004-nav-item')).toHaveCount(8);
    await expect(home).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Alt+2');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(administer).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#panel-administer')).toHaveClass(/on/);
    await expect(navigator.locator('[aria-current="page"]')).toHaveCount(1);

    await page.evaluate(() => {
      window.__ipmgTabChanges = 0;
      document.addEventListener('ipmg:tabchange', () => { window.__ipmgTabChanges += 1; });
    });
    await openWorkflow(page, 'home');
    await page.locator('.cd2004-nav-item[title="UDS"]').click();
    await expect(shell).toHaveAttribute('data-active-workflow', 'uds');
    await expect.poll(() => page.evaluate(() => window.__ipmgTabChanges)).toBe(2);

    await openWorkflow(page, 'samples');
    const workBody = page.locator('.cd2004-work-window .cd2004-window-body');
    const savedScroll = await workBody.evaluate(node => {
      node.scrollTop = Math.min(1200, Math.max(0, node.scrollHeight - node.clientHeight));
      return node.scrollTop;
    });
    await openWorkflow(page, 'uds');
    await expect.poll(() => workBody.evaluate(node => node.scrollTop)).toBeLessThan(220);
    await openWorkflow(page, 'samples');
    await expect.poll(() =>
      workBody.evaluate((node, expected) => Math.abs(node.scrollTop - expected), savedScroll)
    ).toBeLessThan(80);
  });

  test('keeps module codes, field states, and blank-record commands honest', async ({ page }) => {
    await page.goto('/');
    const transactionCode = page.locator('.cd2004-app-title small');
    await expect(transactionCode).toHaveText('WKL');

    await openWorkflow(page, 'administer');
    await expect(transactionCode).toHaveText('INJ');
    await expect(page.getByRole('heading', { name: 'Injection worksheet', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Patient & ordering provider', level: 2 })).toBeVisible();
    const injectionReason = page.getByLabel('Encounter type', { exact: true });
    await expect(injectionReason).toHaveAttribute('aria-required', 'true');
    // ENTRY is the default source and no longer draws a chip; the provenance
    // attribute is the contract that survived.
    const patientNameField = page.locator('.wfp-field[data-field-path="patient.name"]');
    await expect(patientNameField).toHaveAttribute('data-field-source', 'ENTRY');
    await expect(patientNameField.locator('.wfp-register-source')).toHaveCount(0);
    const orderingProvider = page.locator(
      '.wfp-field[data-field-path="orderingProvider"]'
    );
    await expect(orderingProvider).toHaveAttribute('data-field-source', 'ENTRY');
    await expect(orderingProvider.locator('.wfp-register-source')).toHaveCount(0);
    // The ordering provider is a register, so its prompt names the register and
    // F9 genuinely applies. It must still say where the name comes from.
    await providerControl(orderingProvider).locator('select').focus();
    await expect(page.locator('.cd2004-status-message')).toContainText(
      'named on the active order'
    );
    await expect(page.locator('[data-injection-record-actions]')).not.toContainText(
      'Enter the signed-in documenting staff'
    );

    await openWorkflow(page, 'uds');
    await expect(transactionCode).toHaveText('UDS');
    const panel = page.locator('.wfp-panel');
    await expect(page.locator('.meditech-patient-safety')).toContainText(
      'UDS — Not started'
    );
    await expect(
      page.locator('.meditech-command-deck button').filter({ hasText: 'F9' })
    ).toContainText('Lookup');
    await expect(panel.getByRole('button', { name: 'Add to daily log' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(
      panel.locator('.wfp-field[data-field-path="patient.name"]')
    ).toHaveAttribute('data-field-source', 'ENTRY');

    await panel.getByLabel('Encounter type', { exact: true }).selectOption('routine');
    await expect(panel.locator('.wfp-transaction-readout b')).toHaveText('Incomplete');
    await expect(panel.locator('.wfp-field[data-field-path="patient.name"]'))
      .toHaveAttribute('data-requirement', 'required');
    await expect(panel.locator('.wfp-field[data-field-path="patient.name"] input'))
      .toHaveAttribute('aria-required', 'true');
    await expect(panel.getByRole('button', { name: 'Log as needs review' })).toBeEnabled();
  });

  test('uses field-owned F9 lookups and evaluator-stamped transaction ledgers', async ({ page }) => {
    await page.setViewportSize({ width: 840, height: 720 });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    const reason = panel.getByLabel('Encounter type', { exact: true });
    const orderTab = panel.getByRole('tab', { name: 'Order & Timing', exact: true });
    const f8 = page.locator('.meditech-command-deck button').filter({ hasText: 'F8' });
    const f9 = page.locator('.meditech-command-deck button').filter({ hasText: 'F9' });

    await expect(orderTab.locator('.wfp-ledger-state')).toHaveText('PEND');
    await reason.focus();
    await expect(page.locator('.cd2004-status-message')).toContainText(
      'INJ-REASON | Encounter type'
    );
    await expect(page.locator('.meditech-command-prompt')).toContainText('INJ-REASON');
    await expect(f9).toContainText('Field values');
    await expect(
      panel.getByRole('button', { name: 'Open Encounter type field lookup (F9)' })
    ).toBeVisible();

    await f9.click();
    const lookup = page.getByRole('dialog', { name: 'INJ FIELD LOOKUP · INJ-REASON' });
    await expect(lookup).toBeVisible();
    const lookupBox = await lookup.locator('.cd2004-dialog-frame').boundingBox();
    expect(lookupBox).not.toBeNull();
    expect(lookupBox.x).toBeGreaterThanOrEqual(0);
    expect(lookupBox.x + lookupBox.width).toBeLessThanOrEqual(840);
    await expect.poll(() => lookup.locator('.cd2004-lookup-results').evaluate(node =>
      node.scrollWidth - node.clientWidth
    )).toBeLessThanOrEqual(1);
    await expect(lookup.getByRole('option')).toHaveCount(5);
    await lookup.getByRole('searchbox', { name: 'Find value' }).fill('PRN');
    await lookup.getByRole('option', { name: /PRN \/ ordered/ }).click();

    await expect(reason).toHaveValue('prn');
    await expect(reason).toBeFocused();
    await expect(page.locator('.cd2004-status-message')).toContainText(
      'INJ-REASON filed as PRN / ordered.'
    );
    await expect(orderTab).toHaveClass(/is-stop/);
    await expect(orderTab.locator('.wfp-ledger-state')).toContainText('STOP');
    await expect(f8).toContainText('Next stop');

    // Reconfirming the current lookup row is a no-op. It must not emit the
    // material change event that can invalidate downstream disposition and
    // attestation state in a completed transaction.
    await reason.evaluate((control) => {
      window.__ipmgLookupChangeCount = 0;
      control.addEventListener('change', () => {
        window.__ipmgLookupChangeCount += 1;
      });
    });
    await panel.getByRole('button', { name: 'Open Encounter type field lookup (F9)' }).click();
    await expect(page.locator('.meditech-command-prompt')).toContainText('INJ-REASON');
    const currentLookupRow = lookup.getByRole('option', {
      name: /05 PRN \/ ordered CURRENT/
    });
    await expect(currentLookupRow).toHaveAttribute('aria-selected', 'true');
    await expect(currentLookupRow).toHaveCSS('background-color', 'rgb(255, 240, 165)');
    await lookup.getByRole('searchbox', { name: 'Find value' }).press('Enter');
    await expect(reason).toHaveValue('prn');
    await expect(page.locator('.cd2004-status-message')).toContainText(
      'INJ-REASON unchanged — PRN / ordered remains selected.'
    );
    await expect.poll(() => page.evaluate(() => window.__ipmgLookupChangeCount)).toBe(0);

    await openWorkflow(page, 'uds');
    const udsPanel = page.locator('.wfp-panel');
    const specimenTab = udsPanel.getByRole('tab', { name: 'Specimen', exact: true });
    await expect(specimenTab.locator('.wfp-ledger-state')).toHaveText('PEND');
    await signInLocalStaff(page, 'Alex Rivera, MA');
    await udsPanel.getByLabel('Encounter type', { exact: true }).selectOption('routine');
    await expect(specimenTab).toHaveClass(/is-stop/);
    await expect(specimenTab.locator('.wfp-ledger-state')).toContainText('STOP');

    await udsPanel.getByRole('button', { name: 'Use signed-in staff', exact: true }).click();
    const collectorField = udsPanel.locator('.wfp-field[data-field-path="collector"]');
    await expect(collectorField.locator('.wfp-register-source')).toHaveText('SESSION');
    await udsPanel.getByLabel('Collected by', { exact: true }).fill('Jordan Lee, MA');
    await expect(collectorField.locator('.wfp-register-source')).toHaveText('OVR');
    await expect(collectorField.locator('.wfp-register-change')).toHaveText('CHG');
  });

  test('keeps each local activity in one Dashboard queue register', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-03T10:30:00-07:00'));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem(
        'ipmgMedAssistActivityLog_2026-08-03',
        JSON.stringify([
          {
            time: '9:18 AM',
            type: 'injection',
            status: 'completed',
            pt: 'Rivera, Jordan',
            summary: 'Routine administration completed'
          },
          {
            time: '9:42 AM',
            type: 'uds',
            status: 'needs_review',
            pt: 'Chen, Avery',
            summary: 'Preliminary result requires review'
          },
          {
            time: '10:06 AM',
            type: 'sample',
            status: 'completed',
            pt: 'Morgan, Casey',
            summary: 'Package traceability complete'
          }
        ])
      );
    });
    await page.goto('/');

    const workQueue = page.locator('.cd2004-worklist-table');
    await expect(page.getByRole('heading', { name: 'Open Notes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /All work/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Needs review/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Drafts/ })).toBeVisible();
    await expect(workQueue.getByText('Chen, Avery', { exact: true })).toHaveCount(1);
    await expect(workQueue.locator('tbody tr')).toHaveCount(3);
    await page.getByRole('tab', { name: /Needs review/ }).click();
    await expect(workQueue.locator('tbody tr')).toHaveCount(1);
    // Phase 3: the whole row opens the note, so there is no trailing Review /
    // Resume / View button any more. The row's accessible target is the
    // patient button in the first cell, which is what a keyboard or screen
    // reader user activates.
    await expect(workQueue.getByRole('button', { name: 'Chen, Avery' })).toBeVisible();
    await expect(workQueue.locator('.cd2004-note-chip')).toHaveText('Needs review');
    await expect(page.locator('.cd2004-activity-list')).toHaveCount(0);
  });

  test('keeps desktop menus single-open and restores focus on escape', async ({ page }) => {
    await page.goto('/');
    // Real ARIA menubar rather than <details>: open state is aria-expanded on
    // each menu's title button, so the whole bar can act as one tracking unit.
    const fileTitle = page.locator('.cd2004-menu[data-menu="file"] .cd2004-menu-title');
    const chartTitle = page.locator('.cd2004-menu[data-menu="chart"] .cd2004-menu-title');
    const openTitles = page.locator('.cd2004-menu-title[aria-expanded="true"]');

    await fileTitle.click();
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'true');
    await chartTitle.click();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'true');
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');
    await expect(openTitles).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'false');
    await expect(chartTitle).toBeFocused();

    await fileTitle.click();
    await page.locator('.cd2004-app-title').click();
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');
  });

  test('tracks the menu bar: hovering a sibling switches menus once open', async ({ page }) => {
    await page.goto('/');
    const fileTitle = page.locator('.cd2004-menu[data-menu="file"] .cd2004-menu-title');
    const chartTitle = page.locator('.cd2004-menu[data-menu="chart"] .cd2004-menu-title');

    // Hovering alone does nothing while the bar is idle.
    await chartTitle.hover();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'false');

    // Once any menu is open the bar is in tracking mode, so hovering a
    // sibling switches to it without a second click - native menu behavior.
    await fileTitle.click();
    await chartTitle.hover();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'true');
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');

    // Alt+access key opens a menu directly; arrows move along the bar.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+t');
    await expect(
      page.locator('.cd2004-menu[data-menu="tools"] .cd2004-menu-title')
    ).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('.cd2004-menu[data-menu="help"] .cd2004-menu-title')
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('keeps the navigator fixed and adds document context only inside a clinical workflow', async ({ page }) => {
    await page.goto('/');
    // The MEDITECH-style right verb strip is persistent; documentation stays
    // inside the central child workspace instead of occupying that rail.
    const navigator = page.locator('.cd2004-navigator');
    const work = page.locator('.cd2004-work-window');
    const inspector = page.locator('.cd2004-inspector-window');

    // The Dashboard is a single worklist surface. A clinical worksheet then
    // owns the work and document-review pair without redundant window chrome.
    await expect(navigator).toBeVisible();
    await expect(navigator.getByText('Clinical Work', { exact: true })).toBeVisible();
    await expect(navigator.getByText('Resources', { exact: true })).toBeVisible();
    await expect(navigator.getByText('Closeout', { exact: true })).toBeVisible();
    await expect(navigator.locator('.cd2004-nav-item > i')).toHaveCount(0);
    await expect(navigator.locator('.meditech-nav-icon svg')).toHaveCount(8);
    await expect(work).toBeVisible();
    await expect(inspector).toHaveCount(0);
    await expect(page.locator('.cd2004-caption-button')).toHaveCount(0);

    await openWorkflow(page, 'uds');
    await expect(navigator).toBeVisible();
    await expect(work).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('.cd2004-window-title')).toContainText(
      'Clinical Documentation'
    );
    await expect(inspector.locator('.cd2004-note-mode')).toHaveText('READ ONLY · LOCAL');
    await expect(navigator.locator('.cd2004-inspector-window')).toHaveCount(0);
  });

  test('routes the Client/Server function-key profile without unsafe global shortcuts', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');
    const deck = page.locator('[role="toolbar"][aria-label="MEDITECH function key commands"]');

    await expect(deck).toBeVisible();
    await expect(deck).toContainText('F1');
    await expect(deck).toContainText('F6');
    await expect(deck).toContainText('F7');
    await expect(deck).toContainText('F8');
    await expect(deck).toContainText('F9');
    await expect(deck).toContainText('F11');
    await expect(deck).toContainText('F12');
    await expect(deck).toContainText('Esc');
    await expect(deck).not.toContainText('F3');
    await expect(deck).not.toContainText('F4');
    await expect(deck).not.toContainText('F10');

    await page.keyboard.press('F1');
    const helpDialog = page.getByRole('dialog', { name: 'Keyboard Reference' });
    await expect(helpDialog).toBeVisible();
    await expect(helpDialog).toContainText(/next section/i);
    await expect(helpDialog).toContainText(/previous section/i);
    await expect(helpDialog).toContainText(/next page/i);
    await expect(helpDialog).toContainText(/previous page/i);
    await expect(helpDialog).toContainText(/local record list/i);
    await page.keyboard.press('Escape');
    await expect(helpDialog).toBeHidden();

    // With no clinical stops active, F8 retains the classic zone cycle.
    // Phase 3b: the Dashboard's primary action is Tebra's `New note`, which
    // opens a type menu, rather than a button that could only ever start an
    // injection. `Start new injection` is still the label on the record
    // lifecycle controls, where it names a record operation.
    const startInjection = page.locator('.cd2004-worklist-new');
    await startInjection.focus();
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.meditech-record-list'))
    )).toBe(true);
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.meditech-command-deck'))
    )).toBe(true);
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.cd2004-work-window'))
    )).toBe(true);

    await page.keyboard.press('Alt+2');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    const injectionPanel = page.locator('.wfp-panel');
    const patientName = injectionPanel.locator('input[placeholder="Last, First"]');
    await patientName.fill('QA, Shortcut');
    await injectionPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await setProvider(injectionPanel, 'QA Provider');

    // F6 / Shift+F6 move through the current worksheet's sections, rather
    // than opening records as the retired key map did.
    await patientName.focus();
    const sectionBefore = await page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    );
    await page.keyboard.press('F6');
    const sectionAfter = await page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    );
    expect(sectionAfter).not.toBe(sectionBefore);
    await page.keyboard.press('Shift+F6');
    await expect.poll(() => page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    )).toBe(sectionBefore);

    // F7 / Shift+F7 cycle the selected worksheet page (tab).
    await expect(injectionPanel.getByRole('tab', { name: 'Order & Timing', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('F7');
    await expect(injectionPanel.getByRole('tab', { name: 'Product', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Shift+F7');
    await expect(injectionPanel.getByRole('tab', { name: 'Order & Timing', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    // Once the evaluator has active stops, the same visible F8 key becomes
    // the purposeful Next stop command and lands on the first missing field.
    await patientName.focus();
    await expect(deck.locator('button').filter({ hasText: 'F8' })).toContainText('Next stop');
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      document.activeElement?.getAttribute('name')
    )).toBe('inj-reason');

    // F9 provides the truthful contextual local lookup; F11 is the direct
    // Open Notes accelerator.
    await patientName.focus();
    await page.keyboard.press('F9');
    const drawer = page.locator('.records-drawer-layer');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.keyboard.press('F11');
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await patientName.focus();
    await page.keyboard.press('F12');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // Retired global F3/F4/F10 bindings must be inert; Finish is only the
    // explicit worksheet lifecycle action. Escape cannot navigate home or
    // discard this editable local draft.
    await page.keyboard.press('F3');
    await page.keyboard.press('F4');
    await page.keyboard.press('F10');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.getByRole('dialog', { name: 'Sign' }))
      .toBeHidden();
    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(patientName).toHaveValue('QA, Shortcut');
    await expect(page.locator('[data-injection-record-actions]')).toContainText('Draft saved');
  });

  test('routes typed workflows through the clinical coordinator and files editable drafts with F12', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute(
      'data-clinical-coordinator',
      'active'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-clinical-engines',
      'injection uds samples forms'
    );

    await openWorkflow(page, 'uds');
    const storageBefore = await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return key ? [key, localStorage.getItem(key)] : null;
          }).filter(Boolean)
        )
      )
    );
    await page.keyboard.press('F10');
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );
    await page.keyboard.press('F12');
    await expect(page.locator('.cd2004-status-message')).toHaveText(
      'Draft saving is unavailable in this workflow.'
    );
    expect(await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return key ? [key, localStorage.getItem(key)] : null;
          }).filter(Boolean)
        )
      )
    )).toBe(storageBefore);

    const udsPanel = page.locator('.wfp-panel');
    await udsPanel.locator('select[name="uds-reason"]').selectOption('routine');
    const udsFileCommand = page
      .locator('[role="toolbar"][aria-label="MEDITECH function key commands"]')
      .getByRole('button', { name: 'F12 Save UDS' });
    await expect(udsFileCommand).toBeEnabled();
    await page.keyboard.press('F12');
    await expect(udsPanel.getByRole('region', { name: 'UDS record actions' }))
      .toContainText('Draft saved');
    await expect.poll(() => page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('ipmgMedAssistUdsRecordsV1') || '[]');
      return records.at(0)?.status;
    })).toBe('draft');
  });

  test('keeps non-injection activity logging distinct from the injection lifecycle', async ({ page }) => {
    await page.goto('/');

    await openWorkflow(page, 'uds');
    const blankUdsLog = page.locator('.wfp-panel').getByRole('button', {
      name: 'Add to daily log',
      exact: true,
    });
    await expect(blankUdsLog).toBeVisible();
    await expect(blankUdsLog).toBeDisabled();

    await openWorkflow(page, 'samples');
    const sampleLog = page.locator('.wfp-panel').getByRole('button', {
      name: 'Finalize dispense & add to daily log',
      exact: true,
    });
    await expect(sampleLog).toBeDisabled();
    await expect(sampleLog).toHaveAttribute('title', /Complete the documented safety/i);

    await openWorkflow(page, 'forms');
    await expect(
      page.locator('.wfp-panel').getByRole('button', { name: 'Log as needs review', exact: true })
    ).toBeVisible();

    await openWorkflow(page, 'administer');
    await expect(
      page.locator('.wfp-panel').getByRole('button', { name: 'Add to daily activity', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('[data-injection-record-actions]')).toContainText('New draft');
    await expect(page.locator('[data-injection-record-actions]')).not.toContainText('First blocker:');
  });

  test('projects untouched typed workflows as pending instead of falsely confirmed', async ({ page }) => {
    await page.goto('/');
    const inspector = page.locator('.cd2004-inspector-window');

    await openWorkflow(page, 'administer');
    const injectionPanel = page.locator('.wfp-panel');
    await expect(injectionPanel.locator('select[name="inj-reason"]')).toHaveValue('');
    await expect(
      injectionPanel.locator('.wfp-field', { hasText: 'Encounter type' }).locator('.wfp-req')
    ).toHaveCount(1);

    await openWorkflow(page, 'uds');
    const udsPanel = page.locator('.wfp-panel');
    await expect(udsPanel.locator('select[name="uds-reason"]')).toHaveValue('');
    await expect(
      udsPanel.locator('.wfp-field', { hasText: 'Encounter type' }).locator('.wfp-req')
    ).toHaveCount(1);

    for (const workflow of ['administer', 'uds', 'samples', 'forms']) {
      await openWorkflow(page, workflow);
      const readiness = inspector.locator('.cd2004-readiness-list');
      await expect(readiness.locator('.cd2004-readiness-item')).not.toHaveCount(0);
      await expect(readiness.locator('.cd2004-readiness-item.is-pending')).not.toHaveCount(0);
      await expect(readiness.locator('.cd2004-readiness-item.is-complete')).toHaveCount(0);
      await expect(readiness).not.toContainText('Typed engine shadow');
    }

    await openWorkflow(page, 'administer');
    await expect(page.locator('[data-injection-record-actions]')).toContainText('New draft');
    await expect(page.locator('[data-injection-record-actions]')).not.toContainText('First blocker:');
    await expect(page.locator('[data-injection-record-actions] [data-injection-finish]'))
      .toBeDisabled();
  });

  test('soft-syncs empty workflows and never overwrites a started patient context', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const injectionPanel = page.locator('.wfp-panel');
    await injectionPanel.locator('input[placeholder="Last, First"]').fill('Alpha, Patient');
    await injectionPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    // Once both patient identifiers are present, the persistent masthead is
    // the active patient context even before the local draft is filed. Record
    // persistence remains a separate status in the rail and action bar.
    const patientBanner = page.locator('.cd2004-patient-banner');
    await expect(patientBanner).toHaveClass(/has-active-chart/);
    // --tw-ready-bg. The tint was #c8efbf, a saturated Windows-era green that
    // sits outside the palette; the meaning (an identified patient context) is
    // unchanged and still carries its own word in the banner beside it.
    await expect(patientBanner).toHaveCSS('background-color', 'rgb(230, 242, 238)');
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Facesheet');
    await page.keyboard.press('F12');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
    await expect(patientBanner).toHaveClass(/has-active-chart/);
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Facesheet');
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Alpha, Patient');

    await openWorkflow(page, 'samples');
    const samplesPanel = page.locator('.wfp-panel');
    await expect(page.locator('#samplePtName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#sampleDOB')).toHaveValue('01/02/1990');
    await samplesPanel.locator('input[placeholder="Last, First"]').fill('Bravo, Patient');
    await samplesPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('03/04/1992');

    const mismatch = page.locator('.cd2004-context-mismatch');
    await expect(mismatch).toBeVisible();
    await expect(mismatch).toContainText('Bravo, Patient');
    await expect(patientBanner).toHaveCSS('background-color', 'rgb(255, 241, 188)');
    await mismatch.getByRole('button', { name: 'Make active' }).click();
    await expect(patientBanner).toHaveClass(/has-active-chart/);
    // --tw-ready-bg. The tint was #c8efbf, a saturated Windows-era green that
    // sits outside the palette; the meaning (an identified patient context) is
    // unchanged and still carries its own word in the banner beside it.
    await expect(patientBanner).toHaveCSS('background-color', 'rgb(230, 242, 238)');
    await expect(patientBanner).toContainText('Bravo, Patient');

    await openWorkflow(page, 'uds');
    await expect(page.locator('#udsPtName')).toHaveValue('Bravo, Patient');
    await expect(page.locator('#udsDOB')).toHaveValue('03/04/1992');

    await openWorkflow(page, 'administer');
    await expect(page.locator('#ptName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#ptDOB')).toHaveValue('01/02/1990');
    // Returning to the saved Injection draft restores its own local chart
    // context. There is no longer a competing global-context warning once
    // this record is the active local record.
    await expect(page.locator('.cd2004-context-mismatch')).toHaveCount(0);
    await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/has-active-chart/);
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Alpha, Patient');
  });

  test('honors reduced-motion while preserving all desktop commands', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )).toBe(true);

    const transitionSeconds = await page.locator('.meditech-command-deck button').first().evaluate(node =>
      getComputedStyle(node).transitionDuration
        .split(',')
        .map(value => Number.parseFloat(value) * (value.includes('ms') ? 0.001 : 1))
    );
    expect(Math.max(...transitionSeconds)).toBeLessThanOrEqual(0.001);

    const helpSummary = page.locator('.cd2004-menu[data-menu="help"] .cd2004-menu-title');
    await helpSummary.click();
    // Menu commands are menuitems now, not plain buttons - role="menuitem"
    // overrides the implicit button role, which is the correct ARIA for a menu.
    await page.getByRole('menuitem', { name: 'Keyboard Reference' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard Reference' });
    await expect(dialog).toBeVisible();
    // Opened with the native showModal(), so the platform puts it in the top
    // layer and inerts everything behind it. That is a stronger guarantee than
    // the aria-hidden juggling this previously hand-rolled, and it is what
    // :modal proves - the shell chrome genuinely cannot be reached or focused.
    expect(await dialog.evaluate(node => node.matches(':modal'))).toBe(true);
    expect(await page.evaluate(() => {
      const target = document.querySelector('.cd2004-shell > header button');
      target?.focus();
      return document.activeElement === target;
    })).toBe(false);
    const animationSeconds = await dialog.evaluate(node => {
      const value = getComputedStyle(node).animationDuration;
      return Number.parseFloat(value) * (value.includes('ms') ? 0.001 : 1);
    });
    expect(animationSeconds).toBeLessThanOrEqual(0.001);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(helpSummary).toBeFocused();
    // ...and the shell chrome is reachable again once the dialog closes.
    expect(await page.evaluate(() => {
      const target = document.querySelector('.cd2004-shell > header button');
      target?.focus();
      return document.activeElement === target;
    })).toBe(true);

    const recordsButton = page.getByRole('button', {
      name: /Open saved local records \(F11\)/
    });
    await recordsButton.click();
    const drawer = page.locator('.records-drawer');
    await expect(drawer).toBeVisible();
    expect(await maxMotionMilliseconds(drawer, 'transitionDuration'))
      .toBeLessThanOrEqual(1);
    // The hand-rolled scrim element is gone: the dialog's ::backdrop is the
    // platform's, and a pseudo-element cannot be measured through a locator.
    // The window itself carries the motion contract.
    expect(await maxMotionMilliseconds(drawer, 'animationDuration'))
      .toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(recordsButton).toBeFocused();

    await page.keyboard.press('Alt+3');
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
  });

  test('keeps the Samples tab-folder accessible and scoped to one section at a time', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'samples');
    const panel = page.locator('.wfp-panel');
    const tabs = panel.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('tabpanel')).toContainText('Patient / order');

    const planTab = tabs.filter({ hasText: 'Plan & traceability' });
    await planTab.click();
    await expect(planTab).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'false');
    await expect(panel.getByRole('tabpanel')).toContainText('Package traceability');
    await expect(panel.getByRole('tabpanel')).not.toContainText('Patient / order');

    const reviewTab = tabs.filter({ hasText: 'Safety & review' });
    await reviewTab.click();
    await expect(panel.getByRole('tabpanel')).toContainText('Final dispense review');
  });

  test('blocks mobile layouts without losing an in-progress workstation entry', async ({ page }) => {
    await page.setViewportSize({ width: 840, height: 720 });
    await page.goto('/');
    await expectNoHorizontalPageOverflow(page);

    await openWorkflow(page, 'administer');
    const patientName = page.locator('.wfp-panel input[placeholder="Last, First"]');
    await patientName.fill('QA, Resize Safety');
    await expect(patientName).toHaveValue('QA, Resize Safety');
    await expect(page.locator('.meditech-workstation-gate')).toHaveCount(0);
    await expect(page.locator('.meditech-command-deck')).toBeVisible();
    await expect(page.locator('.meditech-context-rail')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const gate = page.locator('.meditech-workstation-gate');
    await expect(gate).toBeVisible();
    await expect(gate).toBeFocused();
    await expect(gate).toContainText('Workstation view required');
    await expect(gate).toContainText('800 x 600 px');
    await expect(page.locator('.meditech-workstation-content')).toHaveAttribute('inert', '');
    await expect(page.locator('.meditech-workstation-content')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.cd2004-shell')).toBeHidden();
    await expect(page.locator('.cd2004-mobile-switcher')).toHaveCount(0);
    await expect(page.locator('.meditech-mobile-command-surface')).toHaveCount(0);
    await page.keyboard.press('F11');
    await expect(page.locator('.records-drawer')).toBeHidden();
    await expectNoHorizontalPageOverflow(page);

    // Landscape phones are blocked by the workstation's minimum height too.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(gate).toBeVisible();

    // Resizing is a display gate, not a destructive navigation event.
    await page.setViewportSize({ width: 840, height: 720 });
    await expect(gate).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toBeVisible();
    await expect(patientName).toHaveValue('QA, Resize Safety');
  });

  test('keeps Injection and UDS transaction chrome fixed while only the clinical page scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/?fixed-transaction-chrome=1');

    const verifyTransactionChrome = async ({ workflow, facts }) => {
      await openWorkflow(page, workflow);
      const slot = page.locator(`.cd2004-workflow-slot[data-workflow="${workflow}"]`);
      const panel = slot.locator('.wfp-panel');
      const chrome = panel.locator('.wfp-transaction-chrome');
      const tabs = chrome.locator('.wfp-tabbar');
      const clinicalPage = panel.locator('.wfp-transaction-page');
      const actions = slot.locator('.cd2004-record-actions');

      await expect(panel.locator('.wfp-context-strip')).toHaveCount(0);
      await expect(chrome).toBeVisible();
      await expect(tabs).toBeVisible();
      await expect(actions).toBeVisible();
      for (const fact of facts) {
        await expect(chrome.locator(`.wfp-summary-fact[aria-label^="${fact}:"]`)).toBeVisible();
      }

      const scrollCapacity = await clinicalPage.evaluate(
        node => node.scrollHeight - node.clientHeight
      );
      expect(scrollCapacity).toBeGreaterThan(0);
      const before = {
        chrome: await chrome.boundingBox(),
        tabs: await tabs.boundingBox(),
        actions: await actions.boundingBox()
      };

      await clinicalPage.focus();
      await page.keyboard.press('PageDown');
      await expect.poll(() => clinicalPage.evaluate(node => node.scrollTop)).toBeGreaterThan(0);

      const after = {
        chrome: await chrome.boundingBox(),
        tabs: await tabs.boundingBox(),
        actions: await actions.boundingBox()
      };
      for (const key of ['chrome', 'tabs', 'actions']) {
        expect(before[key]).not.toBeNull();
        expect(after[key]).not.toBeNull();
        expect(Math.abs(after[key].y - before[key].y)).toBeLessThanOrEqual(1);
      }
      expect(await slot.evaluate(node => node.scrollTop)).toBe(0);
      expect(await slot.locator(':scope > .cd2004-workflow-body').evaluate(node => node.scrollTop)).toBe(0);
    };

    await verifyTransactionChrome({
      workflow: 'administer',
      facts: ['DUE', 'PKG']
    });
    await verifyTransactionChrome({
      workflow: 'uds',
      facts: ['DEVICE', 'PANELS', 'QC']
    });
  });

  test('keeps every clinical workspace contained at supported workstation widths', async ({ page }) => {
    test.setTimeout(120_000);
    const viewports = [
      { width: 1440, height: 900 },
      { width: 1181, height: 900 },
      { width: 1040, height: 900 },
      { width: 1024, height: 768 },
      { width: 900, height: 700 },
      { width: 840, height: 720 },
      { width: 800, height: 600 }
    ];
    const overflowFailures = [];
    const workflows = [
      ['administer', '.wfp-panel'],
      ['uds', '.wfp-panel'],
      ['samples', '.wfp-panel'],
      ['forms', '.wfp-panel']
    ];

    for (const { width, height } of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?responsive=${width}x${height}`);
      await expectNoHorizontalPageOverflow(page);

      const shellBox = await page.locator('.cd2004-shell').boundingBox();
      expect(shellBox).not.toBeNull();
      expect(shellBox.x).toBeGreaterThanOrEqual(0);
      expect(shellBox.width).toBeLessThanOrEqual(width);

      const commandDeckOverflow = await page
        .locator('.meditech-command-deck')
        .evaluate((deck) => deck.scrollWidth - deck.clientWidth);
      expect(commandDeckOverflow).toBeLessThanOrEqual(1);

      // The Dashboard owns one worklist window. Clinical workflows add the
      // documentation child window throughout the supported desktop range.
      const visibleWindows = page.locator('.cd2004-workspace .cd2004-window:visible');
      await expect(page.locator('.cd2004-navigator')).toBeVisible();
      await expect(visibleWindows).toHaveCount(1);
      await expect(page.locator('.cd2004-mobile-switcher')).toHaveCount(0);

      for (const [tab, selector] of workflows) {
        await openWorkflow(page, tab);
        await expect(page.locator(selector)).toBeVisible();
        await expect(visibleWindows).toHaveCount(2);
        const inspectorBox = await page
          .locator('.cd2004-inspector-window')
          .boundingBox();
        const workspaceBox = await page.locator('.cd2004-workspace').boundingBox();
        expect(inspectorBox.x).toBeGreaterThanOrEqual(0);
        expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(width + 1);
        expect(inspectorBox.y).toBeGreaterThanOrEqual(workspaceBox.y - 1);
        expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(
          workspaceBox.y + workspaceBox.height + 1
        );
        const inspectorOverflow = await page
          .locator('.cd2004-inspector')
          .evaluate((inspector) => inspector.scrollWidth - inspector.clientWidth);
        expect(inspectorOverflow).toBeLessThanOrEqual(1);
        if (tab === 'administer') {
          const transactionOverflow = await page
            .locator('.cd2004-transaction-window.has-document-split')
            .evaluate((transaction) => transaction.scrollHeight - transaction.clientHeight);
          expect(transactionOverflow).toBeLessThanOrEqual(1);
        }
        const internalOverflow = await page.locator(selector).evaluate(node =>
          node.scrollWidth - node.clientWidth
        );
        const overflowOffenders = internalOverflow > 1
          ? await page.locator(selector).evaluate(node =>
              {
                const rootBounds = node.getBoundingClientRect();
                return [...node.querySelectorAll('*')]
                .filter(child => {
                  if (!child.getClientRects().length) return false;
                  const bounds = child.getBoundingClientRect();
                  return child.scrollWidth - child.clientWidth > 1 ||
                    bounds.right > rootBounds.right + 1 ||
                    bounds.left < rootBounds.left - 1;
                })
                .slice(0, 8)
                .map(child => {
                  const bounds = child.getBoundingClientRect();
                  return {
                    element: child.id
                      ? `#${child.id}`
                      : `${child.tagName.toLowerCase()}.${[...child.classList].join('.')}`,
                    overflow: child.scrollWidth - child.clientWidth,
                    clientWidth: child.clientWidth,
                    left: Math.round(bounds.left - rootBounds.left),
                    right: Math.round(bounds.right - rootBounds.right)
                  };
                });
              }
            )
          : [];
        if (internalOverflow > 1) {
          overflowFailures.push({
            width,
            workflow: tab,
            overflow: internalOverflow,
            offenders: overflowOffenders
          });
        }
        await expectNoHorizontalPageOverflow(page);
      }

      const titlebar = page.locator('.cd2004-app-titlebar');
      const titlebarBox = await titlebar.boundingBox();
      expect(titlebarBox).not.toBeNull();
      expect(titlebarBox.x).toBeGreaterThanOrEqual(0);
      expect(titlebarBox.x + titlebarBox.width).toBeLessThanOrEqual(width + 1);
    }

    expect(
      overflowFailures,
      `Protected viewport overflow: ${JSON.stringify(overflowFailures)}`
    ).toEqual([]);
  });

  test('renders a blank sample worksheet through the browser print path', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ipmgPrintCalls = 0;
      window.print = () => { window.__ipmgPrintCalls += 1; };
    });

    await page.goto('/');
    await openWorkflow(page, 'samples');
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('tab', { name: 'Safety & review' }).click();
    const blankButton = panel.getByRole('button', { name: 'Blank worksheet' });
    await expect(blankButton).toBeVisible();

    await blankButton.click();
    await expect.poll(() => page.evaluate(() => window.__ipmgPrintCalls)).toBe(1);
    await expect(page.locator('#sampleWorksheetSheet .sw-page')).toContainText(/Medication Sample|Sample/i);

    // The product deliberately clears its print class after invoking the system dialog.
    // Let both the legacy 500 ms cleanup and the print-hardening 1 s fallback
    // finish, then restore it so Chromium renders the exact print stylesheet
    // without racing the production cleanup timer on a loaded CI runner.
    await page.waitForTimeout(1_100);
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
    await openWorkflow(page, 'samples');
    const panel = page.locator('.wfp-panel');
    const tabs = panel.getByRole('tab');
    const field = (label) => panel.locator('.wfp-field').filter({ has: page.getByText(label, { exact: true }) });

    await field('Patient name').locator('input').fill('QA, Browser');
    await field('DOB').locator('input').fill('01/02/1990');
    await setProvider(field('Prescriber'), 'QA Prescriber');
    await field('Dispensed by').locator('input').fill('QA Staff');
    await fillDate(field('Date dispensed').locator('input'), '2026-07-29');
    await fillDate(field('Start date').locator('input'), '2026-07-29');

    await tabs.filter({ hasText: 'Medication' }).click();
    await field('Medication').locator('select').selectOption({ label: 'Vraylar' });
    await field('Patient instructions').locator('textarea').fill('Take as prescribed.');

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await field('Primary package lot #').locator('input').fill('PRIMARY-LOT-42');
    await field('Primary package exp').locator('input').fill('2027-12');

    await panel.getByRole('button', { name: '+ Add package / step' }).click();
    const row = panel.locator('.wfp-table tbody tr').first();
    // RC5.38-equivalent: an added row only becomes a distinct trace-eligible
    // package once it has a non-empty package/quantity value.
    await row.locator('input').nth(0).fill('Vraylar 3 mg capsule');
    await row.locator('input').nth(1).fill('1 box');
    await row.locator('input').nth(3).fill('Then take 1 capsule daily.');

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 expiration');

    const entriesBeforeTrace = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entriesBeforeTrace).toHaveLength(2);
    expect(entriesBeforeTrace[0]).toMatchObject({ label: 'Primary package', lot: 'PRIMARY-LOT-42', exp: '2027-12' });
    expect(entriesBeforeTrace[1]).toMatchObject({ label: 'Added package 2', lot: '', exp: '' });

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await field('Medication list / interaction check').locator('select')
      .selectOption({ label: 'Prescriber reviewed / ok to dispense' });
    await field('Patient education').locator('select').selectOption({ label: 'Reviewed with patient' });

    const reviewButton = panel.getByRole('button', { name: /reviewed today/i });
    await expect(reviewButton).toBeDisabled();
    await expect(page.locator('#samplePrint')).toBeDisabled();

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await row.locator('input').nth(4).fill('SECONDARY-LOT-42');
    await row.locator('input').nth(5).fill('2028-01');

    const entriesAfterTrace = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entriesAfterTrace[1]).toMatchObject({ label: 'Added package 2', lot: 'SECONDARY-LOT-42', exp: '2028-01' });
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .not.toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('final dispense review confirmation');

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sampleReviewedTodayStatus')).toContainText('Final dispense review confirmed today');
    await expect(page.locator('#samplePrint')).toBeEnabled();

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await row.locator('input').nth(4).fill('SECONDARY-LOT-43');

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#samplePrint')).toBeDisabled();
  });

  test('gates actual administration, product handling, and exception detail before administration can be documented', async ({ page }) => {
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Conditional',
      includeAdministrationTime: false
    });
    // The legacy #clinicalDisposition element stays loaded (hidden) as a
    // compatibility mirror target; it keeps computing its own stop list and
    // disabled state from the same fields this panel mirrors into it.
    const disposition = page.locator('#clinicalDisposition');
    const administered = disposition.locator('[data-disposition="administered"]');

    await expect(disposition).toContainText('Document the actual administration time.');
    await expect(administered).toBeDisabled();

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="time"]').first().fill('09:41');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Product');
    await panel.getByText('Document medication waste', { exact: true }).click();
    await expect(disposition).toContainText('Document the medication waste amount and unit.');
    await expect(administered).toBeDisabled();

    await panel.locator('.wfp-field:has-text("Waste amount") input').fill('0.2 mL');
    await panel.locator('.wfp-field:has-text("Waste witness") input').fill('QA Witness');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Administration');
    await panel
      .getByText('Something changed during or after administration', { exact: false })
      .click();
    await expect(disposition).toContainText('Describe what changed or was observed for the administration exception.');
    await expect(administered).toBeDisabled();

    await panel
      .locator('.wfp-field:has-text("What changed") textarea')
      .fill('Patient reported transient dizziness after injection.');
    await panel
      .locator('.wfp-field:has-text("Recipient notified") input')
      .fill('QA Provider, notified');
    await fillDate(
      panel.locator('.wfp-field:has-text("Notification / decision time") input'),
      '2026-07-30T09:48');
    await panel
      .locator('.wfp-field:has-text("Direction, action, and next step") textarea')
      .fill('Provider advised seated observation; staff reassessed and reviewed return precautions.');
    await expect(administered).toBeEnabled();
  });

  test('requires a complete product or device issue handoff before producing the dense administration note', async ({ page }) => {
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Product Issue'
    });
    const disposition = page.locator('#clinicalDisposition');
    const administered = disposition.locator('[data-disposition="administered"]');

    await openInjectionTab(page, 'Product');
    await panel.getByText('Document product or device issue', { exact: true }).click();

    await expect(disposition).toContainText('Describe the product or device issue.');
    await expect(disposition).toContainText(
      'Document the action or disposition for the product/device issue.'
    );
    await expect(disposition).toContainText(
      'Document who was notified about the product/device issue, or why notification was not needed.'
    );
    await expect(disposition).toContainText(
      'Document the product/device issue notification or decision time.'
    );
    await expect(disposition).toContainText(
      'Document the direction received for the product/device issue.'
    );
    await expect(disposition).toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeDisabled();

    await panel
      .locator('.wfp-field:has-text("Product / device issue") textarea')
      .fill('Plunger resistance noted during pre-administration device inspection.');
    await panel
      .locator('.wfp-field:has-text("Immediate action") textarea')
      .fill('Affected product quarantined; replacement package selected and independently verified.');
    await panel
      .locator('.wfp-field:has-text("Recipient notified") input')
      .fill('QA Ordering Provider');
    await fillDate(
      panel.locator('.wfp-field:has-text("Notification / decision time") input'),
      '2026-07-30T09:35');
    await panel
      .locator('.wfp-field:has-text("Direction received") textarea')
      .fill('Do not use the affected device; proceed only with the verified replacement.');

    await expect(disposition).not.toContainText('Describe the product or device issue.');
    await expect(disposition).toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeDisabled();

    await panel
      .locator('.wfp-field:has-text("Next step / owner / timing") textarea')
      .fill('QA Staff will retain the device for clinic follow-up and reconcile the replacement before closeout.');
    await expect(disposition).not.toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Outcome');
    await panel.getByText('Review complete — document administration', { exact: true }).click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
      'Administration documented'
    );
    const plan = page.locator('#outPL');
    await expect(plan).not.toContainText('PRODUCT / DEVICE ISSUE');
    await expect(plan).toContainText(
      'Product / device issue: Plunger resistance noted during pre-administration device inspection.'
    );
    await expect(plan).toContainText(
      'Action / disposition: Affected product quarantined; replacement package selected and independently verified.'
    );
    await expect(plan).toContainText(
      'Notification recipient: QA Ordering Provider'
    );
    await expect(plan).toContainText(
      'Notification / decision time: Jul 30, 2026 at 9:35 AM'
    );
    await expect(plan).toContainText(
      'Direction received: Do not use the affected device; proceed only with the verified replacement.'
    );
    await expect(plan).toContainText(
      'Next step: QA Staff will retain the device for clinic follow-up and reconcile the replacement before closeout.'
    );
  });

  test('formats the administered Tebra copy and preserves new fields in a locked record snapshot', async ({ page }) => {
    const haldolPreparationDocumentation =
      'HALDOL DECANOATE solution visually inspected: clear, yellow to light amber, free of visible debris.';
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173'
    });
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Formatted Note',
      medication: 'Haldol Dec.'
    });

    await openInjectionTab(page, 'Order');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Active order follow-up context');

    await openInjectionTab(page, 'Product');
    await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic sample' });

    await openInjectionTab(page, 'Verification');
    await panel.getByRole('checkbox', {
      name: 'HALDOL DECANOATE solution inspection completed'
    }).check();

    await openInjectionTab(page, 'Administration');
    await panel.locator('.wfp-field:has-text("mL administered") input').fill('2');
    await panel.locator('.wfp-field:has-text("Unit") select').selectOption('mL');
    await panel.locator('.wfp-field:has-text("Delivery device") select').selectOption({ label: 'Prefilled syringe' });
    await panel
      .locator('.wfp-field:has-text("Site condition") select')
      .selectOption({ label: 'Skin/site intact before administration' });

    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-review-contract')).toContainText(
      '6 EXPECTED · REVIEW PENDING'
    );
    await openInjectionTab(page, 'Outcome');
    const administered = panel
      .locator('label.wfp-option-row', { hasText: 'Review complete' })
      .locator('input[type="radio"]');
    await expect(administered).toBeEnabled();
    await administered.check();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');
    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-review-contract')).toContainText(
      'CONFIRMED · QA Staff, MA'
    );
    await expect(panel.locator('.wfp-review-state.is-confirmed')).toHaveCount(6);

    // Any post-review clinical change invalidates attribution immediately.
    await openInjectionTab(page, 'Outcome');
    await panel.getByRole('checkbox', { name: 'Post-injection education provided' }).check();
    await expect(administered).not.toBeChecked();
    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-review-contract')).toContainText('REVIEW PENDING');
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Needs disposition');
    await openInjectionTab(page, 'Outcome');
    await administered.check();
    // RC6.1's compact Plan carries the strongest single administration
    // sentence, compact military date/time, response wording, and
    // traceability - not every individual field entered on the worksheet
    // (order purpose, administration amount, delivery device, and site
    // condition are intentionally not part of the compact rhythm).
    await expect(page.locator('#outPL')).toContainText(
      'Administration: Haldol Dec. 50 mg IM administered to R ventrogluteal per active order using aseptic technique.'
    );
    await expect(page.locator('#outPL')).toContainText('Date/time: 7/30/26 0941.');
    await expect(page.locator('#outPL')).toContainText('Response: Pt tolerated inj well');
    await expect(page.locator('#outPL')).toContainText('Traceability: NDC 00000-0000-42');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic sample');

    // Product helper copy is instructional at the point of care, but a
    // checked product confirmation has to become a completed-event fact in
    // the structured Assessment. Keep the visible legacy mirror, document
    // viewer, and copied chart text on the same side of that boundary.
    const assessment = page.locator('#outAS');
    const productPreparationLine = `Product preparation: ${haldolPreparationDocumentation}`;
    await expect(assessment).toContainText('Verification:');
    await expect(assessment).toContainText(productPreparationLine);
    await expect(assessment).not.toContainText('Inspect the solution before administration.');

    const viewerAssessment = page
      .locator('.cd2004-inspector-window .cd2004-note-section')
      .filter({ hasText: 'Assessment' });
    await expect(viewerAssessment).toHaveCount(1);
    await expect(viewerAssessment.locator('.cd2004-note-body')).toContainText(productPreparationLine);
    await expect(viewerAssessment.locator('.cd2004-note-body'))
      .not.toContainText('Inspect the solution before administration.');
    await viewerAssessment.getByRole('button', { name: 'Copy Assessment section' }).click();
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(productPreparationLine);

    const shellCopyAll = page
      .locator('.cd2004-inspector-window')
      .getByRole('button', { name: 'Copy note', exact: true });
    await expect(shellCopyAll).toBeEnabled();
    await shellCopyAll.click();
    await expect.poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return [
        'Administration: Haldol Dec.',
        'Date/time: 7/30/26 0941',
        'Traceability: NDC 00000-0000-42',
        productPreparationLine
      ]
        .every(fragment => copied.includes(fragment));
    }).toBe(true);
    const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedNote).not.toMatch(/(?:^|\n)(?:CC|ASSESSMENT|PLAN):/);
    expect(copiedNote).not.toContain('Inspect the solution before administration.');

    // The print worksheet remains a distinct clinical worksheet, not a
    // second chart-note renderer. It uses the same encounter values while
    // keeping the completed preparation statement in the chart document.
    await page.evaluate(() => {
      window.renderInjectionWorksheet(false);
      document.body.classList.add('print-inj-worksheet');
    });
    await page.emulateMedia({ media: 'print' });
    const printedWorksheet = page.locator('#injWorksheetSheet');
    await expect(printedWorksheet).toBeVisible();
    await expect(printedWorksheet).toContainText('Haldol Dec.');
    await expect(printedWorksheet).not.toContainText(productPreparationLine);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('print-inj-worksheet'));

    // Only the worksheet lifecycle strip can begin the lock. The preview is
    // read-only, and a local attestation confirms the exact record context.
    await expect(
      page.locator('.cd2004-inspector-window [data-injection-finish]')
    ).toHaveCount(0);
    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    const attestationDialog = page.getByRole('dialog', {
      name: 'Sign'
    });
    await expect(attestationDialog).toContainText('QA, Formatted Note');
    await expect(attestationDialog).toContainText(/Haldol Dec/i);
    await expect(attestationDialog).toContainText('QA Staff, MA');
    await expect(
      attestationDialog.getByRole('button', { name: 'Sign', exact: true })
    ).toBeDisabled();
    await attestationDialog.getByRole('button', { name: 'Back to editing', exact: true }).click();
    await expect(attestationDialog).toBeHidden();
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    const lockedLifecycle = page.locator('[data-injection-record-actions]');
    await expect(lockedLifecycle).toContainText('Signed');
    await expect(lockedLifecycle.locator('[data-locked-record-action]')).toBeFocused();
    await expect(page.locator('.cd2004-post-stamp')).toHaveCount(0);
    await expect(page.locator('.cd2004-work-locked-banner')).toHaveCount(0);
    await expect(page.locator('#injCompletionOverlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
      return records.find(record => record?.patient?.name === 'QA, Formatted Note')?.attestation;
    })).toMatchObject({
      staff: 'QA Staff, MA',
      statementVersion: 'local-attestation-v1'
    });
    await expect.poll(() => page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
      return records.find(record => record?.patient?.name === 'QA, Formatted Note')
        ?.snapshot?.disposition;
    })).toMatchObject({
      kind: 'administered',
      reviewedBy: 'QA Staff, MA'
    });
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(page.locator('#rc526Flow .rc526-mode b')).toHaveText('Locked injection record');
    const lockedStartNew = page.locator(
      '[data-injection-record-actions] [data-injection-new]'
    );
    await expect(lockedStartNew).toBeVisible();
    await expect(lockedStartNew).toHaveAccessibleName('Start new injection');
    await expect(page.locator('#ptName')).toBeDisabled();
    await expect(page.locator('#medClear')).toHaveAttribute('aria-disabled', 'true');
    await expect(panel.getByText('Read only', { exact: true })).toBeVisible();
    await openInjectionTab(page, 'Order');
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeDisabled();
    await openInjectionTab(page, 'Outcome');
    const lockedMedication = await page.locator('#medHdrName').textContent();
    expect(lockedMedication).toBeTruthy();
    await expect(page.locator('#outPL')).toContainText('Date/time: 7/30/26 0941.');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic sample');

    // The addenda-authoring UI lives entirely inside the hidden legacy
    // record workspace; the new panel provides its own addendum section
    // (outside the disabled fieldset) that mirrors into the same hidden
    // fields and record so this stays reachable by a real user.
    const addendumTextField = panel.locator('.wfp-field:has-text("Dated addendum") textarea');
    await lockedLifecycle.getByRole('button', { name: 'Add dated addendum' }).click();
    await expect(addendumTextField).toBeFocused();
    await panel.locator('.wfp-field:has-text("Addendum entered by") input').fill('QA Addendum Staff');
    await addendumTextField.fill('Saved clarification by the current reviewer.');
    await panel.getByText('Save addendum', { exact: true }).click();
    await expect(page.locator('.record-addenda-item').first()).toContainText('QA Addendum Staff');
    await expect(page.locator('.record-addenda-item').first()).toContainText('Saved clarification by the current reviewer.');

    await addendumTextField.fill('Pending clarification that must not be abandoned.');
    await lockedStartNew.click();
    await expect(addendumTextField).toHaveValue('Pending clarification that must not be abandoned.');
    await expect(page.locator('#ptName')).toHaveValue('QA, Formatted Note');
  });

  test('keeps Forms handoff guidance limited to explicit workflow selections', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'forms');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input').first().fill('QA, Explicit Forms');
    await panel.locator('select[name="forms-status"]').selectOption({ label: 'Provider review' });

    // The in-panel note preview was removed as a duplicate of this sidebar,
    // which shows the same generated note content (now the only on-screen
    // copy) split into labeled, individually-copyable sections.
    const preview = page.locator('.cd2004-note-sections');
    await expect(preview).toContainText('Status: Provider review');
    await expect(preview).not.toContainText(
      'Release only after provider approval is confirmed.'
    );
    await expect(preview).not.toContainText('ACTION / FOLLOW-UP');

    // The hidden legacy mirror stays in sync so print/log/readiness keep working.
    await expect.poll(() =>
      page.evaluate(() => document.getElementById('formsPtName')?.value)
    ).toBe('QA, Explicit Forms');
  });

  test('locks a paired aripiprazole initiation while retaining both components in the local record', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await signInLocalStaff(page);
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Paired Initiation');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await setProvider(panel, 'QA Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Initiation' });

    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Abilify Maintena' });
    await panel.locator('select[name="inj-dose"]').selectOption('400 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await fillDate(
      panel
        .locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]'), '2026-07-30');

    await openInjectionTab(page, 'Administration');
    await panel.getByText('R deltoid', { exact: true }).click();

    await openInjectionTab(page, 'Schedule');

    // #initiationProtocolCard stays loaded (hidden) as a compatibility mirror
    // target; readiness/validation text assertions against it don't need
    // visibility, only the interactive steps move to the new panel below.
    const initiation = page.locator('#initiationProtocolCard');
    await panel.getByText('1-day initiation', { exact: true }).click();
    // Scoped to the option row rather than a bare getByText: the same stop
    // message also appears verbatim in the "Outstanding requirements"
    // floating window (opened from the status chip) once the 1-day protocol
    // is selected but not yet plan-verified.
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'Active provider initiation/re-initiation order' })
      .click();
    await panel.locator('.wfp-field:has-text("Component 2 — dose") select').selectOption('300 mg');
    await panel.locator('.wfp-field:has-text("Component 2 — site") select').selectOption('L deltoid');
    await panel.locator('.wfp-field:has-text("Component 2 — NDC") input').fill('00000-0000-22');
    await panel.locator('.wfp-field:has-text("Component 2 — Lot") input').fill('PAIR-LOT-2');
    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').fill('2026-06');
    await panel.locator('label[for="init-second-order"]').click();
    await panel.locator('label[for="init-second-given"]').click();
    await panel.locator('select[name="init-oral"]').selectOption({ label: 'Administered today' });
    await expect(initiation).toContainText(
      /2 protocol items still need documentation/
    );

    await openInjectionTab(page, 'Product');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-11');
    await panel.locator('input[placeholder="LOT123"]').fill('PAIR-LOT-1');
    await panel.locator('input[type="month"]').first().fill('2028-05');
    await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic sample' });

    await openInjectionTab(page, 'Verification');
    await panel
      .locator('label.wfp-option-row')
      .filter({ hasText: /^ABILIFY MAINTENA reconstitution and inspection completed/ })
      .click();
    await panel
      .locator('label.wfp-option-row')
      .filter({ hasText: /^Ordered oral initiation plan documented/ })
      .click();
    await panel
      .locator('.wfp-field:has-text("Allergy status") input')
      .fill('NKDA confirmed in this local record');
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'No acute concerns today confirmed' })
      .click();

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="time"]').first().fill('10:15');
    await panel.locator('.wfp-field:has-text("Component 2 actual time") input').fill('10:18');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');

    await openInjectionTab(page, 'Administration');
    const administered = page.locator('#clinicalDisposition [data-disposition="administered"]');
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(administered).toBeDisabled();

    await openInjectionTab(page, 'Schedule');
    await panel.locator('.wfp-field:has-text("Component 2 — dose") select').selectOption('400 mg');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeDisabled();

    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').fill('2028-06');
    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').press('Tab');
    // Changing the exact component strength deliberately clears its package
    // traceability; the old NDC could refer to the prior 300 mg component.
    await panel.locator('#inj-component2-ndc').fill('00000-0000-22');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Document the NDC for injection component 2.'
    );
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeEnabled();
    await openInjectionTab(page, 'Outcome');
    await panel.getByText('Review complete — document administration', { exact: true }).click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    // The worksheet preview remains the meaningful source for each component;
    // no legacy completion receipt or global F10 action owns this transition.
    // The compact note documents both components' dose/site (Administration)
    // and both components' lot/NDC/expiration (Traceability) - not just the
    // primary injection's.
    await expect(page.locator('#outPL')).toContainText(
      'Administration: Abilify Maintena 400 mg IM administered to R deltoid using aseptic technique.'
    );
    await expect(page.locator('#outPL')).toContainText(
      'Component 2 — Abilify Maintena 400 mg IM administered to L deltoid.'
    );
    await expect(page.locator('#outPL')).toContainText('Traceability: NDC 00000-0000-11 · Lot PAIR-LOT-1 · Exp 05/2028.');
    await expect(page.locator('#outPL')).toContainText('Component 2 — NDC 00000-0000-22 · Lot PAIR-LOT-2 · Exp 06/2028.');
    await expect(page.locator('#injCompletionOverlay')).toBeHidden();
    await expectNoHorizontalPageOverflow(page);
  });

  test('round-trips structured injection draft fields through the local records drawer', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Draft Detail');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('02/03/1991');
    await setProvider(panel, 'QA Draft Provider');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Draft order-linked encounter context');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="time"]').first().fill('14:06');

    // Switch immediately through the visible lifecycle control: it must flush
    // the pending sub-700 ms autosave instead of losing structured fields.
    await page.locator('[data-injection-record-actions] [data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    // The new panel must reset its own typed state too, not just the hidden
    // legacy mirror fields, when the active record genuinely changes.
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Draft Detail');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#ptName')).toHaveValue('QA, Draft Detail');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Draft Detail');
    await expect(
      panel.locator('.wfp-field:has-text("Verified active-order purpose") input')
    ).toHaveValue('Draft order-linked encounter context');
    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('input[type="time"]').first()).toHaveValue('14:06');
  });

  test('keeps visible injection actions explicit and distinguishes new from discard', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    const actions = page.locator('[data-injection-record-actions]');
    const save = actions.locator('[data-injection-save]');
    const finish = actions.locator('[data-injection-finish]');
    const startNew = actions.locator('[data-injection-new]');
    const discard = actions.locator('[data-injection-discard]');

    await expect(actions).toContainText('Injection note');
    await expect(actions).toContainText('New draft');
    await expect(save).toHaveAccessibleName('Save F12');
    await expect(finish).toHaveAccessibleName('Sign');
    await expect(startNew).toHaveAccessibleName('Start new injection');
    await expect(discard).toHaveAccessibleName('Discard draft…');
    await startNew.focus();
    await expect(page.locator('.cd2004-status-message')).toContainText('Start new injection');
    await panel.locator('input[placeholder="Last, First"]').focus();
    await expect(page.locator('.cd2004-status-message')).toContainText('Patient name');
    await expect(save).toBeDisabled();
    await expect(finish).toBeDisabled();
    await expect(startNew).toBeEnabled();
    await expect(discard).toBeDisabled();

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Visible Lifecycle');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await setProvider(panel, 'QA Lifecycle Provider');

    await expect(save).toBeEnabled();
    await expect(discard).toBeEnabled();
    await save.click();
    await expect(actions).toContainText('Draft saved');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // New is safe navigation: it retains the saved draft rather than deleting it.
    await startNew.click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect(actions).toContainText('New draft');
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]')
        .some(record => record?.patient?.name === 'QA, Visible Lifecycle')
    )).toBe(true);

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Discard Me');
    await setProvider(panel, 'QA Lifecycle Provider');
    await expect(discard).toBeEnabled();
    await discard.click();
    const discardDialog = page.getByRole('dialog', { name: 'Discard draft' });
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog).toContainText('QA, Discard Me');
    await discardDialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Discard Me');

    await discard.click();
    await discardDialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]')
        .some(record => record?.patient?.name === 'QA, Discard Me')
    )).toBe(false);
  });

  test('opens a saved injection record through the Dashboard local worklist', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    const actions = page.locator('[data-injection-record-actions]');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Start Center Open');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('05/06/1994');
    await setProvider(panel, 'QA Start Center Provider');
    await actions.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await openWorkflow(page, 'home');
    const records = page.locator('.cd2004-worklist-table');
    const savedDraftsTab = page.getByRole('tab', { name: /Drafts/ });
    await expect(savedDraftsTab).toContainText('1');
    await savedDraftsTab.click();
    await expect(records).toContainText('QA, Start Center Open');
    // The row is the target; the patient button carries it for the keyboard.
    await records.getByRole('button', { name: 'QA, Start Center Open' }).click();

    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.locator('#ptName')).toHaveValue('QA, Start Center Open');
    await expectProviderValue(panel, 'QA Start Center Provider');
  });

  test('keeps an editable injection draft in place when Escape is pressed', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Safe Exit');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('06/07/1995');
    await setProvider(panel, 'QA Safe Exit Provider');
    await page.keyboard.press('Escape');

    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Safe Exit');
    await expect(page.locator('[data-injection-record-actions]')).not.toContainText(
      'LOCAL RECORD LOCKED'
    );
  });

  test('opens a legacy local lock without migrating unknown historical fields', async ({ page }) => {
    const patient = 'QA, Compatibility Fields';
    // Preserve payload compatibility without turning a historical lock into a new workflow.
    await prepareRoutineInjection(page, { patient });

    await page.locator('[data-injection-record-actions] [data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // Reload first to cancel any pending fixture-entry autosave before replacing
    // the stored record with a historical compatibility payload.
    await page.reload();
    const recordId = await page.evaluate(patientName => {
      const key = 'ipmgMedAssistInjectionRecordsV1';
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find(item => item?.patient?.name === patientName);
      if (!record) throw new Error('Expected the compatibility draft to be stored');

      record.futureRecord = {
        source: 'legacy-import',
        nested: { preserve: 'record-value' }
      };
      record.patient.futurePatient = {
        source: { system: 'historical-ehr', identifier: 'LEGACY-42' }
      };
      record.snapshot.version = 3;
      record.snapshot.futureSnapshot = {
        nested: { preserve: 'snapshot-value' },
        sequence: ['one', { preserve: 'array-value' }]
      };
      record.snapshot.state.futureState = {
        nested: { preserve: 'state-value' }
      };
      record.snapshot.fields.futureField = {
        nested: { preserve: 'field-value' }
      };
      record.snapshot.note.futureNote = {
        nested: { preserve: 'note-value' }
      };
      record.snapshot.initiation = {
        ...(record.snapshot.initiation || {}),
        futureProtocol: {
          nested: { preserve: 'protocol-value' }
        }
      };
      // A historical lock has no new local-attestation payload. It must still
      // render safely as a read-only legacy lock rather than being forced
      // through the modern typed readiness/attestation flow.
      record.status = 'completed';
      record.completedAt = '2026-07-30T09:41:00.000Z';
      localStorage.setItem(key, JSON.stringify(records));
      return record.id;
    }, patient);

    // Reload so the seeded historical payload becomes the live in-memory record.
    await page.reload();
    await openWorkflow(page, 'administer');
    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill(patient);
    await expect(page.locator(`[data-records-open="${recordId}"]`)).toContainText('Signed (legacy)');
    await page.locator(`[data-records-open="${recordId}"]`).click();
    await expect(page.locator('#ptName')).toHaveValue(patient);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(
      page.locator('[data-injection-record-actions] [data-injection-new]')
    ).toBeVisible();

    const readStoredRecord = () => page.evaluate(id => {
      const records = JSON.parse(
        localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]'
      );
      return records.find(item => item?.id === id);
    }, recordId);

    // Opening a legacy lock is read-only with respect to persistence. It must
    // neither migrate the historical snapshot nor invent an attestation.
    const opened = await readStoredRecord();
    expect(opened.snapshot.version).toBe(3);
    expect(opened.snapshot.futureSnapshot.nested.preserve).toBe('snapshot-value');

    const expectedUnknownFields = {
      futureRecord: {
        source: 'legacy-import',
        nested: { preserve: 'record-value' }
      },
      patient: {
        futurePatient: {
          source: { system: 'historical-ehr', identifier: 'LEGACY-42' }
        }
      },
      snapshot: {
        version: 3,
        futureSnapshot: {
          nested: { preserve: 'snapshot-value' },
          sequence: ['one', { preserve: 'array-value' }]
        },
        state: {
          futureState: {
            nested: { preserve: 'state-value' }
          }
        },
        fields: {
          futureField: {
            nested: { preserve: 'field-value' }
          }
        },
        note: {
          futureNote: {
            nested: { preserve: 'note-value' }
          }
        },
        initiation: {
          futureProtocol: {
            nested: { preserve: 'protocol-value' }
          }
        }
      }
    };
    expect(await readStoredRecord()).toMatchObject(expectedUnknownFields);

    // A legacy local lock is deliberately not reopened as an editable modern
    // attestation flow.
    expect(opened.status).toBe('completed');
    expect(opened.attestation).toBeUndefined();
  });

  test('resets vitals for a new injection and restores them with its draft', async ({ page }) => {
    // The legacy "smart vitals" reveal-toggle/repeat-note/recheck-chip nudge
    // (window.ipmgSmartVitalsSnapshot) is a UI-only ergonomic layer with no
    // typed-encounter field of its own and no live interactive path through
    // the new panel (its reveal button lives in the now-hidden legacy DOM).
    // This test focuses on what the new panel actually owns: RR/SpO2 values
    // persisting correctly across New/reopen through the local draft store.
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Vitals Draft');
    await setProvider(panel, 'QA Ordering Provider');
    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await openInjectionTab(page, 'Verification');
    await panel.getByRole('button', { name: 'Show vitals (optional)' }).click();
    await panel.locator('.wfp-field:has-text("RR") input').fill('10');
    await panel.locator('.wfp-field:has-text("SpO2") input').fill('93');

    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await actions.locator('[data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    await openInjectionTab(page, 'Order');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await openInjectionTab(page, 'Verification');
    // Vitals are hidden by default on a genuinely blank draft - their
    // absence here (rather than an empty-valued field) is itself the
    // "no leftover vitals" assertion.
    await expect(panel.getByRole('button', { name: 'Show vitals (optional)' })).toBeVisible();
    await expect(panel.locator('.wfp-field:has-text("RR") input')).toHaveCount(0);
    await expect(panel.locator('.wfp-field:has-text("SpO2") input')).toHaveCount(0);

    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Smart Vitals Draft');
    await page.locator('[data-records-open]').click();

    await openInjectionTab(page, 'Verification');
    await expect(panel.locator('.wfp-field:has-text("RR") input')).toHaveValue('10');
    await expect(panel.locator('.wfp-field:has-text("SpO2") input')).toHaveValue('93');
  });

  test('clearing the first meaningful draft field cancels autosave without creating a record', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');

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
    await openWorkflow(page, 'administer');
    const persistencePanel = page.locator('.wfp-panel');
    await persistencePanel.locator('input[placeholder="Last, First"]').fill('QA, Persistence Guard');
    await persistencePanel.locator('input[placeholder="MM/DD/YYYY"]').fill('03/04/1992');
    await setProvider(persistencePanel, 'QA Provider');

    await page.locator('[data-injection-record-actions] [data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('QA, Persistence Guard');
    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#panel-administer')).not.toHaveClass(/record-readonly/);
  });

  test('uses prior administration context to auto-select a valid rotated site', async ({ page }) => {
    // The legacy interactive body-map (recommended/quick-rotate CSS classes,
    // auto-collapsing cards) has been replaced by an icon-tile site picker
    // per the approved redesign. A valid alternate now saves the MA a click,
    // while the recommendation remains visible for confirmation.
    await page.setViewportSize({ width: 840, height: 720 });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Rotation');
    await setProvider(panel, 'QA Ordering Provider');

    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-dose"]').selectOption('156 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await openInjectionTab(page, 'Schedule');
    await fillDate(panel.locator('input[data-workstation-date="date"]').first(), '2026-07-02');
    await panel.locator('.wfp-field:has-text("Prior site") select').selectOption('R deltoid');

    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-section-head', { hasText: 'Actual administration location' })).toContainText(
      'rotate: L deltoid'
    );
    await expect(
      panel.locator('.wfp-site-tile', { hasText: 'L deltoid' })
    ).toHaveClass(/is-selected/);
    await expect(panel.locator('.wfp-site-tile.is-selected')).toHaveCount(1);

    // Site and the administration time now share the Administration block, so
    // the actual-time field is reachable without leaving the tab.
    await expect(panel.locator('input[type="time"]').first()).toBeVisible();
  });

  // Fills the UDS specimen block for a given device. Everything below is the
  // documentation any point-of-care screen needs regardless of which cup was
  // used, so each device scenario starts from the same place.
  async function fillUdsSpecimen(page, panel, device) {
    const field = (label) => panel.locator('.wfp-field').filter({ hasText: label });
    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('06/11/1988');
    await panel.locator('input[placeholder="Staff initials / name"]').fill('A. Rivera, MA');
    await fillDate(panel.locator('input[data-workstation-date="datetime"]'), '2026-08-03T09:15');
    await panel.locator('select[name="uds-temperature"]').selectOption('acceptable');
    await panel.locator('select[name="uds-reason"]').selectOption('routine');
    await field('Device').locator('select').selectOption(device);
    await panel.locator('input[placeholder="LOT123"]').fill('UDS4471');
    await panel.locator('input[type="month"]').fill('2027-04');
    await panel.locator('select[name="uds-control"]').selectOption('valid');
    await field('Validity markers').locator('select').selectOption('acceptable');
    await panel.getByRole('tab', { name: /^Review/ }).click();
    await field('Medication alignment').locator('select').selectOption('no unexpected');
    await panel.getByRole('tab', { name: /^Specimen/ }).click();
  }

  async function applyDisplayedPanelsNegative(page, panel) {
    await panel.getByRole('button', { name: 'Mark displayed panels negative…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Mark displayed panels negative' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark displayed panels NEG' }).click();
    await expect(dialog).toBeHidden();
  }

  test('keeps UDS register states, draft commands, and tab behavior precise', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    const summaryFact = (label) => panel.locator('.wfp-summary-fact').filter({ hasText: label });

    await expect(panel.getByRole('heading', { name: 'Urine drug screen' })).toBeVisible();
    await expect(summaryFact('PANELS')).toContainText('PENDING');

    const specimenTab = panel.getByRole('tab', { name: 'Specimen', exact: true });
    const resultsTab = panel.getByRole('tab', { name: 'Results', exact: true });
    const reviewTab = panel.getByRole('tab', { name: 'Review', exact: true });
    await expect(specimenTab).toHaveAttribute('tabindex', '0');
    await expect(resultsTab).toHaveAttribute('tabindex', '-1');
    await expect(specimenTab).toHaveAttribute('aria-controls', 'uds-ledger-panel-specimen');
    await specimenTab.focus();
    await specimenTab.press('ArrowRight');
    await expect(resultsTab).toBeFocused();
    await expect(resultsTab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('#uds-ledger-panel-results')).toBeVisible();
    await resultsTab.press('End');
    await expect(reviewTab).toBeFocused();
    await reviewTab.press('Home');
    await expect(specimenTab).toBeFocused();

    await panel.locator('.wfp-field', { hasText: 'Device' }).locator('select')
      .selectOption('SAFE life 14-Panel Cup');
    await expect(summaryFact('PANELS')).toContainText('0/14');
    await reviewTab.click();

    const outsideLab = panel.locator('.wfp-field', { hasText: 'Outside lab' });
    await expect(outsideLab.locator('.wfp-register-source')).toHaveText('REF');
    await expect(panel.locator('.wfp-exception-register'))
      .not.toContainText('Medication alignment requires review');
    const udsRegister = scheduleRegister(panel, 'POINT-OF-CARE REPORT');
    await expect(registerVerdict(udsRegister)).toHaveText('INCOMPLETE');
    await expect(registerMarker(udsRegister)).toHaveText('STOP');
    await expect(panel.getByRole('button', { name: 'Copy draft Tebra note' })).toBeEnabled();
    await expect(page.locator('.cd2004-inspector').getByRole('button', { name: 'Copy draft note' }))
      .toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Print patient summary' })).toBeDisabled();

    await panel.locator('.wfp-field', { hasText: 'Medication alignment' }).locator('select')
      .selectOption('needs review');
    await expect(panel.locator('.wfp-exception-register'))
      .toContainText('Medication alignment requires review');
    await outsideLab.locator('select').selectOption('ordered');
    await expect(outsideLab).toHaveAttribute('data-field-source', 'ENTRY');
    const printHint = await panel.locator('.wfp-print-block-hint').textContent();
    expect(printHint).not.toContain('..');
  });

  test('starts UDS neutral, reviews normal QC explicitly, and cycles one result cell', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    const field = (label) => panel.locator('.wfp-field').filter({ hasText: label });

    await expect(panel.locator('select[name="uds-temperature"]')).toHaveValue('not documented');
    await expect(panel.locator('select[name="uds-control"]')).toHaveValue('not documented');
    await expect(field('Validity markers').locator('select')).toHaveValue('not documented');

    await field('Device').locator('select').selectOption('SAFE life 14-Panel Cup');
    await panel.getByRole('button', { name: 'Review normal QC…' }).click();
    const qcDialog = page.getByRole('dialog', { name: 'Review normal QC' });
    await expect(qcDialog).toContainText('does not enter any analyte result');
    await qcDialog.getByRole('button', { name: 'Confirm normal QC' }).click();
    await expect(panel.locator('select[name="uds-temperature"]')).toHaveValue('acceptable');
    await expect(panel.locator('select[name="uds-control"]')).toHaveValue('valid');
    await expect(field('Validity markers').locator('select')).toHaveValue('acceptable');
    await expect(page.locator('#uds-readings-verified')).toBeChecked();

    await panel.getByRole('tab', { name: /^Results/ }).click();
    const bup = panel.locator('.wfp-grid-row', { hasText: 'Buprenorphine' })
      .locator('.wfp-result-cycle');
    await expect(bup).toHaveText('NT');
    await bup.click();
    await expect(bup).toHaveText('NEG');
    await bup.press('Enter');
    await expect(bup).toHaveText('POS*');
    await bup.press('Space');
    await expect(bup).toHaveText('INV!');
    await bup.click();
    await expect(bup).toHaveText('NT');

    // Direct single-key entry and row navigation preserve the physical device
    // sequence without forcing repeated click cycling.
    await bup.press('n');
    await expect(bup).toHaveText('NEG');
    await bup.press('ArrowDown');
    await page.mouse.move(0, 0);
    await expect(bup).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(bup).toHaveCSS('color', 'rgb(31, 111, 92)');
    const mtd = panel.locator('.wfp-grid-row', { hasText: 'Methadone' }).locator('.wfp-result-cycle');
    await expect(mtd).toBeFocused();
    await mtd.press('p');
    await expect(mtd).toHaveText('POS*');
    await mtd.press('t');
    await expect(mtd).toHaveText('NT');
    await bup.press('t');

    await panel.getByRole('tab', { name: /^Review/ }).click();
    await expect(field('Medication alignment').locator('select')).toHaveValue('');
    await expect(
      registerVerdict(scheduleRegister(panel, 'POINT-OF-CARE REPORT'))
    ).toHaveText('INCOMPLETE');
  });

  test('keeps the analyte a 13-panel cup omits out of every bulk result action', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 13-Panel Cup');
    await panel.locator('.wfp-field').filter({ hasText: 'Panel not on this' })
      .locator('select').selectOption('PPX');
    await page.locator('#uds-readings-verified').check();

    await panel.getByRole('tab', { name: /^Results/ }).click();
    const omittedRow = panel.locator('.wfp-grid-row', { hasText: 'Propoxyphene' });
    // The result register follows the physical device order exactly. The cup
    // has no PPX window, so no PPX transaction row is rendered.
    await expect(omittedRow).toHaveCount(0);

    // The obvious shortcut has to leave the encounter finishable. Before this
    // guard it wrote a negative into the omitted analyte and immediately
    // blocked the screen on a stop the operator never chose.
    await applyDisplayedPanelsNegative(page, panel);
    await expect(panel.locator('.wfp-status-flag')).toHaveText('Ready');

    await panel.locator('.wfp-grid-row', { hasText: 'Cannabinoids / THC' })
      .locator('.wfp-result-cycle').click();
    await expect(omittedRow).toHaveCount(0);
    await expect(panel.locator('.wfp-issue-row')).toHaveCount(0);
  });

  /**
   * The note preview is a document viewer over text staff paste into a chart,
   * so what it shows and what it copies must be the same characters. The unit
   * tests prove the tokenizer round-trips; this proves the rendered DOM does,
   * against the real note the engine produced - a CSS or markup change that
   * swallowed a space or dropped a blank line would pass the unit test and
   * still mislead a reviewer here.
   */
  test('renders the note document as exactly the text it copies', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173'
    });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input[placeholder="Last, First"]').fill('Fidelity, Note');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await panel.locator('select[name="inj-reason"]').selectOption('scheduled');
    await fillDate(
      panel.locator('.wfp-field', { hasText: 'Administration date' })
        .locator('input[data-workstation-date="date"]').first(),
      '2026-07-30'
    );

    const inspector = page.locator('.cd2004-inspector');
    await expect(inspector.locator('.cd2004-note-body').first()).toBeVisible();

    // Compare what each section shows against what its own Copy button puts on
    // the clipboard. This is the check that matters: the clipboard is what
    // reaches the chart, so anything the viewer adds, drops, or reorders
    // relative to it is text a reviewer approved but did not actually file.
    const sectionCount = await page.locator('.cd2004-note-section').count();
    expect(sectionCount).toBeGreaterThan(0);

    for (let index = 0; index < sectionCount; index += 1) {
      const section = page.locator('.cd2004-note-section').nth(index);
      const rendered = await section.evaluate((node) =>
        [...node.querySelectorAll('.cd2004-note-line')]
          .map((line) => line.textContent)
          .join('\n')
      );
      await section.getByRole('button', { name: /^Copy / }).click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      // Guard the guard: two empty strings also compare equal.
      expect(copied.trim().length).toBeGreaterThan(20);
      // The Windows clipboard serializes line breaks as CRLF even when the
      // application supplied LF. Compare the text in the DOM's canonical
      // line-ending form; do not normalize any other character.
      expect(rendered).toBe(copied.replace(/\r\n/g, '\n'));
    }

    // Line numbers are chrome. A hand-dragged selection across the note must
    // not be able to pull them into the clipboard alongside the clinical text.
    const selectable = await page.evaluate(() =>
      [...document.querySelectorAll('.cd2004-note-lineno')].every(
        (node) => getComputedStyle(node).userSelect === 'none'
      )
    );
    expect(selectable).toBe(true);

    // Numbering restarts per section and counts every line, blanks included,
    // so a number always points at the line beside it.
    const numbering = await page.evaluate(() =>
      [...document.querySelectorAll('.cd2004-note-section')].map((section) =>
        [...section.querySelectorAll('.cd2004-note-lineno')].map((n) => n.textContent)
      )
    );
    for (const section of numbering) {
      expect(section).toEqual(section.map((_, index) => String(index + 1)));
    }

    await expect(inspector.locator('.cd2004-note-eod')).toHaveText('── END OF DOCUMENT ──');
    await expect(inspector.locator('.cd2004-note-heading .cd2004-note-mark.is-draft'))
      .toHaveText('Draft');
  });

  test('renders the UDS clinician view as a dense preliminary laboratory report', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    await page.getByRole('tab', { name: 'Review' }).click();

    const reportPreview = page.locator('.wfp-report-preview');
    const report = page.locator('.meditech-lab-sheet');
    await expect(reportPreview.getByText('WAITING FOR RESULTS')).toBeVisible();
    await expect(report).toBeHidden();
    await reportPreview.locator('summary').click();
    await expect(report).toBeVisible();
    await expect(report).toContainText('POINT OF CARE LABORATORY');
    await expect(report).toContainText('PRELIMINARY / PRESUMPTIVE');
    await expect(report.locator('.meditech-lab-results tbody tr')).toHaveCount(14);
    await expect(report.locator('th')).toHaveText([
      'TEST / ANALYTE',
      'RESULT',
      'FLAG',
      'EXPECTED',
      'STATUS'
    ]);
    await expect(page.getByRole('button', { name: 'Print clinician report' })).toBeVisible();
  });

  test('lets an uncatalogued point-of-care cup reach a finishable screen', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'Other point-of-care UDS cup');

    // Custom devices capture the package name and exact top-to-bottom physical
    // panel sequence rather than a generic confirmation checkbox.
    await panel.locator('.wfp-field', { hasText: 'Device/package name' }).locator('input').fill('Clinic single-panel card');
    await panel.getByRole('button', { name: '+ Add panel' }).click();
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await applyDisplayedPanelsNegative(page, panel);

    await expect(panel.locator('.wfp-status-flag')).toHaveText('Ready');
    await expect(panel.locator('.wfp-issue-row')).toHaveCount(0);

    // The panel sequence is part of the physical device identity. Changing it
    // after results were read must invalidate every old reading rather than
    // silently carrying those readings onto a different profile.
    await panel.getByRole('tab', { name: /^Specimen/ }).click();
    await panel.getByRole('button', { name: '+ Add panel' }).click();
    await expect(page.locator('#uds-readings-verified')).not.toBeChecked();
    await expect(panel.locator('.wfp-invalidation-receipt')).toContainText('PANEL PROFILE CHANGED');
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await expect(panel.locator('.wfp-grid-row')).toHaveCount(2);
    await expect(panel.locator('.wfp-result-cycle')).toHaveText(['NT', 'NT']);
  });

  test('groups collection actions and an Other reason detail with the specimen facts', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    const specimen = panel.getByRole('group', { name: 'Specimen & collection' });
    const device = panel.getByRole('group', { name: 'Device & quality control' });

    const collectionRow = specimen.locator('.wfp-row', { has: page.locator('input[data-workstation-date="datetime"]') });
    await expect(collectionRow.getByRole('button', { name: 'Use current date/time' })).toBeVisible();
    await expect(specimen.locator('.wfp-row').first().getByRole('button', { name: 'Use current date/time' })).toHaveCount(0);

    await specimen.locator('select[name="uds-reason"]').selectOption('other');
    await expect(specimen.locator('.wfp-field', { hasText: 'Reason detail' })).toBeVisible();
    await expect(device.locator('.wfp-field', { hasText: 'Reason detail' })).toHaveCount(0);
  });

  test('saves a local UDS draft and resumes it from the UDS records window', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');

    await panel.locator('.cd2004-record-actions button.is-save').click();
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-draft/);
    await expect(panel.locator('.cd2004-record-actions-state strong')).toHaveText('Draft saved');

    await panel.getByRole('button', { name: 'UDS records…' }).click();
    const recordsDialog = page.locator('[role="dialog"][aria-labelledby="udsRecordsDrawerTitle"]');
    await expect(recordsDialog).toBeVisible();
    const rows = recordsDialog.locator('.records-drawer-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('.records-drawer-row-title')).toHaveText('Rivera, Ana');
    await expect(rows.locator('.records-drawer-row-badge')).toHaveText('Draft');

    // Start new UDS screen from the records window blanks the worksheet, and
    // the saved draft stays listed rather than being lost.
    await recordsDialog.getByRole('button', { name: 'Start new UDS screen' }).click();
    await expect(recordsDialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await panel.getByRole('button', { name: 'UDS records…' }).click();
    await expect(recordsDialog).toBeVisible();
    await expect(recordsDialog.locator('.records-drawer-row')).toHaveCount(1);
    await recordsDialog.locator('.records-drawer-row').click();
    await expect(recordsDialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('Rivera, Ana');
  });

  test('discards a local UDS draft only after explicit confirmation', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await panel.locator('.cd2004-record-actions button.is-save').click();

    await panel.locator('.cd2004-record-actions button.is-danger').click();
    const dialog = page.getByRole('dialog', { name: 'Discard draft' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('editable local UDS screen draft');

    // Keep editing leaves the draft intact.
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('Rivera, Ana');

    await panel.locator('.cd2004-record-actions button.is-danger').click();
    await dialog.getByRole('button', { name: 'Discard draft' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-new/);
  });

  test('attests and locks a local UDS record, then accepts a dated addendum', async ({ page }) => {
    await page.goto('/');
    await signInLocalStaff(page, 'QA Staff, MA');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await applyDisplayedPanelsNegative(page, panel);
    await panel.getByRole('tab', { name: /^Review/ }).click();

    const attestButton = panel.locator('.cd2004-record-actions button.is-primary');
    await expect(attestButton).toBeEnabled();
    await attestButton.click();

    const attestDialog = page.getByRole('dialog', { name: 'Sign' });
    await expect(attestDialog).toBeVisible();
    await expect(attestDialog).toContainText('SAFE life 14-Panel Cup');
    await attestDialog.getByRole('checkbox', { name: /I attest that I reviewed/ }).check();
    await attestDialog.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(attestDialog).toBeHidden();

    await expect(panel.locator('.wfp-status-flag.is-idle')).toHaveText('Read only');
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-locked/);

    await panel.getByRole('tab', { name: /^Specimen/ }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeDisabled();
    await panel.getByRole('tab', { name: /^Review/ }).click();

    const addendumBox = panel.locator('textarea[data-addendum-input]');
    await addendumBox.fill('Follow-up clarification.');
    await panel.getByRole('button', { name: 'Save addendum' }).click();
    await expect(panel.locator('.wfp-preview', { hasText: 'Follow-up clarification.' })).toBeVisible();
    await expect(addendumBox).toHaveValue('');
  });

  test('keeps printing available on a locked UDS record that carries a warning', async ({ page }) => {
    // A preliminary positive is a genuine finding, not a fixable data-entry
    // problem - it must never block attesting, locking, or (this test's
    // focus) printing the finalized report once the record is locked. The
    // print/copy actions also live outside the panel's locked-fieldset so
    // they stay reachable after lock instead of going dead with every other
    // now-read-only field.
    await page.goto('/');
    await signInLocalStaff(page, 'QA Staff, MA');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await applyDisplayedPanelsNegative(page, panel);
    await panel.locator('.wfp-grid-row', { hasText: 'Cannabinoids / THC' })
      .locator('.wfp-result-cycle').click();
    await panel.getByRole('tab', { name: /^Review/ }).click();

    const attestButton = panel.locator('.cd2004-record-actions button.is-primary');
    await expect(attestButton).toBeEnabled();
    await attestButton.click();
    const attestDialog = page.getByRole('dialog', { name: 'Sign' });
    await attestDialog.getByRole('checkbox', { name: /I attest that I reviewed/ }).check();
    await attestDialog.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(attestDialog).toBeHidden();
    await expect(panel.locator('.wfp-status-flag.is-idle')).toHaveText('Read only');

    await expect(panel.getByRole('button', { name: 'Print clinician report' })).toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Print patient summary' })).toBeEnabled();
    await expect(panel.locator('.wfp-print-block-hint')).toHaveCount(0);
  });

  test('lists outstanding requirements and jumps to the tab that owns each one', async ({ page }) => {
    await page.goto('/');

    // A bare stop count leaves staff opening every tab to find what is
    // missing. The status chip opens a floating window (matching real
    // MEDITECH's separate popups for this kind of thing); each row names
    // its tab and navigates straight to it, closing the window on click.
    await openWorkflow(page, 'uds');
    const uds = page.locator('.wfp-panel');
    await uds.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await uds.locator('.wfp-status-flag.is-stop').click();
    const udsDialog = page.getByRole('dialog', { name: 'Outstanding requirements' });
    await expect(udsDialog).toBeVisible();
    const udsRows = udsDialog.locator('.wfp-issue-row');
    await expect(udsRows.first()).toBeVisible();
    await expect(udsDialog.locator('.wfp-issue-row', { hasText: 'at least one result' })
      .locator('.wfp-issue-tab')).toHaveText('Results');
    await udsDialog.locator('.wfp-issue-row', { hasText: 'at least one result' }).click();
    await expect(uds.getByRole('tab', { name: /^Results/ })).toHaveAttribute('aria-selected', 'true');
    await expect(udsDialog).toBeHidden();

    await openWorkflow(page, 'samples');
    const samples = page.locator('.wfp-panel');
    await samples.locator('input[placeholder="Last, First"]').fill('Okafor, Ben');
    await samples.locator('.wfp-status-flag.is-stop').click();
    const samplesDialog = page.getByRole('dialog', { name: 'Outstanding requirements' });
    await expect(samplesDialog).toBeVisible();
    const educationRow = samplesDialog.locator('.wfp-issue-row', { hasText: 'patient education status' });
    await expect(educationRow.locator('.wfp-issue-tab')).toHaveText('Safety / review');
    await educationRow.click();
    await expect(samples.getByRole('tab', { name: /^Safety/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(samplesDialog).toBeHidden();
  });

  test('marks prior dose required only when the visit reason makes it a stop, and calculates the next due date', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('select[name="inj-reason"]').selectOption('scheduled');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    const priorDose = panel.locator('.wfp-field').filter({ hasText: 'Prior dose' });

    // A scheduled dose stops on the prior-dose date, because that date is the
    // engine's only input for the dosing window. The field has to say so -
    // labelling a blocking field "optional" is what sends staff hunting.
    await expect(priorDose.locator('.wfp-req')).toHaveCount(1);
    await expect(priorDose.locator('.wfp-opt')).toHaveCount(0);

    // A PRN dose has no window to evaluate, so the same field is genuinely
    // optional and must stop claiming otherwise.
    await panel.locator('select[name="inj-reason"]').selectOption('prn');
    await expect(priorDose.locator('.wfp-req')).toHaveCount(0);
    await expect(priorDose.locator('.wfp-opt')).toHaveCount(1);

    // Expected next due is a visible calculation from the actual date and
    // selected cadence. It is a read-only clinical result; changing it
    // requires the explicit, audited override dialog.
    const actualDate = panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]');
    await fillDate(actualDate, '2026-07-30');

    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    // The date renders in the same MM/DD/YY the typed date fields use, so a
    // calculated date and a keyed date are never shown two ways on one screen.
    await expect(registerValue(register, 'Next dose due')).toHaveText('08/27/26');
    await expect(registerMarker(register)).toHaveText('CALC');
    await expect(registerNote(register, 'Next dose due')).toContainText('from 07/30/26');
    await expect(register.locator('input[data-workstation-date="date"]')).toHaveCount(0);
    await expect(register.getByRole('button', { name: 'Override…' })).toBeVisible();
  });

  test('targets the Sustenna Day 8 date on a Day 1 initiation and clears a stale calculated date on a provider-directed path', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Initiation' });
    const actualDate = panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]');
    await fillDate(actualDate, '2026-07-30');

    const register = scheduleRegister(panel, 'SCHEDULE — NEXT DOSE');
    const nextDue = registerValue(register, 'Next dose due');
    // Baseline: with no initiation protocol selected, the ordered q4wk
    // interval drives the suggestion, same as the previous test.
    await expect(nextDue).toHaveText('08/27/26');

    // Day 1 initiation is followed by Day 8, not by the ordered maintenance
    // interval - the suggestion must switch to admin date + 7 days.
    await panel.locator('label:has-text("Day 1 initiation")').click();
    await expect(nextDue).toHaveText('08/06/26');
    await expect(registerNote(register, 'Next dose due')).toContainText('Day 8');

    // A provider-directed re-initiation is explicitly a non-calculating
    // path - the stale Day 8 (or interval) suggestion must be cleared, not
    // left sitting in the field looking like a still-valid value.
    await panel.locator('label:has-text("Re-initiation / provider plan")').click();
    await expect(nextDue).toHaveText('—');
    await expect(registerMarker(register)).toHaveText('PENDING');
  });
});
