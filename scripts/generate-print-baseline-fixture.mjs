import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

const DEFAULT_COMMIT = 'bc4a255d351793b59184760b537c7aef9abcf0bb';
const FIXED_CLOCK = '2026-07-30T12:00:00.000Z';
const projectRoot = resolve(import.meta.dirname, '..');
const outputPath = resolve(
  projectRoot,
  'tests/fixtures/print-baseline-v1.json',
);

const args = new Set(process.argv.slice(2));
if (!args.has('--write')) {
  throw new Error(
    'This command replaces the checked-in print baseline. Re-run with --write ' +
      'only after verifying the production commit and fixture scenarios.',
  );
}

const commitArg = process.argv.find((arg) => arg.startsWith('--commit='));
const baselineCommit = commitArg?.slice('--commit='.length) || DEFAULT_COMMIT;

function git(...args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalPrintHtml(value) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLegacyCss(html) {
  return (
    [...html.matchAll(/(<style(?:\s[^>]*)?>)([\s\S]*?)<\/style>/gi)]
      .map(
        (match, index) =>
          `/* Legacy stylesheet block ${index + 1}: ${match[1]} */\n` +
          `${match[2].trim()}\n/* </style> */`,
      )
      .join('\n\n') + '\n'
  );
}

async function openBaselinePage(browser, html, init) {
  const page = await browser.newPage({ timezoneId: 'America/Los_Angeles' });
  if (init) await page.addInitScript(init);
  await page.clock.install({ time: new Date(FIXED_CLOCK) });
  await page.route('http://print-baseline.test/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: html,
    }),
  );
  await page.goto('http://print-baseline.test/');
  await page.waitForFunction(() => typeof window.renderAVS === 'function');
  return page;
}

async function openInjectionCard(page, cardClass) {
  const card = page.locator(`#panel-administer .${cardClass}`);
  const isCollapsed = () =>
    card.evaluate(
      (node) =>
        node.classList.contains('rc530-collapsed') ||
        node.classList.contains('rc526-collapsed'),
    );
  if (!(await isCollapsed())) return;

  const summary = card
    .locator('.rc530-summary:visible, .rc526-summary:visible')
    .first();
  if (await summary.count()) await summary.click();
  else await card.locator('.card-head').click();
}

async function preparePrintableInjection(page) {
  await page.locator('.tab[data-tab="administer"]').click();
  await openInjectionCard(page, 'card-encounter');
  await page.locator('#ptName').fill('Print, Injection');
  await page.locator('#ptDOB').fill('01/02/1990');
  await page.locator('#orderingProvider').fill('Print Ordering Provider');
  await openInjectionCard(page, 'card-encounter');
  await page
    .locator('#reasonChips')
    .getByRole('button', { name: 'PRN / ordered', exact: true })
    .click();

  await openInjectionCard(page, 'card-medication');
  await page
    .locator('#medChips')
    .getByRole('button', { name: 'Other', exact: true })
    .click();
  await page.locator('#doseChips input').fill('100 mg');
  await page
    .locator('#routeChips')
    .getByRole('button', { name: 'IM', exact: true })
    .click();
  await page.locator('#bodyMap [data-site="R deltoid"]').click();
  await openInjectionCard(page, 'card-medication');
  await page
    .locator('#intChips')
    .getByRole('button', { name: 'q4 wk', exact: true })
    .click();

  await openInjectionCard(page, 'card-trace');
  await page.locator('#ndc').fill('00000-0000-01');
  await page.locator('#lot').fill('PRINT-LOT-001');
  await page.locator('#exp').fill('2027-12');

  await openInjectionCard(page, 'card-safety');
  await page.locator('#allergies').fill('NKDA verified in active record');
  await page.locator('[data-rc530-noacute]').click();

  await openInjectionCard(page, 'card-response');
  await page.locator('#adminDate').fill('2026-07-30');
  await page.locator('#injAdminTime').fill('09:41');
  await page.locator('#admin').fill('Print QA, MA');

  await openInjectionCard(page, 'card-return');
  await page.locator('#nextDate').fill('2026-08-27');
  await page
    .locator('#clinicalDisposition [data-disposition="administered"]')
    .click();
}

async function setFieldsAndRender(page, renderName, rootId, fields = {}) {
  await page.evaluate(
    ({ renderName, rootId, fields }) => {
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
      if (!root?.textContent?.trim()) {
        throw new Error(`Print renderer ${renderName} produced no content`);
      }
    },
    { renderName, rootId, fields },
  );
}

