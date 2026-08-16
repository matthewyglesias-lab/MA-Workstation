const { test, expect } = require('@playwright/test');

const WORKFLOWS = [
  { title: 'Injection', selector: '[data-workflow="administer"]' },
  { title: 'UDS', selector: '[data-workflow="uds"]' },
  { title: 'Samples', selector: '[data-workflow="samples"]' },
  { title: 'Forms', selector: '[data-workflow="forms"]' }
];

async function openWorkflow(page, title, selector) {
  await page.locator(`.cd2004-nav-item[title="${title}"]`).click();
  await expect(page.locator(`.cd2004-workflow-slot${selector}`)).toBeVisible();
}

test.describe('MEDITECH screen contract', () => {
  test('keeps common workstation surfaces in one palette and control grammar', async ({ page }) => {
    await page.goto('/');

    const home = await page.evaluate(() => {
      const launcher = document.querySelector('.cd2004-launcher-tile');
      const nav = document.querySelector('button.cd2004-nav-item');
      return {
        launcherGradient: getComputedStyle(launcher).backgroundImage,
        navRadius: getComputedStyle(nav).borderRadius,
        navFont: getComputedStyle(nav).fontFamily
      };
    });
    expect(home.launcherGradient).toBe('none');
    expect(home.navRadius).toBe('0px');
    expect(home.navFont.toLowerCase()).toMatch(/^tahoma/);

    for (const workflow of WORKFLOWS) {
      await openWorkflow(page, workflow.title, workflow.selector);
      const contract = await page.evaluate(() => {
        const panel = document.querySelector('.wfp-panel');
        const tabbar = document.querySelector('.wfp-tabbar');
        const lookup = document.querySelector('.wfp-field-lookup-button');
        const style = element => {
          const computed = getComputedStyle(element);
          return {
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage,
            borderRadius: computed.borderRadius,
            fontFamily: computed.fontFamily
          };
        };
        return {
          panel: style(panel),
          tabbar: style(tabbar),
          lookup: lookup ? style(lookup) : null,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });

      expect(contract.panel.backgroundColor).toBe('rgb(248, 248, 254)');
      expect(contract.tabbar.backgroundColor).toBe('rgb(201, 204, 227)');
      expect(contract.panel.fontFamily.toLowerCase()).toMatch(/^tahoma/);
      expect(contract.horizontalOverflow).toBeLessThanOrEqual(1);
      if (contract.lookup) {
        expect(contract.lookup.backgroundImage).toBe('none');
        expect(contract.lookup.borderRadius).toBe('0px');
      }
    }
  });

  test('preserves fixed transaction chrome without overflow at 800 by 600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');

    for (const workflow of WORKFLOWS.slice(0, 2)) {
      await openWorkflow(page, workflow.title, workflow.selector);
      const layout = await page.evaluate(() => {
        const chrome = document.querySelector('.wfp-transaction-chrome');
        const page = document.querySelector('.wfp-transaction-page');
        const panel = document.querySelector('.wfp-panel');
        return {
          chromeHeight: chrome?.getBoundingClientRect().height ?? 0,
          pageHeight: page?.getBoundingClientRect().height ?? 0,
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth
        };
      });

      expect(layout.chromeHeight).toBeGreaterThan(0);
      expect(layout.pageHeight).toBeGreaterThan(0);
      expect(layout.documentOverflow).toBeLessThanOrEqual(1);
      expect(layout.panelOverflow).toBeLessThanOrEqual(1);
    }
  });
});
