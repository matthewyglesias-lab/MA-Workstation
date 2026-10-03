# MA Workstation — Lightfully design, truthful progress and calm usability
## Consolidated implementation brief v2 (working label: PR #70)

**Proposed title:** Restore Lightfully airiness, repair focused-injection progress/status, and make optional work quietly discoverable.

**Operative plan:** this version supersedes the previous PR #70 brief. It retains the four visual workstreams and folds in the behavioral and usability audit as required work, with two safety/ownership correction gates before visual completion. Companion documents: `MA_Workstation_Behavior_Usability_Audit.md` and `MA_Workstation_PR70_Behavior_QA_Matrix.md`.

**Repository:** `matthewyglesias-lab/MA-Workstation`  
**Suggested branch:** `codex/lightfully-composition-refinement`  
**Reviewed main commit:** `30833af68337fa85334ccd7f49d04d65c8ffeac6`  
**Reviewed main tree:** `92877a72db73526cbfff7f24a70e2f6f45829d22`

This document specifies future implementation. No new PR, production-code change, repository commit, merge or deployment was made while preparing this revision. Local audit-only characterization tests were executed; they are not implemented fixes or a fresh full-browser certification. PR #70 is a working label, not an assertion that GitHub has assigned that number. Refresh main before starting; reconcile intervening work rather than resetting the repository to this reference.

---

## 1. Product outcome and scope

Restore the calm, airy, carefully composed Lightfully direction that the user preferred in earlier, roomier versions, while retaining the compact form-entry improvements merged in PR #69.

The correction is **not** another global reduction in size, another theme, a blanket return to comfortable spacing, or another layer of CSS overrides. Preserve efficient field internals; restore hierarchy and breathing room through the composition of the surrounding interface.

The four visual workstreams remain the upper application shell, populated worklist, injection timing review and entire screen documentation preview—including its readiness summary. Two additional required workstreams repair focused-injection behavior and progressive disclosure across those surfaces. The “Ready to sign / 6 of 6 complete” screenshot is both a composition target and a status-consistency target.

**Preserve the focused injection design the user explicitly likes.** Keep its recognizable rail, patient context, focused layout and guided targets. Repair what the progress/status components mean and how navigation behaves; do not replace this design with another generic wizard.

**Success:** the app looks calm and considered before it looks compact, and staff can tell what they completed, what needs attention and what is actually saved. Patient identity and useful information receive emphasis; repeated progress systems, irrelevant options and decorative wrappers do not. A disclosure does not record a clinical fact, and a green progress icon does not grant clinical permission.

**Failure:** the result looks like the same administrative interface with rounder corners; becomes pale and low-contrast; restores the old amount of scrolling; or looks attractive only in an empty state.

### Preserve without redesigning in this PR

Preserve medication and timing calculations, clinical severity classifications, requirements for review and signing, override provenance, record schemas unless strictly necessary, guarded navigation, draft recovery and immutable signed records. Improve the presentation/status projections and the identified disclosure/identity transition defects without weakening their clinical authorities. Preserve exact generated note text for identical canonical inputs and existing copy/print semantics; correctly preventing an accidental clinical mutation is not a license to rewrite clinical wording.

Preserve the newly approved integrated provider-appointment AVS, its write-in/typed/partial/scheduling/omitted modes, independent appointment and injection dates, and long-document pagination. This PR refreshes screen presentation and behavior; it does not reopen the patient handout design. The identified alternate identity-transition gap in appointment reset is explicitly included as an ownership fix.

Keep the existing framework, bundled fonts, icon infrastructure, density preference and guided-view visual structure. Correct guided progress, status, navigation, recovery and disclosure behavior as specified in workstreams E/F. No new database, routing framework, state library, font family, icon dependency, or animation package.

---

## 2. Verified starting points

The reviewed main source establishes these specific facts:

- `lightfully/controls.css` already defines real 34px compact controls, 13px entered text, a 42px Comfortable option, and 44px guided controls. Do not implement those features again.
- `shell/AppHeader.tsx` and `shell/SectionRail.tsx` already provide one masthead, global destinations, and a Document care action. The problem is composition and emphasis, not the absence of a navigation system.
- `StartCenter.tsx` renders the worklist as a native table using `lf-work-row` and `lf-work-patient`. Preserve that separation from patient-note flex-card classes.
- `workflows/ScheduleRegister.tsx` renders a heading, source marker, verdict, definition-list rows, a colored guidance band, and an action footer. Legacy schedule selectors remain in `workflow-panels.css`.
- `NoteInspector.tsx` renders the aggregate verdict and full readiness list before the document, then document identity, copy actions, note sections, line-number markup, and persistence feedback. It is a generated-text inspector, not a PDF reader.
- `workflows/injection/timing-register.ts` intentionally scopes “ON SCHEDULE” to cadence. It must never become “Safe to administer.” The evaluator—not the new component—owns severity.

These are source findings. The dimensions and compositions below are **implementation targets**, not measurements already achieved.

### New behavior-audit evidence

Nine audited production modules match current-main blob hashes. In a recovered local source/dependency environment, 84 existing tests plus ten audit-only characterization cases passed (94 total, zero failures/skips). Those new cases demonstrate existing problematic output, not successful remediation. Normal browser navigation was blocked by environment policy, so fresh end-to-end interactions and clinic acceptance remain unverified.

The confirmed findings are: global final-readiness reused as live progress; incorrect step ownership of response/provider issues; signing capability inconsistent with the checklist; exception expansion coupled to recorded clinical data; an alternate selected-patient restoration path missing the appointment reset used by typed edits; and lifecycle/applicability omissions in signed or held displays. Navigation/focus, invalidation feedback and optional-content discoverability also require specific acceptance tests. See the companion audit for evidence grades, source pointers and reproducible examples.

The earlier brief's instruction to preserve all guided behavior/readiness projections is superseded where it conflicts with these corrections. Preserve domain rules and authorized record actions, not misleading UI state. Reuse or narrowly extract positive requirement evidence rather than globally changing the conservative generic checklist to treat every unflagged section as complete.

---

## 3. Visual system: airy surroundings, efficient content

### 3.1 Keep the established materials

Use the existing lavender canvas, white working surfaces, navy text, restrained teal accents, pale sage context, and selective coral action emphasis. Work within the existing Lightfully tokens before introducing another value.

