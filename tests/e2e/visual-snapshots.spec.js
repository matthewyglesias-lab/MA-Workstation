const { test, expect } = require('@playwright/test');
const { setProvider, expectProviderValue } = require('./provider-entry');
const { fillDate } = require('./date-entry');

const FIXED_NOW = new Date('2026-07-30T10:30:00-07:00');
const FIXED_DATE_KEY = '2026-07-30';

// These are intentionally state-oriented instead of a workflow-by-workflow
// grid. The workstation's meaningful visual changes are its chart and record
// lifecycle states: no active chart, an editable local draft, a record ready
// for local attestation, and a locked local record. Together the captures
// cover the primary desktop range, the supported narrow workstation, and the
// explicit unsupported-mobile gate without multiplying near-identical baselines.
const VIEWPORTS = {
  desktop1024: { name: '1024x768', width: 1024, height: 768 },
  desktop1366: { name: '1366x768', width: 1366, height: 768 },
  desktop1440: { name: '1440x900', width: 1440, height: 900 },
  narrowDesktop: { name: '840x720', width: 840, height: 720 },
  minimumDesktop: { name: '800x600', width: 800, height: 600 },
  unsupportedMobile: { name: '390x844', width: 390, height: 844 }
};

const SNAPSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  // `threshold` is the per-pixel color tolerance and is what absorbs text
  // rasterization differences between machines: a pixel only counts as
  // different when it moves more than 30% in color space, so antialiasing on
  // glyph edges does not register.
  threshold: 0.3,
  // `maxDiffPixelRatio` is then only a backstop for *how many* pixels may
  // still exceed that, and it was far too generous at 0.025 - roughly 32,000
  // pixels of a 1440x900 capture. Three consecutive runs against fresh
  // baselines here differ by zero pixels, and 0.025 was measured letting four
  // genuine regressions through unnoticed, the largest a whole-panel vertical
  // shift at 0.0245. 0.0002 leaves ~259 pixels of desktop slack for a
  // renderer that rasterizes a few glyphs differently, and still fails on
  // every real change observed. If CI ever goes red on pure rasterization,
  // raise this - do not raise it to hide a layout change.
  maxDiffPixelRatio: 0.0002,
  timeout: 15_000
};

const CAPTURE_STYLES = `
  html[data-visual-regression="true"],
  html[data-visual-regression="true"] body,
  html[data-visual-regression="true"] .cd2004-shell,
  html[data-visual-regression="true"] .cd2004-shell * {
    font-family: Arial, "Liberation Sans", sans-serif !important;
    font-synthesis: none !important;
  }

  html[data-visual-regression="true"] {
    overflow: hidden !important;
    scrollbar-gutter: auto !important;
  }

  html[data-visual-regression="true"] *,
  html[data-visual-regression="true"] *::before,
  html[data-visual-regression="true"] *::after {
    animation: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }

  html[data-visual-regression="true"] * {
    scrollbar-width: none !important;
  }

  html[data-visual-regression="true"] *::-webkit-scrollbar {
    display: none !important;
    height: 0 !important;
    width: 0 !important;
  }

  /* Broad workstation snapshots exclude this print action so their historical
     baselines remain focused on entry controls; its behavior and paper layout
     are covered by print-regression.spec.js. */
  html[data-visual-regression="true"] [data-patient-screening-print] {
    display: none !important;
  }
`;

