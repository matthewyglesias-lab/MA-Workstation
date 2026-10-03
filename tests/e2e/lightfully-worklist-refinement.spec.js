const { test, expect } = require('@playwright/test');
const { seedRefinementWorklist } = require('./refinement-worklist-fixture');
for (const viewport of [{ width:1440,height:900 },{ width:1366,height:768 },{ width:1024,height:768 },{ width:800,height:600 }]) {
  test(`populated native worklist, readable shell and explicit actions at ${viewport.width}`, async ({page}, info) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.addInitScript(seedRefinementWorklist);
    await page.goto('/'); await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.lf-work-row')).toHaveCount(14);
    for (const chip of await page.locator('.lf-work-row[data-worklist-row="drafts"] .tebra-state-chip').all()) await expect(chip).toHaveClass(/is-neutral/);
    for (const chip of await page.locator('.lf-work-row[data-worklist-row="review"] .tebra-state-chip').all()) await expect(chip).toHaveClass(/is-warning/);
    const geometry = await page.evaluate(() => {
      const masthead = document.querySelector('.lf-masthead').getBoundingClientRect();
      const scroller = document.querySelector('.cd2004-worklist-sheet').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.lf-work-row')];
      const complete = rows.filter(e => { const r=e.getBoundingClientRect(); return r.top>=scroller.top && r.bottom<=scroller.bottom+1; });
      return { header:masthead.height, row:getComputedStyle(rows[0]).display, cell:getComputedStyle(rows[0].firstElementChild).display,
        heights:complete.map(e=>e.getBoundingClientRect().height), complete:complete.length,
        overflow:document.documentElement.scrollWidth-innerWidth,
        clippedActions:[...document.querySelectorAll('.lf-primary-navigation button,.lf-document-action')].some(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth||r.left<0||e.scrollWidth>e.clientWidth+1;}),
        utilityGap:document.querySelector('.lf-header-search').getBoundingClientRect().left-document.querySelector('.lf-document-action').getBoundingClientRect().right,
        navFont:parseFloat(getComputedStyle(document.querySelector('.lf-primary-navigation button')).fontSize) };
    });
    expect(geometry.header).toBeLessThanOrEqual(68);
    expect(geometry.row).toBe('table-row'); expect(geometry.cell).toBe('table-cell');
    expect(geometry.navFont).toBeGreaterThanOrEqual(13);
    expect(geometry.utilityGap).toBeGreaterThanOrEqual(8);
    expect(geometry.clippedActions).toBe(false); expect(geometry.overflow).toBeLessThanOrEqual(1);
    if(viewport.width>=1366) {
      expect(geometry.complete).toBeGreaterThanOrEqual(viewport.height===900?6:4);
      for(const height of geometry.heights) expect(height).toBeGreaterThanOrEqual(56);
      for(const height of geometry.heights) expect(height).toBeLessThanOrEqual(64);
    }
    await page.screenshot({path:info.outputPath(`worklist-populated-${viewport.width}.png`)});
    // Selecting a row's content does not open anything. Only the command does.
    await page.locator('.lf-work-row').first().locator('td').first().click();
    await expect(page.getByRole('heading',{name:'Worklist',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:/^Drafts/}).click();
    const action=page.locator('[data-worklist-open="draft:refinement-draft-5"]');
    await action.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.wfp-panel input[placeholder="Last, First"]')).toHaveValue('Long-Surname-With-Many-Parts, Synthetic Example Patient');
  });
}
