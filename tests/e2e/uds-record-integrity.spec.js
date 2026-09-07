const { test, expect } = require('@playwright/test');
const { fillDate } = require('./date-entry');

const UDS_RECORDS_KEY = 'ipmgMedAssistUdsRecordsV1';
const UDS_MUTATION_LOCK_NAME = `${UDS_RECORDS_KEY}:exclusiveMutationV1`;
const UDS_PANELS = [
  'AMP', 'BAR', 'BUP', 'BZO', 'COC', 'MDMA', 'MET',
  'MTD', 'MOP', 'OXY', 'PCP', 'PPX', 'TCA', 'THC'
];

const emptyEncounter = (patient = { name: '', dob: '' }) => ({
  patient,
  collectionDateTime: '',
  reason: '',
  reasonDetail: '',
  device: '',
  omittedPanel: '',
  physicalReadingsVerified: false,
  customDeviceName: '',
  customPanels: [],
  customPanelSetVerified: false,
  lot: '',
  expiration: '',
  collector: '',
  temperature: 'not documented',
  control: 'not documented',
  validity: 'not documented',
  medicationAlignment: '',
  results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, 'nt'])),
  labPlan: 'provider to decide',
  comment: ''
});

const targetRecord = {
  id: 'uds-switch-target',
  type: 'uds',
  status: 'draft',
  createdAt: '2026-09-05T10:00:00-07:00',
  updatedAt: '2026-09-05T10:05:00-07:00',
  completedAt: '',
  patient: { name: 'Target, Synthetic', dob: '02/03/1992' },
  summary: 'Synthetic UDS switch target',
  snapshot: {
    ...emptyEncounter({ name: 'Target, Synthetic', dob: '02/03/1992' }),
    reason: 'routine'
  },
  addenda: []
};

const outputReadyDraftRecord = {
  ...targetRecord,
  id: 'uds-output-conflict-target',
  patient: { name: 'Output Target, Synthetic', dob: '02/03/1992' },
  summary: 'Synthetic output-ready UDS draft',
  snapshot: {
    ...emptyEncounter({ name: 'Output Target, Synthetic', dob: '02/03/1992' }),
    collectionDateTime: '2026-09-05T10:00',
    reason: 'routine',
    device: 'SAFE life 14-Panel Cup',
    physicalReadingsVerified: true,
    lot: 'OUTPUT4471',
    expiration: '2027-04',
    collector: 'Synthetic Collector, MA',
    temperature: 'acceptable',
    control: 'valid',
    validity: 'acceptable',
    medicationAlignment: 'no unexpected',
    results: Object.fromEntries(UDS_PANELS.map((panel) => [panel, 'neg']))
  }
};

const completedRecord = {
  ...targetRecord,
  id: 'uds-completed-synthetic',
  status: 'completed',
  completedAt: '2026-09-05T11:00:00-07:00',
  summary: 'Signed synthetic UDS note',
  addenda: [{
    id: 'uds-existing-addendum',
    createdAt: '2026-09-05T11:15:00-07:00',
    author: 'Existing Test, MA',
    text: 'Existing synthetic clarification.'
  }],
  attestation: {
    staff: 'Signer Test, MA',
    timestamp: '2026-09-05T11:00:00-07:00',
    statementVersion: 'local-attestation-v1'
  }
};

async function boot(page, records = []) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: UDS_RECORDS_KEY, value: JSON.stringify(records) });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
  await page.locator('.cd2004-nav-item[title="UDS"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
  await expect(page.locator('.wfp-panel')).toBeVisible();
}

async function signIn(page, name = 'Synthetic Signer, MA') {
  await page.locator('.tebra-account-trigger').click();
  await page.locator('[data-account-action="staff"]').click();
  const dialog = page.getByRole('dialog', { name: 'Staff Sign-In' });
  await dialog.getByRole('textbox', { name: 'Name or initials' })
    .fill(name);
  await dialog.getByRole('button', { name: 'Use for encounter', exact: true }).click();
}

