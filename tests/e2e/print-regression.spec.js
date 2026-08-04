const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const printBaseline = require('../fixtures/print-baseline-v1.json');

const PRINT_ROOT_IDS = [
  'avsSheet',
  'udsSheet',
  'udsPatientSheet',
  'sampleSheet',
  'letterSheet',
  'dailySheet',
  'sampleWorksheetSheet',
  'injWorksheetSheet'
];

async function bootWorkstation(page) {
  await page.clock.install({ time: new Date(printBaseline.fixedClock) });
  await page.goto('/');
  await expect(page.locator('.cd2004-shell')).toBeVisible();
  await expect(page.locator('#print-root')).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => typeof window.renderAVS))
    .toBe('function');
}

async function openWorkflow(page, title, workflow) {
  await page.locator(`.cd2004-nav-item[title="${title}"]`).click();
  await expect(page.locator('.cd2004-shell'))
    .toHaveAttribute('data-active-workflow', workflow);
}

async function preparePrintableInjection(page) {
  await bootWorkstation(page);
  await openWorkflow(page, 'Injection', 'administer');
  const panel = page.locator('.wfp-panel');
  await expect(panel).toBeVisible();

  // Injection is migrated to a real panel; fields are set through it so the
  // hidden legacy mirror ends up with the exact same values (and therefore
  // the exact same byte-pinned print output) as the pre-migration fixture.
  await panel.locator('input[placeholder="Last, First"]').fill('Print, Injection');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
  await panel.locator('input[placeholder="Provider name"]').fill('Print Ordering Provider');
  await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });

  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
  await panel.locator('input[name="inj-dose"]').fill('100 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByText('R deltoid', { exact: true }).click();

  await panel.getByRole('tab', { name: 'Product', exact: true }).click();
  await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-01');
  await panel.locator('input[placeholder="LOT123"]').fill('PRINT-LOT-001');
  await panel.locator('input[type="month"]').first().fill('2027-12');

  await panel.getByRole('tab', { name: 'Verification', exact: true }).click();
  await panel.locator('input[placeholder*="allergy / ADR status"]').fill('NKDA verified in active record');
  await panel.locator('label[for="inj-safety-none"]').click();

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.locator('input[type="time"]').first().fill('09:41');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Print QA, MA');

  await panel.getByRole('tab', { name: 'Schedule', exact: true }).click();
  await panel.locator('input[type="date"]').nth(1).fill('2026-07-30');
  await panel.locator('input[type="date"]').nth(2).fill('2026-08-27');

  await panel.getByRole('tab', { name: 'Outcome', exact: true }).click();

  const administered = page.locator(
    '#clinicalDisposition [data-disposition="administered"]'
  );
  await expect(administered).toBeEnabled();
  await panel.getByText('Review complete — document administration', { exact: true }).click();
  await expect(page.locator('#clinicalDispositionBadge'))
    .toHaveText('Administration documented');
}

async function setFieldsAndRender(page, {
  bodyClass,
  renderName,
  rootId,
  fields = {}
}) {
  await page.evaluate(({ bodyClass, renderName, rootId, fields, printRootIds }) => {
    const printClasses = [
      'print-avs',
      'print-uds',
      'print-uds-patient',
      'print-sample',
      'print-letter',
      'print-daily',
      'print-sample-worksheet',
      'print-inj-worksheet'
    ];

    for (const className of printClasses) {
      document.body.classList.remove(className);
    }

    for (const [id, value] of Object.entries(fields)) {
      const control = document.getElementById(id);
      if (!control || !('value' in control)) {
        throw new Error(`Print fixture field #${id} is unavailable`);
      }
      control.value = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const renderer = window[renderName];
    if (typeof renderer !== 'function') {
      throw new Error(`Print renderer window.${renderName} is unavailable`);
    }
    renderer();

    const root = document.getElementById(rootId);
    if (!root || !root.textContent.trim()) {
      throw new Error(`Print renderer window.${renderName} produced no content`);
    }
    for (const id of printRootIds) {
      const sheet = document.getElementById(id);
      if (!sheet) throw new Error(`Expected print root #${id} is unavailable`);
    }

    document.body.classList.add(bodyClass);
  }, { bodyClass, renderName, rootId, fields, printRootIds: PRINT_ROOT_IDS });

  await page.emulateMedia({ media: 'print' });
}

function inspectPdf(pdf) {
  const source = pdf.toString('latin1');
  const pageCount = (source.match(/\/Type\s*\/Page\b/g) || []).length;
  const mediaBoxes = [...source.matchAll(
    /\/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([0-9.]+)\s+([0-9.]+)\s*\]/g
  )].map(match => ({
    width: Number(match[1]),
    height: Number(match[2])
  }));
  return { pageCount, mediaBoxes };
}

