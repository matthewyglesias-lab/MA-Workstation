# IPMG clinic console · Azure SQL foundation

Version 0.1 is the first working slice of the clinic helper engine. **Tebra remains the authoritative clinical chart.** Patients here are verified identity links; operational activity, inventory, and documentation handoff surround that chart.

The existing MA Workstation at the repository root is preserved. `console/` has an independent package, lockfile, build, API, migrations and CI. The existing Azure Static Web Apps deployment continues to build the root app. This console needs a backend and Azure SQL; it is not a static-only deployment.

## Run the synthetic preview

Use Node 22 or newer:

```sh
cd console
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5175`. All sample identities and stock are synthetic. Changes last for the demo server session. Demo mode is explicit, refuses production and non-loopback binding, and never falls back from a failed SQL connection. Do not enter real patient data into demo mode.

For the built, same-origin app:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3100`. SQL mode serves the same frontend and authenticates API requests through Microsoft Entra ID.

## Implemented

- Lightfully-inspired responsive console: Today, Patients, Work, Inventory and a capability overview.
- Unique Tebra chart links with verified identity/date/actor; no automatic Tebra access or synchronization.
- Patient-linked service activities for Injection, UDS, TMS, Samples and Forms. These are operational work items, not clinical orders or treatment engines.
- Separate service progress and Tebra handoff states. Filing requires completed work plus a human-confirmed reference; filed records cannot be overwritten.
- Product and lot registration; clinic, sample and patient-specific ownership.
- Whole-unit receiving, reservations, releases, recorded stock use, waste, signed adjustments and reference-linked reversals.
- Patient-specific reservation accounting; stock and allocation constraints; expired/quarantined lots cannot be reserved or used. Quarantine is represented in the model; staff quarantine controls are a next increment.
- Azure SQL adapter with parameterized statements, clinic-scoped foreign keys, transactional stock locks, persisted idempotency receipts, optimistic activity versions, audit events and an outbox.
- Entra access-token validation, API scope and explicit roles. Passwordless SQL authentication; restricted local SQL-password mode for tests only.
- Versioned, checksum-verified, transactional database migrations with a separate runtime role that cannot rewrite ledger/audit history.

## Boundaries of this first build

This is **not ready for live clinical operation**. Clinical rules from the existing workstation are not migrated yet. There is no medication recommendation, order validation, screening engine, note/AVS generation, Tebra upload, kiosk integration, notification dispatcher, automated replenishment or document storage in this build. `prepared` is an explicit staff-reported handoff status, not evidence that this app generated a note.

Inventory counts whole stock units. Vial entries count sealed vials only: partial vial use, dose conversion, transfers, returns, dispensing packs, expiry-by-month conventions and recall workflows must be added with their own contracts before those workflows are used. There is no claim of medical suitability based on stock availability. Received/use quantities never become clinical administration facts automatically.

The initial read projection loads at most 250 rows per module and 30 recent movements in the history view, clearly disclosed in the UI. Pagination, server-side search, individual record retrieval and background refresh are required before larger datasets. No silent truncation should be used as a clinical or inventory decision source. Server stock commands always evaluate the full ledger, not these display limits.

## Validation

```sh
npm run check
npx playwright install chromium
npx playwright test
```

`npm run test:sql` targets only a disposable local SQL Server database named `console_test…`, with `SQL_AUTH=password`. It checks actual migrations, concurrent reservations, retry deduplication, transaction rollback, reversal uniqueness, clinic isolation, conflicting edits, handoff integrity and runtime-role permissions. GitHub Actions runs this suite against SQL Server 2022. It does not contact Azure SQL or production data.

See [architecture](docs/architecture.md), [Azure setup](docs/azure-setup.md), and [build roadmap](docs/roadmap.md).