async function captureOutput(browser, html, {
  rootId,
  renderName,
  fields,
  injection = false,
  init,
}) {
  const page = await openBaselinePage(browser, html, init);
  try {
    if (injection) await preparePrintableInjection(page);
    await setFieldsAndRender(page, renderName, rootId, fields);
    const root = page.locator(`#${rootId}`);
    const canonicalHtml = canonicalPrintHtml(await root.innerHTML());
    return {
      sha256: sha256(canonicalHtml),
      bytes: Buffer.byteLength(canonicalHtml),
      topLevelClass:
        (await root.locator(':scope > *').first().getAttribute('class')) || '',
    };
  } finally {
    await page.close();
  }
}

const scenarios = [
  {
    rootId: 'avsSheet',
    renderName: 'renderAVS',
    injection: true,
  },
  {
    rootId: 'injWorksheetSheet',
    renderName: 'renderInjectionWorksheet',
    injection: true,
  },
  {
    rootId: 'udsSheet',
    renderName: 'renderUdsReport',
    fields: {
      udsPtName: 'Print, UDS',
      udsDOB: '02/03/1991',
      udsCollector: 'Print QA, MA',
      udsLot: 'UDS-PRINT-002',
      udsExp: '2027-11',
    },
  },
  {
    rootId: 'udsPatientSheet',
    renderName: 'renderUdsPatientSummary',
    fields: {
      udsPtName: 'Print, UDS Patient',
      udsDOB: '02/04/1991',
      udsCollector: 'Print QA, MA',
      udsLot: 'UDS-PATIENT-005',
      udsExp: '2027-11',
    },
  },
  {
    rootId: 'sampleSheet',
    renderName: 'renderSampleSheet',
    fields: {
      samplePtName: 'Print, Sample',
      sampleDOB: '03/04/1992',
      samplePrescriber: 'Print Prescriber',
      sampleStaff: 'Print QA, MA',
      sampleDate: '2026-07-30',
      sampleQty: '14 tablets',
      sampleLot: 'SAMPLE-PRINT-003',
      sampleExp: '2027-10',
    },
  },
  {
    rootId: 'sampleWorksheetSheet',
    renderName: 'renderSampleWorksheet',
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
      sampleExp: '2027-10',
    },
  },
  {
    rootId: 'letterSheet',
    renderName: 'renderLetterSheet',
    fields: {
      formsPtName: 'Print, Forms',
      formsDOB: '04/05/1993',
      formsProvider: 'Print Provider, MD',
      formsStaff: 'Print QA, MA',
      letterRecipient: 'Print Regression Recipient',
      letterSubject: 'Print Regression Verification',
    },
  },
  {
    rootId: 'dailySheet',
    renderName: 'renderDailySheet',
    init: () => {
      localStorage.setItem(
        'ipmgMedAssistActivityLog_2026-07-30',
        JSON.stringify([
          {
            time: '4:42 PM',
            type: 'injection',
            status: 'completed',
            pt: 'Print, Closeout',
            summary: 'Maintenance injection documented',
            details: 'Routine print-regression fixture',
            trace: 'Lot CLOSEOUT-PRINT-004',
            follow: 'Next appointment scheduled',
            by: 'Print QA, MA',
          },
        ]),
      );
    },
  },
];

const baselineHtml = git('show', `${baselineCommit}:index.html`);
const baselineIndexBlob = git(
  'rev-parse',
  `${baselineCommit}:index.html`,
).trim();
const legacyCss = extractLegacyCss(baselineHtml);
const browser = await chromium.launch({ headless: true });
const outputs = {};

try {
  for (const scenario of scenarios) {
    outputs[scenario.rootId] = await captureOutput(
      browser,
      baselineHtml,
      scenario,
    );
  }
} finally {
  await browser.close();
}

const fixture = {
  schemaVersion: 1,
  baselineCommit,
  baselineIndexBlob,
  baselineIndexSha256: sha256(baselineHtml),
  fixedClock: FIXED_CLOCK,
  captureMethod:
    'Each renderer was executed in Chromium against index.html loaded directly ' +
    'from the named production commit. The resulting print-root innerHTML was ' +
    'whitespace-canonicalized and SHA-256 hashed. PDF bytes are deliberately ' +
    'excluded because Chromium PDF metadata and object ordering are ' +
    'platform-dependent.',
  legacyCss: {
    sha256: sha256(legacyCss),
    bytes: Buffer.byteLength(legacyCss),
  },
  outputs,
};

await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(
  `Captured ${Object.keys(outputs).length} production print renderers from ` +
    `${baselineCommit} in ${outputPath}`,
);
