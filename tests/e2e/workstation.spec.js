const { test, expect } = require('@playwright/test');

test.describe('MA Workstation browser journeys', () => {
  const workflowLabels = {
    home: 'Start Center',
    administer: 'Injection',
    uds: 'UDS',
    samples: 'Samples',
    forms: 'Forms',
    reference: 'Knowledge',
    log: 'Daily Closeout',
    tms: 'Future / TMS'
  };

  async function openWorkflow(page, workflow) {
    const shell = page.locator('.cd2004-shell');
    const navButton = page.locator(`.cd2004-nav-item[title="${workflowLabels[workflow]}"]`);
    if (!await navButton.isVisible()) {
      const navSwitcher = page.getByRole('tab', { name: 'NAV', exact: true });
      await expect(navSwitcher).toBeVisible();
      await navSwitcher.click();
      await expect(navButton).toBeVisible();
    }
    await navButton.click();
    await expect(shell).toHaveAttribute('data-active-workflow', workflow);
    if (workflow === 'forms' || workflow === 'uds') {
      // Forms and UDS are migrated to real panels; their legacy #panel-*
      // markup stays loaded hidden as a print/readiness compatibility
      // mirror only.
      await expect(page.locator('.wfp-panel')).toBeVisible();
    } else if (workflow !== 'home') {
      const panelId = workflow === 'reference' ? '#panel-reference' : `#panel-${workflow}`;
      await expect(page.locator(panelId)).toBeVisible();
    }
  }

  async function expectNoHorizontalPageOverflow(page) {
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    )).toBeLessThanOrEqual(1);
  }

  async function maxMotionMilliseconds(locator, property) {
    return locator.evaluate((node, propertyName) => {
      const values = getComputedStyle(node)[propertyName]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000);
      return Math.max(0, ...values);
    }, property);
  }

  async function openInjectionCard(page, cardClass) {
    const card = page.locator(`#panel-administer .${cardClass}`);
    await expect(card).toBeVisible();
    const isCollapsed = () => card.evaluate(node =>
      node.classList.contains('rc530-collapsed') || node.classList.contains('rc526-collapsed')
    );
    if (await isCollapsed()) {
      const receipt = card.locator('.rc530-summary:visible, .rc526-summary:visible').first();
      if (await receipt.count()) {
        await receipt.click();
      } else {
        await card.locator('.card-head').click();
      }
    }
    await expect.poll(isCollapsed).toBe(false);
    return card;
  }

  async function prepareRoutineInjection(page, options = {}) {
    const {
      patient = 'QA, Browser',
      dob = '01/02/1990',
      administrationTime = '09:41',
      includeAdministrationTime = true,
      medication = 'Other'
    } = options;

    await page.goto('/');
    await openWorkflow(page, 'administer');
    await expect(page.locator('#injRecordWorkspace')).toBeVisible();

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#ptName').fill(patient);
    await page.locator('#ptDOB').fill(dob);
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#reasonChips').getByRole('button', { name: 'PRN / ordered', exact: true }).click();

    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: medication, exact: true }).click();
    if (medication === 'Other') {
      await page.locator('#doseChips input').fill('100 mg');
    } else {
      await page.locator('#doseChips').getByRole('button', { name: '50 mg', exact: true }).click();
    }
    await page.locator('#routeChips').getByRole('button', { name: 'IM', exact: true }).click();
    await page.locator('#bodyMap [data-site="' + (medication === 'Other' ? 'R deltoid' : 'R ventrogluteal') + '"]').click();
    await openInjectionCard(page, 'card-medication');
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    await openInjectionCard(page, 'card-trace');
    await page.locator('#ndc').fill('00000-0000-42');
    await page.locator('#lot').fill('BROWSER-LOT-42');
    await page.locator('#exp').fill('2027-12');

    await openInjectionCard(page, 'card-safety');
    if (medication !== 'Other') {
      await page.locator('#medSpecChips').getByRole('button', { name: 'Ordered route / technique verified', exact: true }).click();
    }
    await page.locator('#allergies').fill('NKDA verified in active record');
    await page.locator('[data-rc530-noacute]').click();

    await openInjectionCard(page, 'card-response');
    await page.locator('#adminDate').fill('2026-07-30');
    if (includeAdministrationTime) {
      await page.locator('#injAdminTime').fill(administrationTime);
    }
    await page.locator('#admin').fill('QA Staff, MA');

    await openInjectionCard(page, 'card-return');
    await page.locator('#nextDate').fill('2026-08-27');
    return page.locator('#clinicalDisposition');
  }

  test('boots without page errors and exposes the local injection-record drawer', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('.cd2004-shell')).toBeVisible();
    await expect(page.locator('.cd2004-app-title')).toContainText('Clinical Desktop 2004');
    await openWorkflow(page, 'administer');

    const drawerLauncher = page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    );
    await expect(drawerLauncher).toBeVisible();
    await drawerLauncher.click();

    const drawer = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    await expect.poll(() =>
      page.locator('.cd2004-shell').evaluate(node => node.inert)
    ).toBe(true);
    await expect(page.locator('[data-records-filter="draft"]')).toBeVisible();
    await expect.poll(() => drawer.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const layerBounds = node.parentElement.getBoundingClientRect();
      return Math.round(layerBounds.right - bounds.right);
    })).toBeLessThanOrEqual(1);

    const drawerVisual = await drawer.evaluate(node => {
      const style = getComputedStyle(node);
      const headerStyle = getComputedStyle(node.querySelector('.records-drawer-head'));
      const searchStyle = getComputedStyle(
        node.querySelector('#recordsDrawerSearch')
      );
      return {
        borderRadius: Number.parseFloat(style.borderRadius),
        fontFamily: style.fontFamily,
        headerBackground: headerStyle.backgroundImage,
        searchRadius: Number.parseFloat(searchStyle.borderRadius),
        horizontalOverflow: node.scrollWidth - node.clientWidth
      };
    });
    expect(drawerVisual.borderRadius).toBeLessThanOrEqual(2);
    expect(drawerVisual.searchRadius).toBeLessThanOrEqual(2);
    expect(drawerVisual.fontFamily).toContain('Tahoma');
    expect(drawerVisual.headerBackground).toContain('rgb(10, 36, 106)');
    expect(drawerVisual.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(await maxMotionMilliseconds(drawer, 'transitionDuration'))
      .toBeLessThanOrEqual(180);

    const drawerClose = page.locator('.records-drawer-close');
    const drawerNew = page.locator('[data-records-new]');
    await drawerClose.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(drawerNew).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawerClose).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect.poll(() =>
      page.locator('.cd2004-shell').evaluate(node => node.inert)
    ).toBe(false);
    await expect(drawerLauncher).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test('uses the classic keyboard-accessible navigator, launchers, and workflow routing', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');
    const navigator = page.locator('.cd2004-navigator');
    const home = page.locator('.cd2004-nav-item[title="Start Center"]');
    const administer = page.locator('.cd2004-nav-item[title="Injection"]');

    await expect(navigator).toHaveAttribute('aria-label', 'Clinical modules');
    await expect(navigator.locator('.cd2004-nav-item')).toHaveCount(8);
    await expect(home).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Alt+2');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(administer).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#panel-administer')).toHaveClass(/on/);
    await expect(navigator.locator('[aria-current="page"]')).toHaveCount(1);

    await page.evaluate(() => {
      window.__ipmgTabChanges = 0;
      document.addEventListener('ipmg:tabchange', () => { window.__ipmgTabChanges += 1; });
    });
    await openWorkflow(page, 'home');
    await page.locator('.cd2004-launcher').filter({ hasText: 'UDS' }).click();
    await expect(shell).toHaveAttribute('data-active-workflow', 'uds');
    await expect.poll(() => page.evaluate(() => window.__ipmgTabChanges)).toBe(2);

    await openWorkflow(page, 'samples');
    const workBody = page.locator('.cd2004-work-window .cd2004-window-body');
    const savedScroll = await workBody.evaluate(node => {
      node.scrollTop = Math.min(1200, Math.max(0, node.scrollHeight - node.clientHeight));
      return node.scrollTop;
    });
    await openWorkflow(page, 'uds');
    await expect.poll(() => workBody.evaluate(node => node.scrollTop)).toBeLessThan(220);
    await openWorkflow(page, 'samples');
    await expect.poll(() =>
      workBody.evaluate((node, expected) => Math.abs(node.scrollTop - expected), savedScroll)
    ).toBeLessThan(80);
  });

  test('keeps desktop menus single-open and restores focus on escape', async ({ page }) => {
    await page.goto('/');
    const fileMenu = page.locator('.cd2004-menu').filter({ hasText: 'File' });
    const chartMenu = page.locator('.cd2004-menu').filter({ hasText: 'Chart' });
    const fileSummary = fileMenu.locator('summary');
    const chartSummary = chartMenu.locator('summary');

    await fileSummary.click();
    await expect(fileMenu).toHaveAttribute('open', '');
    await chartSummary.click();
    await expect(chartMenu).toHaveAttribute('open', '');
    await expect(fileMenu).not.toHaveAttribute('open', '');
    await expect(page.locator('.cd2004-menu[open]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(chartMenu).not.toHaveAttribute('open', '');
    await expect(chartSummary).toBeFocused();

    await fileSummary.click();
    await page.locator('.cd2004-app-title').click();
    await expect(fileMenu).not.toHaveAttribute('open', '');
  });

  test('keeps the navigator, work, and note panels fixed and simultaneously visible', async ({ page }) => {
    await page.goto('/');
    const navigator = page.locator('.cd2004-navigator-window');
    const work = page.locator('.cd2004-work-window');
    const inspector = page.locator('.cd2004-inspector-window');

    // The desktop layout is fixed: every panel a workflow needs is always in
    // its place, with no minimize/maximize/close controls to hide it.
    await expect(navigator).toBeVisible();
    await expect(work).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(page.locator('.cd2004-caption-button')).toHaveCount(0);

    await openWorkflow(page, 'uds');
    await expect(navigator).toBeVisible();
    await expect(work).toBeVisible();
    await expect(inspector).toBeVisible();
  });

  test('supports core desktop shortcuts and moves focus into the note panel', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');

    await page.keyboard.press('F8');
    await expect(page.locator('.cd2004-inspector-window')).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.cd2004-inspector-window'))
    )).toBe(true);

    await page.keyboard.press('Alt+2');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.locator('#panel-administer')).toBeVisible();

    await page.locator('#ptName').fill('QA, Shortcut');
    await page.locator('#orderingProvider').fill('QA Provider');
    await page.keyboard.press('Control+S');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await page.keyboard.press('F8');
    await expect(page.locator('.cd2004-inspector-window')).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.cd2004-inspector-window'))
    )).toBe(true);

    await page.keyboard.press('F6');
    const drawer = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await page.keyboard.press('Alt+4');
    await expect(shell).toHaveAttribute('data-active-workflow', 'samples');
    await expect(page.locator('#panel-samples')).toBeVisible();
  });

  test('routes live workflows through the clinical coordinator and keeps review shortcuts non-destructive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute(
      'data-clinical-coordinator',
      'active'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-clinical-engines',
      'injection uds samples forms'
    );

    await openWorkflow(page, 'uds');
    await expect(page.locator('.cd2004-complete-button')).toHaveText(
      /REVIEW CURRENT NOTE/
    );
    await page.evaluate(() => {
      window.__qaReviewActionClicks = 0;
      document
        .querySelectorAll('.wfp-panel [data-complete], .wfp-panel .primary')
        .forEach(control => {
          control.addEventListener('click', () => {
            window.__qaReviewActionClicks += 1;
          });
        });
    });

    const storageBefore = await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return key ? [key, localStorage.getItem(key)] : null;
          }).filter(Boolean)
        )
      )
    );
    await page.keyboard.press('F10');
    // UDS is migrated to a real panel; F10 focuses the panel root instead of
    // the legacy hidden mirror's .preview-col.
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.wfp-panel'))
    )).toBe(true);
    expect(await page.evaluate(() => window.__qaReviewActionClicks)).toBe(0);
    await expect(page.locator('.cd2004-status-message')).toHaveText(
      'Current note and readiness focused for review.'
    );

    await page.keyboard.press('Control+S');
    await expect(page.locator('.cd2004-status-message')).toHaveText(
      'Draft saving is unavailable in this workflow.'
    );
    expect(await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return key ? [key, localStorage.getItem(key)] : null;
          }).filter(Boolean)
        )
      )
    )).toBe(storageBefore);
  });

  test('soft-syncs empty workflows and never overwrites a started patient context', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    await page.locator('#ptName').fill('Alpha, Patient');
    await page.locator('#ptDOB').fill('01/02/1990');
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Alpha, Patient');

    await openWorkflow(page, 'samples');
    await expect(page.locator('#samplePtName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#sampleDOB')).toHaveValue('01/02/1990');
    await page.locator('#samplePtName').fill('Bravo, Patient');
    await page.locator('#sampleDOB').fill('03/04/1992');

    const mismatch = page.locator('.cd2004-context-mismatch');
    await expect(mismatch).toBeVisible();
    await expect(mismatch).toContainText('Bravo, Patient');
    await mismatch.getByRole('button', { name: 'Make active' }).click();
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Bravo, Patient');

    await openWorkflow(page, 'uds');
    await expect(page.locator('#udsPtName')).toHaveValue('Bravo, Patient');
    await expect(page.locator('#udsDOB')).toHaveValue('03/04/1992');

    await openWorkflow(page, 'administer');
    await expect(page.locator('#ptName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#ptDOB')).toHaveValue('01/02/1990');
    await expect(page.locator('.cd2004-context-mismatch')).toContainText('Alpha, Patient');
  });

  test('honors reduced-motion while preserving all desktop commands', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )).toBe(true);

    const transitionSeconds = await page.locator('.cd2004-launcher').first().evaluate(node =>
      getComputedStyle(node).transitionDuration
        .split(',')
        .map(value => Number.parseFloat(value) * (value.includes('ms') ? 0.001 : 1))
    );
    expect(Math.max(...transitionSeconds)).toBeLessThanOrEqual(0.001);

    const helpSummary = page.locator('.cd2004-menu').filter({ hasText: 'Help' }).locator('summary');
    await helpSummary.click();
    await page.getByRole('button', { name: 'Keyboard Reference' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard Reference' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.cd2004-shell > header')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    const animationSeconds = await dialog.evaluate(node => {
      const value = getComputedStyle(node).animationDuration;
      return Number.parseFloat(value) * (value.includes('ms') ? 0.001 : 1);
    });
    expect(animationSeconds).toBeLessThanOrEqual(0.001);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(helpSummary).toBeFocused();
    await expect(page.locator('.cd2004-shell > header')).not.toHaveAttribute(
      'aria-hidden',
      'true'
    );

    const recordsButton = page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    );
    await recordsButton.click();
    const drawer = page.locator('.records-drawer');
    await expect(drawer).toBeVisible();
    expect(await maxMotionMilliseconds(drawer, 'transitionDuration'))
      .toBeLessThanOrEqual(1);
    expect(await maxMotionMilliseconds(
      page.locator('.records-drawer-scrim'),
      'transitionDuration'
    )).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(recordsButton).toBeFocused();

    await page.keyboard.press('Alt+3');
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'uds');
  });

  test('keeps Samples guide ownership, ARIA, and output highlighting in the Samples panel', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'samples');
    const guides = page.locator('#panel-samples [data-guide]');
    await expect(guides).toHaveCount(6);
    expect(await guides.evaluateAll(nodes => nodes.map(node => node.dataset.guide)))
      .toEqual(['patient', 'selected', 'plan', 'trace', 'safety', 'output']);

    const selected = page.locator('#panel-samples [data-guide="selected"]');
    await selected.locator('[data-guided-head]').focus();
    await page.keyboard.press('Enter');
    await expect(selected).toHaveClass(/open/);
    await expect(selected.locator('[data-guided-head]')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => guides.evaluateAll(nodes => nodes.filter(node => node.classList.contains('open')).length)).toBe(1);
    await expect.poll(() => guides.evaluateAll(nodes =>
      nodes.filter(node => node.querySelector('[data-guided-head]')?.getAttribute('aria-expanded') === 'true').length
    )).toBe(1);

    const output = page.locator('#panel-samples [data-guide="output"]');
    await output.locator('[data-guided-head]').click();
    await output.locator('button.secondary').click();
    await expect(page.locator('#panel-samples .preview-col')).toHaveClass(/output-pulse/);
    await expect(page.locator('#panel-administer .preview-col')).not.toHaveClass(/output-pulse/);
  });

  test('reopens a collapsed injection receipt from the progress rail with the keyboard', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const encounter = page.locator('#panel-administer .card-encounter');
    await page.locator('#ptName').fill('QA, Receipt');
    await page.locator('#ptDOB').fill('01/02/1990');
    await page.locator('#orderingProvider').fill('QA Provider');

    await expect.poll(() => encounter.evaluate(node => node.classList.contains('rc530-collapsed'))).toBe(true);
    const receipt = encounter.locator('.rc530-summary');
    await expect(receipt).toBeVisible();
    await expect(receipt).toHaveJSProperty('tagName', 'BUTTON');
    await expect(receipt).toHaveAttribute('aria-expanded', 'false');
    await expect(receipt).toHaveAttribute('aria-label', /Patient & order — complete:/);

    const progressStep = page.locator('[data-rc526-jump="encounter"]');
    await progressStep.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => encounter.evaluate(node => node.classList.contains('rc530-collapsed'))).toBe(false);
    await expect(encounter).toHaveClass(/rc530-open/);
    await expect(progressStep).toBeFocused();
  });

  test('keeps the single-window task switcher and records drawer contained at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expectNoHorizontalPageOverflow(page);

    const switcher = page.locator('.cd2004-mobile-switcher');
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole('tab')).toHaveCount(3);
    const workTab = switcher.getByRole('tab', { name: 'WORK', exact: true });
    const noteTab = switcher.getByRole('tab', { name: 'NOTE', exact: true });
    await expect(workTab).toHaveAttribute('aria-selected', 'true');
    await expect(workTab).toHaveAttribute('aria-controls', 'cd2004-pane-work');
    await expect(workTab).toHaveAttribute('tabindex', '0');
    await expect(page.locator('.cd2004-work-window')).toBeVisible();
    await expect(page.locator('.cd2004-navigator-window')).toBeHidden();
    await expect(page.locator('.cd2004-inspector-window')).toBeHidden();
    await expect(page.locator('.cd2004-patient-field').first()).toBeVisible();
    expect(await page.locator('.cd2004-status-message').evaluate(node =>
      getComputedStyle(node).display
    )).not.toBe('none');

    await workTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(noteTab).toHaveAttribute('aria-selected', 'true');
    await expect(noteTab).toBeFocused();
    await expect(page.locator('.cd2004-inspector-window')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(workTab).toHaveAttribute('aria-selected', 'true');
    await expect(workTab).toBeFocused();

    await switcher.getByRole('tab', { name: 'NAV', exact: true }).click();
    await expect(page.locator('.cd2004-navigator-window')).toBeVisible();
    await expect(page.locator('.cd2004-work-window')).toBeHidden();
    await openWorkflow(page, 'samples');
    await expect(page.locator('.cd2004-work-window')).toBeVisible();
    await expect(switcher.getByRole('tab', { name: 'WORK', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    const recordsButton = page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    );
    await recordsButton.click();
    const drawer = page.locator('.records-drawer');
    await expect(drawer).toBeVisible();
    const bounds = await drawer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeLessThanOrEqual(390);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(recordsButton).toBeFocused();
  });

  test('keeps every clinical workspace contained in side-by-side Tebra widths', async ({ page }) => {
    const widths = [1181, 1040, 700, 390, 320];
    const overflowFailures = [];
    const workflows = [
      ['administer', '#panel-administer .layout'],
      ['uds', '.wfp-panel'],
      ['samples', '#panel-samples .layout'],
      ['forms', '.wfp-panel']
    ];

    for (const width of widths) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await page.goto(`/?responsive=${width}`);
      await expectNoHorizontalPageOverflow(page);

      const shellBox = await page.locator('.cd2004-shell').boundingBox();
      expect(shellBox).not.toBeNull();
      expect(shellBox.x).toBeGreaterThanOrEqual(0);
      expect(shellBox.width).toBeLessThanOrEqual(width);

      const visibleWindows = page.locator('.cd2004-workspace .cd2004-window:visible');
      if (width <= 700) {
        await expect(page.locator('.cd2004-mobile-switcher')).toBeVisible();
        await expect(visibleWindows).toHaveCount(1);
      } else {
        await expect(page.locator('.cd2004-mobile-switcher')).toBeHidden();
        await expect(visibleWindows).toHaveCount(3);
      }

      if (width === 1181) {
        const [navBox, workBox, inspectorBox] = await Promise.all([
          page.locator('.cd2004-navigator-window').boundingBox(),
          page.locator('.cd2004-work-window').boundingBox(),
          page.locator('.cd2004-inspector-window').boundingBox()
        ]);
        expect(navBox.x + navBox.width).toBeLessThanOrEqual(workBox.x + 1);
        expect(workBox.x + workBox.width).toBeLessThanOrEqual(inspectorBox.x + 1);
      }

      if (width === 1040) {
        const [workBox, inspectorBox] = await Promise.all([
          page.locator('.cd2004-work-window').boundingBox(),
          page.locator('.cd2004-inspector-window').boundingBox()
        ]);
        expect(workBox.y + workBox.height).toBeLessThanOrEqual(inspectorBox.y + 1);
      }

      for (const [tab, selector] of workflows) {
        await openWorkflow(page, tab);
        await expect(page.locator(selector)).toBeVisible();
        const internalOverflow = await page.locator(selector).evaluate(node =>
          node.scrollWidth - node.clientWidth
        );
        const overflowOffenders = internalOverflow > 1
          ? await page.locator(selector).evaluate(node =>
              {
                const rootBounds = node.getBoundingClientRect();
                return [...node.querySelectorAll('*')]
                .filter(child => {
                  if (!child.getClientRects().length) return false;
                  const bounds = child.getBoundingClientRect();
                  return child.scrollWidth - child.clientWidth > 1 ||
                    bounds.right > rootBounds.right + 1 ||
                    bounds.left < rootBounds.left - 1;
                })
                .slice(0, 8)
                .map(child => {
                  const bounds = child.getBoundingClientRect();
                  return {
                    element: child.id
                      ? `#${child.id}`
                      : `${child.tagName.toLowerCase()}.${[...child.classList].join('.')}`,
                    overflow: child.scrollWidth - child.clientWidth,
                    clientWidth: child.clientWidth,
                    left: Math.round(bounds.left - rootBounds.left),
                    right: Math.round(bounds.right - rootBounds.right)
                  };
                });
              }
            )
          : [];
        if (internalOverflow > 1) {
          overflowFailures.push({
            width,
            workflow: tab,
            overflow: internalOverflow,
            offenders: overflowOffenders
          });
        }
        await expectNoHorizontalPageOverflow(page);
      }

      if (width <= 390) {
        await openWorkflow(page, 'log');
        const logHeroHeight = await page.locator('.log-hero').evaluate(node => node.getBoundingClientRect().height);
        expect(logHeroHeight).toBeLessThan(520);
      }

      const titlebar = page.locator('.cd2004-app-titlebar');
      const titlebarBox = await titlebar.boundingBox();
      expect(titlebarBox).not.toBeNull();
      expect(titlebarBox.x).toBeGreaterThanOrEqual(0);
      expect(titlebarBox.x + titlebarBox.width).toBeLessThanOrEqual(width + 1);
    }

    expect(
      overflowFailures,
      `Protected viewport overflow: ${JSON.stringify(overflowFailures)}`
    ).toEqual([]);
  });

  test('renders a blank sample worksheet through the browser print path', async ({ page }) => {
    await page.addInitScript(() => {
      window.__ipmgPrintCalls = 0;
      window.print = () => { window.__ipmgPrintCalls += 1; };
    });

    await page.goto('/');
    await openWorkflow(page, 'samples');
    await expect(page.locator('#sampleWorksheetBlank')).toBeVisible();

    await page.locator('#sampleWorksheetBlank').click();
    await expect.poll(() => page.evaluate(() => window.__ipmgPrintCalls)).toBe(1);
    await expect(page.locator('#sampleWorksheetSheet .sw-page')).toContainText(/Medication Sample|Sample/i);

    // The product deliberately clears its print class after invoking the system dialog.
    // Let that cleanup finish, then restore it so Chromium renders the exact
    // print stylesheet to a PDF without racing the production cleanup timer.
    await page.waitForTimeout(650);
    await page.evaluate(() => document.body.classList.add('print-sample-worksheet'));
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('#sampleWorksheetSheet')).toBeVisible();
    await expect(page.locator('.app-shell')).toBeHidden();

    const pdf = await page.pdf({ format: 'Letter', printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  test('requires a distinct trace and current review for each added sample package', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'samples');

    async function openGuide(id) {
      const guide = page.locator(`#panel-samples [data-guide="${id}"]`);
      await expect(guide).toBeVisible();
      if (!await guide.evaluate(card => card.classList.contains('open'))) {
        await guide.locator('[data-guided-head]').click();
      }
      await expect(guide).toHaveClass(/open/);
    }

    await openGuide('selected');
    await page.locator('#sampleMedChips button').first().click();

    const packageOption = page.locator('#samplePackageButtons button:not(.manual)').first();
    await expect(packageOption).toBeVisible();
    // RC5.38 intentionally starts with no physical package. The first click makes
    // the primary package; the second is the separate package we need to trace.
    await packageOption.click();
    await packageOption.click();

    const doseRow = page.locator('#sampleDoseRows [data-sample-package-trace]');
    const traceRow = page.locator('#samplePackageTraceList [data-sample-package-trace-row]');
    await expect(doseRow).toHaveCount(1);
    await expect(traceRow).toHaveCount(1);

    await openGuide('patient');
    await page.locator('#samplePtName').fill('QA, Browser');
    await page.locator('#sampleDOB').fill('01/02/1990');
    await page.locator('#samplePrescriber').fill('QA Prescriber');
    await page.locator('#sampleStaff').fill('QA Staff');
    await page.locator('#sampleDate').fill('2026-07-29');

    await openGuide('plan');
    await page.locator('#sampleStart').fill('2026-07-29');
    await page.locator('#sampleSig').fill('Take as prescribed.');

    await openGuide('safety');
    await page.locator('#sampleMedCheck').selectOption({ label: 'Prescriber reviewed / ok to dispense' });
    await page.locator('#sampleEdu').selectOption({ label: 'Reviewed with patient' });

    await openGuide('trace');
    await page.locator('#sampleLot').fill('PRIMARY-LOT-42');
    await page.locator('#sampleExp').fill('2027-12');

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 expiration');

    const reviewButton = page.locator('#sampleReviewedToday');
    await openGuide('safety');
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');

    await openGuide('trace');
    await traceRow.locator('[data-sample-package-trace-field="lot"]').fill('SECONDARY-LOT-42');
    await traceRow.locator('[data-sample-package-trace-field="exp"]').fill('2028-01');

    const entries = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ label: 'Primary package', lot: 'PRIMARY-LOT-42', exp: '2027-12' });
    expect(entries[1]).toMatchObject({ label: 'Added package 2', lot: 'SECONDARY-LOT-42', exp: '2028-01' });

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('final dispense review confirmation');
    await expect(page.locator('#samplePrint')).toBeDisabled();

    await openGuide('safety');
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sampleReviewedTodayStatus')).toContainText('Final dispense review confirmed today');
    await expect(page.locator('#samplePrint')).toBeEnabled();

    await openGuide('trace');
    await traceRow.locator('[data-sample-package-trace-field="lot"]').fill('SECONDARY-LOT-43');
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#samplePrint')).toBeDisabled();
  });

  test('gates actual administration, product handling, and exception detail before administration can be documented', async ({ page }) => {
    const disposition = await prepareRoutineInjection(page, {
      patient: 'QA, Conditional',
      includeAdministrationTime: false
    });
    const administered = disposition.locator('[data-disposition="administered"]');

    await expect(disposition).toContainText('Document the actual administration time.');
    await expect(administered).toBeDisabled();

    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminTime').fill('09:41');
    await expect(administered).toBeEnabled();

    await openInjectionCard(page, 'card-trace');
    await page.locator('#injHandlingToggle').click();
    await expect(page.locator('#injHandlingFields')).toBeVisible();
    await page.locator('#injWasteToggle').check();
    await expect(page.locator('#injWasteFields')).toBeVisible();
    await expect(disposition).toContainText('Document the medication waste amount and unit.');
    await expect(administered).toBeDisabled();

    await page.locator('#injWasteAmount').fill('0.2 mL');
    await page.locator('#injWasteWitness').fill('QA Witness');
    await expect(administered).toBeEnabled();

    await openInjectionCard(page, 'card-response');
    await page.locator('#injExceptionToggle').check();
    await expect(page.locator('#injExceptionFields')).toBeVisible();
    await expect(disposition).toContainText('Describe what changed or was observed for the administration exception.');
    await expect(administered).toBeDisabled();

    await page.locator('#injExceptionSummary').fill('Patient reported transient dizziness after injection.');
    await page.locator('#injExceptionRecipient').fill('QA Provider, notified');
    await page.locator('#injExceptionTime').fill('2026-07-30T09:48');
    await page.locator('#injExceptionOutcome').fill('Provider advised seated observation; staff reassessed and reviewed return precautions.');
    await expect(administered).toBeEnabled();
  });

  test('requires a complete product or device issue handoff before producing the dense administration note', async ({ page }) => {
    const disposition = await prepareRoutineInjection(page, {
      patient: 'QA, Product Issue'
    });
    const administered = disposition.locator('[data-disposition="administered"]');

    await openInjectionCard(page, 'card-trace');
    await page.locator('#injHandlingToggle').click();
    await expect(page.locator('#injHandlingFields')).toBeVisible();
    await page.locator('#injProductIssueToggle').check();
    await expect(page.locator('#injProductIssueFields')).toBeVisible();

    await expect(disposition).toContainText('Describe the product or device issue.');
    await expect(disposition).toContainText(
      'Document the action or disposition for the product/device issue.'
    );
    await expect(disposition).toContainText(
      'Document who was notified about the product/device issue, or why notification was not needed.'
    );
    await expect(disposition).toContainText(
      'Document the product/device issue notification or decision time.'
    );
    await expect(disposition).toContainText(
      'Document the direction received for the product/device issue.'
    );
    await expect(disposition).toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeDisabled();

    await page.locator('#injProductIssueDetail').fill(
      'Plunger resistance noted during pre-administration device inspection.'
    );
    await page.locator('#injProductIssueAction').fill(
      'Affected product quarantined; replacement package selected and independently verified.'
    );
    await page.locator('#injProductIssueRecipient').fill(
      'QA Ordering Provider'
    );
    await page.locator('#injProductIssueNotificationTime').fill(
      '2026-07-30T09:35'
    );
    await page.locator('#injProductIssueDirection').fill(
      'Do not use the affected device; proceed only with the verified replacement.'
    );

    await expect(disposition).not.toContainText('Describe the product or device issue.');
    await expect(disposition).toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeDisabled();

    await page.locator('#injProductIssueNextStep').fill(
      'QA Staff will retain the device for clinic follow-up and reconcile the replacement before closeout.'
    );
    await expect(disposition).not.toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeEnabled();

    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText(
      'Administration documented'
    );
    const plan = page.locator('#outPL');
    await expect(plan).toContainText('PRODUCT / DEVICE ISSUE');
    await expect(plan).toContainText(
      'Issue: Plunger resistance noted during pre-administration device inspection.'
    );
    await expect(plan).toContainText(
      'Action / disposition: Affected product quarantined; replacement package selected and independently verified.'
    );
    await expect(plan).toContainText(
      'Notification recipient: QA Ordering Provider'
    );
    await expect(plan).toContainText(
      'Notification / decision time: Jul 30, 2026 at 9:35 AM'
    );
    await expect(plan).toContainText(
      'Direction received: Do not use the affected device; proceed only with the verified replacement.'
    );
    await expect(plan).toContainText(
      'Next step: QA Staff will retain the device for clinic follow-up and reconcile the replacement before closeout.'
    );
  });

  test('formats the administered Tebra copy and preserves new fields in a locked record snapshot', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173'
    });
    const disposition = await prepareRoutineInjection(page, {
      patient: 'QA, Formatted Note',
      medication: 'Haldol Dec.'
    });

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#injOrderPurpose').fill('Active order follow-up context');

    await openInjectionCard(page, 'card-trace');
    await page.locator('#injHandlingToggle').click();
    await page.locator('#injProductSource').selectOption({ label: 'Clinic stock' });

    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminDetailToggle').click();
    await page.locator('#injVolume').fill('2');
    await page.locator('#injVolumeUnit').selectOption('mL');
    await page.locator('#injDevice').selectOption({ label: 'Prefilled syringe' });
    await page.locator('#injSiteCondition').selectOption({ label: 'Skin/site intact before administration' });

    const administered = disposition.locator('[data-disposition="administered"]');
    await expect(administered).toBeEnabled();
    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');
    await expect(page.locator('#outCC')).toContainText('Purpose: Active order follow-up context');
    await expect(page.locator('#outPL')).toContainText('MEDICATION ADMINISTRATION');
    await expect(page.locator('#outPL')).toContainText('Actual administration time: 9:41 AM');
    await expect(page.locator('#outPL')).toContainText('Administration amount: 2 mL');
    await expect(page.locator('#outPL')).toContainText('Delivery device: Prefilled syringe');
    await expect(page.locator('#outPL')).toContainText('Site condition: Skin/site intact before administration');
    await expect(page.locator('#outPL')).toContainText('Response: Tolerated well');
    await expect(page.locator('#outPL')).toContainText('PRODUCT TRACEABILITY');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic stock');
    const injectionPlan = await page.locator('#outPL').innerText();
    expect(injectionPlan).not.toMatch(
      /no (?:immediate complication|swelling)|without acute reaction/i
    );

    const shellCopyAll = page.locator(
      '.cd2004-inspector-window .cd2004-note-heading .cd2004-command-button'
    );
    await expect(shellCopyAll).toBeEnabled();
    await shellCopyAll.click();
    await expect.poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return ['MEDICATION ADMINISTRATION', 'Actual administration time: 9:41 AM', 'PRODUCT TRACEABILITY']
        .every(fragment => copied.includes(fragment));
    }).toBe(true);
    const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedNote).not.toMatch(/(?:^|\n)(?:CC|ASSESSMENT|PLAN):/);

    const complete = page.locator('.cd2004-complete-button');
    await expect(complete).toBeEnabled();
    await complete.click();
    const completionOverlay = page.locator('#injCompletionOverlay');
    const completionCard = completionOverlay.locator('.inj-completion-card');
    await expect(completionOverlay).toBeVisible();
    await expect(completionOverlay.locator('button')).toBeFocused();
    await expect.poll(() =>
      page.locator('.cd2004-shell').evaluate(node => node.inert)
    ).toBe(true);

    const completionVisual = await completionCard.evaluate(node => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      const buttonStyle = getComputedStyle(node.querySelector('button'));
      const receipt = node.querySelector('.inj-completion-receipt');
      return {
        borderRadius: Number.parseFloat(style.borderRadius),
        buttonRadius: Number.parseFloat(buttonStyle.borderRadius),
        fontFamily: style.fontFamily,
        horizontalOverflow: node.scrollWidth - node.clientWidth,
        receiptOverflow: receipt.scrollWidth - receipt.clientWidth,
        insideViewport:
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= innerWidth &&
          bounds.bottom <= innerHeight
      };
    });
    expect(completionVisual.borderRadius).toBeLessThanOrEqual(2);
    expect(completionVisual.buttonRadius).toBeLessThanOrEqual(2);
    expect(completionVisual.fontFamily).toContain('Tahoma');
    expect(completionVisual.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(completionVisual.receiptOverflow).toBeLessThanOrEqual(1);
    expect(completionVisual.insideViewport).toBe(true);
    expect(await maxMotionMilliseconds(completionOverlay, 'animationDuration'))
      .toBeLessThanOrEqual(180);
    expect(await maxMotionMilliseconds(completionCard, 'animationDuration'))
      .toBeLessThanOrEqual(180);

    await page.keyboard.press('Escape');
    await expect(completionOverlay).toBeHidden();
    await expect.poll(() =>
      page.locator('.cd2004-shell').evaluate(node => node.inert)
    ).toBe(false);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    const postedStamp = page.locator('.cd2004-post-stamp');
    await expect(postedStamp).toContainText('POSTED · RECORD LOCKED');
    await expect(page.locator('.cd2004-work-locked-banner'))
      .toContainText('INJECTION POSTED · RECORD LOCKED');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.cd2004-post-stamp, [data-locked-record-action]'))
    )).toBe(true);
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(page.locator('#rc526Flow .rc526-mode b')).toHaveText('Locked injection record');
    await expect(page.locator('#injRecordWorkspace [data-inj-new]')).toHaveAttribute('aria-label', 'Start a new injection');
    await expect(page.locator('#ptName')).toBeDisabled();
    await openInjectionCard(page, 'card-medication');
    await expect(page.locator('#medClear')).toHaveAttribute('aria-disabled', 'true');
    const lockedMedication = await page.locator('#medHdrName').textContent();
    expect(lockedMedication).toBeTruthy();
    await page.locator('#medClear').click();
    await expect(page.locator('#medHdrName')).toHaveText(lockedMedication || '');
    await expect(page.locator('#outPL')).toContainText('Actual administration time: 9:41 AM');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic stock');

    await page.locator('#injAddendumAuthor').fill('QA Addendum Staff');
    await page.locator('#injAddendumText').fill('Saved clarification by the current reviewer.');
    await page.locator('[data-inj-addendum]').click();
    await expect(page.locator('.record-addenda-item').first()).toContainText('QA Addendum Staff');
    await expect(page.locator('.record-addenda-item').first()).toContainText('Saved clarification by the current reviewer.');

    await page.locator('#injAddendumText').fill('Pending clarification that must not be abandoned.');
    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#injAddendumText')).toHaveValue('Pending clarification that must not be abandoned.');
    await expect(page.locator('#injAddendumText')).toBeFocused();
    await expect(page.locator('#ptName')).toHaveValue('QA, Formatted Note');
  });

  test('keeps Forms handoff guidance limited to explicit workflow selections', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'forms');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input').first().fill('QA, Explicit Forms');
    await panel.getByText('Provider review', { exact: true }).click();

    const preview = panel.locator('.wfp-tabpanel .wfp-preview').first();
    await expect(preview).toContainText('Status: Provider review');
    await expect(preview).not.toContainText(
      'Release only after provider approval is confirmed.'
    );
    await expect(preview).not.toContainText('ACTION / FOLLOW-UP');

    // The hidden legacy mirror stays in sync so print/log/readiness keep working.
    await expect.poll(() =>
      page.evaluate(() => document.getElementById('formsPtName')?.value)
    ).toBe('QA, Explicit Forms');
  });

  test('locks a paired aripiprazole initiation with both injection components in the completion receipt', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await openWorkflow(page, 'administer');

    await openInjectionCard(page, 'card-encounter');
    await page.locator('#ptName').fill('QA, Paired Initiation');
    await page.locator('#ptDOB').fill('04/05/1993');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#reasonChips').getByRole('button', { name: 'Initiation', exact: true }).click();

    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Abilify Maintena', exact: true }).click();
    await page.locator('#doseChips').getByRole('button', { name: '400 mg', exact: true }).click();
    await page.locator('#routeChips').getByRole('button', { name: 'IM', exact: true }).click();
    await page.locator('#bodyMap [data-site="R deltoid"]').click();
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    const initiation = page.locator('#initiationProtocolCard');
    await expect(initiation).toBeVisible();
    await initiation.getByRole('button', { name: /1-day initiation/ }).click();
    await page.evaluate(() => {
      const setValue = (id, value) => {
        const control = document.getElementById(id);
        control.value = value;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const setChecked = id => {
        const control = document.getElementById(id);
        control.checked = true;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setChecked('initPlanVerified');
      setValue('initSecondDose', '300 mg');
      setValue('initSecondSite', 'L deltoid');
      setValue('initSecondNdc', '00000-0000-22');
      setValue('initSecondLot', 'PAIR-LOT-2');
      setValue('initSecondExp', '2026-06');
      setChecked('initSecondOrderVerified');
      setChecked('initSecondGiven');
      document.querySelector('[data-init-oral="administered"]').click();
    });
    await expect(initiation).toContainText(
      /2 protocol items still need documentation/
    );

    await openInjectionCard(page, 'card-trace');
    await page.locator('#ndc').fill('00000-0000-11');
    await page.locator('#lot').fill('PAIR-LOT-1');
    await page.locator('#exp').fill('2028-05');

    await openInjectionCard(page, 'card-safety');
    await page.locator('#medSpecChips').getByRole('button', { name: 'Suspension inspected & mixed', exact: true }).click();
    await page.locator('#medSpecChips').getByRole('button', { name: 'Ordered oral initiation plan documented', exact: true }).click();
    await page.locator('#allergies').fill('NKDA verified in active record');
    await page.locator('[data-rc530-noacute]').click();

    await openInjectionCard(page, 'card-response');
    await page.locator('#adminDate').fill('2026-07-30');
    await page.locator('#injAdminTime').fill('10:15');
    await page.locator('#injSecondAdminTime').fill('10:18');
    await page.locator('#admin').fill('QA Staff, MA');

    await openInjectionCard(page, 'card-return');
    await page.locator('#nextDate').fill('2026-08-27');

    const administered = page.locator('#clinicalDisposition [data-disposition="administered"]');
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(administered).toBeDisabled();

    await page.locator('#initSecondDose').fill('400 mg');
    await page.locator('#initSecondDose').press('Tab');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeDisabled();

    await page.locator('#initSecondExp').fill('2028-06');
    await page.locator('#initSecondExp').press('Tab');
    await expect(initiation).toContainText('Protocol fields complete');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeEnabled();
    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    const complete = page.locator('.cd2004-complete-button');
    await expect(complete).toBeEnabled();
    await page.keyboard.press('F10');
    const receipt = page.locator('#injCompletionOverlay .inj-completion-receipt');
    await expect(receipt).toContainText('Component 1');
    await expect(receipt).toContainText('400 mg · IM · R deltoid · at 10:15');
    await expect(receipt).toContainText('NDC 00000-0000-11 · Lot PAIR-LOT-1 · Exp 2028-05');
    await expect(receipt).toContainText('Component 2 · Abilify Maintena');
    await expect(receipt).toContainText('400 mg · IM · L deltoid · at 10:18');
    await expect(receipt).toContainText('NDC 00000-0000-22 · Lot PAIR-LOT-2 · Exp 2028-06');
    const pairedReceiptGeometry = await receipt.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return {
        columns: getComputedStyle(node).gridTemplateColumns
          .split(' ')
          .filter(Boolean).length,
        overflow: node.scrollWidth - node.clientWidth,
        insideViewport:
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight
      };
    });
    expect(pairedReceiptGeometry.columns).toBe(2);
    expect(pairedReceiptGeometry.overflow).toBeLessThanOrEqual(1);
    expect(pairedReceiptGeometry.insideViewport).toBe(true);

    await page.setViewportSize({ width: 320, height: 700 });
    const narrowCompletionGeometry = await page.locator(
      '#injCompletionOverlay .inj-completion-card'
    ).evaluate(node => {
      const overlayBounds = node.parentElement.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const receipt = node.querySelector('.inj-completion-receipt');
      return {
        columns: getComputedStyle(receipt).gridTemplateColumns
          .split(' ')
          .filter(Boolean).length,
        cardOverflow: node.scrollWidth - node.clientWidth,
        receiptOverflow: receipt.scrollWidth - receipt.clientWidth,
        insideOverlay:
          bounds.left >= overlayBounds.left &&
          bounds.right <= overlayBounds.right &&
          bounds.top >= overlayBounds.top &&
          bounds.bottom <= overlayBounds.bottom
      };
    });
    expect(narrowCompletionGeometry.columns).toBe(1);
    expect(narrowCompletionGeometry.cardOverflow).toBeLessThanOrEqual(1);
    expect(narrowCompletionGeometry.receiptOverflow).toBeLessThanOrEqual(1);
    expect(narrowCompletionGeometry.insideOverlay).toBe(true);
    await expectNoHorizontalPageOverflow(page);
  });

  test('round-trips structured injection draft fields through the local records drawer', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    await expect(page.locator('#injRecordWorkspace')).toBeVisible();

    await page.locator('#ptName').fill('QA, Draft Detail');
    await page.locator('#ptDOB').fill('02/03/1991');
    await page.locator('#orderingProvider').fill('QA Draft Provider');
    await openInjectionCard(page, 'card-encounter');
    await page.locator('#injOrderPurpose').fill('Draft order-linked encounter context');
    await openInjectionCard(page, 'card-response');
    await page.locator('#injAdminTime').fill('14:06');

    // Switch immediately: the record lifecycle must flush the pending sub-700 ms
    // autosave instead of losing the most recent structured fields.
    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');

    await page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    ).click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Draft Detail');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#ptName')).toHaveValue('QA, Draft Detail');
    await expect(page.locator('#injOrderPurpose')).toHaveValue('Draft order-linked encounter context');
    await expect(page.locator('#injAdminTime')).toHaveValue('14:06');
  });

  test('preserves unknown historical record fields through open, save, and completion', async ({ page }) => {
    const patient = 'QA, Compatibility Fields';
    const disposition = await prepareRoutineInjection(page, { patient });

    await page.locator('#injRecordWorkspace [data-inj-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // Reload first to cancel any pending fixture-entry autosave before replacing
    // the stored record with a historical compatibility payload.
    await page.reload();
    const recordId = await page.evaluate(patientName => {
      const key = 'ipmgMedAssistInjectionRecordsV1';
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const record = records.find(item => item?.patient?.name === patientName);
      if (!record) throw new Error('Expected the compatibility draft to be stored');

      record.futureRecord = {
        source: 'legacy-import',
        nested: { preserve: 'record-value' }
      };
      record.patient.futurePatient = {
        source: { system: 'historical-ehr', identifier: 'LEGACY-42' }
      };
      record.snapshot.version = 3;
      record.snapshot.futureSnapshot = {
        nested: { preserve: 'snapshot-value' },
        sequence: ['one', { preserve: 'array-value' }]
      };
      record.snapshot.state.futureState = {
        nested: { preserve: 'state-value' }
      };
      record.snapshot.fields.futureField = {
        nested: { preserve: 'field-value' }
      };
      record.snapshot.note.futureNote = {
        nested: { preserve: 'note-value' }
      };
      record.snapshot.initiation = {
        ...(record.snapshot.initiation || {}),
        futureProtocol: {
          nested: { preserve: 'protocol-value' }
        }
      };
      localStorage.setItem(key, JSON.stringify(records));
      return record.id;
    }, patient);

    // Reload so the seeded historical payload becomes the live in-memory record.
    await page.reload();
    await openWorkflow(page, 'administer');
    await page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    ).click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill(patient);
    await page.locator(`[data-records-open="${recordId}"]`).click();
    await expect(page.locator('#ptName')).toHaveValue(patient);

    const readStoredRecord = () => page.evaluate(id => {
      const records = JSON.parse(
        localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]'
      );
      return records.find(item => item?.id === id);
    }, recordId);

    // Opening is read-only with respect to persistence; migration happens only
    // when staff explicitly saves the historical draft.
    const opened = await readStoredRecord();
    expect(opened.snapshot.version).toBe(3);
    expect(opened.snapshot.futureSnapshot.nested.preserve).toBe('snapshot-value');

    await page.locator('#injRecordWorkspace [data-inj-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    const expectedUnknownFields = {
      futureRecord: {
        source: 'legacy-import',
        nested: { preserve: 'record-value' }
      },
      patient: {
        futurePatient: {
          source: { system: 'historical-ehr', identifier: 'LEGACY-42' }
        }
      },
      snapshot: {
        version: 4,
        futureSnapshot: {
          nested: { preserve: 'snapshot-value' },
          sequence: ['one', { preserve: 'array-value' }]
        },
        state: {
          futureState: {
            nested: { preserve: 'state-value' }
          }
        },
        fields: {
          futureField: {
            nested: { preserve: 'field-value' }
          }
        },
        note: {
          futureNote: {
            nested: { preserve: 'note-value' }
          }
        },
        initiation: {
          futureProtocol: {
            nested: { preserve: 'protocol-value' }
          }
        }
      }
    };
    expect(await readStoredRecord()).toMatchObject(expectedUnknownFields);

    const administered = disposition.locator('[data-disposition="administered"]');
    await expect(administered).toBeEnabled();
    await administered.click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    await expect(page.locator('.cd2004-complete-button')).toBeEnabled();
    await page.locator('.cd2004-complete-button').click();
    await expect(page.locator('#injCompletionOverlay')).toBeVisible();

    const completed = await readStoredRecord();
    expect(completed.status).toBe('completed');
    expect(completed.snapshot.version).toBe(4);
    expect(completed).toMatchObject(expectedUnknownFields);
  });

  test('resets smart-vitals state for a new injection and restores it with its draft', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');

    await page.locator('#ptName').fill('QA, Smart Vitals Draft');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Other', exact: true }).click();
    await openInjectionCard(page, 'card-safety');
    await page.locator('[data-rc526-toggle-vitals]').click();
    await expect(page.locator('#rr')).toBeVisible();

    await page.locator('#rr').fill('10');
    await page.locator('#spo2').fill('93');
    await page.locator('#vitalRepeatNote').fill('Repeat sitting after five minutes: 96%.');
    // Blurring the repeat-note field redraws the smart-vitals panel; interact with
    // the freshly rendered recheck action rather than its pre-blur instance.
    await page.locator('#vitalRepeatNote').blur();
    const recheck = page.locator('#vitalsRecheckChip');
    await expect(recheck).toBeVisible();
    await recheck.click();
    await expect(recheck).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#injRecordWorkspace [data-inj-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    await expect(page.locator('#rr')).toHaveValue('');
    await expect(page.locator('#spo2')).toHaveValue('');
    await expect(page.locator('#vitalRepeatNote')).toHaveValue('');
    await expect.poll(() => page.evaluate(() => window.ipmgSmartVitalsSnapshot().recheck)).toBe(false);

    await page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    ).click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Smart Vitals Draft');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#rr')).toHaveValue('10');
    await expect(page.locator('#spo2')).toHaveValue('93%');
    await expect(page.locator('#vitalRepeatNote')).toHaveValue('Repeat sitting after five minutes: 96%.');
    await expect(recheck).toHaveAttribute('aria-pressed', 'true');
  });

  test('clearing the first meaningful draft field cancels autosave without creating a record', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');

    const recordStatus = page.locator('#injRecordStatus');
    // Dispatch both edits in one browser task so the test exercises the actual
    // pre-autosave clear path without becoming timing-sensitive under CI load.
    await page.evaluate(() => {
      const patient = document.getElementById('ptName');
      patient.value = 'QA, Transient Draft';
      patient.dispatchEvent(new Event('input', { bubbles: true }));
      patient.value = '';
      patient.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Let the original 700 ms autosave window elapse before verifying its cancellation.
    await page.waitForTimeout(850);
    await expect(recordStatus).toHaveText('New draft');
    await expect(page.locator('#recordsDrawerCount')).toHaveText('0');
    await expect.poll(() => page.evaluate(() => {
      return JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
    })).toEqual([]);
  });

  test('never reports a draft as saved or abandons it when browser persistence fails', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'ipmgMedAssistInjectionRecordsV1') {
          throw new DOMException('Storage blocked for test', 'QuotaExceededError');
        }
        return nativeSetItem.call(this, key, value);
      };
    });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    await page.locator('#ptName').fill('QA, Persistence Guard');
    await page.locator('#ptDOB').fill('03/04/1992');
    await page.locator('#orderingProvider').fill('QA Provider');

    await page.locator('#injRecordWorkspace [data-inj-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('QA, Persistence Guard');
    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#panel-administer')).not.toHaveClass(/record-readonly/);
  });

  test('uses prior administration context to recommend, but never auto-select, the actual site', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await openWorkflow(page, 'administer');

    await page.locator('#ptName').fill('QA, Smart Rotation');
    await page.locator('#orderingProvider').fill('QA Ordering Provider');
    await openInjectionCard(page, 'card-medication');
    await page.locator('#medChips').getByRole('button', { name: 'Other', exact: true }).click();
    await page.locator('#doseChips input').fill('100 mg');
    await page.locator('#priorDose').fill('2026-07-02');
    await page.locator('#priorSite').selectOption('R deltoid');

    await expect(page.locator('#injPriorContextCopy')).toContainText('A valid alternate is L deltoid');
    await expect(page.locator('#bodyMap .bm-lm.recommended[data-site="L deltoid"]')).toBeVisible();
    await expect(page.locator('#bodyMap .bz-sel,#bodyMap .bm-lm.on')).toHaveCount(0);

    await page.locator('#bodyMap .bm-rot-alt').click();
    await expect(page.locator('#adminGuideSummaryLine')).toContainText('IM · L deltoid');
    await expect(page.locator('#adminGuideDetail')).toHaveClass(/hidden/);
    await expect(page.locator('#panel-administer .card-medication')).not.toHaveClass(/rc530-collapsed/);
    await expect(page.locator('#intChips')).toBeVisible();
    await page.locator('#adminGuideEdit').click();
    await expect(page.locator('#bodyMap')).toBeVisible();
    await expect(page.locator('#bodyMap [role="button"][tabindex="0"]').first()).toBeFocused();
    await page.locator('#intChips').getByRole('button', { name: 'q4 wk', exact: true }).click();

    await openInjectionCard(page, 'card-response');
    await expect(page.locator('#injAdministrationCoreSub')).toContainText('Other · 100 mg · IM · L deltoid');
    await expect(page.locator('#panel-administer .card-response')).not.toHaveClass(/rc530-collapsed/);
    await expect(page.locator('#panel-administer .card-safety')).toHaveClass(/rc530-collapsed/);
    await expect(page.getByLabel('Actual administration time *')).toBeVisible();
  });
});
