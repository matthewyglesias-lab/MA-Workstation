# MA Workstation · Lightfully-inspired standalone shell

This is the existing MA Workstation with a new presentation layer, not a
replacement clinical engine or a reduced demonstration. It starts from PR #62
commit `28ae520bb51161ef3eb4b3642071007601b9f64e`, preserving its draft-integrity
and injection-focus work in addition to the default-branch clinical engine.

## What changed

A lavender and warm-paper workspace, navy typography, coral primary actions,
sage navigation selection, editorial headings, and a consistent control grammar.
The home register offers guarded entry into Injection, UDS, Samples and Forms;
real review/draft/today counts; a temporary patient/medication filter; and the
original resume/review actions. There are no invented patients or queue totals.

Ctrl/Cmd+K opens a keyboard-searchable command palette. Navigation uses the
existing workflow guards. It never offers signing, deletion or medication
selection. An existing modal or unsupported viewport retains control. Density
is a browser-local display preference only. The Focus action opens the original
seven-step injection workflow and its original documentation, not a second form.

## Preserved boundary

No changes to `src/domain`, `src/application`, `src/persistence`,
`src/documentation`, `src/legacy`, `public/legacy`, or clinical/print fixtures.
All new styling is screen-only. Medication-specific logic, note construction,
saved records, signing/addenda, screening, site history, UDS, samples, forms,
reference, daily closeout and print paths retain their original implementations.
TMS remains the original future-workflow placeholder; no treatment module was
invented as part of a shell redesign.

## Build and run

Use the pinned repository dependencies:

```sh
npm ci
npm run check
npm run test:unit
npm run build
npm run preview
```

For the self-contained file, run `node scripts/package-standalone.mjs` after the
Vite build. The resulting `standalone/IPMG-MA-Workstation-Lightfully.html` embeds
the tested application and its assets. It does not need a database, server,
external fonts, or a parallel patient queue. The original optional remote
reference lookups still require a network connection when used.

Keep the file at a stable path and use the same managed browser profile.
File-URL storage is browser-dependent; never proceed when the app reports
storage or writer protection unavailable. The packager does not bypass those
guards. For regular deployment, the unchanged static bundle can be hosted on
an approved HTTPS static site; a different origin has separate local records.

## Clinic-use boundaries

Tebra remains the chart of record. Review and copy finalized documentation there.
Records stay in this browser/profile: no cloud backup, shared multiuser database,
or Tebra synchronization has been added. Existing staff-name attestation and
idle locking are not enterprise authentication. Do not assume records move
between the old hosted app and a downloaded file; they do not.

Test with synthetic data first. Staff must verify the medication/order, timing,
site, safety inputs, generated note, and printed handout under the clinic's
existing review process. Software regression tests preserve existing behavior;
they do not independently revalidate every clinical reference.

## Verification

The review workflow runs type/static checks, all unit tests, a production build,
and the browser/print suite. Intentional new-screen snapshots are updated only
alongside the unchanged geometry, accessibility, clinical and print assertions.
New tests cover command search, guarded navigation, native modal precedence,
density, viewport protection, home layout, and the single-file package's native
storage/persistence. CI artifacts carry the exact tested build and report.
