# Lightfully refinement implementation ledger

## Authority and baseline

Approved implementation handoff: `MA_Workstation_Codex_Handoff_Prompt.txt`, supplied
2026-10-03, followed by the complete ZIP. All 19 package hashes verified. Read
START_HERE and all three planning documents completely. Operative v2 specification,
audit and 48-family matrix preserved under `specification/`. Historical probes
reproduce bugs; they are not installed as acceptance tests.

Fresh clone/fetch: main and `codex/lightfully-composition-refinement` both at
`30833af68337fa85334ccd7f49d04d65c8ffeac6`, clean checkout, no intervening changes.
PR #69 is merged; no old candidate patches applied. No AGENTS.md found.
Read existing density/appointment implementation/release notes and premium
composition ownership notes. No framework, dependencies, workflows, database,
print styles or deployment changes authorized by this checkpoint.

## Findings and acceptance traceability

| Finding | Status | Owners / evidence |
| --- | --- | --- |
| F04 exception visibility/data conflation | In progress | InjectionPanel.tsx, ClinicalRegister.tsx; real browser regression pending |
| F05 identity/reminder carryover | In progress | InjectionPanel update boundary and selected-patient action; recovery tests pending |
| F01–F03, F06–F10 | Pending implementation | See supplied audit and full specification; all remain required |
| 48 QA families | Pending complete verification | D01–D03 and R01 have checkpoint evidence; remaining families require mapping and final suite |

## Baseline verification

At baseline above: `npm ci`; `npm run check`; `npm run test:unit` (**821 passed,
58 files, no skips**); `npm run build`; `node scripts/package-standalone.mjs`
passed. Pinned Playwright Chromium 151 downloaded with repository Playwright
1.62.0. No baseline browser result yet. Build's existing large-chunk warning
remains outside scope. Generated standalone package is an untracked local
artifact, not source to push.

## Checkpoints

Ownership checkpoint prepared; commit/push follows verification below.

- `TransactionLine` now receives independent `open/onOpenChange`, derived summary
  and controlled-content relationship. Single consumer audited; native reference,
  provenance and appointment disclosures already separate view state from facts.
- Exception choice is explicit. Required evidence determines Needs details versus
  Documented; collapse preserves values; Remove exception confirms populated removal.
- `applyInjectionIdentityTransition` runs at the current encounter update boundary,
  including both typed and selected-patient changes. Exact no-ops do not mark dirty.
  Saved-record replacement remains with the validated record loader; existing
  absent/old envelopes do not borrow current reminders. No changes to schemas.
- Related wiring correction: main formerly passed the **edited identity** back
  into `activePatient`, hiding the restore control. It now passes the coordinator's
  existing selected identity; banner/notes still describe the edited encounter.
- Existing conditional-exception test now explicitly selects the clinical checkbox;
  opening alone is no longer expected to record an exception.
- Preservation guard adds only the exact hash of the new presentation policy.
  Protected engine, note grammar, legacy runtime and print files remain unchanged.

### Verification of checkpoint source

`npm run check`; `npm run test:unit`: **827 passed / 59 files, no skips**;
`npm run build`: passed. Browser retries zero on pinned Chromium 151:
34 existing/new tests passed in the ownership/density/full-draft run, with two
new populated-exception tests initially failing because the test had selected no
medication and evaluator requirements correctly hid medication-dependent fields.
Corrected applicable fixture (Haldol selected): **2/2 populated tests passed** at
1440×900 and 800×600. Existing conditional administration/waste/exception gate:
**1/1 passed**. The empty-disclosure 20-cycle test and actual selected-patient
restore test passed. No failed check is called passed.

Baseline disclosure regression failed with dirty=true after opening; baseline
identity setup timed out because the restore control was hidden by wiring, not
proof of a carryover event. Corrected actual restore path passes and saved snapshot
has the selected DOB and empty reminder. Pending autosave from earlier input is
settled using the browser clock before view-invariant assertions; 20 subsequent
cycles preserve write counts and complete record bytes. Populated cycles preserve
note bytes and dirty=false, and canceled removal preserves values. Expanded selected
exception fields and intentional removal were exercised through actual UI events.

Further review-fingerprint/AVS/signed/Next-patient coverage and full suite remain
required; these tests alone do not close all F04/F05 acceptance families.

## Published checkpoints

1. `ec6be10e0422b1247fb9430e51c79b2572405491`: ownership fixes, pushed to the
   intended branch. Actual draft PR: https://github.com/matthewyglesias-lab/MA-Workstation/pull/70.
   Native Git push authentication was rejected; exact local Git tree and commit
   were published through authenticated GitHub Git objects with a non-force
   fast-forward, then fetched and compared. No intervening work overwritten.
