# Consolidated implementation acceptance

Authority: the supplied [v2 master plan](specification/MA_Workstation_PR70_Master_Plan_v2.md),
[audit](specification/MA_Workstation_Behavior_Usability_Audit.md) and
[48-family matrix](specification/MA_Workstation_PR70_Behavior_QA_Matrix.md).
Baseline: `30833af68337fa85334ccd7f49d04d65c8ffeac6`. Implementation and failed/checkpoint
results are recorded in [PROGRESS.md](PROGRESS.md). This document maps the final
engineering requirements to executable evidence; exact-final-commit results and
provenance are recorded in the actual PR after its verification run. Historical
characterization probes are baseline evidence only.

## Ownership and preserved boundaries

- `InjectionPanel.update` applies the single current-encounter identity transition
  for every typed or selected identity change. Only another patient's appointment
  metadata is cleared by that policy. Validated saved-record replacement remains
  with the record owner, preserving same-record recovery and historical absence.
  New/Open/Discard use the same synchronization boundary.
- `TransactionLine` owns independent disclosure visibility and semantic summary.
  Explicit clinical inputs own exception facts; populated removal is confirmed.
  Opening/closing has no clinical callback, dirty write or review invalidation.
- `projectInjectionWorkflowProgress` derives positive applicable requirements,
  documentation, concerns, actual command capability and durable lifecycle once.
  Rail, checklist, preview, summary and action presentation consume that revision.
  The only domain change exports the existing verification predicate unchanged.
- Navigation uses stable typed field/step routes, reveals dependent content and
  focuses the mounted visible control. Unknown/disabled targets have a visible
  Review fallback. Material review receipts follow the existing engine fingerprint.
- Completion follows durable local success. Next suppresses duplicate activation;
  copy feedback is record-scoped. No request claims external filing or printing.
- Local storage schema, authorization, clinical calculations, note grammar, legacy
  runtime, patient print templates/styles, integrated appointment AVS and history
  are preserved. Exact-hash guard remains narrow; no protected scope was removed.

## Finding closure map

| Finding | Implementation owner | Fix evidence |
| --- | --- | --- |
| F01 aggregate readiness as progress | injection-workflow-progress + shared summary/rail | P01–P08, Q01 |
| F02 wrong response/provider issue ownership | typed step/field maps and positive requirement projection | P02/P04/P05/P08, N01/N03 |
| F03 actual capability differs from checklist | real command capability and lifecycle inputs | S01–S04, Q01 |
| F04 disclosure records exception | TransactionLine independent visibility; explicit exception/removal | D01–D03/D05, Q02 |
| F05 alternate identity path borrows reminder | shared identity policy and main record synchronization | R01–R05/R07 |
| F06 signed/handoff scope missing | SignAndNextCard, inert retained editor, applicable handoff projection | S05–S08, R05 |
| F07 navigation/focus/dismissal weaknesses | shared reveal/focus route, MenuButton and existing command owner | N01–N08, Q05 |
| F08 unexplained review invalidation | exact materiality receipts; facts-keyed existing late timing prompt | P06, N07, Q02 |
| F09 optional work overload/findability | independent named populated disclosures and preserved required fields | D04–D08, Q07; Q08 clinic observation outstanding |
| F10 inconsistent cross-surface state | one shared status revision, concise announcement ownership | Q01/Q03, N08; Q03 manual AT outstanding |

## Acceptance traceability

Paths below are relative to the repository root. All browser tests use real
application UI events unless the row explicitly describes the unfamiliar future
issue probe. Core focused paths run at 1440×900 and 800×600; composition fixtures
also run at 1366×768 and 1024×768. Compact and Comfortable expanded/long cases are
parameterized in `lightfully-deep-evidence.spec.js`. No browser retries are allowed
for final verification. These are families, not inflated counts of requirements.

