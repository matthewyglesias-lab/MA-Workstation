const {test,expect}=require('@playwright/test');
const {clickWorkspace}=require('./workspace-navigation');
const KEY='ipmgMedAssistInjectionRecordsV1';
function record(i){
 const name=`Polish Synthetic ${String(i).padStart(4,'0')}`;
 return {id:`polish-${i}`,type:'injection',status:'draft',createdAt:'2026-10-01T09:00:00-07:00',updatedAt:'2026-10-01T09:05:00-07:00',completedAt:'',patient:{name,dob:'01/02/1990'},summary:`Synthetic product ${i}`,
 snapshot:{version:4,medKey:'other',state:{customMedication:`Synthetic product ${i}`},initiation:{},smartVitals:{},disposition:{},fields:{ptName:name,ptDOB:'01/02/1990',adminDate:'2026-10-01'},safetyNone:false,note:{cc:'',as:'',pl:''}},addenda:[]};
}
async function boot(page,width=1440,records=[]){
 await page.setViewportSize({width,height:width===800?600:width===1024?768:900});
 await page.clock.install({time:new Date('2026-10-01T10:00:00-07:00')});
 if(records.length)await page.addInitScript(({key,records})=>localStorage.setItem(key,JSON.stringify(records)),{key:KEY,records});
 await page.goto('/');await page.waitForFunction(()=>document.body.dataset.applicationReady==='true');
}
async function shot(page,info,name){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});}
async function alignment(page){
 const groups=await page.locator('.wfp-row').evaluateAll(rows=>rows.filter(r=>r.getBoundingClientRect().height>0).flatMap(r=>{
  const sameLine=new Map();
  for(const field of r.querySelectorAll(':scope > .wfp-field')){
   const label=field.querySelector('.wfp-field-label');const control=field.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
   if(!label||!control)continue;
   const l=label.getBoundingClientRect(),c=control.getBoundingClientRect();if(!l.height||!c.height)continue;
   const key=Math.round(l.top*2)/2;const item=sameLine.get(key)||[];item.push({name:field.dataset.fieldLabel,y:c.top});sameLine.set(key,item);
  }
  return [...sameLine.values()].filter(items=>items.length>1);
 }));
 expect(groups.length).toBeGreaterThan(0);
 for(const group of groups){const ys=group.map(x=>x.y);expect(Math.max(...ys)-Math.min(...ys),JSON.stringify(group)).toBeLessThanOrEqual(.5);}
}
for(const width of [1440,1024,800]){
 test(`precision alignment and stable disclosure layout at ${width}`,async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,width);
  await shot(page,info,'01-worklist');await clickWorkspace(page,'.cd2004-nav-item[title="Injection"]');
  await page.locator('[data-field-path="patient.name"] input').fill('Polish review, Synthetic');
  await page.locator('[data-field-path="patient.dob"] input').fill('01/02/1990');
  await page.locator('[name="inj-medication"]').selectOption('maintena');
  await page.locator('[data-injection-save]').click();await page.clock.runFor(4500);
  await alignment(page);
  await expect(page.locator('[data-injection-finish]')).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await shot(page,info,'02-injection-aligned');
  const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
  for(let i=0;i<12;i++){
   await page.getByRole('button',{name:'Preview',exact:true}).click();
   await page.getByRole('button',{name:'Details',exact:true}).click();
  }
  await expect(page.locator('.wfp-panel')).toHaveCount(1);
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(before);
  await alignment(page);expect(errors).toEqual([]);
 });
}
for(const [label,id]of[['UDS','uds'],['Samples','samples'],['Forms','forms']]){
 test(`${label} typography and control rows at both working sizes`,async({page},info)=>{
  await boot(page);await clickWorkspace(page,`.cd2004-nav-item[title="${label}"]`);
  for(const width of [1440,800]){
   await page.setViewportSize({width,height:width===800?600:900});
   await expect(page.locator('.wfp-panel')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   await shot(page,info,`${id}-${width}`);
  }
 });
}
test('large local record list keeps all results, unique names and current reloads',async({page},info)=>{
 await boot(page,1440,Array.from({length:300},(_,i)=>record(i)));
 const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
 const open=page.getByRole('button',{name:'Open saved notes (F11)'});await open.click();
 const rows=page.locator('.records-drawer [data-records-open]');await expect(rows).toHaveCount(300);
 const labels=await rows.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));expect(new Set(labels).size).toBe(300);
 const input=page.locator('#recordsDrawerSearch');
 await input.fill('0299');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('0299');
 await input.fill('unmatched synthetic');await expect(rows).toHaveCount(0);
 await page.getByRole('button',{name:'Clear search & filters'}).click();await expect(rows).toHaveCount(300);
 expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(before);
 await shot(page,info,'large-record-list');await page.keyboard.press('Escape');
 await page.evaluate(key=>{const records=JSON.parse(localStorage.getItem(key));records[299].patient.name='Polish renamed synthetic';records[299].snapshot.fields.ptName='Polish renamed synthetic';localStorage.setItem(key,JSON.stringify(records));},KEY);
 await open.click();await input.fill('renamed');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('renamed');
});
test('patient search preserves composition and closes when keyboard focus leaves',async({page})=>{
 await boot(page,1440,[record(1),record(2)]);
 const input=page.locator('[data-patient-search] input');await input.fill('Polish');
 await expect(page.locator('[data-patient-result]')).toHaveCount(2);
 await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});
 await expect(page.locator('[data-patient-result]')).toHaveCount(2);
 await expect(page.locator('[data-patient-notes]')).toHaveCount(0);
 await page.keyboard.press('Tab');await expect(page.locator('.tebra-patient-search-results')).toHaveCount(0);
 await input.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(page.locator('[data-patient-search] input')).toHaveValue('');
 await expect(page.locator('.tebra-facesheet-banner')).toContainText('Polish Synthetic 0002');
});