2. `dac180afa5e2b0ea76f25f25aaa612b643d49e25`: step-specific progress checkpoint: one pure model uses positive
   engine requirements, exact shared verification predicate, existing review
   freshness, actual command capability and durable lifecycle. Rail, summary,
   preview and worksheet header consume it. Unknown named stops precede warnings.
   Removed aggregate suffix algorithm, repeated expanded rail and 128 obsolete
   kiosk checklist CSS lines. No engine rules or authorization changed.

### Progress checkpoint verification

`npm run check`, exact-hash preservation guard, **849 unit tests / 60 files**,
Vite production build with patient-screening flag enabled: passed. **12/12 browser
checks**, retries zero, include both 1440×900 and 800×600, actual staff sign-in,
empty/incremental progress, seven-step navigation, completed checks disclosure,
full-view preview consistency, all ownership cases and existing successful local
signature/Next path. First run caught two inappropriate fixture assertions: the
engine hides Response when no medication is selected; tests now assert that
applicability explicitly. This does not prove the missing-target focus fallback,
which remains required in the next checkpoint. The saving lifecycle unit case
caught and fixed signing availability while saving.

The only domain difference exports the existing verification predicate unchanged.
Clinical output golden parity passes. Preservation hashes were reviewed for that
exact extraction and two new/changed projection files; no broad protected scope
was removed. Baseline before images and measurements captured at all four requested
sizes in the local evidence workspace: ordinary timing 321px, worklist 5 visible
rows at 1440×900 and 3 at 1366×768. These are observations, not acceptance.

## Remaining work

Reveal/focus navigation, specific invalidation receipts, optional summaries,
non-administration destructive transitions, completion/Next stress, fault-injected
lifecycle tests; upper shell, populated worklist, timing anatomy and entire preview;
full 48-family traceability and exact-final-head checks. PR remains draft until
these engineering gates pass. Clinic observation, assistive technology and physical
printer checks are separately outstanding and cannot be inferred from screenshots.

### Navigation/disclosure checkpoint (this commit)

- Removed the duplicate Injection field/tab map; issue, preview, rail and review
  routes use the shared typed mapping. A scoped request reveals dependent content,
  waits for mounting, focuses the visible control, or lands on an actionable
  visible page fallback. Same-tab steps and reselecting the current step work.
  Full/focused view retains a valid location; edits never auto-advance.
- Specific material-change receipts follow the unchanged engine fingerprint.
  Affected Administration moves to Review again; unrelated identity stays recorded.
  Appointment edits and exact no-ops are exempt. Receipts are transient view state.
- Vitals, supplementary response detail and additional note items use the same
  independent disclosure primitive and populated summaries. Custom required details
  stay visible. Twenty actual collapse/expand cycles preserve note and record bytes;
  same-record recovery restores all values. No automatic note statements added.
- Populated handoff removal on returning to administration has deliberate cancel/
  accept behavior. Existing administered sign safeguards unchanged. A leftover
  selected exception on a handoff is now reachable for its required removal.
- Next patient has synchronous duplicate-activation suppression; failed starts
  remain retryable. Additional outcome/fault tests are still required.

Checks/static/preservation and **857 unit tests / 61 files** pass. Production build
with screening enabled and **45/45 browser tests**, retries zero, pass: ownership,
progress, new navigation/disclosure cases, existing focused journey and all 27
full-draft protection cases. Earlier runs exposed a scoped lookup that omitted
continuation siblings; fixed by looking only in the mounted visible editor, including
its continuation. The actual rail/preview/dialog paths now pass at both core sizes.
Date is fixed while native animation frames run for focus tests; persistence cycle
checks use a controlled clock and settle pending autosave explicitly. No focus
assertion was relaxed to make a broken route pass.

### Completion/output/failure checkpoint (this commit)

The focused signed outcome now offers Print patient handout, Copy note and Next
as distinct actions. Copy uses the same canonical section strings and exact divider
as preview; read-only scope disables journey navigation and keeps one inert retained
editor. Existing clipboard feedback is local to the outcome, keyed to record identity.
Native Next double-click plus repeated Enter creates exactly one encounter generation
at both core sizes; the signed record remains byte-for-byte intact and new patient
identity, appointment, disclosure and receipt state reset.

Fault injection rejects draft writes and completed-record writes through the real
storage boundary installed before application boot. No success card precedes durable
signature. Values remain visible, one draft/id survives retry, and one completed
attestation is stored after actual recovery. Denied clipboard plus denied fallback
shows Copy blocked; copied attempted text matches the exact canonical note. A delayed
copy resolves after Next without showing success on the next patient. Native print
request/return preserves signed-local state and historical bytes; physical printing
is not asserted.

Source inspection and failure testing showed that the existing command explicitly
permits a protected retry after a rejected write. The prior projection's provisional
error-state gate would have contradicted that command. It now preserves that real
capability, shows Save failed, and labels the step Retry signing (or Retry handoff
save), never an unqualified Ready to sign. The unit case now asserts the command
contract and visible failure together. No signing guard was weakened or added.
Saves/signatures use synchronous browser-local storage; async database-save delay is
not an application capability. Pending presentation states are tested in the pure
model; actual failed writes and delayed output/stale callbacks are browser tested.

