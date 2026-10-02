/** Navigate through the same visible service chooser staff use. */
async function clickWorkspace(page, selector) {
  const title = /title="([^"]+)"/.exec(selector)?.[1];
  if (!title) throw new Error(`A titled workspace selector is required: ${selector}`);
  if (["Injection", "UDS", "Samples", "Forms"].includes(title)) {
    if (!(await page.locator('.lf-service-dialog[open]').count())) {
      await page.locator('.lf-document-action').click();
    }
  } else if (["Reference", "Daily Closeout", "Future / TMS"].includes(title)) {
    if (!(await page.locator('.lf-tools-navigation').getAttribute('open') !== null)) {
      await page.locator('.lf-tools-navigation > summary').click();
    }
  }
  await page.locator(selector).click();
}
/** Open real progressive-disclosure controls; never force-click hidden actions. */
async function openRecordActions(page) {
  const shelf = page.locator('.cd2004-record-actions .lf-record-shelf');
  if (await shelf.getAttribute('open') === null) await shelf.locator(':scope > summary').click();
}
async function openWorkspaceOptions(page) {
  const shelf = page.locator('.lf-workspace-shelf');
  if (await shelf.getAttribute('open') === null) await shelf.locator(':scope > summary').click();
}
module.exports = { clickWorkspace, openRecordActions, openWorkspaceOptions };
