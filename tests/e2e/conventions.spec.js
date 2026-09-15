const { test, expect } = require('@playwright/test');

const INJECTION_RECORDS_KEY = 'ipmgMedAssistInjectionRecordsV1';
const EXPECTED_COLUMNS = ['Patient', 'Lock', 'Type', 'Status', 'Visit Date'];

const SYNTHETIC_INJECTION_RECORDS = [
  {
    id: 'conventions-newest',
    type: 'injection',
    status: 'draft',
    createdAt: '2026-06-01T08:00:00-07:00',
    updatedAt: '2026-06-01T08:05:00-07:00',
    completedAt: '',
    patient: { name: 'Baker, Test', dob: '02/03/1992' },
    summary: 'Synthetic medication B',
    snapshot: {
      version: 4,
      medKey: 'other',
      state: { customMedication: 'Synthetic medication B' },
      initiation: {},
      smartVitals: {},
      disposition: {},
      fields: {
        ptName: 'Baker, Test',
        ptDOB: '02/03/1992',
        adminDate: '2026-08-03'
      },
      safetyNone: false,
      note: { cc: '', as: '', pl: '' }
    },
    addenda: []
  },
  {
    id: 'conventions-signed',
    type: 'injection',
    status: 'completed',
    createdAt: '2026-07-02T08:00:00-07:00',
    updatedAt: '2026-08-31T12:00:00-07:00',
    completedAt: '2026-08-02T09:41:00-07:00',
    patient: { name: 'Diaz, Test', dob: '04/05/1988' },
    summary: 'Synthetic medication D',
    snapshot: {
      version: 4,
      medKey: 'other',
      state: { customMedication: 'Synthetic medication D' },
      initiation: {},
      smartVitals: {},
      disposition: {},
      fields: {
        ptName: 'Diaz, Test',
        ptDOB: '04/05/1988',
        adminDate: '2026-08-02'
      },
      safetyNone: false,
      note: { cc: '', as: '', pl: '' }
    },
    addenda: [],
    attestation: {
      staff: 'Taylor Test, MA',
      timestamp: '2026-08-02T09:41:00-07:00',
      statementVersion: 'local-attestation-v1'
    }
  },
  {
    id: 'conventions-created-fallback',
    type: 'injection',
    status: 'draft',
    createdAt: '2026-08-01T10:15:00-07:00',
    updatedAt: '2026-09-01T12:00:00-07:00',
    completedAt: '',
    patient: { name: 'Adams, Test', dob: '06/07/1990' },
    summary: 'Synthetic medication A',
    snapshot: {
      version: 4,
      medKey: 'other',
      state: { customMedication: 'Synthetic medication A' },
      initiation: {},
      smartVitals: {},
      disposition: {},
      fields: {
        ptName: 'Adams, Test',
        ptDOB: '06/07/1990'
      },
      safetyNone: false,
      note: { cc: '', as: '', pl: '' }
    },
    addenda: []
  },
  {
    id: 'conventions-oldest',
    type: 'injection',
    status: 'draft',
    createdAt: '2026-09-02T12:00:00-07:00',
    updatedAt: '2026-09-02T12:05:00-07:00',
    completedAt: '',
    patient: { name: 'Carter, Test', dob: '08/09/1994' },
    summary: 'Synthetic medication C',
    snapshot: {
      version: 4,
      medKey: 'other',
      state: { customMedication: 'Synthetic medication C' },
      initiation: {},
      smartVitals: {},
      disposition: {},
      fields: {
        ptName: 'Carter, Test',
        ptDOB: '08/09/1994',
        adminDate: '2026-07-15'
      },
      safetyNone: false,
      note: { cc: '', as: '', pl: '' }
    },
    addenda: []
  }
];

test.use({
  locale: 'en-US',
  reducedMotion: 'reduce',
  timezoneId: 'America/Los_Angeles'
});

async function bootWithSyntheticNotes(page, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript(({ key, records }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(key, JSON.stringify(records));
  }, { key: INJECTION_RECORDS_KEY, records: SYNTHETIC_INJECTION_RECORDS });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}

async function openGlobalNotes(page) {
  const launcher = page.getByRole('button', { name: /Open saved notes \(F11\)/ });
  await launcher.click();
  const dialog = page.locator('dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer');
  await expect(dialog).toBeVisible();
  return { dialog, launcher, table: dialog.locator('table.notes-table') };
}

async function recordOrder(table) {
  return table.locator('tbody [data-records-open]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-records-open'))
  );
}

async function recordStorageSnapshot(page) {
  return page.evaluate((key) => localStorage.getItem(key), INJECTION_RECORDS_KEY);
}