const FIXED_LOCAL_DATA = {
  staff: 'Alex Rivera, MA',
  clinic: 'San Bernardino',
  activities: [
    {
      time: '9:18 AM',
      type: 'injection',
      status: 'completed',
      pt: 'Rivera, Jordan',
      summary: 'Maintenance injection documented',
      details: 'Routine administration completed',
      trace: 'Lot FIXED-2407',
      follow: 'Next visit scheduled',
      by: 'Alex Rivera, MA'
    },
    {
      time: '9:42 AM',
      type: 'uds',
      status: 'needs_review',
      pt: 'Chen, Avery',
      summary: 'UDS routed for clinician review',
      details: 'Preliminary result requires review',
      trace: 'Cup lot UDS-0730',
      follow: 'Provider handoff pending',
      by: 'Alex Rivera, MA'
    },
    {
      time: '10:06 AM',
      type: 'sample',
      status: 'completed',
      pt: 'Morgan, Casey',
      summary: 'Sample package documented',
      details: 'Package traceability complete',
      trace: 'Lot SMP-0730',
      follow: 'Patient handout provided',
      by: 'Alex Rivera, MA'
    }
  ],
  injectionRecords: [
    {
      id: 'fixture-injection-locked',
      type: 'injection',
      status: 'completed',
      createdAt: '2026-07-30T09:12:00-07:00',
      updatedAt: '2026-07-30T09:18:00-07:00',
      completedAt: '2026-07-30T09:18:00-07:00',
      patient: { name: 'Rivera, Jordan', dob: '06/14/1989' },
      summary: 'Abilify Maintena 400 mg',
      snapshot: {
        version: 4,
        medKey: 'maintena',
        state: {
          dose: '400 mg',
          route: 'IM',
          site: 'Left deltoid'
        },
        fields: {
          ptName: 'Rivera, Jordan',
          ptDOB: '06/14/1989',
          lot: 'FIXED-2407',
          adminDate: FIXED_DATE_KEY
        }
      },
      addenda: []
    },
    {
      id: 'fixture-injection-draft',
      type: 'injection',
      status: 'draft',
      createdAt: '2026-07-30T09:46:00-07:00',
      updatedAt: '2026-07-30T09:46:00-07:00',
      completedAt: '',
      patient: { name: 'Patel, Rowan', dob: '11/03/1994' },
      summary: 'Invega Sustenna 156 mg',
      snapshot: {
        version: 4,
        medKey: 'sustenna',
        state: {
          dose: '156 mg',
          route: 'IM',
          site: 'Right deltoid'
        },
        fields: {
          ptName: 'Patel, Rowan',
          ptDOB: '11/03/1994',
          lot: 'FIXED-DRAFT',
          adminDate: FIXED_DATE_KEY
        }
      },
      addenda: []
    }
  ]
};

test.use({
  colorScheme: 'light',
  deviceScaleFactor: 1,
  locale: 'en-US',
  reducedMotion: 'reduce',
  timezoneId: 'America/Los_Angeles'
});

async function bootDeterministicWorkstation(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(({ data, dateKey }) => {
    // The ready-to-attest path creates a local record identifier from both
    // Date.now() and Math.random(). Freeze the latter here too so identifier
    // text in the chart banner and record rail cannot make screenshots flaky.
    // This runs only in the visual-regression browser context.
    let visualRandomState = 0x2f6e2b1;
    Math.random = () => {
      visualRandomState = (visualRandomState * 1664525 + 1013904223) >>> 0;
      return visualRandomState / 0x100000000;
    };

    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ipmgMedAssistStaff', data.staff);
    localStorage.setItem('ipmgMedAssistClinicLocation_v1', data.clinic);
    localStorage.setItem(
      `ipmgMedAssistActivityLog_${dateKey}`,
      JSON.stringify(data.activities)
    );
    localStorage.setItem(
      'ipmgMedAssistInjectionRecordsV1',
      JSON.stringify(data.injectionRecords)
    );
  }, { data: FIXED_LOCAL_DATA, dateKey: FIXED_DATE_KEY });

  await page.goto('/');
  await page.waitForFunction(
    () => document.body.dataset.applicationReady === 'true'
  );
  await page.addStyleTag({ content: CAPTURE_STYLES });
  await page.evaluate(() => {
    document.documentElement.dataset.visualRegression = 'true';
  });
}

async function openWorkflow(page, workflow) {
  const label = workflow === 'administer' ? 'Injection' : 'Start Center';
  if (workflow !== 'home') {
    // Bottom-docked strip: every nav item is reachable at every width.
    await page.locator(`.cd2004-nav-item[title="${label}"]`).click();
  }

  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    workflow
  );
  await expect(page.locator(workflow === 'home' ? '.cd2004-start-center' : '.wfp-panel')).toBeVisible();
}

async function openFixtureDraft(page) {
  await openWorkflow(page, 'administer');
  const railLauncher = page.getByRole('button', { name: /Open saved local records \(F11\)/ });
  await railLauncher.click();
  await page
    .getByRole('button', { name: 'Resume draft for Patel, Rowan', exact: true })
    .click();
  await expect(page.locator('dialog.records-drawer-layer')).toBeHidden();
  await expect(page.locator('.cd2004-patient-primary')).toContainText('Patel, Rowan');
  await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/has-active-chart/);
  await expect(page.locator('.cd2004-patient-banner')).toHaveCSS(
    'background-color',
    'rgb(200, 239, 191)'
  );
  await expect(page.locator('[data-injection-record-actions]')).toContainText('SAVED LOCAL DRAFT');
}

async function selectInjectionTab(page, name) {
  const currentLabel = {
    Order: 'Order & Timing',
    Schedule: 'Order & Timing',
    Verification: 'Administration',
    Outcome: 'Review'
  }[name] ?? name;
  await page.locator('.wfp-panel').getByRole('tab', { name: currentLabel, exact: true }).click();
}

