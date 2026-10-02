const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');
const open = (page, name) => clickWorkspace(page, `.cd2004-nav-item[title="${name}"]`);
const boot = async page => { await page.goto('/'); await page.waitForFunction(() => document.body.dataset.applicationReady === 'true'); };

for (const [name, workflow] of [['Forms','forms'],['Samples','samples']]) {
  test(`${name} retains exact unfinished values across navigation and reload`, async ({page},info)=>{
    await boot(page);await open(page,name);
    const patient=page.getByRole('textbox',{name:'Patient name',exact:true});
    await patient.fill('Recovery, Synthetic');
    await page.getByRole('textbox',{name:'DOB',exact:true}).fill('01/02/1990');
    await expect(page.locator('.lf-recovery-notice')).toContainText('Draft retained for this tab');
    const bytes=await page.evaluate(w=>sessionStorage.getItem(`ipmg.tab-recovery.${w}.v1`),workflow);
    expect(JSON.parse(bytes).encounter.patient).toEqual({name:'Recovery, Synthetic',dob:'01/02/1990'});
    await open(page,'Dashboard');
    const resume=page.locator(`[data-worklist-open="session:${workflow}"]`);
    await expect(resume).toBeVisible();await resume.click();
    await expect(patient).toHaveValue('Recovery, Synthetic');
    let prompts=0;page.on('dialog',async d=>{prompts++;await d.dismiss();});
    await page.reload();await page.waitForFunction(()=>document.body.dataset.applicationReady==='true');
    await open(page,name);await expect(patient).toHaveValue('Recovery, Synthetic');
    expect(prompts).toBe(0);
    expect(await page.evaluate(w=>sessionStorage.getItem(`ipmg.tab-recovery.${w}.v1`),workflow)).toBe(bytes);
    await page.getByRole('button',{name:'Preview',exact:true}).click();
    await expect(page.locator('#lf-document-preview')).toContainText('Recovery, Synthetic');
    await expect(page.locator('#lf-document-preview .lf-note-boundary')).toContainText('Copying does not file it');
    await page.screenshot({path:info.outputPath(`${workflow}-recovered-preview.png`)});
  });
}

test('failed recovery leaves entered work visible and warns before reload',async({page})=>{
  await boot(page);await open(page,'Forms');
  await page.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('ipmg.tab-recovery.'))throw new DOMException('Full','QuotaExceededError');return old.call(this,k,v);};});
  const patient=page.getByRole('textbox',{name:'Patient name',exact:true});await patient.fill('Keep open, Synthetic');
  await expect(page.locator('.lf-recovery-notice[role=alert]')).toContainText('Reload recovery unavailable');
  await open(page,'Dashboard');await page.locator('[data-worklist-open="session:forms"]').click();
  await expect(patient).toHaveValue('Keep open, Synthetic');
  const dialog=page.waitForEvent('dialog');const reload=page.reload().catch(()=>{});const warning=await dialog;
  expect(warning.type()).toBe('beforeunload');await warning.dismiss();await reload;
  await expect(patient).toHaveValue('Keep open, Synthetic');
});

test('malformed recovery is never silently replaced',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('ipmg.tab-recovery.forms.v1','{broken'));
  await boot(page);await open(page,'Forms');
  await page.getByRole('textbox',{name:'Patient name',exact:true}).fill('New entry, Synthetic');
  await expect(page.locator('.lf-recovery-notice')).toContainText('Reload recovery unavailable');
  expect(await page.evaluate(()=>sessionStorage.getItem('ipmg.tab-recovery.forms.v1'))).toBe('{broken');
});

test('signed local record never claims a Tebra filing',async({page})=>{
  const record={id:'clinic-first-signed',type:'injection',status:'completed',createdAt:'2026-10-01T09:00:00-07:00',updatedAt:'2026-10-01T09:05:00-07:00',completedAt:'2026-10-01T09:05:00-07:00',patient:{name:'Signed, Synthetic',dob:'01/02/1990'},summary:'Synthetic medication',snapshot:{version:4,medKey:'maintena',state:{dose:'400 mg',route:'IM',site:'Left deltoid'},initiation:{},smartVitals:{},disposition:{},fields:{ptName:'Signed, Synthetic',ptDOB:'01/02/1990',adminDate:'2026-10-01'},safetyNone:false,note:{cc:'',as:'',pl:''}},addenda:[]};
  await page.addInitScript(r=>localStorage.setItem('ipmgMedAssistInjectionRecordsV1',JSON.stringify([r])),record);
  await boot(page);await page.getByRole('button',{name:'Open saved notes (F11)'}).click();
  await page.locator('[data-records-open]').first().click();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('.cd2004-note-mark')).toHaveText('Signed locally');
  await expect(page.locator('.lf-note-boundary')).toContainText('Confirm the final note separately in Tebra');
  await expect(page.locator('#lf-document-preview')).not.toContainText('FILED');
});

test('UDS report preview does not invent a reported time',async({page},info)=>{
  await boot(page);await open(page,'UDS');
  const panel=page.locator('.wfp-panel');
  await panel.getByRole('textbox',{name:'Patient name',exact:true}).fill('Report, Synthetic');
  await panel.getByRole('button',{name:'Use current date/time'}).click();
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  const disclosure=panel.locator('.wfp-report-preview');if(await disclosure.getAttribute('open')===null)await disclosure.locator('summary').click();
  const report=page.getByRole('region',{name:'UDS clinician laboratory report preview'});
  await expect(report).toContainText('Inland Psychiatric Medical Group');
  await expect(report.locator('div',{has:page.locator('dt',{hasText:'Report time'})})).toContainText('Not documented');
  await expect(report).not.toContainText('POC-UDS / OPEN');
  await page.screenshot({path:info.outputPath('uds-report-preview.png')});
});

test('unavailable TMS never offers a fictional completed note',async({page})=>{
  await boot(page);await open(page,'Future / TMS');
  await expect(page.locator('.wfp-panel')).toContainText('Document the session in Tebra');
  await expect(page.locator('.wfp-panel')).not.toContainText('session completed');
});


test('new injection facts remain unconfirmed through medication selection',async({page})=>{
  await boot(page);await open(page,'Injection');
  const panel=page.locator('.wfp-panel');
  await panel.getByRole('textbox',{name:'Patient name',exact:true}).fill('Unconfirmed, Synthetic');
  await panel.locator('[name="inj-medication"]').selectOption('maintena');
  await panel.getByRole('tab',{name:'Administration',exact:true}).click();
  await expect(panel.locator('input[placeholder*="allergy / ADR status"]')).toHaveValue('');
  for(const name of ['Two-identifier ID','Medication ‘rights’','Allergies reviewed','Consent reaffirmed','No contraindications','Aseptic technique'])
    await expect(panel.getByRole('checkbox',{name:new RegExp(name)})).not.toBeChecked();
  await panel.getByRole('tab',{name:'Review',exact:true}).click();
  await expect(panel.locator('[name="inj-response"]')).toHaveValue('');
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(page.locator('#lf-document-preview')).not.toContainText(/NKDA|tolerated well|Consent.*obtained/);
});
