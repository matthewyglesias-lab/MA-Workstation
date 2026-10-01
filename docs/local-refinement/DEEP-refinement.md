# Deep-surface and behavior refinement

Continues the user-approved Lightfully direction from `5121fcf4` in draft PR #68.
No merge, deployment, database, PIN, staff authentication or synchronization.

## Presentation scope

Refine the previously secondary surfaces: injection and UDS saved history,
patient details and hover cards, clinical reference, daily closeout, field
lookups, required-item lists, staff/location dialogs, confirmation and final
review, command search, menus and feedback. The masthead, palette, editorial
hierarchy and primary workflows remain in the approved direction. Original
`final-polish.css` is retained unchanged as `utility-surfaces.css`; the imported
component refinements remain screen-only and do not restyle paper templates.

## Deliberate behavior changes

- Preview and Details act as selections, not toggles; repeating Preview does not
  hide the document or remount the clinical form.
- Shared modal dialogs dismiss only on a genuine outside-to-outside click, not
  interior padding or a selection drag out of the dialog.
- Unsaved staff/location text is not discarded by an incidental outside click.
  Explicit Cancel and Escape remain available. Staff naming is explicitly local,
  not described as an authenticated login or verified signature.
- Command search skips unavailable actions on keyboard navigation, keeps them
  visibly unavailable, ignores composition Enter, and blocks duplicate activation.
- Menus support consistent focus restoration/departure, directional keys and
  account-menu typeahead; context menus close when another control takes focus.
- RecordActionDialog rejects same-tick duplicate confirmations and stays open
  while a callback is pending; errors retain the original retry behavior.
- Saved-history and reference searches offer a clear reset and return focus to
  search. Storage errors remain explicit, never presented as an empty history.
- Reference categories have a roving keyboard tab pattern. Patient hover cards
  have unique descriptions and can be dismissed with Escape.
- Restrained opacity/color transitions respect reduced-motion preferences.

No record repository, clinical engine, existing validation, note generator,
legacy runtime, medication content, completion rule, stored schema or print
renderer is changed. Existing callback paths continue to own navigation,
loading, signing, discarding and persistence. The AVS hours and approved
conditional three-day return wording are retained unchanged.

## Validation boundary

Local type/static checks, all 725 unit tests and production build passed.
17 policy cases cover enabled-command navigation, action gates and backdrop
coordinates. New browser scenarios exercise real saved history, lookup and
review dialogs, reference categories, repeated Preview, staff settings, menu
focus/typeahead, backdrop gestures and reduced motion at 1440 and 800px.

Local application navigation is blocked by the execution environment, so only
CI screenshots and browser results on the exact commit can certify these
browser scenarios. Inspect that run before distributing its artifact.
The inherited full original visual suite is not presumed green; do not weaken
assertions, force interactions or replace snapshots without reviewing them.
Final clinic acceptance on managed Edge workstations remains required.
