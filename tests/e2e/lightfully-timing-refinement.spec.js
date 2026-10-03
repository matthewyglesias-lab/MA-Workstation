const { test, expect } = require('@playwright/test');
const { prepareRefinementInjection } = require('./refinement-fixture');
for (const viewport of [{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:800,height:600}]) {
  test(`future due date and current visit remain separate at ${viewport.width}`, async ({page},info) => {
    await page.setViewportSize(viewport); await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.goto('/'); const panel=await prepareRefinementInjection(page);
    await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
    const register=panel.locator('.lf-timing-register');
    const next=register.getByRole('group',{name:'Next injection due',exact:true});
    const visit=register.getByRole('group',{name:'Timing of this visit',exact:true});
    await expect(next.locator('.lf-timing-value')).toHaveText('10/30/26');
    await expect(next).toContainText('Calculated'); await expect(next).toContainText('q4 wk from 10/02/26');
    await expect(visit.locator('[data-timing-fact="elapsed"] .lf-timing-value')).toHaveText('28');
    await expect(visit.locator('[data-timing-fact="window"] .lf-timing-value')).toHaveText('10/02/26 – 10/02/26');
    await expect(visit.locator('.lf-timing-verdict')).toHaveText('ON SCHEDULE');
    await expect(register).toContainText('Continue the required active-order and product-specific safety checks.');
    const geometry=await register.evaluate(e=>({height:e.getBoundingClientRect().height,
      width:e.getBoundingClientRect().width, next:e.querySelector('.lf-timing-next').getBoundingClientRect().toJSON(),
      visit:e.querySelector('.lf-timing-visit').getBoundingClientRect().toJSON(),overflow:e.scrollWidth-e.clientWidth,
      live:e.querySelectorAll('[aria-live="polite"]').length}));
    expect(geometry.overflow).toBeLessThanOrEqual(1); expect(geometry.live).toBe(1);
    if(viewport.width>=1366) { expect(geometry.height).toBeGreaterThanOrEqual(180);expect(geometry.height).toBeLessThanOrEqual(220);expect(geometry.visit.left).toBeGreaterThan(geometry.next.right); }
    await register.scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath(`timing-on-schedule-${viewport.width}.png`)});
    await info.attach('timing-measurements',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
    await register.locator('.lf-timing-status').evaluate(e=>{window.__timingAnnouncements=0;new MutationObserver(()=>window.__timingAnnouncements++).observe(e,{subtree:true,childList:true,characterData:true});});
    await panel.locator('input[placeholder="Last, First"]').fill('Timing, Synthetic');
    expect(await page.evaluate(()=>window.__timingAnnouncements)).toBe(0);
    const before=await next.textContent();
    await next.getByRole('button',{name:'Override…',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0); expect(await next.textContent()).toBe(before);
  });
}
