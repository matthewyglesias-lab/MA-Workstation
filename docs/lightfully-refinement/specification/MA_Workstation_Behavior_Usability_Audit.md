# MA Workstation — focused behavior and progressive-disclosure audit

**Baseline:** `matthewyglesias-lab/MA-Workstation` · main `30833af68337fa85334ccd7f49d04d65c8ffeac6`  
**Purpose:** supplement and revise the PR #70 implementation plan, not implement or deploy it.  
**Design instruction:** preserve the focused injection design the user likes. Correct the progress, status and interaction meaning beneath it.

## Executive finding

The largest issue is not spacing. The application reuses a conservative final-documentation checklist as a seven-step journey-progress model. That makes valid early work appear not started until the whole encounter is ready, and broad checklist categories assign some missing fields to the wrong step. Meanwhile, signing capability uses a more specific, disposition-aware rule. The resulting status messages can disagree even when each function is following its existing contract.

Optional-content handling also needs more than visual polish. One exception disclosure changes the clinical exception flag when expanded/collapsed; a separate patient-restore action does not use the appointment-reset guard used by typed identity edits. Those two paths should be corrected and browser-tested before this refinement is released.

The right implementation is to keep the focused layout, introduce a coherent derived progress/status contract, separate show/hide state from recorded facts, and make optional content summarize itself when collapsed. Do not replace the clinical engine or mark every error-free section complete.

## Method, evidence and limits

Current main was read through GitHub. The previous PR #70 brief was read in full. A recovered source archive and its locked dependency archive were used for local investigation; nine relevant production modules were independently Git-blob checked against current main. The archive is not a fresh complete main checkout, and later unrelated worklist/test differences remain outside this targeted test claim.

**Executed:** 94 targeted tests across five files: 84 existing tests and ten new audit-only characterization cases. All 94 passed, with zero failures and zero skips. The new cases assert the current behavior, including undesirable behavior, so their passing is evidence of reproducibility—not evidence that these defects are fixed. Several probes used constructed evaluations to isolate the mapping; the missing-response, warning-only, held and exception cases also exercised the actual InjectionEngine or its review fingerprint with synthetic encounters. A local build of the recovered source passed.

**Not executed:** a fresh end-to-end browser journey. Normal localhost navigation was attempted and returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The audit did not use another transport or bypass that restriction. No new browser screenshots, live clinic interactions, physical prints, patient-data mutations, repository commits, merges or deployments were made. Previously reported 332-browser-test results are historical and not results of this audit.

Evidence files in the companion bundle include the characterization test, observed-state JSON, final test-result JSON, readable test log, source-hash manifest and browser limitation log. No dependencies or font files are included.

Evidence grades used below: **R** = executed function-level reproduction; **S** = directly traced current source; **V** = an end-to-end behavior to validate in the implementation environment. P0 means a safety/ownership path that must be corrected and verified before release; it does not mean a production incident or patient harm has been observed. P1 is a core behavior correction; P2 is an important usability refinement.

## Findings

### F01 · P1 · R/S — final readiness is being presented as incremental progress

`projectClinicalReadiness` marks a stage complete only when the whole evaluation is `ready`. Otherwise, a stage without its own warning/stop remains `pending`. `InjectionStepper` labels that state “Not started.” An existing contract test deliberately preserves the conservative aggregate behavior. [S1, S2, S10]

In the actual-engine probe, the only missing item was `response.required`; nevertheless Identify, Verify order and Prepare all displayed Not started. A separate constructed before/after evaluation demonstrated that making only Response incomplete reverses previously complete unrelated stages.

**Required correction:** derive per-step progress from positive applicable required facts and current required confirmations. Keep final signing permission authoritative and separate. Do not weaken the conservative generic projection globally merely to create green checks. Add a shared requirement adapter if needed and prove evaluator parity.

### F02 · P1 · R/S — issue ownership does not match the visible steps

Identify consumes the combined patient/order stage, so a missing ordering provider also affects Identify. Site and Administer consume an Administration stage containing response issues. The visible Response step instead reads Disposition/follow-up. [S1, S2]

The actual-engine missing-response case produced Site = Needs information, Administer = Needs information, Response = Not started. This is not a useful correction route for staff. The mapping also gives Prepare only product-trace state, rather than an explicitly defined set of preparation facts. A further executed probe found that `firstActionableClinicalIssue` can prioritize a known timing warning over a stop whose section has an unfamiliar nonempty name. The stop is still present and signing remains gated; the defect is misleading correction priority, not demonstrated permission to bypass it.

**Required correction:** stable typed issue/field-to-step routing, with one primary correction destination and explicit dependency propagation. Required custom explanations and preparation confirmations must be assigned intentionally. Do not identify fields by label text or CSS row position.

### F03 · P1 · R/S — Sign Ready can coexist with apparently unstarted work

