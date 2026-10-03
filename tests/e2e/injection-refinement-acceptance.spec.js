const {test,expect}=require('@playwright/test');const path=require('node:path');
const {prepareRefinementInjection}=require('./refinement-fixture');const {openWorkspaceOptions}=require('./workspace-navigation');
let probe;
test.beforeAll(async()=>{
 const {build}=await import('vite');
 const result=await build({configFile:false,root:path.resolve(__dirname,'../..'),logLevel:'error',build:{write:false,emptyOutDir:false,minify:false,
  lib:{entry:path.join(__dirname,'unknown-issue-browser-probe.js'),name:'UnfamiliarIssueProbe',formats:['iife']}}});
 probe=(Array.isArray(result)?result[0]:result).output.find(chunk=>chunk.type==='chunk'&&chunk.isEntry).code;
});
async function staff(page){await page.locator('.tebra-account-trigger').click();await page.locator('[data-account-action="staff"]').click();const dialog=page.getByRole('dialog',{name:'Documenting staff'});await dialog.getByRole('textbox',{name:'Name or initials'}).fill('Synthetic Staff, MA');await dialog.getByRole('button',{name:'Use for encounter',exact:true}).click();}
async function focused(page){await openWorkspaceOptions(page);await page.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();}
for(const viewport of [{width:1440,height:900},{width:800,height:600}]){
 test(`unfamiliar named stop is visible once and reaches visible review at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');const panel=await prepareRefinementInjection(page);
  await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();const note=await page.evaluate(()=>JSON.stringify(window._note));
  await page.addScriptTag({content:probe});await page.evaluate(()=>window.__mountUnfamiliarConcern());
  const surface=page.locator('#unfamiliar-concern-probe');await expect(surface.getByRole('button',{name:/Unrecognized safety check requires review/})).toHaveCount(1);
  await expect(surface.locator('.lf-progress-issue').first()).toContainText('Unrecognized safety check requires review.');
  await surface.getByRole('button',{name:/Unrecognized safety check requires review/}).click();
  await expect(panel.getByRole('tab',{name:'Review',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(panel.locator('.wfp-navigation-notice')).toBeVisible();
  expect(await panel.getByRole('tabpanel').evaluate(e=>document.activeElement===e)).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify(window._note))).toBe(note);await page.evaluate(()=>window.__removeUnfamiliarConcern());
 });
 test(`permitted repeated-site advisory preserves completed work and real sign capability at ${viewport.width}`,async({page},info)=>{
  await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');const panel=await prepareRefinementInjection(page);
  await staff(page);await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
  await panel.locator('[data-field-path="priorSite"] select').selectOption('R deltoid');
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  // A permitted warning does not bypass the mandatory current administration review.
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  await expect(panel.locator('.wfp-invalidation-receipt')).toContainText('Prior site changed');
  await panel.getByText('Review complete — document administration',{exact:true}).click();
  await focused(page);
  await expect(page.locator('[data-injection-finish]')).toBeEnabled();
  await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Ready to sign');
  await expect(page.locator('.kiosk-checklist .lf-progress-concerns')).toContainText('repeats the prior documented site');
  for(const id of ['identify','verify-order','prepare','site','administer','response'])await expect(page.locator(`.kiosk-stepper [data-kiosk-step="${id}"]`)).toContainText('Documented');
  await page.getByRole('button',{name:'Return to full workspace',exact:true}).click();await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('#lf-document-preview .lf-progress-concerns')).toContainText('repeats the prior documented site');
  await expect(page.locator('#lf-document-preview details')).not.toHaveAttribute('open','');
  await page.screenshot({path:info.outputPath(`preview-advisory-${viewport.width}.png`),style:'.tebra-toast-region,#toast {visibility:hidden}'});
 });
 test(`missing response preserves earlier identity and product progress at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');const panel=await prepareRefinementInjection(page,{response:false,review:false});await focused(page);
  for(const id of ['identify','verify-order','prepare','site'])await expect(page.locator(`.kiosk-stepper [data-kiosk-step="${id}"]`)).toContainText('Documented');
  await expect(page.locator('.kiosk-stepper [data-kiosk-step="response"]')).toContainText('Not started');
  await page.locator('.kiosk-checklist .lf-progress-issue').filter({hasText:'observed post-injection response'}).first().click();
  await expect(panel.locator('select[name="inj-response"]')).toBeFocused();await panel.locator('select[name="inj-response"]').selectOption('well');
  await expect(page.locator('.kiosk-stepper [data-kiosk-step="response"]')).toHaveAttribute('aria-current','step');
  await expect(page.locator('.kiosk-stepper [data-kiosk-step="identify"]')).toContainText('Documented');
 });
}

// Dates remain ordinary entry until staff intentionally reaches Review. Canceling
// the prompt must not become an acknowledgement or erase its visible requirement.
for (const viewport of [{ width: 1440, height: 900 }, { width: 800, height: 600 }]) {
 test(`late timing prompt is once per facts and cancellation never acknowledges at ${viewport.width}`, async ({ page }) => {
  const { fillDate } = require('./date-entry');
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
  await page.goto('/');
  const panel = await prepareRefinementInjection(page);
  await staff(page);
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  const prior = panel.locator('[data-field-path="priorDoseDate"] input');
  await prior.fill('08/0');
  await expect(page.getByRole('dialog', { name: 'Late-dose review' })).toBeHidden();
  await fillDate(prior, '2026-08-01');
  await expect(page.getByRole('dialog', { name: 'Late-dose review' })).toBeHidden();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Late-dose review' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await panel.getByRole('button', { name: 'Review timing', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Document provider approval / late-dose review' })).toBeVisible();
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  const state = await page.evaluate(() => window.ipmgLegacyClinicalStateSnapshot().injection);
  expect(state.documentation?.lateDoseReview).toBeFalsy();
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(dialog).toBeHidden();
  await panel.getByRole('tab', { name: 'Order & Timing', exact: true }).click();
  await fillDate(panel.locator('[data-field-path="administrationDate"] input'), '2026-10-03');
  await expect(dialog).toBeHidden();
  await panel.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Approving provider' })).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
 });
}
