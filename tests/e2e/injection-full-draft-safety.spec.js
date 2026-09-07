const { test, expect } = require('@playwright/test');
const { selectRegisteredProvider } = require('./provider-entry');

const RECORDS_KEY = 'ipmgMedAssistInjectionRecordsV1';

test.use({
  locale: 'en-US',
  reducedMotion: 'reduce',
  timezoneId: 'America/Los_Angeles'
});

const targetRecord = {
  id: 'synthetic-open-target',
  type: 'injection',
  status: 'draft',
  createdAt: '2026-09-01T08:00:00-07:00',
  updatedAt: '2026-09-01T08:05:00-07:00',
  completedAt: '',
  patient: { name: 'Target, Synthetic', dob: '01/02/1990' },
  summary: 'Synthetic target medication',
  snapshot: {
    version: 4,
    medKey: 'sustenna',
    state: {
      customMedication: '',
      dose: '156 mg',
      route: 'IM',
      site: 'L deltoid',
      intervalKey: 'q4wk',
      reason: 'prn'
    },
    initiation: {},
    smartVitals: {},
    disposition: {},
    fields: {
      ptName: 'Target, Synthetic',
      ptDOB: '01/02/1990',
      allergies: 'Synthetic target allergy',
      injProductSource: 'Other',
      injProductSourceOther: 'Synthetic custom source',
      futureInjectionField: 'preserved-synthetic-sentinel'
    },
    safetyNone: false,
    note: { cc: '', as: '', pl: '' },
    documentation: {}
  },
  addenda: []
};

async function boot(page, records = []) {
  await page.addInitScript(({ key, seed }) => {
    window.__injectionNativeSetItem = Storage.prototype.setItem;
    if (sessionStorage.getItem('__injectionSafetyBooted') !== 'true') {
      localStorage.clear();
      sessionStorage.clear();
      if (seed.length) localStorage.setItem(key, JSON.stringify(seed));
      sessionStorage.setItem('__injectionSafetyBooted', 'true');
    }
  }, { key: RECORDS_KEY, seed: records });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}

async function bootWithLockedStoragePrototype(page, records = []) {
  await page.addInitScript(({ key, records: seed }) => {
    localStorage.clear();
    sessionStorage.clear();
    const nativeSetItem = Storage.prototype.setItem;
    if (seed.length) nativeSetItem.call(localStorage, key, JSON.stringify(seed));
    window.__injectionRecordWrites = 0;
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: false,
      writable: false,
      value(nextKey, nextValue) {
        if (nextKey === key) window.__injectionRecordWrites += 1;
        return nativeSetItem.call(this, nextKey, nextValue);
      }
    });
  }, { key: RECORDS_KEY, records });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}

async function openInjection(page) {
  await page.locator('.cd2004-nav-item[title="Injection"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'administer'
  );
  const panel = page.locator('.wfp-panel');
  return panel;
}

async function selectOnlyReason(panel, value = 'scheduled') {
  await panel.locator('select[name="inj-reason"]').selectOption(value);
}

async function storedReason(page, value) {
  return page.evaluate(({ key, expected }) => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    const match = records.find(record =>
      record?.snapshot?.state?.reason === expected &&
      !record?.patient?.name &&
      !record?.patient?.dob
    );
    if (!match) return null;
    return {
      reason: match.snapshot.state.reason,
      provider: match.snapshot.fields.orderingProvider || '',
      patient: match.patient
    };
  }, { key: RECORDS_KEY, expected: value });
}

