const { chromium } = require('@playwright/test');
const { prepareRefinementInjection } = require('../tests/e2e/refinement-fixture');
const fs=require('node:fs');
(async()=>{const browser=await chromium.launch();const results=[];
for(const port of process.argv.slice(3).map(Number))for(const width of [1440,800]){
 const page=await browser.newPage({viewport:{width,height:width===800?600:900},timezoneId:'America/Los_Angeles'});
 await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto(`http://127.0.0.1:${port}/`);
 await page.evaluate(()=>{window.__routineClicks=[];document.addEventListener('click',e=>{const n=e.target.closest('button,label,input,summary');if(n&&n.closest('#lf-workstation'))window.__routineClicks.push((n.getAttribute('aria-label')||n.textContent||n.name||n.type).trim());},true);});
 await prepareRefinementInjection(page);
 const clicks=await page.evaluate(()=>window.__routineClicks);results.push({port,width,clicks:clicks.length,targets:clicks,unusedOptionalOpened:clicks.filter(x=>/Vitals \(optional\)|Additional note items|Supplementary response detail|Provider appointment/.test(x)).length});await page.close();
}
await browser.close();fs.writeFileSync(process.argv[2],JSON.stringify(results,null,2));console.log(results.map(({targets,...r})=>r));})().catch(e=>{console.error(e);process.exitCode=1});
