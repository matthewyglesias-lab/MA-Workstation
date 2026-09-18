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
module.exports = { clickWorkspace };
