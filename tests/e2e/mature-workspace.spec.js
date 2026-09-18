const { test, expect } = require('@playwright/test');
const { clickWorkspace } = require('./workspace-navigation');

const service = (page, label) => clickWorkspace(page, `.cd2004-nav-item[title="${label}"]`);
const preview = page => page.getByRole('button', { name: 'Preview', exact: true });
const details = page => page.getByRole('button', { name: 'Details', exact: true });

for (const size of [{width:1440,height:900},{width:1024,height:768},{width:800,height:600}]) {
  test(`entry and preview are two views of the same draft at ${size.width}x${size.height}`, async ({page}) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await service(page, 'Injection');
    const panel = page.locator('.wfp-panel');
    const name = panel.locator('input[placeholder="Last, First"]');
    await name.fill('Workspace QA, Synthetic');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await page.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
    const before = await page.evaluate(() => localStorage.getItem('ipmgMedAssistInjectionRecordsV1'));
    await expect(page.locator('#lf-document-preview')).toBeHidden();
    await preview(page).click();
    await expect(page.locator('#lf-document-preview')).toBeVisible();
    await expect(page.locator('#lf-document-preview')).toContainText('Workspace QA, Synthetic');
    await expect(panel).toHaveCount(1);
    if (size.width < 1180) await expect(panel).toBeHidden();
    else await expect(panel).toBeVisible();
    const box = await page.locator('#lf-document-preview').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);
    expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
    await details(page).click();
    await expect(name).toHaveValue('Workspace QA, Synthetic');
    await expect(name).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ipmgMedAssistInjectionRecordsV1'))).toBe(before);
    await expect(page.locator('[data-injection-record-actions]')).toBeVisible();
    const actions = await page.locator('[data-injection-record-actions]').boundingBox();
    expect(actions.y+actions.height).toBeLessThanOrEqual(size.height+1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Alt+1');
    await expect(page.locator('.cd2004-patient-banner')).toHaveCount(0);
    await expect(page.locator('.lf-work-table')).toContainText('Workspace QA, Synthetic');
    await expect(page.locator('.lf-table-date')).not.toHaveText('IM');
  });
}

test('cancelling service selection neither creates nor clears an encounter', async ({page}) => {
  await page.goto('/');
  await service(page, 'Injection');
  const name = page.locator('.wfp-panel input[placeholder="Last, First"]');
  await name.fill('Keep this draft, Synthetic');
  await page.getByRole('button', {name:/Change service/}).click();
  const dialog = page.getByRole('dialog',{name:'Document a service'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-service-open]')).toHaveCount(4);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.lf-command-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Change service/})).toBeFocused();
  await expect(name).toHaveValue('Keep this draft, Synthetic');
  await expect(page.locator('#lf-workstation')).toHaveAttribute('data-active-workflow','administer');
});

for (const [label,id] of [['UDS','uds'],['Samples','samples'],['Forms','forms']]) {
  test(`${label} has its own working form and opt-in documentation, not a duplicate editor`, async ({page}) => {
    await page.goto('/');
    await service(page,label);
    await expect(page.locator('#lf-workstation')).toHaveAttribute('data-active-workflow',id);
    await expect(page.locator('.wfp-panel')).toHaveCount(1);
    await expect(page.locator('#lf-document-preview')).toBeHidden();
    await preview(page).click();
    await expect(page.locator('#lf-document-preview')).toBeVisible();
    await details(page).click();
    await expect(page.locator('.wfp-panel')).toBeVisible();
    await expect(page.locator('.wfp-panel')).toHaveCount(1);
    await page.keyboard.press('Alt+1');
    await expect(page.getByRole('heading',{name:'Worklist',exact:true})).toBeVisible();
  });
}
