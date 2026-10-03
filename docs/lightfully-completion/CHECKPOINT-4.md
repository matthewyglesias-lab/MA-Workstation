# Checkpoint 4 — current local search and purposeful feedback

Continues `a81d04d` on the existing draft PR. No new workflow, event listener,
repository, signing authority or clinical/print change is introduced.

The checkpoint-3 full report completed: 385 browser cases passed and 15 failed,
with no skips or flaky results. Eight patient-context cases showed no results
when searching immediately after saving the current draft. Source tracing found
that the shell's patient index refreshed on workflow/lifecycle transitions but
not an ordinary draft save. Search focus now asks that same shell-owned,
validated index to refresh. The existing read-only browse/return, identity and
allergy contrast cases exercise this path; the change still requires CI proof.

Routine navigation/focus events now carry an explicit `navigation` purpose.
They are announced in the existing polite region without a floating toast.
Consequential action messages retain the visible notification and the legacy
notification channel is never filtered by text. The original observer and
cleanup remain the only compatibility owner. Seven targeted unit assertions
passed locally; two actual-navigation browser cases are added.

An empty patient banner is omitted on nonclinical tools only when there is no
patient/draft identity or mismatch to communicate. Active clinical work retains
its patient context, including partial identity. This recovers space without
concealing an active patient or introducing another navigation tree.

Runtime TypeScript passed in the recovered local source checkout; historical
auxiliary files in that checkout are not a complete-history/full-suite claim.
Normal local browser navigation remains policy-blocked. Exact-head CI and visual
inspection are required. Known outstanding failures include intentional
presentation/selector expectations, a print-fixture visibility failure requiring
investigation, and obsolete images requiring actual review before replacement.

Remaining implementation: overlay/menu family, scoped records headings,
Samples optional titration, Forms availability disclosure, UDS evidence-table
finishing and preview/worklist fine details. No merge or deployment performed.