test('Dashboard quarantines malformed Injection display fields before render', async ({ page }) => {
  const malformedDisplayRecord = {
    ...targetRecord,
    patient: { name: { unsafe: true }, dob: '01/02/1990' },
    summary: { unsafe: true }
  };
  const originalBytes = JSON.stringify([malformedDisplayRecord]);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await boot(page, [malformedDisplayRecord]);

  await expect(page.locator('.cd2004-shell')).toBeVisible();
  await expect(page.locator('[data-worklist-row="drafts"]')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(originalBytes);
});

test('files a typed-only blank Injection exactly from the visible Save action', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);

  const save = page.locator(
    '[data-injection-record-actions] [data-injection-save]'
  );
  await expect(save).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await save.click();

  await expect.poll(() => storedReason(page, 'scheduled')).toEqual({
    reason: 'scheduled',
    provider: '',
    patient: { name: '', dob: '' }
  });
  await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
  await expect.poll(() => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
});

test('capture-phase pagehide files a typed-only blank Injection', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

  await expect.poll(() => storedReason(page, 'scheduled')).not.toBeNull();
  await expect.poll(() => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
});

test('keeps Injection non-editable when exact draft protection cannot install', async ({ page }) => {
  await bootWithLockedStoragePrototype(page);
  const panel = await openInjection(page);
  const reason = panel.locator('select[name="inj-reason"]');

  await expect(reason).toBeDisabled();
  await expect(panel).toContainText('Protection unavailable');
  const lifecycle = page.locator('[data-injection-record-actions]');
  await expect(lifecycle).toContainText(
    'Exact Injection draft protection is unavailable. Reload before signing.'
  );
  await expect(lifecycle.locator('button')).toHaveCount(0);
  await reason.evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, 'scheduled');
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__injectionRecordWrites)).toBe(0);
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBeNull();
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
});

test('refuses an editable saved Injection when pagehide protection cannot install', async ({ page, context }) => {
  await bootWithLockedStoragePrototype(page, [targetRecord]);
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('stayed open');
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
  await expect.poll(() => page.evaluate(() =>
    window.IPMGRecords?.state?.().activeRecordId || ''
  )).toBe('');

  const otherPage = await context.newPage();
  await otherPage.goto('/');
  const newerBytes = await otherPage.evaluate(({ key, original }) => {
    const newer = {
      ...original,
      summary: 'Synthetic newer browser-tab revision',
      updatedAt: '2026-09-07T09:00:00.000Z'
    };
    const extra = {
      ...original,
      id: 'synthetic-other-tab-extra',
      patient: { name: 'Other Tab, Synthetic', dob: '03/04/1993' },
      snapshot: {
        ...original.snapshot,
        fields: {
          ...original.snapshot.fields,
          ptName: 'Other Tab, Synthetic',
          ptDOB: '03/04/1993'
        }
      }
    };
    const serialized = JSON.stringify([newer, extra]);
    localStorage.setItem(key, serialized);
    return serialized;
  }, { key: RECORDS_KEY, original: targetRecord });
  await otherPage.close();

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(newerBytes);
  expect(await page.evaluate(() => window.__injectionRecordWrites)).toBe(0);
});

test('debounced typed-only additional-note edit persists without a manual save', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  let dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await panel.locator('#inj-site-assessed').evaluate(input => input.click());

  await expect.poll(() => page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    return records.find(record => record.id === 'synthetic-open-target')
      ?.snapshot?.documentation?.typedEncounterV1?.details?.siteAssessed;
  }, RECORDS_KEY)).toBe(true);

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
  await openInjection(page);
  await page.keyboard.press('F11');
  dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(panel.locator('#inj-site-assessed')).toBeChecked();
});

