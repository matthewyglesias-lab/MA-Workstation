const {test,expect}=require('@playwright/test');
const {clickWorkspace}=require('./workspace-navigation');
const openService=(page,name)=>clickWorkspace(page,`.cd2004-nav-item[title="${name}"]`);
const savedState=page=>page.evaluate(()=>({
  injections:JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1')||'[]').map(({updatedAt,...r})=>r),
  uds:JSON.parse(localStorage.getItem('ipmgMedAssistUdsRecordsV1')||'[]').map(({updatedAt,...r})=>r),
}));
async function inViewport(locator,size) {
 const b=await locator.boundingBox();expect(b).not.toBeNull();
 expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
 expect(b.x+b.width).toBeLessThanOrEqual(size.width+1);expect(b.y+b.height).toBeLessThanOrEqual(size.height+1);
}
for(const size of [{width:1440,height:900},{width:800,height:600}]) {
 test(`utility dialogs are cohesive, contained and keyboard navigable at ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/');await page.locator('.lf-document-action').waitFor();
  await page.keyboard.press('F1');const help=page.getByRole('dialog',{name:'Keyboard Reference',exact:true});
  await expect(help.getByRole('heading',{level:2})).toHaveText('Keyboard Reference');
  await inViewport(help.locator('.cd2004-help-dialog'),size);
  expect(await help.locator('.lf-dialog-title').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 255, 255)');
  const close=help.getByRole('button',{name:'Close keyboard reference'}),ok=help.getByRole('button',{name:'OK',exact:true});
  await close.focus();await page.keyboard.press('Shift+Tab');await expect(ok).toBeFocused();
  await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Escape');await expect(help).toHaveCount(0);
  await page.getByRole('button',{name:'Search workspace commands',exact:true}).click();
  const commands=page.locator('.lf-command-dialog');await inViewport(commands,size);
  await expect(commands.getByRole('heading',{level:2})).toHaveText('Find a tool');
  await expect(commands.getByRole('option').first()).toContainText('Worklist');
  await expect(commands.getByRole('option').first()).not.toContainText('Dashboard');
  const input=commands.getByRole('combobox',{name:'Search commands'});
  await input.fill('no-such-service');await expect(commands.getByRole('status')).toContainText('No matching tools');
  await input.fill('reference');await page.keyboard.press('Enter');await expect(commands).toHaveCount(0);
  await expect(page.locator('.lf-tool-page-header h1')).toHaveText('Reference');
 });
 for(const label of ['Reference','Daily Closeout','Future / TMS']) {
  test(`${label} retains readable actions and content at ${size.width}x${size.height}`,async({page})=>{
   await page.setViewportSize(size);await page.goto('/');await openService(page,label);
   const header=page.locator('.lf-tool-page-header');await expect(header.getByRole('heading',{level:1})).toBeVisible();
   await inViewport(header,size);
   for(const button of await header.getByRole('button').all()) await inViewport(button,size);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   if(label==='Reference'){
    const search=page.getByRole('textbox',{name:'Search clinical reference'});await search.fill('Vivitrol');
    await expect(page.locator('.wfp-lookup')).toContainText('Vivitrol');
   }
   if(label==='Future / TMS') await expect(page.locator('.wfp-wall')).toContainText('not available');
  });
 }
}
test('rapid Escape and F11 reopen keeps the injection records dialog and focus in sync',async({page})=>{
 await page.goto('/');await openService(page,'Injection');
 await page.locator('[data-field-path="patient.name"] input').fill('Final QA, Synthetic');
 await page.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
 await page.locator('[data-injection-save]').click();await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
 const before=await savedState(page);
 await page.keyboard.press('F11');const dialog=page.locator('.records-drawer-layer');await expect(dialog).toBeVisible();
 for(let i=0;i<12;i++){
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await page.keyboard.press('F11');await expect(dialog).toBeVisible();
  await expect(dialog.locator('#recordsDrawerSearch')).toBeFocused();
 }
 await expect(dialog.locator('.lf-note-patient-dob')).toHaveText('DOB 01/02/1990');
 // A close event can be delivered after a newer showModal. It must be inert.
 await dialog.evaluate(d=>d.dispatchEvent(new Event('close')));await expect(dialog).toBeVisible();
 await expect(dialog.locator('#recordsDrawerSearch')).toBeFocused();
 expect(await savedState(page)).toEqual(before);
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
test('UDS saved records also survives repeated close/open and stale close events',async({page})=>{
 await page.goto('/');await openService(page,'UDS');
 const trigger=page.getByRole('button',{name:'Open UDS notes…',exact:true});
 for(let i=0;i<8;i++){
  await trigger.click();const dialog=page.locator('dialog.records-drawer-layer[open]');
  await expect(dialog.locator('#udsRecordsDrawerSearch')).toBeFocused();
  await dialog.evaluate(d=>d.dispatchEvent(new Event('close')));await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 }
});
