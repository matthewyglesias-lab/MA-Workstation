const {test,expect}=require('@playwright/test');
const {clickWorkspace}=require('./workspace-navigation');
const open=page=>clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
const stable=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1')||'[]').map(({updatedAt,...record})=>record));

for(const size of [{width:1440,height:900},{width:800,height:600}]) {
 test(`required fields use one convention and keep accessible state at ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/');await open(page);
  await page.locator('[name="inj-medication"]').selectOption('maintena');
  await expect(page.locator('.lf-form-legend')).toHaveCount(1);
  await expect(page.locator('.lf-form-legend')).toContainText('Required when applicable');
  const name=page.locator('[data-field-path="patient.name"] input');
  await expect(name).toHaveAttribute('aria-required','true');
  await expect(name).toHaveAccessibleName('Patient name');
  await expect(page.locator('.wfp-register-state.is-req')).toHaveCount(0);
  await expect(page.locator('.wfp-ledger-seq')).toHaveCount(0);
  const visibleRequired=await page.locator('.wfp-panel').evaluate(n=>[...n.querySelectorAll('.wfp-field-hint,.wfp-register-state')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&/^required$/i.test(e.innerText.trim())).length);
  expect(visibleRequired).toBe(0);
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 });
}

test('field provenance is keyboard accessible without changing the record',async({page})=>{
 await page.goto('/');await open(page);
 await page.locator('[data-field-path="patient.name"] input').fill('Provenance QA, Synthetic');
 await page.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
 await page.locator('[data-injection-save]').click();await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
 const before=await stable(page);
 const field=page.locator('[data-field-path="patient.name"]');
 const disclosure=field.locator('.lf-field-provenance');
 const trigger=disclosure.locator('summary');
 await expect(trigger).toHaveAccessibleName('Patient name: field information');
 await expect(disclosure).not.toHaveAttribute('open','');
 await trigger.focus();await page.keyboard.press('Enter');
 await expect(disclosure).toHaveAttribute('open','');
 await expect(disclosure.locator('.wfp-register-source')).toBeVisible();
 await page.keyboard.press('Escape');await expect(disclosure).not.toHaveAttribute('open','');
 await expect(trigger).toBeFocused();expect(await stable(page)).toEqual(before);
 await expect(page.locator('[data-injection-finish]')).toBeDisabled();
});

for(const size of [{width:1440,height:900},{width:800,height:600}]) {
 test(`requirements remain complete, grouped and actionable at ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/');await open(page);
  await page.locator('[name="inj-medication"]').selectOption('maintena');
  const status=page.locator('.wfp-status-flag.is-stop');
  const count=Number((await status.innerText()).match(/\d+/)[0]);
  await status.click();const dialog=page.locator('.cd2004-outstanding-requirements-dialog');
  await expect(dialog.locator('.wfp-issue-row')).toHaveCount(count);
  expect(await dialog.locator('.lf-requirements-group').count()).toBeGreaterThan(1);
  await expect(dialog.getByRole('heading',{level:2})).toHaveText('Items to complete');
  await expect(dialog.locator('.lf-dialog-title p')).toContainText('Required checks remain in place');
  const geometry=await dialog.locator('.cd2004-dialog-frame').boundingBox();
  expect(geometry.x).toBeGreaterThanOrEqual(0);expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.x+geometry.width).toBeLessThanOrEqual(size.width+1);
  expect(geometry.y+geometry.height).toBeLessThanOrEqual(size.height+1);
  const row=dialog.locator('.wfp-issue-row').filter({hasText:'Select the injection encounter type'});
  await row.click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Order & Timing',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-field-path="reason"] select')).toBeFocused();
  await expect(page.locator('[data-field-path="reason"] select')).toHaveValue('');
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
 });
}

test('clinical guidance follows the medication fields, not the patient identity form',async({page})=>{
 await page.goto('/');await open(page);await page.locator('[name="inj-medication"]').selectOption('maintena');
 const identity=await page.locator('[data-field-path="patient.name"]').boundingBox();
 const medication=await page.locator('[name="inj-medication"]').boundingBox();
 const guidance=await page.locator('[data-operator-guidance]').boundingBox();
 expect(identity.y).toBeLessThan(medication.y);expect(medication.y+medication.height).toBeLessThan(guidance.y);
 await expect(page.locator('[data-operator-guidance]')).toHaveCount(1);
 await expect(page.locator('[data-operator-guidance]')).toContainText('Reference defaults do not replace the active order');
 await page.getByRole('tab',{name:'Administration',exact:true}).click();
 await expect(page.locator('[data-operator-guidance]')).toHaveCount(1);
});

test('chooser, context, lookup and lifecycle dialog share one semantic heading design',async({page})=>{
 await page.goto('/');await page.locator('.lf-document-action').click();
 await expect(page.locator('dialog[open] .lf-dialog-title h2')).toHaveText('Document a service');
 await page.keyboard.press('Escape');await open(page);
 await page.locator('[data-field-path="patient.name"] input').fill('Dialog QA, Synthetic');
 await page.getByRole('button',{name:'Open Ordering provider field lookup (F9)',exact:true}).click();
 await expect(page.locator('dialog[open] .lf-dialog-title h2')).toHaveText('Ordering provider');
 await expect(page.getByRole('searchbox',{name:'Search options',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.locator('[data-injection-discard]').click();
 await expect(page.locator('dialog[open] .lf-dialog-title h2')).toHaveText('Discard draft');
 await expect(page.getByRole('button',{name:'Keep editing',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('[data-field-path="patient.name"] input')).toHaveValue('Dialog QA, Synthetic');
});