Unit owners: `tests/unit/injection-workflow-progress.test.ts` (progress),
`injection-identity-transition.test.ts` (identity), `injection-review-feedback.test.ts`
(receipts), existing domain/record/AVS/clinical-output suites. Browser filenames in
the table live in `tests/e2e/`.

| Family | Fixture, actual command and asserted result | Executable evidence |
| --- | --- | --- |
| P01 | Empty encounter/Preview: 0 of 6 recorded, no Documented step, neutral ordinary requirements; current location independent | progress units; injection-progress; workstation |
| P02 | Enter identity/select medication/provider: applicable identity acknowledgement remains required; missing order belongs to Verify order | progress units; injection-progress |
| P03 | Prefilled identity/structured initiation/default metadata: positive facts and exact verification predicate, no completion from location | progress units; existing injection/medication verification units; workstation |
| P04 | Real missing response only: earlier identity/product/site remain recorded; concern focuses response, native selection retains location | progress units; injection-refinement-acceptance |
| P05 | Lot/NDC with missing hygiene/preparation confirmation: Prepare incomplete; inapplicable confirmations excluded | progress units; workstation product-specific preparation journeys |
| P06 | Change provider/date/dose/route/site/response: unchanged identity remains recorded, affected review invalidates with specific receipt | progress/receipt units; injection-navigation-disclosures; workstation |
| P07 | Revisit recorded step and later unrecorded step: aria-current/focus changes only; native edits do not auto-advance | injection-progress; injection-navigation-disclosures |
| P08 | Future named-section stop before known warning: visible once, typed unknown route lands on visible Review without note mutation | progress units; injection-refinement-acceptance, test-only unknown-issue-browser-probe |
| S01 | Real repeated-site advisory after current review: all earlier steps recorded, warning still visible, actual Sign enabled | progress units; injection-refinement-acceptance |
| S02 | Same advisory immediately after material prior-site edit: actual Sign disabled until current review; precise reason retained | injection-refinement-acceptance; existing workstation review/sign safeguards |
| S03 | Clinically ready without documenting staff or unavailable draft protection: Signing unavailable/reason; no success | injection-progress; injection-full-draft-safety; injection-lifecycle-refinement |
| S04 | Reject actual draft/completed-record Storage writes, recover and retry: current values/id retained, no premature card, one durable attestation | lifecycle progress units; injection-lifecycle-refinement |
| S05 | Actual staff acknowledgement/sign: every shared surface signed locally/read-only, seven steps disabled, one retained inert editor | injection-lifecycle-refinement; kiosk-flow; lightfully-deep-evidence |
| S06 | Held/Escalated/Provider plan: populate handoff and save; Prepare/Site/Administer Not needed; supported handoff path, no administered Sign | progress units; injection-navigation-disclosures |
| S07 | Populated handoff back to administration: canceled removal preserves exact bytes; acceptance deliberately removes handoff, recomputes applicable review | progress units; injection-navigation-disclosures |
| S08 | Reject clipboard and fallback; native print request/return; delayed copy after Next: blocked feedback, exact attempted text, local status/history unchanged | injection-lifecycle-refinement; print-regression |
| D01 | Actual 20 exception open/close cycles empty, populated and genuinely reviewed: canonical fields/fingerprint/note/dirty/write counts unchanged | injection-ownership |
| D02 | Separate Record exception input: selected incomplete says Needs details; explicit required evidence changes canonical facts | injection-ownership; injection-full-draft-safety; lightfully-deep-evidence |
| D03 | Collapse preserves populated facts; canceled Remove preserves bytes, accepted Remove deliberate; signed controls inaccessible | injection-ownership; injection-lifecycle-refinement |
| D04 | Enter BP/HR, collapse/expand 20 times, reload via real record drawer: summaries and exact values restored; next encounter reset | injection-navigation-disclosures; injection-lifecycle-refinement |
| D05 | Additional items starts closed; opening records nothing; one explicit statement updates summary and exact note; routine path leaves closed | injection-navigation-disclosures; workstation exact-copy; lightfully-deep-evidence |
| D06 | Custom response required input stays visible; selected exception/waste/departure issues reveal required target; deliberate removal policy | injection-navigation-disclosures; lightfully-deep-evidence; injection-full-draft-safety |
| D07 | Actual medication-specific safety concerns and active instructions remain outside optional disclosure; unchanged engine authoritative | existing injection-patient-screening units; workstation; density-and-appointment; print-regression |
| D08 | Write-in/typed/partial/schedule/omit, edit/cancel and populated summary: provider appointment separate from injection due, optional blanks do not block | avs-appointment units; density-and-appointment; print-regression |
| N01 | Real rail Identify→Verify and Site→Administer: exact visible control focus and aria-current, same existing tab supported | injection-navigation-disclosures |
| N02 | Select Sign with disabled finish: visible focused Review fallback/notice, no sign dialog or mutation | injection-navigation-disclosures |
| N03 | Closed exception target from rail, preview and Items to complete: mount/reveal/focus exact textarea; narrow Preview restores Details | injection-navigation-disclosures; lightfully-preview-refinement |
| N04 | Fill site/date/response, settle metadata: no advancement/focus steal; incomplete date does not summon clinical modal | injection-navigation-disclosures; injection-refinement-acceptance |
| N05 | Native input/select/radio/menu/disclosure keys and workstation commands: single dispatch, roving/typeahead focus, balanced menu listeners | premium-composition; modal-ownership; lightfully-accessibility-stress; workstation |
| N06 | Cancel/Escape dialog and popover: restores invoking focus, review cancellation does not acknowledge; hidden editor cannot receive focus | modal-ownership; premium-composition; injection-refinement-acceptance |
| N07 | Partially entered late dates → deliberate Review: once per facts; Cancel/Escape no approval, visible requirement, changed facts prompts again | injection-refinement-acceptance |
| N08 | Twenty focused/full/density cycles and Preview/Details: exact note retained, valid location, singular editor/IDs/observer targets; guided geometry retained | lightfully-accessibility-stress; lightfully-preview-refinement; density-and-appointment; kiosk-flow |
| R01 | Patient A appointment positive AVS control → same-name/different-DOB selected B restoration: fields/canonical/save/preview/actual AVS clear A provider | identity units; injection-ownership; evidence/restored-patient-appointment.pdf |
| R02 | Typed name/DOB, including clearing identity: shared policy clears reminder; no-op retains same-identity data | identity units; density-and-appointment; injection-full-draft-safety |
| R03 | Partial encounter with optional facts/reminder/unresolved review: Save/reload/real Resume retains correct record data and applicability | injection-navigation-disclosures; density-and-appointment; injection-full-draft-safety |
| R04 | Legacy absent appointment/signed envelopes: no borrowed defaults or historical clinical re-review; exact snapshot and reprint preserved | identity/AVS/record units; injection-full-draft-safety; print-regression |
| R05 | Signed Next native double-click + repeated Enter: one generation, cleared identity/reminder/view/feedback; exact historical bytes unchanged | injection-lifecycle-refinement; kiosk-flow |
| R06 | Typed-only blank/current field edits followed immediately by Save/pagehide/leave/New/Open/Sign: latest protected canonical draft, no lost last edit | all 27 injection-full-draft-safety cases; workstation |
| R07 | Pending typed autosave at record switch, stale external bytes/storage clear, delayed copy resolving after Next: no cross-record write/success, output locked until legitimate reload | injection-full-draft-safety; injection-lifecycle-refinement; existing photo-owner tests |
| R08 | Pending encounter/addendum service change/browse/exit: Cancel retains current work; Save/Discard uses correct record owner; discarded identity cannot resurrect | injection-full-draft-safety; workstation; conventions |
| Q01 | Empty/partial/ready/advisory/blocked/saved/signed/handoff share model; failed write/retry honest; Saving unit denies sign | progress state table; injection-progress; injection-refinement-acceptance; injection-lifecycle-refinement |
| Q02 | Material provider/site/date/dose/route/response receipts; exact no-op/disclosure/appointment-only exempt; untouched identity stays recorded | receipt units; injection-navigation-disclosures; injection-ownership |
| Q03 | Concise timing live node (unrelated edits zero mutations), shell ordinary announcement ownership; semantic disclosures, keyboard, contrast, forced colors/reduced motion | lightfully-timing-refinement; lightfully-accessibility-stress; premium-composition; manual AT outstanding |
| Q04 | Four sizes ordinary/expanded/long, both densities; real Chromium 200% zoom; separately labeled 200% text simulation; usable pane widths/EOD | lightfully-deep-evidence; preview/worklist/timing refinement; lightfully-accessibility-stress; reviewed screenshots |
| Q05 | 20 menu/disclosure/mode cycles: active listener/observer counts return to baseline; singular IDs/editor, exact note/write bytes | premium-composition; injection-ownership; injection-navigation-disclosures; lightfully-accessibility-stress |
| Q06 | All four services; exact canonical whole/section clipboard; all existing integrated appointment/long safety AVS cases and real extracted/rendered PDFs | full units/browser suite; workstation; print-regression; evidence/print |
| Q07 | Same legitimate routine entry→documented administration at 1440/800: 16 clicks baseline/current, zero unused optional groups; no automatic statements | lightfully-deep-evidence; evidence/comparison/routine-measurements.json; manual staff task timing outstanding |
| Q08 | Optional named groups/summary/status distinctions and physical handwriting/print comprehension | Engineering affordances implemented; clinic observation and actual printer/handwriting review outstanding |

