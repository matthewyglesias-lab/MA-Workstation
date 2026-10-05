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
