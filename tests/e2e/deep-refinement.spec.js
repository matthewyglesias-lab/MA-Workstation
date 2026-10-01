const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const RECORDS = 'ipmgMedAssistInjectionRecordsV1';
const synthetic = {
  id: 'deep-review-synthetic', type: 'injection', status: 'draft',
  createdAt: '2026-10-01T09:00:00-07:00', updatedAt: '2026-10-01T09:05:00-07:00', completedAt: '',
  patient: { name: 'Refinement, Synthetic', dob: '01/02/1990' }, summary: 'Synthetic medication',
  snapshot: { version: 4, medKey: 'other', state: { customMedication: 'Synthetic medication' },
    initiation: {}, smartVitals: {}, disposition: {}, fields: { ptName: 'Refinement, Synthetic', ptDOB: '01/02/1990', adminDate: '2026-10-01' },
    safetyNone: false, note: { cc: '', as: '', pl: '' } }, addenda: [],
};
async function boot(page, size = {width:1440,height:900}, seed = []) {
  await page.setViewportSize(size);
  await page.clock.install({ time: new Date('2026-10-01T10:00:00-07:00') });
  await page.addInitScript(({key,seed}) => {
    localStorage.clear(); sessionStorage.clear();
    if (seed.length) localStorage.setItem(key, JSON.stringify(seed));
  }, {key:RECORDS,seed});
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.applicationReady === 'true');
}
async function shot(page, info, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
}
async function insideViewport(page, locator) {
  const r=await locator.boundingBox(), size=page.viewportSize();
  expect(r).not.toBeNull();
  expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x+r.width).toBeLessThanOrEqual(size.width+1);
  expect(r.y+r.height).toBeLessThanOrEqual(size.height+1);
}
for (const width of [1440,800]) {
  test(`deeper record, review and lookup surfaces remain usable at ${width}`,async({page},info)=>{
    await boot(page,{width,height:width===800?600:900},[synthetic]);
    const launcher=page.getByRole('button',{name:'Open saved notes (F11)'});
    await launcher.click();
    const drawer=page.locator('dialog[open] .records-drawer');
    await insideViewport(page,drawer);
    await expect(drawer).toContainText('saved on this workstation');
    await expect(drawer.locator('[data-records-open]')).toHaveCount(1);
    const before=await page.evaluate(key=>localStorage.getItem(key),RECORDS);
    await shot(page,info,'saved-history');
    await drawer.locator('#recordsDrawerSearch').fill('no such patient');
    await drawer.getByRole('button',{name:'Clear search & filters'}).click();
    await expect(drawer.locator('#recordsDrawerSearch')).toBeFocused();
    await expect(drawer.locator('[data-records-open]')).toHaveCount(1);
    expect(await page.evaluate(key=>localStorage.getItem(key),RECORDS)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(launcher).toBeFocused();
    await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
    await page.locator('[data-field-path="patient.name"] input').fill('Deep review, Synthetic');
    await page.locator('[name="inj-medication"]').selectOption('maintena');
    await page.locator('.wfp-status-flag.is-stop').click();
    const requirements=page.locator('.cd2004-outstanding-requirements-dialog');
    await insideViewport(page,requirements.locator('.cd2004-dialog-frame'));
    await expect(requirements.locator('.wfp-issue-row').first()).toBeVisible();
    await shot(page,info,'items-to-complete');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Open Ordering provider field lookup (F9)',exact:true}).click();
    await insideViewport(page,page.locator('[data-field-lookup-dialog]'));
    await shot(page,info,'provider-lookup');
    await page.keyboard.press('Escape');
    await page.locator('[data-injection-discard]').click();
    await insideViewport(page,page.locator('dialog[open] .cd2004-dialog-frame'));
    await shot(page,info,'discard-confirmation');
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    await expect(page.locator('[data-field-path="patient.name"] input')).toHaveValue('Deep review, Synthetic');
    await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  });
}
test('preview control is idempotent and keeps the same unfinished draft',async({page})=>{
  await boot(page); await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  const name=page.locator('[data-field-path="patient.name"] input');
  await name.fill('Preview repeat, Synthetic');
  const preview=page.getByRole('button',{name:'Preview',exact:true});
  await preview.click(); await preview.click();
  await expect(preview).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Details',exact:true}).click();
  await expect(name).toHaveValue('Preview repeat, Synthetic');
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
});
test('chooser padding and content-to-backdrop drag do not accidentally dismiss',async({page})=>{
  await boot(page);
  await page.locator('.lf-document-action').click();
  const dialog=page.locator('.lf-service-dialog');
  const box=await dialog.boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height-2);
  await expect(dialog).toBeVisible();
  await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();
  await page.mouse.move(3,3);await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(3,3);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.lf-document-action')).toBeFocused();
});
test('staff settings keep unsaved text on an outside click and use local wording',async({page},info)=>{
  await boot(page);
  await page.locator('.tebra-account-trigger').click();
  await expect(page.locator('[data-account-action=staff]')).toHaveText('Documenting staff');
  await page.locator('[data-account-action=staff]').click();
  const dialog=page.locator('dialog[aria-labelledby=cd2004-context-title]');
  await expect(dialog.getByRole('heading')).toHaveText('Documenting staff');
  const input=dialog.locator('input');await input.fill('Synthetic staff');
  await page.mouse.click(2,2);await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('Synthetic staff');
  await shot(page,info,'documenting-staff');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(dialog).toHaveCount(0);
});
test('header and account menus handle arrows, typeahead, Escape and focus departure',async({page},info)=>{
  await boot(page);
  const trigger=page.locator('.lf-tools-navigation > summary');
  await trigger.focus();await page.keyboard.press('ArrowDown');
  await expect(page.locator('.lf-tools-navigation button').first()).toBeFocused();
  await page.keyboard.press('End');await expect(page.locator('.lf-tools-navigation button').last()).toBeFocused();
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  await expect(page.locator('.lf-tools-navigation')).not.toHaveAttribute('open','');
  await page.locator('.tebra-account-trigger').click();
  await page.keyboard.press('v');await expect(page.locator('[data-account-action=location]')).toBeFocused();
  await shot(page,info,'local-settings-menu');
  await page.locator('.lf-header-search input').focus();
  await expect(page.getByRole('menu')).toHaveCount(0);
});
for(const width of [1440,800]) {
  test(`reference keyboard categories, empty recovery and closeout at ${width}`,async({page},info)=>{
    await boot(page,{width,height:width===800?600:900});
    await clickWorkspace(page,'.cd2004-nav-item[title="Reference"]');
    const tabs=page.getByRole('tablist',{name:'Reference categories'});
    await tabs.getByRole('tab').first().focus();await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab').nth(1)).toHaveAttribute('aria-selected','true');
    await expect(tabs.getByRole('tab').nth(1)).toBeFocused();
    const search=page.getByRole('searchbox',{name:'Search clinical reference'});
    await search.fill('nothing-should-match-893493');
    await page.getByRole('button',{name:'Clear search & category'}).click();
    await expect(search).toBeFocused();await expect(search).toHaveValue('');
    await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await shot(page,info,'reference-catalog');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await clickWorkspace(page,'.cd2004-nav-item[title="Daily Closeout"]');
    await shot(page,info,'daily-closeout');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  });
}
test('reduced-motion preference disables new decorative transitions',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await boot(page);
  await page.locator('.lf-document-action').click();
  expect(await page.locator('.lf-service-option').first().evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
  await page.keyboard.press('Escape');
  await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  await page.locator('[name="inj-medication"]').selectOption('maintena');
  await page.locator('.wfp-status-flag.is-stop').click();
  await expect(page.locator('dialog[open] .cd2004-dialog-frame')).toHaveCSS('animation-name','none');
});


