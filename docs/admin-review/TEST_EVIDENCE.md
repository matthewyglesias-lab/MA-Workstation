# Exact engineering and review evidence

Certified source: `4886db988834783058ca06cc97e39548edd5be44`.
Certified tree: `c5309c9630b3bbdaf1d63bdd40cdaa34cd7ea650`.
Main baseline: `7dbfd3a75531b7d1b5244c505f277e5102feaedb`.

## Completed gates

| Gate | Result | Exact run / evidence |
| --- | --- | --- |
| Clinical preservation | Passed; protected engines, schemas, note grammar and approved print bytes preserved | `node scripts/check-local-refinement.mjs` in full review |
| Type/static | Passed | `npm run check` |
| Units | 898/898, 64/64 files | Full review and production pipeline |
| Production build / standalone | Passed | Exact archived artifacts below |
| Complete browser/visual/print | 414 passed; 0 skipped, unexpected or flaky; retries=0; 14.7 min | [Full review 37272385685](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/37272385685), job 111642036998 |
| Exact production artifact | 413 passed, 1 standalone-only opt-in case skipped; retries=0; 18.6 min | [Production pipeline 37272385672](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/37272385672), browser job 111642060184 |
| PR preview deployment | Blocked by Azure's maximum staging environments | Same production pipeline, deploy job 111647081147; engineering jobs passed |

The standalone-only native-storage, no-remote-assets, save/reload/resume case
passed in the 414-case full review. No browser retry was available to mask a
failure. The full review saved the exact checkout COMMIT/TREE and JSON report.

Coverage includes all four workflows; Compact/Comfortable; focused Injection;
1440x900, 1366x768, 1024x768 and 800x600; actual 200% browser zoom and text
enlargement; forced colors; long/blocked/error states; patient isolation;
recovery and writer/storage failures; signed records/addenda; exact note copy;
integrated appointment AVS and long/warning print cases. Screenshot tolerances,
clinical golden fixtures and print contracts were not weakened.

The local full diagnostic run was 405 passed / 9 failed. Seven presentation
expectations were reconciled and passed targeted reruns; two zoom timeouts were
specific to the alternate scratch runtime. The authoritative locked CI runtime
passed both unchanged native zoom cases and the entire final suite. See
`../lightfully-completion/PHASE_6_CERTIFICATION.md` for the repair/inspection ledger.

## Artifact provenance

| Artifact | SHA256 |
| --- | --- |
| Original production-dist ZIP, artifact 11327844898 | `34a1bfb30efaf0a94e1ae9832a6b78b17378dc82a3a76a35d66e5482df90cbbf` |
| Original full-review ZIP, artifact 11329377762 | `7df31e69c2a916cf1f206f579a572ae564eb045e0188155b8092e385e589edac` |
| Exact standalone HTML | `7c22bcdb6c982679ac23a1b632f7bde46bda0776ed5b7bc242d26d2790c6267b` |

The downloaded production archive matched all 25 local output files byte-for-byte
when built with the same CI flag (`VITE_ENABLE_INJECTION_PATIENT_SCREENING=true`).
The standalone file's hash matches its original manifest and the same local
production build. The package preserves those original bytes.

The original standalone manifest's `sourceCommit` is GitHub's PR event merge ref
`f06e0c9e1f708089ffc1c49dc694aded5f992e8f`; it is preserved, not rewritten.
The authoritative checkout identity is the archived COMMIT/TREE above. The
supplementary provenance JSON records both references explicitly. Original CI
artifacts expire after seven days; the review archive preserves the selected
evidence and exact executable builds independently of that preview/retention limit.

## Synthetic scene set

See `evidence/scene-manifest.json` and the review gallery for 17 labelled scenes.
Thirteen come from the certified run: eleven unchanged PNG captures and two
PNG renders of its appointment AVS PDFs. Four additional scenes (routine focused
Injection, full Injection, normal UDS and failed save) are captured after the
gate from the exact downloaded production files using synthetic data and the
scratch browser. Those three capture journeys are separate from the 414 CI cases.
They do not alter the production bundle or claim managed Windows/Edge acceptance.

All 17 scenes and the selected appointment/long-warning PDF pages were visually
reviewed. The archive also preserves native 200% zoom/forced-color examples and
full browser-result JSON for detailed inspection. Final documentation additions
are separate from the certified runtime; no application source changes follow
this engineering gate.

## Scene links

| Scene | Review image |
| --- | --- |
| 01 | [Local worklist](evidence/01-worklist.png) |
| 02 | [Patient search and read-only chart context](evidence/02-patient-chart.png) |
| 03 | [Routine focused Injection](evidence/03-focused-routine.png) |
| 04 | [Blocked Injection with actual exception requirements](evidence/04-blocked-injection.png) |
| 05 | [Timing review: current visit and next due date](evidence/05-timing-review.png) |
| 06 | [Ready to sign, with documenting staff supplied](evidence/06-ready-to-sign.png) |
| 07 | [Signed locally, read-only long note](evidence/07-signed-local.png) |
| 08 | [Full Injection mode, same routine encounter](evidence/08-full-injection.png) |
| 09 | [AVS with write-in appointment fields](evidence/09-avs-write-in.png) |
| 10 | [AVS with typed appointment details](evidence/10-avs-typed.png) |
| 11 | [UDS normal QC and all fourteen results NEG; preliminary boundary retained](evidence/11-uds-normal.png) |
| 12 | [UDS NEG, POS* and INV! evidence; preliminary status](evidence/12-uds-abnormal.png) |
| 13 | [Samples with optional titration/prescriber intent](evidence/13-samples.png) |
| 14 | [Forms/request tracking and letter availability](evidence/14-forms.png) |
| 15 | [Saved injection records, browser/workstation scope](evidence/15-saved-records.png) |
| 16 | [Failed save keeps patient data and signing disabled](evidence/16-storage-failure.png) |
| 17 | [800x600 populated native worklist](evidence/17-minimum-workstation.png) |