Starting palette anchors already in the code are `--lf-canvas: #f6f3f6`, `--lf-paper: #fff`, `--lf-ink: #294255`, `--lf-muted: #617581`, `--lf-leaf: #3c7083`, `--lf-sage: #edf3ef`, and `--lf-line: #dde4e7`. Their availability does not certify every possible foreground/background pairing: test the actual combinations.

A pale divider can separate decorative regions; it cannot substitute for the contrast needed to recognize an input boundary or focus state. Keep ordinary labels readable. “Muted” must not mean difficult to read.

Normal completion should use a small icon and restrained sage treatment, not a saturated green banner spanning the screen. Actual warnings, errors, and stops retain explicit, distinguishable status treatment. Never suppress a clinical warning to make the screen calmer.

### 3.2 Typography and spacing contract

| Element | Starting target |
|---|---|
| Page/workspace title | Existing Lora; approximately 28–30px, normal weight |
| Navigation and main working text | Existing Mulish; approximately 13–14px |
| Routine field values | Retain 13px in Compact and current Comfortable behavior |
| Field labels | Retain readable 12px labels |
| Worklist patient names | 14–15px, semibold; stronger than secondary metadata |
| Module headings | 15–17px, semibold working typography |
| Primary timing date | Approximately 20–22px; secondary dates 13–14px |
| Compact single-line controls | Retain actual 34px height and aligned lookup buttons |
| Guided input targets | Retain at least the existing 44px geometry |
| Related field-row gaps | Approximately 10–12px |
| Major surface separation | Approximately 20–24px where space permits |
| Panel interior edges | Approximately 16–20px; consistent within a surface |
| Corners | Existing 8px controls; roughly 10–12px major surfaces |

Verify the intended fonts are actually loaded in rendered captures; declarations alone are insufficient. No all-caps microtext as the main organizing device, display-serif field values everywhere, exaggerated letter spacing, or new font family.

Do not use CSS `zoom`, whole-interface transforms, or a recommended browser zoom-out as the density solution. No density-dependent negative margins or clipped fixed-height text containers.

---

## 4. Workstream A — intentional upper shell

### Desired composition

Use a clear reading order: **brand → global destinations → local patient search → utilities/account**. Keep one visible masthead and one patient-context band when an encounter or browsed patient is active.

At a full desktop width, the masthead should remain approximately 64–68px high, with a restrained baseline-aligned composition. Give the brand and navigation room to read; do not fill every gap with another badge. Make the active destination identifiable through one subtle surface/accent and stronger text—not several competing selection treatments.

Keep global search visibly scoped to local records. Distinguish it from “Filter this worklist.” Do not make both controls look like interchangeable searches. Use readable labels without adding another large header band.

Keep Workspace tools and account controls grouped at the trailing edge. Local-only/storage status remains honest and discoverable. Actual storage trouble remains prominent rather than moving into an account menu.

Use one primary Document care action. On the worklist, the service shortcuts are subordinate accelerators, not a second large call-to-action system. While editing, starting another service remains subordinate to completing the current encounter and uses the existing leave guard.

### Patient context

The patient banner must keep the current patient’s name, DOB, relevant visit/provider context, and allergy state readable. Differentiate active-draft context from read-only browsing; retain the explicit return path and mismatch protections. Unknown allergies must never resemble a verified negative finding.

Keep normal context visually quiet, but allow long identities, documented allergies, and mismatch messages to expand. Do not truncate clinically relevant identity or safety text to maintain a prescribed height.

### Smaller widths

Below the width at which the full masthead actually fits, use a deliberate two-row composition rather than uncontrolled wrapping, compressed search, or ellipsis-only controls. Retain destination labels or explicit accessible names. Use the existing utility disclosure; do not invent a second mobile navigation tree.

The service title, service changer, Details/Preview switch, and section navigation should read as one coordinated workspace header—not a series of unrelated strips. Remove redundant routine guidance rather than decreasing label size further.

### Acceptance

At 1440×900 and 1366×768, the ordinary upper shell must not consume more vertical space than the PR #69 reference for the same state. At 800×600, maintain at least the existing usable working area under the same safety content. Legitimately expanded warnings are measured separately.

No clipped controls, accidental third row, duplicate active destination, focus hidden beneath a sticky band, or second interactive masthead. Every navigation path retains its existing command owner and unsaved-work behavior.

---

## 5. Workstream B — a refined populated worklist

### Structure

Retain a semantic table. A native table can be elegant; abandoning its layout would risk repeating the class-collision defect that was just fixed.

Keep one page heading, a quieter compact service shortcut strip, and one queue surface. Remove repeated instructional copy across “Worklist,” “Document care,” and “Continue work.” Each label should add meaning, not merely introduce another padded region.

Use the familiar Patient/task, Service, Date/time, Status, and Action organization. Preserve all filtering, counting, sorting, record validation, and correct-record opening behavior. Do not represent this local documentation queue as a live appointment schedule.

### Row composition

Patient name is primary; task/medication detail is secondary. Dates and times use stable numeric spacing and retain the current meaning and formatting. Allow long names and critical medication details to wrap. Avoid tooltip-only disclosure of important identity.

Start with approximately 56–64px for an ordinary two-line row, not a fixed maximum. Give the name/task pair approximately 4px separation. Use fine horizontal separators and a quiet header row, not a full spreadsheet grid, card shadows on every row, or thick pills for every value.

Use a single restrained row-hover surface. The existing explicit View/Review/Resume button remains the keyboard action. Do not add a competing row-click handler or an unnecessary extra focus stop simply to make the entire row clickable.

Draft is an ordinary lifecycle state, not automatically a clinical warning. Any distinction between lifecycle styling and clinical concern must use explicit typed state—not text-matching a status label. Actual review/stop states retain their evaluator-owned prominence.

### Ownership guard

`lf-work-row` and `lf-work-patient` must remain native table-row/table-cell layouts. Never apply `tebra-record-row` or other patient-note-card classes to the table. Keep patient-note cards working independently.

### Acceptance

Review empty, loading, failed/quarantined, filtered-empty, and realistically populated queues. Use synthetic fixtures with at least 12 varied rows, including long names, duplicate surnames with distinct records, mixed services, drafts, review items, and locally recorded work.

