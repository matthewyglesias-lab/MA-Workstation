# Compact desktop forms and injection AVS appointment reminder

Implementation candidate based on PR #69 head
`771e36aec7ba413b371e22608446bb327955f7f9` (tree
`ea69eecef3bc349d860cc1b0a437da00e26b4951`). This source was prepared locally.
It is not a production release or proof of browser/clinical acceptance.

## Compact desktop

`controls.css` owns density dimensions. An unset preference selects compact:
34px fields, 13px entered text, 20px line height and 6px vertical padding.
Labels remain 12px. The existing saved comfortable preference is respected;
the same existing preference mechanism controls spacing, including portalled
dialogs. Guided injection view retains at least 44px control targets.

Old compact overrides and competing lookup heights in the earlier Lightfully
stylesheets are removed. Form row/section spacing uses shared tokens; field
columns respond to actual workflow-container width rather than viewport width
alone. Patient/medication groups retain minimum useful widths. No alternative
form renderer, global event listener, or density storage key is introduced.

The previously pending compact-preview fix is included: `shell-layout.css`
owns transaction rows as well as columns, height, padding and background;
six older transaction-grid rules are removed from `tebra-workstation.css`.
Actual browser geometry remains to be checked.

## Appointment reminder

One disclosure in Injection > Review > Document output contains the optional
reminder editor. New encounters receive blank write-in space by default.
Existing records without appointment metadata do not acquire new defaults.
Modes: write-in, entered details, explicit front-desk scheduling prompt, omit.
Partial entered details retain writing lines. Blank is not interpreted as
"not scheduled". Provider, location and visit type are entered/confirmed rather
than inherited from the ordering provider or today's clinic. Provider names
can be selected from the existing directory or entered directly.

A one-shot "Use injection due date" button copies a date only after the staff
member checks the actual booking. It does not link, recalculate, reserve or
move either date. There is no Tebra scheduling integration. The scheduling
section cannot document administration or authorize clinical care.

Date entry uses the existing WorkstationDateField commit lifecycle, not an
additional shortcut handler. Appointment times use a native time control and
print with explicit AM/PM; dates print with weekday, spelled-out month and
year. Free text is length-bounded and escaped by the renderer.

## Persistence and reprints

Appointment metadata is an optional property of the existing typed encounter
extension. Its envelope advances to version 3; versions 1 and 2 remain readable.
Malformed metadata is rejected. Old/absent envelopes do not borrow appointment
values from a current draft. Storage keys and the underlying record repository
remain unchanged. A patient-name/DOB edit resets the reminder to blank write-in.

A single scoped AVS-builder callback consults the current typed-state ref and
checks name, DOB, administration date and product before projecting metadata.
It restores the former callback on cleanup only if it still owns that callback.
The existing record-epoch resets remain authoritative. No new print listener or
second storage writer is installed.

Signed record details stay read-only for accurate reprints. An independently
versioned, post-signature electronic handout-revision workflow is NOT included.
Later scheduling changes can be marked on the patient's paper by the front desk;
they are not silently captured in a signed clinical record. This is a deliberate
limit of this implementation, not an implemented revision-history feature.

## Patient-facing output and pagination

The appointment section is nested inside the original sage next-injection
panel. It shares its green accent, typography and alignment, with a fine
divider and a slightly lighter surface. Typed date/time uses a subordinate
headline; partial details retain normal handwriting lines. Handoffs without
a due step receive a clearly labeled follow-up area without an invented date. The contact heading becomes "Clinic information"
only when a reminder is shown. Due-date wording explicitly refers to the injection
rather than denying that the separately listed appointment is booked.

Existing medication preparation, return-window policy, safety copy and dose
calculations are not changed. Non-routine timeline details are preserved, with
only the narrowly scoped appointment-language substitution. Handwriting consumes
print space even when all values are empty; the existing pagination budget now
counts that space. It can produce a continuation page rather than shrink patient
instructions. The existing 14.25px AVS body text is retained. Actual Chromium/Edge
pagination and physical handwriting clearance still require verification.

## Scope guard

The clinical preservation script retains its original baseline and protected
paths. Exact, reviewed hashes are added for the optional metadata/rendering
files. Browser verification found that the all-facts administration fingerprint
was inadvertently including appointment metadata, so editing a reminder cleared
an already completed clinical review. The reviewed fix explicitly excludes only
`avsAppointment` from that fingerprint. Medication/dose/timing rules and the
clinical facts in the fingerprint remain unchanged; tests prove reminder-only
edits preserve review while dose, provider, dates, time and lot edits invalidate
it. Guidance executable source remains unchanged beyond the optional type. The
script is not changed to broadly exempt clinical files.
The full-history guard itself cannot run against the source-only local checkout.

## Verification completed locally

- TypeScript and static compatibility checks passed.
- 811 unit tests passed; 1 pre-existing historical-print-provenance test skipped
  because its Git commit object is absent in this source-only checkout.
- 58 unit test files passed; no failed unit tests.
- Production build and standalone packaging passed.
- New browser test files were discovered successfully, NOT executed.
- Existing clinical fixtures, dependency lock, storage repositories, legacy
  runtime and the seven existing CI workflows were not changed.
- New component proof PDF uses the actual appointment renderer/CSS in isolation;
  it is not a full AVS pagination proof.

## Release gates still outstanding

Publish/apply this source to the actual branch; run full-history preservation,
unit, browser, visual and print tests with retries disabled. Existing screenshot
references describe the previous density and require deliberate inspection before
any intentional replacement. Never widen screenshot or contrast tolerances.

New coverage includes 34px/42px/44px density behavior, content-height comparison,
preview-height fill, partial reminder saving/reopening, patient-identity reset,
and five real AVS printing variants. Browser tests must prove these properties;
source contracts and unit results are not a substitute. Inspect desktop and
800x600, long/partial/remote appointment details, signed reprints, zoom/forced
colors, pointer/keyboard interaction, and actual print pages before release.

Normal local browser navigation is blocked by environment policy. No attempt
was made to disable or bypass that policy. No code was merged or deployed.


## First repository browser review

Run 37055658690 used full Git history: 812 unit tests passed, with no skips.
Forty of 42 focused browser cases passed, including actual 34px desktop geometry
at 1440/1366/800, 44px guided controls, and five appointment print variants.
Two failures were investigated rather than ignored: the clinical-review metadata
coupling above, and a recovery test selecting an identically named background
worklist row instead of the F11 dialog row. Recovery now explicitly selects and
focuses the modal-owned row. Additional long, remote, cold-chain and initiation
appointment printing cases use the actual application renderer and PDF output.
These corrections require their own exact-source complete review before merge.
