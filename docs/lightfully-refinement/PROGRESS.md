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
2. Step-specific progress checkpoint (this commit): one pure model uses positive
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