test('record confirmation ignores interior padding and selection drags, with safe focus wrap', async ({page}, info) => {
  await boot(page); await clickWorkspace(page, '.cd2004-nav-item[title="Injection"]');
  await page.locator('[data-field-path="patient.name"] input').fill('Confirmation, Synthetic');
  await page.locator('[data-injection-save]').click();
  await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
  const before = await page.evaluate(key => localStorage.getItem(key), RECORDS);
  await page.locator('[data-injection-discard]').click();
  const dialog = page.getByRole('dialog', {name:'Discard draft'});
  const frame = dialog.locator('.cd2004-dialog-frame');
  await expect(dialog.getByRole('button', {name:'Keep editing',exact:true})).toBeFocused();
  const box = await frame.boundingBox();
  await page.mouse.click(box.x+box.width/2, box.y+box.height-2);
  await expect(dialog).toBeVisible();
  await page.mouse.move(box.x+35,box.y+35); await page.mouse.down();
  await page.mouse.move(2,2); await page.mouse.up();
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole('button', {name:'Close confirmation',exact:true});
  await close.focus(); await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', {name:'Discard draft',exact:true})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await shot(page,info,'confirmation-keyboard-review');
  await dialog.getByRole('button', {name:'Keep editing',exact:true}).click();
  expect(await page.evaluate(key => localStorage.getItem(key),RECORDS)).toBe(before);
});