function canonicalPrintHtml(html) {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

async function expectProductionRendererParity(page, rootId) {
  const expected = printBaseline.outputs[rootId];
  expect(expected, `Missing production print fixture for #${rootId}`).toBeTruthy();

  const root = page.locator(`#${rootId}`);
  const canonicalHtml = canonicalPrintHtml(await root.innerHTML());
  const actual = {
    sha256: createHash('sha256').update(canonicalHtml).digest('hex'),
    bytes: Buffer.byteLength(canonicalHtml),
    topLevelClass: await root.locator(':scope > *').first().getAttribute('class')
  };

  expect(
    actual,
    `#${rootId} renderer output drifted from production commit ` +
      printBaseline.baselineCommit
  ).toEqual(expected);
}

async function expectPrintContract(page, {
  rootId,
  content,
  maxPages = 2,
  maxContentWidth = 800,
  checkParity = true
}) {
  const root = page.locator(`#${rootId}`);
  await expect(root).toBeVisible();
  for (const pattern of content) {
    await expect(root).toContainText(pattern);
  }
  // The byte-pinned parity fixture only matches the specific fully-filled
  // fixture data used elsewhere in this file - callers exercising a
  // different fill (e.g. the minimal early-print path) opt out and rely on
  // the content/layout assertions below instead.
  if (checkParity) await expectProductionRendererParity(page, rootId);

  const printLayout = await page.evaluate(({ rootId, printRootIds }) => {
    const root = document.getElementById(rootId);
    const rootBounds = root.getBoundingClientRect();
    const contentBounds = root.firstElementChild
      ? root.firstElementChild.getBoundingClientRect()
      : rootBounds;
    const visiblePrintRoots = printRootIds.filter(id => {
      const node = document.getElementById(id);
      return node && getComputedStyle(node).display !== 'none' &&
        node.getClientRects().length > 0;
    });
    const visibleChrome = [...document.querySelectorAll(
      '.cd2004-print-exclude, .cd2004-window-titlebar, ' +
      '.cd2004-window-toolbar, .cd2004-window-footer, ' +
      '.cd2004-navigator-window, .cd2004-inspector-window'
    )]
      .filter(node => getComputedStyle(node).display !== 'none' &&
        node.getClientRects().length > 0)
      .map(node => node.className);
    const horizontalOffenders = [...root.querySelectorAll('*')]
      .filter(node => {
        if (!node.getClientRects().length) return false;
        const bounds = node.getBoundingClientRect();
        const overflowX = getComputedStyle(node).overflowX;
        const clipsOwnContent =
          overflowX !== 'visible' &&
          node.scrollWidth - node.clientWidth > 1;
        return clipsOwnContent ||
          bounds.left < rootBounds.left - 1 ||
          bounds.right > rootBounds.right + 1;
      })
      .slice(0, 12)
      .map(node => {
        const bounds = node.getBoundingClientRect();
        return {
          node: node.id
            ? `#${node.id}`
            : `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`,
          ownOverflow: node.scrollWidth - node.clientWidth,
          left: Math.round(bounds.left - rootBounds.left),
          right: Math.round(bounds.right - rootBounds.right)
        };
      });

    const legacyHost = document.querySelector('.cd2004-legacy-host');
    // The whole new-shell workstation (patient banner, workflow panel, and
    // any workflow-specific chrome rendered outside the tab body - e.g. the
    // injection record-actions bar) must collapse to nothing during a print
    // job. Checking the shell root itself, rather than an enumerated list of
    // "known chrome" selectors, is what actually catches a new control added
    // anywhere inside it leaking onto a printed sheet.
    const shell = document.querySelector('.cd2004-shell');
    return {
      visiblePrintRoots,
      visibleChrome,
      shellDisplay: shell ? getComputedStyle(shell).display : 'none',
      legacyHostDisplay: legacyHost ? getComputedStyle(legacyHost).display : 'none',
      pageOverflow: document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      rootWidth: rootBounds.width,
      contentWidth: contentBounds.width,
      horizontalOffenders
    };
  }, { rootId, printRootIds: PRINT_ROOT_IDS });

  expect(printLayout.visiblePrintRoots).toEqual([rootId]);
  expect(printLayout.visibleChrome).toEqual([]);
  expect(printLayout.shellDisplay).toBe('none');
  expect(printLayout.legacyHostDisplay).toBe('none');
  expect(printLayout.pageOverflow).toBeLessThanOrEqual(1);
  expect(printLayout.rootOverflow).toBeLessThanOrEqual(1);
  expect(printLayout.rootWidth).toBeGreaterThan(500);
  expect(printLayout.contentWidth).toBeGreaterThan(500);
  expect(printLayout.contentWidth).toBeLessThanOrEqual(maxContentWidth);
  expect(
    printLayout.horizontalOffenders,
    `Horizontal print clipping in #${rootId}`
  ).toEqual([]);

  const pdf = await page.pdf({
    format: 'Letter',
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false
  });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(5_000);

  const { pageCount, mediaBoxes } = inspectPdf(pdf);
  expect(pageCount).toBeGreaterThanOrEqual(1);
  expect(pageCount).toBeLessThanOrEqual(maxPages);
  expect(mediaBoxes.length).toBeGreaterThan(0);
  for (const box of mediaBoxes) {
    expect(Math.abs(box.width - 612)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - 792)).toBeLessThanOrEqual(1);
  }
}

