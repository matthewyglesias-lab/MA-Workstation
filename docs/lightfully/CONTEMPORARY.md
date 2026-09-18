# Contemporary documentation workspace

Continues the saved Lightfully branch at `5be3d2df0033d3d04520fff7939913a7bc1e7b16`.
The design reference is the user's IPMG Letter Builder repository, particularly
`source/styles/lightfully-ui.css`. This is interface work, not a clinical-engine rewrite.

## What changed

- One form legend and small caption asterisks replace repeated Required/Optional
  badges. Controls still expose their required/invalid state to assistive technology.
- Field provenance stays available by keyboard or pointer in a small disclosure.
  Edited/review indicators stay visible; original source and change explanations
  remain available. Escape closes the disclosure without changing the draft.
- Section tabs lose ordinal numbers and large status stamps. Counts still come
  from the original evaluator, and complete status remains explicitly described.
- Injection starts with patient/provider context. Medication guidance follows
  the medication fields where it is relevant. Active warnings remain visible.
- Select-plus-lookup controls are visually connected; F9 behavior is retained.
  Lookup results are readable choices, not numbered terminal-table rows.
- Requirements are grouped by section in an Items to complete dialog. Selecting
  a requirement returns to its section and focuses its matching visible control
  when available. No field is filled and no requirement is bypassed.
- Service chooser, lookup, patient-screening, timing review, staff/location,
  signing and discard confirmations share a semantic heading component. Native
  modal behavior, focus traps, safe initial actions and callbacks are retained.
- Form panels, choice controls, references, saved-record dialogs, action docks
  and tool surfaces use one screen-only contemporary type/spacing/color system.

## Guarded boundary

No changes to `public/legacy`, `src/legacy`, `src/domain`, `src/application`,
`src/persistence`, `src/documentation` or `tests/fixtures`. Original medication
rules, defaults, signing gates, records, generated notes and print implementations
remain intact. Label and appearance expectations are updated intentionally;
clinical outcomes, record-integrity, keyboard and print assertions stay active.

## Verification

Run `npm run check`, `npm run test:unit`, and build with
`VITE_ENABLE_INJECTION_PATIENT_SCREENING=true npm run build`.
Run the full Playwright suite, then package with
`node scripts/package-standalone.mjs` and test with
`TEST_STANDALONE_FILE=1 npx playwright test tests/e2e/standalone-file.spec.js`.
New browser coverage includes required semantics, provenance preservation,
complete requirement lists, field focus, guidance placement and shared dialogs.
The one history-dependent unit test needs the original Git history; extracted
source archives cannot run that comparison but can compare protected file bytes.

## Use boundary

The app remains browser-local. Tebra is still the chart of record. No cloud
backup, automatic data migration, multiuser database or enterprise authentication
was added. Use synthetic patients for clinic acceptance. Never bypass a storage
or writer-protection failure. A new file path or browser profile may have separate
records from the prior hosted/file copy. This visual update is not independent
clinical-reference or security certification.