test.describe('Phase 3a global Open Notes conventions', () => {
  test('uses the five-column legacy ledger grammar and visit-date sorting without persistence writes', async ({ page }) => {
    await bootWithSyntheticNotes(page);
    const { table } = await openGlobalNotes(page);

    await expect(table).toBeVisible();
    const columnHeaders = table.getByRole('columnheader');
    await expect(columnHeaders).toHaveCount(EXPECTED_COLUMNS.length);
    expect((await columnHeaders.allTextContents()).map((text) => text.trim()))
      .toEqual(EXPECTED_COLUMNS);
    await expect(table.getByRole('columnheader', { name: 'Action', exact: true }))
      .toHaveCount(0);

    const headerColors = await table.locator('thead th').evaluateAll((headers) =>
      headers.map((header) => getComputedStyle(header).backgroundColor)
    );
    expect(new Set(headerColors)).toEqual(new Set(['rgb(210, 220, 218)']));

    const rows = table.locator('tbody [data-records-open]');
    await expect(rows).toHaveCount(SYNTHETIC_INJECTION_RECORDS.length);
    expect(await rows.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().height))
    )).toEqual([44, 44, 44, 44]);
    expect(await rows.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-note-type'))
    )).toEqual(['injection', 'injection', 'injection', 'injection']);

    const visitHeader = table.getByRole('columnheader', { name: 'Visit Date', exact: true });
    await expect(visitHeader).toHaveAttribute('aria-sort', 'descending');
    expect(await recordOrder(table)).toEqual([
      'conventions-newest',
      'conventions-signed',
      'conventions-created-fallback',
      'conventions-oldest'
    ]);

    const storageBefore = await recordStorageSnapshot(page);
    const visitSort = table.locator('[data-records-sort="visitDate"]');
    await visitSort.click();
    await expect(visitHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(await recordOrder(table)).toEqual([
      'conventions-oldest',
      'conventions-created-fallback',
      'conventions-signed',
      'conventions-newest'
    ]);
    await visitSort.click();
    await expect(visitHeader).toHaveAttribute('aria-sort', 'descending');

    const patientHeader = table.getByRole('columnheader', { name: 'Patient', exact: true });
    const patientSort = table.locator('[data-records-sort="patient"]');
    await patientSort.click();
    await expect(patientHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(await recordOrder(table)).toEqual([
      'conventions-created-fallback',
      'conventions-newest',
      'conventions-oldest',
      'conventions-signed'
    ]);
    await patientSort.click();
    await expect(patientHeader).toHaveAttribute('aria-sort', 'descending');
    expect(await recordOrder(table)).toEqual([
      'conventions-signed',
      'conventions-oldest',
      'conventions-newest',
      'conventions-created-fallback'
    ]);

    const typeHeader = table.getByRole('columnheader', { name: 'Type', exact: true });
    const typeSort = table.locator('[data-records-sort="type"]');
    await typeSort.click();
    await expect(typeHeader).toHaveAttribute('aria-sort', 'ascending');
    await typeSort.click();
    await expect(typeHeader).toHaveAttribute('aria-sort', 'descending');

    const statusChips = table.locator('.note-status-chip');
    await expect(statusChips).toHaveCount(SYNTHETIC_INJECTION_RECORDS.length);
    await expect(statusChips.filter({ hasText: 'Signed' })).toHaveCount(1);
    await expect(statusChips.filter({ hasText: 'Incomplete' })).toHaveCount(3);
    await expect(statusChips.filter({ hasText: 'Ready to sign' })).toHaveCount(0);
    expect(await statusChips.locator('svg').count()).toBe(SYNTHETIC_INJECTION_RECORDS.length);

    const signedRow = table.locator('[data-records-open="conventions-signed"]');
    const lock = signedRow.locator('[data-note-lock]');
    const tooltip = lock.locator('.note-lock-tooltip');
    await expect(lock).toHaveAccessibleName(
      'Signed by Taylor Test, MA · Aug 2, 9:41 AM'
    );
    await expect(tooltip).toHaveText('Signed by Taylor Test, MA · Aug 2, 9:41 AM');
    await expect(tooltip).toHaveCSS('opacity', '0');
    await lock.hover();
    await expect(tooltip).toHaveCSS('opacity', '1');
    await patientSort.hover();
    await expect(tooltip).toHaveCSS('opacity', '0');
    await signedRow.focus();
    await expect(signedRow).toBeFocused();
    await expect(tooltip).toHaveCSS('opacity', '1');

    expect(await recordStorageSnapshot(page)).toEqual(storageBefore);
  });

  for (const interaction of ['mouse', 'Enter', 'Space']) {
    test(`opens the whole note row with ${interaction}`, async ({ page }) => {
      await bootWithSyntheticNotes(page);
      const { dialog, table } = await openGlobalNotes(page);
      const row = table.locator('[data-records-open="conventions-signed"]');

      if (interaction === 'mouse') {
        await row.click({ position: { x: 12, y: 22 } });
      } else {
        await row.focus();
        await row.press(interaction);
      }

      await expect(dialog).toBeHidden();
      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        'administer'
      );
      await expect(
        page.locator('.wfp-panel input[placeholder="Last, First"]')
      ).toHaveValue('Diaz, Test');
      await expect(page.locator('.wfp-panel textarea[data-addendum-input]'))
        .toBeFocused();
    });
  }

  test('keeps the modal table reachable and focused at the 800 by 600 workstation floor', async ({ page }) => {
    await bootWithSyntheticNotes(page, { width: 800, height: 600 });
    const { dialog, launcher, table } = await openGlobalNotes(page);
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();

    const containment = await dialog.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        horizontalOverflow: node.scrollWidth - node.clientWidth
      };
    });
    expect(containment.left).toBeGreaterThanOrEqual(0);
    expect(containment.top).toBeGreaterThanOrEqual(0);
    expect(containment.right).toBeLessThanOrEqual(800);
    expect(containment.bottom).toBeLessThanOrEqual(600);
    expect(containment.horizontalOverflow).toBeLessThanOrEqual(1);

    const lastRow = table.locator('[data-records-open]').last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Close Open Notes', exact: true })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
  });
});

/* ======================================================================
   Phase 3b — patient conventions.

   Asserts MANIFEST 4.1.1, 4.3, 4.4, 4.5 and 4.6: the patient-scoped Notes
   list is the roomier modern grammar and NOT the 44px global ledger above,
   the page-level action bar is one coral group distinct from the per-note
   lifecycle footer, and browsing a chart writes nothing.
   ====================================================================== */

const UDS_RECORDS_KEY = 'ipmgMedAssistUdsRecordsV1';

