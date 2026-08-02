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
    // The workflow tab strip is docked along the bottom edge at every width,
    // so a tab is always directly clickable - no pane switching required.
    const navButton = page.locator(`.cd2004-nav-item[title="${workflowLabels[workflow]}"]`);
    await navButton.scrollIntoViewIfNeeded();
    await navButton.click();
    await expect(shell).toHaveAttribute('data-active-workflow', workflow);
    if (
      workflow === 'forms' ||
      workflow === 'uds' ||
      workflow === 'administer' ||
      workflow === 'samples' ||
      workflow === 'tms' ||
      workflow === 'reference' ||
      workflow === 'log'
    ) {
      // Forms, UDS, Injection, Samples, TMS, Knowledge, and Daily Closeout
      // are migrated to real panels. Forms/UDS/Injection/Samples' legacy
      // #panel-* markup stays loaded hidden as a print/readiness
      // compatibility mirror; TMS, Knowledge, and Daily Closeout have no
      // print/readiness dependency on their own panel being mounted, so
      // their legacy panels are never mounted at all.
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

  async function openInjectionTab(page, tabName) {
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('tab', { name: tabName, exact: true }).click();
    return panel;
  }

  // The records workspace (Save draft / Complete & lock / New) lives inside
  // the hidden legacy #panel-administer mirror with no equivalent control in
  // the new panel, so its buttons are triggered with a plain DOM click
  // (bypassing Playwright's visibility requirement) rather than simulating a
  // pointer click on an element the user can no longer see.
  async function clickInjectionRecordAction(page, selector) {
    await page.evaluate((sel) => {
      const button = document.querySelector(sel);
      if (!button) throw new Error(`Missing injection record action: ${sel}`);
      button.click();
    }, selector);
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
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('input[placeholder="Last, First"]').fill(patient);
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill(dob);
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await panel.getByText('PRN / ordered', { exact: true }).click();

    await openInjectionTab(page, 'Medication');
    await panel.locator('.wfp-field:has-text("Drug") select').selectOption({ label: medication });
    if (medication === 'Other') {
      await panel.locator('.wfp-field:has-text("Dose") input').fill('100 mg');
    } else {
      await panel.locator('.wfp-field:has-text("Dose") select').selectOption('50 mg');
    }
    await panel.locator('input[placeholder="IM / SubQ"]').fill('IM');
    await panel.locator('.wfp-field:has-text("Interval") select').selectOption('q4wk');
    await panel
      .getByText(medication === 'Other' ? 'R deltoid' : 'R ventrogluteal', { exact: true })
      .click();

    await openInjectionTab(page, 'Traceability');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
    await panel.locator('input[placeholder="LOT123"]').fill('BROWSER-LOT-42');
    await panel.locator('input[type="month"]').first().fill('2027-12');

    await openInjectionTab(page, 'Safety');
    if (medication !== 'Other') {
      await panel.getByText('Ordered route / technique verified', { exact: true }).click();
    }
    await panel.locator('input[placeholder*="Verify in active record"]').fill('NKDA verified in active record');
    await panel.getByText('No acute concerns today confirmed', { exact: true }).click();

    await openInjectionTab(page, 'Response');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');
    if (includeAdministrationTime) {
      await panel.locator('input[type="time"]').first().fill(administrationTime);
    }

    await openInjectionTab(page, 'Disposition');
    await panel.locator('input[type="date"]').nth(1).fill('2026-07-30');
    await panel.locator('input[type="date"]').nth(2).fill('2026-08-27');
    return panel;
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
    // Real ARIA menubar rather than <details>: open state is aria-expanded on
    // each menu's title button, so the whole bar can act as one tracking unit.
    const fileTitle = page.locator('.cd2004-menu[data-menu="file"] .cd2004-menu-title');
    const chartTitle = page.locator('.cd2004-menu[data-menu="chart"] .cd2004-menu-title');
    const openTitles = page.locator('.cd2004-menu-title[aria-expanded="true"]');

    await fileTitle.click();
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'true');
    await chartTitle.click();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'true');
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');
    await expect(openTitles).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'false');
    await expect(chartTitle).toBeFocused();

    await fileTitle.click();
    await page.locator('.cd2004-app-title').click();
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');
  });

  test('tracks the menu bar: hovering a sibling switches menus once open', async ({ page }) => {
    await page.goto('/');
    const fileTitle = page.locator('.cd2004-menu[data-menu="file"] .cd2004-menu-title');
    const chartTitle = page.locator('.cd2004-menu[data-menu="chart"] .cd2004-menu-title');

    // Hovering alone does nothing while the bar is idle.
    await chartTitle.hover();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'false');

    // Once any menu is open the bar is in tracking mode, so hovering a
    // sibling switches to it without a second click - native menu behavior.
    await fileTitle.click();
    await chartTitle.hover();
    await expect(chartTitle).toHaveAttribute('aria-expanded', 'true');
    await expect(fileTitle).toHaveAttribute('aria-expanded', 'false');

    // Alt+access key opens a menu directly; arrows move along the bar.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+t');
    await expect(
      page.locator('.cd2004-menu[data-menu="tools"] .cd2004-menu-title')
    ).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('.cd2004-menu[data-menu="help"] .cd2004-menu-title')
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('keeps the navigator, work, and note panels fixed and simultaneously visible', async ({ page }) => {
    await page.goto('/');
    // The navigator is the CPRS-style workflow tab strip along the bottom
    // edge, not a pane - but the contract is unchanged: it is always present.
    const navigator = page.locator('.cd2004-navigator');
    const work = page.locator('.cd2004-work-window');
    const inspector = page.locator('.cd2004-inspector-window');

    // The layout is fixed: every surface a workflow needs is always in its
    // place, with no minimize/maximize/close controls to hide it.
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
    const injectionPanel = page.locator('.wfp-panel');
    await expect(injectionPanel).toBeVisible();

    await injectionPanel.locator('input[placeholder="Last, First"]').fill('QA, Shortcut');
    await injectionPanel.locator('input[placeholder="Provider name"]').fill('QA Provider');
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
    await expect(page.locator('.wfp-panel')).toBeVisible();
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
    const injectionPanel = page.locator('.wfp-panel');
    await injectionPanel.locator('input[placeholder="Last, First"]').fill('Alpha, Patient');
    await injectionPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Alpha, Patient');

    await openWorkflow(page, 'samples');
    const samplesPanel = page.locator('.wfp-panel');
    await expect(page.locator('#samplePtName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#sampleDOB')).toHaveValue('01/02/1990');
    await samplesPanel.locator('input[placeholder="Last, First"]').fill('Bravo, Patient');
    await samplesPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('03/04/1992');

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

    const helpSummary = page.locator('.cd2004-menu[data-menu="help"] .cd2004-menu-title');
    await helpSummary.click();
    // Menu commands are menuitems now, not plain buttons - role="menuitem"
    // overrides the implicit button role, which is the correct ARIA for a menu.
    await page.getByRole('menuitem', { name: 'Keyboard Reference' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard Reference' });
    await expect(dialog).toBeVisible();
    // Opened with the native showModal(), so the platform puts it in the top
    // layer and inerts everything behind it. That is a stronger guarantee than
    // the aria-hidden juggling this previously hand-rolled, and it is what
    // :modal proves - the shell chrome genuinely cannot be reached or focused.
    expect(await dialog.evaluate(node => node.matches(':modal'))).toBe(true);
    expect(await page.evaluate(() => {
      const target = document.querySelector('.cd2004-shell > header button');
      target?.focus();
      return document.activeElement === target;
    })).toBe(false);
    const animationSeconds = await dialog.evaluate(node => {
      const value = getComputedStyle(node).animationDuration;
      return Number.parseFloat(value) * (value.includes('ms') ? 0.001 : 1);
    });
    expect(animationSeconds).toBeLessThanOrEqual(0.001);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(helpSummary).toBeFocused();
    // ...and the shell chrome is reachable again once the dialog closes.
    expect(await page.evaluate(() => {
      const target = document.querySelector('.cd2004-shell > header button');
      target?.focus();
      return document.activeElement === target;
    })).toBe(true);

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

  test('keeps the Samples tab-folder accessible and scoped to one section at a time', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'samples');
    const panel = page.locator('.wfp-panel');
    const tabs = panel.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('tabpanel')).toContainText('Patient / order');

    const planTab = tabs.filter({ hasText: 'Plan & traceability' });
    await planTab.click();
    await expect(planTab).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'false');
    await expect(panel.getByRole('tabpanel')).toContainText('Package traceability');
    await expect(panel.getByRole('tabpanel')).not.toContainText('Patient / order');

    const reviewTab = tabs.filter({ hasText: 'Safety & review' });
    await reviewTab.click();
    await expect(panel.getByRole('tabpanel')).toContainText('Final dispense review');
  });

  test('keeps the single-window task switcher and records drawer contained at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expectNoHorizontalPageOverflow(page);

    // Two panes now (WORK / NOTE): the workflow tab strip is docked along the
    // bottom edge at every width, so it never needs a switcher slot of its own.
    const switcher = page.locator('.cd2004-mobile-switcher');
    await expect(switcher).toBeVisible();
    await expect(switcher.getByRole('tab')).toHaveCount(2);
    const workTab = switcher.getByRole('tab', { name: 'WORK', exact: true });
    const noteTab = switcher.getByRole('tab', { name: 'NOTE', exact: true });
    await expect(workTab).toHaveAttribute('aria-selected', 'true');
    await expect(workTab).toHaveAttribute('aria-controls', 'cd2004-pane-work');
    await expect(workTab).toHaveAttribute('tabindex', '0');
    await expect(page.locator('.cd2004-work-window')).toBeVisible();
    await expect(page.locator('.cd2004-inspector-window')).toBeHidden();
    await expect(page.locator('.cd2004-patient-field').first()).toBeVisible();
    await expect(page.locator('.cd2004-navigator')).toBeVisible();
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

    // The bottom tab strip stays reachable at phone width, so switching
    // workflows never requires leaving the work pane.
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
    // Tolerance for sub-pixel layout rounding, as elsewhere in this file.
    expect(bounds.width).toBeLessThanOrEqual(391);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(recordsButton).toBeFocused();
  });

  test('keeps every clinical workspace contained in side-by-side Tebra widths', async ({ page }) => {
    const widths = [1181, 1040, 700, 390, 320];
    const overflowFailures = [];
    const workflows = [
      ['administer', '.wfp-panel'],
      ['uds', '.wfp-panel'],
      ['samples', '.wfp-panel'],
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

      // Two panes now - work plus the note dock. The workflow tab strip is
      // docked along the bottom at every width rather than occupying a pane.
      const visibleWindows = page.locator('.cd2004-workspace .cd2004-window:visible');
      await expect(page.locator('.cd2004-navigator')).toBeVisible();
      if (width <= 700) {
        await expect(page.locator('.cd2004-mobile-switcher')).toBeVisible();
        await expect(visibleWindows).toHaveCount(1);
      } else {
        await expect(page.locator('.cd2004-mobile-switcher')).toBeHidden();
        await expect(visibleWindows).toHaveCount(2);
      }

      if (width === 1181) {
        const [workBox, inspectorBox] = await Promise.all([
          page.locator('.cd2004-work-window').boundingBox(),
          page.locator('.cd2004-inspector-window').boundingBox()
        ]);
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
    const panel = page.locator('.wfp-panel');
    await panel.getByRole('tab', { name: 'Safety & review' }).click();
    const blankButton = panel.getByRole('button', { name: 'Blank worksheet' });
    await expect(blankButton).toBeVisible();

    await blankButton.click();
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
    const panel = page.locator('.wfp-panel');
    const tabs = panel.getByRole('tab');
    const field = (label) => panel.locator('.wfp-field').filter({ has: page.getByText(label, { exact: true }) });

    await field('Patient name').locator('input').fill('QA, Browser');
    await field('DOB').locator('input').fill('01/02/1990');
    await field('Prescriber').locator('input').fill('QA Prescriber');
    await field('Dispensed by').locator('input').fill('QA Staff');
    await field('Date dispensed').locator('input').fill('2026-07-29');
    await field('Start date').locator('input').fill('2026-07-29');

    await tabs.filter({ hasText: 'Medication' }).click();
    await field('Medication').locator('select').selectOption({ label: 'Vraylar' });
    await field('Patient instructions').locator('textarea').fill('Take as prescribed.');

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await field('Primary package lot #').locator('input').fill('PRIMARY-LOT-42');
    await field('Primary package exp').locator('input').fill('2027-12');

    await panel.getByRole('button', { name: '+ Add package / step' }).click();
    const row = panel.locator('.wfp-table tbody tr').first();
    // RC5.38-equivalent: an added row only becomes a distinct trace-eligible
    // package once it has a non-empty package/quantity value.
    await row.locator('input').nth(0).fill('Vraylar 3 mg capsule');
    await row.locator('input').nth(1).fill('1 box');
    await row.locator('input').nth(3).fill('Then take 1 capsule daily.');

    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('Added package 2 expiration');

    const entriesBeforeTrace = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entriesBeforeTrace).toHaveLength(2);
    expect(entriesBeforeTrace[0]).toMatchObject({ label: 'Primary package', lot: 'PRIMARY-LOT-42', exp: '2027-12' });
    expect(entriesBeforeTrace[1]).toMatchObject({ label: 'Added package 2', lot: '', exp: '' });

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await field('Medication list / interaction check').locator('select')
      .selectOption({ label: 'Prescriber reviewed / ok to dispense' });
    await field('Patient education').locator('select').selectOption({ label: 'Reviewed with patient' });

    const reviewButton = panel.getByRole('button', { name: /reviewed today/i });
    await expect(reviewButton).toBeDisabled();
    await expect(page.locator('#samplePrint')).toBeDisabled();

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await row.locator('input').nth(4).fill('SECONDARY-LOT-42');
    await row.locator('input').nth(5).fill('2028-01');

    const entriesAfterTrace = await page.evaluate(() => window.samplePackageTraceEntries());
    expect(entriesAfterTrace[1]).toMatchObject({ label: 'Added package 2', lot: 'SECONDARY-LOT-42', exp: '2028-01' });
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .not.toContain('Added package 2 lot');
    await expect.poll(() => page.evaluate(() => window.sampleTraceIssues().join(' | ')))
      .toContain('final dispense review confirmation');

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sampleReviewedTodayStatus')).toContainText('Final dispense review confirmed today');
    await expect(page.locator('#samplePrint')).toBeEnabled();

    await tabs.filter({ hasText: 'Plan & traceability' }).click();
    await row.locator('input').nth(4).fill('SECONDARY-LOT-43');

    await tabs.filter({ hasText: 'Safety & review' }).click();
    await expect(reviewButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#samplePrint')).toBeDisabled();
  });

  test('gates actual administration, product handling, and exception detail before administration can be documented', async ({ page }) => {
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Conditional',
      includeAdministrationTime: false
    });
    // The legacy #clinicalDisposition element stays loaded (hidden) as a
    // compatibility mirror target; it keeps computing its own stop list and
    // disabled state from the same fields this panel mirrors into it.
    const disposition = page.locator('#clinicalDisposition');
    const administered = disposition.locator('[data-disposition="administered"]');

    await expect(disposition).toContainText('Document the actual administration time.');
    await expect(administered).toBeDisabled();

    await openInjectionTab(page, 'Response');
    await panel.locator('input[type="time"]').first().fill('09:41');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Traceability');
    await panel.getByText('Document medication waste', { exact: true }).click();
    await expect(disposition).toContainText('Document the medication waste amount and unit.');
    await expect(administered).toBeDisabled();

    await panel.locator('.wfp-field:has-text("Waste amount") input').fill('0.2 mL');
    await panel.locator('.wfp-field:has-text("Waste witness") input').fill('QA Witness');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Response');
    await panel
      .getByText('Administration exception / escalation', { exact: false })
      .click();
    await expect(disposition).toContainText('Describe what changed or was observed for the administration exception.');
    await expect(administered).toBeDisabled();

    await panel
      .locator('.wfp-field:has-text("What changed") textarea')
      .fill('Patient reported transient dizziness after injection.');
    await panel
      .locator('.wfp-field:has-text("Recipient notified") input')
      .fill('QA Provider, notified');
    await panel
      .locator('.wfp-field:has-text("Notification / decision time") input')
      .fill('2026-07-30T09:48');
    await panel
      .locator('.wfp-field:has-text("Direction, action, and next step") textarea')
      .fill('Provider advised seated observation; staff reassessed and reviewed return precautions.');
    await expect(administered).toBeEnabled();
  });

  test('requires a complete product or device issue handoff before producing the dense administration note', async ({ page }) => {
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Product Issue'
    });
    const disposition = page.locator('#clinicalDisposition');
    const administered = disposition.locator('[data-disposition="administered"]');

    await openInjectionTab(page, 'Traceability');
    await panel.getByText('Document product or device issue', { exact: true }).click();

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

    await panel
      .locator('.wfp-field:has-text("Product / device issue") textarea')
      .fill('Plunger resistance noted during pre-administration device inspection.');
    await panel
      .locator('.wfp-field:has-text("Immediate action") textarea')
      .fill('Affected product quarantined; replacement package selected and independently verified.');
    await panel
      .locator('.wfp-field:has-text("Recipient notified") input')
      .fill('QA Ordering Provider');
    await panel
      .locator('.wfp-field:has-text("Notification / decision time") input')
      .fill('2026-07-30T09:35');
    await panel
      .locator('.wfp-field:has-text("Direction received") textarea')
      .fill('Do not use the affected device; proceed only with the verified replacement.');

    await expect(disposition).not.toContainText('Describe the product or device issue.');
    await expect(disposition).toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeDisabled();

    await panel
      .locator('.wfp-field:has-text("Next step / owner / timing") textarea')
      .fill('QA Staff will retain the device for clinic follow-up and reconcile the replacement before closeout.');
    await expect(disposition).not.toContainText(
      'Document the next step, owner, and timing for the product/device issue.'
    );
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Disposition');
    await panel.getByText('Review complete — document administration', { exact: true }).click();
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
    const panel = await prepareRoutineInjection(page, {
      patient: 'QA, Formatted Note',
      medication: 'Haldol Dec.'
    });
    const disposition = page.locator('#clinicalDisposition');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Active order follow-up context');

    await openInjectionTab(page, 'Traceability');
    await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic stock' });

    await openInjectionTab(page, 'Response');
    await panel.locator('.wfp-field:has-text("Administration amount") input').fill('2');
    await panel.locator('.wfp-field:has-text("Unit") select').selectOption('mL');
    await panel.locator('.wfp-field:has-text("Delivery device") select').selectOption({ label: 'Prefilled syringe' });
    await panel
      .locator('.wfp-field:has-text("Site condition") select')
      .selectOption({ label: 'Skin/site intact before administration' });

    await openInjectionTab(page, 'Disposition');
    const administered = disposition.locator('[data-disposition="administered"]');
    await expect(administered).toBeEnabled();
    await panel.getByText('Review complete — document administration', { exact: true }).click();
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
    await expect(page.locator('#medClear')).toHaveAttribute('aria-disabled', 'true');
    await expect(panel.getByText('Record locked', { exact: true })).toBeVisible();
    await openInjectionTab(page, 'Encounter');
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeDisabled();
    await openInjectionTab(page, 'Disposition');
    const lockedMedication = await page.locator('#medHdrName').textContent();
    expect(lockedMedication).toBeTruthy();
    await expect(page.locator('#outPL')).toContainText('Actual administration time: 9:41 AM');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic stock');

    // The addenda-authoring UI lives entirely inside the hidden legacy
    // record workspace; the new panel provides its own addendum section
    // (outside the disabled fieldset) that mirrors into the same hidden
    // fields and record so this stays reachable by a real user.
    const addendumTextField = panel.locator('.wfp-field:has-text("Dated addendum") textarea');
    await panel.locator('.wfp-field:has-text("Addendum entered by") input').fill('QA Addendum Staff');
    await addendumTextField.fill('Saved clarification by the current reviewer.');
    await panel.getByText('Save addendum', { exact: true }).click();
    await expect(page.locator('.record-addenda-item').first()).toContainText('QA Addendum Staff');
    await expect(page.locator('.record-addenda-item').first()).toContainText('Saved clarification by the current reviewer.');

    await addendumTextField.fill('Pending clarification that must not be abandoned.');
    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-new]');
    await expect(addendumTextField).toHaveValue('Pending clarification that must not be abandoned.');
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
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Paired Initiation');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await panel.getByText('Initiation', { exact: true }).click();

    await openInjectionTab(page, 'Medication');
    await panel.locator('.wfp-field:has-text("Drug") select').selectOption({ label: 'Abilify Maintena' });
    await panel.locator('.wfp-field:has-text("Dose") select').selectOption('400 mg');
    await panel.locator('input[placeholder="IM / SubQ"]').fill('IM');
    await panel.getByText('R deltoid', { exact: true }).click();
    await panel.locator('.wfp-field:has-text("Interval") select').selectOption('q4wk');

    // #initiationProtocolCard stays loaded (hidden) as a compatibility mirror
    // target; readiness/validation text assertions against it don't need
    // visibility, only the interactive steps move to the new panel below.
    const initiation = page.locator('#initiationProtocolCard');
    await panel.getByText('1-day initiation', { exact: true }).click();
    // Scoped to the option row rather than a bare getByText: the same stop
    // message also appears verbatim in the "Outstanding requirements" list
    // once the 1-day protocol is selected but not yet plan-verified.
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'Active provider initiation/re-initiation order' })
      .click();
    await panel.locator('.wfp-field:has-text("Component 2 — dose") input').fill('300 mg');
    await panel.locator('.wfp-field:has-text("Component 2 — site") select').selectOption('L deltoid');
    await panel.locator('.wfp-field:has-text("Component 2 — NDC") input').fill('00000-0000-22');
    await panel.locator('.wfp-field:has-text("Component 2 — Lot") input').fill('PAIR-LOT-2');
    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').fill('2026-06');
    await panel.getByText('Exact product and dose verified against the active order', { exact: true }).click();
    await panel.getByText('Injection component 2 was actually administered today', { exact: true }).click();
    await panel.getByText('Administered today', { exact: true }).click();
    await expect(initiation).toContainText(
      /2 protocol items still need documentation/
    );

    await openInjectionTab(page, 'Traceability');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-11');
    await panel.locator('input[placeholder="LOT123"]').fill('PAIR-LOT-1');
    await panel.locator('input[type="month"]').first().fill('2028-05');

    await openInjectionTab(page, 'Safety');
    await panel.getByText('Suspension inspected and mixed', { exact: true }).click();
    await panel.getByText('Ordered oral initiation plan documented', { exact: true }).click();
    await panel.locator('input[placeholder*="Verify in active record"]').fill('NKDA verified in active record');
    await panel.getByText('No acute concerns today confirmed', { exact: true }).click();

    await openInjectionTab(page, 'Response');
    await panel.locator('input[type="time"]').first().fill('10:15');
    await panel.locator('.wfp-field:has-text("Component 2 actual time") input').fill('10:18');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');

    await openInjectionTab(page, 'Disposition');
    await panel.locator('input[type="date"]').nth(1).fill('2026-07-30');
    await panel.locator('input[type="date"]').nth(2).fill('2026-08-27');

    const administered = page.locator('#clinicalDisposition [data-disposition="administered"]');
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(administered).toBeDisabled();

    await openInjectionTab(page, 'Medication');
    await panel.locator('.wfp-field:has-text("Component 2 — dose") input').fill('400 mg');
    await panel.locator('.wfp-field:has-text("Component 2 — dose") input').press('Tab');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeDisabled();

    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').fill('2028-06');
    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').press('Tab');
    await expect(initiation).toContainText('Protocol fields complete');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeEnabled();
    await openInjectionTab(page, 'Disposition');
    await panel.getByText('Review complete — document administration', { exact: true }).click();
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
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Draft Detail');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('02/03/1991');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Draft Provider');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Draft order-linked encounter context');
    await openInjectionTab(page, 'Response');
    await panel.locator('input[type="time"]').first().fill('14:06');

    // Switch immediately: the record lifecycle must flush the pending sub-700 ms
    // autosave instead of losing the most recent structured fields.
    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-new]');
    await expect(page.locator('#ptName')).toHaveValue('');
    // The new panel must reset its own typed state too, not just the hidden
    // legacy mirror fields, when the active record genuinely changes.
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    ).click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Draft Detail');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#ptName')).toHaveValue('QA, Draft Detail');
    await expect(page.locator('#injOrderPurpose')).toHaveValue('Draft order-linked encounter context');
    await expect(page.locator('#injAdminTime')).toHaveValue('14:06');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Draft Detail');
    await expect(
      panel.locator('.wfp-field:has-text("Verified active-order purpose") input')
    ).toHaveValue('Draft order-linked encounter context');
  });

  test('preserves unknown historical record fields through open, save, and completion', async ({ page }) => {
    const patient = 'QA, Compatibility Fields';
    await prepareRoutineInjection(page, { patient });
    const disposition = page.locator('#clinicalDisposition');

    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-save]');
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

    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-save]');
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
    await openInjectionTab(page, 'Disposition');
    await page.locator('.wfp-panel').getByText('Review complete — document administration', { exact: true }).click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    await expect(page.locator('.cd2004-complete-button')).toBeEnabled();
    await page.locator('.cd2004-complete-button').click();
    await expect(page.locator('#injCompletionOverlay')).toBeVisible();

    const completed = await readStoredRecord();
    expect(completed.status).toBe('completed');
    expect(completed.snapshot.version).toBe(4);
    expect(completed).toMatchObject(expectedUnknownFields);
  });

  test('resets vitals for a new injection and restores them with its draft', async ({ page }) => {
    // The legacy "smart vitals" reveal-toggle/repeat-note/recheck-chip nudge
    // (window.ipmgSmartVitalsSnapshot) is a UI-only ergonomic layer with no
    // typed-encounter field of its own and no live interactive path through
    // the new panel (its reveal button lives in the now-hidden legacy DOM).
    // This test focuses on what the new panel actually owns: RR/SpO2 values
    // persisting correctly across New/reopen through the local draft store.
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Vitals Draft');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await openInjectionTab(page, 'Medication');
    await panel.locator('.wfp-field:has-text("Drug") select').selectOption({ label: 'Other' });
    await openInjectionTab(page, 'Safety');
    await panel.locator('.wfp-field:has-text("RR") input').fill('10');
    await panel.locator('.wfp-field:has-text("SpO2") input').fill('93');

    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-save]');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-new]');
    await expect(page.locator('#ptName')).toHaveValue('');
    await expect(page.locator('#rr')).toHaveValue('');
    await expect(page.locator('#spo2')).toHaveValue('');
    await openInjectionTab(page, 'Encounter');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await openInjectionTab(page, 'Safety');
    await expect(panel.locator('.wfp-field:has-text("RR") input')).toHaveValue('');
    await expect(panel.locator('.wfp-field:has-text("SpO2") input')).toHaveValue('');

    await page.locator(
      '.cd2004-toolbar-button[aria-label="Injection Records"]'
    ).click();
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Smart Vitals Draft');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#rr')).toHaveValue('10');
    await expect(page.locator('#spo2')).toHaveValue('93');
    await openInjectionTab(page, 'Safety');
    await expect(panel.locator('.wfp-field:has-text("RR") input')).toHaveValue('10');
    await expect(panel.locator('.wfp-field:has-text("SpO2") input')).toHaveValue('93');
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
    const persistencePanel = page.locator('.wfp-panel');
    await persistencePanel.locator('input[placeholder="Last, First"]').fill('QA, Persistence Guard');
    await persistencePanel.locator('input[placeholder="MM/DD/YYYY"]').fill('03/04/1992');
    await persistencePanel.locator('input[placeholder="Provider name"]').fill('QA Provider');

    await clickInjectionRecordAction(page, '#injRecordWorkspace [data-inj-new]');
    await expect(page.locator('#ptName')).toHaveValue('QA, Persistence Guard');
    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#panel-administer')).not.toHaveClass(/record-readonly/);
  });

  test('uses prior administration context to recommend, but never auto-select, the actual site', async ({ page }) => {
    // The legacy interactive body-map (recommended/quick-rotate CSS classes,
    // auto-collapsing cards) has been replaced by a plain list-based site
    // picker per the approved redesign; this test now covers that picker's
    // equivalent guarantees: a recommended-site badge is shown, but nothing
    // is ever pre-selected on the user's behalf.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Encounter');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Rotation');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');

    await openInjectionTab(page, 'Medication');
    await panel.locator('.wfp-field:has-text("Drug") select').selectOption({ label: 'Other' });
    await panel.locator('.wfp-field:has-text("Dose") input').fill('100 mg');
    await panel.locator('.wfp-field:has-text("Interval") select').selectOption('q4wk');

    await openInjectionTab(page, 'Disposition');
    await panel.locator('input[type="date"]').first().fill('2026-07-02');
    await panel.locator('.wfp-field:has-text("Prior site") select').selectOption('R deltoid');

    await openInjectionTab(page, 'Medication');
    await expect(panel.locator('.wfp-section-head', { hasText: 'Administration site' })).toContainText(
      'rotate: L deltoid'
    );
    await expect(panel.locator('.wfp-option-row.is-selected')).toHaveCount(0);

    await panel.getByText('L deltoid', { exact: true }).click();
    await expect(
      panel.locator('.wfp-option-row', { hasText: 'L deltoid' })
    ).toHaveClass(/is-selected/);
    await expect(panel.locator('.wfp-option-row.is-selected')).toHaveCount(1);

    await openInjectionTab(page, 'Response');
    await expect(panel.locator('input[type="time"]').first()).toBeVisible();
  });
});