test('lookup search recovers without changing the field and ignores composition Enter', async ({page}, info) => {
  await boot(page); await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  const launch = page.getByRole('button',{name:'Open Ordering provider field lookup (F9)',exact:true});
  const value = () => page.locator('[data-field-path="orderingProvider"] select').inputValue();
  const before = await value();
  await launch.click();
  const dialog = page.locator('.cd2004-lookup-dialog');
  const search = dialog.getByRole('searchbox',{name:'Search options'});
  await search.fill('zz-no-provider-matches-8932');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog).toContainText('Your current field value has not changed.');
  await dialog.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await search.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});
  await expect(dialog).toBeVisible();
  await search.press('ArrowUp');
  await expect(dialog.getByRole('option').last()).toBeFocused();
  await page.keyboard.press('Home'); await expect(dialog.getByRole('option').first()).toBeFocused();
  await expect(dialog.locator('[role=option][tabindex="0"]')).toHaveCount(1);
  await shot(page,info,'lookup-recovery');
  await page.keyboard.press('Escape');
  // F9 lookup belongs to the native field; cancel returns there, not its launcher.
  await expect(page.locator('[data-field-path="orderingProvider"] select')).toBeFocused();
  expect(await value()).toBe(before);
});

test('staff dialog wraps focus and does not close after a drag from its content',async({page})=>{
  await boot(page);
  await page.locator('.tebra-account-trigger').click();
  await page.locator('[data-account-action=staff]').click();
  const dialog=page.getByRole('dialog',{name:'Documenting staff',exact:true});
  const frame=await dialog.locator('.cd2004-dialog-frame').boundingBox();
  await page.mouse.move(frame.x+35,frame.y+35);await page.mouse.down();
  await page.mouse.move(2,2);await page.mouse.up();
  await expect(dialog).toBeVisible();
  const first=dialog.getByRole('button',{name:'Close',exact:true});
  await first.focus();await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Use for encounter',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tebra-account-trigger')).toBeFocused();
});

for (const width of [1440,800]) {
  test(`closeout filters have keyboard navigation and non-destructive recovery at ${width}`,async({page},info)=>{
    await boot(page,{width,height:width===800?600:900});
    const key='ipmgMedAssistActivityLog_2026-10-01';
    const entries=[{type:'injection',status:'completed',time:'10:00 AM',pt:'Closeout, Synthetic',summary:'Test entry only'}];
    await page.evaluate(({key,entries})=>localStorage.setItem(key,JSON.stringify(entries)),{key,entries});
    await clickWorkspace(page,'.cd2004-nav-item[title="Daily Closeout"]');
    const before=await page.evaluate(key=>localStorage.getItem(key),key);
    const tabs=page.getByRole('tablist',{name:'Activity filters'});
    await tabs.getByRole('tab',{name:'All',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab',{name:'Injections',exact:true})).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab',{name:'UDS',exact:true})).toHaveAttribute('aria-selected','true');
    await page.getByRole('button',{name:'Show all activity',exact:true}).click();
    await expect(tabs.getByRole('tab',{name:'All',exact:true})).toBeFocused();
    await expect(page.getByRole('tabpanel')).toContainText('Closeout, Synthetic');
    await page.keyboard.press('End');await expect(tabs.getByRole('tab',{name:'Completed',exact:true})).toBeFocused();
    await page.keyboard.press('Home');await expect(tabs.getByRole('tab',{name:'All',exact:true})).toBeFocused();
    expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(before);
    await shot(page,info,'populated-closeout');
  });
}
