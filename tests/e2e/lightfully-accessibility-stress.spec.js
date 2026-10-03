const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {prepareRefinementInjection}=require('./refinement-fixture');
const {openWorkspaceOptions}=require('./workspace-navigation');
for(const effective of [{width:1440,height:900},{width:800,height:600}]){
 test(`real Chromium 200 percent browser zoom retains clinical work at ${effective.width}`,async({},info)=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ma-zoom-'));
  const extension=path.join(temp,'extension');await fs.mkdir(extension);
  await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local browser zoom acceptance',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  await fs.writeFile(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
  const context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,
   viewport:{width:effective.width*2,height:effective.height*2},timezoneId:'America/Los_Angeles',
   args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
   const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('http://127.0.0.1:4173/');
   await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const app=tabs.find(t=>t.url?.includes('4173'));await chrome.tabs.setZoom(app.id,2);});
   await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(effective.width);
   expect(await page.evaluate(()=>innerHeight)).toBe(effective.height);
   const panel=await prepareRefinementInjection(page);
   await expect(panel.locator('select[name="inj-response"]')).toHaveValue('well');
   await page.getByRole('button',{name:'Preview',exact:true}).click();
   await expect(page.getByRole('article',{name:'Generated documentation'})).toContainText('Refinement, Synthetic');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await page.screenshot({path:info.outputPath(`native-browser-zoom-200-${effective.width}.png`),style:'.tebra-toast-region,#toast {visibility:hidden}'});
   await info.attach('native-zoom',{body:JSON.stringify({physical:{width:effective.width*2,height:effective.height*2},effective,percent:200,method:'chrome.tabs.setZoom'}),contentType:'application/json'});
  }finally{await context.close();await fs.rm(temp,{recursive:true,force:true});}
 });
 test(`200 percent text enlargement preserves controls and disclosure at ${effective.width}`,async({page},info)=>{
  await page.setViewportSize(effective);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');
  const panel=await prepareRefinementInjection(page);
  await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
  // Chromium has browser zoom, not a separate native text-only zoom command.
  // Double all measured text/line metrics simultaneously (not a viewport gate).
  await page.evaluate(()=>{
   const metrics=[...document.querySelectorAll('*')].filter(e=>e instanceof HTMLElement).map(e=>{const s=getComputedStyle(e);return[e,parseFloat(s.fontSize),parseFloat(s.lineHeight)];});
   for(const[e,font,line]of metrics){e.style.fontSize=`${font*2}px`;if(Number.isFinite(line))e.style.lineHeight=`${line*2}px`;}
  });
  const name=panel.locator('input[placeholder="Last, First"]');await name.fill('Enlargement, Synthetic');await name.press('Tab');
  await expect(name).toHaveValue('Enlargement, Synthetic');expect(await name.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBe(26);
  const overlaps=await page.evaluate(()=>{const a=document.querySelector('.lf-section-rail').getBoundingClientRect(),b=document.querySelector('.lf-masthead-utilities').getBoundingClientRect();return a.right>b.left+1&&b.right>a.left+1&&a.bottom>b.top+1&&b.bottom>a.top+1;});
  expect(overlaps).toBe(false);
  const collision=await page.evaluate(()=>{const a=document.querySelector('.lf-document-action').getBoundingClientRect(),b=document.querySelector('.lf-header-search').getBoundingClientRect();return a.right>b.left+1&&a.bottom>b.top+1&&b.bottom>a.top+1;});expect(collision).toBe(false);
  const field=panel.locator('select[name="inj-medication"]');await field.scrollIntoViewIfNeeded();await field.focus();
  const lookup=field.locator('xpath=ancestor::div[contains(@class,"wfp-field-entry")]').locator('.wfp-field-lookup-button');
  const [control,button]=await Promise.all([field.boundingBox(),lookup.boundingBox()]);expect(Math.abs(control.height-button.height)).toBeLessThanOrEqual(1);
  await field.press('F9');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(field).toBeFocused();
  await page.screenshot({path:info.outputPath(`text-enlargement-200-${effective.width}.png`),style:'.tebra-toast-region,#toast {visibility:hidden}'});
 });
}

