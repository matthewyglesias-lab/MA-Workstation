const { test, expect } = require('@playwright/test');

// Replaces meditech-screen-contract.spec.js. Same job — hold every common
// workstation surface to ONE palette and ONE control grammar so component
// import order cannot produce a second visual language — but the grammar it
// asserts is now Tebra's: a soft radius, a hairline border, no bezel, and the
// teal token palette. The 800x600 overflow guard is carried over unchanged;
// it is a layout contract, not a visual one.

const WORKFLOWS = [
  { title: 'Injection', selector: '[data-workflow="administer"]' },
  { title: 'UDS', selector: '[data-workflow="uds"]' },
  { title: 'Samples', selector: '[data-workflow="samples"]' },
  { title: 'Forms', selector: '[data-workflow="forms"]' }
];

// Token values from src/presentation/tebra-tokens.css, as rendered rgb().
const TEAL_900 = 'rgb(0, 58, 67)';
const HEADER_TEAL = 'rgb(0, 72, 82)';
const MINT_50 = 'rgb(246, 248, 248)';
const CORAL_500 = 'rgb(255, 141, 110)';
const WHITE = 'rgb(255, 255, 255)';

async function openWorkflow(page, title, selector) {
  await page.locator(`.cd2004-nav-item[title="${title}"]`).click();
  await expect(page.locator(`.cd2004-workflow-slot${selector}`)).toBeVisible();
}

