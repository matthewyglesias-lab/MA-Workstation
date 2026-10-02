const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const BASE_URL=process.env.REVIEW_BASE_URL||'http://127.0.0.1:4173';
const {clickWorkspace}=require('../tests/e2e/workspace-navigation');
const out=process.env.REVIEW_OUTPUT||path.resolve('visual-review');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'});
 const p=await context.newPage();p.setDefaultTimeout(5000);
 const issues=[];p.on('pageerror',e=>issues.push(e.message));
 const report=[];
 const shot=async(name)=>{await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(180);await p.screenshot({path:`${out}/${name}.png`});report.push({screen:name,metrics:await p.evaluate(()=>({pageOverflow:document.documentElement.scrollWidth-innerWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({name:d.getAttribute('aria-labelledby'),text:d.innerText.slice(0,180)}))}))});};
 await p.goto(BASE_URL);await p.locator('.lf-document-action').waitFor();await shot('worklist');
 await p.locator('.lf-document-action').click();await p.locator('dialog[open]').waitFor();await shot('service-chooser');await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Search workspace commands',exact:true}).click();await p.locator('dialog[open]').waitFor();await shot('commands');await p.keyboard.press('Escape');
 await p.keyboard.press('F1');await p.locator('dialog[open]').waitFor();await shot('keyboard-help');await p.keyboard.press('Escape');
 await clickWorkspace(p,'.cd2004-nav-item[title="Injection"]');await p.locator('[name="inj-medication"]').selectOption('maintena');
 await p.locator('[data-field-path="patient.name"] input').fill('Acceptance, Synthetic');await p.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');await shot('injection-order');
 for(const tab of ['Product','Administration','Review']){await p.getByRole('tab',{name:tab,exact:true}).click();await shot('injection-'+tab.toLowerCase());}
 await p.getByRole('button',{name:'Preview',exact:true}).click();await shot('injection-preview');await p.getByRole('button',{name:'Details',exact:true}).click();
 await p.getByRole('tab',{name:'Order & Timing',exact:true}).click();await p.locator('[data-injection-save]').click();await p.getByRole('button',{name:'Open saved notes (F11)',exact:true}).click();await p.locator('dialog[open]').waitFor();await shot('saved-injections');await p.keyboard.press('Escape');
 await p.locator('.wfp-status-flag.is-stop').click();await p.locator('dialog[open]').waitFor();await shot('requirements');await p.keyboard.press('Escape');
 for(const service of ['UDS','Samples','Forms','Reference','Daily Closeout','Future / TMS']){
  await p.goto(BASE_URL);await p.locator('.lf-document-action').waitFor();
  await clickWorkspace(p,`.cd2004-nav-item[title="${service}"]`);await shot(service.toLowerCase().replace(/[^a-z]+/g,'-'));
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify({report,errors:issues},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
