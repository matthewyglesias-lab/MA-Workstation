# Resumed deep-surface review

Continues the interrupted `558db7fc` pass in draft PR #68. The approved
Lightfully masthead, palette and layout are retained. No merge or deployment.

## What was recovered

The interrupted pass had committed the refreshed history drawers, patient cards,
reference catalog, daily closeout, confirmations, lookups and staff settings.
Its 98-test targeted browser run failed five UDS scenarios because they still
searched for the old `Staff Sign-In` dialog. The visible and accessible dialog
is now `Documenting staff`: a local name, not authentication. The scenarios
are preserved and their selectors updated; no safety assertion is removed.
The same deliberate name change is reconciled in the other original test files.

## Final interaction fixes

- Share backdrop-gesture handling between ordinary dialogs, record confirmation
  and staff settings. Clicks in padding, secondary pointers and text-selection
  drags must not dismiss them. A pending record action still owns its close guard.
- Consistent Tab/Shift+Tab wrapping in confirmations and staff settings, excluding
  disabled, hidden and negative-tabindex controls from the keyboard sequence.
- Lookup search ignores composition Enter, supports ArrowUp, and provides a
  focused Clear search recovery without altering the current field value.
  Lookup results have one tab stop while keeping arrow-key browsing.
- Daily activity filters match the worklist/reference keyboard behavior. An empty
  category can return to All without changing or deleting the log.
- Remove remaining misleading sign-in wording in the visible UDS hint and staff
  provenance label. Underlying authorship, local storage and review are unchanged.
- Keep notification surfaces neutral; their actual text, not decorative green,
  communicates the result. Clinical errors and warning treatments are untouched.

## Scope and verification

Only presentation, tests and this development note are changed. All protected
clinical, persistence, documentation, print and approved AVS blobs remain pinned.
No dependencies, SQL, PIN, cloud synchronization or patient-data migration.

Before remote browser review: type/static checks, build and 725 unit tests passed
locally. Five additional browser cases cover confirmation gestures and focus,
lookup recovery/composition, staff-dialog focus, and activity filters at two sizes.
Browser navigation is restricted in the working container; the exact candidate
must be validated and visually inspected from the branch CI artifacts. The
original full visual/interface suite is not declared cleared by a targeted pass.

A narrowly scoped, one-use patch transport is used to publish these reviewed
local edits through the GitHub runner. It checks the exact parent and patch hash,
commits only an explicit file allowlist, runs the protected-boundary check and
tests, and uses a non-forced push to this draft branch only. Its transport files
remove themselves in the resulting commit. Existing review workflows remain
read-only and no deployment or release action is included.