## Explicit verification limits and reviewed scope

- S04/Q01: saves/signatures use synchronous browser-local storage, not asynchronous
  database promises. Saving is covered in the pure lifecycle projection; rejection,
  retry and durable attestation use actual browser Storage fault injection. This
  does not claim an asynchronous database save was delayed.
- P08: production evaluation currently has no future issue code. The isolated probe
  renders the production progress surface and invokes the real navigation handler;
  it does not substitute clinical evaluation or bypass signing safeguards.
- R07: protected pending typed autosave, stale external records and cross-tab events
  are tested; delayed record-scoped clipboard completion is also tested. Public
  metadata lookup does not own patient identity. No new asynchronous record-save
  API or scheduling service was introduced to manufacture a test case.
- Q03: browser semantics, keyboard/focus/contrast/forced-color/reduced-motion and
  live-region ownership checks are engineering evidence. Human assistive-technology
  review remains outstanding; no WCAG conformance claim.
- Q04: native browser zoom is actual `chrome.tabs.setZoom(2)`. Text-only enlargement
  doubles measured font/line metrics in one pass because Chromium exposes no native
  text-only zoom command. The unsupported viewport gate is not acceptance evidence.
- Q07/Q08: actual measured browser clicks are not staff task time, clinic
  comprehension, handwriting assessment or physical-printer evidence. Those remain
  outstanding. Windows/managed Edge visuals cannot be certified on Linux; existing
  Windows references are left unchanged, not called passed.
