# Clinic-first refinement of PR 68

Audit baseline: `4bc9b5bb2390568bf75a5dd06fda50fbd8ae5790` (2026-10-01).
This scope follows the user's application-wide refinement request. It supersedes
prior presentation-only limitations, while retaining the local-only runtime,
medication engines, established note structure, existing record formats and
review-before-release boundary. The initial audit was draft-only; the user's
later instruction authorizes merging PR #68 to main after verification.
See [CONTROL-REFINEMENT.md](CONTROL-REFINEMENT.md) for the current release scope.

## Observed findings and staged work

1. **Truthful state.** NoteInspector treats the legacy `posted` projection
   (which means locally locked) as `FILED`. Signing/copying cannot establish
   a Tebra handoff. Correct the display and test the distinction.
2. **Interrupted work.** Forms and Samples keep their complete typed drafts
   across mounted panels but only in memory. A beforeunload prompt cannot
   restore a browser reload. Add isolated, versioned tab recovery with explicit
   success/failure status, malformed-data preservation and exact-roundtrip tests.
   Recovery is not a completed record, shared storage, or a backup.
3. **Context and navigation.** Service selection does not expose the existing
   work it will resume. The home worklist combines saved injection drafts and
   activity summaries, not every editable service session. Make service/session
   context and recovery boundaries explicit without creating a patient database.
4. **Secondary surfaces.** UDS preview retains a terminal-style report,
   an incorrect organization name, and repeats collection time as reported time.
   Future TMS displays a fictitious completed note. Forms' letter UI is gated
   off despite retaining its model and renderer. Inspect these independently;
   do not infer that a disabled capability is supported or clinically approved.
5. **Presentation architecture.** The shell imports multiple generations of
   overrides. Consolidate the current Lightfully finishing layers into one
   maintained entry point; preserve print and clinical-state selectors.
6. **AVS.** Existing typed content keeps medication guidance separate from
   clinic visit policy. Retain approved 8:30 AM–5:00 PM wording and conditional
   three-day return instructions from this PR. Improve patient-facing hierarchy
   and verify long-content layout, draft/held status, and monochrome printing.
7. **Verification debt.** Prior reports list 32 failing historical interface
   tests. Reconcile intentional UI changes while retaining clinical, persistence,
   keyboard, geometry and print assertions. Do not classify unreached assertions
   as passing. Do not silently replace snapshots or lower tolerances.

## Baseline evidence

- Local production build: passed.
- Local unit suite: 736 tests, 52 files, passed.
- Local full browser attempt: browser executable missing (292 startup failures,
  one disabled standalone case). This is environment failure, not app evidence.
- Full read-only CI baseline at `6ed5b3f`: 261 browser tests passed, 32 failed,
  no retries. Run `36949881617` preserves exact source provenance, report,
  screenshots and traces. The failures are being reconciled individually.
- Only synthetic patient fixtures are permitted in tests and evidence.

## Verification boundaries

Medication eligibility, dose, route, interval, timing calculations and approved
product instructions are preserved. If clinical rules must change, stop and
obtain current primary references plus explicit rule tests before implementing.
Output fidelity and UI automation do not constitute clinical validation.

## Additional safety finding during implementation

The typed injection factory and compatibility runtime preselected routine
verification checks and NKDA; the compatibility response default implied
tolerance before observation. Compatibility sample controls also preselected
review/education. New sessions now begin unconfirmed. Historical documented
values remain intact. See [DOCUMENTATION-SAFETY.md](DOCUMENTATION-SAFETY.md)
for current primary-source rationale and regression scope. Dosing, eligibility,
intervals and established note grammar are unchanged.