test('keeps a reopened Injection draft editable while changing patient and medication identity', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  let dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();

  const patientName = panel.locator('input[placeholder="Last, First"]');
  const patientDob = panel.locator('input[placeholder="MM/DD/YYYY"]');
  const medication = panel.locator('select[name="inj-medication"]');
  await patientName.fill('Changed, Synthetic');
  await patientDob.fill('03/04/1991');
  await medication.selectOption('maintena');

  await expect(patientName).toBeEnabled();
  await expect(patientDob).toBeEnabled();
  await expect(medication).toBeEnabled();
  await expect(panel).not.toContainText('Protection unavailable');
  await page.locator(
    '[data-injection-record-actions] [data-injection-save]'
  ).click();

  await expect.poll(() => page.evaluate(key => {
    const record = JSON.parse(localStorage.getItem(key) || '[]')
      .find(entry => entry.id === 'synthetic-open-target');
    return record && {
      patient: record.patient,
      fieldPatient: {
        name: record.snapshot.fields.ptName,
        dob: record.snapshot.fields.ptDOB
      },
      medication: record.snapshot.medKey
    };
  }, RECORDS_KEY)).toEqual({
    patient: { name: 'Changed, Synthetic', dob: '03/04/1991' },
    fieldPatient: { name: 'Changed, Synthetic', dob: '03/04/1991' },
    medication: 'maintena'
  });

  await page.reload();
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
  await openInjection(page);
  await page.keyboard.press('F11');
  dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await expect(patientName).toHaveValue('Changed, Synthetic');
  await expect(patientDob).toHaveValue('03/04/1991');
  await expect(medication).toHaveValue('maintena');
});

test('files a typed-only blank Injection before Start new replaces it', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);

  await page.locator(
    '[data-injection-record-actions] [data-injection-new]'
  ).click();
  await expect(panel.locator('select[name="inj-reason"]')).toHaveValue('');
  await expect.poll(() => storedReason(page, 'scheduled')).not.toBeNull();
});

test('files a typed-only blank Injection before opening another saved note', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);

  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await expect(dialog).toBeVisible();
  await dialog.locator('#recordsDrawerSearch').fill('Target, Synthetic');
  await dialog.locator('[data-records-open]').click();

  await expect(dialog).toBeHidden();
  await expect(panel.locator('input[placeholder="Last, First"]'))
    .toHaveValue('Target, Synthetic');
  await expect.poll(() => storedReason(page, 'scheduled')).not.toBeNull();
  expect(await page.evaluate(key => {
    const target = JSON.parse(localStorage.getItem(key) || '[]')
      .find(record => record.id === 'synthetic-open-target');
    return target.snapshot.fields.futureInjectionField;
  }, RECORDS_KEY)).toBe('preserved-synthetic-sentinel');
});

test('files a typed-only blank Injection before same-task workflow navigation', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  // Deliberately dispatch the edit and navigation click in one browser task.
  // The persistence guard must read the panel's synchronous encounter ref,
  // not the previous render that an effect would publish later.
  await panel.locator('select[name="inj-reason"]').evaluate(
    (select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.cd2004-nav-item[title="Forms"]')?.click();
    },
    'scheduled'
  );
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
  await expect.poll(() => storedReason(page, 'scheduled')).not.toBeNull();
});

test('same-task discard confirmation and pagehide cannot resurrect the draft', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);
  await expect.poll(() => storedReason(page, 'scheduled')).not.toBeNull();
  await page.locator(
    '[data-injection-record-actions] [data-injection-discard]'
  ).click();
  const dialog = page.getByRole('dialog', { name: 'Discard draft' });
  await dialog.getByRole('button', { name: 'Discard draft', exact: true })
    .evaluate(button => {
      button.click();
      window.dispatchEvent(new Event('pagehide'));
    });

  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) || '[]').length,
  RECORDS_KEY)).toBe(0);
});

test('typed-only unsaved Injection can be discarded before its debounce fires', async ({ page }) => {
  await boot(page);
  const panel = await openInjection(page);
  await selectOnlyReason(panel);
  await page.locator(
    '[data-injection-record-actions] [data-injection-discard]'
  ).click();
  const dialog = page.getByRole('dialog', { name: 'Discard draft' });
  await dialog.getByRole('button', { name: 'Discard draft', exact: true })
    .evaluate(button => {
      button.click();
      window.dispatchEvent(new Event('pagehide'));
    });

  await expect(dialog).toBeHidden();
  await expect(panel.locator('select[name="inj-reason"]')).toHaveValue('');
  await page.waitForTimeout(800);
  await expect.poll(() => page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) || '[]').length,
  RECORDS_KEY)).toBe(0);
});

