# Lightfully-led working interface

Continues draft PR #68 from the AVS update. This is an application presentation
overhaul, not a clinical release or replacement engine. No merge/deployment.

## Reference and adaptation

The public Lightfully homepage (https://lightfully.com/) was inspected on
1 October 2026 using a rendered screenshot and computed browser styles. The
reference uses light Canela headings, blue-gray ink, coral, yellow, pale
lavender, organic shapes and generous space. The workstation deliberately uses
system Georgia as an editorial analogue plus its existing bundled Inter for
working controls; no proprietary font or Lightfully logo is redistributed.
The approved IPMG logo remains embedded unchanged.

## Structure

- Replace the fixed SaaS-like side rail with a full-width brand masthead,
  Worklist / Saved records / Tools navigation and one coral service action.
- Show real local work below four direct service shortcuts. No fictional
  dashboard totals, shared work queues, patient arrivals or sync statuses.
- Preserve all original workflow transition guards; shortcuts open/resume the
  actual service and never clear it or create an alternate form.
- Give patient charts direct Facesheet / Patient notes navigation. Outside a
  chart, Patient records is a dismissible menu for the same callbacks.
- Replace the prior generic teal/sans theme in `ipmg-refinement.css` with one
  Lightfully-led component contract over retained structural compatibility CSS.
  Page headings, sections, field groups, hints, selectors, review cues, previews,
  dialogs, saved-record tables, action docks and focus mode share its vocabulary.
- Keep shortcuts in layout flow instead of floating over fields. Native lookup
  controls must remain clickable while the command disclosure is open.
- Maintain responsive variants at 1440, 1024 and 800px and the original
  unsupported-viewport guard. Compact mode remains only a display preference.

## Unchanged boundaries

Clinical rules, completeness decisions, medication sources, field provenance,
exception pathways, patient/draft persistence, locking, addenda, note contents,
print renderers/CSS and the approved AVS hours/three-day wording are unchanged.
No SQL, backend, account, PIN, package dependency or migration was introduced.
Review cues remain reminders, not assertions that checks or Tebra filing occurred.
All new style is screen-only. This is not a substitute for clinical review.

## Validation

Before commit, type/static checks, production build and all 708 unit tests passed
locally against the unchanged dependency lock. The exact committed revision must
also pass its original clinical/browser/print tests. New browser scenarios capture
all service sections, editor/preview, focus mode and 800px layout, check contrast
of the coral action, and exercise real F9 lookup with shortcuts open. Intentional
new visuals must be reviewed before replacing baseline screenshots; failures are
not to be hidden by increasing thresholds or removing clinical assertions.

The public reference capture is separate from the application tests and uses no
patient data. The branch-only workflows remain read-only and do not deploy.
