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

  async function confirmLocalAttestation(page) {
    const dialog = page.getByRole('dialog', { name: 'Attest & lock local record' });
    const acknowledgement = dialog.getByRole('checkbox', {
      name: /^I attest that I reviewed this local record before locking it\./
    });
    const confirm = dialog.getByRole('button', {
      name: 'Attest & lock local record',
      exact: true
    });

    await expect(dialog).toBeVisible();
    // The safe route is the initial focus; attesting is deliberately gated.
    await expect(dialog.getByRole('button', { name: 'Back to editing', exact: true }))
      .toBeFocused();
    await expect(confirm).toBeDisabled();
    await acknowledgement.check();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toBeHidden();
  }

  async function signInLocalStaff(page, staff = 'QA Staff, MA') {
    await page.locator('.cd2004-menu[data-menu="tools"] .cd2004-menu-title').click();
    await page.getByRole('menuitem', { name: 'Staff sign-in…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Staff Sign-In' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name or initials' }).fill(staff);
    await dialog.getByRole('button', { name: 'Use for encounter', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.cd2004-banner-staff')).toContainText(staff);
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
    await signInLocalStaff(page);
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill(patient);
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill(dob);
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'PRN / ordered' });

    await panel.locator('select[name="inj-medication"]').selectOption({ label: medication });
    if (medication === 'Other') {
      await panel.locator('input[name="inj-dose"]').fill('100 mg');
    } else {
      await panel.locator('select[name="inj-dose"]').selectOption('50 mg');
    }
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await openInjectionTab(page, 'Administration');
    if (medication === 'Haldol Dec.' || medication === 'Prolixin Dec.') {
      await panel
        .locator('input[placeholder="Actual site / location per active order"]')
        .fill('R ventrogluteal per active order');
    } else {
      await panel
        .getByText(medication === 'Other' ? 'R deltoid' : 'R ventrogluteal', { exact: true })
        .click();
    }

    await openInjectionTab(page, 'Product');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-42');
    await panel.locator('input[placeholder="LOT123"]').fill('BROWSER-LOT-42');
    await panel.locator('input[type="month"]').first().fill('2027-12');

    await openInjectionTab(page, 'Verification');
    // A medication-specific verification is only rendered where its current
    // reference applies. Haldol/Prolixin intentionally do not carry the
    // retired blanket Z-track verification in the new clinical bundle.
    const orderedTechnique = panel.getByText('Ordered route / technique verified', { exact: true });
    if (await orderedTechnique.first().isVisible()) {
      await orderedTechnique.first().click();
    }
    await panel
      .locator('.wfp-field:has-text("Allergy status") input')
      .fill('NKDA confirmed in this local record');
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'No acute concerns today confirmed' })
      .click();

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');
    await panel.locator('input[type="date"]').first().fill('2026-07-30');
    if (includeAdministrationTime) {
      await panel.locator('input[type="time"]').first().fill(administrationTime);
    }

    await openInjectionTab(page, 'Schedule');
    await panel.locator('input[type="date"]').nth(1).fill('2026-08-27');
    return panel;
  }

  test('boots in a clearly local environment and exposes the local EMR record list', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/');
    await expect(page.locator('.cd2004-shell')).toBeVisible();
    await expect(page.locator('.cd2004-app-title')).toContainText('MEDICATION ADMINISTRATION');
    await expect(page.locator('.cd2004-app-environment')).toContainText('LOCAL / TRAINING');
    await expect(page.locator('.cd2004-app-environment')).not.toContainText('LIVE');
    const chartBanner = page.locator('.cd2004-patient-banner');
    await expect(chartBanner).toHaveClass(/is-no-active-chart/);
    await expect(chartBanner).not.toHaveClass(/has-active-chart/);
    await expect(chartBanner).toContainText('NO ACTIVE CHART');
    await expect(chartBanner.getByRole('button', { name: 'Select local record' })).toBeVisible();
    await openWorkflow(page, 'administer');

    // The persistent Record List rail is the one compact navigator. There is
    // intentionally no duplicate top Save / Records / Note command toolbar.
    await expect(page.locator('[role="toolbar"][aria-label="Clinical commands"]')).toHaveCount(0);
    const drawerLauncher = page.getByRole('button', {
      name: /Open saved local records \(F11\)/
    });
    await expect(drawerLauncher).toBeVisible();
    await drawerLauncher.click();

    const drawer = page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    // The records window is a native <dialog> opened with showModal(), so the
    // platform inerts the background instead of an author setting .inert on
    // the shell. Assert the guarantee itself: it is the modal, and a control
    // behind it genuinely cannot take focus.
    await expect.poll(() =>
      page.locator('.records-drawer-layer').evaluate(node => node.matches(':modal'))
    ).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const behind = document.querySelector('.cd2004-nav-item');
      behind?.focus();
      return document.activeElement === behind;
    })).toBe(false);
    await expect(page.locator('[data-records-filter="draft"]')).toBeVisible();
    // The records list is a centred modal selection window, not an edge
    // drawer, so the contract is that it sits centred in its layer - equal
    // gap on both sides - rather than flush to the right edge.
    await expect.poll(() => drawer.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const layerBounds = node.parentElement.getBoundingClientRect();
      const leftGap = bounds.left - layerBounds.left;
      const rightGap = layerBounds.right - bounds.right;
      return Math.round(Math.abs(leftGap - rightGap));
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
    expect(drawerVisual.headerBackground).toContain('linear-gradient');
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
    // No inverse focusability probe here: focusing a background control to
    // prove it is reachable would itself steal the focus that the next
    // assertion checks was restored to the launcher.
    await expect(drawerLauncher).toBeFocused();
    expect(pageErrors).toEqual([]);
  });

  test('uses the keyboard-accessible MEDITECH record list, launchers, and workflow routing', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');
    const navigator = page.locator('.cd2004-navigator');
    const home = page.locator('.cd2004-nav-item[title="Start Center"]');
    const administer = page.locator('.cd2004-nav-item[title="Injection"]');

    await expect(navigator).toHaveAttribute(
      'aria-label',
      'Record List and clinical functions'
    );
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
    await page.locator('.cd2004-nav-item[title="UDS"]').click();
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

  test('keeps each local activity in one Start Center queue register', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-08-03T10:30:00-07:00'));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem(
        'ipmgMedAssistActivityLog_2026-08-03',
        JSON.stringify([
          {
            time: '9:18 AM',
            type: 'injection',
            status: 'completed',
            pt: 'Rivera, Jordan',
            summary: 'Routine administration completed'
          },
          {
            time: '9:42 AM',
            type: 'uds',
            status: 'needs_review',
            pt: 'Chen, Avery',
            summary: 'Preliminary result requires review'
          },
          {
            time: '10:06 AM',
            type: 'sample',
            status: 'completed',
            pt: 'Morgan, Casey',
            summary: 'Package traceability complete'
          }
        ])
      );
    });
    await page.goto('/');

    const workQueue = page.locator('.cd2004-worklist-table');
    await expect(page.getByRole('heading', { name: 'Current Worklist' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /All Work/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Needs Review/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Today/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Saved Drafts/ })).toBeVisible();
    await expect(workQueue.getByText('Chen, Avery', { exact: true })).toHaveCount(1);
    await expect(workQueue.locator('tbody tr')).toHaveCount(3);
    await page.getByRole('tab', { name: /Needs Review/ }).click();
    await expect(workQueue.locator('tbody tr')).toHaveCount(1);
    await expect(workQueue.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.locator('.cd2004-activity-list')).toHaveCount(0);
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

  test('keeps the navigator fixed and adds document context only inside a clinical workflow', async ({ page }) => {
    await page.goto('/');
    // The MEDITECH-style right verb strip is persistent; documentation stays
    // inside the central child workspace instead of occupying that rail.
    const navigator = page.locator('.cd2004-navigator');
    const work = page.locator('.cd2004-work-window');
    const inspector = page.locator('.cd2004-inspector-window');

    // Start Center is a single worklist surface. A clinical worksheet then
    // owns the work and document-review pair without redundant window chrome.
    await expect(navigator).toBeVisible();
    await expect(navigator.getByText('Clinical Work', { exact: true })).toBeVisible();
    await expect(navigator.getByText('Reference', { exact: true })).toBeVisible();
    await expect(navigator.getByText('Closeout', { exact: true })).toBeVisible();
    await expect(navigator.locator('.cd2004-nav-item > i')).toHaveCount(0);
    await expect(navigator.locator('.meditech-nav-icon svg')).toHaveCount(8);
    await expect(work).toBeVisible();
    await expect(inspector).toHaveCount(0);
    await expect(page.locator('.cd2004-caption-button')).toHaveCount(0);

    await openWorkflow(page, 'uds');
    await expect(navigator).toBeVisible();
    await expect(work).toBeVisible();
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('.cd2004-window-title')).toContainText(
      'Clinical Documentation'
    );
    await expect(inspector.locator('.cd2004-note-mode')).toHaveText('READ ONLY · LOCAL');
    await expect(navigator.locator('.cd2004-inspector-window')).toHaveCount(0);
  });

  test('routes the Client/Server function-key profile without unsafe global shortcuts', async ({ page }) => {
    await page.goto('/');
    const shell = page.locator('.cd2004-shell');
    const deck = page.locator('[role="toolbar"][aria-label="MEDITECH function key commands"]');

    await expect(deck).toBeVisible();
    await expect(deck).toContainText('F1');
    await expect(deck).toContainText('F6');
    await expect(deck).toContainText('F7');
    await expect(deck).toContainText('F8');
    await expect(deck).toContainText('F9');
    await expect(deck).toContainText('F11');
    await expect(deck).toContainText('F12');
    await expect(deck).toContainText('Esc');
    await expect(deck).not.toContainText('F3');
    await expect(deck).not.toContainText('F4');
    await expect(deck).not.toContainText('F10');

    await page.keyboard.press('F1');
    const helpDialog = page.getByRole('dialog', { name: 'Keyboard Reference' });
    await expect(helpDialog).toBeVisible();
    await expect(helpDialog).toContainText(/next section/i);
    await expect(helpDialog).toContainText(/previous section/i);
    await expect(helpDialog).toContainText(/next page/i);
    await expect(helpDialog).toContainText(/previous page/i);
    await expect(helpDialog).toContainText(/local record list/i);
    await page.keyboard.press('Escape');
    await expect(helpDialog).toBeHidden();

    await page.keyboard.press('Alt+2');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    const injectionPanel = page.locator('.wfp-panel');
    const patientName = injectionPanel.locator('input[placeholder="Last, First"]');
    await patientName.fill('QA, Shortcut');
    await injectionPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    await injectionPanel.locator('input[placeholder="Provider name"]').fill('QA Provider');

    // F6 / Shift+F6 move through the current worksheet's sections, rather
    // than opening records as the retired key map did.
    await patientName.focus();
    const sectionBefore = await page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    );
    await page.keyboard.press('F6');
    const sectionAfter = await page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    );
    expect(sectionAfter).not.toBe(sectionBefore);
    await page.keyboard.press('Shift+F6');
    await expect.poll(() => page.evaluate(() =>
      document.activeElement?.closest('.wfp-section')
        ?.querySelector('.wfp-section-head')?.textContent?.trim()
    )).toBe(sectionBefore);

    // F7 / Shift+F7 cycle the selected worksheet page (tab).
    await expect(injectionPanel.getByRole('tab', { name: 'Order', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('F7');
    await expect(injectionPanel.getByRole('tab', { name: 'Schedule', exact: true }))
      .toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Shift+F7');
    await expect(injectionPanel.getByRole('tab', { name: 'Order', exact: true }))
      .toHaveAttribute('aria-selected', 'true');

    // F8 cycles worksheet → Record List rail → command deck, never a hidden
    // note-pane-only shortcut.
    await patientName.focus();
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.meditech-record-list'))
    )).toBe(true);
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.meditech-command-deck'))
    )).toBe(true);
    await page.keyboard.press('F8');
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('.cd2004-work-window'))
    )).toBe(true);

    // F9 provides the truthful contextual local lookup; F11 is the direct
    // Local EMR / Record List accelerator.
    await patientName.focus();
    await page.keyboard.press('F9');
    const drawer = page.locator('.records-drawer-layer');
    await expect(drawer).toBeVisible();
    await expect(page.locator('#recordsDrawerSearch')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.keyboard.press('F11');
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await patientName.focus();
    await page.keyboard.press('F12');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // Retired global F3/F4/F10 bindings must be inert; Finish is only the
    // explicit worksheet lifecycle action. Escape cannot navigate home or
    // discard this editable local draft.
    await page.keyboard.press('F3');
    await page.keyboard.press('F4');
    await page.keyboard.press('F10');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.getByRole('dialog', { name: 'Attest & lock local record' }))
      .toBeHidden();
    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-active-workflow', 'administer');
    await expect(patientName).toHaveValue('QA, Shortcut');
    await expect(page.locator('[data-injection-record-actions]')).toContainText('SAVED LOCAL DRAFT');
  });

  test('routes typed workflows through the clinical coordinator and files only editable injection drafts', async ({ page }) => {
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
    await expect(page.locator('.cd2004-shell')).toHaveAttribute(
      'data-active-workflow',
      'uds'
    );
    await page.keyboard.press('F12');
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

  test('keeps non-injection activity logging distinct from the injection lifecycle', async ({ page }) => {
    await page.goto('/');

    await openWorkflow(page, 'uds');
    await expect(
      page.locator('.wfp-panel').getByRole('button', { name: 'Log as needs review', exact: true })
    ).toBeVisible();

    await openWorkflow(page, 'samples');
    const sampleLog = page.locator('.wfp-panel').getByRole('button', {
      name: 'Finalize dispense & add to daily log',
      exact: true,
    });
    await expect(sampleLog).toBeDisabled();
    await expect(sampleLog).toHaveAttribute('title', /Complete the documented safety/i);

    await openWorkflow(page, 'forms');
    await expect(
      page.locator('.wfp-panel').getByRole('button', { name: 'Log as needs review', exact: true })
    ).toBeVisible();

    await openWorkflow(page, 'administer');
    await expect(
      page.locator('.wfp-panel').getByRole('button', { name: 'Add to daily activity', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('[data-injection-record-actions]')).toContainText(
      'First blocker:'
    );
  });

  test('projects untouched typed workflows as pending instead of falsely confirmed', async ({ page }) => {
    await page.goto('/');
    const inspector = page.locator('.cd2004-inspector-window');

    for (const workflow of ['administer', 'uds', 'samples', 'forms']) {
      await openWorkflow(page, workflow);
      const readiness = inspector.locator('.cd2004-readiness-list');
      await expect(readiness.locator('.cd2004-readiness-item')).not.toHaveCount(0);
      await expect(readiness.locator('.cd2004-readiness-item.is-pending')).not.toHaveCount(0);
      await expect(readiness.locator('.cd2004-readiness-item.is-complete')).toHaveCount(0);
      await expect(readiness).not.toContainText('Typed engine shadow');
    }

    await openWorkflow(page, 'administer');
    await expect(page.locator('[data-injection-record-actions]')).toContainText(
      'First blocker:'
    );
    await expect(page.locator('[data-injection-record-actions] [data-injection-finish]'))
      .toBeDisabled();
  });

  test('soft-syncs empty workflows and never overwrites a started patient context', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const injectionPanel = page.locator('.wfp-panel');
    await injectionPanel.locator('input[placeholder="Last, First"]').fill('Alpha, Patient');
    await injectionPanel.locator('input[placeholder="MM/DD/YYYY"]').fill('01/02/1990');
    // A typed draft alone is not a selected chart. Filing a local draft gives
    // the banner a truthful local record context and only then turns it green.
    await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/is-no-active-chart/);
    await page.keyboard.press('F12');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');
    await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/has-active-chart/);
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
    await expect(page.locator('.cd2004-patient-banner')).toContainText('NO ACTIVE CHART');

    await openWorkflow(page, 'uds');
    await expect(page.locator('#udsPtName')).toHaveValue('Bravo, Patient');
    await expect(page.locator('#udsDOB')).toHaveValue('03/04/1992');

    await openWorkflow(page, 'administer');
    await expect(page.locator('#ptName')).toHaveValue('Alpha, Patient');
    await expect(page.locator('#ptDOB')).toHaveValue('01/02/1990');
    // Returning to the saved Injection draft restores its own local chart
    // context. There is no longer a competing global-context warning once
    // this record is the active local record.
    await expect(page.locator('.cd2004-context-mismatch')).toHaveCount(0);
    await expect(page.locator('.cd2004-patient-banner')).toHaveClass(/has-active-chart/);
    await expect(page.locator('.cd2004-patient-primary')).toContainText('Alpha, Patient');
  });

  test('honors reduced-motion while preserving all desktop commands', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.evaluate(() =>
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )).toBe(true);

    const transitionSeconds = await page.locator('.meditech-command-deck button').first().evaluate(node =>
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

    const recordsButton = page.getByRole('button', {
      name: /Open saved local records \(F11\)/
    });
    await recordsButton.click();
    const drawer = page.locator('.records-drawer');
    await expect(drawer).toBeVisible();
    expect(await maxMotionMilliseconds(drawer, 'transitionDuration'))
      .toBeLessThanOrEqual(1);
    // The hand-rolled scrim element is gone: the dialog's ::backdrop is the
    // platform's, and a pseudo-element cannot be measured through a locator.
    // The window itself carries the motion contract.
    expect(await maxMotionMilliseconds(drawer, 'animationDuration'))
      .toBeLessThanOrEqual(1);
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

  test('blocks mobile layouts without losing an in-progress workstation entry', async ({ page }) => {
    await page.setViewportSize({ width: 840, height: 720 });
    await page.goto('/');
    await expectNoHorizontalPageOverflow(page);

    await openWorkflow(page, 'administer');
    const patientName = page.locator('.wfp-panel input[placeholder="Last, First"]');
    await patientName.fill('QA, Resize Safety');
    await expect(patientName).toHaveValue('QA, Resize Safety');
    await expect(page.locator('.meditech-workstation-gate')).toHaveCount(0);
    await expect(page.locator('.meditech-command-deck')).toBeVisible();
    await expect(page.locator('.meditech-context-rail')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const gate = page.locator('.meditech-workstation-gate');
    await expect(gate).toBeVisible();
    await expect(gate).toBeFocused();
    await expect(gate).toContainText('Workstation view required');
    await expect(gate).toContainText('800 x 600 px');
    await expect(page.locator('.meditech-workstation-content')).toHaveAttribute('inert', '');
    await expect(page.locator('.meditech-workstation-content')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.cd2004-shell')).toBeHidden();
    await expect(page.locator('.cd2004-mobile-switcher')).toHaveCount(0);
    await expect(page.locator('.meditech-mobile-command-surface')).toHaveCount(0);
    await page.keyboard.press('F11');
    await expect(page.locator('.records-drawer')).toBeHidden();
    await expectNoHorizontalPageOverflow(page);

    // Landscape phones are blocked by the workstation's minimum height too.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(gate).toBeVisible();

    // Resizing is a display gate, not a destructive navigation event.
    await page.setViewportSize({ width: 840, height: 720 });
    await expect(gate).toHaveCount(0);
    await expect(page.locator('.cd2004-shell')).toBeVisible();
    await expect(patientName).toHaveValue('QA, Resize Safety');
  });

  test('keeps every clinical workspace contained at supported workstation widths', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 1181, height: 900 },
      { width: 1040, height: 900 },
      { width: 840, height: 720 },
      { width: 800, height: 600 }
    ];
    const overflowFailures = [];
    const workflows = [
      ['administer', '.wfp-panel'],
      ['uds', '.wfp-panel'],
      ['samples', '.wfp-panel'],
      ['forms', '.wfp-panel']
    ];

    for (const { width, height } of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?responsive=${width}x${height}`);
      await expectNoHorizontalPageOverflow(page);

      const shellBox = await page.locator('.cd2004-shell').boundingBox();
      expect(shellBox).not.toBeNull();
      expect(shellBox.x).toBeGreaterThanOrEqual(0);
      expect(shellBox.width).toBeLessThanOrEqual(width);

      // Start Center owns one worklist window. Clinical workflows add the
      // documentation child window throughout the supported desktop range.
      const visibleWindows = page.locator('.cd2004-workspace .cd2004-window:visible');
      await expect(page.locator('.cd2004-navigator')).toBeVisible();
      await expect(visibleWindows).toHaveCount(1);
      await expect(page.locator('.cd2004-mobile-switcher')).toHaveCount(0);

      for (const [tab, selector] of workflows) {
        await openWorkflow(page, tab);
        await expect(page.locator(selector)).toBeVisible();
        await expect(visibleWindows).toHaveCount(2);
        const inspectorBox = await page
          .locator('.cd2004-inspector-window')
          .boundingBox();
        expect(inspectorBox.x).toBeGreaterThanOrEqual(0);
        expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(width + 1);
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
    // Let both the legacy 500 ms cleanup and the print-hardening 1 s fallback
    // finish, then restore it so Chromium renders the exact print stylesheet
    // without racing the production cleanup timer on a loaded CI runner.
    await page.waitForTimeout(1_100);
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

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="time"]').first().fill('09:41');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Product');
    await panel.getByText('Document medication waste', { exact: true }).click();
    await expect(disposition).toContainText('Document the medication waste amount and unit.');
    await expect(administered).toBeDisabled();

    await panel.locator('.wfp-field:has-text("Waste amount") input').fill('0.2 mL');
    await panel.locator('.wfp-field:has-text("Waste witness") input').fill('QA Witness');
    await expect(administered).toBeEnabled();

    await openInjectionTab(page, 'Outcome');
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

    await openInjectionTab(page, 'Product');
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

    await openInjectionTab(page, 'Outcome');
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

    await openInjectionTab(page, 'Order');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Active order follow-up context');

    await openInjectionTab(page, 'Product');
    await panel.locator('.wfp-field:has-text("Medication source") select').selectOption({ label: 'Clinic sample' });

    await openInjectionTab(page, 'Administration');
    await panel.locator('.wfp-field:has-text("Administration amount") input').fill('2');
    await panel.locator('.wfp-field:has-text("Unit") select').selectOption('mL');
    await panel.locator('.wfp-field:has-text("Delivery device") select').selectOption({ label: 'Prefilled syringe' });
    await panel
      .locator('.wfp-field:has-text("Site condition") select')
      .selectOption({ label: 'Skin/site intact before administration' });

    await openInjectionTab(page, 'Outcome');
    const administered = panel
      .locator('label.wfp-option-row', { hasText: 'Review complete' })
      .locator('input[type="radio"]');
    await expect(administered).toBeEnabled();
    await administered.check();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');
    // RC6.1's compact Plan carries the strongest single administration
    // sentence, compact military date/time, response wording, and
    // traceability - not every individual field entered on the worksheet
    // (order purpose, administration amount, delivery device, and site
    // condition are intentionally not part of the compact rhythm).
    await expect(page.locator('#outPL')).toContainText(
      'Administration: Haldol Dec. 50 mg IM administered to R ventrogluteal per active order using aseptic technique.'
    );
    await expect(page.locator('#outPL')).toContainText('Date/time: 7/30/26 0941.');
    await expect(page.locator('#outPL')).toContainText('Response: Pt tolerated inj well');
    await expect(page.locator('#outPL')).toContainText('Traceability: NDC 00000-0000-42');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic sample');

    const shellCopyAll = page
      .locator('.cd2004-inspector-window')
      .getByRole('button', { name: 'Copy note', exact: true });
    await expect(shellCopyAll).toBeEnabled();
    await shellCopyAll.click();
    await expect.poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      return ['Administration: Haldol Dec.', 'Date/time: 7/30/26 0941', 'Traceability: NDC 00000-0000-42']
        .every(fragment => copied.includes(fragment));
    }).toBe(true);
    const copiedNote = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedNote).not.toMatch(/(?:^|\n)(?:CC|ASSESSMENT|PLAN):/);

    // Only the worksheet lifecycle strip can begin the lock. The preview is
    // read-only, and a local attestation confirms the exact record context.
    await expect(
      page.locator('.cd2004-inspector-window [data-injection-finish]')
    ).toHaveCount(0);
    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    const attestationDialog = page.getByRole('dialog', {
      name: 'Attest & lock local record'
    });
    await expect(attestationDialog).toContainText('QA, Formatted Note');
    await expect(attestationDialog).toContainText(/Haldol Dec/i);
    await expect(attestationDialog).toContainText('QA Staff, MA');
    await expect(
      attestationDialog.getByRole('button', { name: 'Attest & lock local record', exact: true })
    ).toBeDisabled();
    await attestationDialog.getByRole('button', { name: 'Back to editing', exact: true }).click();
    await expect(attestationDialog).toBeHidden();
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    const lockedLifecycle = page.locator('[data-injection-record-actions]');
    await expect(lockedLifecycle).toContainText('LOCAL RECORD LOCKED');
    await expect(lockedLifecycle.locator('[data-locked-record-action]')).toBeFocused();
    await expect(page.locator('.cd2004-post-stamp')).toHaveCount(0);
    await expect(page.locator('.cd2004-work-locked-banner')).toHaveCount(0);
    await expect(page.locator('#injCompletionOverlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      const records = JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]');
      return records.find(record => record?.patient?.name === 'QA, Formatted Note')?.attestation;
    })).toMatchObject({
      staff: 'QA Staff, MA',
      statementVersion: 'local-attestation-v1'
    });
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(page.locator('#rc526Flow .rc526-mode b')).toHaveText('Locked injection record');
    const lockedStartNew = page.locator(
      '[data-injection-record-actions] [data-injection-new]'
    );
    await expect(lockedStartNew).toBeVisible();
    await expect(lockedStartNew).toHaveAccessibleName('Start new injection');
    await expect(page.locator('#ptName')).toBeDisabled();
    await expect(page.locator('#medClear')).toHaveAttribute('aria-disabled', 'true');
    await expect(panel.getByText('Read only', { exact: true })).toBeVisible();
    await openInjectionTab(page, 'Order');
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeDisabled();
    await openInjectionTab(page, 'Outcome');
    const lockedMedication = await page.locator('#medHdrName').textContent();
    expect(lockedMedication).toBeTruthy();
    await expect(page.locator('#outPL')).toContainText('Date/time: 7/30/26 0941.');
    await expect(page.locator('#outPL')).toContainText('Product source: Clinic sample');

    // The addenda-authoring UI lives entirely inside the hidden legacy
    // record workspace; the new panel provides its own addendum section
    // (outside the disabled fieldset) that mirrors into the same hidden
    // fields and record so this stays reachable by a real user.
    const addendumTextField = panel.locator('.wfp-field:has-text("Dated addendum") textarea');
    await lockedLifecycle.getByRole('button', { name: 'Add dated addendum' }).click();
    await expect(addendumTextField).toBeFocused();
    await panel.locator('.wfp-field:has-text("Addendum entered by") input').fill('QA Addendum Staff');
    await addendumTextField.fill('Saved clarification by the current reviewer.');
    await panel.getByText('Save addendum', { exact: true }).click();
    await expect(page.locator('.record-addenda-item').first()).toContainText('QA Addendum Staff');
    await expect(page.locator('.record-addenda-item').first()).toContainText('Saved clarification by the current reviewer.');

    await addendumTextField.fill('Pending clarification that must not be abandoned.');
    await lockedStartNew.click();
    await expect(addendumTextField).toHaveValue('Pending clarification that must not be abandoned.');
    await expect(page.locator('#ptName')).toHaveValue('QA, Formatted Note');
  });

  test('keeps Forms handoff guidance limited to explicit workflow selections', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'forms');
    const panel = page.locator('.wfp-panel');
    await panel.locator('input').first().fill('QA, Explicit Forms');
    await panel.locator('select[name="forms-status"]').selectOption({ label: 'Provider review' });

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

  test('locks a paired aripiprazole initiation while retaining both components in the local record', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await signInLocalStaff(page);
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Paired Initiation');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Initiation' });

    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Abilify Maintena' });
    await panel.locator('select[name="inj-dose"]').selectOption('400 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await openInjectionTab(page, 'Administration');
    await panel.getByText('R deltoid', { exact: true }).click();

    await openInjectionTab(page, 'Schedule');

    // #initiationProtocolCard stays loaded (hidden) as a compatibility mirror
    // target; readiness/validation text assertions against it don't need
    // visibility, only the interactive steps move to the new panel below.
    const initiation = page.locator('#initiationProtocolCard');
    await panel.getByText('1-day initiation', { exact: true }).click();
    // Scoped to the option row rather than a bare getByText: the same stop
    // message also appears verbatim in the "Outstanding requirements"
    // floating window (opened from the status chip) once the 1-day protocol
    // is selected but not yet plan-verified.
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'Active provider initiation/re-initiation order' })
      .click();
    await panel.locator('.wfp-field:has-text("Component 2 — dose") input').fill('300 mg');
    await panel.locator('.wfp-field:has-text("Component 2 — site") select').selectOption('L deltoid');
    await panel.locator('.wfp-field:has-text("Component 2 — NDC") input').fill('00000-0000-22');
    await panel.locator('.wfp-field:has-text("Component 2 — Lot") input').fill('PAIR-LOT-2');
    await panel.locator('.wfp-field:has-text("Component 2 — Exp") input').fill('2026-06');
    await panel.locator('label[for="init-second-order"]').click();
    await panel.locator('label[for="init-second-given"]').click();
    await panel.locator('select[name="init-oral"]').selectOption({ label: 'Administered today' });
    await expect(initiation).toContainText(
      /2 protocol items still need documentation/
    );

    await openInjectionTab(page, 'Product');
    await panel.locator('input[placeholder="00000-0000-00"]').fill('00000-0000-11');
    await panel.locator('input[placeholder="LOT123"]').fill('PAIR-LOT-1');
    await panel.locator('input[type="month"]').first().fill('2028-05');

    await openInjectionTab(page, 'Verification');
    await panel
      .locator('label.wfp-option-row')
      .filter({ hasText: /^Suspension inspected and mixed/ })
      .click();
    await panel
      .locator('label.wfp-option-row')
      .filter({ hasText: /^Ordered oral initiation plan documented/ })
      .click();
    await panel
      .locator('.wfp-field:has-text("Allergy status") input')
      .fill('NKDA confirmed in this local record');
    await panel
      .locator('.wfp-checkbox-row label', { hasText: 'No acute concerns today confirmed' })
      .click();

    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="date"]').first().fill('2026-07-30');
    await panel.locator('input[type="time"]').first().fill('10:15');
    await panel.locator('.wfp-field:has-text("Component 2 actual time") input').fill('10:18');
    await panel.locator('input[placeholder="J. Doe, LVN"]').fill('QA Staff, MA');

    await openInjectionTab(page, 'Schedule');
    await panel.locator('input[type="date"]').nth(1).fill('2026-08-27');

    await openInjectionTab(page, 'Outcome');
    const administered = page.locator('#clinicalDisposition [data-disposition="administered"]');
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(page.locator('#clinicalDisposition')).toContainText(
      'The Abilify Maintena 1-day pathway requires matching paired doses'
    );
    await expect(administered).toBeDisabled();

    await openInjectionTab(page, 'Schedule');
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
    // Changing the exact component strength deliberately clears its package
    // traceability; the old NDC could refer to the prior 300 mg component.
    await panel.locator('#inj-component2-ndc').fill('00000-0000-22');
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Document the NDC for injection component 2.'
    );
    await expect(page.locator('#clinicalDisposition')).not.toContainText(
      'Injection component 2 expiration appears past; obtain in-date product before documenting administration.'
    );
    await expect(administered).toBeEnabled();
    await openInjectionTab(page, 'Outcome');
    await panel.getByText('Review complete — document administration', { exact: true }).click();
    await expect(page.locator('#clinicalDispositionBadge')).toHaveText('Administration documented');

    const finish = page.locator('[data-injection-record-actions] [data-injection-finish]');
    await expect(finish).toBeEnabled();
    await finish.click();
    await confirmLocalAttestation(page);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    // The worksheet preview remains the meaningful source for each component;
    // no legacy completion receipt or global F10 action owns this transition.
    // The compact note documents both components' dose/site (Administration)
    // and both components' lot/NDC/expiration (Traceability) - not just the
    // primary injection's.
    await expect(page.locator('#outPL')).toContainText(
      'Administration: Abilify Maintena 400 mg IM administered to R deltoid using aseptic technique.'
    );
    await expect(page.locator('#outPL')).toContainText(
      'Component 2 — Abilify Maintena 400 mg IM administered to L deltoid.'
    );
    await expect(page.locator('#outPL')).toContainText('Traceability: NDC 00000-0000-11 · Lot PAIR-LOT-1 · Exp 05/2028.');
    await expect(page.locator('#outPL')).toContainText('Component 2 — NDC 00000-0000-22 · Lot PAIR-LOT-2 · Exp 06/2028.');
    await expect(page.locator('#injCompletionOverlay')).toBeHidden();
    await expectNoHorizontalPageOverflow(page);
  });

  test('round-trips structured injection draft fields through the local records drawer', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Draft Detail');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('02/03/1991');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Draft Provider');
    await panel.locator('.wfp-field:has-text("Verified active-order purpose") input').fill('Draft order-linked encounter context');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await panel.locator('input[name="inj-route"]').fill('IM');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await openInjectionTab(page, 'Administration');
    await panel.locator('input[type="time"]').first().fill('14:06');

    // Switch immediately through the visible lifecycle control: it must flush
    // the pending sub-700 ms autosave instead of losing structured fields.
    await page.locator('[data-injection-record-actions] [data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    // The new panel must reset its own typed state too, not just the hidden
    // legacy mirror fields, when the active record genuinely changes.
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Draft Detail');
    await page.locator('[data-records-open]').click();

    await expect(page.locator('#ptName')).toHaveValue('QA, Draft Detail');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Draft Detail');
    await expect(
      panel.locator('.wfp-field:has-text("Verified active-order purpose") input')
    ).toHaveValue('Draft order-linked encounter context');
    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('input[type="time"]').first()).toHaveValue('14:06');
  });

  test('keeps visible injection actions explicit and distinguishes new from discard', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    const actions = page.locator('[data-injection-record-actions]');
    const save = actions.locator('[data-injection-save]');
    const finish = actions.locator('[data-injection-finish]');
    const startNew = actions.locator('[data-injection-new]');
    const discard = actions.locator('[data-injection-discard]');

    await expect(actions).toContainText('INJECTION RECORD');
    await expect(actions).toContainText('NEW LOCAL DRAFT');
    await expect(save).toHaveAccessibleName('Save local draft F12');
    await expect(finish).toHaveAccessibleName('Attest & lock local record');
    await expect(startNew).toHaveAccessibleName('Start new injection');
    await expect(discard).toHaveAccessibleName('Discard local draft...');
    await startNew.focus();
    await expect(page.locator('.cd2004-status-message')).toContainText('Start new injection');
    await panel.locator('input[placeholder="Last, First"]').focus();
    await expect(page.locator('.cd2004-status-message')).toContainText('Patient name');
    await expect(save).toBeDisabled();
    await expect(finish).toBeDisabled();
    await expect(startNew).toBeEnabled();
    await expect(discard).toBeDisabled();

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Visible Lifecycle');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('04/05/1993');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Lifecycle Provider');

    await expect(save).toBeEnabled();
    await expect(discard).toBeEnabled();
    await save.click();
    await expect(actions).toContainText('SAVED LOCAL DRAFT');
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    // New is safe navigation: it retains the saved draft rather than deleting it.
    await startNew.click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect(actions).toContainText('NEW LOCAL DRAFT');
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]')
        .some(record => record?.patient?.name === 'QA, Visible Lifecycle')
    )).toBe(true);

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Discard Me');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Lifecycle Provider');
    await expect(discard).toBeEnabled();
    await discard.click();
    const discardDialog = page.getByRole('dialog', { name: 'Discard Local Draft' });
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog).toContainText('QA, Discard Me');
    await discardDialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Discard Me');

    await discard.click();
    await discardDialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]')
        .some(record => record?.patient?.name === 'QA, Discard Me')
    )).toBe(false);
  });

  test('opens a saved injection record through the Start Center local worklist', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');
    const actions = page.locator('[data-injection-record-actions]');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Start Center Open');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('05/06/1994');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Start Center Provider');
    await actions.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await openWorkflow(page, 'home');
    const records = page.locator('.cd2004-worklist-table');
    const savedDraftsTab = page.getByRole('tab', { name: /Saved Drafts/ });
    await expect(savedDraftsTab).toContainText('1');
    await savedDraftsTab.click();
    await expect(records).toContainText('QA, Start Center Open');
    await records.getByRole('button', { name: 'Resume', exact: true }).click();

    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.locator('#ptName')).toHaveValue('QA, Start Center Open');
    await expect(panel.locator('input[placeholder="Provider name"]')).toHaveValue(
      'QA Start Center Provider',
    );
  });

  test('keeps an editable injection draft in place when Escape is pressed', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Safe Exit');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('06/07/1995');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Safe Exit Provider');
    await page.keyboard.press('Escape');

    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('QA, Safe Exit');
    await expect(page.locator('[data-injection-record-actions]')).not.toContainText(
      'LOCAL RECORD LOCKED'
    );
  });

  test('opens a legacy local lock without migrating unknown historical fields', async ({ page }) => {
    const patient = 'QA, Compatibility Fields';
    // Preserve payload compatibility without turning a historical lock into a new workflow.
    await prepareRoutineInjection(page, { patient });

    await page.locator('[data-injection-record-actions] [data-injection-save]').click();
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
      // A historical lock has no new local-attestation payload. It must still
      // render safely as a read-only legacy lock rather than being forced
      // through the modern typed readiness/attestation flow.
      record.status = 'completed';
      record.completedAt = '2026-07-30T09:41:00.000Z';
      localStorage.setItem(key, JSON.stringify(records));
      return record.id;
    }, patient);

    // Reload so the seeded historical payload becomes the live in-memory record.
    await page.reload();
    await openWorkflow(page, 'administer');
    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill(patient);
    await expect(page.locator(`[data-records-open="${recordId}"]`)).toContainText('Legacy lock');
    await page.locator(`[data-records-open="${recordId}"]`).click();
    await expect(page.locator('#ptName')).toHaveValue(patient);
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-post-state', 'posted');
    await expect(page.locator('#panel-administer')).toHaveClass(/record-readonly/);
    await expect(
      page.locator('[data-injection-record-actions] [data-injection-new]')
    ).toBeVisible();

    const readStoredRecord = () => page.evaluate(id => {
      const records = JSON.parse(
        localStorage.getItem('ipmgMedAssistInjectionRecordsV1') || '[]'
      );
      return records.find(item => item?.id === id);
    }, recordId);

    // Opening a legacy lock is read-only with respect to persistence. It must
    // neither migrate the historical snapshot nor invent an attestation.
    const opened = await readStoredRecord();
    expect(opened.snapshot.version).toBe(3);
    expect(opened.snapshot.futureSnapshot.nested.preserve).toBe('snapshot-value');

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
        version: 3,
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

    // A legacy local lock is deliberately not reopened as an editable modern
    // attestation flow.
    expect(opened.status).toBe('completed');
    expect(opened.attestation).toBeUndefined();
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

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Vitals Draft');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');
    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await openInjectionTab(page, 'Verification');
    await panel.getByRole('button', { name: 'Show vitals (optional)' }).click();
    await panel.locator('.wfp-field:has-text("RR") input').fill('10');
    await panel.locator('.wfp-field:has-text("SpO2") input').fill('93');

    const actions = page.locator('[data-injection-record-actions]');
    await actions.locator('[data-injection-save]').click();
    await expect(page.locator('#injRecordStatus')).toHaveText('Saved');

    await actions.locator('[data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('');
    await openInjectionTab(page, 'Order');
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await openInjectionTab(page, 'Verification');
    // Vitals are hidden by default on a genuinely blank draft - their
    // absence here (rather than an empty-valued field) is itself the
    // "no leftover vitals" assertion.
    await expect(panel.getByRole('button', { name: 'Show vitals (optional)' })).toBeVisible();
    await expect(panel.locator('.wfp-field:has-text("RR") input')).toHaveCount(0);
    await expect(panel.locator('.wfp-field:has-text("SpO2") input')).toHaveCount(0);

    await page.keyboard.press('F11');
    await expect(page.locator('[role="dialog"][aria-labelledby="recordsDrawerTitle"]')).toBeVisible();
    await page.locator('#recordsDrawerSearch').fill('QA, Smart Vitals Draft');
    await page.locator('[data-records-open]').click();

    await openInjectionTab(page, 'Verification');
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

    await page.locator('[data-injection-record-actions] [data-injection-new]').click();
    await expect(page.locator('#ptName')).toHaveValue('QA, Persistence Guard');
    await expect(page.locator('#injRecordStatus')).toHaveText('Save failed');
    await expect(page.locator('#injRecordStatus')).toHaveAttribute('role', 'status');
    await expect(page.locator('#panel-administer')).not.toHaveClass(/record-readonly/);
  });

  test('uses prior administration context to auto-select a valid rotated site', async ({ page }) => {
    // The legacy interactive body-map (recommended/quick-rotate CSS classes,
    // auto-collapsing cards) has been replaced by an icon-tile site picker
    // per the approved redesign. A valid alternate now saves the MA a click,
    // while the recommendation remains visible for confirmation.
    await page.setViewportSize({ width: 840, height: 720 });
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await openInjectionTab(page, 'Order');
    await panel.locator('input[placeholder="Last, First"]').fill('QA, Smart Rotation');
    await panel.locator('input[placeholder="Provider name"]').fill('QA Ordering Provider');

    await openInjectionTab(page, 'Order');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Other' });
    await panel.locator('input[name="inj-dose"]').fill('100 mg');
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await openInjectionTab(page, 'Schedule');
    await panel.locator('input[type="date"]').first().fill('2026-07-02');
    await panel.locator('.wfp-field:has-text("Prior site") select').selectOption('R deltoid');

    await openInjectionTab(page, 'Administration');
    await expect(panel.locator('.wfp-section-head', { hasText: 'Actual administration location' })).toContainText(
      'rotate: L deltoid'
    );
    await expect(
      panel.locator('.wfp-site-tile', { hasText: 'L deltoid' })
    ).toHaveClass(/is-selected/);
    await expect(panel.locator('.wfp-site-tile.is-selected')).toHaveCount(1);

    // Site and the administration time now share the Administration block, so
    // the actual-time field is reachable without leaving the tab.
    await expect(panel.locator('input[type="time"]').first()).toBeVisible();
  });

  // Fills the UDS specimen block for a given device. Everything below is the
  // documentation any point-of-care screen needs regardless of which cup was
  // used, so each device scenario starts from the same place.
  async function fillUdsSpecimen(page, panel, device) {
    const field = (label) => panel.locator('.wfp-field').filter({ hasText: label });
    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('input[placeholder="MM/DD/YYYY"]').fill('06/11/1988');
    await panel.locator('input[placeholder="Staff initials / name"]').fill('A. Rivera, MA');
    await panel.locator('input[type="datetime-local"]').fill('2026-08-03T09:15');
    await panel.locator('select[name="uds-temperature"]').selectOption('acceptable');
    await field('Device').locator('select').selectOption(device);
    await panel.locator('input[placeholder="LOT123"]').fill('UDS4471');
    await panel.locator('input[type="month"]').fill('2027-04');
    await panel.locator('select[name="uds-control"]').selectOption('valid');
  }

  test('keeps the analyte a 13-panel cup omits out of every bulk result action', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 13-Panel Cup');
    await panel.locator('.wfp-field').filter({ hasText: 'Panel not on this' })
      .locator('select').selectOption('PPX');
    await page.locator('#uds-readings-verified').check();

    await panel.getByRole('tab', { name: /^Results/ }).click();
    const omittedRow = panel.locator('.wfp-grid-row', { hasText: 'Propoxyphene' });
    // The cup physically has no PPX window, so the row carries no result
    // control at all - there is nothing to click into a stop.
    await expect(omittedRow).toHaveClass(/is-not-on-cup/);
    await expect(omittedRow.locator('.wfp-grid-toggle')).toHaveCount(0);

    // The obvious shortcut has to leave the encounter finishable. Before this
    // guard it wrote a negative into the omitted analyte and immediately
    // blocked the screen on a stop the operator never chose.
    await panel.getByRole('button', { name: 'All tested negative' }).click();
    await expect(panel.locator('.wfp-status-flag')).toHaveText('Ready');

    await panel.getByRole('button', { name: 'THC positive · rest negative' }).click();
    await expect(omittedRow).toContainText('Not on this cup');
    await expect(panel.locator('.wfp-issue-row')).toHaveCount(0);
  });

  test('renders the UDS clinician view as a dense preliminary laboratory report', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    await page.getByRole('tab', { name: 'Interpretation' }).click();

    const report = page.locator('.meditech-lab-sheet');
    await expect(report).toBeVisible();
    await expect(report).toContainText('POINT OF CARE LABORATORY');
    await expect(report).toContainText('PRELIMINARY / PRESUMPTIVE');
    await expect(report.locator('.meditech-lab-results tbody tr')).toHaveCount(14);
    await expect(report.locator('th')).toHaveText([
      'TEST / ANALYTE',
      'RESULT',
      'FLAG',
      'EXPECTED',
      'STATUS'
    ]);
    await expect(page.getByRole('button', { name: 'Print clinician report' })).toBeVisible();
  });

  test('lets an uncatalogued point-of-care cup reach a finishable screen', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'Other point-of-care UDS cup');

    // Both confirmations the engine gates an uncatalogued device on must be
    // reachable. The readings confirmation used to render only for the two
    // catalogued cups, and the panel-set confirmation never survived the
    // round-trip through the legacy mirror, so this path could not finish.
    await page.locator('#uds-custom-panel-verified').check();
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await panel.getByRole('button', { name: 'All tested negative' }).click();

    await expect(panel.locator('.wfp-status-flag')).toHaveText('Ready');
    await expect(panel.locator('.wfp-issue-row')).toHaveCount(0);
  });

  test('saves a local UDS draft and resumes it from the UDS records window', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');

    await panel.locator('.cd2004-record-actions button.is-save').click();
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-draft/);
    await expect(panel.locator('.cd2004-record-actions-state strong')).toHaveText('SAVED LOCAL DRAFT');

    await panel.getByRole('button', { name: 'UDS records…' }).click();
    const recordsDialog = page.locator('[role="dialog"][aria-labelledby="udsRecordsDrawerTitle"]');
    await expect(recordsDialog).toBeVisible();
    const rows = recordsDialog.locator('.records-drawer-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('.records-drawer-row-title')).toHaveText('Rivera, Ana');
    await expect(rows.locator('.records-drawer-row-badge')).toHaveText('Draft');

    // Start new UDS screen from the records window blanks the worksheet, and
    // the saved draft stays listed rather than being lost.
    await recordsDialog.getByRole('button', { name: 'Start new UDS screen' }).click();
    await expect(recordsDialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');

    await panel.getByRole('button', { name: 'UDS records…' }).click();
    await expect(recordsDialog).toBeVisible();
    await expect(recordsDialog.locator('.records-drawer-row')).toHaveCount(1);
    await recordsDialog.locator('.records-drawer-row').click();
    await expect(recordsDialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('Rivera, Ana');
  });

  test('discards a local UDS draft only after explicit confirmation', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await panel.locator('.cd2004-record-actions button.is-save').click();

    await panel.locator('.cd2004-record-actions button.is-danger').click();
    const dialog = page.getByRole('dialog', { name: 'Discard Local Draft' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('editable local UDS screen draft');

    // Keep editing leaves the draft intact.
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('Rivera, Ana');

    await panel.locator('.cd2004-record-actions button.is-danger').click();
    await dialog.getByRole('button', { name: 'Discard draft' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.locator('input[placeholder="Last, First"]')).toHaveValue('');
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-new/);
  });

  test('attests and locks a local UDS record, then accepts a dated addendum', async ({ page }) => {
    await page.goto('/');
    await signInLocalStaff(page, 'QA Staff, MA');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await panel.getByRole('button', { name: 'All tested negative' }).click();
    await panel.getByRole('tab', { name: /^Interpretation/ }).click();

    const attestButton = panel.locator('.cd2004-record-actions button.is-primary');
    await expect(attestButton).toBeEnabled();
    await attestButton.click();

    const attestDialog = page.getByRole('dialog', { name: 'Attest & lock local record' });
    await expect(attestDialog).toBeVisible();
    await expect(attestDialog).toContainText('SAFE life 14-Panel Cup');
    await attestDialog.getByRole('checkbox', { name: /I attest that I reviewed/ }).check();
    await attestDialog.getByRole('button', { name: 'Attest & lock local record', exact: true }).click();
    await expect(attestDialog).toBeHidden();

    await expect(panel.locator('.wfp-status-flag.is-idle')).toHaveText('Read only');
    await expect(panel.locator('.cd2004-record-actions')).toHaveClass(/is-locked/);

    await panel.getByRole('tab', { name: /^Specimen/ }).click();
    await expect(panel.locator('input[placeholder="Last, First"]')).toBeDisabled();
    await panel.getByRole('tab', { name: /^Interpretation/ }).click();

    const addendumBox = panel.locator('textarea[data-addendum-input]');
    await addendumBox.fill('Follow-up clarification.');
    await panel.getByRole('button', { name: 'Save addendum' }).click();
    await expect(panel.locator('.wfp-preview', { hasText: 'Follow-up clarification.' })).toBeVisible();
    await expect(addendumBox).toHaveValue('');
  });

  test('keeps printing available on a locked UDS record that carries a warning', async ({ page }) => {
    // A preliminary positive is a genuine finding, not a fixable data-entry
    // problem - it must never block attesting, locking, or (this test's
    // focus) printing the finalized report once the record is locked. The
    // print/copy actions also live outside the panel's locked-fieldset so
    // they stay reachable after lock instead of going dead with every other
    // now-read-only field.
    await page.goto('/');
    await signInLocalStaff(page, 'QA Staff, MA');
    await openWorkflow(page, 'uds');
    const panel = page.locator('.wfp-panel');
    await fillUdsSpecimen(page, panel, 'SAFE life 14-Panel Cup');
    await page.locator('#uds-readings-verified').check();
    await panel.getByRole('tab', { name: /^Results/ }).click();
    await panel.getByRole('button', { name: 'THC positive · rest negative' }).click();
    await panel.getByRole('tab', { name: /^Interpretation/ }).click();

    const attestButton = panel.locator('.cd2004-record-actions button.is-primary');
    await expect(attestButton).toBeEnabled();
    await attestButton.click();
    const attestDialog = page.getByRole('dialog', { name: 'Attest & lock local record' });
    await attestDialog.getByRole('checkbox', { name: /I attest that I reviewed/ }).check();
    await attestDialog.getByRole('button', { name: 'Attest & lock local record', exact: true }).click();
    await expect(attestDialog).toBeHidden();
    await expect(panel.locator('.wfp-status-flag.is-idle')).toHaveText('Read only');

    await expect(panel.getByRole('button', { name: 'Print clinician report' })).toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Patient summary' })).toBeEnabled();
    await expect(panel.locator('.wfp-print-block-hint')).toHaveCount(0);
  });

  test('lists outstanding requirements and jumps to the tab that owns each one', async ({ page }) => {
    await page.goto('/');

    // A bare stop count leaves staff opening every tab to find what is
    // missing. The status chip opens a floating window (matching real
    // MEDITECH's separate popups for this kind of thing); each row names
    // its tab and navigates straight to it, closing the window on click.
    await openWorkflow(page, 'uds');
    const uds = page.locator('.wfp-panel');
    await uds.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await uds.locator('.wfp-status-flag.is-stop').click();
    const udsDialog = page.getByRole('dialog', { name: 'Outstanding requirements' });
    await expect(udsDialog).toBeVisible();
    const udsRows = udsDialog.locator('.wfp-issue-row');
    await expect(udsRows.first()).toBeVisible();
    await expect(udsDialog.locator('.wfp-issue-row', { hasText: 'at least one result' })
      .locator('.wfp-issue-tab')).toHaveText('Results');
    await udsDialog.locator('.wfp-issue-row', { hasText: 'at least one result' }).click();
    await expect(uds.getByRole('tab', { name: /^Results/ })).toHaveAttribute('aria-selected', 'true');
    await expect(udsDialog).toBeHidden();

    await openWorkflow(page, 'samples');
    const samples = page.locator('.wfp-panel');
    await samples.locator('input[placeholder="Last, First"]').fill('Okafor, Ben');
    await samples.locator('.wfp-status-flag.is-stop').click();
    const samplesDialog = page.getByRole('dialog', { name: 'Outstanding requirements' });
    await expect(samplesDialog).toBeVisible();
    const educationRow = samplesDialog.locator('.wfp-issue-row', { hasText: 'patient education status' });
    await expect(educationRow.locator('.wfp-issue-tab')).toHaveText('Safety / review');
    await educationRow.click();
    await expect(samples.getByRole('tab', { name: /^Safety/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(samplesDialog).toBeHidden();
  });

  test('marks prior dose required only when the visit reason makes it a stop, and calculates the next due date', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');

    await panel.getByRole('tab', { name: /^Schedule/ }).click();
    const priorDose = panel.locator('.wfp-field').filter({ hasText: 'Prior dose' });

    // A scheduled dose stops on the prior-dose date, because that date is the
    // engine's only input for the dosing window. The field has to say so -
    // labelling a blocking field "optional" is what sends staff hunting.
    await expect(priorDose.locator('.wfp-req')).toHaveCount(1);
    await expect(priorDose.locator('.wfp-opt')).toHaveCount(0);

    // A PRN dose has no window to evaluate, so the same field is genuinely
    // optional and must stop claiming otherwise.
    await panel.getByRole('tab', { name: /^Order/ }).click();
    await panel.locator('select[name="inj-reason"]').selectOption('prn');
    await panel.getByRole('tab', { name: /^Schedule/ }).click();
    await expect(priorDose.locator('.wfp-req')).toHaveCount(0);
    await expect(priorDose.locator('.wfp-opt')).toHaveCount(1);

    // Expected next due is a visible calculation from the actual date and
    // selected cadence. Staff can still override it explicitly when the
    // active order says otherwise. Actual administration date lives on
    // Administration (with the time it pairs with); Expected next due
    // stays on Schedule.
    await panel.getByRole('tab', { name: /^Administration/ }).click();
    const actualDate = panel
      .locator('.wfp-field', { hasText: 'Actual administration date' })
      .locator('input[type="date"]');
    await actualDate.fill('2026-07-30');

    await panel.getByRole('tab', { name: /^Schedule/ }).click();
    const nextDue = panel
      .locator('.wfp-field', { hasText: 'Expected next due' });
    await expect(nextDue.locator('input[type="date"]')).toHaveValue('2026-08-27');
    await expect(nextDue.locator('.wfp-calculated-value')).toBeVisible();
    await expect(nextDue.locator('.wfp-field-action')).toHaveCount(0);
  });

  test('targets the Sustenna Day 8 date on a Day 1 initiation and clears a stale calculated date on a provider-directed path', async ({ page }) => {
    await page.goto('/');
    await openWorkflow(page, 'administer');
    const panel = page.locator('.wfp-panel');

    await panel.locator('input[placeholder="Last, First"]').fill('Rivera, Ana');
    await panel.locator('select[name="inj-medication"]').selectOption({ label: 'Invega Sustenna' });
    await panel.locator('select[name="inj-interval"]').selectOption('q4wk');
    await panel.locator('select[name="inj-reason"]').selectOption({ label: 'Initiation' });
    await panel.getByRole('tab', { name: /^Administration/ }).click();
    const actualDate = panel
      .locator('.wfp-field', { hasText: 'Actual administration date' })
      .locator('input[type="date"]');
    await actualDate.fill('2026-07-30');

    await panel.getByRole('tab', { name: /^Schedule/ }).click();
    const nextDue = panel.locator('.wfp-field', { hasText: 'Expected next due' });
    // Baseline: with no initiation protocol selected, the ordered q4wk
    // interval drives the suggestion, same as the previous test.
    await expect(nextDue.locator('input[type="date"]')).toHaveValue('2026-08-27');

    // Day 1 initiation is followed by Day 8, not by the ordered maintenance
    // interval - the suggestion must switch to admin date + 7 days.
    await panel.locator('label:has-text("Day 1 initiation")').click();
    await expect(nextDue.locator('input[type="date"]')).toHaveValue('2026-08-06');
    await expect(nextDue.locator('.wfp-calculated-value')).toContainText('Day 8 target');

    // A provider-directed re-initiation is explicitly a non-calculating
    // path - the stale Day 8 (or interval) suggestion must be cleared, not
    // left sitting in the field looking like a still-valid value.
    await panel.locator('label:has-text("Re-initiation / provider plan")').click();
    await expect(nextDue.locator('input[type="date"]')).toHaveValue('');
    await expect(nextDue.locator('.wfp-calculated-value')).toHaveCount(0);
    await expect(nextDue.locator('.wfp-field-action')).toHaveCount(0);
  });
});
