const { test, expect } = require('@playwright/test');

const WORKFLOWS = {
  home: {
    label: 'Start Center',
    headingText: 'Select a workflow',
    panel: '.cd2004-start-center',
    layout: '.cd2004-start-center',
    heading: '.cd2004-section-heading h1',
    representative: '.cd2004-launcher',
    control: '.cd2004-launcher',
    hero: '.cd2004-start-launchers',
    landmarks: [
      '.cd2004-start-launchers',
      '.cd2004-start-ledger',
      '.cd2004-start-bottom',
      '.cd2004-launcher'
    ]
  },
  samples: {
    label: 'Samples',
    headingText: 'Document exactly what was dispensed.',
    panel: '#panel-samples',
    layout: '#panel-samples .layout',
    heading: '#panel-samples .sample-hero-title, #panel-samples .card-head h2',
    representative: '#panel-samples .card',
    control: '#panel-samples #samplePtName',
    hero: '#panel-samples .sample-module-hero',
    landmarks: [
      '#panel-samples #samplePtName',
      '#panel-samples #samplePackageTraceability',
      '#panel-samples #sampleReviewedToday',
      '#panel-samples #samplePreview'
    ]
  },
  // 'forms', 'uds', and 'administer' (injection) are intentionally not
  // covered here: they've been migrated to real new panels (`.wfp-panel`)
  // with a fundamentally different structure from the shared legacy
  // card/chip contract this suite validates for the still-legacy-hosted
  // workflows. A dedicated visual contract for the new panels is a
  // follow-up, not part of this generic legacy contract.
};

async function openWorkflow(page, workflow) {
  if (workflow === 'home') {
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'home'
    );
    return;
  }

  const navButton = page.locator(
    `.cd2004-nav-item[title="${WORKFLOWS[workflow].label}"]`
  );
  if (!await navButton.isVisible()) {
    const navTab = page.getByRole('tab', { name: 'NAV', exact: true });
    await expect(navTab).toBeVisible();
    await navTab.click();
  }

  await navButton.click();
  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    workflow
  );
  await expect(page.locator(WORKFLOWS[workflow].panel)).toBeVisible();
}

