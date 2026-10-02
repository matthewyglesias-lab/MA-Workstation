# Compact workstation and integrated appointment AVS — release scope

The user approved the integrated appointment proof, the previously discussed
compact desktop refinements, and merging PR #69 to main after verification.
This document supersedes the local-only/pending descriptions in the earlier
phase implementation notes. The PR conversation records final exact-head CI,
merge, and deployment outcomes; this file is the pre-release scope record.

## Included

- Premium full-width composition and single-owner menu, keyboard-command and
  visible notification behavior from the first PR #69 phase. Obsolete command
  menus, alternate rail markup and redundant titlebars were removed.
- Real 34px desktop fields with 13px entered text, retained 12px labels, tighter
  row/section spacing and container-aware field groups. An unset preference is
  Compact; a previously saved Comfortable preference remains respected. Guided
  injection controls remain at least 44px. Workspace > Workspace spacing changes
  the existing cosmetic preference without modifying patient records.
- The formerly pending preview-grid correction. Older hidden row reservations
  are removed, and the current layout owns rows, columns and working height.
- Injection > Review > Document output > Provider appointment: handwriting-ready
  defaults for new encounters, entered/partial details, explicit front-desk
  scheduling prompt, and omission. The appointment is part of the original sage
  next-injection panel, with shared accent, typography and a fine divider.
- Independent injection and appointment dates. The date-copy action copies once,
  not a live link or a recurring booking. Provider/location/visit type are
  explicit reminder facts; the application does not book or update Tebra.
- Existing atomic encounter persistence extended with optional validated reminder
  metadata. Old envelopes remain readable without borrowing new defaults.
  Patient-identity changes reset the reminder. Signed details remain read-only
  and repeat printing uses the preserved snapshot.
- Reminder-only edits no longer invalidate completed administration review.
  This is a narrow, tested exclusion of appointment metadata; dose, ordering
  provider, administration date/time, next-dose date and lot edits still invalidate
  review. Medication/timing evaluation and warning instructions remain intact.
- Patient body text and handwriting clearance are not reduced. Routine handouts
  retain their existing pagination approach. A heavily warned/long first page can
  use an identified third page: safety and today's treatment first, due date plus
  appointment together on the follow-up page, then remaining guidance. Numbering
  and the page-one pointer are explicit. Omitted-reminder historical documents
  retain the original layout and pinned output fixtures.

## Candidate evidence

Source with inspected-image candidates: 54b4020c9b439136313bcf1df065f396c65e0150.
Tree: b2c3e63b5e6faf654b8314d6daf0e79fff33081b.
GitHub run 37057883072 passed full-history preservation, type/static checks,
820 unit tests, build, standalone packaging, 52 complete affected browser journeys
and 15 visual-candidate tests. Browser retries were zero; no failures, skipped
or flaky cases. Artifact 11249721077 was downloaded and SHA-256 verified:
ab4dbc53abd33468009a4165ecccbdc3cfc33f0a7a0fc0f512c0a0a9492e9067.
Its COMMIT/TREE files match the source above. Candidate generation is not final
certification: this documentation commit triggers a separate read-only full PR
suite against committed references. Merge requires that exact final suite plus
visual inspection. No screenshot/contrast tolerance was widened.

Two earlier failed candidate reviews found and drove fixes for the clinical-review
metadata coupling, a modal recovery test locator, and warning-heavy AVS overflow.
Their results are historical diagnostics, not current release proof.

## Discussed but not included, or requiring clinic verification

- An electronic post-sign appointment-only revision/version-history workflow.
  Signed snapshots stay immutable; paper corrections are not digitally captured.
- Replacing Saved records/F11 with a permanent records workspace, or replacing
  F9 lookups with field-anchored searchable popovers. Existing safe interactions
  are retained and refined, not replaced in this release.
- Further field-specific work: placing every date/time helper inline, fully
  harmonizing UDS date/time entry, provider credential display cleanup, and
  selectively shortening brief text areas. Shared density is implemented; these
  broader audit recommendations are not all complete.
- Automatic Tebra scheduling, monthly booking recurrence, arrival-time generation,
  or SQL/PIN/shared-cloud records. These are not represented as implemented.
- Managed Windows/Edge, real printers, pen-writing clearance and patient/staff
  comprehension in the clinic require actual clinic acceptance. Linux browser/PDF
  testing is engineering verification, not clinical validation.
- The existing Azure PR staging-environment quota is not changed and no unrelated
  environment is removed. Production deployment is checked separately after merge.
- Existing dependency advisories remain outside this presentation/handout change.
  The Forms authoring gate and unsupported TMS state remain intentionally unchanged.