async function recordOtherReturnDate(page, panel, date, reason) {
  await selectInjectionTab(page, 'Order');
  await panel.getByRole('button', { name: 'Set return date…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record ordered return date' });
  await fillDate(dialog.getByLabel('Return date'), date);
  await dialog
    .locator('.wfp-field', { hasText: 'Reason / order context' })
    .locator('textarea')
    .fill(reason);
  await dialog.getByRole('button', { name: 'Record return date', exact: true }).click();
}

async function prepareReadyInjection(page) {
  await openWorkflow(page, 'administer');
  const panel = page.locator('.wfp-panel');

  await selectInjectionTab(page, 'Order');
  await panel.locator('input[placeholder="Last, First"]').fill('Snapshot, Ready');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
  await setProvider(panel, 'Snapshot Provider');
  await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
  await panel.locator('.wfp-field:has-text("Medication name") input').fill('Custom Medication');
  await panel.locator('input[name="inj-dose"]').fill('100 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
  await fillDate(
    panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]'), FIXED_DATE_KEY);
  await recordOtherReturnDate(
    page,
    panel,
    '2026-08-27',
    'Active order return date for visual fixture'
  );

  await selectInjectionTab(page, 'Administration');
  await panel
    .locator('input[placeholder="Actual site / location per active order"]')
    .fill('R deltoid');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Alex Rivera, MA');
  await panel.locator('input[type="time"]').first().fill('10:30');

  await selectInjectionTab(page, 'Product');
  await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
  await panel.locator('input[placeholder="LOT123"]').fill('READY-2407');
  await panel.locator('input[type="month"]').first().fill('2027-12');
  await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic sample' });

  await selectInjectionTab(page, 'Verification');
  const requiredAttestations = [
    'Two-identifier ID',
    'Medication ‘rights’',
    'Allergies reviewed',
    'Consent reaffirmed',
    'No contraindications',
    'Aseptic technique'
  ];
  for (const name of requiredAttestations) {
    await panel.getByRole('checkbox', { name }).check();
  }
  await panel
    .locator('input[placeholder*="allergy / ADR status"]')
    .fill('NKDA verified in local record');
  await panel.getByRole('checkbox', { name: 'No acute concerns today confirmed' }).check();

  await selectInjectionTab(page, 'Outcome');
  await panel.locator('select[name="inj-response"]').selectOption('well');
  await panel
    .getByRole('radio', { name: 'Review complete — document administration', exact: true })
    .check();

  const recordActions = page.locator('[data-injection-record-actions]');
  await expect(recordActions.locator('[data-injection-finish]')).toBeEnabled();
}

async function lockReadyInjection(page) {
  const recordActions = page.locator('[data-injection-record-actions]');
  await recordActions.locator('[data-injection-finish]').click();
  const dialog = page.getByRole('dialog', { name: 'Attest & lock local record' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('checkbox', {
      name: /^I attest that I reviewed this local record before locking it\./
    })
    .check();
  await dialog
    .getByRole('button', { name: 'Attest & lock local record', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(recordActions).toContainText('LOCAL RECORD LOCKED');
}

async function settleForCapture(page) {
  // Legacy enhancements include delayed layout passes through 850 ms.
  await page.waitForTimeout(1_000);
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll('.cd2004-window-body').forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

test.describe('Client/Server workstation visual snapshots', () => {
  test('empty chart at 1024 x 768', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.desktop1024);
    await openWorkflow(page, 'administer');
    await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/is-no-active-chart/);
    await expect(page.locator('.cd2004-patient-primary')).toContainText('NO ACTIVE CHART');
    await settleForCapture(page);

    await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
      'empty-chart-1024x768.png',
      SNAPSHOT_OPTIONS
    );
  });

  test('current worklist at 1366 x 768', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.desktop1366);
    await openWorkflow(page, 'home');
    await expect(page.getByRole('heading', { name: 'Current Worklist' })).toBeVisible();
    await settleForCapture(page);

    await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
      'current-worklist-1366x768.png',
      SNAPSHOT_OPTIONS
    );
  });

  test('active Injection draft at 1366 x 768', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.desktop1366);
    await openFixtureDraft(page);
    await settleForCapture(page);

    await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
      'active-injection-draft-1366x768.png',
      SNAPSHOT_OPTIONS
    );
  });

  test('active Injection draft at narrow workstation width', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.narrowDesktop);
    await openFixtureDraft(page);
    await expect(page.locator('.meditech-workstation-gate')).toHaveCount(0);
    await expect(page.locator('.meditech-command-deck')).toBeVisible();
    await expect(page.locator('.meditech-context-rail')).toBeVisible();
    await expect(page.locator('.cd2004-inspector-window')).toBeVisible();
    await expect(page.locator('[data-injection-record-actions]')).toBeVisible();
    await settleForCapture(page);

    await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
      'narrow-desktop-injection-840x720.png',
      SNAPSHOT_OPTIONS
    );
  });

  test('minimum workstation keeps both bottom command zones fully visible', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.minimumDesktop);
    await openFixtureDraft(page);
    await expect(page.locator('.meditech-workstation-gate')).toHaveCount(0);
    await settleForCapture(page);

    await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
      'minimum-workstation-injection-800x600.png',
      SNAPSHOT_OPTIONS
    );

    const deck = page.locator('.meditech-command-deck');
    const statusbar = page.locator('.cd2004-statusbar');
    const recordActions = page.locator('[data-injection-record-actions]');
    const transaction = page.locator('.cd2004-transaction-window.has-document-split');
    const inspector = page.locator('.cd2004-inspector-window');
    const workWindow = page.locator('.cd2004-work-window');
    const deckBox = await deck.boundingBox();
    const statusBox = await statusbar.boundingBox();
    const recordBox = await recordActions.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    const workWindowBox = await workWindow.boundingBox();
    expect(deckBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(recordBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(workWindowBox).not.toBeNull();
    expect(deckBox.y + deckBox.height).toBeLessThanOrEqual(statusBox.y + 1);
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(VIEWPORTS.minimumDesktop.height + 1);
    expect(inspectorBox.y + inspectorBox.height).toBeLessThanOrEqual(
      workWindowBox.y + workWindowBox.height + 1
    );
    expect(await deck.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await transaction.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);

    const clippedCoreIdentifiers = await page
      .locator('.cd2004-patient-banner strong')
      .evaluateAll((labels) => labels.slice(0, 2)
        .filter((label) => label.scrollWidth > label.clientWidth + 1)
        .map((label) => label.textContent?.trim()));
    expect(clippedCoreIdentifiers).toEqual([]);

    const compactCommandLabels = await deck.locator('button > span').evaluateAll((labels) =>
      labels.map((label) => getComputedStyle(label, '::after').content.replace(/^"|"$/g, ''))
    );
    expect(compactCommandLabels).toEqual([
      'Help',
      'Section',
      'Page',
      'Stop',
      'Lookup',
      'EMR',
      'Save',
      'Back'
    ]);

    for (const button of await deck.locator('button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(deckBox.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(deckBox.y + deckBox.height + 1);
    }
    for (const button of await recordActions.locator('button:visible').all()) {
      const box = await button.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(recordBox.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(recordBox.y + recordBox.height + 1);
    }

    const verticallyClippedButtons = await page
      .locator('.meditech-command-deck button:visible, [data-injection-record-actions] button:visible')
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => button.scrollHeight > button.clientHeight + 1)
          .map((button) => ({
            label: button.textContent?.replace(/\s+/g, ' ').trim(),
            clientHeight: button.clientHeight,
            scrollHeight: button.scrollHeight
          }))
      );
    expect(verticallyClippedButtons).toEqual([]);
  });

  test('ready-to-attest and locked local records at 1440 x 900', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.desktop1440);
    await prepareReadyInjection(page);
    await settleForCapture(page);

    // Evaluate both terminal states in one run. Soft screenshot assertions
    // still fail the test, but a ready-state mismatch no longer prevents CI
    // from capturing and reporting the subsequent locked state as well.
    await expect.soft(page.locator('.cd2004-shell')).toHaveScreenshot(
      'ready-to-attest-1440x900.png',
      SNAPSHOT_OPTIONS
    );

    await lockReadyInjection(page);
    await settleForCapture(page);

    await expect.soft(page.locator('.cd2004-shell')).toHaveScreenshot(
      'locked-local-record-1440x900.png',
      SNAPSHOT_OPTIONS
    );
  });

  test('mobile viewport shows the deliberate workstation gate', async ({ page }) => {
    await bootDeterministicWorkstation(page, VIEWPORTS.unsupportedMobile);
    const gate = page.locator('.meditech-workstation-gate');
    await expect(gate).toBeVisible();
    await expect(gate).toContainText('Workstation view required');
    await expect(gate).toContainText('800 x 600 px');
    await expect(page.locator('.cd2004-shell')).toBeHidden();
    await expect(page.locator('.meditech-workstation-content')).toHaveAttribute('inert', '');
    await settleForCapture(page);

    await expect(page).toHaveScreenshot(
      'unsupported-mobile-390x844.png',
      SNAPSHOT_OPTIONS
    );
  });
});