async function collectVisualContract(page, workflow) {
  // Establish keyboard modality before moving focus to the representative
  // control so the contract measures the real :focus-visible treatment rather
  // than the neutral border produced by a mouse/programmatic-only focus.
  await page.keyboard.press('Tab');
  const contract = await page.evaluate(({ workflow, spec }) => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const pick = (selector, visibleOnly = true) => {
      const matches = [...document.querySelectorAll(selector)];
      return visibleOnly ? matches.find(visible) ?? null : matches[0] ?? null;
    };
    const styleOf = (element, properties) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(
        properties.map(property => [property, style[property]])
      );
    };
    const rounded = value => Math.round(value * 10) / 10;
    const rectOf = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rounded(rect.x),
        y: rounded(rect.y),
        width: rounded(rect.width),
        height: rounded(rect.height),
        right: rounded(rect.right),
        bottom: rounded(rect.bottom)
      };
    };
    const hasHorizontalOverflow = element =>
      Boolean(element && element.scrollWidth - element.clientWidth > 1);
    const directChildColumns = element => {
      if (!element) return 0;
      const leftEdges = [...element.children]
        .filter(visible)
        .map(child => child.getBoundingClientRect().left)
        .sort((a, b) => a - b);
      return leftEdges.reduce((columns, left) => {
        if (!columns.some(value => Math.abs(value - left) <= 3)) columns.push(left);
        return columns;
      }, []).length;
    };

    const shell = document.querySelector('.cd2004-shell');
    const appTitlebar = document.querySelector('.cd2004-app-titlebar');
    const activeWindow = document.querySelector('.cd2004-window.is-active');
    const activeWindowTitlebar = activeWindow?.querySelector(
      ':scope > .cd2004-window-titlebar'
    );
    const recordTableWrap = document.querySelector(
      '.cd2004-start-bottom .cd2004-table-wrap'
    );
    const mobileSwitcher = document.querySelector('.cd2004-mobile-switcher');
    const panel = pick(spec.panel);
    const layout = pick(spec.layout);
    const heading = pick(spec.heading);
    const representative = pick(spec.representative);
    const control = pick(spec.control);
    const hero = pick(spec.hero);

    const panes = [...document.querySelectorAll('.cd2004-workspace > .cd2004-window')]
      .map(element => ({
        pane: element.getAttribute('data-pane'),
        visible: visible(element),
        rect: rectOf(element)
      }));
    const visiblePanes = panes.filter(pane => pane.visible);
    const desktopTiling =
      visiblePanes.length === 3 &&
      visiblePanes.every((pane, index) =>
        index === 0 ||
        (
          Math.abs(pane.rect.y - visiblePanes[0].rect.y) <= 1 &&
          visiblePanes[index - 1].rect.right <= pane.rect.x + 1
        )
      );

    const representativeStyle = styleOf(representative, [
      'borderRadius',
      'boxShadow'
    ]);
    const controlStyle = styleOf(control, ['borderRadius', 'fontFamily']);
    const headingStyle = styleOf(heading, [
      'color',
      'fontSize',
      'fontWeight',
      'lineHeight'
    ]);
    const heroStyle = styleOf(hero, [
      'backgroundColor',
      'borderBottomColor',
      'borderRadius',
      'boxShadow'
    ]);
    const activeTitlebarStyle = styleOf(activeWindowTitlebar, [
      'backgroundColor',
      'backgroundImage',
      'color',
      'minHeight'
    ]);
    control?.focus();
    const focusedControlStyle = styleOf(control, [
      'borderColor',
      'boxShadow'
    ]);

    return {
      workflow,
      activeWorkflow: shell?.getAttribute('data-active-workflow'),
      workTitle: document
        .querySelector('.cd2004-work-window .cd2004-window-title')
        ?.childNodes[0]?.textContent?.trim(),
      heading: {
        text: heading?.textContent?.replace(/\s+/g, ' ').trim(),
        tag: heading?.tagName,
        style: headingStyle
      },
      chrome: {
        shell: styleOf(shell, [
          'backgroundColor',
          'fontFamily',
          'fontSize',
          'overflow'
        ]),
        applicationTitlebar: {
          ...styleOf(appTitlebar, [
            'color',
            'height',
            'backgroundColor',
            'backgroundImage'
          ]),
          usesGradient: getComputedStyle(appTitlebar).backgroundImage.includes(
            'linear-gradient'
          )
        },
        activeWindow: {
          ...styleOf(activeWindow, [
            'borderRadius',
            'borderTopWidth',
            'borderRightWidth'
          ]),
          titlebarColor: activeTitlebarStyle?.color,
          titlebarMinHeight: activeTitlebarStyle?.minHeight,
          titlebarUsesGradient:
            activeTitlebarStyle?.backgroundImage.includes('linear-gradient'),
          titlebarUsesNavy: activeTitlebarStyle?.backgroundColor === 'rgb(10, 36, 106)'
        }
      },
      panes: {
        visible: visiblePanes.map(pane => pane.pane),
        desktopTiling,
        mobileSwitcherVisible: visible(mobileSwitcher),
        mobileTabs: visible(mobileSwitcher)
          ? [...mobileSwitcher.querySelectorAll('[role="tab"]')].map(tab => ({
              label: tab.textContent.trim(),
              selected: tab.getAttribute('aria-selected')
            }))
          : [],
        singleActiveMobilePane:
          visible(mobileSwitcher) && visiblePanes.length === 1
      },
      surface: {
        panelVisible: visible(panel),
        layoutDisplay: layout ? getComputedStyle(layout).display : null,
        topLevelColumns: directChildColumns(layout),
        horizontalOverflow: hasHorizontalOverflow(layout),
        panelHorizontalOverflow: hasHorizontalOverflow(panel),
        hero: {
          ...heroStyle,
          hasRelief: heroStyle?.boxShadow !== 'none'
        },
        representativeSquare: representativeStyle?.borderRadius === '0px',
        representativeFlat: representativeStyle?.boxShadow === 'none',
        representativeHasRelief: representativeStyle?.boxShadow !== 'none',
        controlSquare: controlStyle?.borderRadius === '0px',
        focusedControlBorder: focusedControlStyle?.borderColor,
        focusedControlHasGlow: focusedControlStyle?.boxShadow !== 'none',
        recordLedgerHorizontalOverflow: hasHorizontalOverflow(recordTableWrap),
        usesTahomaFirst:
          controlStyle?.fontFamily.trim().toLowerCase().startsWith('tahoma') ??
          false,
        landmarksPresent: spec.landmarks.map(selector =>
          Boolean(pick(selector, false))
        )
      },
      containment: {
        documentHorizontalOverflow:
          document.documentElement.scrollWidth - window.innerWidth > 1,
        shellWithinViewport:
          shell.getBoundingClientRect().left >= -1 &&
          shell.getBoundingClientRect().right <= window.innerWidth + 1,
        workWindowWithinViewport: (() => {
          const rect = document
            .querySelector('.cd2004-work-window')
            .getBoundingClientRect();
          return rect.left >= -1 && rect.right <= window.innerWidth + 1;
        })()
      }
    };
  }, { workflow, spec: WORKFLOWS[workflow] });
  await page.waitForTimeout(160);
  const focusedControlStyle = await page.evaluate(selector => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const control = [...document.querySelectorAll(selector)].find(visible);
    if (!control) return null;
    const style = getComputedStyle(control);
    return {
      borderColor: style.borderColor,
      hasGlow: style.boxShadow !== 'none'
    };
  }, WORKFLOWS[workflow].control);
  contract.surface.focusedControlBorder = focusedControlStyle?.borderColor;
  contract.surface.focusedControlHasGlow = focusedControlStyle?.hasGlow;
  return contract;
}