test.describe('Tebra screen contract', () => {
  test('keeps common workstation surfaces in one palette and control grammar', async ({ page }) => {
    await page.goto('/');

    const home = await page.evaluate(() => {
      const primaryAction = document.querySelector('.cd2004-worklist-new');
      const nav = document.querySelector('button.cd2004-nav-item');
      const appHeader = document.querySelector('.tebra-app-header-main');
      const sectionRail = document.querySelector('.tebra-section-rail');
      const workWindow = document.querySelector('.cd2004-work-window');
      const workTitlebar = workWindow?.querySelector(':scope > .cd2004-window-titlebar');
      return {
        primaryActionGradient: getComputedStyle(primaryAction).backgroundImage,
        primaryActionRelief: getComputedStyle(primaryAction).boxShadow,
        retiredLauncherCount: document.querySelectorAll('.cd2004-launcher-tile').length,
        navRadius: getComputedStyle(nav).borderRadius,
        navFont: getComputedStyle(nav).fontFamily,
        appHeaderBackground: getComputedStyle(appHeader).backgroundColor,
        appHeaderGradient: getComputedStyle(appHeader).backgroundImage,
        sectionRailBackground: getComputedStyle(sectionRail).backgroundColor,
        sectionRailRadius: getComputedStyle(sectionRail).borderRadius,
        workWindowBackground: getComputedStyle(workWindow).backgroundColor,
        workWindowRadius: getComputedStyle(workWindow).borderRadius,
        workTitlebarColor: getComputedStyle(workTitlebar).color,
        workTitlebarGradient: getComputedStyle(workTitlebar).backgroundImage
      };
    });
    // No gradients and no raised/sunken bezel: those are the client/server tell.
    expect(home.primaryActionGradient).toBe('none');
    expect(home.primaryActionRelief).toBe('none');
    expect(home.retiredLauncherCount).toBe(0);
    // Chart rows use the repository's 8px product-control adaptation; the
    // measured rail itself stays square and flush to the workspace edge.
    expect(home.navRadius).toBe('8px');
    expect(home.navFont).toMatch(/^"Inter Variable"/);
    // The measured shell uses a dark product header, a flush white rail, and
    // an elevated radius-4 work panel. The
    // Notes-specific table/list grammar remains deliberately unasserted until
    // Phase 3 lands its dedicated components.
    expect(home.appHeaderBackground).toBe(HEADER_TEAL);
    expect(home.appHeaderGradient).toBe('none');
    expect(home.sectionRailBackground).toBe(WHITE);
    expect(home.sectionRailRadius).toBe('0px');
    expect(home.workWindowBackground).toBe(WHITE);
    expect(home.workWindowRadius).toBe('4px');
    expect(home.workTitlebarColor).toBe(TEAL_900);
    expect(home.workTitlebarGradient).toBe('none');

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
            boxShadow: computed.boxShadow,
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

      // Worksheets are white paper on a sunken mint tab strip.
      expect(contract.panel.backgroundColor).toBe(WHITE);
      expect(contract.tabbar.backgroundColor).toBe(MINT_50);
      expect(contract.panel.fontFamily).toMatch(/^"Inter Variable"/);
      expect(contract.horizontalOverflow).toBeLessThanOrEqual(1);
      if (contract.lookup) {
        expect(contract.lookup.backgroundImage).toBe('none');
        expect(contract.lookup.boxShadow).toBe('none');
        expect(contract.lookup.borderRadius).toBe('6px');
      }
    }
  });

  test('reserves coral for the primary action and never for clinical status', async ({ page }) => {
    await page.goto('/');
    // Coral is Tebra's accent and sits close to a clinical warning hue, so the
    // redesign reserves it for the single primary action per screen. A status
    // surface painted coral would be the regression this guards against.
    await expect(page.locator('.cd2004-worklist-new')).toHaveCSS(
      'background-color',
      CORAL_500
    );
    await openWorkflow(page, 'Injection', '[data-workflow="administer"]');
    const statusContract = await page.evaluate(() => {
      const coral = ['rgb(255, 141, 110)', 'rgb(243, 126, 94)', 'rgb(254, 195, 184)'];
      const statusSelectors = [
        '.cd2004-readiness-verdict', '.cd2004-readiness-item',
        '.wfp-result-cycle', '.wfp-exception-line', '.cd2004-note-mark'
      ];
      const offenders = [];
      let matchedStatusCount = 0;
      for (const selector of statusSelectors) {
        for (const node of document.querySelectorAll(selector)) {
          matchedStatusCount += 1;
          const s = getComputedStyle(node);
          if (coral.includes(s.backgroundColor) || coral.includes(s.color)) {
            offenders.push(`${selector} -> ${s.backgroundColor} / ${s.color}`);
          }
        }
      }
      return { matchedStatusCount, offenders };
    });
    expect(statusContract.matchedStatusCount).toBeGreaterThan(0);
    expect(statusContract.offenders).toEqual([]);
  });

  test('preserves fixed transaction chrome without overflow at 800 by 600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');

    for (const workflow of WORKFLOWS.slice(0, 2)) {
      await openWorkflow(page, workflow.title, workflow.selector);
      const layout = await page.evaluate(() => {
        const chrome = document.querySelector('.wfp-transaction-chrome');
        const clinicalPage = document.querySelector('.wfp-transaction-page');
        const panel = document.querySelector('.wfp-panel');
        const pageRect = clinicalPage?.getBoundingClientRect();
        const panelRect = panel?.getBoundingClientRect();
        return {
          chromeHeight: chrome?.getBoundingClientRect().height ?? 0,
          pageHeight: pageRect?.height ?? 0,
          visiblePageHeight: pageRect && panelRect
            ? Math.max(0, Math.min(pageRect.bottom, panelRect.bottom) - Math.max(pageRect.top, panelRect.top))
            : 0,
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth
        };
      });

      expect(layout.chromeHeight).toBeGreaterThan(0);
      expect(layout.pageHeight).toBeGreaterThanOrEqual(40);
      expect(layout.visiblePageHeight).toBeGreaterThanOrEqual(40);
      expect(layout.documentOverflow).toBeLessThanOrEqual(1);
      expect(layout.panelOverflow).toBeLessThanOrEqual(1);

      const lifecycleAction = page.locator(
        '.cd2004-record-actions-buttons button:not(:disabled)'
      ).first();
      await lifecycleAction.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(lifecycleAction).toBeFocused();
      await expect(lifecycleAction).toHaveCSS('outline-style', 'solid');
      expect(await lifecycleAction.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).outlineWidth)
      )).toBeGreaterThanOrEqual(2);
      await expect(lifecycleAction).toHaveCSS('outline-offset', '-2px');

      const lifecycleDetail = page.locator(
        '.cd2004-record-actions-state > small[role="status"]'
      );
      await expect(lifecycleDetail).toHaveAttribute('tabindex', '0');
      await lifecycleDetail.focus();
      await expect(lifecycleDetail).toHaveCSS('position', 'absolute');
      await expect(lifecycleDetail).toHaveCSS('white-space', 'normal');
      expect(await lifecycleDetail.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const slotRect = node.closest('.cd2004-workflow-slot')?.getBoundingClientRect();
        return Boolean(
          slotRect &&
          rect.top >= slotRect.top &&
          rect.bottom <= slotRect.bottom &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        );
      })).toBe(true);
    }
  });

  test('keeps the Injection clinical page visibly reachable across short desktop sizes', async ({ page }) => {
    for (const viewport of [
      { width: 840, height: 600 },
      { width: 919, height: 600 },
      { width: 920, height: 600 },
      { width: 1024, height: 600 },
      { width: 1179, height: 600 },
      { width: 1180, height: 600 },
      { width: 1280, height: 600 },
      { width: 1440, height: 600 },
      { width: 1024, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await openWorkflow(page, 'Injection', '[data-workflow="administer"]');

      const layout = await page.evaluate(() => {
        const clinicalPage = document.querySelector('.wfp-transaction-page');
        const panel = document.querySelector('.wfp-panel');
        const inspector = document.querySelector('.cd2004-document-split .cd2004-inspector-window');
        const pageRect = clinicalPage?.getBoundingClientRect();
        const panelRect = panel?.getBoundingClientRect();
        return {
          visiblePageHeight: pageRect && panelRect
            ? Math.max(0, Math.min(pageRect.bottom, panelRect.bottom) - Math.max(pageRect.top, panelRect.top))
            : 0,
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          inspectorOverflow: inspector
            ? inspector.scrollWidth - inspector.clientWidth
            : Number.POSITIVE_INFINITY
        };
      });

      const size = `${viewport.width}x${viewport.height}`;
      expect(layout.visiblePageHeight, `${size} Injection clinical viewport`).toBeGreaterThanOrEqual(40);
      expect(layout.documentOverflow).toBeLessThanOrEqual(1);
      expect(layout.panelOverflow).toBeLessThanOrEqual(1);
      expect(layout.inspectorOverflow).toBeLessThanOrEqual(1);
    }
  });

  test('keeps lifecycle actions clear of status detail at tall desktop widths', async ({ page }) => {
    for (const width of [920, 1181, 1280, 1366, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await openWorkflow(page, 'Injection', '[data-workflow="administer"]');

      const overlapCount = await page.evaluate(() => {
        const detail = document.querySelector('.cd2004-record-actions-state > small');
        if (!detail) return Number.POSITIVE_INFINITY;
        const detailRect = detail.getBoundingClientRect();
        return [...document.querySelectorAll('.cd2004-record-actions-buttons button')]
          .filter((button) => {
            const buttonRect = button.getBoundingClientRect();
            return (
              Math.min(detailRect.right, buttonRect.right) > Math.max(detailRect.left, buttonRect.left) &&
              Math.min(detailRect.bottom, buttonRect.bottom) > Math.max(detailRect.top, buttonRect.top)
            );
          }).length;
      });

      expect(overlapCount, `${width}x900 lifecycle detail/button overlap`).toBe(0);
    }
  });

  test('keeps the UDS clinical page usable across short desktop widths', async ({ page }) => {
    for (const width of [840, 920, 1024, 1179]) {
      await page.setViewportSize({ width, height: 600 });
      await page.goto('/');
      await openWorkflow(page, 'UDS', '[data-workflow="uds"]');

      const layout = await page.evaluate(() => {
        const clinicalPage = document.querySelector('.wfp-transaction-page');
        const panel = document.querySelector('.wfp-panel');
        const disclaimer = clinicalPage?.querySelector(':scope > .wfp-field-hint');
        const pageRect = clinicalPage?.getBoundingClientRect();
        const panelRect = panel?.getBoundingClientRect();
        const disclaimerRect = disclaimer?.getBoundingClientRect();
        return {
          pageHeight: clinicalPage?.getBoundingClientRect().height ?? 0,
          visiblePageHeight: pageRect && panelRect
            ? Math.max(0, Math.min(pageRect.bottom, panelRect.bottom) - Math.max(pageRect.top, panelRect.top))
            : 0,
          documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          disclaimerVisibleAtStart: Boolean(
            pageRect &&
            disclaimerRect &&
            disclaimerRect.top >= pageRect.top - 1 &&
            disclaimerRect.top < pageRect.bottom
          )
        };
      });

      expect(layout.pageHeight, `${width}x600 UDS clinical viewport`).toBeGreaterThanOrEqual(40);
      expect(layout.visiblePageHeight, `${width}x600 visible UDS clinical viewport`).toBeGreaterThanOrEqual(40);
      expect(layout.documentOverflow).toBeLessThanOrEqual(1);
      expect(layout.panelOverflow).toBeLessThanOrEqual(1);
      expect(layout.disclaimerVisibleAtStart, `${width}x600 UDS safety disclaimer`).toBe(true);
    }
  });
});
