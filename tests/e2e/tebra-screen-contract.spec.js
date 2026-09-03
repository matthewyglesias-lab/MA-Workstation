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
const TEAL_800 = 'rgb(0, 73, 82)';
const MINT_50 = 'rgb(246, 248, 248)';
const WHITE = 'rgb(255, 255, 255)';

async function openWorkflow(page, title, selector) {
  await page.locator(`.cd2004-nav-item[title="${title}"]`).click();
  await expect(page.locator(`.cd2004-workflow-slot${selector}`)).toBeVisible();
}

test.describe('Tebra screen contract', () => {
  test('keeps common workstation surfaces in one palette and control grammar', async ({ page }) => {
    await page.goto('/');

    const home = await page.evaluate(() => {
      const launcher = document.querySelector('.cd2004-launcher-tile');
      const nav = document.querySelector('button.cd2004-nav-item');
      return {
        launcherGradient: getComputedStyle(launcher).backgroundImage,
        launcherRelief: getComputedStyle(launcher).boxShadow,
        navRadius: getComputedStyle(nav).borderRadius,
        navFont: getComputedStyle(nav).fontFamily
      };
    });
    // No gradients and no raised/sunken bezel: those are the client/server tell.
    expect(home.launcherGradient).toBe('none');
    expect(home.launcherRelief).toBe('none');
    // Rounded, not square. 6px is --tw-radius-ws, the workstation-tier radius.
    expect(home.navRadius).toBe('6px');
    expect(home.navFont).toMatch(/^"Inter Variable"/);

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

  test('keeps the persistent chrome flat, with no bezel and no gradient', async ({ page }) => {
    await page.goto('/');

    // The header, menu bar and status bar frame every screen, so a bezel or a
    // gradient surviving on any of them reintroduces the client/server
    // grammar everywhere at once. Asserting it here means the regression
    // fails by name rather than as an unattributed pixel diff.
    const chrome = await page.evaluate(() => {
      const read = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const computed = getComputedStyle(node);
        return {
          backgroundImage: computed.backgroundImage,
          boxShadow: computed.boxShadow
        };
      };
      return {
        header: read('.cd2004-application-header'),
        appBar: read('.cd2004-app-titlebar'),
        menuBar: read('.cd2004-menu-bar'),
        statusBar: read('.cd2004-statusbar'),
        statusSegment: read('.cd2004-status-segment')
      };
    });

    for (const [surface, style] of Object.entries(chrome)) {
      expect(style, `${surface} is present`).not.toBeNull();
      expect(style.backgroundImage, `${surface} has no gradient`).toBe('none');
      expect(style.boxShadow, `${surface} has no bezel`).toBe('none');
    }
  });

  test('reserves coral for the primary action and never for clinical status', async ({ page }) => {
    await page.goto('/');
    // Coral is Tebra's accent and sits close to a clinical warning hue, so the
    // redesign reserves it for the single primary action per screen. A status
    // surface painted coral would be the regression this guards against.
    const coralOnStatus = await page.evaluate(() => {
      const coral = ['rgb(255, 141, 110)', 'rgb(243, 126, 94)', 'rgb(254, 195, 184)'];
      const statusSelectors = [
        '.cd2004-readiness-verdict', '.cd2004-readiness-item',
        '.wfp-result-cycle', '.wfp-exception-line', '.cd2004-note-mark'
      ];
      const offenders = [];
      for (const selector of statusSelectors) {
        for (const node of document.querySelectorAll(selector)) {
          const s = getComputedStyle(node);
          if (coral.includes(s.backgroundColor) || coral.includes(s.color)) {
            offenders.push(`${selector} -> ${s.backgroundColor} / ${s.color}`);
          }
        }
      }
      return offenders;
    });
    expect(coralOnStatus).toEqual([]);

    // The other half of the same rule, and the one that was unenforced: coral
    // reserved for the primary action means it has to actually be on one.
    // Through Phase 2a the palette was applied and the accent never used, so
    // MANIFEST 5 question 6 ("does coral appear exactly once, on the primary
    // action") had no answer on any screen.
    const primary = await page.evaluate(() => {
      const node = document.querySelector('.cd2004-worklist-new');
      if (!node) return null;
      const computed = getComputedStyle(node);
      return { backgroundColor: computed.backgroundColor, label: node.textContent.trim() };
    });
    expect(primary).not.toBeNull();
    expect(primary.backgroundColor).toBe('rgb(255, 141, 110)');

    // Exactly once. A second coral fill on the same screen makes neither one
    // the primary action.
    const coralFills = await page.evaluate(() => {
      const coral = ['rgb(255, 141, 110)', 'rgb(243, 126, 94)'];
      return [...document.querySelectorAll('.cd2004-shell *')]
        .filter(node => coral.includes(getComputedStyle(node).backgroundColor))
        .map(node => node.className);
    });
    expect(coralFills).toHaveLength(1);
  });

  test('boots into a skeleton of the shell, carrying the local-only disclosure', async ({ page }) => {
    // The first frame paints before the module graph loads, so it is inline
    // HTML/CSS in index.html and nothing else on the page can be relied on.
    // Blocking the bundle is the only way to see it.
    await page.route('**/assets/*.js', route => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});

    const splash = page.locator('#boot-splash');
    await expect(splash).toBeVisible();

    // PLAN 7: this app has no server, and the more faithful the design gets
    // the likelier staff are to assume their documentation reached the
    // patient's chart. The disclosure is on the first surface they see.
    await expect(splash.locator('.boot-disclosure')).toHaveText('Local only');
    await expect(splash.locator('.boot-product')).toContainText('MA Workstation');

    // MANIFEST 5c: a skeleton of the shell, not a brand splash. The app bar,
    // menu strip, banner, work surface, rail, deck and status bar are all
    // present at the geometry the real chrome uses.
    const skeleton = await page.evaluate(() => {
      const height = selector => {
        const node = document.querySelector(`#boot-splash ${selector}`);
        return node ? Math.round(node.getBoundingClientRect().height) : null;
      };
      return {
        appbar: height('.boot-appbar'),
        menubar: height('.boot-menubar'),
        banner: height('.boot-banner'),
        deck: height('.boot-deck'),
        statusbar: height('.boot-statusbar'),
        rail: document.querySelector('#boot-splash .boot-rail') !== null,
        work: document.querySelector('#boot-splash .boot-work') !== null
      };
    });
    // These mirror .cd2004-shell. If a chrome height changes without this
    // changing with it, boot flashes the wrong shape - which is exactly the
    // coupling MANIFEST 5c says to declare, so it is asserted rather than
    // written down and forgotten.
    expect(skeleton).toEqual({
      appbar: 38,
      menubar: 32,
      banner: 63,
      deck: 36,
      statusbar: 26,
      rail: true,
      work: true
    });
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
