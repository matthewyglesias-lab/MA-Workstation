const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const { fillDate } = require('./date-entry');
const { prepareRefinementInjection } = require('./refinement-fixture');
const KEY = 'ipmgMedAssistInjectionRecordsV1';
const localPatient = { name: 'Same, Synthetic', dob: '01/03/1990' };
const oldRecord = {
  id: 'ownership-selected-patient', type: 'injection', status: 'draft',
  createdAt: '2026-09-01T08:00:00-07:00', updatedAt: '2026-09-01T08:05:00-07:00', completedAt: '',
  patient: localPatient, summary: 'Synthetic ownership fixture', addenda: [],
  snapshot: { version: 4, medKey: '', state: {}, initiation: {}, smartVitals: {}, disposition: {},
    fields: { ptName: localPatient.name, ptDOB: localPatient.dob }, safetyNone: false,
    note: { cc: '', as: '', pl: '' }, documentation: {} },
};
async function boot(page, seed = []) {
  await page.addInitScript(({ key, seed }) => {
    if (!sessionStorage.getItem('ownership-booted')) {
      localStorage.clear(); sessionStorage.clear();
      if (seed.length) localStorage.setItem(key, JSON.stringify(seed));
      sessionStorage.setItem('ownership-booted', 'true');
    }
    const native = Storage.prototype.setItem;
    window.__ownershipWrites = 0;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__ownershipWrites++;
      return native.call(this, k, v);
    };
  }, { key: KEY, seed });
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
  await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  return page.locator('.wfp-panel');
}
async function dirty(page) {
  return page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e); return e.defaultPrevented;
  });
}
async function state(page) {
  return page.evaluate(key => ({
    bytes: localStorage.getItem(key), writes: window.__ownershipWrites,
    exception: document.querySelector('#injExceptionToggle')?.checked,
    note: window._note,
  }), KEY);
}
async function reminder(panel) {
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  const editor = panel.locator('[data-avs-appointment-editor]');
  if (await editor.getAttribute('open') === null) await editor.locator('summary').click();
  return editor;
}
async function save(page) {
  await page.keyboard.press('Control+s');
  await expect.poll(() => dirty(page)).toBe(false);
}
async function records(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), KEY); }

test('opening and closing exception details is a pure view action through 20 cycles', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-10-02T16:00:00Z') });
  const panel = await boot(page);
  await panel.locator('input[placeholder="Last, First"]').fill('Exception, Synthetic');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').press('Tab');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  await save(page);
  await page.clock.runFor(1000);
  const before = await state(page);
  const disclosure = panel.getByRole('button', { name: /Administration exception/i });
  await page.screenshot({ path: info.outputPath('exception-before.png') });
  for (let i = 0; i < 20; i++) {
    await disclosure.click(); await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await page.clock.runFor(1000);
    expect(await dirty(page)).toBe(false);
    expect(await state(page)).toEqual(before);
    await disclosure.click(); await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await page.clock.runFor(1000);
    expect(await dirty(page)).toBe(false);
    expect(await state(page)).toEqual(before);
  }
  await disclosure.click();
  await expect(panel.getByRole('checkbox', { name: 'Record an administration exception', exact: true })).not.toBeChecked();
  await page.screenshot({ path: info.outputPath('exception-after.png') });
});

test('selected local patient with same name and different DOB cannot inherit an appointment', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
  const panel = await boot(page, [oldRecord]);
  await page.keyboard.press('F11');
  const drawer = page.locator('.records-drawer');
  const row = drawer.getByRole('row').filter({ hasText: localPatient.name });
  await row.focus(); await row.press('Enter'); await expect(drawer).toBeHidden();
  await prepareRefinementInjection(page, { review: false });
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  await panel.locator('input[placeholder="Last, First"]').fill(localPatient.name);
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').press('Tab');
  const editor = await reminder(panel);
  await editor.getByLabel('Appointment reminder format').selectOption('details');
  await fillDate(editor.getByLabel('Provider appointment date'), '2026-11-03');
  await editor.getByLabel('Appointment provider', { exact: true }).fill('Patient A appointment provider');
  await editor.getByLabel('Provider appointment time').fill('10:30');
  await expect(editor.getByLabel('Appointment provider', { exact: true })).toHaveValue('Patient A appointment provider');
  await page.evaluate(() => { window.__ipmgNativePrint = () => {}; window.cleanPrintClasses = () => {}; });
  await panel.getByRole('button', { name: 'Print AVS', exact: true }).click();
  await expect(page.locator('#avsSheet')).toContainText('Patient A appointment provider');
  await page.evaluate(() => document.body.classList.remove('print-avs'));
  await panel.getByRole('button', { name: 'Use selected local patient', exact: true }).click();
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue(localPatient.name);
  await expect(panel.locator('input[placeholder="MM/DD/YYYY"]')).toHaveValue(localPatient.dob);
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(editor.locator('summary')).toContainText('Space to write in');
  await save(page);
  const saved = (await records(page))[0];
  expect(saved.patient).toEqual(localPatient);
  expect(saved.snapshot.documentation.typedEncounterV1.avsAppointment).toEqual({
    version: 1, mode: 'write-in', date: '', time: '', provider: '', location: '', visitType: '',
  });
  expect(JSON.stringify(saved.snapshot)).not.toContain('Patient A appointment provider');
  await panel.getByRole('button', { name: 'Print AVS', exact: true }).click();
  await expect(page.locator('#avsSheet .avs2-id')).toContainText(localPatient.name);
  await expect(page.locator('#avsSheet .avs2-id')).toContainText(localPatient.dob);
  await expect(page.locator('#avsSheet')).not.toContainText('Patient A appointment provider');
  await page.pdf({ path: info.outputPath('restored-patient-appointment.pdf'), format: 'Letter', printBackground: true });
  await page.evaluate(() => document.body.classList.remove('print-avs'));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.cd2004-inspector .cd2004-note-ident')).toContainText(localPatient.dob);
});

