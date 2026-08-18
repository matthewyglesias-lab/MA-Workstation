const { test, expect } = require('@playwright/test');
const { setProvider, expectProviderValue, selectRegisteredProvider } = require('./provider-entry');
const { fillDate } = require('./date-entry');
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
  'injWorksheetSheet',
  'injPatientScreenSheet'
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

async function prepareExplicitNormalUdsPrintFixture(page) {
  const panel = page.locator('.wfp-panel');
  await panel.locator('select[name="uds-reason"]').selectOption('routine');
  await panel.getByRole('button', { name: 'Use current date/time' }).click();
  await panel.locator('.wfp-field', { hasText: 'Device' })
    .locator('select').selectOption('SAFE life 14-Panel Cup');
  await panel.getByRole('button', { name: 'Review normal QC…' }).click();
  await page.getByRole('dialog', { name: 'Review normal QC' })
    .getByRole('button', { name: 'Confirm normal QC' }).click();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await panel.locator('.wfp-field', { hasText: 'Medication alignment' })
    .locator('select').selectOption('no unexpected');
  await panel.getByRole('tab', { name: /^Results/ }).click();
  await panel.getByRole('button', { name: 'Mark displayed panels negative…' }).click();
  await page.getByRole('dialog', { name: 'Mark displayed panels negative' })
    .getByRole('button', { name: 'Mark displayed panels NEG' }).click();
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
  await setProvider(panel, 'Print Ordering Provider');
  await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });

  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
  // Explicitly document the custom name while preserving the byte-pinned
  // production print fixture's historical display value.
  await panel.locator('.wfp-field:has-text("Medication name") input').fill('Other');
  await panel.locator('input[name="inj-dose"]').fill('100 mg');
  await panel.locator('input[name="inj-route"]').fill('IM');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
  await fillDate(
    panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]'), '2026-07-30');

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByText('R deltoid', { exact: true }).click();

  await panel.getByRole('tab', { name: 'Product', exact: true }).click();
  await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-01');
  await panel.locator('input[placeholder="LOT123"]').fill('PRINT-LOT-001');
  await panel.locator('input[type="month"]').first().fill('2027-12');

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.locator('input[placeholder*="allergy / ADR status"]').fill('NKDA verified in active record');
  await panel.locator('label[for="inj-safety-none"]').click();

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.locator('input[type="time"]').first().fill('09:41');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Print QA, MA');

  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await panel.locator('select[name="inj-response"]').selectOption('well');

  const administered = page.locator(
    '#clinicalDisposition [data-disposition="administered"]'
  );
  await expect(administered).toBeEnabled();
  await panel.getByText('Review complete — document administration', { exact: true }).click();
  await expect(page.locator('#clinicalDispositionBadge'))
    .toHaveText('Administration documented');
}

async function prepareInitiationInjection(page) {
  await bootWorkstation(page);
  await openWorkflow(page, 'Injection', 'administer');
  const panel = page.locator('.wfp-panel');
  await panel.locator('input[placeholder="Last, First"]').fill('Print, Initiation');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('09/22/1991');
  await setProvider(panel, 'Print Ordering Provider');
  await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Initiation' });
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
  await panel.locator('select[name="inj-dose"]').selectOption('234 mg');
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
  await fillDate(
    panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]'), '2026-07-30');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByText('R deltoid', { exact: true }).click();
  await panel.locator('input[type="time"]').first().fill('09:41');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Print QA, MA');
  await panel.getByRole('tab', { name: 'Product', exact: true }).click();
  await panel.locator('input[placeholder="LOT123"]').fill('START-PRINT-001');
  await panel.locator('input[type="month"]').first().fill('2027-12');
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  await panel.locator('label:has-text("Day 1 initiation")').click();
}

