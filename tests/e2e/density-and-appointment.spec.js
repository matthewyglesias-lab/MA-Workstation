const { test, expect } = require('@playwright/test');
const { fillDate } = require('./date-entry');
const { clickWorkspace } = require('./workspace-navigation');

async function openInjection(page) {
  await page.goto('/');
  await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  const panel = page.locator('.wfp-panel');
  await panel.locator('input[placeholder="Last, First"]').fill('Appointment, Synthetic');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
  await panel.locator('input[placeholder="MM/DD/YYYY"]').press('Tab');
  return panel;
}
async function editReminder(panel) {
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  const reminder = panel.locator('[data-avs-appointment-editor]');
  await reminder.locator('summary').click();
  await reminder.getByLabel('Appointment reminder format').selectOption('details');
  return reminder;
}

for (const viewport of [{width:1440,height:900},{width:1366,height:768},{width:800,height:600}]) {
  test(`true compact fields, less content height, and complete preview at ${viewport.width}`, async ({page}, info) => {
    await page.setViewportSize(viewport);
    const panel = await openInjection(page);
    await expect(page.locator('html')).toHaveAttribute('data-lf-density','compact');
    const name = panel.locator('input[placeholder="Last, First"]');
    const size = await name.boundingBox(); expect(size.height).toBeGreaterThanOrEqual(34); expect(size.height).toBeLessThanOrEqual(35);
    const measure = () => panel.locator('.wfp-transaction-page').evaluate(n=>({content:Array.from(n.querySelectorAll('.wfp-section')).filter(s=>s.getClientRects().length).reduce((sum,s)=>sum+s.getBoundingClientRect().height,0),scroll:n.scrollHeight,visible:n.clientHeight}));
    const compact = await measure();
    const workspace = page.locator('.lf-workspace-shelf');
    await workspace.locator(':scope > summary').click();
    await workspace.getByRole('button',{name:'Compact workspace',exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-lf-density','comfortable');
    expect((await name.boundingBox()).height).toBeGreaterThanOrEqual(42);
    const roomy=await measure();expect(compact.content).toBeLessThan(roomy.content);
    await expect(name).toHaveValue('Appointment, Synthetic');
    await workspace.locator(':scope > summary').click();await workspace.getByRole('button',{name:'Compact workspace',exact:true}).click();await page.keyboard.press('Escape');
    await info.attach("density-measurements", {body:JSON.stringify({viewport,compact,roomy}),contentType:"application/json"});
    await page.screenshot({path:info.outputPath(`compact-${viewport.width}.png`)});
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    const bounds=await page.locator('.cd2004-transaction-window').boundingBox();
    const preview=await page.locator('.cd2004-document-split').boundingBox();
    expect(preview.height).toBeGreaterThanOrEqual(bounds.height-2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('partial appointment persists through the same draft and identity changes clear it', async ({page}) => {
  const panel=await openInjection(page);const editor=await editReminder(panel);
  await fillDate(editor.getByLabel('Provider appointment date'), '2026-11-03');
  await editor.getByLabel('Provider appointment time').fill('10:30');
  await editor.getByLabel('Appointment provider',{exact:true}).fill('Synthetic Appointment Provider');
  await editor.getByLabel('Provider appointment visit type').selectOption('in-person');
  await editor.getByLabel('Provider appointment location').fill('San Bernardino clinic');
  await page.keyboard.press('Control+s');
  const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1')||'[]'));
  await expect.poll(async()=>(await records())[0]?.snapshot.documentation.typedEncounterV1.avsAppointment?.time).toBe('10:30');
  const original=(await records())[0];expect(original.snapshot.documentation.typedEncounterV1.version).toBe(3);
  await page.reload();
  // Resume through the original record owner, not by injecting data into a form.
  await page.keyboard.press('F11');
  const drawer = page.locator('.records-drawer');
  await expect(drawer).toBeVisible();
  // F11 owns focus: never select the identically named background worklist row.
  const row = drawer.getByRole('row').filter({hasText:'Appointment, Synthetic'});
  await expect(row).toHaveCount(1);
  await row.focus(); await expect(row).toBeFocused(); await page.keyboard.press('Enter');
  await expect(drawer).toBeHidden();
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  await panel.locator('[data-avs-appointment-editor] summary').click();
  await expect(panel.getByLabel('Provider appointment time')).toHaveValue('10:30');
  await expect(panel.getByLabel('Appointment provider',{exact:true})).toHaveValue('Synthetic Appointment Provider');
  await expect(panel.getByLabel('Provider appointment location')).toHaveValue('San Bernardino clinic');
  await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
  await panel.locator('input[placeholder="Last, First"]').fill('Different, Synthetic');
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  await expect(panel.locator('[data-avs-appointment-editor] summary')).toContainText('Space to write in');
});

test('compact desktop preference does not shrink guided targets', async ({page}) => {
  const panel=await openInjection(page);
  const workspace=page.locator('.lf-workspace-shelf');await workspace.locator(':scope > summary').click();
  await workspace.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();
  await expect(page.locator('#lf-workstation')).toHaveAttribute('data-kiosk-mode','true');
  expect((await panel.locator('input[placeholder="Last, First"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
});