test('restores the prior workflow when legacy open activates Injection before a failed write', async ({ page }) => {
  await boot(page, [targetRecord]);
  await openInjection(page);
  await page.keyboard.press('F11');
  let dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );

  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('synthetic write failure');
    };
  });
  await page.keyboard.press('F11');
  dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('stayed open');
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
});

test('refuses a saved Injection with corrupt presentation metadata before opening it', async ({ page }) => {
  const corruptRecord = {
    ...targetRecord,
    id: 'synthetic-corrupt-target',
    snapshot: {
      ...targetRecord.snapshot,
      documentation: { typedEncounterV1: { version: 'corrupt' } }
    }
  };
  await boot(page, [corruptRecord]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-records-open]')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toContainText(
    'Some saved Injection data could not be read safely'
  );
  await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
  await expect.poll(() => page.evaluate(() =>
    window.IPMGRecords?.state?.().activeRecordId || ''
  )).toBe('');
});

test('excludes and refuses a saved Injection with mismatched patient identity', async ({ page }) => {
  const mismatched = {
    ...targetRecord,
    id: 'synthetic-mismatched-target',
    snapshot: {
      ...targetRecord.snapshot,
      fields: {
        ...targetRecord.snapshot.fields,
        ptName: 'Different, Synthetic'
      }
    }
  };
  await boot(page, [mismatched]);
  const search = page.locator('[data-patient-search] input');
  await search.fill('Target');
  await expect(page.locator('[data-patient-result]')).toHaveCount(0);

  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-records-open]')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toContainText(
    'Some saved Injection data could not be read safely'
  );
  await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
});

test('refuses stale external Injection data for open and save without changing bytes', async ({ page }) => {
  await boot(page, [targetRecord]);
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  const externalBytes = await page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    records[0].summary = 'Externally updated synthetic record';
    records[0].updatedAt = '2026-09-07T20:00:00Z';
    const next = JSON.stringify(records);
    window.__injectionNativeSetItem.call(localStorage, key, next);
    return next;
  }, RECORDS_KEY);

  await page.keyboard.press('F11');
  let dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('stayed open');
  await dialog.locator('.records-drawer-cancel').click();

  const panel = await openInjection(page);
  await expect(panel.locator('select[name="inj-reason"]')).toBeDisabled();
  await page.keyboard.press('F12');
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(externalBytes);
});

test('completed addendum preserves the locked Injection snapshot exactly', async ({ page }) => {
  const completed = {
    ...targetRecord,
    status: 'completed',
    completedAt: '2026-09-01T08:10:00-07:00',
    snapshot: {
      ...targetRecord.snapshot,
      documentation: {
        existing: 'locked',
        typedEncounterV1: {
          version: 2,
          orderingProvider: '',
          habitus: '',
          weight: '',
          weightUnit: '',
          pairedSecondNdc: '',
          response: { kind: '', custom: '' },
          details: {
            siteAssessed: false,
            postInjectionObservation: false,
            educationProvided: false,
            departureStatus: '',
            departureStatusNote: ''
          }
        }
      }
    },
    attestation: {
      staff: 'Synthetic Signer',
      timestamp: '2026-09-01T08:10:00-07:00',
      statementVersion: 'local-attestation-v1'
    }
  };
  await boot(page, [completed]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  const before = await page.evaluate(key => {
    const record = JSON.parse(localStorage.getItem(key) || '[]')[0];
    return record.snapshot;
  }, RECORDS_KEY);

  await panel.locator('.wfp-field:has-text("Addendum entered by") input')
    .fill('Synthetic Addendum Staff');
  await panel.locator('textarea[data-addendum-input]')
    .fill('Synthetic append-only clarification.');
  await panel.getByRole('button', { name: 'Save addendum', exact: true }).click();

  const after = await expect.poll(() => page.evaluate(key => {
    const record = JSON.parse(localStorage.getItem(key) || '[]')[0];
    return record.addenda?.length
      ? { snapshot: record.snapshot, addenda: record.addenda }
      : null;
  }, RECORDS_KEY)).not.toBeNull();
  void after;
  const stored = await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) || '[]')[0], RECORDS_KEY
  );
  expect(stored.snapshot).toEqual(before);
  expect(stored.addenda[0].text).toBe('Synthetic append-only clarification.');
});