async function prepareVivitrolInjection(page) {
  await bootWorkstation(page);
  await openWorkflow(page, 'Injection', 'administer');
  const panel = page.locator('.wfp-panel');
  await panel.locator('input[placeholder="Last, First"]').fill('Print, Vivitrol');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('02/12/1977');
  await setProvider(panel, 'Print Ordering Provider');
  await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Scheduled' });
  await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Vivitrol' });
  await panel.locator('select[name="inj-dose"]').selectOption({ label: '380 mg' });
  await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
  await fillDate(
    panel
      .locator('.wfp-field', { hasText: 'Administration date' })
      .locator('input[data-workstation-date="date"]'), '2026-08-14');

  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await panel.getByText('R ventrogluteal', { exact: true }).click();
  await panel.locator('input[type="time"]').first().fill('14:59');
  await panel.locator('input[placeholder="J. Doe, LVN"]').fill('Print QA, MA');

  await panel.getByRole('tab', { name: 'Product', exact: true }).click();
  await panel.locator('input[placeholder="LOT123"]').fill('VIV-PRINT-001');
  await panel.locator('input[type="month"]').first().fill('2028-07');

}

async function expectAvsPagesToFit(page) {
  const integrity = await page.locator('#avsSheet').evaluate(root => {
    const overflowState = node => {
      const style = getComputedStyle(node);
      return {
        node: node.id ? `#${node.id}` : node.tagName.toLowerCase(),
        overflowX: style.overflowX,
        overflowY: style.overflowY
      };
    };
    const pages = [...root.querySelectorAll('.avs2-page')].map((avsPage, index) => {
      const footer = avsPage.querySelector(':scope > .avs2-foot');
      const content = [...avsPage.children].filter(child => child !== footer);
      const contentBottom = content.length
        ? Math.max(...content.map(child => child.getBoundingClientRect().bottom))
        : avsPage.getBoundingClientRect().top;
      const footerTop = footer?.getBoundingClientRect().top ??
        avsPage.getBoundingClientRect().bottom;
      const clippingNodes = [...avsPage.querySelectorAll('*')]
        .filter(node => {
          const style = getComputedStyle(node);
          return style.overflowY !== 'visible' && node.scrollHeight - node.clientHeight > 1;
        })
        .map(node => node.className || node.tagName.toLowerCase());
      return {
        page: index + 1,
        ownVerticalOverflow: avsPage.scrollHeight - avsPage.clientHeight,
        footerOverlap: Math.ceil(contentBottom - footerTop),
        clippingNodes
      };
    });
    return {
      scrollContainers: [
        overflowState(document.documentElement),
        overflowState(document.body),
        overflowState(document.getElementById('print-root')),
        overflowState(root)
      ],
      pages
    };
  });

  expect(integrity.scrollContainers).toEqual([
    { node: 'html', overflowX: 'visible', overflowY: 'visible' },
    { node: 'body', overflowX: 'visible', overflowY: 'visible' },
    { node: '#print-root', overflowX: 'visible', overflowY: 'visible' },
    { node: '#avsSheet', overflowX: 'visible', overflowY: 'visible' }
  ]);
  for (const result of integrity.pages) {
    expect(result.ownVerticalOverflow, `AVS page ${result.page} overflows vertically`).toBeLessThanOrEqual(1);
    expect(result.footerOverlap, `AVS page ${result.page} content overlaps its footer`).toBeLessThanOrEqual(0);
    expect(result.clippingNodes, `AVS page ${result.page} contains a vertical clip`).toEqual([]);
  }
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
      'print-inj-worksheet',
      'print-inj-patient-screen'
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
  let canonical = html
    .replace(/\r\n?/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ');

  // The injection AVS carries two values that legitimately differ on every run:
  // the actual print time (to the minute) and the local record id, which is
  // generated per draft. Normalise both so the hash still pins every other byte
  // of the sheet. The stamp pattern is tight enough that it cannot match
  // anything else; the record id is read out of the identity band and then
  // replaced wherever it appears, because the footer repeats it.
  canonical = canonical.replace(
    /Printed \d{2}\/\d{2}\/\d{2} \d{4}/g,
    'Printed <stamp>'
  );

  // Anchored to the patient band's semantic key/value elements. This regex has to
  // move whenever the identity markup changes: if it stops matching it fails
  // silently, leaving the per-draft record id in the hashed output and turning
  // this parity check non-deterministic rather than red.
  const recordId = (
    canonical.match(
      /<dt class="avs2-id-k">RECORD NO<\/dt>\s*<dd class="avs2-id-v">([^<]*)/
    )?.[1] ?? ''
  ).trim();
  // Guard against blanking the document when nothing meaningful is documented.
  if (recordId.length >= 4) {
    canonical = canonical.split(recordId).join('<record-id>');
  }

  return canonical.trim();
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

  // Compare only the pinned fields so a fixture entry can also carry a `note`
  // recording why a root intentionally diverges from the production commit.
  expect(
    actual,
    `#${rootId} renderer output drifted from production commit ` +
      printBaseline.baselineCommit
  ).toEqual({
    sha256: expected.sha256,
    bytes: expected.bytes,
    topLevelClass: expected.topLevelClass
  });
}

async function expectPrintContract(page, {
  rootId,
  content,
  minPages = 1,
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
  expect(pageCount).toBeGreaterThanOrEqual(minPages);
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

  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  // Prove the real user-facing gate: the button is reachable and enabled
  // with only the minimal fields above, matching the loosened AVS gate.
  // Scoped to the Outcome tab's "Document output" section specifically -
  // a second, always-visible quick-access "Print AVS" now also lives in
  // the summary bar, so a bare text match would hit both.
  const printButton = panel.locator('.cd2004-command-button:has-text("Print AVS")');
  await expect(printButton).toBeEnabled();

  // Deliberately do NOT click it: its handler adds the print-avs body
  // class, calls window.print(), and clears the class again via a bare
  // 500ms setTimeout regardless of whether printing finished. A real
  // browser print dialog blocks that timer; headless/CI has no dialog to
  // block it, and under CI's actual worker parallelism the timer can fire
  // mid-test even with a same-tick workaround after it, intermittently
  // hiding the sheet again before the assertions below run. toBeEnabled()
  // above already proves the real gate; drive the actual content/layout
  // assertions the same race-free way every other test in this file does.
  await setFieldsAndRender(page, {
    bodyClass: 'print-avs',
    renderName: 'renderAVS',
    rootId: 'avsSheet'
  });
}

test.describe('unchanged clinical print surfaces', () => {
  // `ProviderField` stores the provider register's stable id, not a display
  // name (adeniji-john, not "Adeniji, John, PMHNP"). The AVS handout goes
  // home with the patient, so if any layer forgets to resolve that id back
  // to a name, the patient's own after-visit summary names their provider
  // by an internal database key.
  test('resolves the registered ordering provider to a display name on the AVS handout', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'Injection', 'administer');
    const panel = page.locator('.wfp-panel');
    await expect(panel).toBeVisible();

    await panel.locator('input[placeholder="Last, First"]').fill('Print, Registered Provider');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('05/06/1990');
    await selectRegisteredProvider(panel, 'adeniji-john');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('input[name="inj-dose"]').fill('50 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
    await panel.getByText('R deltoid', { exact: true }).click();

    await panel.getByRole('tab', { name: 'Review', exact: true }).click();
    const printButton = panel.locator('.cd2004-command-button:has-text("Print AVS")');
    await expect(printButton).toBeEnabled();

    await setFieldsAndRender(page, {
      bodyClass: 'print-avs',
      renderName: 'renderAVS',
      rootId: 'avsSheet'
    });

    await expect(page.locator('#avsSheet .avs2-id-provider .avs2-id-v'))
      .toHaveText('Adeniji, John, PMHNP');
  });


  test('keeps the injection record-actions bar and shell out of an early AVS printout', async ({ page }) => {
    await prepareMinimalAvsInjection(page);
    await expect(page.locator('#avsSheet .avs2-status')).toHaveText(
      'STAFF PREVIEW - NOT FINAL'
    );
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /AFTER VISIT SUMMARY/i,
        /LONG-ACTING INJECTION/i,
        /Print, Early AVS/i
      ],
      checkParity: false,
      maxPages: 1
    });
  });

  test('isolates the injection AVS on a sane Letter printout', async ({ page }) => {
    await preparePrintableInjection(page);
    await setFieldsAndRender(page, {
      bodyClass: 'print-avs',
      renderName: 'renderAVS',
      rootId: 'avsSheet'
    });
    const avs = page.locator('#avsSheet');
    await expect(avs.locator('article.avs2')).toHaveCount(1);
    await expect(avs.locator('header.avs2-run')).toHaveCount(1);
    await expect(avs.locator('h1.avs2-title')).toHaveCount(1);
    await expect(avs.locator('section.avs2-id')).toHaveCount(1);
    await expect(avs.locator('.avs2-status')).toHaveText('PATIENT COPY');
    await expect(avs.locator('ol.avs2-spine > li.avs2-step')).toHaveCount(2);
    await expect(avs.locator('.avs2-step-given')).toContainText('Other, 100 mg');
    await expect(avs.getByText('Print QA, MA', { exact: true })).toHaveCount(1);
    await expect(avs.locator('dl.avs2-pairs')).toContainText('AFTER HOURS');
    await expect(avs.locator('.avs2-page')).toHaveCount(1);
    await expectAvsPagesToFit(page);
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /AFTER VISIT SUMMARY/i,
        /LONG-ACTING INJECTION/i,
        /Print, Injection/i,
        // The due date is the sheet's primary call to action, and the window
        // is deliberately not printed - patients are asked for the exact day.
        /YOUR NEXT INJECTION/i,
        /DUE DATE - CALL US TO SCHEDULE OR RESCHEDULE/i,
        /not a scheduled appointment/i,
        /PRINT-LOT-001/i,
        // Walk-in policy and the San Bernardino number appear on every sheet.
        /9:30 AM - 4:30 PM/i,
        /\(909\) 887-6222/i
      ],
      maxPages: 1
    });
  });

  test('paginates Vivitrol safety guidance without clipping or printable scrollbars', async ({ page }) => {
    await prepareVivitrolInjection(page);
    await setFieldsAndRender(page, {
      bodyClass: 'print-avs',
      renderName: 'renderAVS',
      rootId: 'avsSheet'
    });
    const avs = page.locator('#avsSheet');
    await expect(avs.locator('.avs2-page')).toHaveCount(2);
    await expect(avs.locator('footer.avs2-foot')).toHaveCount(2);
    await expect(avs.locator('footer.avs2-foot').first()).toContainText('Page 1 of 2');
    await expect(avs.locator('footer.avs2-foot').last()).toContainText('Page 2 of 2');
    await expect(avs.locator('.avs2-page-primary')).toContainText(
      'IMPORTANT - OPIOID TOLERANCE AND OVERDOSE RISK'
    );
    await expect(avs.locator('.avs2-page-continuation')).toContainText(
      'EMERGENCY - CALL 911 OR GO TO THE NEAREST ER NOW IF'
    );
    await expectAvsPagesToFit(page);
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /Vivitrol, 380 mg/i,
        /CALL BEFORE YOU COME IN/i,
        /After Visit Summary - Continued/i,
        /VIV-PRINT-001/i
      ],
      minPages: 2,
      maxPages: 2,
      checkParity: false
    });
  });

  test('prints initiation guidance as two complete identified pages', async ({ page }) => {
    await prepareInitiationInjection(page);
    await setFieldsAndRender(page, {
      bodyClass: 'print-avs',
      renderName: 'renderAVS',
      rootId: 'avsSheet'
    });
    const avs = page.locator('#avsSheet');
    await expect(avs.locator('.avs2-page')).toHaveCount(2);
    await expect(avs.locator('footer.avs2-foot')).toHaveCount(2);
    await expect(avs.locator('footer.avs2-foot').first()).toContainText('Page 1 of 2');
    await expect(avs.locator('footer.avs2-foot').last()).toContainText('Page 2 of 2');
    await expect(avs.locator('.avs2-continuation')).toContainText(
      /Print, Initiation - DOB 09\/22\/1991/i
    );
    await expectAvsPagesToFit(page);
    await expectPrintContract(page, {
      rootId: 'avsSheet',
      content: [
        /STARTING SERIES - DOSE 1 OF 2/i,
        /Come back for your second starting injection/i,
        /After Visit Summary - Continued/i,
        /START-PRINT-001/i
      ],
      minPages: 2,
      maxPages: 2,
      checkParity: false
    });
  });

  test('isolates the UDS clinician report without print clipping', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'UDS', 'uds');
    await prepareExplicitNormalUdsPrintFixture(page);
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
      ],
      checkParity: false
    });
    await expect(page.locator('#udsSheet')).not.toContainText('Draft status');
  });

  test('isolates the UDS patient summary on Letter pages', async ({ page }) => {
    await bootWorkstation(page);
    await openWorkflow(page, 'UDS', 'uds');
    await prepareExplicitNormalUdsPrintFixture(page);
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
      ],
      checkParity: false
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

  test('prints the bilingual patient screening form without leaking workstation chrome', async ({ page }) => {
    await bootWorkstation(page);
    await expect
      .poll(() => page.evaluate(() => window.__IPMG_INJECTION_PATIENT_SCREENING_ENABLED__ === true))
      .toBe(true);

    await openWorkflow(page, 'Injection', 'administer');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input[placeholder="Last, First"]').fill('Print, Screening');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await panel.locator('select[name="inj-medication"]').selectOption('uzedy');

    const screeningAction = panel.locator('[data-patient-screening-print="summary"]');
    await expect(screeningAction).toBeVisible();
    await expect(screeningAction).toBeDisabled();
    await panel.locator('select[name="inj-dose"]').selectOption({ label: '200 mg' });
    await expect(screeningAction).toBeEnabled();

    await page.evaluate(() => {
      window.__printCalls = 0;
      window.__ipmgNativePrint = () => {
        window.__printCalls += 1;
      };
      // The click below calls window.print(), which the hardener
      // (legacy-runtime.js) wraps with an afterprint listener plus a 1s
      // backstop timer that force-clears every staged print class - built
      // explicitly for "environments that never fire afterprint (headless
      // automation)", which is exactly this test: __ipmgNativePrint is
      // mocked to a no-op, so no real dialog ever closes and afterprint
      // never fires naturally, meaning that backstop WILL fire on its own
      // 1s schedule. A second, independent cleanup path
      // (patchPrintCleanup's own afterprint/visibilitychange/focus
      // listeners) races the same class on its own timers too. Every one of
      // these routes through window.cleanPrintClasses before falling back
      // to its own class list, so neutralizing that one shared function -
      // rather than trying to out-run or individually silence each timer -
      // deterministically removes every race source at once. Confirmed by
      // tracing the class's state every 100ms across a 2s window with and
      // without this line: without it, the class is gone by the 1s mark
      // every time; with it, the class never moves once staged.
      window.cleanPrintClasses = () => {};
    });
    await screeningAction.click();
    const dialog = page.locator('.cd2004-patient-screening-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-patient-screening-language="es"]').click();

    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('injPatientScreenSheet')?.textContent ?? '')
      )
      .toContain('EVALUACIÓN PREVIA A LA INYECCIÓN Y CONSENTIMIENTO');
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('injPatientScreenSheet')?.textContent ?? '')
      )
      .not.toContain('BORRADOR');
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

    // Re-stage for the print-mode assertions below - safe now that every
    // cleanup path routing through window.cleanPrintClasses is neutered,
    // regardless of how long expectPrintContract's own assertions take.
    await page.evaluate(() => document.body.classList.add('print-inj-patient-screen'));
    await page.emulateMedia({ media: 'print' });
    await expectPrintContract(page, {
      rootId: 'injPatientScreenSheet',
      content: [
        /EVALUACI/i,
        /Print, Screening/i,
        /UZEDY/i,
        /200 mg/i,
        /SEGUIMIENTO \/ ACCIÓN DEL PERSONAL/i
      ],
      checkParity: false,
      maxPages: 2
    });

    // window.cleanPrintClasses is neutered for the rest of this test (see
    // above), so nothing will remove this class on its own - clean up
    // directly instead of relying on any of the app's own cleanup paths.
    await page.evaluate(() => document.body.classList.remove('print-inj-patient-screen'));
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('print-inj-patient-screen')))
      .toBe(false);
  });

  test('prints expanded informed consent only for an initiation-like patient screening form', async ({ page }) => {
    await bootWorkstation(page);
    await expect
      .poll(() => page.evaluate(() => window.__IPMG_INJECTION_PATIENT_SCREENING_ENABLED__ === true))
      .toBe(true);

    await openWorkflow(page, 'Injection', 'administer');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input[placeholder="Last, First"]').fill('Print, Initiation');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await panel.locator('select[name="inj-medication"]').selectOption('vivitrol');
    await panel.locator('select[name="inj-reason"]').selectOption('initiation');
    await panel.locator('select[name="inj-dose"]').selectOption({ label: '380 mg' });

    await page.evaluate(() => {
      window.__printCalls = 0;
      window.__ipmgNativePrint = () => {
        window.__printCalls += 1;
      };
      // The click below calls window.print(), which the hardener
      // (legacy-runtime.js) wraps with an afterprint listener plus a 1s
      // backstop timer that force-clears every staged print class - built
      // explicitly for "environments that never fire afterprint (headless
      // automation)", which is exactly this test: __ipmgNativePrint is
      // mocked to a no-op, so no real dialog ever closes and afterprint
      // never fires naturally, meaning that backstop WILL fire on its own
      // 1s schedule. A second, independent cleanup path
      // (patchPrintCleanup's own afterprint/visibilitychange/focus
      // listeners) races the same class on its own timers too. Every one of
      // these routes through window.cleanPrintClasses before falling back
      // to its own class list, so neutralizing that one shared function -
      // rather than trying to out-run or individually silence each timer -
      // deterministically removes every race source at once. Confirmed by
      // tracing the class's state every 100ms across a 2s window with and
      // without this line: without it, the class is gone by the 1s mark
      // every time; with it, the class never moves once staged.
      window.cleanPrintClasses = () => {};
    });
    await panel.locator('[data-patient-screening-print="summary"]').click();
    const dialog = page.locator('.cd2004-patient-screening-dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-patient-screening-language="en"]').click();

    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('injPatientScreenSheet')?.textContent ?? '')
      )
      .toContain('INFORMED CONSENT');
    await expect(page.locator('#injPatientScreenSheet [data-section="consent"] .ips-question')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);

    // Re-stage for the print-mode assertions below - safe now that every
    // cleanup path routing through window.cleanPrintClasses is neutered,
    // regardless of how long expectPrintContract's own assertions take.
    await page.evaluate(() => document.body.classList.add('print-inj-patient-screen'));
    await page.emulateMedia({ media: 'print' });
    await expectPrintContract(page, {
      rootId: 'injPatientScreenSheet',
      content: [
        /PRE-INJECTION SCREENING & CONSENT/i,
        /VIVITROL/i,
        /CONSENT DISCUSSION/i,
        /INFORMED CONSENT/i,
        /Patient \/ legal representative signature/i
      ],
      checkParity: false,
      minPages: 2,
      maxPages: 2
    });

    // window.cleanPrintClasses is neutered for the rest of this test (see
    // above), so nothing will remove this class on its own - clean up
    // directly instead of relying on any of the app's own cleanup paths.
    await page.evaluate(() => document.body.classList.remove('print-inj-patient-screen'));
    await expect
      .poll(() => page.evaluate(() => document.body.classList.contains('print-inj-patient-screen')))
      .toBe(false);
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
