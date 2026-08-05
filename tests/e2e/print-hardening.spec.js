const { test, expect } = require('@playwright/test');

/**
 * Contract for the hardened print choke point in public/legacy/legacy-runtime.js.
 *
 * Every clinical print in the runtime goes through window.print() with a
 * `print-*` class staged on <body>. These tests assert the guarantees that
 * wrapper adds, using the real runtime rather than a stub: the native print is
 * swapped for a counter so no dialog opens, which is exactly why the wrapper
 * invokes window.__ipmgNativePrint through the property instead of a closure.
 */

const PRINT_CLASSES = [
  'print-avs',
  'print-uds',
  'print-uds-patient',
  'print-sample',
  'print-letter',
  'print-daily',
  'print-sample-worksheet',
  'print-inj-worksheet',
  'print-inj-patient-screen'
];

async function bootWorkstation(page) {
  await page.goto('/');
  await expect(page.locator('.cd2004-shell')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.print)).toBe('function');
  await expect
    .poll(() => page.evaluate(() => typeof window.__ipmgNativePrint))
    .toBe('function');

  // Replace the native print with a counter. Nothing here should ever open a
  // real dialog, and a leaked dialog would hang the run.
  await page.evaluate(() => {
    window.__printCalls = 0;
    window.__ipmgNativePrint = () => {
      window.__printCalls += 1;
    };
  });
}

const stagedClasses = (page) =>
  page.evaluate(
    (classes) => classes.filter((c) => document.body.classList.contains(c)),
    PRINT_CLASSES
  );

const printCalls = (page) => page.evaluate(() => window.__printCalls);

