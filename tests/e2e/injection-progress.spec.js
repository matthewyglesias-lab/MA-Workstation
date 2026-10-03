const { test, expect } = require('@playwright/test');
const { prepareRefinementInjection } = require('./refinement-fixture');
const { openWorkspaceOptions } = require('./workspace-navigation');
const step = (page, id) => page.locator(`.kiosk-stepper [data-kiosk-step="${id}"]`);
async function focusWorkspace(page) {
  await openWorkspaceOptions(page);
  await page.getByRole('button', {name:'Open focused injection workspace',exact:true}).click();
}
async function localStaff(page) {
  await page.locator('.tebra-account-trigger').click();
  await page.locator('[data-account-action="staff"]').click();
  const dialog=page.getByRole('dialog',{name:'Documenting staff'});
  await dialog.getByRole('textbox',{name:'Name or initials'}).fill('Synthetic Staff, MA');
  await dialog.getByRole('button',{name:'Use for encounter',exact:true}).click();
}
for(const viewport of [{width:1440,height:900},{width:800,height:600}]) {
  test(`empty and incomplete progress remains step-specific at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto('/?kiosk=1');
    await expect(page.locator('.kiosk-stepper li[data-step-state="complete"]')).toHaveCount(0);
    await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Documentation in progress');
    // Only real inputs and navigation; visiting a later step is not evidence.
    const panel=page.locator('.wfp-panel');
    await panel.locator('input[placeholder="Last, First"]').fill('Progress, Synthetic');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').press('Tab');
    await expect(step(page,'identify')).toContainText('Documented');
    await step(page,'response').click();
    await expect(step(page,'identify')).toContainText('Documented');
    await expect(step(page,'response')).toHaveAttribute('aria-current','step');
    await expect(step(page,'response')).not.toContainText('Documented');
    await expect(panel.getByRole('tabpanel',{name:'Review',exact:true})).toBeVisible();
    // With no medication selected the engine deliberately hides response.
    await expect(panel.locator('select[name="inj-response"]')).toHaveCount(0);
  });
  test(`actual sign capability is distinct from documented work at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.clock.install({time:new Date('2026-10-02T16:00:00Z')});
    await page.goto('/');
    const panel=await prepareRefinementInjection(page);
    await focusWorkspace(page);
    await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Signing unavailable');
    await expect(page.locator('.kiosk-checklist .lf-progress-capability')).toContainText(/staff/i);
    await expect(step(page,'sign')).toContainText('Review note');
    for(const id of ['identify','verify-order','prepare','site','administer','response'])
      await expect(step(page,id)).toContainText('Documented');
    await expect(panel.locator('.wfp-summary-bar')).toContainText('Signing unavailable');
    await localStaff(page);
    await expect(step(page,'sign')).toContainText('Ready to sign');
    await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Ready to sign');
    await expect(panel.locator('.wfp-summary-bar')).toContainText('Ready to sign');
    await step(page,'sign').click();
    await expect(page.getByRole('dialog',{name:'Sign',exact:true})).toBeHidden();
    await expect(page.locator('[data-injection-finish]')).toBeFocused();
    await page.getByRole('button',{name:'Return to full workspace',exact:true}).click();
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await expect(page.locator('.cd2004-inspector .lf-progress-heading')).toContainText('Ready to sign');
    await expect(page.locator('.cd2004-inspector .lf-progress-checks')).not.toHaveAttribute('open','');
    await page.locator('.cd2004-inspector .lf-progress-checks > summary').click();
    await expect(page.locator('.cd2004-inspector .lf-progress-checks li')).toHaveCount(6);
  });
}