Target at least four complete ordinary rows at 1366×768 and six at 1440×900 in the reference state. Never achieve this by hiding required columns or shrinking names. Record actual counts and explain any justified deviation.

Test header/cell alignment, minimum useful patient-column width, native display values, scroll reachability, and correct-patient keyboard resume. A passing screenshot hash alone is not acceptance.

---

## 6. Workstream C — rebuild timing review, not just its colors

### Critical semantic distinction

The supplied example shows a next injection due October 30 and a timing window September 25–October 9, with an expected date October 2. Those are different time relationships. The source reads the next date from the next-dose projection and the window from the current timing evaluation.

The new composition must not make the current-visit window appear to be an October 30 return window.

### Proposed anatomy

Use one quiet **Injection timing** surface with two deliberately labeled regions:

**Next injection due** — the strongest date, followed by its calculation/provenance.  
**Timing of this visit** — elapsed days since the prior injection, the current-visit window, expected date, and the evaluator’s status.

At wider panel sizes these regions sit side by side inside one surface. At narrower sizes they stack in that same reading order. They are not three separate dashboard statistic cards.

For the supplied example, the hierarchy would convey:

- Next injection due: October 30, 2026; calculated every 4 weeks from October 2.
- This visit: 28 days since the previous injection; evaluated window September 25–October 9; expected October 2; On schedule / In window as applicable.

This example illustrates layout only. Production values, wording meaning, date calculations, day flags, and provenance remain sourced from the existing evaluator and encounter.

Remove gray label-cell backgrounds, stacked spreadsheet-like row bands, the full-width green success strip, and the dedicated mostly-empty footer for Override. Replace them with typography, spatial grouping, one restrained divider, and an intentional action position adjacent to the next-date/provenance region.

### States and actions

Preserve the evaluator’s not-evaluated, on-schedule, early, overdue, review, and impossible-date/stop distinctions. Do not independently promote overdue amber to red or demote a stop to amber. An overridden next date is provenance, not proof of acceptable timing.

Preserve every missing-input and non-administration condition, once-only/no-return case, initiation state, weekend cue, incomplete/legacy override review, and any medication-specific missed-dose guidance. Warnings expand the module; normal sizing targets never clip them.

Retain the current guidance that timing does not replace required active-order and product-specific checks. Style it as a quiet note in the ordinary state; preserve full prominent guidance in warning/stop states. Do not replace it with “safe,” “cleared,” or “approved.”

Move the existing override/set-return/review-override action without changing its callbacks, dialog, provenance requirements, cancellation, or Reset to calculated behavior. Distinguish setting a return date from overriding a calculated one.

Keep explicit status text and source markers. An accessible summary announces meaningful changes without rereading every timing value on every unrelated keystroke. Do not introduce a second live region that echoes the same status.

### Component implementation

Evolve `ScheduleRegister` or replace its visual component with a typed presentation-only equivalent. Audit both InjectionPanel call sites and all other consumers before changing the shared API. Use stable semantic row/field keys or explicit slots; do not assign importance by `nth-child`, row position, or English label matching.

Do not parse prose to reconstruct dates or introduce a second timing calculation. Preserve semantic definition-list structure or equivalent accessible relationships beneath the new composition.

### Acceptance

For the ordinary three-fact reference fixture, target roughly 180–220px at a wide form width, substantially below the supplied approximately 400px block. At the minimum supported width allow a deliberate stacked version. Long warnings are exempt from compact height targets.

Every prior evaluator input must produce the same clinical values, severity, day flags, provenance, and available actions. Before/after checks must explicitly prove that the current-visit window and future due date cannot be mistaken for the same range.

---

## 7. Workstream D — refresh the entire documentation preview

### Separate the viewer from the document

Use one quiet preview stage with a restrained lavender-gray surround and a white document surface. Give it a compact, coherent command header, not several heavy nested panel headers.

The preview is generated clinical text. Do not add decorative PDF zoom/page controls, page counts for an unpaginated note, or an AVS/Note switch that does not correspond to a real existing renderer. Keep the actual AVS print path and its approved print styling separate.

The document header should name the document, identify the patient and DOB, and explain its local/read-only state. Consolidate redundant decorative “Local” badges, but keep the material boundary: copying does not file a note in Tebra, and local signing is not external filing or proof of administration.

### Readiness block — explicitly included

Replace the saturated “Ready to sign” banner and permanently expanded completed checklist with a compact, restrained readiness summary in the viewer chrome.

When the actual record action is ready, show the accurate scoped verdict, a meaningful count if useful, a small completion icon and a “View checks” disclosure. Preserve any remaining advisory warning visibly; do not equate a permitted warning with incomplete earlier documentation. Completed details can be collapsed initially. If the user has expanded them, do not collapse them unexpectedly when state changes.

When incomplete, show neutral incomplete wording and the outstanding requirements. When a warning or stop exists, show its actionable details without requiring expansion. Do not hide blockers behind a reassuring summary or collapse a focused item during a transition.

Use the unified derived progress/status model from workstream E, the authoritative evaluation/lifecycle/capability inputs and established vocabulary. Do not use `summarizeReadinessVerdict` alone as a synonym for actual sign permission or step completion. Any adapted vocabulary must state its exact scope. Counts never bypass signing requirements. Check navigation uses verified semantic targets and the reveal-and-focus contract, not guessed links or global first-match selectors.

An ordinary all-complete summary should start around 40–48px high instead of consuming a large part of the pane. Warnings, expanded checks, and long messages can grow.

### Readable note body and actions

Keep document section headings, destination labels when distinct, Copy note, Copy section, and Source navigation purposeful and aligned. One whole-note action and distinct section actions are legitimate; duplicate buttons dispatching the same command in the same toolbar are not.

Remove default code-editor-looking line-number decoration from the visible composition unless a demonstrated workflow depends on it. Preserve content line structure and semantic segmentation; do not delete utilities that still support exact copying or documented functions.

Render the body with readable spacing, approximately 13–14px at normal desktop scale. Preserve significant whitespace, line breaks, and structured content. Long text must wrap, not clip. Clipboard output comes from the canonical section strings, not scraped/styled DOM; copied bytes and section separators must remain unchanged.

Keep copy failure, unsafe-copy withholding, saving, and save-failure states explicit. A successful clipboard action must not produce a “filed” state. Retain the existing notification architecture; do not create another toast sink.

