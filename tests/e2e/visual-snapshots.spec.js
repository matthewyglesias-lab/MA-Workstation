const { test, expect } = require('@playwright/test');

const FIXED_NOW = new Date('2026-07-30T10:30:00-07:00');
const FIXED_DATE_KEY = '2026-07-30';

const WORKFLOWS = {
  home: {
    label: 'Start Center',
    panel: '.cd2004-start-center'
  },
  administer: {
    label: 'Injection',
    panel: '.wfp-panel'
  },
  uds: {
    label: 'UDS',
    panel: '.wfp-panel'
  },
  samples: {
    label: 'Samples',
    panel: '.wfp-panel'
  },
  forms: {
    label: 'Forms',
    panel: '.wfp-panel'
  }
};

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 }
];

const SNAPSHOT_OPTIONS = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  // Text rasterization differs slightly between Windows and Linux Chromium.
  // This still fails on material chrome, spacing, color, or layout changes.
  threshold: 0.3,
  maxDiffPixelRatio: 0.025,
  timeout: 15_000
};

const CAPTURE_STYLES = `
  html[data-visual-regression="true"],
  html[data-visual-regression="true"] body,
  html[data-visual-regression="true"] .cd2004-shell,
  html[data-visual-regression="true"] .cd2004-shell * {
    font-family: Arial, "Liberation Sans", sans-serif !important;
    font-synthesis: none !important;
  }

  html[data-visual-regression="true"] {
    overflow: hidden !important;
    scrollbar-gutter: auto !important;
  }

  html[data-visual-regression="true"] *,
  html[data-visual-regression="true"] *::before,
  html[data-visual-regression="true"] *::after {
    animation: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }

  html[data-visual-regression="true"] * {
    scrollbar-width: none !important;
  }

  html[data-visual-regression="true"] *::-webkit-scrollbar {
    display: none !important;
    height: 0 !important;
    width: 0 !important;
  }
`;

const FIXED_LOCAL_DATA = {
  staff: 'Alex Rivera, MA',
  clinic: 'San Bernardino',
  activities: [
    {
      time: '9:18 AM',
      type: 'injection',
      status: 'completed',
      pt: 'Rivera, Jordan',
      summary: 'Maintenance injection documented',
      details: 'Routine administration completed',
      trace: 'Lot FIXED-2407',
      follow: 'Next visit scheduled',
      by: 'Alex Rivera, MA'
    },
    {
      time: '9:42 AM',
      type: 'uds',
      status: 'needs_review',
      pt: 'Chen, Avery',
      summary: 'UDS routed for clinician review',
      details: 'Preliminary result requires review',
      trace: 'Cup lot UDS-0730',
      follow: 'Provider handoff pending',
      by: 'Alex Rivera, MA'
    },
    {
      time: '10:06 AM',
      type: 'sample',
      status: 'completed',
      pt: 'Morgan, Casey',
      summary: 'Sample package documented',
      details: 'Package traceability complete',
      trace: 'Lot SMP-0730',
      follow: 'Patient handout provided',
      by: 'Alex Rivera, MA'
    }
  ],
  injectionRecords: [
    {
      id: 'fixture-injection-locked',
      type: 'injection',
      status: 'completed',
      createdAt: '2026-07-30T09:12:00-07:00',
      updatedAt: '2026-07-30T09:18:00-07:00',
      completedAt: '2026-07-30T09:18:00-07:00',
      patient: { name: 'Rivera, Jordan', dob: '06/14/1989' },
      summary: 'Abilify Maintena 400 mg',
      snapshot: {
        version: 4,
        medKey: 'maintena',
        state: {
          dose: '400 mg',
          route: 'IM',
          site: 'Left deltoid'
        },
        fields: {
          lot: 'FIXED-2407',
          adminDate: FIXED_DATE_KEY
        }
      },
      addenda: []
    },
    {
      id: 'fixture-injection-draft',
      type: 'injection',
      status: 'draft',
      createdAt: '2026-07-30T09:46:00-07:00',
      updatedAt: '2026-07-30T09:46:00-07:00',
      completedAt: '',
      patient: { name: 'Patel, Rowan', dob: '11/03/1994' },
      summary: 'Invega Sustenna 156 mg',
      snapshot: {
        version: 4,
        medKey: 'sustenna',
        state: {
          dose: '156 mg',
          route: 'IM',
          site: 'Right deltoid'
        },
        fields: {
          lot: 'FIXED-DRAFT',
          adminDate: FIXED_DATE_KEY
        }
      },
      addenda: []
    }
  ]
};

test.use({
  colorScheme: 'light',
  deviceScaleFactor: 1,
  locale: 'en-US',
  reducedMotion: 'reduce',
  timezoneId: 'America/Los_Angeles'
});

async function bootDeterministicWorkstation(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(({ data, dateKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ipmgMedAssistStaff', data.staff);
    localStorage.setItem('ipmgMedAssistClinicLocation_v1', data.clinic);
    localStorage.setItem(
      `ipmgMedAssistActivityLog_${dateKey}`,
      JSON.stringify(data.activities)
    );
    localStorage.setItem(
      'ipmgMedAssistInjectionRecordsV1',
      JSON.stringify(data.injectionRecords)
    );
  }, { data: FIXED_LOCAL_DATA, dateKey: FIXED_DATE_KEY });

  await page.goto('/');
  await page.waitForFunction(
    () => document.body.dataset.applicationReady === 'true'
  );
  await page.addStyleTag({ content: CAPTURE_STYLES });
  await page.evaluate(() => {
    document.documentElement.dataset.visualRegression = 'true';
  });
}

async function openWorkflow(page, workflow) {
  const spec = WORKFLOWS[workflow];
  if (workflow !== 'home') {
    // Bottom-docked strip: every nav item is reachable at every width.
    await page.locator(`.cd2004-nav-item[title="${spec.label}"]`).click();
  }

  await expect(page.locator('.cd2004-shell')).toHaveAttribute(
    'data-active-workflow',
    workflow
  );
  await expect(page.locator(spec.panel)).toBeVisible();
}

async function settleForCapture(page) {
  // Legacy enhancements include delayed layout passes through 850 ms.
  await page.waitForTimeout(1_000);
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll('.cd2004-window-body').forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

test.describe('classic workstation visual snapshots', () => {
  for (const viewport of VIEWPORTS) {
    for (const workflow of Object.keys(WORKFLOWS)) {
      test(`${WORKFLOWS[workflow].label} at ${viewport.width}px`, async ({
        page
      }) => {
        await bootDeterministicWorkstation(page, viewport);
        await openWorkflow(page, workflow);
        await settleForCapture(page);

        await expect(page.locator('.cd2004-shell')).toHaveScreenshot(
          `${workflow}-${viewport.name}.png`,
          SNAPSHOT_OPTIONS
        );
      });
    }
  }
});