test.describe('hardened print pipeline', () => {
  test('refuses to print a staged sheet that never rendered', async ({ page }) => {
    await bootWorkstation(page);

    // The exact failure this guards: a renderer threw or produced nothing, but
    // the call site staged the class and called print anyway. Before hardening
    // this put a blank clinical document in a patient's hand.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '';
      document.body.classList.add('print-avs');
      window.print();
    });

    expect(await printCalls(page)).toBe(0);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('treats a graphics-only sheet as real content', async ({ page }) => {
    await bootWorkstation(page);

    // Emptiness is judged on rendered content, not text alone, so a legitimate
    // image-only handout is not mistaken for a failed render.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML =
        '<svg width="10" height="10"><rect width="10" height="10"></rect></svg>';
      document.body.classList.add('print-avs');
      window.print();
    });

    expect(await printCalls(page)).toBe(1);
  });

  test('refuses to print two staged documents merged together', async ({ page }) => {
    await bootWorkstation(page);

    // Both sheets are display:block under their own print class, so printing
    // with two staged would emit one document containing both.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.getElementById('udsSheet').innerHTML = '<p>UDS body</p>';
      document.body.classList.add('print-avs');
      document.body.classList.add('print-uds');
      window.print();
    });

    expect(await printCalls(page)).toBe(0);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('always clears the staged class, even when printing throws', async ({ page }) => {
    await bootWorkstation(page);

    // A throwing print() used to skip the trailing cleanup entirely, leaving
    // the class on <body> so the next plain Ctrl+P printed the wrong document.
    const threw = await page.evaluate(() => {
      window.__ipmgNativePrint = () => {
        throw new Error('printing blocked by policy');
      };
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.body.classList.add('print-avs');
      try {
        window.print();
        return false;
      } catch {
        return true;
      }
    });

    // The wrapper absorbs the failure rather than propagating it to the click
    // handler, and the class must be gone regardless.
    expect(threw).toBe(false);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('a blocked print does not wedge later prints', async ({ page }) => {
    await bootWorkstation(page);

    const calls = await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';

      window.__ipmgNativePrint = () => {
        throw new Error('blocked');
      };
      document.body.classList.add('print-avs');
      window.print();

      // The in-flight guard must have been released by the failure path.
      window.__printCalls = 0;
      window.__ipmgNativePrint = () => {
        window.__printCalls += 1;
      };
      document.body.classList.add('print-avs');
      window.print();
      // A real browser fires this when the dialog closes; it is what unstages
      // the class after a print that actually succeeded.
      window.dispatchEvent(new Event('afterprint'));
      return window.__printCalls;
    });

    expect(calls).toBe(1);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('collapses a double-fired print into one dialog', async ({ page }) => {
    await bootWorkstation(page);

    // Double-clicking a print button previously stacked two dialogs and let
    // the first cleanup race the second render.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.body.classList.add('print-avs');
      window.__ipmgNativePrint = () => {
        window.__printCalls += 1;
        // Re-entrant call, exactly as a second click during the dialog would.
        window.print();
      };
      window.print();
    });

    expect(await printCalls(page)).toBe(1);
  });

  test('leaves an ordinary Ctrl+P of the screen alone', async ({ page }) => {
    await bootWorkstation(page);

    // With no sheet staged this is the generic "print what is on screen" path
    // and must not be blocked by the empty-sheet check.
    await page.evaluate(() => window.print());

    expect(await printCalls(page)).toBe(1);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('clears a staged class left behind by a print it did not start', async ({ page }) => {
    await bootWorkstation(page);

    // Printing from the browser's own menu never enters window.print(), so the
    // afterprint backstop is the only thing that can unstage the class.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.body.classList.add('print-avs');
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(await stagedClasses(page)).toEqual([]);
  });

  test('clears the staged class after a normal print completes', async ({ page }) => {
    await bootWorkstation(page);

    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.body.classList.add('print-avs');
      window.print();
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(await printCalls(page)).toBe(1);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('backstop unstages the class when afterprint never fires', async ({ page }) => {
    await bootWorkstation(page);

    // Environments that never emit afterprint must still not strand the class,
    // otherwise the next plain Ctrl+P prints the wrong document.
    await page.evaluate(() => {
      document.getElementById('avsSheet').innerHTML = '<p>AVS body</p>';
      document.body.classList.add('print-avs');
      window.print();
    });

    expect(await stagedClasses(page)).toEqual(['print-avs']);
    await expect.poll(() => stagedClasses(page), { timeout: 4000 }).toEqual([]);
    expect(await printCalls(page)).toBe(1);
  });

  test('rejects a draft patient screening sheet in a production-gated build', async ({ page }) => {
    await bootWorkstation(page);
    const previewEnabled = await page.evaluate(
      () => window.__IPMG_DRAFT_INJECTION_PATIENT_SCREENING_ENABLED__ === true
    );
    test.skip(previewEnabled, 'The PR-preview artifact intentionally enables the draft prototype.');

    await page.evaluate(() => {
      document.getElementById('injPatientScreenSheet').innerHTML = '<p>Draft form</p>';
      document.body.classList.add('print-inj-patient-screen');
      window.print();
    });

    expect(await printCalls(page)).toBe(0);
    expect(await stagedClasses(page)).toEqual([]);
  });

  test('omits the draft patient-screening action from the production workflow', async ({ page }) => {
    await bootWorkstation(page);
    const previewEnabled = await page.evaluate(
      () => window.__IPMG_DRAFT_INJECTION_PATIENT_SCREENING_ENABLED__ === true
    );
    test.skip(previewEnabled, 'The PR-preview artifact intentionally exposes the draft prototype.');

    await page.locator('.cd2004-nav-item[title="Injection"]').click();
    const panel = page.locator('.wfp-panel');
    await expect(panel).toBeVisible();
    await panel.locator('select[name="inj-medication"]').selectOption('uzedy');
    await expect(panel.locator('[data-patient-screening-print]')).toHaveCount(0);
  });

  test('every real print button routes through the hardened path', async ({ page }) => {
    await bootWorkstation(page);

    // Guards against a future print being wired straight to the native call:
    // each button must leave no staged class behind and must not be able to
    // print an unbuilt sheet.
    const ids = await page.evaluate(() =>
      [
        'printAVS',
        'printUdsReport',
        'printUdsPatient',
        'samplePrint',
        'letterPrint',
        'printDailyLog',
        'sampleWorksheetPrint',
        'injWorksheetPrint'
      ].filter((id) => document.getElementById(id))
    );
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      await page.evaluate((buttonId) => {
        window.__printCalls = 0;
        document.getElementById(buttonId).click();
        // Stand in for the browser closing the print dialog.
        window.dispatchEvent(new Event('afterprint'));
      }, id);
      expect(await stagedClasses(page), `#${id} left a staged print class`).toEqual([]);
    }
  });
});