function expectedContract(workflow, viewport) {
  const desktop = viewport === 'desktop';
  const module = WORKFLOWS[workflow];
  const isHome = workflow === 'home';
  const titlebarHeight = desktop ? '27px' : '29px';
  const windowTitlebarMinHeight = desktop ? '24px' : '27px';

  return {
    workflow,
    activeWorkflow: workflow,
    workTitle: isHome ? 'Start Center' : `${module.label} Worksheet`,
    heading: {
      text: module.headingText,
      tag: isHome ? 'H1' : 'H2',
      style: {
        color: isHome ? 'rgb(16, 35, 66)' : 'rgb(16, 42, 86)',
        fontSize: isHome && desktop ? '18px' : '16px',
        fontWeight: '700',
        lineHeight: isHome
          ? desktop
            ? '19.8px'
            : '17.6px'
          : '18.4px'
      }
    },
    chrome: {
      shell: {
        backgroundColor: 'rgb(127, 140, 153)',
        fontFamily: expect.stringMatching(/^Tahoma,/),
        fontSize: '12px',
        overflow: 'hidden'
      },
      applicationTitlebar: {
        color: 'rgb(255, 255, 255)',
        height: titlebarHeight,
        backgroundColor: 'rgb(10, 36, 106)',
        backgroundImage: 'none',
        usesGradient: false
      },
      activeWindow: {
        borderRadius: '0px',
        borderTopWidth: '2px',
        borderRightWidth: '2px',
        titlebarColor: 'rgb(255, 255, 255)',
        titlebarMinHeight: windowTitlebarMinHeight,
        titlebarUsesGradient: false,
        titlebarUsesNavy: true
      }
    },
    panes: {
      visible: desktop ? ['navigator', 'work', 'inspector'] : ['work'],
      desktopTiling: desktop,
      mobileSwitcherVisible: !desktop,
      mobileTabs: desktop
        ? []
        : [
            { label: 'NAV', selected: 'false' },
            { label: 'WORK', selected: 'true' },
            { label: 'NOTE', selected: 'false' }
          ],
      singleActiveMobilePane: !desktop
    },
    surface: {
      panelVisible: true,
      layoutDisplay: 'grid',
      topLevelColumns: isHome && desktop ? 2 : 1,
      horizontalOverflow: false,
      panelHorizontalOverflow: false,
      hero: {
        backgroundColor: isHome
          ? 'rgb(248, 249, 247)'
          : 'rgb(219, 228, 238)',
        borderBottomColor: isHome
          ? 'rgb(92, 104, 116)'
          : 'rgb(124, 137, 150)',
        borderRadius: '0px',
        boxShadow: expect.any(String),
        hasRelief: true
      },
      representativeSquare: true,
      representativeFlat: !isHome,
      representativeHasRelief: isHome,
      controlSquare: true,
      focusedControlBorder: 'rgb(255, 180, 0)',
      focusedControlHasGlow: false,
      recordLedgerHorizontalOverflow: false,
      usesTahomaFirst: true,
      landmarksPresent: [true, true, true, true]
    },
    containment: {
      documentHorizontalOverflow: false,
      shellWithinViewport: true,
      workWindowWithinViewport: true
    }
  };
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 844 }
]) {
  test.describe(`${viewport.name} visual contracts`, () => {
    for (const workflow of Object.keys(WORKFLOWS)) {
      test(`${WORKFLOWS[workflow].label} preserves the approved visual contract`, async ({
        page
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height
        });
        if (workflow === 'home') {
          await page.addInitScript(() => {
            localStorage.setItem(
              'ipmgMedAssistInjectionRecordsV1',
              JSON.stringify([
                {
                  id: 'visual-contract-record',
                  type: 'injection',
                  status: 'completed',
                  createdAt: '2026-07-30T09:00:00-07:00',
                  updatedAt: '2026-07-30T09:05:00-07:00',
                  completedAt: '2026-07-30T09:05:00-07:00',
                  patient: { name: 'Contract, Visual', dob: '01/02/1990' },
                  summary: 'Abilify Maintena 400 mg',
                  snapshot: {
                    version: 4,
                    medKey: 'maintena',
                    state: { dose: '400 mg', route: 'IM', site: 'L deltoid' },
                    fields: { adminDate: '2026-07-30' }
                  },
                  addenda: []
                }
              ])
            );
          });
        }
        await page.goto(`/?visual-contract=${viewport.name}-${workflow}`);
        await expect(page.locator('.cd2004-shell')).toBeVisible();
        await openWorkflow(page, workflow);

        const contract = await collectVisualContract(page, workflow);
        if (process.env.DUMP_VISUAL_CONTRACTS) {
          console.log(
            `\n${viewport.name}/${workflow}\n${JSON.stringify(contract, null, 2)}`
          );
        }
        expect(contract).toEqual(expectedContract(workflow, viewport.name));
      });
    }
  });
}