Checks, preservation, **857 units / 61 files**, screening-enabled build pass.
**7/7 completion/fault/focused browser tests** and **5/5 ownership browser tests**,
retries zero, pass. The ownership test now has a positive AVS control with patient A's
appointment before selected-patient restoration, then checks canonical/save/preview/
actual AVS patient B identity and absence of A's provider. Another actual 20-cycle
case starts with a current administration review and preserves its fingerprint,
saved note, writes and dirty=false. A real generated Letter PDF was extracted and
visually inspected: correct DOB, blank write-in reminder, honest STAFF PREVIEW —
NOT FINAL scope after identity/review change. Artifact in `evidence/`.

### Upper shell / populated worklist checkpoint

Removed duplicated Continue work heading and launcher explanatory copy. Retained
one Document care primary, readable 13px destinations and label at 800px; removed
the old patient-safety margins and narrow fixed cell heights at their source.
Native worklist rows remain table-row/table-cell; draft source now uses neutral
lifecycle tone rather than the legacy draft warning. Actual review items retain
warning text/glyph/tone. Names use 14px type and wrap without truncation; normal
rows are 61px. Ordinary 14-item mixed-service fixture gives six complete rows at
1440×900 and four at 1366×768; narrow long rows grow naturally.

Checks/preservation/build and 857 units pass. Seven existing shell/service/browser
checks and four new populated worklist checks pass, retries zero. New fixture was
initially quarantined because one patient's summary identity disagreed with its
snapshot identity; corrected both instead of weakening the isolation guard. Visual
review then found actual Document care/search overlap at 800px despite individual
boxes fitting. Removed the optional plus icon at this width; added explicit sibling
clearance assertion. Final four-size tests pass, and screenshots were inspected
at 1440 and 800 with clear 10px clearance. Artifacts in evidence/after-shell/.
The original before captures remain in the evidence workspace for final comparison.

### Typed injection timing checkpoint

Audited both injection call sites and the UDS point-of-care consumer. Injection
now uses its own typed presentation-only register (next/elapsed/window semantic
keys); the existing UDS report component and clinical values retain their API.
Removed superseded injection-specific schedule CSS; timing.css owns the new
surface. Future due date/provenance/actions and this visit's elapsed/window/status
occupy separate semantic groups. No calculation, callback, missed-dose guidance,
weekend flag, override provenance or clinical severity changed. One concise live
status replaces the entire readout's live region; unrelated patient edits cause
zero mutations in that status. Guidance is quiet when ordinary and expands when
warning/stop. No dedicated empty Override footer or green success band remains.

Checks/preservation/screening build pass. Seven existing timing/override/Other/
weekend browser cases and four new actual-interaction composition cases pass,
retries zero. Wide ordinary timing meets the 180–220px target; both named regions,
all engine values, source and cancel behavior asserted at all four requested sizes.
Initial layout measured 248px, so the facts were regrouped rather than weakening
the height check. Screenshot review at 1440 and 800 confirms separate dates and
visible actions/guidance. Artifacts in evidence/after-timing/. Full clinical state
and output parity suites remain required in final verification.

### Entire preview / retained responsive editor checkpoint

A single lavender stage owns one scroll region and the white generated document.
Consolidated title/local read-only scope/Copy in one command header; removed
redundant Local badges and all line-number DOM decoration, while retaining the
lossless parsing utilities and canonical copy source. Body is 13px with preserved
whitespace and wrapping. Document identity stays visible, including at 800px;
end-of-note is reachable. Removed 269 obsolete note/gutter rules and superseded
Lightfully preview layers; preview.css is the screen owner. No print rules changed.
Completed injection summary measures 46px, View checks starts closed and preserves
explicit expansion across ordinary state/view updates. Active concerns remain
outside it. Other-service completed checks now disclose without hiding active items.
Patient banner injection Record status uses the shared saved/signed lifecycle,
rather than the legacy aggregate attention label contradicting a ready action.

Split decisions use the actual available transaction width: 600px entry + 480px
note + 16px gutter. Narrow preview makes the retained editor inert/aria-hidden and
full-width; the identical response element survives Details/Preview switching.
Source actions restore the visible form before focus. Note copy feedback is keyed
to actual document identity, so old completion cannot leak into another patient.

Checks/preservation/build and 857 units pass. 22/22 browser tests, retries zero,
cover all four preview sizes, exact whole-note/section attempted clipboard bytes,
46px summary, one scroller, no decorative DOM, expansion preservation, usable pane
widths, retained editor, source focus, ownership, lifecycle faults and all services.
New test initially attempted an unsupported response key; corrected to an actual
catalog option, without changing response rules. Final screenshots reviewed at
1440/1366/800; artifacts in evidence/after-preview/. Zoom/text enlargement, expanded
long fixtures, full matrix and exact-head suite still remain required.