The main application correctly allows injection signing when the evaluator returns `recordStatus: ready-to-lock`, even if generic readiness is `review` because a warning remains. The focused rail uses that real capability for its Sign step but uses the conservative checklist for the earlier steps. [S2, S3]

A fully specified synthetic repeated-site encounter produced zero stops and `ready-to-lock`, with Sign = Ready and several earlier steps = Not started. The aggregate checklist reported a blocked tone because of those pending items. This does not prove signing is unsafe; it proves the interface is mixing different definitions of readiness.

There is also a source-visible reverse risk: actual signing requires attestation and persistence capabilities beyond clinical completeness. A clinical-only “Ready” message cannot explain those unavailable-command cases.

**Required correction:** one presentation model consumes clinical progress, existing review status, outcome, actual action capability and storage/lifecycle. Preserve warnings and review requirements. Show “Ready to sign · review note present” only when the actual gate allows it; otherwise display the genuine next requirement or capability failure.

### F04 · P0 · S/R/V — an exception disclosure is a clinical mutation

The administration-exception section passes `details.administrationException` as both its `open` and `documented` values. Its toggle flips that clinical flag. `TransactionLine` immediately displays Documented whenever the boolean is true. [S4, S5]

The actual fingerprint probe confirmed that toggling this flag changes reviewed clinical facts. Generic encounter updates clear disposition/review when material facts change. Enabling an empty exception also creates required exception-detail issues. Closing the same UI section can disable the exception flag while retaining the hidden detail strings. [S6, S9]

**Required correction:** explicit clinical choice plus independent expansion state. Opening/closing must not change the record, note, fingerprint, dirty state or saving behavior. Populated removal must be a separately named data action. Documented must depend on the required detail being complete, not whether a section was opened. The complete click/review/note sequence remains a browser test, not a claim made by this audit.

### F05 · P0 · S/V — the selected-patient restore path misses the reminder reset

Typed identity edits go through `patchPatient`, which resets appointment metadata when an identity field changes. Use selected local patient instead calls generic `patch({patient: ...})`. That updater does not apply the same appointment-reset guard. [S6, S7]

This is an alternate source path capable of preserving metadata when changing the encounter identity. It is not a demonstrated production disclosure or an observed browser-level cross-patient leak. The existing same-record persistence tests do not settle this alternate-action question.

**Required correction:** a shared identity-transition policy and an end-to-end regression for the actual restore control. Verify canonical state, saved snapshot, editor, preview and AVS—not just the patient banner. Preserve legitimate same-record reminder recovery and old-record behavior.

### F06 · P1 · R/S/V — signed and non-administered outcomes need coherent status

KioskShell passes lifecycle locking to the stepper and completion card, but the CareChecklistRail receives only readiness. A locked Sign step can therefore be Complete while the checklist still uses the same ready-to-sign aggregate copy. [S2, S8]

For an actual-engine held encounter with required handoff details, the evaluator returned `handoff-ready`. Prepare, Site and Administer became Not needed in the rail; the generic product-trace checklist remained pending and the Sign step remained Not started. The held path must not be forced through the administered-injection signing route.

**Required correction:** lifecycle-aware terminal display and applicability-aware progress. Show signed locally only after the existing durable lock succeeds. Show the truthful saved-handoff state available from the existing persistence path for held/escalated/provider-plan outcomes; never invent administration, clearance, or a new lock schema. Recompute correctly when outcome changes back.

### F07 · P1 · S/V — field navigation needs an explicit reveal-and-focus contract

Seven focused steps map onto four worksheet tabs. Current navigation uses a requested-step ref, tab synchronization and a global document selector in a requestAnimationFrame callback. Sign targets the finish control without a visible-heading fallback. Source-navigation links use another global field selector. [S11]

These patterns need stress testing for same-tab moves, a disabled target, hidden conditional fields, rapid mode changes and restored drafts. No new race or keyboard failure was browser-reproduced here. Existing code already handles a same-page requested-step edge case; that useful protection should not be removed blindly.

**Required correction:** one semantic navigation path scoped to the active editor. Reveal the section, then focus its valid target, or use an explanatory visible fallback. Do not focus hidden mirrors, auto-advance on input, mark a step complete from visitation, or sign merely by choosing the Sign navigation step.

### F08 · P1 · S/V — necessary invalidation is not consistently explained

The generic updater clears stale administration review on material fingerprint changes. Visible explanatory receipts are explicitly set in medication and dose change handlers, but the equivalent generic invalidation path does not provide the same explanation for every material change. [S6, S12]

**Required correction:** explain the affected dependency: “Timing changed — review administration again,” for example. Keep invalidation itself. Differentiate a factual prerequisite that remains complete from a later acknowledgement that must be renewed. Appointment-only metadata stays exempt. Exact duplicate/no-op edits must not generate unnecessary review changes.

### F09 · P2 · S/V — optional content is not consistently summarized or minimized