const SYNTHETIC_UDS_RECORDS = [
  {
    id: 'conventions-uds-newest',
    type: 'uds',
    status: 'completed',
    createdAt: '2026-08-20T09:00:00-07:00',
    updatedAt: '2026-08-20T09:30:00-07:00',
    completedAt: '2026-08-20T09:30:00-07:00',
    patient: { name: 'Baker, Test', dob: '02/03/1992' },
    summary: 'Synthetic screen B',
    snapshot: {
      patient: { name: 'Baker, Test', dob: '02/03/1992' },
      collectionDateTime: '2026-08-20T09:00',
      collector: 'Taylor Test, MA',
      device: 'safelife13',
      lot: 'UDS-CONV-1',
      expiration: '2027-06',
      reason: 'routine',
      results: {},
      temperature: 'acceptable',
      control: 'valid',
      validity: 'acceptable',
      medicationAlignment: 'no unexpected',
      physicalReadingsVerified: true
    },
    addenda: [],
    attestation: {
      staff: 'Taylor Test, MA',
      timestamp: '2026-08-20T09:30:00-07:00',
      statementVersion: 'local-attestation-v1'
    }
  }
];

async function bootWithPatientChart(
  page,
  viewport,
  udsRecords = SYNTHETIC_UDS_RECORDS
) {
  if (viewport) await page.setViewportSize(viewport);
  // Seeds once per tab rather than on every navigation. A reload must be able
  // to prove that a per-browser preference survived it, which it cannot if the
  // harness clears storage again on the way back in.
  await page.addInitScript(
    ({ injectionKey, injections, udsKey, udsRecords }) => {
      if (sessionStorage.getItem('conventionsSeeded') === '1') return;
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('conventionsSeeded', '1');
      localStorage.setItem(injectionKey, JSON.stringify(injections));
      localStorage.setItem(udsKey, JSON.stringify(udsRecords));
      // Staff and clinic: the header's top right carries them, which is why
      // suppressing the masthead over a chart loses no information.
      localStorage.setItem('ipmgMedAssistStaff', 'Alex Rivera, MA');
      localStorage.setItem('ipmgMedAssistClinicLocation_v1', 'San Bernardino');
    },
    {
      injectionKey: INJECTION_RECORDS_KEY,
      injections: SYNTHETIC_INJECTION_RECORDS,
      udsKey: UDS_RECORDS_KEY,
      udsRecords
    }
  );
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}

/** Opens Baker, Test's chart through header search, as staff would. */
async function openBakerChart(page) {
  const search = page.locator('[data-patient-search] input');
  await search.click();
  await search.fill('ba');
  const result = page.locator('[data-patient-result]');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Baker, Test');
  await result.click();
  const chart = page.locator('[data-patient-chart]');
  await expect(chart).toBeVisible();
  return chart;
}

async function startChartNote(page, label) {
  const actionBar = page.locator('[data-action-bar]');
  await actionBar.locator('.tebra-action-split-disclosure').click();
  await actionBar.getByRole('menuitem', { name: label, exact: true }).click();
}

async function editAndLeaveInSameTask(control, value) {
  await control.evaluate((node, nextValue) => {
    const prototype = node instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!valueSetter) throw new Error('Expected a native form control value setter.');
    valueSetter.call(node, nextValue);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', {
      key: '1',
      code: 'Digit1',
      altKey: true,
      bubbles: true,
      cancelable: true
    }));
  }, value);
}

async function invokeAndLeaveInSameTask(control) {
  await control.evaluate((node) => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', {
      key: '1',
      code: 'Digit1',
      altKey: true,
      bubbles: true,
      cancelable: true
    }));
  });
}

