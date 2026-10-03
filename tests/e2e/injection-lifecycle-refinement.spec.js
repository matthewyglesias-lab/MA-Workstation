const {test,expect}=require('@playwright/test');
const {prepareRefinementInjection}=require('./refinement-fixture');
const {openWorkspaceOptions}=require('./workspace-navigation');
const key='ipmgMedAssistInjectionRecordsV1';
async function staff(page){
  await page.locator('.tebra-account-trigger').click();await page.locator('[data-account-action="staff"]').click();
  const d=page.getByRole('dialog',{name:'Documenting staff'});await d.getByRole('textbox',{name:'Name or initials'}).fill('Synthetic Staff, MA');await d.getByRole('button',{name:'Use for encounter',exact:true}).click();
}
async function focus(page){await openWorkspaceOptions(page);await page.getByRole('button',{name:'Open focused injection workspace',exact:true}).click();}
async function signature(page){await page.locator('[data-injection-finish]').click();const d=page.getByRole('dialog',{name:'Sign',exact:true});await d.getByRole('checkbox',{name:/I reviewed this note/}).check();await d.getByRole('button',{name:'Sign',exact:true}).click();return d;}
async function stored(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);}

test('failed draft and signature writes preserve the right record and expose honest retry states',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
  await page.addInitScript(key=>{
    const native=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
      if(k===key && (window.__rejectRecordWrites || (window.__rejectSignWrites && JSON.parse(v).some(record=>record.status==='completed'))))
        throw new DOMException('Synthetic storage failure','QuotaExceededError');
      return native.call(this,k,v);
    };
  },key);
  await page.goto('/');const panel=await prepareRefinementInjection(page);await staff(page);await focus(page);
  await page.keyboard.press('Control+s');const original=(await stored(page))[0];
  await page.locator('.kiosk-stepper [data-kiosk-step=sign]').click();
  const appointment=panel.locator('[data-avs-appointment-editor]');await appointment.locator('summary').click();await appointment.getByLabel('Appointment reminder format').selectOption('details');
  await page.evaluate(()=>window.__rejectRecordWrites=true);
  await appointment.getByLabel('Appointment provider',{exact:true}).fill('Unsaved synthetic appointment');await page.keyboard.press('Control+s');
  await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Save failed');
  await expect(page.locator('.kiosk-checklist .lf-progress-heading')).not.toContainText('Ready to sign');
  await expect(page.locator('[data-injection-finish]')).toBeEnabled();
  await expect(page.locator('.kiosk-stepper [data-kiosk-step=sign]')).toContainText('Retry signing');
  await expect(page.locator('[data-kiosk-completion]')).toHaveCount(0);
  expect((await stored(page))[0].snapshot.documentation.typedEncounterV1.avsAppointment.provider).not.toBe('Unsaved synthetic appointment');
  await expect(appointment.getByLabel('Appointment provider',{exact:true})).toHaveValue('Unsaved synthetic appointment');
  await page.evaluate(()=>window.__rejectRecordWrites=false);await page.keyboard.press('Control+s');
  await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Saved locally');
  const saved=await stored(page);expect(saved).toHaveLength(1);expect(saved[0].id).toBe(original.id);expect(saved[0].snapshot.documentation.typedEncounterV1.avsAppointment.provider).toBe('Unsaved synthetic appointment');
  await page.evaluate(()=>window.__rejectSignWrites=true);const dialog=await signature(page);
  await expect(dialog).toBeVisible();await expect(dialog.locator('[role=alert]')).toBeVisible();
  expect((await stored(page))[0].status).toBe('draft');expect((await stored(page))[0].attestation).toBeUndefined();await expect(page.locator('[data-kiosk-completion]')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Back to editing',exact:true}).click();
  await page.evaluate(()=>window.__rejectSignWrites=false);await page.keyboard.press('Control+s');await signature(page);
  await expect(page.locator('[data-kiosk-completion]')).toBeVisible();const signed=await stored(page);expect(signed).toHaveLength(1);expect(signed[0].id).toBe(original.id);expect(signed[0].status).toBe('completed');expect(signed[0].attestation.staff).toBe('Synthetic Staff, MA');
});