### Responsive and scroll behavior

Use a split view only when both form and note remain comfortably usable. Starting minimums to evaluate are approximately 580–620px for the form and 460–500px for the note, plus actual gutters. Decide based on available container width, not an arbitrary device label.

At narrower widths, Details and Preview should switch between full-width surfaces without losing values, resetting workflow state, or exposing a hidden interactive editor. Remember the relevant scroll position where feasible; do not remount the clinical editor simply to restyle the preview.

Allow one intentional scroll container per active pane. Do not create nested scrollbars on each note section or leave an invisible grid row beneath the preview. A sticky toolbar must not obscure focused content or the final note lines.

### Acceptance

Run the refreshed inspector with Injection, UDS, Samples, and Forms; empty, partial, complete, warning, stop, signed, copy-blocked, storage-failed, and long-document cases. Compare exact copied strings before and after.

At both desktop and 800×600, the preview fills its available workspace and the end of the document is reachable. The completed readiness summary no longer dominates the document. The printed integrated AVS remains unchanged for identical inputs.

---

## 8. Workstream E — trustworthy focused-injection behavior

### 8.1 Preserve the design; repair what the design is communicating

The user explicitly likes the focused injection layout. Keep its recognizable patient summary, journey rail, generous guided targets, restrained surfaces and focused working area. Do not replace it with a generic wizard, a second form implementation or seven separately mounted clinical editors. The existing seven navigation steps share four underlying worksheet tabs; preserve the single encounter/editor and make that mapping reliable.

The audit found a semantic mismatch: the conservative final-document checklist is also being used as live step progress. `projectClinicalReadiness` leaves otherwise clean stages pending until the entire evaluation is ready; `InjectionStepper` translates that pending state as “Not started.” A missing response can therefore make valid identity work appear unfinished. Broad stage mappings also put response issues under Site/Administer rather than Response. These are behavior changes to make deliberately, not CSS corrections.

### 8.2 One derived presentation model, with separate meanings

Introduce a tested, pure injection-progress/status projection, preferably in the application projection layer. Proposed location: `src/application/injection-workflow-progress.ts` (a proposed new file, not an existing one). Derive it from the current encounter, authoritative requirement/evaluation output, existing review fingerprints, record lifecycle and real command/storage capabilities. Do not add a second editable clinical store, persist decorative completion flags, derive facts from the DOM, or duplicate clinical medication rules.

Keep these dimensions separate:

| Dimension | Meaning and authority |
|---|---|
| Current location | Which focused step staff are viewing. Navigation alone never completes it. |
| Step documentation progress | Whether this step's applicable required facts and existing confirmations are present, valid and current. |
| Clinical concerns | Existing evaluator warnings/stops; severity and review requirements remain unchanged. |
| Signing capability | The existing disposition-aware sign action and all its persistence/attestation protections. |
| Record persistence/lifecycle | Unsaved, saving, saved locally, failed, signed locally or supported saved handoff, using actual outcomes. |
| Output/handoff | Clipboard and print-request outcomes; neither proves Tebra filing or successful physical printing. |

A suitable step representation has separate `applicability`, `completion`, `concerns`, and `current` properties. Exact type names are implementation choices. Suggested completion values: not-started, in-progress, complete, review-again. A warning can coexist with completed documentation without being erased; a step can be current and complete. “Ready to sign” is an action/lifecycle summary, not another step-completion algorithm.

**Positive evidence is required.** Absence of an error is not enough to declare completion. Reuse required-field applicability and existing explicit attestations. A carried name or staff default is not an identity check or an administration attestation. A legitimate optional blank never blocks progress. Keep untouched work neutral rather than painting the whole journey as a clinical emergency.

If the current evaluator contract does not expose enough requirement facts, narrowly extract shared pure predicates with output-parity tests. Do not copy them into JSX or invent additional clinical requirements. Such a fact-preserving extraction must be separately reviewable; the medication/timing rules and final authorization gates must remain equivalent.

### 8.3 Stable step ownership, not broad readiness suffixes

| Focused step | Primary ownership | Exclusions / dependencies |
|---|---|---|
| Identify | Current patient identity and existing identity-confirmation requirements | A missing ordering provider must not invalidate patient identification. |
| Verify order | Ordering provider, ordered medication/dose/route/cadence, timing and existing order-review requirements | Timing remains a cadence conclusion, not clearance to administer. |
| Prepare | Product/trace facts and preparation verifications that actually belong to this step | Do not mark complete from lot/NDC alone if applicable preparation confirmation is missing. |
| Site | Applicable site, laterality, route/site compatibility and relevant equipment facts | A missing post-injection response must not be reported as a Site error. |
| Administer | Existing administration attribution/time/check requirements, with explicit actual-event meaning | Do not imply the injection was given because this step was visited or a field was prefilled. |
| Response | Response, applicable exception/follow-up details, and outcome documentation | Route response omissions here. Conditional handoff requirements remain explicit. |
| Sign / finish | Review of the completed documentation and the existing allowed record action | A nav click opens review; it does not sign. Terminal label adapts to the supported non-administration outcome. |

Use stable typed issue/requirement keys and field targets. One issue has a primary correction destination; it may affect dependent steps but must not be counted repeatedly as unrelated problems. Unknown issue codes remain visible in a general review area. A stop with an unfamiliar named section must still precede a known warning in correction guidance; the audit reproduced the current contrary fallback ordering. Preserve all actual sign gates while correcting that routing priority. Do not drop unfamiliar issues because a mapping is incomplete.

These are ownership requirements, not a mandate to move every field to a different page. Preserve the useful physical layout and map each step to the actual field group that contains its work. List any necessary field relocation separately.

### 8.4 Progress and action-language contract

Show the current step independently of completion. If displaying “Step 3 of 7,” it is location, not 43% done. Prefer meaningful state labels over percentages. If a completion count is retained, name its scope and exclude non-applicable work; do not place an unexplained six-check denominator beside a seven-step progress denominator.

Use one journey rail and one short actionable “What remains” summary. The full checklist remains available through View checks, but do not permanently repeat six expanded rows underneath seven step statuses. Keep real warnings/stops visible and navigable; completed details may be folded away.

All status consumers—focused rail, care checklist, note preview, action dock and completion surface—read the same derived model for the same encounter revision. They need not display identical text, but must not contradict one another. Specifically:

- Valid earlier steps stay complete when a later unrelated field is missing.
- A warning-only record the existing engine permits signing must not simultaneously say its valid earlier steps were never started. Keep the warning visible, with wording that accurately distinguishes it from a missing required review.
- If clinical documentation is complete but signing is unavailable due to storage or attestation capability, state that reason. Never show an unexplained disabled Sign button beside an unqualified “Ready to sign.”
- After a successful durable signature, show Signed locally and make the editable-readiness prompt historical or remove it. Do not keep asking staff to sign an already signed encounter.
- A pending save must not become Saved locally until the correct record revision is actually retained.

“Reviewed,” “Documented,” “Ready,” “Signed,” and “Saved” must each have a named data predicate. Avoid catch-all “Complete.” The status model is documentation assistance, not clinical clearance.

### 8.5 Deterministic navigation and focus

Keep the existing rail as the main navigation. Any Back / Continue control uses the same navigation owner and has an explicit destination; do not introduce a competing next-step system. Step selection and Continue navigate only. Required signing protections remain on the actual record action, not accidental navigation locks.

Switch the existing tab when needed, open the necessary disclosure, wait for the intended target to mount, then focus a field or heading within the active editor. Scope lookup to that editor, not global first-match selectors or hidden compatibility mirrors. If the target is disabled, absent or not applicable, focus the relevant visible heading/status and explain the next available action. Sign-step navigation must not attempt to focus only an unavailable disabled button.

Do not auto-advance on typing, on a calculated field settling, or when the last checkbox is selected. Do not move focus just because progress recomputes. Preserve native Enter/Space/arrow behavior inside fields and menus. Issue links must reveal their hidden field before focusing it.

Entering/exiting focused view preserves encounter data and the relevant location. Resume a valid same-record position or select the first unresolved applicable step once on entry; do not repeatedly reset it after each render. Transient location/disclosure state must not carry between different patients. Preserve existing privacy/idle-lock policy; display its consequences honestly without relaxing it.

### 8.6 Dependency-aware review invalidation

Preserve the existing clinical review fingerprint and the deliberate clearing of stale review/disposition when material facts change. Make the consequence visible and specific: for example, “Site changed — review administration again.” Affected steps move to Review again; unaffected identity/product facts do not reset to Not started.

Extend explanatory feedback beyond medication and dose changes to other material review invalidations. A presentation-only collapse/expand, density change, viewer switch or workflow-mode change does not mutate the encounter, mark it dirty, create a revision or invalidate review. Appointment-only edits retain the current exemption from clinical review invalidation, while still being saved as handout metadata through the existing path.

A cancelled review dialog is not an acknowledgement. Preserve the existing once-per-timing-fingerprint late-dose prompt at the Review boundary; do not reintroduce prompts mid-typing or reopen the same modal every render. Dismissing the prompt leaves the unresolved issue visible with a clear route back. Changed material timing facts can require a new review under the existing rules.

### 8.7 Patient ownership and alternate identity transitions — release blocker

The audit found that typed identity edits call `patchPatient`, which clears the appointment reminder, while Use selected local patient calls the generic `patch({patient: ...})` path. The latter does not apply that same clearing rule. This is a source-confirmed alternate-path gap; a browser-level carryover has not been claimed or reproduced in this audit.

Use one explicit identity-transition policy for typing, selected-patient restoration, record opening/hydration and next-patient transitions. Distinguish same-record recovery from genuinely changing the encounter identity. Preserve a saved reminder for the correct same record; clear/reinitialize patient-specific reminder metadata when the identity actually changes. Do not infer identity equivalence from a name alone. Do not broadly erase unrelated saved records.

Test the alternate restore path with a typed appointment and a different selected patient, then inspect the visible fields, canonical encounter, persisted snapshot, preview and AVS. Include identical surnames/different DOBs, restored older records and next-patient use. This must pass before the new behavior work is considered release-ready.

### 8.8 Non-administration and terminal paths

For held, escalated or provider-plan outcomes, administration-only work is Not needed—not “done” and not an unfinished requirement. The progress model and visible checklist must agree on applicability.

Use the existing disposition-aware handoff/save path; do not enable the administered-injection signing action for a `handoff-ready` record. If the existing repository supports only saving that handoff rather than a separately finalized outcome, show the honest state “Handoff saved locally” with the existing follow-up context; do not invent a completed administration or a new lock schema.

Switching back to an administration path recomputes its requirements without treating old skipped work as completed. Preserve the clinician's recorded reason and follow-up according to the existing transition rules, with deliberate confirmation before destructive removal.

After successful signing, maintain one completion surface and an inert, inaccessible retained editor. Confirm correct patient identity on the outcome. Print handout, Copy note and Next patient remain separate actions. A print-dialog cancellation is not a successful print; copying is not filing. Next patient dispatches once, creates a clean encounter and resets patient-specific transient UI without altering signed historical records. Failed save/sign keeps the draft recoverable and offers a truthful retry path.

### 8.9 Behavior acceptance

Reproduce the audit examples in targeted tests before replacing the relevant projection. Then assert the intended results in production regression tests; do not keep tests whose purpose is to approve the old incorrect labels. Cover both directions of every dependency change and all four non-administration/administration paths. The accompanying QA matrix is required, not optional visual-polish work.

---

## 9. Workstream F — progressive disclosure without lost meaning

### 9.1 Three levels of information

**Always visible:** active patient identity/DOB and applicable safety context, the current step, the next relevant action, unresolved actionable concerns, meaningful storage failures, and the core fields for the selected step.

**Contextually revealed:** product-specific preparation, required follow-up for a selected exception, handoff/hold details, nonroutine timing review, and any currently invalid or required dependent fields. “Optional in the routine case” does not mean optional after the triggering condition is selected.

**Collapsed but discoverable:** unused optional vitals, supplementary response detail, additional note statements, handout-appointment editing, full completed checklists, provenance detail, alternate output tools and infrequent record utilities. Give each a named disclosure, not an undifferentiated pile under More.

### 9.2 Component visibility contract

