const { test, expect } = require('@playwright/test');

const WORKFLOWS = {
  home: {
    label: 'Dashboard',
    headingText: 'Open Notes',
    panel: '.cd2004-start-center',
    layout: '.cd2004-start-center',
    heading: '#currentWorklistTitle',
    representative: '.cd2004-worklist-new',
    control: '.cd2004-worklist-new',
    hero: '.cd2004-worklist-header',
    landmarks: [
      '.cd2004-worklist-header',
      '.cd2004-worklist-tabs',
      '.cd2004-worklist-sheet',
      // The sheet holds either the record list or the empty state, so the
      // footer is the structural landmark that exists in both.
      '.cd2004-worklist-footer'
    ]
  },
  // Phase 2c intentionally keeps this exact visual snapshot focused on the
  // Dashboard at two widths. Clinical workflows use the measured screen and
  // reachability contracts in tebra-screen-contract.spec.js plus their full
  // interaction journeys in workstation.spec.js; Phase 3 will add the two
  // dedicated Notes grammars here when their components exist.
};

async function openWorkflow(page, workflow) {
  if (workflow === 'home') {
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'home'
    );
    return;
  }

  // The section rail remains visible at every supported workstation width, so
  // every workflow item is directly clickable.
  await page.locator(
    `.cd2004-nav-item[title="${WORKFLOWS[workflow].label}"]`
  ).click();
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
    const recordTableWrap = document.querySelector('.cd2004-worklist-sheet');
    const panel = pick(spec.panel);
    const layout = pick(spec.layout);
    const heading = pick(spec.heading);
    const representative = pick(spec.representative);
    const control = pick(spec.control);
    const hero = pick(spec.hero);

    const panes = [...document.querySelectorAll('.cd2004-workspace .cd2004-window')]
      .map(element => ({
        pane: element.getAttribute('data-pane'),
        visible: visible(element),
        rect: rectOf(element)
      }));
    const visiblePanes = panes.filter(pane => pane.visible);
    // Clinical worksheets have a document inspector. The Dashboard remains a
    // single-purpose worklist instead of manufacturing empty note context.
    const desktopTiling =
      visiblePanes.length === 2 &&
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
      'fontFamily',
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
      'boxShadow',
      'outlineColor',
      'outlineStyle',
      'outlineWidth'
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
        mobileSwitcherVisible: false,
        mobileTabs: [],
        singleActiveMobilePane: false
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
        focusedControlOutline: {
          color: focusedControlStyle?.outlineColor,
          style: focusedControlStyle?.outlineStyle,
          width: focusedControlStyle?.outlineWidth
        },
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
      hasGlow: style.boxShadow !== 'none',
      outline: {
        color: style.outlineColor,
        style: style.outlineStyle,
        width: style.outlineWidth
      }
    };
  }, WORKFLOWS[workflow].control);
  contract.surface.focusedControlBorder = focusedControlStyle?.borderColor;
  contract.surface.focusedControlHasGlow = focusedControlStyle?.hasGlow;
  contract.surface.focusedControlOutline = focusedControlStyle?.outline;
  return contract;
}

function expectedContract(workflow, viewport) {
  const module = WORKFLOWS[workflow];
  const isHome = workflow === 'home';
  const compact = viewport.width <= 919;
  const titlebarHeight = compact ? '56px' : '65px';
  const windowTitlebarMinHeight = compact ? '42px' : '48px';
  const headingFontSize = compact ? '21px' : '32px';
  const headingLineHeight = compact ? '28px' : '40px';

  return {
    workflow,
    activeWorkflow: workflow,
    workTitle: isHome ? 'Dashboard' : `${module.label} note`,
    heading: {
      text: module.headingText,
      tag: isHome ? 'H1' : 'H2',
      style: {
        // Cream on the Dashboard's teal band; teal-900 on the workflow
        // headings, which still sit on a light surface.
        color: isHome ? 'rgb(248, 243, 235)' : 'rgb(0, 58, 67)',
        fontFamily: expect.stringMatching(/^"Plus Jakarta Sans Variable"/),
        fontSize: isHome ? headingFontSize : '16px',
        fontWeight: '700',
        lineHeight: isHome ? headingLineHeight : '18.4px'
      }
    },
    chrome: {
      shell: {
        backgroundColor: 'rgb(251, 249, 248)',
        fontFamily: expect.stringMatching(/^"Inter Variable"/),
        fontSize: '16px',
        overflow: 'hidden'
      },
      applicationTitlebar: {
        color: 'rgb(248, 243, 235)',
        height: titlebarHeight,
        backgroundColor: 'rgb(0, 72, 82)',
        backgroundImage: 'none',
        usesGradient: false
      },
      activeWindow: {
        // Phase 4 moved the work panel onto Tebra's card radius. 4px is one of
        // their real radii, but it is the one they spend on chips and inputs;
        // the panel a whole screen of work sits in is a card, and reads as one.
        borderRadius: '16px',
        borderTopWidth: '0px',
        borderRightWidth: '0px',
        titlebarColor: 'rgb(0, 58, 67)',
        titlebarMinHeight: windowTitlebarMinHeight,
        titlebarUsesGradient: false,
        titlebarUsesNavy: false
      }
    },
    panes: {
      visible: isHome ? ['work'] : ['work', 'inspector'],
      desktopTiling: false,
      mobileSwitcherVisible: false,
      mobileTabs: [],
      singleActiveMobilePane: false
    },
    surface: {
      panelVisible: true,
      layoutDisplay: 'grid',
      topLevelColumns: 1,
      horizontalOverflow: false,
      panelHorizontalOverflow: false,
      // The Dashboard hero is a deep-teal band with cream type. Counting
      // Tebra's own production CSS, #004952 is their second most used
      // background after white and #f8f3eb their second most used text
      // colour - cream exists to sit on that teal, and alternating teal
      // against white is the most recognisable thing about how they look. A
      // white hero here made the first screen of the shift read as any SaaS
      // product. Still flush and square: it is a section band, not a card.
      hero: {
        backgroundColor: isHome ? 'rgb(0, 73, 82)' : 'rgb(246, 248, 248)',
        borderBottomColor: isHome ? 'rgb(248, 243, 235)' : 'rgb(210, 220, 218)',
        borderRadius: '0px',
        boxShadow: 'none',
        hasRelief: false
      },
      // Tebra's control grammar: a soft radius, a hairline border, and no bezel.
      representativeSquare: false,
      representativeFlat: true,
      representativeHasRelief: false,
      controlSquare: false,
      focusedControlBorder: 'rgb(255, 141, 110)',
      focusedControlHasGlow: false,
      focusedControlOutline: {
        color: 'rgb(0, 73, 82)',
        style: 'solid',
        width: '2px'
      },
      recordLedgerHorizontalOverflow: false,
      usesTahomaFirst: false,
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
  { name: 'narrow-desktop', width: 840, height: 720 }
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
        expect(contract).toEqual(expectedContract(workflow, viewport));
      });
    }
  });
}