for(const viewport of [{width:1440,height:900},{width:800,height:600}]) {
  test(`one inert signed outcome, denied output and Next exactly once at ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.clock.setFixedTime(new Date('2026-10-02T16:00:00Z'));
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{
        window.__copiedNote=value;
        if(window.__delayCopy) return new Promise(resolve=>window.__resolveCopy=resolve);
        throw new DOMException('Synthetic clipboard denial','NotAllowedError');
      }}});
      const native=document.execCommand.bind(document);document.execCommand=(command,...args)=>command==='copy'?false:native(command,...args);
    });
    await page.goto('/');const panel=await prepareRefinementInjection(page);await staff(page);await focus(page);await signature(page);
    const completion=page.locator('[data-kiosk-completion]');await expect(completion).toHaveCount(1);await expect(completion).toBeFocused();
    await expect(page.locator('#cd2004-pane-work')).toHaveAttribute('inert','');await expect(page.locator('#cd2004-pane-work')).toHaveAttribute('aria-hidden','true');
    await expect(page.locator('.kiosk-stepper [data-kiosk-step]')).toHaveCount(7);for(const item of await page.locator('.kiosk-stepper [data-kiosk-step]').all()) await expect(item).toBeDisabled();
    await expect(page.locator('.kiosk-checklist .lf-progress-heading')).toContainText('Signed locally');await expect(page.locator('.kiosk-checklist')).not.toContainText('Ready to sign');
    const historical=(await stored(page))[0];
    const exact=await page.evaluate(()=>[window._note.cc,window._note.as,window._note.pl].join('\n\n────────────────────────────────\n\n'));
    await completion.getByRole('button',{name:'Copy note',exact:true}).click();await expect(completion.getByRole('button',{name:'Copy blocked',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.__copiedNote)).toBe(exact);
    // A native dialog request/return does not prove physical printing or filing.
    await page.evaluate(()=>{window.__ipmgNativePrintCalls=0;window.__ipmgNativePrint=()=>window.__ipmgNativePrintCalls++;window.cleanPrintClasses=()=>{};});
    await completion.getByRole('button',{name:'Print patient handout',exact:true}).click();
    expect(await page.evaluate(()=>window.__ipmgNativePrintCalls)).toBe(1);
    await expect(completion).toContainText('Injection note signed');
    expect((await stored(page))[0]).toEqual(historical);
    await page.evaluate(()=>{document.body.classList.remove('print-avs');window.__delayCopy=true;});
    await completion.getByRole('button',{name:'Copy blocked',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>typeof window.__resolveCopy)).toBe('function');
    const generation=await page.evaluate(()=>window.ipmgInjectionRecordGeneration());
    await completion.getByRole('button',{name:'Start next patient',exact:true}).dblclick();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await expect(completion).toHaveCount(0);expect(await page.evaluate(()=>window.ipmgInjectionRecordGeneration())).toBe(generation+1);
    await page.evaluate(()=>window.__resolveCopy());
    await expect(page.locator('.kiosk-copy-feedback')).toHaveCount(0);
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');await expect(panel.locator('input[placeholder="MM/DD/YYYY"]')).toHaveValue('');
    expect((await stored(page)).find(record=>record.id===historical.id)).toEqual(historical);
    await expect(panel.locator('.wfp-invalidation-receipt')).toHaveCount(0);await expect(page.locator('.kiosk-stepper li[data-step-state=complete]')).toHaveCount(0);
    await page.locator('.kiosk-stepper [data-kiosk-step=response]').click();await expect(panel.getByRole('button',{name:/Additional note items/})).toHaveAttribute('aria-expanded','false');await expect(panel.locator('[data-avs-appointment-editor] summary')).toContainText('Space to write in');
  });
}