| Area | Routine/default presentation | Populated, invalid or exceptional state |
|---|---|---|
| Vitals | Quiet Add vitals (optional) row | Compact summary of values; edit/reveal control. Invalid required values have a visible issue and reachable fields. |
| Additional note items | Collapsed Additional documentation (optional) | Summary such as “2 statements selected”; never auto-select clinical statements. Opening/closing is cosmetic. |
| Response detail | Primary response remains visible; optional refinement one disclosure away | Show selected detail in summary; Custom or a required explanation opens the actual fields. |
| Administration exception | A clear clinical choice separate from Expand / Collapse | Explicit exception remains recorded when collapsed; missing details are labeled Needs details, not Documented. Required concern summary remains visible. |
| Waste / product issue | Small direct clinical choice in the product/administration context | Only relevant dependent fields expand. Entered or unresolved content cannot disappear without a summary. Medication source remains visible when required. |
| Acute safety concerns | Existing safety screening remains visible | Preserve the current rule that selected concerns stay exposed. Never bury an actual trigger or required action under optional tools. |
| Appointment on AVS | One row: Provider appointment — space to write in / entered time / omitted | Edit on demand; default blank writing space is not incomplete. Partial typed data has a clear remaining handwriting summary. Existing print layout is unchanged. |
| Provenance / overrides | Quiet source indication; detailed attribution in a named control | Active override or changed data remains visibly identified; its review requirements cannot be hidden as cosmetic detail. |
| Completed checks | Small truthful summary with View checks | Outstanding requirements visible and linked to the correct field; real warnings/stops remain exposed. |
| Print / secondary output | Primary task action visible; alternate formats/language tools in a labeled group | Capabilities and failure reasons clear; no pretend successful output state. |
| Discard / start another record | Existing clearly named secondary action group | Confirmation and unsaved-work guard retained. Do not mix destructive and harmless actions without distinction. |

Avoid mandatory acknowledgement of every optional section. A routine encounter should be completable without opening unused vitals, extra note statements, appointment editing or advanced output tools. This is a usability requirement, not permission to bypass evaluator-required clinical work.

### 9.3 Show/hide is not clinical data — release blocker

`TransactionLine` currently uses the same administration-exception flag for open/closed and documented/not-recorded. Separate local UI expansion from the canonical clinical selection. Expanding to read an option must never record that it occurred. Collapsing must never turn it off, erase information, invalidate review or modify the generated note.

Provide an explicit clinical selection when staff really record an exception. “Remove exception” or equivalent is a separate deliberate data action, with confirmation when it would suppress or discard populated clinical content. Preserve signed records. Determine Documented from complete required evidence, not an opened section or a truthy checkbox alone.

Audit every `TransactionLine`, `details`, accordion and More control for the same conflation. The generic component's API should make the separation explicit (`open`, `onOpenChange`, and a derived content/status summary are presentation; clinical mutations belong to separately labeled inputs). Reuse one disclosure primitive and existing dismissal infrastructure where appropriate.

### 9.4 Calm disclosure behavior

A collapsed row should communicate its title, whether it is optional, and a concise value or state summary. Examples: “Vitals · 2 values entered,” “Additional documentation · 2 selected,” “Provider appointment · Nov 3, 10:30 AM,” or “Exception details · Needs information.” These are proposed strings; the actual summary derives from entered data and selected mode, not guesses.

Use the existing typography, a small chevron, quiet separator and restrained hover/focus surface. No large outlined “optional” cards, stacks of saturated status strips, hover-only essential content, or tiny ambiguous ellipsis buttons.

Honor explicit expansion while staff are editing. Do not close a section while focus is inside it. Do not expand every optional panel on every re-render. Reveal newly required fields at a deliberate user transition; show urgent concerns immediately without gratuitous focus theft. Keep an issue summary visible if details are collapsed, and reveal them on issue navigation. Do not nest disclosures more than one level within the current task without a demonstrated need.

Keep expansion state per encounter and per view; it is not a clinical fact. When an optional section is collapsed with data, the data remains in the canonical encounter and its summary makes that clear. When an outcome no longer uses that data, follow an explicit documented retention/removal policy rather than silently submitting hidden obsolete values.

### 9.5 Accessible and non-repetitive feedback

Disclosure buttons support keyboard operation and accurate `aria-expanded`/controlled-content relationships. Apply the W3C disclosure pattern rather than making a clickable label act like an invisible data-entry checkbox.

Use one owner for ordinary status announcements. Emit concise meaningful updates such as “Response needs details” or “Draft saved locally,” not a recitation of every complete item per keystroke. Critical alerts retain their appropriate severity. Avoid having the stepper, checklist, note pane and toast all announce the same event. Do not erase the existing distinctions between saving failure, clinical stop and optional incomplete data.

### 9.6 Usability acceptance

Test routine and complex paths with synthetic records. Record required interactions, opened optional sections, backtracking, failed field navigation, status contradictions and scrolling. The routine path should need no additional clicks for core required work compared with the baseline; optional features should remain findable through one clearly named disclosure in their relevant step.

A staff walkthrough should answer without coaching: Which patient am I documenting? What have I actually finished? What needs attention next? Is it saved, signed locally, or merely ready? Where can I add optional details? What will happen if I close this section? Observe these tasks rather than asking only whether the page looks nice. Live clinic acceptance and physical printing remain separate from engineering test results.

---

## 10. Source ownership and surgical removal plan

| Surface | Existing implementation targets | Intended visual owner |
|---|---|---|
| Masthead and context | `shell/AppHeader.tsx`, `shell/SectionRail.tsx`, `shell/PatientSearch.tsx`, `ClinicalDesktopShell.tsx`, `lightfully/ServiceWorkspace.tsx` | Existing `lightfully/shell-layout.css` |
| Worklist | `StartCenter.tsx`; existing worklist display projections | Existing shell-layout worklist rules |
| Timing review | `workflows/ScheduleRegister.tsx`, its InjectionPanel integrations | One scoped timing-review stylesheet or an explicitly owned section—not competing copies |
| Readiness and note preview | `NoteInspector.tsx`, `ClinicalDesktopShell.tsx` preview wrapper | One scoped screen document-preview stylesheet or explicitly owned section |
| Field geometry | `lightfully/controls.css` and existing workflow-layout consumers | Existing density tokens; no competing control rules |
| Focused progress/status | `kiosk/InjectionStepper.tsx`, `CareChecklistRail.tsx`, `KioskShell.tsx`; main readiness/capability boundary; proposed pure injection-progress projection | One derived presentation model; evaluator and command gates remain authoritative |
| Disclosure/data separation | `workflows/ClinicalRegister.tsx`, InjectionPanel conditional/optional groups | Local show/hide state separated from explicit clinical inputs |
| Identity transitions | InjectionPanel `patchPatient`, selected-patient restoration, hydration and next-patient paths | One explicit encounter-identity ownership policy, not ad hoc patch calls |
| Lifecycle/navigation/commands | `ClinicalDesktopShell.tsx`, `main.tsx`, existing save/sign/dismissal owners and verified field targets | Retain command authority; reconcile display and deterministic reveal/focus |