async function fillAttestableEncounter(page, panel) {
  const field = (label) => panel.locator('.wfp-field').filter({ hasText: label });
  await panel.locator('input[placeholder="Last, First"]').fill('Photo Sign, Synthetic');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('06/11/1988');
  await panel.locator('input[placeholder="Staff initials / name"]')
    .fill('Synthetic Collector, MA');
  await fillDate(
    panel.locator('input[data-workstation-date="datetime"]'),
    '2026-09-06T09:15'
  );
  await panel.locator('select[name="uds-temperature"]').selectOption('acceptable');
  await panel.locator('select[name="uds-reason"]').selectOption('routine');
  await field('Device').locator('select').selectOption('SAFE life 14-Panel Cup');
  await panel.locator('input[placeholder="LOT123"]').fill('PHOTO4471');
  await panel.locator('input[type="month"]').fill('2027-04');
  await panel.locator('select[name="uds-control"]').selectOption('valid');
  await field('Validity markers').locator('select').selectOption('acceptable');
  await page.locator('#uds-readings-verified').check();
  await panel.getByRole('tab', { name: /^Results/ }).click();
  await panel.getByRole('button', { name: 'Mark displayed panels negative…' }).click();
  await page.getByRole('dialog', { name: 'Mark displayed panels negative' })
    .getByRole('button', { name: 'Mark displayed panels NEG' }).click();
  await panel.getByRole('tab', { name: /^Review/ }).click();
  await field('Medication alignment').locator('select').selectOption('no unexpected');
  await panel.getByRole('tab', { name: /^Specimen/ }).click();
}

async function selectSyntheticPhoto(panel) {
  await panel.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: 'synthetic-cup.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  });
}