- A queued timestamp-only legacy autosave after guarded browse was reproduced on
  main. The return-byte test settles that prior task, retaining exact equality;
  legacy persistence redesign is separately tracked, not mixed into this scope.

## Four design gates and evidence

Single final screen owners: `shell-layout.css` (upper shell), StartCenter/native
worklist styles, `timing.css` + typed InjectionTimingRegister, `preview.css` (entire
stage/white paper/commands/scroll). Removed superseded patient-banner/narrow-shell
rules, injection schedule overrides, 128 obsolete checklist rules, 269 note/gutter
rules and competing preview layers. UDS retains its existing ScheduleRegister API.
Compact fields remain 34px/13px, Comfortable 42px, guided controls 44px. Helper-gloss
lookup controls now match the control itself and grow with enlarged text.

Like-for-like captures use the exact same 14-item mixed-service/long-name fixture
and actual Haldol required-entry/staff/review events, fixed October 2 date,
America/Los_Angeles timezone, locked Chromium and loaded fonts. Full images and
measurements are in [evidence/comparison](evidence/comparison). Counts below are
complete rows inside the worklist scroll region, not rows partly visible behind its
footer. This final method supersedes preliminary viewport-based 5/3 counts.

| Gate / normal fixture | Baseline | Final |
| --- | --- | --- |
| Upper masthead at 1440/1366/1024 | 69px | 68px; readable destinations, one Document care primary |
| Upper shell including patient banner at wide sizes | 157px | 140px |
| Worklist complete rows at 1440 / 1366 / 1024 / 800 | 4 / 2 / 2 / 1 | 6 / 4 / 4 / 2; neutral Draft, actual review concern retained |
| Ordinary full-view timing, all four sizes | ~321px | 198px; distinct future due and current visit; adjacent Override |
| Ordinary wide focused timing | ~329px | 208px; narrow complex contents grow naturally (~358px) |
| Completed preview checklist, 1440 / 800 | 136px / 223px | 46px closed summary; active concern remains outside |
| Actual note scroll client height, 1440 / 1366 / 1024 / 800 | 663 / 531 / 531 / 389px | 680 / 548 / 548 / 401px; white paper, one scroller, reachable EOD |
| Required routine clicks, 1440 and 800 | 16, optional opened 0 | 16, optional opened 0 |

