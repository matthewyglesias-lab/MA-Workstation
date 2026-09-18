const { test, expect } = require('@playwright/test');
// v2 replaces the retired card-dashboard contract with a worklist-first layout.
for (const viewport of [{width:1440,height:900},{width:1024,height:768}]) {
  test(`mature worklist composition at ${viewport.width}x${viewport.height}`, async ({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');
    await expect(page.getByRole('heading',{name:'Worklist',exact:true})).toBeVisible();
    await expect(page.locator('.lf-quick-tool,.lf-work-summary,.lf-welcome')).toHaveCount(0);
    await page.keyboard.press('Tab');await page.locator('.lf-document-action').focus();
    const result=await page.evaluate(()=>{
      const q=s=>document.querySelector(s),style=s=>getComputedStyle(q(s));
      const inside=s=>{const r=q(s).getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;};
      return {
        fits:['.tebra-section-rail','.tebra-app-header-main','.cd2004-work-window','.cd2004-worklist-tabs','.cd2004-worklist-footer'].every(inside),
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        font:style('#lf-workstation').fontFamily,
        titleFont:style('#currentWorklistTitle').fontFamily,
        navWidth:Math.round(q('.tebra-context-rail').getBoundingClientRect().width),
        background:style('.tebra-app-header-main').backgroundColor,
        workHeadingBackground:style('.lf-worklist-heading').backgroundColor,
        titleColor:style('#currentWorklistTitle').color,
        primary:style('.lf-document-action').backgroundColor,
        primaryGradient:style('.lf-document-action').backgroundImage,
        primaryShadow:style('.lf-document-action').boxShadow,
        focusWidth:style('.lf-document-action').outlineWidth,
        focusStyle:style('.lf-document-action').outlineStyle,
      };
    });
    expect(result).toEqual({fits:true,overflow:false,font:expect.stringContaining('Inter Variable'),titleFont:expect.stringContaining('Georgia'),navWidth:200,background:'rgb(255, 255, 255)',workHeadingBackground:'rgba(0, 0, 0, 0)',titleColor:'rgb(41, 66, 85)',primary:'rgb(243, 117, 101)',primaryGradient:'none',primaryShadow:'none',focusWidth:'2px',focusStyle:'solid'});
    await page.locator('.lf-document-action').click();
    await expect(page.getByRole('dialog',{name:'Document a service'})).toBeVisible();
    await expect(page.locator('[data-service-open]')).toHaveCount(4);
    await page.keyboard.press('Escape');await expect(page.locator('.lf-document-action')).toBeFocused();
  });
}