test.describe('UDS record-integrity boundaries', () => {
  test('files a same-task UDS edit on pagehide without duplicating the draft', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const input = document.querySelector(
        '.wfp-panel input[placeholder="Last, First"]'
      );
      input.value = 'Pagehide, Synthetic';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.dispatchEvent(new Event('pagehide'));
    });

    const first = await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY);
    const records = JSON.parse(first);
    expect(records).toHaveLength(1);
    expect(records[0].snapshot.patient.name).toBe('Pagehide, Synthetic');

    // A second lifecycle signal observes the snapshot saved synchronously by
    // the first and therefore must not create a second record.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(first);
  });

  test('pagehide fails closed when an active UDS draft changed elsewhere', async ({ page }) => {
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-switch-target"]').click();
    await panel.locator('input[placeholder="Last, First"]')
      .fill('Pending Pagehide, Synthetic');

    const externalRaw = await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      record.summary = 'Synthetic external pagehide revision';
      record.updatedAt = '2026-09-06T14:00:00.000Z';
      const serialized = JSON.stringify(records);
      localStorage.setItem(key, serialized);
      return serialized;
    }, { key: UDS_RECORDS_KEY, id: targetRecord.id });

    const unloadPrevented = await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      const beforeUnload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(beforeUnload);
      return beforeUnload.defaultPrevented;
    });
    expect(unloadPrevented).toBe(true);
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);
  });

  test('a second UDS editor is read-only until the owning tab releases its Web Lock', async ({ browser }) => {
    const context = await browser.newContext();
    const ownerPage = await context.newPage();
    const blockedPage = await context.newPage();
    try {
      await boot(ownerPage, [targetRecord]);
      await expect(ownerPage.locator('.wfp-panel input[placeholder="Last, First"]'))
        .toBeEnabled();
      await blockedPage.goto('/');
      await blockedPage.waitForFunction(() => document.body.dataset.applicationReady === 'true');
      await blockedPage.locator('.cd2004-nav-item[title="UDS"]').click();
      const blockedPanel = blockedPage.locator('.wfp-panel');
      await expect(blockedPanel.getByRole('region', { name: 'UDS note actions' }))
        .toContainText('Another browser tab is editing UDS records');
      await blockedPanel.getByRole('button', { name: /Open UDS notes/ }).click();
      await blockedPage.locator('[data-records-open="uds-switch-target"]').click();
      await expect(blockedPanel.locator('select[name="uds-reason"]')).toBeDisabled();
      await expect(blockedPanel.getByRole('button', { name: 'Save', exact: true }))
        .toBeDisabled();

      const before = await ownerPage.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY);
      const saved = await blockedPage.evaluate(() => {
        const detail = { workflow: 'uds', handled: false, saved: false };
        window.dispatchEvent(new CustomEvent(
          'ipmg:workstation-draft-save-request',
          { detail }
        ));
        return detail.handled && detail.saved;
      });
      expect(saved).toBe(false);
      expect(await ownerPage.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
        .toBe(before);

      await ownerPage.locator('.cd2004-nav-item[title="Forms"]').click();
      await expect(ownerPage.locator('.cd2004-shell'))
        .toHaveAttribute('data-active-workflow', 'forms');
      await blockedPage.reload();
      await blockedPage.waitForFunction(() => document.body.dataset.applicationReady === 'true');
      await blockedPage.locator('.cd2004-nav-item[title="UDS"]').click();
      const ownerPanel = blockedPage.locator('.wfp-panel');
      await ownerPanel.getByRole('button', { name: /Open UDS notes/ }).click();
      await blockedPage.locator('[data-records-open="uds-switch-target"]').click();
      await ownerPanel.locator('select[name="uds-reason"]').selectOption('medmgmt');
      await ownerPanel.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(() => ownerPage.evaluate((key) => {
        const records = JSON.parse(localStorage.getItem(key) || '[]');
        return records.find((record) => record.id === 'uds-switch-target')
          ?.snapshot.reason;
      }, UDS_RECORDS_KEY)).toBe('medmgmt');
    } finally {
      await context.close();
    }
  });

  test('quarantines stale UDS output in a read-only tab after the owner saves a revision', async ({ browser }) => {
    const context = await browser.newContext();
    const ownerPage = await context.newPage();
    const contenderPage = await context.newPage();
    try {
      await boot(ownerPage, [outputReadyDraftRecord]);
      const ownerPanel = ownerPage.locator('.wfp-panel');
      await ownerPanel.getByRole('button', { name: /Open UDS notes/ }).click();
      await ownerPage.locator('[data-records-open="uds-output-conflict-target"]').click();
      await expect(ownerPanel.locator('input[placeholder="Last, First"]')).toBeEnabled();

      await contenderPage.goto('/');
      await contenderPage.waitForFunction(
        () => document.body.dataset.applicationReady === 'true'
      );
      await contenderPage.locator('.cd2004-nav-item[title="UDS"]').click();
      const contenderPanel = contenderPage.locator('.wfp-panel');
      const contenderActions = contenderPanel.getByRole('region', {
        name: 'UDS note actions'
      });
      await expect(contenderActions).toContainText(
        'Another browser tab is editing UDS records'
      );
      await contenderPanel.getByRole('button', { name: /Open UDS notes/ }).click();
      await contenderPage.locator(
        '[data-records-open="uds-output-conflict-target"]'
      ).click();
      await contenderPanel.getByRole('tab', { name: /^Review/ }).click();

      const clinicianPrint = contenderPanel.getByRole('button', {
        name: 'Print clinician report'
      });
      const patientPrint = contenderPanel.getByRole('button', {
        name: 'Print patient summary'
      });
      const tebraCopy = contenderPanel.getByRole('button', {
        name: 'Copy Tebra UDS note'
      });
      await expect(clinicianPrint).toBeEnabled();
      await expect(patientPrint).toBeEnabled();
      await expect(tebraCopy).toBeEnabled();
      await expect(contenderPage.locator('.cd2004-note-copy-all')).toBeEnabled();
      await expect(contenderPage.locator('.cd2004-note-copy').first()).toBeEnabled();

      await ownerPanel.locator('input[placeholder="Last, First"]')
        .fill('Owner Revision, Synthetic');
      await ownerPanel.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(() => ownerPage.evaluate((key) => {
        const records = JSON.parse(localStorage.getItem(key) || '[]');
        return records.find((record) => record.id === 'uds-output-conflict-target')
          ?.patient.name;
      }, UDS_RECORDS_KEY)).toBe('Owner Revision, Synthetic');

      await expect(contenderActions).toContainText(
        'This UDS note changed in another browser tab'
      );
      await expect(contenderPanel.getByRole('alert')).toContainText(
        'This UDS note changed in another browser tab'
      );
      await expect(contenderPanel.locator('#uds-sig-toggle')).toBeDisabled();
      await expect(clinicianPrint).toBeDisabled();
      await expect(patientPrint).toBeDisabled();
      await expect(tebraCopy).toBeDisabled();
      await expect(contenderPage.locator('.cd2004-note-copy-all')).toBeDisabled();
      await expect(contenderPage.locator('.cd2004-note-copy').first()).toBeDisabled();
      await expect(contenderPanel.locator('.wfp-report-preview')).toHaveCount(0);

      await contenderPanel.getByRole('tab', { name: /^Specimen/ }).click();
      await expect(contenderPanel.locator('input[placeholder="Last, First"]'))
        .toHaveValue('Output Target, Synthetic');
      await expect(contenderPanel.locator('input[placeholder="Last, First"]'))
        .toBeDisabled();

      // Explicitly selecting the freshly re-read durable row clears only the
      // output quarantine. The contender remains read-only; adopting current
      // durable bytes never grants mutation ownership.
      await contenderPanel.getByRole('button', { name: /Open UDS notes/ }).click();
      await contenderPage.locator(
        '[data-records-open="uds-output-conflict-target"]'
      ).click();
      await expect(contenderPanel.locator('input[placeholder="Last, First"]'))
        .toHaveValue('Owner Revision, Synthetic');
      await expect(contenderPanel.locator('input[placeholder="Last, First"]'))
        .toBeDisabled();
      await expect(contenderActions).toContainText(
        'Another browser tab is editing UDS records'
      );
      await contenderPanel.getByRole('tab', { name: /^Review/ }).click();
      await expect(clinicianPrint).toBeEnabled();
      await expect(patientPrint).toBeEnabled();
      await expect(tebraCopy).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  test('keeps one owned UDS Web Lock through repeated keyed chart open and new handoffs', async ({ page }) => {
    await boot(page, [targetRecord]);
    const patientInput = () => page.locator('.wfp-panel input[placeholder="Last, First"]');
    await expect(patientInput()).toBeEnabled();

    const openSyntheticChart = async () => {
      const search = page.locator('[data-patient-search] input');
      await search.fill('Target');
      await page.locator('[data-patient-result]').click();
      await expect(page.locator('[data-patient-chart]')).toBeVisible();
    };
    const expectSingleOwnedLock = async () => {
      await expect.poll(() => page.evaluate(async (name) => {
        const snapshot = await navigator.locks.query();
        return {
          held: snapshot.held?.filter((lock) => lock.name === name).length ?? 0,
          pending: snapshot.pending?.filter((lock) => lock.name === name).length ?? 0
        };
      }, UDS_MUTATION_LOCK_NAME)).toEqual({ held: 1, pending: 0 });
    };

    for (let index = 0; index < 8; index += 1) {
      await openSyntheticChart();
      if (index % 2 === 0) {
        await page.getByRole('tab', { name: 'Notes', exact: true }).click();
        await page.locator('[data-patient-note-open="uds-switch-target"]').click();
      } else {
        await page.getByRole('button', { name: 'Choose a note type' }).click();
        await page.getByRole('menuitem', { name: 'UDS', exact: true }).click();
      }
      await expect(page.locator('.cd2004-shell'))
        .toHaveAttribute('data-active-workflow', 'uds');
      await expect(patientInput()).toBeEnabled();
      await expect(page.locator('.wfp-panel').getByRole('region', { name: 'UDS note actions' }))
        .not.toContainText(/Another browser tab|protection is unavailable/);
      await expectSingleOwnedLock();
    }
  });

  test('patient chart excludes every copy of a duplicated UDS id when one copy is malformed', async ({ page }) => {
    const malformedDuplicate = {
      ...targetRecord,
      snapshot: null,
      summary: 'Malformed duplicate synthetic record'
    };
    await page.addInitScript(({ key, records }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(key, JSON.stringify(records));
    }, { key: UDS_RECORDS_KEY, records: [targetRecord, malformedDuplicate] });
    await page.goto('/');
    await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');

    const search = page.locator('[data-patient-search] input');
    await search.fill('ta');
    await expect(page.locator('[data-patient-result]')).toHaveCount(0);
    await expect(page.locator('[data-patient-search]')).toContainText(
      'No patients match.'
    );

    await page.locator('.cd2004-nav-item[title="UDS"]').click();
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    await expect(drawer.getByRole('alert')).toContainText(
      'Some saved UDS data could not be read safely.'
    );
    await expect(drawer.locator('[data-records-open]')).toHaveCount(0);
    await expect(drawer).not.toContainText('Target, Synthetic');
  });

  test('mixed corrupt UDS storage cannot hand off an editable valid row or new note', async ({ page }) => {
    const malformedSibling = {
      ...targetRecord,
      id: 'uds-malformed-sibling',
      patient: { name: 'Malformed Sibling, Synthetic', dob: '03/04/1993' },
      snapshot: null,
    };
    const original = JSON.stringify([targetRecord, malformedSibling]);
    await boot(page, [targetRecord, malformedSibling]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    const validRow = drawer.locator('[data-records-open="uds-switch-target"]');
    await expect(validRow).toHaveCount(0);

    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('alert')).toContainText(
      'Some saved UDS data could not be read safely.'
    );
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await expect(drawer.locator('[data-records-new]')).toBeDisabled();
    await expect(drawer).toBeVisible();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await drawer.locator('.records-drawer-cancel').click();
    await panel.getByRole('button', { name: 'Start new UDS screen' }).click();
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('Some saved UDS data could not be read safely.');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await page.locator('.cd2004-nav-item[title="Dashboard"]').click();
    const search = page.locator('[data-patient-search] input');
    await search.fill('ta');
    await page.locator('[data-patient-result]').click();
    const chart = page.locator('[data-patient-chart]');
    await expect(chart).toBeVisible();
    const actionBar = page.locator('[data-action-bar]');
    await actionBar.locator('.tebra-action-split-disclosure').click();
    await actionBar.getByRole('menuitem', { name: 'UDS', exact: true }).click();
    await expect(chart).toBeVisible();

    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(original);
  });

  test('fails closed while a report-only photo read is pending and after stale Sign confirmation', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeRead = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function delayedRead(file) {
        const reader = this;
        window.__releaseSyntheticUdsPhoto = () => nativeRead.call(reader, file);
      };
    });
    await boot(page);
    await signIn(page);
    const panel = page.locator('.wfp-panel');
    await fillAttestableEncounter(page, panel);
    const sign = panel.getByRole('region', { name: 'UDS note actions' })
      .getByRole('button', { name: 'Sign', exact: true });
    await sign.click();
    const dialog = page.getByRole('dialog', { name: 'Sign' });

    await selectSyntheticPhoto(panel);
    await expect(panel.locator('input[type="file"]')).toHaveAttribute('aria-busy', 'true');
    await dialog.getByRole('checkbox', { name: /I reviewed this note/ }).check();
    await dialog.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
    const remove = panel.getByRole('button', { name: 'Remove selected photo', exact: true });
    await expect(remove).toBeFocused();
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('Remove the report-only device photo before signing this note.');
    await panel.getByRole('tab', { name: /^Review/ }).click();
    await expect(panel.getByRole('button', { name: 'Print clinician report' }))
      .toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Print patient summary' }))
      .toHaveAttribute('title', /finish loading/);
    await expect.poll(() => page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return records.some((record) => record.status === 'completed');
    }, UDS_RECORDS_KEY)).toBe(false);

    await page.evaluate(() => window.__releaseSyntheticUdsPhoto?.());
    // The print controls live on Review; return to Specimen before resolving
    // the report-only photo that deliberately blocked signing above.
    await panel.getByRole('tab', { name: /^Specimen/ }).click();
    await expect(panel.locator('input[type="file"]')).not.toHaveAttribute('aria-busy', 'true');
    await panel.getByRole('button', { name: 'Remove selected photo', exact: true }).click();
    await expect(panel.locator('input[type="file"]')).toHaveValue('');
  });

  test('persists the exact UDS signature time shown in the review', async ({ page }) => {
    await boot(page);
    await signIn(page);
    const panel = page.locator('.wfp-panel');
    await fillAttestableEncounter(page, panel);
    await panel.getByRole('region', { name: 'UDS note actions' })
      .getByRole('button', { name: 'Sign', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign' });
    const reviewedTimestamp = await dialog.locator('dt', { hasText: 'Signature time' })
      .locator('..').locator('dd').textContent();
    await dialog.getByRole('checkbox', { name: /I reviewed this note/ }).check();
    await dialog.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return records.find((record) => record.status === 'completed')
        ?.attestation?.timestamp;
    }, UDS_RECORDS_KEY)).toBe(reviewedTimestamp);
  });

  test('saves a cleared-back-to-idle UDS draft under the same record id', async ({ page }) => {
    await boot(page);
    const panel = page.locator('.wfp-panel');
    const name = panel.locator('input[placeholder="Last, First"]');
    await name.fill('Cleared, Synthetic');
    await panel.locator('.cd2004-record-actions button.is-save').click();
    const first = await page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return { count: records.length, id: records[0]?.id };
    }, UDS_RECORDS_KEY);
    expect(first.count).toBe(1);
    expect(first.id).toBeTruthy();

    await name.fill('');
    await page.locator('.cd2004-nav-item[title="Injection"]').click();
    await expect(page.locator('.cd2004-shell'))
      .toHaveAttribute('data-active-workflow', 'administer');
    const after = await page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return {
        count: records.length,
        id: records[0]?.id,
        patient: records[0]?.snapshot?.patient
      };
    }, UDS_RECORDS_KEY);
    expect(after).toEqual({ count: 1, id: first.id, patient: { name: '', dob: '' } });

    await page.locator('.cd2004-nav-item[title="UDS"]').click();
    await expect(name).toHaveValue('');
    await expect(panel.locator('.cd2004-record-actions button.is-save')).toBeEnabled();
  });

  test('captures rapid same-task patient edits before workflow navigation', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const panel = document.querySelector('.wfp-panel');
      const name = panel?.querySelector('input[placeholder="Last, First"]');
      const dob = panel?.querySelector('input[placeholder="MM/DD/YYYY"]');
      if (!(name instanceof HTMLInputElement) || !(dob instanceof HTMLInputElement)) {
        throw new Error('Synthetic UDS patient controls were not found.');
      }
      name.value = 'Rapid, Synthetic';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      dob.value = '01/02/1990';
      dob.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.cd2004-nav-item[title="Injection"]')?.click();
    });

    await expect(page.locator('.cd2004-shell'))
      .toHaveAttribute('data-active-workflow', 'administer');
    await expect.poll(() => page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return records[0]?.snapshot?.patient;
    }, UDS_RECORDS_KEY)).toEqual({
      name: 'Rapid, Synthetic',
      dob: '01/02/1990'
    });
  });

  test('re-reads the active UDS record and adopts a lock from another tab', async ({ page }) => {
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-switch-target"]').click();
    await expect(panel.locator('fieldset').first()).not.toHaveAttribute('disabled', '');

    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    await page.evaluate(({ key, addendum }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      records[0].status = 'completed';
      records[0].completedAt = '2026-09-06T12:00:00.000Z';
      records[0].updatedAt = '2026-09-06T12:00:00.000Z';
      records[0].addenda = [addendum];
      records[0].attestation = {
        staff: 'Other Tab, Test MA',
        timestamp: '2026-09-06T12:00:00.000Z',
        statementVersion: 'local-attestation-v1'
      };
      localStorage.setItem(key, JSON.stringify(records));
    }, {
      key: UDS_RECORDS_KEY,
      addendum: {
        id: 'other-tab-addendum',
        createdAt: '2026-09-06T12:05:00.000Z',
        author: 'Other Tab, Test MA',
        text: 'Synthetic cross-tab clarification.'
      }
    });
    await drawer.locator('[data-records-open="uds-switch-target"]').click();

    await expect(drawer).toBeHidden();
    await expect(panel.locator('fieldset').first()).toHaveAttribute('disabled', '');
    await expect(panel.getByText('Synthetic cross-tab clarification.')).toBeVisible();
  });

  test('adopts an external metadata-only UDS revision before the next save', async ({ page }) => {
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-switch-target"]').click();

    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      record.summary = 'Synthetic metadata-only revision';
      record.updatedAt = '2026-09-06T12:30:00.000Z';
      localStorage.setItem(key, JSON.stringify(records));
    }, { key: UDS_RECORDS_KEY, id: targetRecord.id });
    await drawer.locator('[data-records-open="uds-switch-target"]').click();

    const patientName = panel.locator('input[placeholder="Last, First"]');
    await patientName.fill('Metadata Adopted, Synthetic');
    await page.keyboard.press('F12');
    await expect.poll(() => page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      return record?.snapshot?.patient?.name;
    }, { key: UDS_RECORDS_KEY, id: targetRecord.id }))
      .toBe('Metadata Adopted, Synthetic');
  });

  test('keeps the current note and drawer open when save-before-switch fails', async ({ page }) => {
    await page.addInitScript((key) => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function syntheticWriteFailure(name, value) {
        if (window.__failSyntheticUdsWrites && name === key) {
          throw new DOMException('Synthetic UDS write failure', 'QuotaExceededError');
        }
        return nativeSetItem.call(this, name, value);
      };
    }, UDS_RECORDS_KEY);
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.locator('input[placeholder="Last, First"]').fill('Keep, Synthetic');
    await panel.locator('select[name="uds-reason"]').selectOption('routine');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    const row = drawer.locator('[data-records-open="uds-switch-target"]');
    await page.evaluate(() => { window.__failSyntheticUdsWrites = true; });
    await row.focus();
    await row.press('Enter');

    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('alert')).toContainText('current note stayed open');
    await expect(row).toBeFocused();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('Keep, Synthetic');
    await expect(panel.locator('select[name="uds-reason"]')).toHaveValue('routine');
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('Unable to save browser-local storage');
  });

  test('quarantines a structured malformed saved record without changing storage', async ({ page }) => {
    const malformedRecord = {
      ...targetRecord,
      id: 'uds-malformed-synthetic',
      patient: { name: 'Malformed, Synthetic', dob: '01/01/1990' },
      snapshot: null
    };
    const original = JSON.stringify([malformedRecord]);
    await boot(page, [malformedRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    const drawer = page.locator('dialog[open][aria-labelledby="udsRecordsDrawerTitle"]');
    const row = drawer.locator('[data-records-open="uds-malformed-synthetic"]');

    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('alert')).toContainText(
      'Some saved UDS data could not be read safely.'
    );
    await expect(row).toHaveCount(0);
    await expect(drawer).not.toContainText('Malformed, Synthetic');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(original);
  });

  test('restores the exact signed lifecycle after workflow remount and guards its addendum', async ({ page }) => {
    await boot(page, [completedRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-completed-synthetic"]').click();
    await expect(panel.locator('fieldset').first()).toHaveAttribute('disabled', '');
    const savedAddendum = panel.locator(
      '[data-uds-saved-addendum="uds-existing-addendum"]'
    );
    const savedTimestamp = savedAddendum.locator('time');
    const displayedTimestamp = await page.evaluate((value) =>
      new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }), completedRecord.addenda[0].createdAt);
    await expect(savedAddendum).toContainText('Existing synthetic clarification.');
    await expect(savedTimestamp).toHaveAttribute(
      'datetime',
      completedRecord.addenda[0].createdAt
    );
    await expect(savedTimestamp).toHaveText(displayedTimestamp);

    await page.locator('.cd2004-nav-item[title="Injection"]').click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await page.locator('.cd2004-nav-item[title="UDS"]').click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
    await expect(panel.locator('fieldset').first()).toHaveAttribute('disabled', '');
    await expect(savedAddendum).toBeVisible();
    await expect(savedTimestamp).toHaveText(displayedTimestamp);

    const addendum = panel.locator('[data-addendum-input]');
    await addendum.fill('Pending synthetic clarification.');
    await page.locator('.cd2004-nav-item[title="Injection"]').click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
    await expect(addendum).toBeFocused();
    await expect(addendum).toHaveValue('Pending synthetic clarification.');
  });

  test('does not render an unsafe saved UDS addendum date as Invalid Date', async ({ page }) => {
    const recordWithBadHistoricalDate = JSON.parse(JSON.stringify(completedRecord));
    recordWithBadHistoricalDate.addenda[0].createdAt = 'not-a-date';
    await boot(page, [recordWithBadHistoricalDate]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-completed-synthetic"]').click();

    const timestamp = panel.locator(
      '[data-uds-saved-addendum="uds-existing-addendum"] time'
    );
    await expect(timestamp).toBeVisible();
    await expect(timestamp).toHaveText('—');
    await expect(timestamp).not.toHaveAttribute('datetime');
    await expect(timestamp).not.toContainText('Invalid Date');
  });

  test('preserves a pending addendum author across handoff, then defaults the next one to current staff', async ({ page }) => {
    await boot(page, [completedRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-completed-synthetic"]').click();

    await signIn(page, 'Alice Synthetic, MA');
    const author = panel.locator(
      'input[placeholder="Current staff name or initials"]'
    );
    const addendum = panel.locator('[data-addendum-input]');
    await expect(author).toHaveValue('Alice Synthetic, MA');
    await addendum.fill('Authored before the synthetic handoff.');

    await signIn(page, 'Bob Synthetic, MA');
    await expect(author).toHaveValue('Alice Synthetic, MA');
    await panel.getByRole('button', { name: 'Save addendum', exact: true }).click();
    const savedAddendum = panel.locator('.wfp-preview')
      .filter({ hasText: 'Authored before the synthetic handoff.' });
    await expect(savedAddendum).toContainText('Alice Synthetic, MA');
    await expect(savedAddendum).toContainText('Authored before the synthetic handoff.');
    await expect(author).toHaveValue('Bob Synthetic, MA');
  });

  test('blocks F12 and navigation saves when the active UDS draft changed elsewhere', async ({ page }) => {
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-switch-target"]').click();

    const patientName = panel.locator('input[placeholder="Last, First"]');
    await patientName.fill('Local Edit, Synthetic');
    const externalRaw = await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      record.snapshot.comment = 'Synthetic update saved by another tab.';
      record.summary = 'Synthetic external draft revision';
      record.updatedAt = '2026-09-06T13:00:00.000Z';
      const serialized = JSON.stringify(records);
      localStorage.setItem(key, serialized);
      return serialized;
    }, { key: UDS_RECORDS_KEY, id: targetRecord.id });

    await page.keyboard.press('F12');
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('changed in another browser tab');
    await expect(patientName).toHaveValue('Local Edit, Synthetic');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);

    await page.locator('.cd2004-nav-item[title="Injection"]').click();
    await expect(page.locator('.cd2004-shell'))
      .toHaveAttribute('data-active-workflow', 'uds');
    await expect(patientName).toHaveValue('Local Edit, Synthetic');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);
  });

  test('does not discard or recreate an active UDS draft deleted elsewhere', async ({ page }) => {
    await boot(page, [targetRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-switch-target"]').click();

    const externalRaw = await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const serialized = JSON.stringify(records.filter((entry) => entry.id !== id));
      localStorage.setItem(key, serialized);
      return serialized;
    }, { key: UDS_RECORDS_KEY, id: targetRecord.id });

    await panel.getByRole('button', { name: 'Discard draft…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Discard draft' });
    await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('changed in another browser tab');
    await expect(panel.locator('input[placeholder="Last, First"]'))
      .toHaveValue('Target, Synthetic');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);
  });

  test('does not sign an active UDS draft that changed elsewhere', async ({ page }) => {
    await boot(page);
    await signIn(page);
    const panel = page.locator('.wfp-panel');
    await fillAttestableEncounter(page, panel);
    await panel.getByRole('region', { name: 'UDS note actions' })
      .getByRole('button', { name: 'Save', exact: true }).click();
    const activeId = await page.evaluate((key) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return records[0]?.id;
    }, UDS_RECORDS_KEY);
    expect(activeId).toBeTruthy();

    const externalRaw = await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      record.snapshot.comment = 'Synthetic review added by another tab.';
      record.updatedAt = '2026-09-06T13:20:00.000Z';
      const serialized = JSON.stringify(records);
      localStorage.setItem(key, serialized);
      return serialized;
    }, { key: UDS_RECORDS_KEY, id: activeId });

    await panel.getByRole('region', { name: 'UDS note actions' })
      .getByRole('button', { name: 'Sign', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign' });
    await dialog.getByRole('checkbox', { name: /I reviewed this note/ }).check();
    await dialog.getByRole('button', { name: 'Sign', exact: true }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('changed in another browser tab');
    await expect(panel.locator('fieldset').first()).not.toHaveAttribute('disabled', '');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);
  });

  test('preserves a pending addendum when its completed UDS record changed elsewhere', async ({ page }) => {
    await boot(page, [completedRecord]);
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('button', { name: /Open UDS notes/ }).click();
    await page.locator('[data-records-open="uds-completed-synthetic"]').click();
    await signIn(page, 'Local Addendum, Test MA');

    const author = panel.locator('input[placeholder="Current staff name or initials"]');
    const addendum = panel.locator('[data-addendum-input]');
    await addendum.fill('Pending synthetic note from this tab.');
    const externalRaw = await page.evaluate(({ key, id }) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find((entry) => entry.id === id);
      record.addenda.push({
        id: 'external-synthetic-addendum',
        createdAt: '2026-09-06T13:30:00.000Z',
        author: 'Other Tab, Test MA',
        text: 'Synthetic clarification saved by another tab.'
      });
      record.updatedAt = '2026-09-06T13:30:00.000Z';
      const serialized = JSON.stringify(records);
      localStorage.setItem(key, serialized);
      return serialized;
    }, { key: UDS_RECORDS_KEY, id: completedRecord.id });

    await panel.getByRole('button', { name: 'Save addendum', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'UDS note actions' }))
      .toContainText('changed in another browser tab');
    await expect(addendum).toHaveValue('Pending synthetic note from this tab.');
    await expect(author).toHaveValue('Local Addendum, Test MA');
    expect(await page.evaluate((key) => localStorage.getItem(key), UDS_RECORDS_KEY))
      .toBe(externalRaw);
  });
});
