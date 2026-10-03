const { test, expect } = require('@playwright/test');
const { prepareRefinementInjection } = require('./refinement-fixture');
async function staff(page) {
  await page.locator('.tebra-account-trigger').click(); await page.locator('[data-account-action="staff"]').click();
  const dialog=page.getByRole('dialog',{name:'Documenting staff'});
  await dialog.getByRole('textbox',{name:'Name or initials'}).fill('Synthetic Staff, MA');
  await dialog.getByRole('button',{name:'Use for encounter',exact:true}).click();
}
for(const viewport of [{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:800,height:600}]) {
  test(`complete preview has usable panes, compact checks and exact copy at ${viewport.width}`, async({page},info)=>{
    await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__previewCopy=text;}}}));
    await page.goto('/');const panel=await prepareRefinementInjection(page);await staff(page);
    const note=await page.evaluate(()=>[window._note.cc,window._note.as,window._note.pl].join('\n\n────────────────────────────────\n\n'));
    const control=panel.locator('select[name="inj-response"]');await control.evaluate(e=>{window.__retainedResponse=e;});
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    const preview=page.locator('#lf-document-preview');const summary=preview.locator('.lf-injection-progress');
    await expect(summary).toContainText('Ready to sign');await expect(summary.locator('details')).not.toHaveAttribute('open','');
    const geometry=await preview.evaluate(e=>{
      const inspector=e.querySelector('.cd2004-inspector'),article=e.querySelector('article');
      const form=document.querySelector('.cd2004-workflow-slot');
      const scrollable=[...e.querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY));
      return {previewWidth:e.getBoundingClientRect().width,formWidth:form.getBoundingClientRect().width,
        hidden:form.inert,articleOverflow:article.scrollWidth-article.clientWidth,
        scrollers:scrollable.length,status:e.querySelector('.lf-injection-progress').getBoundingClientRect().height,
        bodyFont:parseFloat(getComputedStyle(e.querySelector('.cd2004-note-body')).fontSize),
        height:inspector.clientHeight,scrollHeight:inspector.scrollHeight};
    });
    expect(geometry.scrollers).toBe(1);expect(geometry.status).toBeGreaterThanOrEqual(40);expect(geometry.status).toBeLessThanOrEqual(48);
    expect(geometry.bodyFont).toBeGreaterThanOrEqual(13);expect(geometry.articleOverflow).toBeLessThanOrEqual(1);
    if(viewport.width>=1366){expect(geometry.formWidth).toBeGreaterThanOrEqual(600);expect(geometry.previewWidth).toBeGreaterThanOrEqual(480);expect(geometry.hidden).toBe(false);}
    else {expect(geometry.formWidth).toBe(0);expect(geometry.hidden).toBe(true);expect(geometry.previewWidth).toBeGreaterThanOrEqual(viewport.width-50);}
    await expect(preview.locator('.cd2004-note-lineno,.cd2004-note-marks')).toHaveCount(0);
    await page.screenshot({path:info.outputPath(`preview-ready-${viewport.width}.png`),style:'.tebra-toast-region,#toast { visibility: hidden; }'});
    await preview.getByRole('button',{name:'Copy note',exact:true}).click();expect(await page.evaluate(()=>window.__previewCopy)).toBe(note);
    await preview.getByRole('button',{name:'Copy CC section',exact:true}).click();expect(await page.evaluate(()=>window.__previewCopy)).toBe(await page.evaluate(()=>window._note.cc));
    await info.attach('preview-measurements',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
    await summary.locator('summary').click();await expect(summary.locator('details')).toHaveAttribute('open','');
    // State updates preserve explicit disclosure intent.
    await page.getByRole('button',{name:'Details',exact:true}).click();await control.selectOption('obsok');
    await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(summary.locator('details')).toHaveAttribute('open','');
    await preview.locator('.cd2004-inspector').evaluate(e=>{e.scrollTop=e.scrollHeight;});
    await expect(preview.locator('.cd2004-note-eod')).toBeInViewport();
    await page.getByRole('button',{name:'Details',exact:true}).click();
    expect(await control.evaluate(e=>e===window.__retainedResponse)).toBe(true);
  });
}