test.describe('Phase 3b patient chart conventions', () => {
  test('searches by name prefix or date of birth, against local notes only', async ({ page }) => {
    await bootWithPatientChart(page);
    const search = page.locator('[data-patient-search] input');

    await expect(search).toHaveAttribute(
      'placeholder',
      /2-3 letters of the patient's name, or DOB as mm\/dd\/yyyy/i
    );

    await search.click();
    await expect(page.locator('[data-patient-search]')).toContainText(
      'Patients with notes saved in this browser.'
    );

    // One character is never enough to match.
    await search.fill('b');
    await expect(page.locator('[data-patient-result]')).toHaveCount(0);
    await expect(page.locator('[data-patient-search]')).toContainText(
      'Type at least two characters.'
    );

    await search.fill('ba');
    await expect(page.locator('[data-patient-result]')).toHaveCount(1);

    // Either half of "Last, First" is searchable.
    await search.fill('te');
    const keyboardResults = page.locator('[data-patient-result]');
    expect(await keyboardResults.count()).toBeGreaterThan(1);
    await expect(keyboardResults.first()).toHaveAttribute('aria-selected', 'true');
    await expect(search).toHaveAttribute(
      'aria-activedescendant',
      await keyboardResults.first().getAttribute('id')
    );

    await search.press('ArrowDown');
    await expect(keyboardResults.nth(1)).toHaveAttribute('aria-selected', 'true');
    await search.press('Home');
    await expect(keyboardResults.first()).toHaveAttribute('aria-selected', 'true');
    await search.press('End');
    await expect(keyboardResults.last()).toHaveAttribute('aria-selected', 'true');
    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await expect(search).not.toHaveAttribute('aria-activedescendant', /.+/);

    // A closed list reopens from either direction without moving DOM focus
    // away from the combobox.
    await search.press('ArrowDown');
    await expect(keyboardResults.first()).toHaveAttribute('aria-selected', 'true');
    await expect(search).toBeFocused();
    await search.press('Escape');
    await search.press('ArrowUp');
    await expect(keyboardResults.last()).toHaveAttribute('aria-selected', 'true');
    await expect(search).toBeFocused();

    // Date of birth narrows as it is typed.
    await search.fill('02/03');
    await expect(page.locator('[data-patient-result]')).toHaveCount(1);
    await expect(page.locator('[data-patient-result]')).toContainText('Baker, Test');

    await search.fill('zz');
    await expect(page.locator('[data-patient-result]')).toHaveCount(0);
    await expect(page.locator('[data-patient-search]')).toContainText('No patients match.');

    await search.fill('ba');
    await search.press('Enter');
    await expect(page.locator('[data-patient-chart]')).toBeVisible();
    await expect(page.locator('.tebra-facesheet-name')).toContainText('Baker, Test');
  });

  test('shows Facesheet cards that each state their ordering rule', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);

    const cards = page.locator('[data-facesheet-cards] .tebra-summary-card');
    await expect(cards).toHaveCount(5);
    expect(
      await cards.locator('h3').allTextContents()
    ).toEqual([
      'Last injection',
      'Site rotation',
      'Allergies',
      'Care Checklist',
      'Recent notes'
    ]);

    // Every card states which subset it shows.
    const rules = await cards.locator('.tebra-summary-card-rule').allTextContents();
    expect(rules).toHaveLength(5);
    for (const rule of rules) expect(rule.trim().length).toBeGreaterThan(0);

    await expect(cards.nth(0)).toContainText('Synthetic medication B');
    await expect(cards.nth(4)).toContainText('Injection');
    await expect(cards.nth(4)).toContainText('UDS');

    // The Care Checklist belongs to an open note, and none is open here, so
    // the card says so rather than showing an empty list.
    await expect(cards.nth(3)).toContainText('Open a note for this patient');
  });

  test('raises a hover card carrying only what this workstation holds', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);

    const card = page.locator('[data-patient-card]');
    await expect(card).toContainText('DOB');
    await expect(card).toContainText('Record id');
    await expect(card).toContainText('Allergies');
    await expect(card).toContainText('Last visit');
    // Tebra's card carries insurance and contact rows; ours must not invent them.
    await expect(card).not.toContainText(/insurance|phone|address/i);

    await expect(card).toHaveCSS('opacity', '0');
    await page.locator('.tebra-patient-card-trigger').hover();
    await expect(card).toHaveCSS('opacity', '1');
  });

  test('uses the modern patient list grammar, not the global ledger', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);
    await page.locator('[data-chart-tab="notes"]').click();

    const list = page.locator('[data-patient-notes]');
    await expect(list).toBeVisible();

    // Exactly four 200x40 filter fields in one panel.
    const fields = list.locator('[data-patient-notes-filter]');
    await expect(fields).toHaveCount(4);
    expect(
      await fields.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return [Math.round(box.width), Math.round(box.height)];
        })
      )
    ).toEqual([[200, 40], [200, 40], [200, 40], [200, 40]]);

    // 100px rows, a 73x38 Open button, and no global-ledger 44px row here.
    const rows = list.locator('.tebra-record-row');
    await expect(rows).toHaveCount(2);
    const heights = await rows.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height))
    );
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(100);

    expect(
      await list.locator('[data-patient-note-open]').first().evaluate((node) => {
        const box = node.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
      })
    ).toEqual([73, 38]);

    // The patient list is a different convention: no Lock column, no sortable
    // headers, no whole-row activation.
    await expect(list.locator('table.notes-table')).toHaveCount(0);
    await expect(list.locator('[data-records-sort]')).toHaveCount(0);

    // Filters narrow without touching storage.
    const before = await recordStorageSnapshot(page);
    await list.locator('[data-patient-notes-filter="type"]').selectOption('uds');
    await expect(rows).toHaveCount(1);
    await list.locator('[data-patient-notes-filter="type"]').selectOption('all');
    await list.locator('[data-patient-notes-filter="status"]').selectOption('signed');
    await expect(rows).toHaveCount(1);
    await list.locator('[data-patient-notes-filter="status"]').selectOption('all');
    await list.locator('[data-patient-notes-filter="query"]').fill('zzzz');
    await expect(rows).toHaveCount(0);
    await expect(list).toContainText('No notes match these filters.');
    expect(await recordStorageSnapshot(page)).toBe(before);
  });

  test('offers one coral action group, distinct from the per-note footer', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);

    const bar = page.locator('[data-action-bar]');
    await expect(bar).toBeVisible();

    // 36px split action, and exactly one coral group on the page.
    const primary = bar.locator('[data-action-new-note]');
    expect(
      await primary.evaluate((node) => Math.round(node.getBoundingClientRect().height))
    ).toBe(36);
    await expect(primary).toHaveCSS('background-color', 'rgb(255, 141, 110)');

    const coral = await page
      .locator('.cd2004-shell button')
      .evaluateAll((nodes) =>
        nodes.filter(
          (node) => getComputedStyle(node).backgroundColor === 'rgb(255, 141, 110)'
        ).length
      );
    // The primary segment and its disclosure are one control, not two.
    expect(coral).toBe(2);

    // The per-note lifecycle footer belongs to an open note and is not here.
    await expect(page.locator('[data-injection-record-actions]')).toHaveCount(0);

    // Actions read in Tebra's order, with Tebra's own names.
    expect(
      (await bar.locator('button').allTextContents())
        .map((text) => text.trim())
        .filter(Boolean)
    ).toEqual(['New Note', 'Print', 'More', 'Customize View']);

    // The split menu offers the note types this module actually has.
    const disclosure = bar.locator('.tebra-action-split-disclosure');
    await disclosure.focus();
    await disclosure.press('Enter');
    const menu = bar.locator('[data-action-new-note-type]');
    await expect(menu).toHaveCount(4);
    expect(await menu.allTextContents()).toEqual(['Injection', 'UDS', 'Samples', 'Forms']);
    await expect(menu.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.first()).toBeFocused();
    expect(
      await bar.locator('.tebra-action-menu-list').first().evaluate((node) =>
        Math.round(node.getBoundingClientRect().width)
      )
    ).toBe(242);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(disclosure).toBeFocused();
  });

  test('persists Customize View per browser without touching records', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);

    const before = await recordStorageSnapshot(page);
    await expect(page.locator('[data-facesheet-cards] .tebra-summary-card')).toHaveCount(5);

    await page.locator('[data-action-bar] .tebra-action-outlined').last().click();
    await page.locator('[data-action-customize="site-rotation"]').uncheck();
    await expect(page.locator('[data-facesheet-cards] .tebra-summary-card')).toHaveCount(4);

    // A view preference, written under a presentation-owned key. It must not
    // reach the record stores.
    expect(await recordStorageSnapshot(page)).toBe(before);
    const stored = await page.evaluate(() =>
      localStorage.getItem('ipmgMedAssistFacesheetCards_v1')
    );
    expect(JSON.parse(stored)).not.toContain('site-rotation');
    expect(JSON.parse(stored)).toContain('allergies');

    await page.reload();
    await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
    await openBakerChart(page);
    await expect(page.locator('[data-facesheet-cards] .tebra-summary-card')).toHaveCount(4);
    await expect(page.locator('[data-facesheet-cards]')).not.toContainText('Site rotation');
  });

  test('browsing a chart starts no note, and Escape returns to the workflow', async ({ page }) => {
    await bootWithPatientChart(page);
    const before = await recordStorageSnapshot(page);

    await openBakerChart(page);
    await page.locator('[data-chart-tab="notes"]').click();
    await page.locator('[data-chart-tab="facesheet"]').click();

    // Opening, reading and switching tabs on a chart writes no record. The
    // live product files a blank Incomplete note when an editor opens; this
    // module deliberately does not.
    expect(await recordStorageSnapshot(page)).toBe(before);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-start-center')).toBeVisible();
    expect(await recordStorageSnapshot(page)).toBe(before);
  });

  test('chart browsing cannot save the editable note hidden beneath it', async ({ page }) => {
    await bootWithPatientChart(page);
    const { table } = await openGlobalNotes(page);
    await table.locator('[data-records-open="conventions-newest"]').click();
    await openBakerChart(page);
    const chartSnapshot = await recordStorageSnapshot(page);

    // A normal draft save rewrites updatedAt. Neither advertised accelerator
    // may reach that hidden editor while the read-only chart owns the work area.
    await page.waitForTimeout(25);
    await page.keyboard.press('F12');
    await page.keyboard.press('Control+s');
    expect(await recordStorageSnapshot(page)).toBe(chartSnapshot);
    await expect(page.locator('[data-patient-chart]')).toBeVisible();
  });

  test('opens a note only on an explicit action', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);
    await page.locator('[data-chart-tab="notes"]').click();

    await page
      .locator('[data-patient-note-open="conventions-newest"]')
      .click();

    // The chart closes and the note opens in its workflow — the one crossing
    // from browsing into work.
    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'administer'
    );
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Baker, Test');
    await expect(page.locator('.wfp-panel input[placeholder="Last, First"]'))
      .toBeFocused();
  });

  for (const handoff of ['Open', 'New']) {
    test(`${handoff} from global notes dismisses the chart before focusing Injection`, async ({ page }) => {
      await bootWithPatientChart(page);
      await openBakerChart(page);
      await page.keyboard.press('F11');
      const dialog = page.locator(
        'dialog[aria-labelledby="recordsDrawerTitle"] > .records-drawer'
      );
      await expect(dialog).toBeVisible();

      if (handoff === 'Open') {
        await dialog.locator('[data-records-open="conventions-newest"]').click();
      } else {
        await dialog.locator('[data-records-new]').click();
      }

      await expect(dialog).toBeHidden();
      await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        'administer'
      );
      const patientName = page.locator(
        '.wfp-panel input[placeholder="Last, First"]'
      );
      await expect(patientName).toHaveValue(
        handoff === 'Open' ? 'Baker, Test' : ''
      );
      await expect(patientName).toBeFocused();
    });
  }

  test('opens a UDS note through the panel that owns it', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);
    await page.locator('[data-chart-tab="notes"]').click();

    // The UDS panel is not mounted while the chart is open, so the shell must
    // hold this request until it is. Dispatching it eagerly would land before
    // anything was listening and the note would silently never open.
    await page.locator('[data-patient-note-open="conventions-uds-newest"]').click();

    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );

    // The encounter is restored into the panel, and a completed record comes
    // back signed — the same contract its own notes window honours.
    const panel = page.locator('.wfp-panel');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue(
      'Baker, Test'
    );
    await expect(panel.locator('.cd2004-record-actions-state strong')).toHaveText(
      'Signed'
    );
    await expect(panel.locator('textarea[data-addendum-input]')).toBeFocused();
  });

  test('rejects a stale chart row whose durable UDS record changed patients', async ({ page, context }) => {
    const recordId = 'conventions-uds-stale-patient';
    const alphaRecord = {
      ...SYNTHETIC_UDS_RECORDS[0],
      id: recordId,
      patient: { name: 'Alpha, Synthetic', dob: '02/03/1992' },
      summary: 'Synthetic identity race',
      snapshot: {
        ...SYNTHETIC_UDS_RECORDS[0].snapshot,
        patient: { name: 'Alpha, Synthetic', dob: '02/03/1992' }
      }
    };
    await bootWithPatientChart(page, undefined, [alphaRecord]);

    const search = page.locator('[data-patient-search] input');
    await search.fill('al');
    const alphaResult = page.locator('[data-patient-result]');
    await expect(alphaResult).toHaveCount(1);
    await expect(alphaResult).toContainText('Alpha, Synthetic');
    await alphaResult.click();
    await page.locator('[data-chart-tab="notes"]').click();
    const chart = page.locator('[data-patient-chart]');
    await expect(chart).toContainText('Alpha, Synthetic');

    // A second tab changes the same valid durable id to a different patient
    // after this chart has already projected Alpha's row.
    const secondPage = await context.newPage();
    await secondPage.goto('/');
    await secondPage.waitForFunction(
      () => document.body.dataset.applicationReady === 'true'
    );
    const betaBytes = await secondPage.evaluate(
      ({ key, id }) => {
        const records = JSON.parse(localStorage.getItem(key) ?? '[]');
        const next = records.map((record) => record.id === id
          ? {
              ...record,
              updatedAt: '2026-08-20T10:00:00-07:00',
              patient: { name: 'Beta, Synthetic', dob: '04/05/1993' },
              snapshot: {
                ...record.snapshot,
                patient: { name: 'Beta, Synthetic', dob: '04/05/1993' }
              }
            }
          : record);
        const serialized = JSON.stringify(next);
        localStorage.setItem(key, serialized);
        return serialized;
      },
      { key: UDS_RECORDS_KEY, id: recordId }
    );
    await secondPage.close();

    await page.locator(`[data-patient-note-open="${recordId}"]`).click();

    // The exact durable patient is checked before any active record, patient,
    // workflow, or persistence state changes. Staff must leave this stale
    // chart and deliberately find the record under its current patient.
    await expect(chart).toBeVisible();
    await expect(chart).toContainText('Alpha, Synthetic');
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'home'
    );
    await expect(page.locator('[data-toast]')).toContainText(
      'This saved note now belongs to a different patient'
    );
    expect(await page.evaluate(
      (key) => localStorage.getItem(key),
      UDS_RECORDS_KEY
    )).toBe(betaBytes);

    await page.keyboard.press('Escape');
    await expect(chart).toHaveCount(0);
    await expect(page.locator('.cd2004-patient-banner')).not.toContainText(
      'Beta, Synthetic'
    );
    await search.fill('be');
    const betaResult = page.locator('[data-patient-result]');
    await expect(betaResult).toHaveCount(1);
    await expect(betaResult).toContainText('Beta, Synthetic');
    await betaResult.click();
    await page.locator('[data-chart-tab="notes"]').click();
    await page.locator(`[data-patient-note-open="${recordId}"]`).click();

    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );
    await expect(
      page.locator('.wfp-panel input[placeholder="Last, First"]')
    ).toHaveValue('Beta, Synthetic');
  });

  test('uses the note type as well as id when chart records share an imported id', async ({ page }) => {
    const sameIdUds = {
      ...SYNTHETIC_UDS_RECORDS[0],
      id: 'conventions-newest',
      summary: 'Synthetic cross-type id collision'
    };
    await bootWithPatientChart(page, undefined, [sameIdUds]);
    await openBakerChart(page);
    await page.locator('[data-chart-tab="notes"]').click();

    const udsRow = page.locator(
      '.tebra-record-row[data-note-type="uds"]'
    );
    await expect(udsRow).toContainText('Synthetic cross-type id collision');
    await udsRow.getByRole('button', { name: /Open signed UDS note/ }).click();

    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );
    await expect(page.locator('.wfp-panel .cd2004-record-actions-state strong'))
      .toHaveText('Signed');
  });

  test('replaces the masthead rather than contradicting it', async ({ page }) => {
    await bootWithPatientChart(page);

    // Outside a chart the masthead is the open note's context, as always.
    await expect(page.locator('.cd2004-patient-banner')).toBeVisible();

    await openBakerChart(page);

    // Inside one it is suppressed: it repeated the chart's own header and
    // claimed "No patient selected" directly above a Facesheet.
    await expect(page.locator('.cd2004-patient-banner')).toHaveCount(0);
    await expect(page.locator('.tebra-facesheet-name')).toContainText('Baker, Test');
    await expect(page.locator('.tebra-facesheet-banner')).toContainText('DOB 02/03/1992');

    // Clinic and staff are not lost — the header's top right still carries them.
    await expect(page.locator('.tebra-app-context')).toContainText('Alex Rivera, MA');

    // The rail follows the browsed chart too, rather than claiming no patient
    // is selected beside that patient's own Facesheet, and offers the chart's
    // two pages as navigation.
    const railContext = page.locator('.tebra-section-rail-context');
    await expect(railContext).toContainText('Facesheet');
    await expect(railContext).toContainText('Baker, Test');
    await expect(railContext).not.toContainText('No patient selected');
    await expect(page.locator('[data-chart-nav="facesheet"]')).toBeVisible();
    await expect(page.locator('[data-chart-nav="notes"]')).toBeVisible();

    // And it comes back on the way out.
    await page.keyboard.press('Escape');
    await expect(page.locator('.cd2004-patient-banner')).toBeVisible();
  });

  test('says so when a note is open for a different patient', async ({ page }) => {
    await bootWithPatientChart(page);

    // Open Diaz's note, so the active note belongs to someone else...
    const launcher = page.getByRole('button', { name: /Open saved notes \(F11\)/ });
    await launcher.click();
    await page
      .getByRole('row', { name: /Diaz, Test/ })
      .click();
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Diaz, Test');

    // ...then browse Baker's chart. The mix-up must not go unsaid.
    await openBakerChart(page);
    const notice = page.locator('.tebra-facesheet-other-note');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Diaz, Test');
    await expect(notice).toContainText('Nothing here changes it.');
  });

  test('holds the chart inside the supported minimum workstation', async ({ page }) => {
    await bootWithPatientChart(page, { width: 800, height: 600 });
    await openBakerChart(page);

    const overflow = await page.evaluate(() => {
      const chart = document.querySelector('[data-patient-chart]');
      return {
        horizontal: chart.scrollWidth - chart.clientWidth,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.documentOverflow).toBeLessThanOrEqual(1);

    await page.locator('[data-chart-tab="notes"]').click();
    const listOverflow = await page
      .locator('[data-patient-notes]')
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(listOverflow).toBeLessThanOrEqual(1);
  });

  for (const replacement of [
    {
      label: 'Samples',
      workflow: 'samples',
      markerSelector: 'input[placeholder="Staff name"]',
      marker: 'Samples session A marker'
    },
    {
      label: 'Forms',
      workflow: 'forms',
      markerSelector: '.wfp-field:has(.wfp-field-caption:text-is("Assigned staff")) input',
      marker: 'Forms session A marker'
    }
  ]) {
    test(`${replacement.label} replacement defaults safe, preserves the current note, then explicitly starts clean`, async ({ page }) => {
      await bootWithPatientChart(page);
      await page.locator(`.cd2004-nav-item[title="${replacement.label}"]`).click();
      const panel = page.locator('.wfp-panel');
      await panel.locator('input[placeholder="Last, First"]').fill('Session A, Synthetic');
      await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('03/04/1980');
      await panel.locator(replacement.markerSelector).fill(replacement.marker);

      await openBakerChart(page);
      await startChartNote(page, replacement.label);
      const dialog = page.getByRole('dialog', {
        name: `Start a new ${replacement.label} note?`
      });
      await expect(dialog).toBeVisible();
      const keep = dialog.getByRole('button', {
        name: 'Keep current note',
        exact: true
      });
      await expect(keep).toBeFocused();
      await keep.click();

      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        replacement.workflow
      );
      await expect(panel.locator('input[placeholder="Last, First"]'))
        .toHaveValue('Session A, Synthetic');
      await expect(panel.locator('input[placeholder="MM/DD/YYYY"]'))
        .toHaveValue('03/04/1980');
      await expect(panel.locator(replacement.markerSelector)).toHaveValue(replacement.marker);
      await expect(panel.locator('input[placeholder="Last, First"]'))
        .toBeFocused();

      await openBakerChart(page);
      await startChartNote(page, replacement.label);
      await expect(keep).toBeFocused();
      await dialog.getByRole('button', {
        name: 'Replace and start new',
        exact: true
      }).click();

      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        replacement.workflow
      );
      await expect(panel.locator('input[placeholder="Last, First"]'))
        .toHaveValue('Baker, Test');
      await expect(panel.locator('input[placeholder="MM/DD/YYYY"]'))
        .toHaveValue('02/03/1992');
      await expect(panel.locator(replacement.markerSelector)).toHaveValue('');
      await expect(panel).not.toContainText('Session A, Synthetic');
      await expect(panel.locator('input[placeholder="Last, First"]'))
        .toBeFocused();
    });
  }

  for (const dirtyOnly of [
    {
      label: 'Samples',
      field: 'DOB',
      prepare: async (panel) => {
        const input = panel.locator('input[placeholder="MM/DD/YYYY"]');
        await input.fill('03/04/1980');
        return { input, expected: '03/04/1980' };
      }
    },
    {
      label: 'Samples',
      field: 'directions',
      prepare: async (panel) => {
        await panel.getByRole('tab', { name: /^Medication/ }).click();
        const input = panel.locator(
          'textarea[placeholder^="Example: Take 1 capsule"]'
        );
        await input.fill('Synthetic directions that must not be replaced.');
        return { input, expected: 'Synthetic directions that must not be replaced.' };
      }
    },
    {
      label: 'Forms',
      field: 'requested date',
      prepare: async (panel) => {
        const input = panel.locator(
          '.wfp-field:has(.wfp-field-caption:text-is("Requested date")) input'
        );
        await input.fill('090826');
        await input.press('Tab');
        return { input, expected: '09/08/26' };
      }
    },
    {
      label: 'Forms',
      field: 'action',
      prepare: async (panel) => {
        const input = panel.locator(
          'textarea[placeholder^="Prepared draft, requested records"]'
        );
        await input.fill('Synthetic action that must not be replaced.');
        return { input, expected: 'Synthetic action that must not be replaced.' };
      }
    }
  ]) {
    test(`${dirtyOnly.label} ${dirtyOnly.field}-only edits require explicit replacement`, async ({ page }) => {
      await bootWithPatientChart(page);
      await page.locator(`.cd2004-nav-item[title="${dirtyOnly.label}"]`).click();
      const panel = page.locator('.wfp-panel');
      const { input, expected } = await dirtyOnly.prepare(panel);
      await expect(input).toHaveValue(expected);

      await openBakerChart(page);
      await startChartNote(page, dirtyOnly.label);
      const dialog = page.getByRole('dialog', {
        name: `Start a new ${dirtyOnly.label} note?`
      });
      await expect(dialog).toBeVisible();
      const keep = dialog.getByRole('button', {
        name: 'Keep current note',
        exact: true
      });
      await expect(keep).toBeFocused();
      await keep.click();

      if (dirtyOnly.field === 'directions') {
        await panel.getByRole('tab', { name: /^Medication/ }).click();
      }
      await expect(input).toHaveValue(expected);
    });
  }

  test('dirty state stays sticky after a Forms value is cleared back to blank', async ({ page }) => {
    await bootWithPatientChart(page);
    await page.locator('.cd2004-nav-item[title="Forms"]').click();
    const action = page.locator('.wfp-panel').locator(
      'textarea[placeholder^="Prepared draft, requested records"]'
    );
    await action.fill('Synthetic transient value.');
    await action.fill('');

    await openBakerChart(page);
    await startChartNote(page, 'Forms');
    const dialog = page.getByRole('dialog', { name: 'Start a new Forms note?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', {
      name: 'Keep current note',
      exact: true
    })).toBeFocused();
  });

  for (const transient of [
    {
      label: 'Samples',
      shortcut: '4',
      markerSelector: 'input[placeholder="Staff name"]',
      marker: 'Samples same-task marker',
      dateLabel: 'Date dispensed'
    },
    {
      label: 'Forms',
      shortcut: '5',
      markerSelector: '.wfp-field:has(.wfp-field-caption:text-is("Assigned staff")) input',
      marker: 'Forms same-task marker',
      dateLabel: 'Requested date'
    }
  ]) {
    test(`${transient.label} publishes the exact edit before same-task workflow navigation`, async ({ page }) => {
      await bootWithPatientChart(page);
      await page.locator(`.cd2004-nav-item[title="${transient.label}"]`).click();
      const panel = page.locator('.wfp-panel');
      const marker = panel.locator(transient.markerSelector);

      await editAndLeaveInSameTask(marker, transient.marker);
      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        'home'
      );
      expect(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);

      await page.keyboard.press(`Alt+${transient.shortcut}`);
      await expect(panel.locator(transient.markerSelector)).toHaveValue(transient.marker);

      await editAndLeaveInSameTask(panel.locator(transient.markerSelector), '');
      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        'home'
      );
      await page.keyboard.press(`Alt+${transient.shortcut}`);
      await expect(panel.locator(transient.markerSelector)).toHaveValue('');
      expect(await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      })).toBe(true);
    });

    test(`${transient.label} commits a focused date before same-task Alt navigation`, async ({ page }) => {
      await bootWithPatientChart(page);
      await page.locator(`.cd2004-nav-item[title="${transient.label}"]`).click();
      const panel = page.locator('.wfp-panel');
      const date = panel.locator(
        `.wfp-field:has(.wfp-field-caption:text-is("${transient.dateLabel}")) input`
      );

      await editAndLeaveInSameTask(date, '091526');
      await expect(page.locator('.cd2004-shell')).toHaveAttribute(
        'data-active-workflow',
        'home'
      );

      await page.keyboard.press(`Alt+${transient.shortcut}`);
      await expect(panel.locator(
        `.wfp-field:has(.wfp-field-caption:text-is("${transient.dateLabel}")) input`
      )).toHaveValue('09/15/26');
    });
  }

  test('Samples publishes SIG and review actions before same-task navigation', async ({ page }) => {
    await bootWithPatientChart(page);
    await page.locator('.cd2004-nav-item[title="Samples"]').click();
    const panel = page.locator('.wfp-panel');
    const field = (label) => panel.locator('.wfp-field').filter({
      has: page.getByText(label, { exact: true })
    });

    await panel.getByRole('tab', { name: /^Medication/ }).click();
    await field('Medication').locator('select').selectOption({ label: 'Trintellix' });
    await invokeAndLeaveInSameTask(
      panel.getByRole('button', { name: '20 mg daily', exact: true })
    );
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'home'
    );

    await page.keyboard.press('Alt+4');
    await panel.getByRole('tab', { name: /^Medication/ }).click();
    await expect(field('Primary medication / strength').locator('input')).toHaveValue(
      'Trintellix 20 mg tablet (vortioxetine)'
    );

    await panel.getByRole('tab', { name: /^Patient/ }).click();
    await field('Patient name').locator('input').fill('Review, Synthetic');
    await field('DOB').locator('input').fill('01/02/1990');
    await field('Prescriber').locator('select').selectOption({ index: 1 });
    await field('Dispensed by').locator('input').fill('Test Staff');
    for (const label of ['Date dispensed', 'Start date']) {
      const date = field(label).locator('input');
      await date.fill('T');
      await date.press('Enter');
    }
    await panel.getByRole('tab', { name: /^Plan/ }).click();
    await field('Primary package lot #').locator('input').fill('SYNTHETIC-LOT');
    await field('Primary package exp').locator('input').fill('2099-12');
    await panel.getByRole('tab', { name: /^Safety/ }).click();
    await field('Medication list / interaction check').locator('select').selectOption({
      label: 'Prescriber reviewed / ok to dispense'
    });
    await field('Patient education').locator('select').selectOption({
      label: 'Reviewed with patient'
    });
    const review = panel.getByRole('button', { name: 'Mark reviewed today' });
    await expect(review).toBeEnabled();

    await invokeAndLeaveInSameTask(review);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'home'
    );
    await page.keyboard.press('Alt+4');
    await panel.getByRole('tab', { name: /^Safety/ }).click();
    await expect(panel.getByRole('button', { name: 'Reviewed today' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('a pristine transient target starts directly for the chart patient', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);
    await startChartNote(page, 'Samples');

    await expect(page.getByRole('dialog', {
      name: 'Start a new Samples note?'
    })).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'samples'
    );
    const panel = page.locator('.wfp-panel');
    await expect(panel.locator('input[placeholder="Last, First"]'))
      .toHaveValue('Baker, Test');
    await expect(panel.locator('input[placeholder="MM/DD/YYYY"]'))
      .toHaveValue('02/03/1992');
    await expect(panel.locator('input[placeholder="Last, First"]'))
      .toBeFocused();
  });

  test('starts a pristine UDS note for the exact chart patient without writing a record', async ({ page }) => {
    await bootWithPatientChart(page);
    const before = await page.evaluate(
      (key) => localStorage.getItem(key),
      UDS_RECORDS_KEY
    );
    await openBakerChart(page);
    await startChartNote(page, 'UDS');

    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );
    const panel = page.locator('.wfp-panel');
    const patientName = panel.locator('input[placeholder="Last, First"]');
    await expect(patientName).toHaveValue('Baker, Test');
    await expect(panel.locator('input[placeholder="MM/DD/YYYY"]'))
      .toHaveValue('02/03/1992');
    await expect(patientName).toBeFocused();
    expect(await page.evaluate(
      (key) => localStorage.getItem(key),
      UDS_RECORDS_KEY
    )).toBe(before);
  });

  test('starts Injection from the chart with the exact synthetic chart patient', async ({ page }) => {
    await bootWithPatientChart(page);
    await openBakerChart(page);
    await startChartNote(page, 'Injection');

    await expect(page.locator('[data-patient-chart]')).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'administer'
    );
    const panel = page.locator('.wfp-panel');
    await expect(panel.locator('input[placeholder="Last, First"]'))
      .toHaveValue('Baker, Test');
    await expect(panel.locator('input[placeholder="MM/DD/YYYY"]'))
      .toHaveValue('02/03/1992');
    await expect(panel.locator('input[placeholder="Last, First"]'))
      .toBeFocused();
  });
});
