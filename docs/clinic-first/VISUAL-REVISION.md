# Visual revision after screenshot review

The subsequent [control refinement](CONTROL-REFINEMENT.md) refines this
composition using the actual Letter Builder reference. Its release scope
records the user's later authorization to merge after verification.

The user's review of `2818377` was correct: the reliability improvements were
substantial, but the application still had nearly the same screen composition.
That pass should not have been described as a completed visual redesign.

This revision changes the actual interface in the same draft PR. It is not a
mockup, and it does not authorize a merge or deployment.

## Composition

- The worklist places a dedicated service area beside the queue. Service choices
  use recognizable icons and descriptions; the queue remains the source for
  drafts, open sessions and documentation that needs review. Shorter displays
  compact the heading and service choices while keeping both areas visible.
- Wide forms have a persistent section rail beside the working sheet. At a
  smaller **form width**, including when preview is open, the same sections
  become horizontal tabs. The existing direct, non-sequential navigation remains.
- A shared tab-list component provides arrow/Home/End navigation, roving focus
  and an accurate accessibility orientation for all four supported services.
- Patient context has a consistent sage band. Clinical allergy and mismatch
  warnings keep their own semantic treatments. The form sits on a warm canvas,
  with its lifecycle actions attached to the working sheet.
- Routine review tips occupy a quiet disclosure alongside the required-field
  legend. Clinical validation, individual unresolved items and signing gates are
  unchanged.
- The generated note is presented on a distinct paper surface. Readiness checks
  remain visible above it, with two columns where space permits. Their redundant
  visual state labels remain available to assistive technology. The note pane
  scrolls as one document rather than clipping its content behind fixed sections.
- Typography distinguishes page titles from functional section headings. Dark
  green ink, warm surfaces and restrained sage replace the pervasive blue-gray
  treatment. Coral remains an action accent, with measured text contrast.

## Patient document

The AVS uses a full-width return-date panel, a simpler patient/visit register and
clearly separated dated treatment rows. The decorative timeline spine and the
duplicate short due date are removed from the printed composition. The complete
due date, all treatment steps, clinician-provided details and approved patient
instructions remain in the unchanged content model and renderer.

Body copy stays at 14.25px with its existing line height. Long-content page
breaks and explicit continuation pages remain. Spacing, not smaller body copy,
resolves page fit. Grayscale contrast, footer clearance, no-clipping checks,
required content and existing renderer hashes remain regression requirements.

## Verification

Four new browser journeys exercise wide-to-narrow section navigation, keyboard
movement, document preview and retained patient input for Injection, UDS,
Samples and Forms. Existing clinical, storage, document, keyboard, printing and
standalone coverage is retained.

The first full diagnostic found a legacy grid-row rule squeezing the worklist
heading and clipping the queue at small sizes. Explicit row sizing, compact
service choices and a bounded queue correct that defect. The home tests now
require every service choice and the empty-state action to be fully visible,
and explicitly reject a heading that overlaps either work area.

Color and image references must change for the deliberately changed layout.
The old decorative-spine geometry assertions are replaced with visible dated
treatment-step, row separation, page-width and four-step-depth assertions.
No clinical threshold, body-type minimum, overflow tolerance, content fixture,
or screenshot tolerance is relaxed.

The full local revision passed 752 unit tests and 306 browser tests. CI run
`36961647116` on `f19a5fe` passed all non-snapshot tests (299 passed; 7 image
comparison tests failed). Its eight differing images were inspected: differences
were limited to platform font rendering in headings, navigation and arrows,
without clipped controls or shifted clinical fields. The ZIP's SHA-256 was
`45675c02cb9e6079af4471cf59895a781789640be0d3e5e8fcf6d95df791f090`, and its
commit/tree manifest matched the published source. These eight Linux references
now use those CI captures; three unaffected references remain. The final full
gate must pass on the subsequent exact commit, including assertions after each
image comparison. This reference-only follow-up changes no application runtime.

The PR description records the exact final source and test run. Earlier passing
runs certify their earlier source only. Current screenshots and PDFs must be
inspected before replacing references; Linux output does not approve managed
Edge, Windows font rendering, physical printers or real clinic workflows.

No medication rule, saved-record schema, local storage key, Tebra note grammar,
clinic contact detail or medication-specific instruction changes in this revision.
The recovery and truthful-state fixes from the preceding increment remain.
