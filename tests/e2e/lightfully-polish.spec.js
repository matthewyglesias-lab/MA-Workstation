const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const open = (page, label) => clickWorkspace(page, `.cd2004-nav-item[title="${label}"]`);

test('injection context and requirements stay legible without terminal-style stamps', async ({page}) => {
  await page.goto('/'); await open(page, 'Injection');
  const panel=page.locator('.wfp-panel');
  await panel.getByRole('textbox',{name:'Patient name',exact:true}).fill('Polish QA, Synthetic');
  await panel.getByRole('textbox',{name:'DOB',exact:true}).fill('01/02/1990');
  await panel.locator('[name="inj-medication"]').selectOption('maintena');
  await expect(page.locator('.cd2004-patient-banner')).toContainText('Record status');
  await expect(page.locator('.cd2004-patient-banner')).not.toContainText(/inj_\d/);
  const allergy=page.locator('[data-allergy-tone="documented-negative"]');
  await expect(allergy).toContainText('NKDA');
  expect(await allergy.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(246, 248, 249)');
  await expect(page.locator('[data-operator-guidance]')).toContainText('Clinical guidance');
  await expect(panel.locator('[data-field-path="reason"]')).toBeVisible();
  const required=panel.locator('.wfp-status-flag.is-stop');
  await expect(required).toContainText('to resolve');
  await required.click();
  const dialog=page.locator('dialog[open]');
  await expect(dialog.locator('.wfp-issue-row').first()).toBeVisible();
  await expect(dialog).toContainText('Select the injection encounter type');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

for(const size of [{width:1440,height:900},{width:800,height:600}]) {
  for(const module of ['Samples','Forms']) {
    test(`${module} labels and docked actions work at ${size.width}x${size.height}`, async ({page})=>{
      await page.setViewportSize(size); await page.goto('/'); await open(page,module);
      const panel=page.locator('.wfp-panel');
      const name=panel.getByRole('textbox',{name:'Patient name',exact:true});
      await name.fill('Dock QA, Synthetic');
      await expect(name).toHaveValue('Dock QA, Synthetic');
      const dock=page.locator('.lf-service-footer');
      await expect(dock).toBeVisible();
      const a=await dock.boundingBox();
      expect(a.y+a.height).toBeLessThanOrEqual(size.height);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x+a.width).toBeLessThanOrEqual(size.width);
      await page.locator('.lf-service-scroll').evaluate(n=>n.scrollTop=n.scrollHeight);
      const b=await dock.boundingBox();
      expect(b.y).toBe(a.y);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole('button',{name:'Preview',exact:true}).click();
      await expect(page.locator('#lf-document-preview')).toContainText('Dock QA, Synthetic');
      await page.getByRole('button',{name:'Details',exact:true}).click();
      await expect(name).toHaveValue('Dock QA, Synthetic');
    });
  }
}

test('field focus leaves the entry surface calm and required semantics intact', async ({page})=>{
 await page.goto('/'); await open(page,'Injection');
 await page.locator('[name="inj-medication"]').selectOption('maintena');
 const field=page.locator('[data-field-path="patient.name"]');
 const input=field.locator('input');
 const initial=await input.evaluate(n=>getComputedStyle(n).backgroundColor);
 await input.focus();
 expect(await input.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(initial);
 await expect(input).toHaveAttribute('aria-required','true');
 expect(await input.evaluate(n=>parseFloat(getComputedStyle(n).minHeight))).toBeGreaterThanOrEqual(40);
});


test('native choice controls do not paint retired marks over administration', async ({page})=>{
 await page.goto('/'); await open(page,'Injection');
 await page.locator('[name="inj-medication"]').selectOption('maintena');
 await page.getByRole('tab',{name:'Administration',exact:true}).click();
 const radio=page.locator('input[name="inj-site"]').first();
 await radio.check(); await expect(radio).toBeChecked();
 for(const selector of ['input[name="inj-site"]:checked','input[name="inj-weight-unit"]:checked']){
   const controls=page.locator(selector);
   for(const control of await controls.all()) {
     expect(await control.evaluate(n=>getComputedStyle(n,'::after').content)).toBe('none');
     const rect=await control.boundingBox();
     expect(rect.width).toBeLessThanOrEqual(24);expect(rect.height).toBeLessThanOrEqual(24);
   }
 }
 await expect(page.locator('.wfp-site-tile').first()).toBeInViewport();
});


test('reference entry descriptions stay inside their selectable rows', async ({page})=>{
 await page.setViewportSize({width:1024,height:768});await page.goto('/');await open(page,'Reference');
 const rows=page.locator('.wfp-lookup .wfp-option-row');
 expect(await rows.count()).toBeGreaterThan(0);
 const overflow=await rows.evaluateAll(ns=>ns.flatMap(n=>{
   const r=n.getBoundingClientRect(),d=n.querySelector('.wfp-option-desc')?.getBoundingClientRect();
   return d && (d.bottom>r.bottom+1 || d.right>r.right+1) ? [n.textContent] : [];
 }));
 expect(overflow).toEqual([]);
});
