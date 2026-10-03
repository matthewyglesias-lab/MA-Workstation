const { chromium } = require('@playwright/test');
const { prepareRefinementInjection } = require('../tests/e2e/refinement-fixture');
const fs = require('node:fs');
const {seedRefinementWorklist}=require('../tests/e2e/refinement-worklist-fixture');
const root = process.argv[2], output = process.argv[3];
fs.mkdirSync(output, {recursive: true});
const sizes = [{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:800,height:600}];
(async()=>{
 const browser=await chromium.launch(); const measurements=[];
 for(const size of sizes){
  const context=await browser.newContext({viewport:size,timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
  const page=await context.newPage(); await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
  await page.addInitScript(seedRefinementWorklist);
  await page.goto(root); await page.waitForFunction(()=>document.body.dataset.applicationReady==='true');await page.evaluate(()=>document.fonts.ready);
  async function capture(name){
   await page.screenshot({path:`${output}/${name}-${size.width}.png`,style:'.tebra-toast-region,#toast {visibility:hidden}'});
   measurements.push(await page.evaluate(({name,size})=>{
    const dims=s=>{const e=document.querySelector(s);return e?{height:e.getBoundingClientRect().height,visible:e.clientHeight,scroll:e.scrollHeight}:null};
    const region=document.querySelector('.cd2004-worklist-sheet')?.getBoundingClientRect();
    const rows=[...document.querySelectorAll('.lf-work-row')].filter(e=>{const r=e.getBoundingClientRect();return region&&r.top>=region.top&&r.bottom<=region.bottom+1;}).length;
    return {name,size,header:dims('.lf-app-header'),editor:dims('.wfp-transaction-page'),preview:dims('.cd2004-document-split'),timing:dims('.lf-timing-register,.wfp-schedule-register'),readiness:dims('#lf-document-preview .lf-injection-progress,.lf-document-checks'),noteScroll:dims('#lf-document-preview .cd2004-inspector'),rows};
   },{name,size}));
  }
  await capture('worklist-populated');
  const panel=await prepareRefinementInjection(page,{review:false});
  await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click(); await panel.locator('.lf-timing-register,.wfp-schedule-register').first().scrollIntoViewIfNeeded(); await capture('shell-timing');
  await page.locator('.tebra-account-trigger').click();await page.locator('[data-account-action="staff"]').click();const dialog=page.getByRole('dialog',{name:'Documenting staff'});await dialog.getByRole('textbox',{name:'Name or initials'}).fill('Synthetic Staff, MA');await dialog.getByRole('button',{name:'Use for encounter',exact:true}).click();
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  await panel.getByText('Review complete — document administration',{exact:true}).click();
  await page.getByRole('button',{name:'Preview',exact:true}).click();await capture('preview-ready');
  await page.getByRole('button',{name:'Details',exact:true}).click();
  const shelf=page.locator('.lf-workspace-shelf');await shelf.locator('summary').first().click();
  await shelf.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();await capture('focused');
  await context.close();
 }
 fs.writeFileSync(`${output}/measurements.json`,JSON.stringify(measurements,null,2)); await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
