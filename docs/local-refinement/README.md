> Current scope: the user's clinic-first request now explicitly includes state,
> recovery, architecture and AVS refinement. See `docs/clinic-first/AUDIT.md`.
> Earlier presentation-only restrictions below document prior increments; the
> current preservation check still locks medication rules, note grammar and
> existing record schemas to PR head 4bc9b5bb, with explicitly reviewed changes
> for unconfirmed documentation defaults, verified storage and tab recovery.

# IPMG local workstation · controlled refinement

Working PR: #68. Baseline: `59551bc914b945f268710fca3ef44c2e9ca62c50`
(`codex/lightfully-standalone-rebuild`). This is an ongoing **draft**, not a
production release or a new clinical system.

## Increment 1

- Official IPMG web logo embedded unchanged, at its native 147 × 52 size.
- One screen-only visual layer: consistent sans-serif titles, navy/slate text,
  teal primary actions, subtle surfaces, clearer patient identity and focus rings.
- Service-specific reminders for Injection, UDS, Samples and Forms. Preview
  reminds staff to compare the documented facts and verify Tebra filing separately.
- Reminders are instructional text, not stored attestations, clearance, clinical
  rules, or claims of completed checks. No popup, checkbox or new completion gate.
- All existing navigation, forms, commands, draft guards, copy/print handlers,
  clinical readiness, exceptions and workflow state remain with the original app.

## Protected boundary

No SQL, server API, PIN, login accounts, synchronization, new dependencies or
storage migration. `scripts/check-local-refinement.mjs` fails if the clinical,
application, persistence, documentation, legacy, fixtures, entrypoint, dependency
or standalone-packager paths differ from the pinned baseline. Full history is
required for this check. Do not weaken it to make a redesign pass.

Screen rules are isolated in `src/presentation/lightfully/ipmg-refinement.css`
and imported through the existing final screen stylesheet. Safety states,
visibility rules and the print stylesheets are not overridden. Existing original
clinical/print regression suites remain authoritative for behavioral parity,
not for medical-policy validation. No patient data belongs in this repository,
CI logs or screenshots; all test examples are synthetic.

## Logo provenance

Public IPMG website asset, retrieved 1 October 2026:
https://www.inlandpsych.com/wp-content/uploads/elementor/thumbs/logoImg-pbw2jjeutu7i1msff1529mln2sfucpc7d0hd8m01c8.png

SHA-256: `97d1b92ed246be8cf0ba14fea31acb8dd63fcd7eff43934dd9efc7aee9be9b90`.
The source image is embedded as a data URI; it is not fetched when the app runs.
This is the public raster asset, not a recreated or newly approved vector master.
A higher-resolution official master can replace it in a separate visual review.

## Review and release

Run `npm run check`, `npm run test:unit`, the protected-boundary script, and build
with `VITE_ENABLE_INJECTION_PATIENT_SCREENING=true npm run build`. Then run the
existing browser and print suites plus `tests/e2e/local-refinement.spec.js`.
Package with `node scripts/package-standalone.mjs` and exercise the real file with
`TEST_STANDALONE_FILE=1 npx playwright test tests/e2e/standalone-file.spec.js`.

Compare new screenshots at 1440×900, 1024×768 and 800×600. Existing visual baselines
must be reviewed before intentional updates; never lower comparison thresholds
or remove clinical, geometry, keyboard, persistence or print assertions to pass.
Track actual results in this PR, including failures and remaining acceptance work.
Do not merge or deploy this draft without user review.

The standalone file keeps its established name. Keep its path/browser profile
stable: browser-local records are not synchronized or guaranteed to transfer
between file paths, origins or browser profiles. Tebra remains the chart of
record; entered staff names are not authenticated identities. Do not mistake
local storage for a backup or for approval to retain identifiable patient data.

## Next controlled increments

Review real synthetic workflow screens first. Then refine the densest sections
and interruption/changed-value guidance using the original state model. Any
change to clinical checks, persistence, documents or filing behavior requires a
separate explicit scope and its own tests. Do not add a second clinical engine,
parallel form, or new app architecture to this presentation PR.
