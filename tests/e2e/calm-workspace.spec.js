const { test, expect } = require('@playwright/test');
const { clickWorkspace, openRecordActions, openWorkspaceOptions } = require('./workspace-navigation');
const RECORDS = 'ipmgMedAssistInjectionRecordsV1';
async function boot(page, size={width:1440,height:900}) {
  await page.setViewportSize(size);
  await page.clock.install({time:new Date('2026-10-01T10:00:00-07:00')});
  await page.goto('/');
  await expect(page.locator('#lf-workstation')).toBeVisible();
}
async function bounds(page, target) {
  const b = await target.boundingBox(), v=page.viewportSize();
  expect(b).not.toBeNull();
  expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x+b.width).toBeLessThanOrEqual(v.width+1);
  expect(b.y+b.height).toBeLessThanOrEqual(v.height+1);
  expect(await target.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  })).toBe(true);
}
async function shot(page,info,name) {
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
}
for (const size of [{width:1440,height:900},{width:1024,height:768},{width:800,height:600}]) {
  test(`quiet everyday controls and genuinely accessible extra tools at ${size.width}`,async({page},info)=>{
    await boot(page,size);
    await expect(page.locator('.lf-command-trigger')).toBeHidden();
    await expect(page.locator('.lf-density-toggle')).toBeHidden();
    await expect(page.locator('.lf-workspace-shelf > summary')).toBeVisible();
    await expect(page.locator('[data-workspace-badge=local]')).toBeVisible();
    await expect(page.locator('.lf-service-shortcut')).toHaveCount(4);
    await shot(page,info,'01-everyday-worklist');
    await openWorkspaceOptions(page);
    await bounds(page,page.locator('.lf-workspace-shelf .lf-shelf-panel'));
    await expect(page.getByRole('button',{name:'Search workspace commands'})).toBeVisible();
    await expect(page.locator('.lf-command-trigger strong')).toBeVisible();
    await expect(page.locator('.lf-density-toggle strong')).toBeVisible();
    await expect(page.locator('.lf-density-toggle small')).toBeVisible();
    await shot(page,info,'02-workspace-options');
    await page.keyboard.press('Escape');
    await expect(page.locator('.lf-workspace-shelf > summary')).toBeFocused();
    await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
    const name=page.locator('[data-field-path="patient.name"] input');
    await name.fill('Calm workspace, Synthetic');
    await page.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
    await page.locator('[name="inj-medication"]').selectOption('maintena');
    await page.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
    await page.clock.runFor(4500);
    const saved=await page.evaluate(key=>localStorage.getItem(key),RECORDS);
    await expect(page.locator('[data-injection-save]')).toBeVisible();
    await expect(page.locator('[data-injection-finish]')).toBeVisible();
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    await expect(page.locator('[data-injection-new]')).toBeHidden();
    await expect(page.locator('[data-injection-discard]')).toBeHidden();
    await expect(page.locator('.wfp-status-flag.is-stop')).toBeVisible();
    await expect(page.locator('.cd2004-patient-banner')).toContainText('Calm workspace, Synthetic');
    const tips=page.locator('.lf-review-disclosure');
    await expect(tips.locator('.lf-review-detail')).toBeHidden();
    await expect(tips.locator('summary')).toContainText('Confirm the patient');
    await shot(page,info,'03-injection-at-rest');
    await tips.locator('summary').click();
    await expect(tips.locator('.lf-review-detail')).toContainText('current order');
    await tips.locator('summary').click();
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
    expect(await page.evaluate(key=>localStorage.getItem(key),RECORDS)).toBe(saved);
    await openRecordActions(page);
    await bounds(page,page.locator('.lf-record-shelf .lf-shelf-panel'));
    await expect(page.locator('[data-injection-new]')).toBeVisible();
    await expect(page.locator('[data-injection-discard]')).toBeVisible();
    await shot(page,info,'04-extra-record-actions');
    await page.locator('[data-injection-discard]').click();
    const confirm=page.getByRole('dialog',{name:'Discard draft',exact:true});
    await expect(confirm).toBeVisible();
    await expect(page.locator('.lf-record-shelf')).not.toHaveAttribute('open','');
    await expect(confirm.getByRole('button',{name:'Keep editing',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lf-record-shelf > summary')).toBeFocused();
    await expect(name).toHaveValue('Calm workspace, Synthetic');
    expect(await page.evaluate(key=>localStorage.getItem(key),RECORDS)).toBe(saved);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('workspace choices preserve the draft; density alone persists and the command dialog returns focus',async({page})=>{
  await boot(page); await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  await page.locator('[data-field-path="patient.name"] input').fill('Options preserve, Synthetic');
  await page.locator('[data-injection-save]').click();
  await page.clock.runFor(4500);
  const before=await page.evaluate(key=>localStorage.getItem(key),RECORDS);
  const trigger=page.locator('.lf-workspace-shelf > summary');
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.lf-command-trigger')).toBeFocused();
  await page.locator('.lf-density-toggle').click();
  await expect(page.locator('.lf-workspace-shelf')).toHaveAttribute('open','');
  await expect(page.locator('html')).toHaveAttribute('data-lf-density','compact');
  await page.locator('.lf-command-trigger').click();
  await expect(page.locator('.lf-workspace-shelf')).not.toHaveAttribute('open','');
  await expect(page.getByRole('combobox',{name:'Search commands'})).toBeFocused();
  await page.getByRole('combobox',{name:'Search commands'}).fill('temporary tool query');
  const recovery=page.getByRole('button',{name:'Show all tools',exact:true});
  expect(await recovery.evaluate(el=>el.closest('[role=listbox]') === null)).toBe(true);
  await recovery.click();
  await expect(page.getByRole('combobox',{name:'Search commands'})).toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Search commands'})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  expect(await page.evaluate(key=>localStorage.getItem(key),RECORDS)).toBe(before);
  expect(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('temporary tool query')))).toBe(false);
  await trigger.focus(); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.lf-focus-trigger')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.lf-workspace-shelf')).not.toHaveAttribute('open','');
});

for (const title of ['Samples','Forms']) {
  test(`${title} keeps context reuse behind a labelled choice without enabling completion`,async({page},info)=>{
    await boot(page,{width:800,height:600}); await clickWorkspace(page,`.cd2004-nav-item[title="${title}"]`);
    const footer=page.locator('.lf-service-footer');
    await expect(footer.locator('.wfp-status-flag')).toBeVisible();
    await expect(footer.locator('.cd2004-command-button')).toBeVisible();
    const shelf=footer.locator('.lf-context-shelf');
    await expect(shelf.getByRole('button',{name:'Use current patient',includeHidden:true})).toBeHidden();
    await shelf.locator('summary').click();
    await bounds(page,shelf.locator('.lf-shelf-panel'));
    await expect(shelf.getByRole('button',{name:'Use current patient'})).toBeDisabled();
    await expect(shelf.getByRole('button',{name:'Use documenting staff'})).toBeDisabled();
    await shot(page,info,title.toLowerCase()+'-extra-details');
    await page.keyboard.press('Escape'); await expect(shelf.locator('summary')).toBeFocused();
  });
}

test('collapsed options do not swallow keyboard shortcuts or clinical blockers',async({page})=>{
  await boot(page); await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  const field=page.locator('[data-field-path="patient.name"] input'); await field.fill('Keyboard, Synthetic');
  await page.keyboard.press('F12'); await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
  await page.keyboard.press('Control+k'); await expect(page.getByRole('combobox',{name:'Search commands'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  await page.locator('.wfp-status-flag.is-stop').click();
  await expect(page.locator('.cd2004-outstanding-requirements-dialog')).toBeVisible();
  await expect(page.locator('.wfp-issue-row').first()).toBeVisible();
});
