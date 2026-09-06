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
  const dialog = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
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
