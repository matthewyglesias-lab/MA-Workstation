# Clinical Desktop 2004

Clinical Desktop 2004 is a frontend-only clinical workstation for Injection, UDS, Samples, and Forms workflows. The production interface is built with TypeScript, Vite, and Preact and keeps its records in the current browser.

## Local development

Use Node.js 22, matching the CI environment.

```bash
npm ci
npm run dev
```

Vite prints the local URL when the development server is ready.

To exercise the exact production output locally:

```bash
npm run build
npm run preview
```

The production bundle is generated in `dist/`.

## Validation commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Run strict TypeScript validation without emitting files. |
| `npm run check:static` | Run repository and legacy-compatibility assertions. |
| `npm run check` | Run type and static checks together. |
| `npm run test:unit` | Run domain, application, persistence, and documentation unit tests. |
| `npm run test:e2e` | Build the app, start the Vite preview server, and run Playwright browser, visual, and print tests. |
| `npm run test:visual` | Build and run the desktop/narrow visual contract and screenshot suites. |
| `npm run test:print` | Build and run every retained Letter print-surface regression. |
| `npm run test:ci` | Run the complete local CI-equivalent validation sequence. |
| `npm run smoke:browser` | Execute the deployed URL in Chromium, including desktop and 390px workflow navigation checks. |

Playwright failure artifacts are written to `playwright-report/` and `test-results/`.
The regression suite includes versioned clinical golden fixtures, fixed-viewport
visual contracts and screenshots, storage-compatibility journeys, and Letter PDF
checks for every retained print surface.

The pre-cutover print fixture is anchored to production commit
`bc4a255d351793b59184760b537c7aef9abcf0bb`. It verifies exact canonical
renderer output and byte-identical legacy print CSS before checking Letter
layout, clipping, and page counts. Regenerate it only after an approved print
change:

```bash
node scripts/generate-print-baseline-fixture.mjs --write
```

## Architecture

- `src/domain/` contains presentation-independent clinical rules and workflow engines.
- `src/application/` contains commands, selectors, encounter coordination, and the unidirectional store.
- `src/persistence/` contains local-storage repositories and compatibility codecs.
- `src/presentation/` contains the classic EHR shell, workflow windows, note preview, and print integration.
- `public/legacy/` contains compatibility assets extracted from the previous standalone application.

During the parity cutover, a production clinical coordinator observes the live
compatibility controls through a read-only adapter, normalizes Injection, UDS,
Samples, and Forms encounters into the application store, and evaluates all
four typed engines whenever the live workflow changes. The store owns desktop
navigation and session-only patient context, including empty-workflow
inheritance, visible mismatches, and explicit patient-context promotion.

The compatibility runtime remains authoritative for persistence, finalization,
record locking, copied note text, and unchanged print renderers. Typed engine
results do not introduce additional completion gates during this boundary
phase. The shell identifies a typed result only when its aggregate readiness
exactly agrees with the compatibility workflow; a disagreement remains
advisory and cannot change the legacy save or completion decision. This
boundary preserves proven browser-only behavior and rollback compatibility
while the typed engines are exercised against real production encounter state.

The app has no server, database, authentication layer, or synchronization service. Patient context shared between windows is session-only. Clinical records, drafts, preferences, and audit activity remain local to the current browser.

## CI and Azure deployment

The GitHub Actions workflow gates every deployment on:

1. Type and static compatibility checks.
2. Unit tests.
3. A Vite production build and deployment-bundle verification.
4. Playwright browser, visual, storage, and print end-to-end tests against that
   exact uploaded bundle.
5. HTTP and Chromium smoke tests of the Azure preview or production deployment,
   including hashed assets, application boot, workflow navigation, browser
   errors, narrow-window task switching, and horizontal-overflow protection.

The same tested `dist/` artifact is deployed directly to Azure Static Web Apps
with Azure's build step disabled. `public/staticwebapp.config.json` is copied
into that artifact by Vite and supplies production routing and security
headers.

The workflow requires this GitHub Actions secret:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
```

Pull requests receive Azure preview environments. Merges to `main` deploy production only after every validation job passes. Because storage keys and record formats remain compatible, rollback is performed by redeploying the previous production commit.

## Data responsibility

The status bar and workflow copy must continue to disclose that data is stored only in this browser. Do not use production patient-identifiable information without the clinic's required device controls, access policies, retention procedures, and approvals.