New small stylesheets are allowed only when they take clear ownership from old rules. They are not permission to add `premium-final-v2.css` at the end of the cascade.

Before editing, inventory affected selectors across `workflows/workflow-panels.css`, `tebra-workstation.css`, `tebra-screen-contract.css`, and the existing Lightfully layers. Record the current winning declarations and all consumers. Remove superseded screen rules when their replacement is verified; retain genuinely shared print/adapter dependencies.

Maintain one mounted visible editor, one dispatcher per workstation command, one open-surface dismissal owner, and one visible notification sink. Check setup/cleanup across repeated opening, closing, mode changes, and navigation. Do not indiscriminately delete storage listeners, date-commit lifecycle handlers, idle-lock handlers, or observers with different responsibilities.

No GitHub Actions changes, temporary patch-applying workflows, CI write permissions, branch-protection changes, new self-modifying test machinery, or infrastructure cleanup in this PR. Do not delete unrelated preview environments.

---

## 11. Required review sequence

### Gate 0 — behavior and data-ownership prerequisites

Reproduce F01–F06 in the companion audit and instrument the selected-patient restore and exception controls through their actual event paths. Correct disclosure/data coupling and the alternate identity reset before accepting the new UI. These source-confirmed risks remain release blockers until real-browser regression proves the fix. Do not hide them behind visual snapshot updates.

Define step applicability, positive completion evidence, dependency invalidation, sign capability and lifecycle before redesigning progress badges. Add pure projection tests and integration assertions for every current-state contradiction. Keep changes in reviewable source/test commits; no new Actions transport or workflow modifications.

### Gate 1 — establish the real baseline

Check current main and open work before making changes. Capture deterministic synthetic reference states using the repository’s locked browser/dependencies: populated worklist, active upper shell, ordinary timing, warning timing, ready preview, blocked preview, and long signed note. Record the commit, OS/browser, viewport, density, and fixture.

Use the user’s timing/readiness screenshots as problem references and earlier approved roomier screenshots as visual-direction references. Do not restore old source wholesale to recover its appearance.

### Gate 2 — implement representative compositions first

Produce real browser captures of the new shell/worklist, ordinary and warning timing modules, and ready and blocked previews. Include the existing focused layout with corrected incremental progress and optional sections in empty, populated and needs-details states. Compare against the baseline at matching sizes. Confirm that the focused design remains recognizable before propagating the treatment.

Mockups can guide work but cannot serve as implemented-screen evidence. Do not update snapshot references before inspecting actual images.

### Gate 3 — propagate without regressions

Extend the verified treatment to all service consumers, small widths, long content, overlays, and failed/pending states. Remove obsolete selectors and unused imports in small, reviewable changes. Add ownership, behavior, geometry, and exact-copy assertions with each component change.

### Gate 4 — inspect, freeze, verify

After visual review, commit only the intentional reference changes. Keep unrelated references, contrast thresholds, clinical/document fixtures, and screenshot tolerances unchanged. Preserve the existing worklist fingerprint check unless an explicitly inspected design change requires its new reference; do not replace the visual test infrastructure casually.

Run the complete read-only suite on the exact final commit with retries disabled, including the accompanying behavior/disclosure QA matrix. A reference-generation run, a green earlier commit, a characterization suite that approves current defects or a merely successful build does not certify the final head. Reconcile test failures rather than bypassing them.

---

## 12. Acceptance test matrix

The separate `MA_Workstation_PR70_Behavior_QA_Matrix.md` is part of this specification. It adds state-transition, command, patient-ownership and disclosure cases to the retained visual tests below. Every case is a required future test or clinic acceptance task; none is represented as already browser-verified by this audit.

### Behavior-first invariants

A UI-only expansion changes zero clinical data. A navigation click changes location, not completion or administration. A missing response routes to Response without undoing valid Identify work. Permitted warnings stay visible without creating contradictory sign status. A changed material fact reopens only the dependent review display while preserving existing clinical invalidation rules. The selected-patient restore path cannot retain another patient's appointment metadata. Signed and saved-handoff outcomes use their true lifecycle and do not keep an actionable Ready to sign prompt.

### Viewports and preferences

Capture 1440×900, 1366×768, 1024×768, and 800×600. Verify Compact and Comfortable; verify the guided injection view separately. Check long content, 200% text enlargement, browser zoom, reduced motion, and forced colors.

Do not call an unsupported-viewport gate a successful accessibility test. Document existing viewport-policy limitations separately; do not claim complete WCAG conformance from this screen pass or silently change clinical viewport policy.

### Interaction and safety

Test at least 20 open/close/navigation cycles for affected menus and overlays; confirm listener cleanup returns to baseline and a shortcut executes once. Verify Escape precedence, focus return, no duplicate visible IDs, and no focusable concealed editor.

Test unsaved navigation, patient browsing mismatch, date entry immediately followed by save, draft recovery, storage failure, copy withholding, and signed-record immutability. Reconfirm appointment metadata does not transfer between patients or silently move the injection due date.

### Timing states

Include missing prior date, not evaluated, on schedule, early, overdue, impossible date, incomplete override provenance, valid override, reset to calculation, one-time/no-return, non-administration, weekend, initiation, and long product-specific guidance.

Assert evaluator output parity and the distinction between current-visit window and next due date, not just the presence of the panel title.

### Preview and print

Cover all four document services. Verify exact whole-note/section copying, source navigation, complete/incomplete/warning/stop summaries, copying failure, saving failure, long wrapped lines, and stable scrolling.

Re-run existing integrated appointment AVS variants and warning-heavy print cases without redesigning them. Screen-only CSS must not alter printed clinical text, handwriting geometry, pagination, or which document prints.

