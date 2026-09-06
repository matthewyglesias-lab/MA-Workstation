const { test, expect } = require('@playwright/test');

// PLAN 3.1. Kiosk mode is presentation only: it changes what the shell shows
// and how large it shows it, and changes no gate, no dose and no record. These
// assertions are about the shell's shape and the way in and out of it.
test.describe('Kiosk mode', () => {
  test('enters from the URL, remembers the choice, and can always be left', async ({ page }) => {
    await page.goto('/?kiosk=1');
    const shell = page.locator('.cd2004-shell');
    await expect(shell).toHaveAttribute('data-kiosk', 'true');

    // A single work column, no section rail, no menu bar, no command deck.
    await expect(page.locator('.cd2004-navigator.meditech-record-list')).toBeHidden();
    await expect(page.locator('.cd2004-menu-bar')).toBeHidden();
    await expect(page.locator('.meditech-command-deck')).toBeHidden();

    // PLAN 7: the product mark and the local-only disclosure stay on screen.
    // A kiosk is the surface most likely to be mistaken for a connected EHR,
    // so this is the one place the disclosure matters most.
    await expect(page.locator('.cd2004-app-title')).toBeVisible();
    await expect(page.locator('.cd2004-app-environment b')).toHaveText('Local only');

    // The way in is a menu item the mode then hides, so the way out has to be
    // on screen. Without it the mode can only be left by clearing site data.
    const exit = page.getByRole('button', { name: 'Exit kiosk mode' });
    await expect(exit).toBeVisible();

    // The URL choice is remembered, so a pinned kiosk browser stays a kiosk.
    await page.goto('/');
    await expect(shell).toHaveAttribute('data-kiosk', 'true');

    await page.getByRole('button', { name: 'Exit kiosk mode' }).click();
    await expect(shell).not.toHaveAttribute('data-kiosk', 'true');
    await expect(page.locator('.cd2004-menu-bar')).toBeVisible();

    // And leaving is remembered too.
    await page.goto('/');
    await expect(shell).not.toHaveAttribute('data-kiosk', 'true');
  });

  test('gives every control a 44px touch target', async ({ page }) => {
    await page.goto('/?kiosk=1');
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-kiosk', 'true');

    // PLAN 3.4. Asserted over every visible control rather than per component,
    // so a control added later is covered without anyone remembering.
    const undersized = await page.evaluate(() => {
      const visible = node => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          rect.width > 0 && rect.height > 0;
      };
      return [...document.querySelectorAll('.cd2004-shell button, .cd2004-shell [role="tab"]')]
        .filter(visible)
        .filter(node => node.getBoundingClientRect().height < 44)
        .map(node => `${node.className} :: ${node.textContent?.trim().slice(0, 30)}`);
    });
    expect(undersized).toEqual([]);
  });

  test('leaves the clinical engine alone', async ({ page }) => {
    // The point of the mode being presentation-only: the same workflow, with
    // the same gates, is reachable and behaves the same way.
    await page.goto('/?kiosk=1');
    await page.locator('.cd2004-launcher-tile').first().click();
    await expect(page.locator('.cd2004-shell')).toHaveAttribute('data-active-workflow', 'administer');
    await expect(page.locator('.wfp-panel')).toBeVisible();
    // The step rail is still the engine's ledger, still reporting its states.
    await expect(page.locator('.wfp-ledger-state').first()).toBeVisible();
  });
});
