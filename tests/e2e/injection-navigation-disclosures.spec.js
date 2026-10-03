const {test,expect}=require('@playwright/test');
const {prepareRefinementInjection}=require('./refinement-fixture');
const {openWorkspaceOptions,clickWorkspace}=require('./workspace-navigation');
const {fillDate}=require('./date-entry');
const key='ipmgMedAssistInjectionRecordsV1';
const step=(page,id)=>page.locator(`.kiosk-stepper [data-kiosk-step="${id}"]`);
async function focused(page){await openWorkspaceOptions(page);await page.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();}
async function savedState(page){return page.evaluate(key=>({bytes:localStorage.getItem(key),note:window._note}),key);}
async function save(page){await page.keyboard.press('Control+s');await expect.poll(()=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);await page.clock.runFor(1000);}
for(const viewport of [{width:1440,height:900},{width:800,height:600}]) {
  test(`same-tab navigation and disabled Sign use visible destinations at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.goto('/');const panel=await prepareRefinementInjection(page);await focused(page);
    for(const [id,selector] of [['identify','input[placeholder="Last, First"]'],['verify-order','[data-provider-field] select'],['site','input[placeholder="Actual site / location per active order"]'],['administer','input[placeholder="J. Doe, LVN"]']]) {
      await step(page,id).click();await expect(step(page,id)).toHaveAttribute('aria-current','step');await expect(panel.locator(selector)).toBeFocused();
    }
    await step(page,'sign').click();await expect(panel.getByRole('tabpanel',{name:'Review',exact:true})).toBeFocused();
    await expect(panel.locator('.wfp-navigation-notice')).toBeVisible();
    await expect(page.getByRole('dialog',{name:'Sign',exact:true})).toBeHidden();
    await step(page,'site').click();
    const site=panel.locator('input[placeholder="Actual site / location per active order"]');
    await site.fill('L deltoid');await expect(site).toBeFocused();await expect(step(page,'site')).toHaveAttribute('aria-current','step');
    await expect(panel.locator('.wfp-invalidation-receipt')).toContainText('Site changed — review administration again.');
    await expect(step(page,'identify')).toContainText('Documented');await expect(step(page,'administer')).toContainText('Review again');
  });
  test(`issue actions reveal hidden exception fields from rail, preview and review dialog at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.goto('/');const panel=await prepareRefinementInjection(page);await focused(page);
    await step(page,'site').click();const disclosure=panel.getByRole('button',{name:/Administration exception/});
    await disclosure.click();await panel.getByRole('checkbox',{name:'Record an administration exception',exact:true}).check();
    await disclosure.click();await step(page,'response').click();
    await page.locator('.kiosk-checklist .lf-progress-issue').filter({hasText:'Describe what changed or was observed.'}).click();
    const field=panel.locator('[data-field-path="details.exceptionSummary"] textarea');
    await expect(field).toBeFocused();await expect(disclosure).toHaveAttribute('aria-expanded','true');
    await disclosure.click();await page.getByRole('button',{name:'Return to full workspace',exact:true}).click();
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await page.locator('.cd2004-inspector .lf-progress-issue').filter({hasText:'Describe what changed or was observed.'}).click();
    await expect(field).toBeFocused();await expect(disclosure).toHaveAttribute('aria-expanded','true');
    await disclosure.click();await panel.locator('.wfp-summary-bar .wfp-status-flag').click();
    const dialog=page.getByRole('dialog',{name:'Items to complete',exact:true});
    await dialog.getByRole('button',{name:/Describe what changed or was observed/}).click();
    await expect(dialog).toBeHidden();await expect(field).toBeFocused();
    await expect(panel.getByRole('checkbox',{name:'Record an administration exception',exact:true})).toBeChecked();
  });
}
test('optional vitals, statements and response detail preserve exact note and saved bytes through 20 cycles and recovery',async({page})=>{
  await page.clock.install({time:new Date('2026-10-02T16:00:00Z')});await page.goto('/');const panel=await prepareRefinementInjection(page);
  const additional=panel.getByRole('button',{name:/Additional note items/});
  await expect(additional).toHaveAttribute('aria-expanded','false');await expect(additional).toContainText('0 statements selected');
  await save(page);const untouched=await savedState(page);
  await additional.click();await additional.click();expect(await savedState(page)).toEqual(untouched);
  await additional.click();await panel.locator('#inj-site-assessed').check();await additional.click();await expect(additional).toContainText('1 statements selected');
  await panel.locator('select[name="inj-response"]').selectOption('bleed');
  const detail=panel.getByRole('button',{name:/Supplementary response detail/});await detail.click();await panel.locator('select[name="inj-response-detail"]').selectOption('extended');await detail.click();await expect(detail).toContainText(/extended/i);
  await panel.getByRole('tab',{name:'Administration',exact:true}).click();const vitals=panel.getByRole('button',{name:/Vitals \(optional\)/});
  await vitals.click();await panel.locator('[data-field-path="vitals.bp"] input').fill('124/78');await panel.locator('[data-field-path="vitals.hr"] input').fill('72');await vitals.click();await expect(vitals).toContainText('BP 124/78 · HR 72');
  await save(page);const populated=await savedState(page);
  for(let i=0;i<20;i++){await vitals.click();await vitals.click();expect(await savedState(page)).toEqual(populated);}
  await page.reload();await page.waitForFunction(()=>document.body.dataset.applicationReady==='true');
  await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  await page.keyboard.press('F11');await page.locator('.records-drawer [data-records-open]').first().click();
  await panel.getByRole('tab',{name:'Administration',exact:true}).click();await expect(vitals).toContainText('BP 124/78 · HR 72');await vitals.click();await expect(panel.locator('[data-field-path="vitals.bp"] input')).toHaveValue('124/78');
  await panel.getByRole('tab',{name:'Review',exact:true}).click();await expect(additional).toContainText('1 statements selected');await additional.click();await expect(panel.locator('#inj-site-assessed')).toBeChecked();await expect(detail).toContainText(/extended/i);
});
test('all handoff outcomes save honestly; canceled return to administration preserves populated handoff',async({page})=>{
  await page.clock.install({time:new Date('2026-10-02T16:00:00Z')});await page.goto('/');const panel=await prepareRefinementInjection(page);await focused(page);await step(page,'response').click();
  for(const name of ['Held','Escalated','Provider-directed plan']) {
    await panel.getByText(name,{exact:true}).click();
    await panel.locator('[data-field-path="disposition.provider"] input').fill('Synthetic Recipient');
    await fillDate(panel.locator('[data-field-path="disposition.time"] input'),'2026-10-02T10:30');
    await panel.locator('[data-field-path="disposition.outcome"] textarea').fill('Follow-up with provider before next administration.');
    await expect(step(page,'prepare')).toContainText('Not needed');await expect(step(page,'site')).toContainText('Not needed');await expect(step(page,'administer')).toContainText('Not needed');
    await expect(step(page,'sign')).toContainText('Save handoff');await save(page);await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Handoff saved locally');
  }
  const before=await savedState(page);page.once('dialog',dialog=>dialog.dismiss());
  await panel.getByText('Review complete — document administration',{exact:true}).click();
  await expect(panel.locator('[data-field-path="disposition.outcome"] textarea')).toHaveValue('Follow-up with provider before next administration.');expect(await savedState(page)).toEqual(before);
  page.once('dialog',dialog=>dialog.accept());await panel.getByText('Review complete — document administration',{exact:true}).click();
  await expect(panel.locator('[data-field-path="disposition.outcome"] textarea')).toHaveCount(0);await expect(step(page,'administer')).toContainText('Documented');
});