### Accessibility thresholds

Check normal text against the WCAG AA 4.5:1 contrast threshold and large text against 3:1 where applicable. Check required UI boundary/state visuals at 3:1 against adjacent colors. Keep project keyboard focus fully visible where possible—stronger than merely avoiding complete obscuration.

Retain comfortably operable compact controls, at least 24×24px standalone targets as a project baseline, and the existing 44px guided targets. Avoid overlapping “invisible” hit areas. Native/inline exceptions do not justify cramped custom control groups. Test 200% text resizing without losing content or functions; report existing limitations honestly.

### Density and usability measurements

Measure required clicks/keystrokes, optional sections opened, backtracking, failed correction routes, status contradictions and time to locate a requested optional feature. Target zero added mandatory steps for unused optional content and one named disclosure to reach a relevant optional group. These are acceptance targets, not claimed measured gains.

For each reference fixture record: fixed upper-shell height, visible editor/preview height, scrollHeight/clientHeight of the intended scroll region, ordinary worklist rows visible, timing-module height, and readiness-summary height.

The routine form must retain its compact-entry advantage. Extra outer breathing room should be paid for by eliminating duplicate captions, colored strips, and empty wrappers—not by increasing field/label density or adding steps. Compare like-for-like data, open state, and warnings; do not game measurements by hiding useful content.

---

## 13. Proposed commit boundaries

1. Baseline fixtures, characterization evidence, selector/event ownership inventory and progress-state contract.
2. Explicit source/test corrections for exception disclosure and alternate patient-identity reset; validate actual event paths.
3. Pure step-progress projection and shared status/capability/lifecycle integration, with positive-evidence and warning-state tests.
4. Focused navigation, dependency explanation, terminal behavior and safe optional disclosures, preserving focused-view design.
5. Upper shell and worklist composition, with native-table and command regression tests.
6. Timing-review and full preview composition using the corrected shared behavior model.
7. Remove superseded code; inspect transition/deep states and responsive behavior; intentionally update verified visual references.
8. Exact-head full verification, usability evidence, remaining-work reconciliation and review-ready PR description.

Do not mix unrelated dependency/security upgrades or new clinical rules into these commits. If a shared requirement predicate must be mechanically extracted, isolate it with clinical-output parity tests. Necessary behavioral corrections are first-class commits, not changes disguised as CSS cleanup.

---

## 14. Required handoff and definition of done

The PR must contain a short design rationale, a behavior/issue ownership map, a surface-by-surface deletion summary, representative before/after images, a state-transition/viewport evidence set, measured density and task-friction comparisons, exact final test results with provenance and a truthful remaining-work list. Link each F01–F10 finding to the implementation and test that resolves it, or explicitly retain it as open.

Suggested evidence names include `worklist-populated-1366.png`, `shell-active-1440.png`, `timing-on-schedule-1366.png`, `timing-overdue-800.png`, `preview-ready-1440.png`, `preview-blocked-800.png`, and `preview-long-signed-1024.png`. These are proposed names, not files already generated.

The work is complete only when the four required visual surfaces are materially improved, the focused design is preserved, step progress and signing/lifecycle states agree, show/hide actions cannot mutate clinical data, all identity paths retain patient isolation, optional content is discoverable without hiding necessary work, compact entry remains useful, exact note/print behavior survives, and both real-browser visual review and exact-head full automated checks pass. The two P0 ownership/separation findings cannot remain deferred while calling this version release-ready.

Do not describe a branch as merged or a merge as deployed. Any later merge follows review and authorization; production success requires separate deployment verification. Preparing this brief authorizes no repository writes by itself.

### Deferred rather than silently unfinished

This PR does not include a permanent Saved Records workspace replacing F11, field-anchored F9 lookups, post-sign appointment revision history, automatic Tebra scheduling, generalized date/provider normalization, Forms authoring, or TMS enablement. Track those separately rather than expanding this pass until it loses its focus.

**Final design and behavior test:** restore the better Lightfully feeling without restoring wasted space; preserve the focused layout without preserving misleading progress. Staff should understand the patient, current task, remaining requirement and actual record state without interpreting conflicting badges or opening irrelevant controls.

---

## Source and standard references

Repository observations were checked through GitHub at the commit above, especially:

- `src/presentation/lightfully/controls.css`
- `src/presentation/lightfully/shell-layout.css`
- `src/presentation/shell/AppHeader.tsx`
- `src/presentation/shell/SectionRail.tsx`
- `src/presentation/StartCenter.tsx`
- `src/presentation/workflows/ScheduleRegister.tsx`
- `src/presentation/workflows/injection/InjectionPanel.tsx` (timing integration)
- `src/presentation/workflows/injection/timing-register.ts`
- `src/presentation/workflows/workflow-panels.css` (legacy schedule styling)
- `src/presentation/NoteInspector.tsx`

Accessibility references: W3C WCAG 2.2 Understanding documents for SC 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 1.4.4 Resize Text, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), and 2.5.5 Target Size (Enhanced). Use their full criteria and exceptions when evaluating conformance; the project may deliberately use stronger interaction targets.

Visual-test reference: Playwright documentation, “Visual comparisons.” Keep screenshot generation and comparison in the same pinned rendering environment. The numerical design dimensions in this brief are proposed product targets, not values prescribed by those standards.


### Behavioral sources added in v2

The companion audit records exact functions and source ranges. Principal additions to the source review: `src/application/readiness-projection.ts`; `src/main.tsx` presentationReadiness/canComplete; `kiosk/InjectionStepper.tsx`; `kiosk/KioskShell.tsx`; `kiosk/CareChecklistRail.tsx`; `kiosk/SignAndNextCard.tsx`; InjectionPanel navigation, updateEncounter, patchPatient, selected-patient restoration, administrationExceptionEditor, vitals and additional-note-item groups; `workflows/ClinicalRegister.tsx`; and `src/domain/injection.ts` review-fingerprint logic.

W3C APG Disclosure (Show/Hide) Pattern specifies keyboard-operable visibility controls and expanded state. W3C WAI Multi-page Forms describes logical step structure and current/completed orientation. WCAG Understanding SC 4.1.3 explains programmatically available status feedback without unnecessary interruption. These supplement the original visual/accessibility references; they do not prescribe clinical eligibility.
