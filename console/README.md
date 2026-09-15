# IPMG clinic console · Injection workspace

Version 0.2 focuses the clinic helper engine on injections. **Tebra remains the authoritative clinical chart.** Patients here are verified identity links; operational activity, inventory, and documentation handoff surround that chart.

The existing MA Workstation at the repository root is preserved. `console/` has an independent package, lockfile, build, API, migrations and CI. The existing Azure Static Web Apps deployment continues to build the root app. This console needs a backend and Azure SQL; it is not a static-only deployment.

## Run the synthetic preview

Use Node 22 or newer:

```sh
cd console
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5175`. Sign in as `demo` with PIN `123456`. All sample identities and stock are synthetic. Changes last for the demo server session. Demo mode is explicit, refuses production and non-loopback binding, and never falls back from a failed SQL connection. Do not enter real patient data into demo mode.

For the built, same-origin app:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3100`. SQL mode uses individual staff PINs verified on the server. Microsoft Entra access remains an optional configuration. See [PIN access](docs/pin-access.md) for individual staff enrollment, reset, and revocation.

## Implemented

- Letter-builder design: Mulish/Poppins/Lora, restrained navy/teal/coral, a persistent patient banner, concise forms, and focused Injections, Patients, Inventory navigation.
- Individual staff PINs with slow salted hashes, SQL-persisted attempt limits and sessions, role checks, CSRF/origin validation, and automatic locking. Only the staff ID may be remembered in browser storage.
- Verified Tebra identity links and provider-confirmed injection orders. Drafts, review, hold/resume, cancellation, paired dose sequences, actual administration time, partial/unknown delivery, and append-only addenda.
- Medication-specific review prompts linked to current primary prescribing references. They do not calculate or authorize a regimen.
- Screening, preparation, site assessment, vitals, and observation; no prechecked attestations or fabricated normal findings.
- Transactional lot reservation and use, patient-owned stock, expiration checks, immutable movements, retry deduplication, version conflicts, and durable event history. Generic inventory commands cannot steal a reviewed injection's reservation.
- Factual note preview/copy/print and English/Spanish visit summaries. Tebra filing is a separate staff confirmation and reference; an addendum reopens the filing task.
- Azure SQL migrations, parameterized clinic-scoped persistence, audit events, and an outbox. The runtime database role cannot rewrite administration, stock, or audit history.

## Current operating scope

**The code is ready for synthetic rehearsal; live Azure setup and acceptance remain pending.** See [deployment readiness](docs/deployment-readiness.md). A downloaded preview does not retain patient records or connect to Tebra.

This release requires prospective same-day safety review. It does not support recording historical administrations that occurred before a review, automated prescribing, wrong-product/overdose incident processing, automatic Tebra upload, or automatic continuation of a legacy regimen. The original workstation remains available; [clinical migration review](docs/injection-clinical-review.md) records the parity gaps and why old fixed-day windows were not treated as clinical clearance.

Each ordered injection component has a separate dose sequence, stock allocation, and administration record. Partial or unsuccessful delivery records the opened/used package and the provider follow-up plan. It never recommends a replacement dose. Inventory counts whole packages; multi-dose vial balances, fractional dispensing, transfers, recalls, and staff quarantine controls need their own workflow before use.

The initial read projection loads at most 250 rows per module, disclosed in the UI. Pagination, server-side patient search, and complete record retrieval remain required before using larger datasets. Stock commands evaluate the complete ledger. Keep launch within the tested scope and reconcile actual patient links/lots before live use.

## Validation

```sh
npm run check
npx playwright install chromium
npx playwright test
```

`npm run test:sql` targets only a disposable local SQL Server database named `console_test…`, with `SQL_AUTH=password`. It checks actual migrations, concurrent reservations, retry deduplication, transaction rollback, reversal uniqueness, clinic isolation, conflicting edits, handoff integrity and runtime-role permissions. GitHub Actions runs this suite against SQL Server 2022. It does not contact Azure SQL or production data.

See [architecture](docs/architecture.md), [Azure setup](docs/azure-setup.md), and [build roadmap](docs/roadmap.md).

## Try the standalone preview

Run `npm ci` and `npm run build:preview` inside `console/`, then open
`dist/preview/Clinic-Console-Interactive-Demo.html` in a modern desktop browser.
This self-contained preview needs no server. Sign in as `demo`, PIN `123456`. It includes fictional patients, injection review/administration, inventory, note/AVS output, and simulated Tebra filing.
All edits live in browser memory and reset on reload. Do not enter real patient details.
It does not connect to Azure SQL or Tebra. The production build excludes the preview
adapter, and an API failure never switches the app into preview mode.

To exercise the same end-to-end workflow against the downloaded file:

```sh
CONSOLE_PREVIEW_PATH="$PWD/dist/preview/Clinic-Console-Interactive-Demo.html" npm run test:browser
```

The existing Azure Static Web App preview is currently blocked by its staging
environment quota. The new console's App Service and Azure SQL resources have not
yet been provisioned; see [Azure setup](docs/azure-setup.md).

## Azure SQL free offer

The infrastructure applies the recurring Azure SQL free offer at database creation: 32 GB, General Purpose serverless, and automatic pause when the monthly allowance is exhausted. SQL overage billing is disabled. App Service and private networking are separately billed (approximately $20.94/month before traffic and tax). This free allowance can interrupt access and carries no SLA; see [deployment readiness](docs/deployment-readiness.md) before live use.