test('reopens exact structured response and additional-note facts from the saved draft', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  let dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await selectRegisteredProvider(panel, 'syed-hozair');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByRole('radio', { name: 'Larger SubQ', exact: true })
    .evaluate(input => input.click());
  await panel.getByRole('textbox', { name: 'Patient weight' }).evaluate(
    (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    '215'
  );
  await panel.getByRole('radio', { name: 'LB', exact: true })
    .evaluate(input => input.click());
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();

  await panel.locator('select[name="inj-response"]').selectOption('bleed');
  await panel.locator('select[name="inj-response-detail"]').selectOption('extended');
  await panel.locator('#inj-site-assessed').check();
  await panel.locator('#inj-post-observation').check();
  await panel.locator('#inj-education-provided').check();
  await panel.locator('select[name="inj-departure-status"]').selectOption('custom');
  await panel.locator(
    '[data-field-path="details.departureStatusNote"] input'
  ).fill('Left with synthetic escort.');
  await page.locator(
    '[data-injection-record-actions] [data-injection-save]'
  ).click();
  await page.locator(
    '[data-injection-record-actions] [data-injection-new]'
  ).click();

  await page.keyboard.press('F11');
  dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('#recordsDrawerSearch').fill('Target, Synthetic');
  await dialog.locator('[data-records-open]').click();
  await expect(panel.locator('[data-provider-field] select').first())
    .toHaveValue('syed-hozair');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await expect(panel.getByRole('radio', { name: 'Larger SubQ', exact: true }))
    .toBeChecked();
  await expect(panel.getByRole('textbox', { name: 'Patient weight' }))
    .toHaveValue('215');
  await expect(panel.getByRole('radio', { name: 'LB', exact: true }))
    .toBeChecked();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();

  await expect(panel.locator('select[name="inj-response"]')).toHaveValue('bleed');
  await expect(panel.locator('select[name="inj-response-detail"]'))
    .toHaveValue('extended');
  await expect(panel.locator('#inj-site-assessed')).toBeChecked();
  await expect(panel.locator('#inj-post-observation')).toBeChecked();
  await expect(panel.locator('#inj-education-provided')).toBeChecked();
  await expect(panel.locator('select[name="inj-departure-status"]'))
    .toHaveValue('custom');
  await expect(panel.locator(
    '[data-field-path="details.departureStatusNote"] input'
  )).toHaveValue('Left with synthetic escort.');

  const stored = await page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    return records.find(record => record.id === 'synthetic-open-target');
  }, RECORDS_KEY);
  expect(stored.snapshot.documentation.typedEncounterV1).toMatchObject({
    version: 2,
    response: { kind: 'bleed', detail: 'extended' },
    details: {
      siteAssessed: true,
      postInjectionObservation: true,
      educationProvided: true,
      departureStatus: 'custom',
      departureStatusNote: 'Left with synthetic escort.'
    }
  });
  expect(stored.snapshot.documentation.typedEncounterV1).toMatchObject({
    orderingProvider: 'syed-hozair',
    habitus: 'larger',
    weight: '215',
    weightUnit: 'lb'
  });
  expect(stored.snapshot.fields.injProductSourceOther)
    .toBe('Synthetic custom source');
  expect(JSON.stringify(stored)).not.toContain('typed draft bootstrap');
});