Vitals already have independent presentation state and reopen when a recovered record contains values—a good pattern. However, manually hiding them returns to a generic Show vitals (optional) control rather than a populated summary. Additional note items remain an expanded group of optional attestable statements and departure fields. Supplementary response detail also consumes space even when it is not needed. [S13]

**Required correction:** named, one-level disclosures with honest summaries. For example: Vitals · 2 values entered; Additional documentation · 2 selected; Provider appointment · space to write in. Do not label normal unused options Not recorded as though something is missing. Never automatically select clinical note statements.

Required core fields, active safety concerns, conditional exception requirements and storage trouble remain visible. The goal is removing irrelevant decisions, not concealing responsibilities.

### F10 · P2 · S/V — repeated status surfaces need coordinated scope

KioskShell presents a stepper and a full CareChecklistRail; the worksheet and preview have their own status treatments. Those surfaces reuse broad categories but not always the same capability/lifecycle inputs. [S2, S8]

Do not claim that a visible four-page counter conflicts with seven steps: the kiosk transaction readout is hidden by current kiosk CSS. The confirmed issue is duplicated progress/checklist presentation and inconsistent meanings, not that hidden counter.

**Required correction:** preserve the rail design, use a short actionable remaining-work area, and put completed details behind View checks. One ordinary live-region owner announces meaningful changes; true safety alerts remain prominent. Avoid making the screen reader hear the same message from four components.

## What should stay intact

Retain the focused layout and 44px targets; the single mounted encounter editor; guarded navigation; explicit clinical confirmations; unknown-allergy handling; direct current-field publication before save; and inert retained editor after signing. Keep appointment-only edits outside the administration-review fingerprint.

The current late-dose prompt is already deferred to Review and tracked per timing fingerprint. Preserve that behavior, including the distinction between cancelling a dialog and recording a valid review. Do not describe it as a newly discovered mid-typing popup defect.

The integrated appointment AVS design is not reopened. Its underlying identity/ownership paths do need the additional protection above. Likewise, no automatic scheduling, Tebra synchronization, guessed arrival time, or post-sign electronic handout revision is introduced.

## Revised implementation order

1. Reproduce current status mapping and disclosure/identity paths with explicit baseline assertions.
2. Correct the two P0 separation/ownership paths, keeping changes isolated and inspectable.
3. Introduce step-owned progress and reconcile it with real signing/lifecycle capability.
4. Make issue navigation, review invalidation, optional disclosure and terminal paths reliable.
5. Apply the four existing PR #70 visual workstreams using the corrected behavior model; preserve focused-view design.
6. Run transition-focused, browser, accessibility, exact-copy and print regression; inspect actual images and measure task friction before updating references.

This is now one coordinated plan, not a behavior appendix to be considered after the visual pass.

## Source catalog

All repository pointers refer to the baseline commit above. Line ranges describe the source file, not transcript citation line numbers.

| ID | Source and relevant location |
|---|---|
| S1 | `src/application/readiness-projection.ts`: STAGES; projectClinicalReadiness; summarizeReadinessVerdict |
| S2 | `src/presentation/kiosk/InjectionStepper.tsx`: READINESS_SUFFIXES; aggregateReadiness; projectInjectionKioskSteps; labels |
| S3 | `src/main.tsx` lines 197–232 and 1770–1815: presentationReadiness and actual canComplete inputs |
| S4 | `src/presentation/workflows/injection/InjectionPanel.tsx` lines 2350–2391: administrationExceptionEditor |
| S5 | `src/presentation/workflows/ClinicalRegister.tsx` lines 74–99: TransactionLine |
| S6 | `src/presentation/workflows/injection/InjectionPanel.tsx` lines 1461–1574: updateEncounter, patch, patchPatient |
| S7 | `src/presentation/workflows/injection/InjectionPanel.tsx` lines 2456–2467: Use selected local patient |
| S8 | `src/presentation/kiosk/KioskShell.tsx`, `CareChecklistRail.tsx`, `SignAndNextCard.tsx` |
| S9 | `src/domain/injection.ts` lines 958–1011: review fingerprint and current-review test |
| S10 | `tests/unit/ehr-refinement-contracts.test.ts`: conservative typed-readiness contract; `tests/unit/injection-kiosk-stepper.test.ts` |
| S11 | `src/presentation/workflows/injection/InjectionPanel.tsx` lines 1291–1352: focused-step/tab/source navigation |
| S12 | Same InjectionPanel, medication/dose handlers around 1594/1636; generic invalidation in S6 |
| S13 | Same InjectionPanel, vitals/safety around 3712–3840; response/additional-note items around 3890–4018 |

Accessibility references consulted: W3C APG Disclosure (Show/Hide) Pattern; W3C WAI Forms Tutorial, Multi-page Forms; WCAG 2.2 Understanding SC 4.1.3 Status Messages. These support keyboard-expansion semantics, recognizable logical progress, and useful announcements without unnecessary interruption. They do not prescribe the clinical logic or this project's exact visual measurements.
