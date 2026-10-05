# Phase 3 — current baseline regression reconciliation

Parent: `d21b40637252b7e291520f75d9ba594c33fc2e29`.
This checkpoint changes browser assertions and two inspected Linux references only.
No clinical evaluator, sign gate, workflow data, timing calculation, print source,
notification owner, screenshot tolerance, or production component changed.

- Missing-response correction follows the existing ordinary requirement control.
  Before and after navigation, response remains blank and signing remains blocked;
  earlier documented steps remain intact. Actual-engine unit coverage still asserts
  the `response.required` stop and prohibited sign capability.
- Reference containment follows its native radio reading index, checks descriptions
  exist, and checks all four bounds plus horizontal overflow.
- Navigation is asserted in the existing polite announcement. Compatibility notices
  remain visible, expire, and can recur through the same owner.
- Vivitrol retains the exact window, expected day, elapsed 28/35 days, ordinary verdict,
  product-check instructions and real attestation. Only duplicate ordinary wording
  and its redundant `IN WINDOW` flag expectations are retired.

## Visual review

Reviewed all expected/actual/diff images for `ready-to-attest-1440x900.png` and
`locked-local-record-1440x900.png` from exact-parent CI run `37154278189`, artifact
`11285766768`. Download SHA-256:
`449f2b7064362bc9d34a9d91ce247084b5ce3f1624538172b19b69b17fa5500f`.
COMMIT/TREE provenance is retained in that artifact. References use its actual images.

The intentional difference is the existing disposition-control alignment: native
radios, aligned icons/text and a two-pixel section adjustment. Patient name/DOB and
allergy context, readiness, selected disposition, review attribution, appointment
output and footer action hierarchy remain readable. The locked image retains disabled
controls, Read only/Signed locally and dated-addendum access. Footer-adjacent output
uses the existing scroll container; screenshot alone does not certify reachability.
No new clipping was introduced. Both images reran successfully without update flags.
All snapshot thresholds remain unchanged.

## Verification boundaries

Local preservation, type/static checks, 898 units across 64 files, production build
and standalone packaging passed. Eight unique targeted browser cases passed with
retries=0. Local browser uses Chromium 153 through an uncommitted scratch configuration
(video disabled because the local ffmpeg binary is absent); CI retains its locked
Playwright browser and normal video settings. Final exact-head/production-artifact
results must be recorded after the checkpoint is published. Do not treat these
targeted results as completion of the full suite or admin-review readiness.

Next phase remains blocked until the complete Phase 3 gate is green.

## Local publication checkpoint

Test/reference checkpoint: `6d089a32d56952755fa1393c57f1ba48591058ee`;
tree `5cff6b151ad6e21b958e8fe3cef706e5b75676be`.
The following ledger update is documentation only; runtime and test bytes remain
the same as that checkpoint.

The attempted complete local suite was interrupted after reaching case 176 of
402, with retries=0. It is **not a complete browser pass**. It reported:

1. An existing conventions browse/return assertion differing only in the active
   draft's `updatedAt`. Separate instrumented exploration observed the legacy
   700 ms autosave writer; it did not establish the cause of that return assertion.
   Exact storage equality and patient-isolation assertions remain unchanged.
2. A native 200% zoom timeout in a test that launches its own persistent Chromium
   channel. The alternate local executable does not establish the configured
   Playwright/extension environment. Later clock-driven cases stopped progressing.

The eight Phase 3 repairs have targeted local proof, but the complete gate remains
unverified. Do not begin Phase 4 or create a final admin candidate from this state.
No exact-production CI suite has run for the unpublished checkpoint.

Publishing to `codex/lightfully-clinical-patterns` was rejected by automatic approval
review for insufficient explicit authorization to publish to the GitHub remote.
The remote remains `d21b40637252b7e291520f75d9ba594c33fc2e29`; PR #71 is draft.
The prepared local commits require user approval before another publication attempt.
No alternate write route was used. Main and production are unchanged.

After publication approval, run the existing unchanged full-review and production
artifact workflows, verify this exact head/tree and all attempts, then investigate
any remaining failure without dropping invariants or widening image tolerances.
Record the complete results before continuing the phased refinement.

## Authorized publication and complete gate — 2026-10-05

The user authorized publication. GitHub published commit
`37629ad4386a271ba7982726ef3552a03a32276e`, tree
`63a9275dc3c179883526ffa1f99e7b069f155f5f`, exactly matching the approved
local candidate tree. The earlier publication-block paragraph is historical.

- Full review run `37267036690`, attempt 1: **402 passed**, 0 skipped,
  0 unexpected, 0 flaky; configured retries **0**. Preservation, check, all
  **898 units / 64 files**, build and standalone package also passed.
- Artifact `11327860057` includes matching COMMIT/TREE and browser JSON.
  Download SHA-256:
  `477a0d9703e2f9337243bea9edf53e809a4712b34992883f9f6bed127dc28c7e`.
- Production-artifact run `37267036717`, job `111626027697`: **401 passed**,
  1 intentionally skipped standalone-only test. No retry was used; the unchanged
  production configuration still permits one CI retry and will be made strictly
  zero before final certification.
- Production-dist artifact `11326514709` SHA-256:
  `a565a504a8d19e2c90435d76fae9a35a2ac0e32ecc89eb9a4e4dc34315f207ba`.
- The pipeline's later preview deployment failed because Azure has reached its
  staging-environment limit. No unrelated environment was removed. This is a
  hosting-capacity limitation; the exact artifact browser job passed.

The local alternate-browser browse timestamp failure was traced, in scratch
instrumentation, to a legacy autosave scheduled before the test installed its
clock. Installing the clock before patient edits and retaining exact-byte equality,
including a further 1000 ms after return, passed. No production or committed test
change was made for that local-only result. The configured CI browse and native
200% zoom cases passed in the complete run.

Phase 3 is green. PR #71 remains draft; main and production remain unchanged.
Phase 4 may proceed. This is a baseline engineering checkpoint, not the final
admin-review candidate.