test('a valid presentation-only external change locks output but does not trap clean navigation', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();
  await selectOnlyReason(panel, 'scheduled');
  await page.locator(
    '[data-injection-record-actions] [data-injection-save]'
  ).click();

  const externalBytes = await page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    records[0].snapshot.documentation.typedEncounterV1.orderingProvider =
      'external-provider-id';
    const next = JSON.stringify(records);
    window.__injectionNativeSetItem.call(localStorage, key, next);
    window.dispatchEvent(new StorageEvent('storage', {
      key,
      newValue: next,
      storageArea: localStorage
    }));
    return next;
  }, RECORDS_KEY);

  await expect(panel.locator('select[name="inj-reason"]')).toBeDisabled();
  await expect(page.locator('[data-injection-record-actions]')).toContainText(
    'Saved Injection data could not be verified'
  );
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(externalBytes);
});

test('a clear storage event immediately locks Injection until reload', async ({ page }) => {
  await boot(page, [targetRecord]);
  const panel = await openInjection(page);
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: null,
      storageArea: localStorage
    }));
  });

  await expect(panel.locator('select[name="inj-reason"]')).toBeDisabled();
  await expect(page.locator('[data-injection-record-actions]')).toContainText(
    'Saved Injection data could not be verified'
  );
});

test('preflight refuses malformed addenda before legacy can partially open the row', async ({ page }) => {
  const completed = {
    ...targetRecord,
    status: 'completed',
    completedAt: '2026-09-01T08:10:00-07:00'
  };
  await boot(page, [completed]);
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  const row = dialog.locator('[data-records-open]');
  await expect(row).toHaveCount(1);
  const corruptBytes = await page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    records[0].addenda = {};
    const next = JSON.stringify(records);
    window.__injectionNativeSetItem.call(localStorage, key, next);
    return next;
  }, RECORDS_KEY);

  await row.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('stayed open');
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
  await expect.poll(() => page.evaluate(() =>
    window.IPMGRecords?.state?.().activeRecordId || ''
  )).toBe('');
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(corruptBytes);
});

test('preflight refuses a wrong known snapshot leaf before legacy restore', async ({ page }) => {
  await boot(page, [targetRecord]);
  await page.locator('.cd2004-nav-item[title="Forms"]').click();
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  const row = dialog.locator('[data-records-open]');
  await expect(row).toHaveCount(1);
  const corruptBytes = await page.evaluate(key => {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    records[0].snapshot.note.cc = { toString: null, valueOf: null };
    const next = JSON.stringify(records);
    window.__injectionNativeSetItem.call(localStorage, key, next);
    return next;
  }, RECORDS_KEY);

  await row.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('stayed open');
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    'forms'
  );
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(corruptBytes);
});

test('legacy open projects only Injection-panel fields and preserves unknown data', async ({ page }) => {
  const withCrossWorkflowCollisions = {
    ...targetRecord,
    snapshot: {
      ...targetRecord.snapshot,
      fields: {
        ...targetRecord.snapshot.fields,
        staffSignIn: 'must-not-replace-staff',
        udsPtName: 'must-not-replace-uds-patient',
        'panel-administer': 'must-not-mask-the-workflow-panel',
        clinicalDispositionBadge: 'must-not-mask-the-disposition-output',
        futureInjectionField: 'preserve-without-restoring'
      }
    }
  };
  await boot(page, [withCrossWorkflowCollisions]);
  await openInjection(page);
  await page.evaluate(() => {
    document.querySelector('#staffSignIn').value = 'Safe Staff';
    document.querySelector('#udsPtName').value = 'Safe UDS Patient';
  });
  const storedFutureField = () => page.evaluate(key => {
    const stored = JSON.parse(localStorage.getItem(key) || '[]')
      .find(record => record.id === 'synthetic-open-target');
    return stored.snapshot.fields.futureInjectionField;
  }, RECORDS_KEY);
  expect(await storedFutureField()).toBe('preserve-without-restoring');
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();

  expect(await page.evaluate(() => ({
    staff: document.querySelector('#staffSignIn').value,
    udsPatient: document.querySelector('#udsPtName').value
  }))).toEqual({ staff: 'Safe Staff', udsPatient: 'Safe UDS Patient' });
  expect(await storedFutureField()).toBe('preserve-without-restoring');
});