test('twenty view/density/focused cycles retain data and observer ownership',async({page})=>{
 await page.addInitScript(()=>{
  const Native=ResizeObserver;const owners=new Map();
  window.ResizeObserver=class extends Native{
   constructor(fn){super(fn);owners.set(this,new Set());}
   observe(target,options){owners.get(this).add(target);return super.observe(target,options);}
   unobserve(target){owners.get(this).delete(target);return super.unobserve(target);}
   disconnect(){owners.get(this).clear();return super.disconnect();}
  };window.__observedTargets=()=>[...owners.values()].reduce((sum,set)=>sum+set.size,0);
 });
 await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');const panel=await prepareRefinementInjection(page);
 const before=await page.evaluate(()=>JSON.stringify(window._note));const targets=await page.evaluate(()=>window.__observedTargets());
 for(let i=0;i<20;i++){
  await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Details',exact:true}).click();
  await openWorkspaceOptions(page);await page.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();
  await page.locator('[data-kiosk-step="response"]').click();await page.getByRole('button',{name:'Return to full workspace',exact:true}).click();
  await openWorkspaceOptions(page);await page.getByRole('button',{name:'Compact workspace',exact:true}).click();await page.keyboard.press('Escape');
  await expect(panel.locator('select[name="inj-response"]')).toHaveValue('well');
 }
 expect(await page.evaluate(()=>JSON.stringify(window._note))).toBe(before);
 expect(await page.evaluate(()=>window.__observedTargets())).toBe(targets);
 await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
 await expect(page.locator('input[placeholder="Last, First"]:visible')).toHaveCount(1);
 await expect(page.locator('#lf-document-preview')).toHaveCount(1);
});

test('new shell, timing and preview text meet contrast against their actual backgrounds',async({page})=>{
 const measure=async selectors=>page.locator(selectors).evaluateAll(nodes=>{
  const rgba=text=>text.match(/[\d.]+/g).map(Number);
  const luminance=rgb=>{const values=rgb.slice(0,3).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  return nodes.filter(e=>e.getClientRects().length).map(e=>{
   let parent=e,background;while(parent){const bg=rgba(getComputedStyle(parent).backgroundColor);if(bg.length<4||bg[3]===1){background=bg;break;}parent=parent.parentElement;}
   const a=luminance(rgba(getComputedStyle(e).color)),b=luminance(background||[255,255,255]);
   return {text:e.textContent.slice(0,80),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
 });
 await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));await page.goto('/');
 const shell=await measure('.lf-primary-navigation button,.lf-document-action,.lf-worklist-heading p,.lf-workspace-footnote,.lf-search-scope');
 for(const sample of shell)expect(sample.ratio,sample.text).toBeGreaterThanOrEqual(4.5);
 const panel=await prepareRefinementInjection(page);await panel.getByRole('tab',{name:'Order & Timing',exact:true}).click();
 const timing=await measure('.lf-timing-head strong,.lf-timing-row dt,.lf-timing-note,.lf-timing-verdict,.lf-timing-flag,.lf-timing-band');
 for(const sample of timing)expect(sample.ratio,sample.text).toBeGreaterThanOrEqual(4.5);
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 const preview=await measure('.lf-progress-heading strong,.lf-progress-heading>span,.lf-progress-capability,.lf-progress-checks summary,.lf-progress-checks summary span,.cd2004-note-mode,.cd2004-note-ident dt,.cd2004-note-ident dd,.lf-note-boundary,.cd2004-note-line');
 for(const sample of preview)expect(sample.ratio,sample.text).toBeGreaterThanOrEqual(4.5);
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
 await expect(page.locator('#lf-document-preview .lf-progress-checks>summary')).toBeVisible();
 await page.locator('#lf-document-preview .lf-progress-checks>summary').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#lf-document-preview .lf-progress-checks')).toHaveAttribute('open','');
 await page.keyboard.press('Enter');await expect(page.locator('#lf-document-preview .lf-progress-checks')).not.toHaveAttribute('open','');
});