test('exception disclosure preserves a genuinely current administration review and exact saved note through 20 cycles', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-02T16:00:00Z') });
  const panel = await boot(page);
  await prepareRefinementInjection(page);
  await save(page); await page.clock.runFor(1000);
  const record = (await records(page))[0];
  expect(record.snapshot.disposition.reviewFingerprint).not.toBe('');
  expect(record.snapshot.disposition.kind).toBe('administered');
  await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
  const before = await state(page);
  const disclosure = panel.getByRole('button', { name: /Administration exception/i });
  for (let i = 0; i < 20; i++) {
    await disclosure.click(); await disclosure.click(); await page.clock.runFor(1000);
    expect(await state(page)).toEqual(before); expect(await dirty(page)).toBe(false);
  }
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(panel.getByText('Review confirmed.', { exact: true })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
  test(`explicit exception evidence survives collapse; removal cancellation preserves it at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-10-02T16:00:00Z') });
    const panel = await boot(page);
    await panel.locator('input[placeholder="Last, First"]').fill('Exception, Synthetic');
    await panel.locator('select[name="inj-medication"]').selectOption('haldol');
    await panel.getByRole('tab', { name: 'Administration', exact: true }).click();
    const disclosure = panel.getByRole('button', { name: /Administration exception/i });
    await disclosure.click();
    const choice = panel.getByRole('checkbox', { name: 'Record an administration exception', exact: true });
    await choice.check();
    await expect(disclosure).toContainText('Needs details');
    await expect(disclosure).not.toContainText('Documented');
    await panel.locator('[data-field-path="details.exceptionSummary"] textarea').fill('Transient dizziness reported.');
    await panel.locator('[data-field-path="details.exceptionRecipient"] input').fill('Synthetic Provider');
    await fillDate(panel.locator('[data-field-path="details.exceptionTime"] input'), '2026-10-02T09:30');
    await panel.locator('[data-field-path="details.exceptionOutcome"] textarea').fill('Seated observation and provider follow-up.');
    await expect(disclosure).toContainText('Documented');
    await save(page); await page.clock.runFor(1000);
    const before = await state(page);
    for (let i = 0; i < 20; i++) {
      await disclosure.click(); await page.clock.runFor(1000);
      expect(await state(page)).toEqual(before); expect(await dirty(page)).toBe(false);
      await disclosure.click(); await page.clock.runFor(1000);
      await expect(choice).toBeChecked(); expect(await state(page)).toEqual(before);
    }
    page.once('dialog', dialog => dialog.dismiss());
    await panel.getByRole('button', { name: 'Remove exception', exact: true }).click();
    await expect(choice).toBeChecked();
    expect(await state(page)).toEqual(before); expect(await dirty(page)).toBe(false);
    page.once('dialog', dialog => dialog.accept());
    await panel.getByRole('button', { name: 'Remove exception', exact: true }).click();
    await expect(choice).not.toBeChecked();
    await expect(disclosure).toContainText('Not recorded');
    await save(page);
    const saved = (await records(page))[0];
    expect(saved.snapshot.fields.injExceptionToggle).toBe(false);
    for (const key of ['injExceptionSummary', 'injExceptionRecipient', 'injExceptionTime', 'injExceptionOutcome'])
      expect(saved.snapshot.fields[key]).toBe('');
  });
}