At narrow width Preview intentionally occupies the full available pane and keeps
the existing form mounted/inert; Details restores the same control node. Wide
splitting requires actual available width for 600px entry + 480px note + 16px gap.
Timing status remains cadence information, not signing permission.

Nine intentional Linux PNG references were visually inspected; the populated
worklist decoded-RGBA reference was manually updated after inspecting its real
image. Snapshot generator success was not treated as verification. A separate
**21/21 browser verification run passed**, retries zero, without update flags or
tolerance changes. The unsupported-mobile reference remains unchanged.

Expanded/blocked/long signed/end-of-note captures for all four sizes and both
densities are retained in [evidence/expanded-long](evidence/expanded-long).
Actual native zoom and separately labeled text simulation are in
[evidence/accessibility](evidence/accessibility). PDF inspection covers every page
of three-page Vivitrol partial-appointment and Uzedy long-identity typed-appointment
handouts, plus partial and omitted examples in [evidence/print](evidence/print).
Patient screening and integrated provider appointment output are preserved.

## Reproduction and final gate

Use locked `npm ci`, Chromium from Playwright 1.62.0 and Linux for Linux references.
Build with `VITE_ENABLE_INJECTION_PATIENT_SCREENING=true`, then package standalone.
Run `npm run check`, `node scripts/check-local-refinement.mjs`, `npm run test:unit`,
and `TEST_STANDALONE_FILE=1 npx playwright test --retries=0` with JSON/HTML reports.
Final verification must follow the final source/reference commit, without further
amendment; record exact SHA/tree, suite counts and required CI outcomes in PR #70.
The repository's Actions files remain unchanged. No automatic merge or deployment.

For comparison, serve an isolated baseline build at 4174 and current at 4173, then
run `node scripts/capture-lightfully-comparison.cjs http://127.0.0.1:4174 OUTPUT_BEFORE`
and repeat with 4173/OUTPUT_AFTER. The utility deliberately uses the same current
synthetic fixture against both builds. Run
`node scripts/measure-lightfully-routine.cjs OUTPUT_JSON 4174 4173` for click counts.
These utilities write evidence only; they never update visual references.

Deferred features remain deferred: database/framework/scheduling integration,
Saved Records redesign, new medication rules, external Tebra filing, automatic
signing, post-sign appointment editing, new service workflows or broader shortcut
ownership redesign. Clinic/AT/printer observations are explicitly separate from
the completed engineering implementation.