test('legacy open ignores an unknown field that collides with a dynamically created control', async ({ page }) => {
  const dynamicCollision = {
    ...targetRecord,
    id: 'synthetic-dynamic-field-collision',
    summary: 'Synthetic paired initiation',
    snapshot: {
      ...targetRecord.snapshot,
      medKey: 'maintena',
      state: {
        ...targetRecord.snapshot.state,
        dose: '400 mg',
        reason: 'initiation'
      },
      initiation: {
        protocol: 'maintena-1day',
        planVerified: true,
        oralStatus: 'administered',
        second: {
          productKey: 'maintena',
          dose: '400 mg',
          site: 'R deltoid',
          ndc: '22222-2222-22',
          lot: 'SYNTHETIC-SECOND',
          expiration: '2027-11',
          given: true,
          orderVerified: true
        }
      },
      fields: {
        ...targetRecord.snapshot.fields,
        initSecondNdc: { toString: null, valueOf: null }
      }
    }
  };
  const originalBytes = JSON.stringify([dynamicCollision]);
  await boot(page, [dynamicCollision]);
  await openInjection(page);
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await dialog.locator('[data-records-open]').click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    window.IPMGRecords?.state?.().activeRecordId || ''
  )).toBe(dynamicCollision.id);
  await expect(page.locator('#initSecondNdc')).toHaveValue('22222-2222-22');
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(originalBytes);
});

test('a completed Injection is disabled in the same task that opens it', async ({ page }) => {
  const completed = {
    ...targetRecord,
    status: 'completed',
    completedAt: '2026-09-01T08:10:00-07:00'
  };
  await boot(page, [completed]);
  const panel = await openInjection(page);
  await page.keyboard.press('F11');
  const row = page.locator('[data-records-open]');
  const immediate = await row.evaluate(button => {
    button.click();
    const reason = document.querySelector('.wfp-panel select[name="inj-reason"]');
    const disabled = reason.matches(':disabled');
    reason.value = 'scheduled';
    reason.dispatchEvent(new Event('change', { bubbles: true }));
    return disabled;
  });

  expect(immediate).toBe(true);
  await expect(panel.locator('select[name="inj-reason"]')).toBeDisabled();
  await expect(panel.locator('select[name="inj-reason"]')).toHaveValue('prn');
  expect(await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) || '[]')[0].snapshot.state.reason,
  RECORDS_KEY)).toBe('prn');
});

test('mixed malformed Injection storage keeps a blank worksheet quarantined', async ({ page }) => {
  const malformed = {
    ...targetRecord,
    id: 'synthetic-malformed-sibling',
    addenda: {}
  };
  const originalBytes = JSON.stringify([targetRecord, malformed]);
  await boot(page, [targetRecord, malformed]);
  const panel = await openInjection(page);

  await expect(panel.locator('select[name="inj-reason"]')).toBeDisabled();
  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await expect(dialog.getByRole('alert')).toContainText(
    'Some saved Injection data could not be read safely'
  );
  await expect(dialog.locator('[data-records-new]')).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY))
    .toBe(originalBytes);
});

test('duplicate Injection ids are quarantined from the drawer and patient chart', async ({ page }) => {
  await boot(page, [targetRecord, { ...targetRecord }]);
  const search = page.locator('[data-patient-search] input');
  await search.fill('Target');
  await expect(page.locator('[data-patient-result]')).toHaveCount(0);

  await page.keyboard.press('F11');
  const dialog = page.locator(
    'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
  );
  await expect(dialog.locator('[data-records-open]')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toContainText(
    'Some saved Injection data could not be read safely'
  );
  await expect(dialog.locator('[data-records-new]')).toBeDisabled();
});