async function prepareMinimalAvsInjection(page) {
  await bootWorkstation(page);
  await openWorkflow(page, 'Injection', 'administer');
  const panel = page.locator('.wfp-panel');
  await expect(panel).toBeVisible();

  // Deliberately fill only what the loosened AVS gate requires - medication,
  // dose, route, site, and administration date - and nothing from
  // Verification/Outcome (no attestations, no disposition). This is the
  // real early-print path: AVS must be available, and clean, well before a
  // full administration is documented.
  await panel.locator('input[placeholder="Last, First"]').fill('Print, Early AVS');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('05/06/1990');
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
  await panel.locator('input[name="inj-dose"]').fill('50 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByText('R deltoid', { exact: true }).click();

  await panel.getByRole('tab', { name: 'Outcome', exact: true }).click();
  // Prove the real user-facing gate: the button is reachable and enabled
  // with only the minimal fields above, matching the loosened AVS gate.
  const printButton = panel.locator('button:has-text("Print AVS")');
  await expect(printButton).toBeEnabled();

  // The button's own click handler adds the print-avs body class, calls
  // window.print(), and clears the class again via a 500ms setTimeout
  // regardless of whether printing finished - a real browser print dialog
  // blocks that timer, but headless/CI has no dialog to block it, so the
  // class can already be gone before the PDF/layout assertions below run.
  // Click it anyway to exercise the real path, then drive the actual
  // assertions the same race-free way every other test in this file does:
  // render and set the print class directly.
  await printButton.click();
  await setFieldsAndRender(page, {
    bodyClass: 'print-avs',
    renderName: 'renderAVS',
    rootId: 'avsSheet'
  });
}

test.describe('unchanged clinical print surfaces', () => {
  test('keeps the injection record-actions bar and shell out of an early AVS printout', async ({ page }) => {
    await prepareMinimalAvsInjection(page);
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /Injection after-visit summary/i,
        /Print, Early AVS/i
      ],
      checkParity: false
    });
  });

  test('isolates the injection AVS on a sane Letter printout', async ({ page }) => {
    await preparePrintableInjection(page);
    await setFieldsAndRender(page, {
      bodyClass: 'print-avs',
      renderName: 'renderAVS',
      rootId: 'avsSheet'
    });
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /Injection after-visit summary/i,
        /Print, Injection/i,
        /Next injection/i,
        /PRINT-LOT-001/i
      ]
    });
  });

  test('isolates the UDS clinician report without print clipping', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'UDS', 'uds');
    await setFieldsAndRender(page, {
      bodyClass: 'print-uds',
      renderName: 'renderUdsReport',
      rootId: 'udsSheet',
      fields: {
        udsPtName: 'Print, UDS',
        udsDOB: '02/03/1991',
        udsCollector: 'Print QA, MA',
        udsLot: 'UDS-PRINT-002',
        udsExp: '2027-11'
      }
    });
    await expectPrintContract(page, {
      rootId: 'udsSheet',
      content: [
        /Point-of-Care Urine Drug Screen Report/i,
        /Print, UDS/i,
        /Qualitative screening results/i,
        /UDS-PRINT-002/i
      ]
    });
  });

  test('isolates the UDS patient summary on Letter pages', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'UDS', 'uds');
    await setFieldsAndRender(page, {
      bodyClass: 'print-uds-patient',
      renderName: 'renderUdsPatientSummary',
      rootId: 'udsPatientSheet',
      fields: {
        udsPtName: 'Print, UDS Patient',
        udsDOB: '02/04/1991',
        udsCollector: 'Print QA, MA',
        udsLot: 'UDS-PATIENT-005',
        udsExp: '2027-11'
      }
    });
    await expectPrintContract(page, {
      rootId: 'udsPatientSheet',
      content: [
        /Urine drug screen visit summary/i,
        /Print, UDS Patient/i,
        /Today.s main takeaway/i,
        /What this means/i,
        /does not diagnose substance use/i
      ]
    });
  });

  test('isolates the medication-sample handout on Letter pages', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'Samples', 'samples');
    await setFieldsAndRender(page, {
      bodyClass: 'print-sample',
      renderName: 'renderSampleSheet',
      rootId: 'sampleSheet',
      fields: {
        samplePtName: 'Print, Sample',
        sampleDOB: '03/04/1992',
        samplePrescriber: 'Print Prescriber',
        sampleStaff: 'Print QA, MA',
        sampleDate: '2026-07-30',
        sampleQty: '14 tablets',
        sampleLot: 'SAMPLE-PRINT-003',
        sampleExp: '2027-10'
      }
    });
    await expectPrintContract(page, {
      rootId: 'sampleSheet',
      content: [
        /Medication sample instructions/i,
        /Print, Sample/i,
        /Sample tracking/i,
        /SAMPLE-PRINT-003/i
      ]
    });
  });

  test('isolates the populated sample worksheet without clipping', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'Samples', 'samples');
    await setFieldsAndRender(page, {
      bodyClass: 'print-sample-worksheet',
      renderName: 'renderSampleWorksheet',
      rootId: 'sampleWorksheetSheet',
      fields: {
        samplePtName: 'Print, Sample Worksheet',
        sampleDOB: '03/05/1992',
        samplePrescriber: 'Print Prescriber',
        sampleStaff: 'Print QA, MA',
        sampleDate: '2026-07-30',
        sampleMedLabel: 'Print Medication 10 mg',
        sampleQty: '1 package',
        sampleSig: 'Take one tablet daily as directed.',
        sampleLot: 'SAMPLE-WORKSHEET-006',
        sampleExp: '2027-10'
      }
    });
    await expectPrintContract(page, {
      rootId: 'sampleWorksheetSheet',
      content: [
        /Sample Dispensing Worksheet/i,
        /Print, Sample Worksheet/i,
        /Print Medication 10 mg/i,
        /SAMPLE-WORKSHEET-006/i,
        /Package trace manifest/i
      ],
      // The worksheet's print CSS intentionally fills the paged viewport.
      // Chromium exposes that unpaged viewport as 1440px before PDF layout,
      // so page count and Letter MediaBox are the authoritative fit checks.
      maxContentWidth: 1500
    });
  });

  test('isolates the populated injection worksheet without clipping', async ({ page }) => {
    await preparePrintableInjection(page);
    await setFieldsAndRender(page, {
      bodyClass: 'print-inj-worksheet',
      renderName: 'renderInjectionWorksheet',
      rootId: 'injWorksheetSheet'
    });
    await expectPrintContract(page, {
      rootId: 'injWorksheetSheet',
      content: [
        /Injection Start Worksheet/i,
        /Print, Injection/i,
        /Other/i,
        /R deltoid/i,
        /PRINT-LOT-001/i
      ],
      maxContentWidth: 1500
    });
  });

  test('isolates the forms provider letter as a single Letter page', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'Forms', 'forms');
    await setFieldsAndRender(page, {
      bodyClass: 'print-letter',
      renderName: 'renderLetterSheet',
      rootId: 'letterSheet',
      fields: {
        formsPtName: 'Print, Forms',
        formsDOB: '04/05/1993',
        formsProvider: 'Print Provider, MD',
        formsStaff: 'Print QA, MA',
        letterRecipient: 'Print Regression Recipient',
        letterSubject: 'Print Regression Verification'
      }
    });
    await expectPrintContract(page, {
      rootId: 'letterSheet',
      content: [
        /Provider Letter/i,
        /Print Regression Recipient/i,
        /Print Regression Verification/i,
        /Print, Forms/i,
        /Sincerely/i
      ],
      maxPages: 1
    });
  });

  test('isolates a populated daily-closeout ledger on Letter pages', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'ipmgMedAssistActivityLog_2026-07-30',
        JSON.stringify([{
          time: '4:42 PM',
          type: 'injection',
          status: 'completed',
          pt: 'Print, Closeout',
          summary: 'Maintenance injection documented',
          details: 'Routine print-regression fixture',
          trace: 'Lot CLOSEOUT-PRINT-004',
          follow: 'Next appointment scheduled',
          by: 'Print QA, MA'
        }])
      );
    });
    await bootWorkstation(page);
    await openWorkflow(page, 'Daily Closeout', 'log');
    await setFieldsAndRender(page, {
      bodyClass: 'print-daily',
      renderName: 'renderDailySheet',
      rootId: 'dailySheet'
    });
    await expectPrintContract(page, {
      rootId: 'dailySheet',
      content: [
        /Daily Activity Closeout/i,
        /Print, Closeout/i,
        /Maintenance injection documented/i,
        /CLOSEOUT-PRINT-004/i,
        /Full activity log/i
      ]
    });
  });
});
