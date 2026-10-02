# Premium composition and single-owner interaction review

Base: main `50f993760252c2228443217abbb9ac92b45b1106` (PR #68).
The existing premium-composition candidate at `2541ed0` is retained and completed;
its earlier failing review is not used as proof of release readiness.

## Screen composition

The full-width masthead separates workstation navigation from patient context
and the current service. The home screen has one compact service strip above
one work queue. Working screens use a compact service heading, shared section
navigation, retained editor, document preview, and attached action dock. Patient
identity, unknown allergy status, and patient-context mismatch remain visible.
Lora headings, Mulish text, white 42px fields, lavender surroundings and sage
context remain; guided controls retain 44px minimum targets. No new font,
framework, account system or remote dependency is introduced.

Patient search explicitly searches local records. Browsing records leaves the
active service guarded and recoverable, with a visible return action. The
existing leave guard can save an active draft before browsing; read-only chart
browsing and returning do not rewrite existing records. Tests compare complete
original records by ID because the repository deliberately sorts on save.

## Ownership and deletions

- `lightfully/shell-layout.css` owns the masthead, patient banner, worklist and
  service composition. Superseded selector groups are removed from the older
  screen layers rather than reintroduced through another broad polish layer.
- `interaction/dismissal-owner.ts` owns non-modal pointer/focus/Escape dismissal.
  MenuButton, PatientSearch, ActionShelf and ClinicalRegister use the shared
  lifecycle hook. Opening another non-modal surface synchronously closes the
  prior one. Listeners exist only while a surface is open; cleanup is idempotent.
- `ClinicalDesktopShell` owns workstation command dispatch. The old
  `PowerCommandMenu`/`TebraChrome.tsx`, command deck, old rail disclosures and
  Panel titlebar DOM are removed, not merely covered or hidden by CSS.
- `Toast` adapts the retained legacy message sink to one visible notification
  surface, preserving storage/error messages and disconnecting its observer.
  Field prompts remain a separate contextual live region, not duplicate toasts.
- `Panel` owns the suspended editor state: it is inert and absent from the
  accessibility tree behind the guided signed-note outcome. Its single
  screen-only visibility rule lives in `shell-layout.css`. The former kiosk
  visibility override is deleted. The editor stays mounted for record/print
  adapters, without accepting clicks or keyboard focus behind the outcome.
- Patient-value typography targets direct children, not headings inside the
  nested patient-record menu. The actual banner name has a dedicated selector.
- Duplicate focus-mode grid and control-height overrides are removed. The
  shared control stylesheet owns guided input/button/lookup target sizes.
- Temporary review transports and patch-applying/environment workflows are
  removed from the final tree. Existing read-only PR checks remain authoritative.

## Deliberately retained boundaries

Hidden, inert compatibility mirrors remain where they support the unchanged
legacy documentation/persistence contract; their presence is not a second
interactive editor. The clinical viewport gate retains its capture-phase
shortcut guard only when the viewport is unsupported. The date-field lifecycle
registry still publishes uncommitted valid dates before persistence listeners.
Storage events, idle locking, fullscreen state and clinical lifecycle listeners
have distinct responsibilities and are not deleted solely for containing
`addEventListener`.

Domain/application engines, repositories, document renderers, legacy runtime,
main entry point, package lock, document fixtures, AVS styles and print templates
are unchanged relative to main. Existing medication checks, exception pathways,
local signature/administration distinctions and explicit Tebra filing status
remain. Patient mismatch retains amber guidance with a red enclosing border and
requires the existing explicit context action. Unknown is never styled as a
verified negative finding. The Forms authoring gate and unsupported TMS state
remain unchanged.

## Verification contract

Unit checks cover idempotent cleanup, re-entrant activation, synchronous
pointer/focus dismissal, native modal precedence, composing keys and removal of
obsolete owners. Browser checks exercise repeated opens/closes, one-command
invocation, modal focus, one visible patient entry, unique visible IDs, all four
service/preview flows, retained values, guarded patient browsing, and completion
at 1440x900 and 800x600. The old editor must be invisible and unfocusable behind
the signed outcome, then usable when the next encounter begins.

Visual candidates must be inspected, not approved by weakening tolerances.
Existing clinical and print fixtures remain unchanged. Final exact-source PR
CI must run the full suite with retries disabled, including standalone-file
coverage. A green old run, or a run which generated references, is not a
substitute for this final read-only check.

Local verification is limited by the container's browser navigation policy.
Type/static checks and unit tests run locally; the full-history print-baseline
unit requires repository CI. Browser verification uses the repository's locked
Playwright/Chromium environment, not the older container Chromium. Managed
Windows/Edge, physical printers and real clinic acceptance remain outside this
engineering review. Test success is not clinical validation or a proof of the
absence of every possible defect.
