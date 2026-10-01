# A friendly first layer, with the power still there

Continues the approved Lightfully-led direction in draft PR #68. No merge,
production deployment, database, PIN, account, or storage migration.

## Visible everyday work

Patient and allergy context, evaluator-derived status and outstanding-check
access, save state, Save and Sign remain visible. The worklist keeps all four
services and the real local work. The global service chooser takes a quieter
secondary treatment during an encounter so it does not compete with signing.

## Deliberately revealed tools

- **Workspace** brings command search, the existing density preference and the
  original guided injection view together. Ctrl+K still works without opening
  it. The command search can recover from no results through Show all tools.
- **More actions** in Injection and UDS keeps New and Discard available without
  putting the destructive choice in the everyday row. The original callbacks,
  save-before-navigation behavior, errors, locking and confirmation gates remain.
- **Use existing details** in Samples and Forms contains the existing explicit
  patient/staff reuse controls, with their original disabled conditions. Opening
  it never copies or confirms anything. The staff label describes documentation,
  not authentication.
- **Review tips** can expand the existing longer instructional reminder. A brief
  patient/details check (or Tebra filing reminder in Preview) stays visible.
  No evaluator warning or required field was put behind this disclosure.
- Remove the patient-chart More menu which contained only an unavailable message.
  New Note, Print, and Customize View remain, with all real callbacks intact.

## Interaction contract

ActionShelf is a native details/summary disclosure, not a modal dialog and not
an ARIA menu. Its controls stay mounted while closed and keep their own handlers
and disabled rules. Enter/Space and Tab use native behavior. Arrow keys on the
trigger enter the first/last available tool; Escape returns to the trigger;
focus or pointer departure closes without stealing focus. Selecting an action
closes first so a subsequent confirmation captures a stable, visible opener.
The spacing toggle deliberately stays open while edited. Existing modal dialogs
retain priority. No hover-to-open, automatic attestations, hidden resets or new
clinical state are introduced.

Screen-only styling uses the established serif/sans pair, blue-gray ink, warm
paper, coral, muted sage and ochre. It does not recolor medical status as branding
or affect generated documents. The approved 8:30 AM–5:00 PM AVS hours and conditional
three-day routine return wording are unchanged.

## Validation and review

The local type/static checks, build and existing 725-unit suite passed before
remote browser validation. This environment cannot navigate a local app in
Chromium; actual browser validation and screenshots must come from the exact
candidate on CI, not be inferred from a build or static image.

New browser cases exercise closed/open controls, small-window bounds, primary
and safety controls remaining visible, unchanged records after disclosure use,
confirmation/focus return, density persistence, empty-search recovery and F12 /
Ctrl+K. Existing browser journeys now explicitly open the new disclosures before
using those same actions. Their clinical, save/restore, error and print assertions
are retained; no forced clicks, lowered thresholds or regenerated snapshots.

A targeted pass is not clearance of the complete original visual suite. Keep the
PR in draft and test with fictional patient data separately from a working copy.

## Render-driven corrections

The first exact candidate passed 108 of 114 browser scenarios. The review caught
an inherited compact-row horizontal scroller clipping the upward record actions
at 800/1024px; fix the product overflow/stacking, not the click assertions.
Screenshots also exposed old icon-only toolbar CSS hiding the spacing labels.
The scoped shelf override restores those labels and tests their visibility.
Panel geometry tests now also verify the panel receives pointer input at its
center, rather than treating an in-bounds but clipped rectangle as usable.

Three focus-exit failures were obsolete selectors for the now-collapsed extra
action. The original guided view's visible Return to full workspace control is
retained and the tests use it, asserting its visibility and actual mode exit.
The command-search recovery button sits outside the listbox of destinations;
keyboard recovery still returns focus to the search field.
