# PR #70 — behavior and usability acceptance matrix

**48 scenario families. Status: specified for implementation, not executed as end-to-end tests by this audit.**

Baseline: main `30833af68337fa85334ccd7f49d04d65c8ffeac6`. Use synthetic fixtures and locked dependencies. The current audit executed 94 targeted function-level tests, including ten characterization probes; those are separate from this acceptance matrix.

P0 identifies release-blocking data/side-effect paths to verify, not a claim of observed patient harm. P1 covers core behavior and P2 usability quality. Parameterize scenario families rather than counting each viewport as an independently designed requirement.

For each case record commit, fixture, mode/density, viewport, real command invoked, expected and actual canonical state, status shown, focus destination and relevant persistence/copy/print outcome. High-risk cases must use actual UI events and inspect canonical/persisted output, not merely call the proposed projection directly.

## Evidence rules

Run pure predicate/projection cases exhaustively for applicable states; run high-risk event paths in the real browser. Use fault injection for unavailable/slow/failed storage and clipboard. Do not equate mocks of successful persistence with a completed record. Keep the existing clinical engine outputs, authorization gates and old-record compatibility tests authoritative. Any necessary shared-predicate extraction requires parity tests.

Use 1440×900 and 800×600 for core guided event paths; include the intermediate sizes for composition and reflow. Test both density preferences and guided geometry separately. Complex exception/long-content fixtures must not be compressed or omitted to meet normal density targets.

Before release: inspect real images, then commit intentional references, then run the full exact-head suite with retries disabled. A passed reference-generation job, a characterization expectation of the old bug or a prior green commit is not acceptance. Record unresolved environment and clinic limitations explicitly.

## Step progress and ownership

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| P01 | P1 | Untouched encounter | No step is falsely complete. Ordinary missing input is neutral; genuine safety stops remain distinct. Current step does not imply completion. | Unit + browser |
| P02 | P1 | Incremental identity and order | Complete only the applicable identity requirements. Identify updates without waiting for response/disposition; missing provider belongs primarily to Verify order. | Unit + browser |
| P03 | P1 | Prefilled versus verified | A carried name, staff default, calculated date or visited screen does not satisfy an explicit acknowledgement. Valid entered facts need no invented second confirmation. | Unit + browser |
| P04 | P1 | Missing response only | With all earlier facts valid and only response.required missing, route to Response. Identify stays complete; Site/Administer do not falsely demand response there. | Real-engine unit + browser |
| P05 | P1 | Preparation requirements | A valid lot/NDC alone does not mark Prepare complete when applicable product-preparation confirmations are missing. Irrelevant requirements are excluded. | Real-engine unit + browser |
| P06 | P1 | Dependency changes | Change medication/dose/route/site/timing after completion. Recompute affected requirements and review freshness; preserve unrelated completed identity and accurate data. | Unit transition table + browser |
| P07 | P1 | Current versus completed | Revisit a complete step, click an incomplete later step and scroll through fields. Only location changes; navigation does not document administration or set completion. | Browser |
| P08 | P1 | Unknown issue routing | An unrecognized evaluator issue remains visible and counts once; a stop in an unfamiliar named section precedes known warnings. Known issues link to stable typed targets, not label-text matches. | Unit + browser |

## Signing, lifecycle and outcome truth

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| S01 | P1 | Permitted warning | Use an actual warning-only ready-to-lock fixture. Sign capability follows existing gates; the warning remains visible and valid earlier steps are not called unstarted. | Real-engine unit + browser |
| S02 | P1 | Incomplete required review | Use a warning with an unmet mandatory review requirement. Do not treat the warning-only sign case as blanket permission; preserve the exact blocked action and reason. | Real-engine unit + browser |
| S03 | P1 | Storage or attestation unavailable | Clinically complete record with a disabled real sign capability shows the reason. No unqualified Ready to sign message or fake successful save. | Fault-injected browser |
| S04 | P1 | Pending and failed save/sign | Delay or reject save/sign, then retry. Keep the right draft and values; avoid duplicate records/attestations; do not show a completion card before durable success. | Fault-injected browser |
| S05 | P1 | Signed outcome | After successful local signature, every status surface reflects signed/read-only scope. No actionable Ready to sign prompt; retained editor is inert and inaccessible. | Browser + DOM/focus assertions |
| S06 | P1 | Held/escalated/provider-plan | For each supported non-administration outcome, applicable handoff details are reachable; administration-only steps are Not needed. Use the supported save/handoff path, never administered-injection sign. | Real-engine unit + browser |
| S07 | P1 | Switch outcome back | Switch a saved/current hold path back to administration where allowed. Recompute applicability and required reviews; skipped steps do not become completed. Removal/retention is explicit. | Unit + browser |
| S08 | P1 | Output is not external filing | Cancel/deny print and clipboard operations. Do not mark printed/filed/administered from a request. Preserve actual copy failure and signed-local distinctions. | Fault-injected browser |

## Disclosure without clinical side effects

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| D01 | P0 | Exception open/close invariant | Click exception Expand/Collapse before and after entering details. Canonical clinical fields, review fingerprint, note text, dirty state and persistence count remain unchanged. | Unit + actual-event browser |
| D02 | P0 | Explicit exception selection | Record an exception using its separate clinical input. Required details appear; incomplete content says Needs details, never Documented merely because selected/open. | Real-engine unit + browser |
| D03 | P0 | Exception removal | Collapse a populated exception without disabling it. Separately remove it using an explicit guarded data action; cancel leaves everything intact. Signed data remains immutable. | Browser + saved-state comparison |
| D04 | P2 | Vitals summaries | Add values, collapse, expand and reload the same draft. Values persist, collapsed summary acknowledges them, and no values appear for a different patient. | Browser |
| D05 | P1 | Additional note statements | Routine completion does not require opening optional note items. Open/close changes no statements. Explicit selections update summary and exact generated text only as intended. | Browser + exact text |
| D06 | P1 | Conditional optional fields | Select Custom response, waste/product issue, or another dependent option. Newly required fields are visible or one issue action reveals them; hidden obsolete values follow explicit policy. | Unit + browser |
| D07 | P1 | Active safety concerns | Preserve current safety-screen rules. Selected concerns and necessary actions never disappear under an optional disclosure; unchanged safe empty triggers can be minimized. | Real-engine unit + browser |
| D08 | P1 | Appointment editor modes | Write-in/typed/partial/schedule/omit remain accurate. Closed summary reflects mode; missing optional typed details do not claim no booking or block the routine handout. | Unit + browser + print |

## Navigation, focus and interruption

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| N01 | P1 | Same-tab step changes | Identify→Verify order and Site→Administer focus the proper visible group while staying on the same existing tab; current-step indication does not rebound incorrectly. | Browser |
| N02 | P1 | Sign-step destination | Selecting Sign navigates to review without signing. A disabled finish button produces a useful visible-heading/issue fallback rather than a lost focus target. | Browser |
| N03 | P1 | Hidden issue target | From the rail, summary and preview, invoke an issue whose field is inside a closed conditional disclosure. Open it, focus its field and keep label/error visible. | Browser |
| N04 | P1 | No automatic advancement | Complete the last required field, enter a date, select a radio or let calculated metadata settle. Progress updates without changing the active step or stealing input focus. | Browser |
| N05 | P1 | Native keys and command ownership | Enter/Space/arrow keys in radio groups, selects, textareas and disclosures keep native intent. A workstation shortcut dispatches once; opening a menu adds no competing handler. | Browser + event counters |
| N06 | P1 | Dialog dismissal | Escape/cancel restores focus to the correct invoking control. Dismissing review is not acknowledgement. A hidden background editor or other modal never receives the action. | Browser |
| N07 | P1 | Timing prompt fingerprint | No late-dose modal while dates are mid-entry. On Review, show the appropriate existing prompt once per facts fingerprint; cancel leaves a visible issue; changed timing can need new review. | Browser + fingerprint assertions |
| N08 | P1 | Mode switching | Switch focused/full view, Compact/Comfortable, preview/details and fullscreen. Preserve encounter data and valid current position; keep guided targets large; do not add duplicate editor/listeners. | Browser |

## Recovery and patient ownership

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| R01 | P0 | Selected-patient restore | With patient A appointment metadata, select different patient B and invoke Use selected local patient. Clear A reminder in canonical state, fields, saved snapshot, preview and AVS. | Actual-event browser |
| R02 | P0 | Typed identity transition | Change name/DOB through existing input paths. Apply the same ownership policy as restoration; no lingering patient-specific optional summaries. | Browser |
| R03 | P1 | Same-record recovery | Save a partial encounter with appointment, optional notes and an unresolved issue; reload and resume via the real record owner. Preserve values, applicability, correct patient and truthful status. | Browser + persisted data |
| R04 | P1 | Older record compatibility | Open legacy envelopes and signed records without appointment metadata. Do not inject current defaults or demand new review for a faithful historical reprint. | Unit + browser + print |
| R05 | P0 | Next patient exactly once | After successful completion, rapid double activation and keyboard repetition yield one new encounter. Reset patient-specific details, errors, disclosure state and completion; retain signed history. | Browser + dispatch/storage counters |
| R06 | P1 | Latest input at save boundary | Edit a partially typed date, identity or text field and immediately Save/leave/Sign. Commit the current canonical value or present validation; never persist the previous keystroke value silently. | Browser |
| R07 | P0 | Stale callback and conflict | Delay record A save or a lookup; navigate through permitted guarded paths to B. A late completion cannot relabel/save B or show A success as B success. Test existing cross-tab conflict protection without weakening it. | Fault-injected browser |
| R08 | P1 | Unsaved exit and cancellation | Use service changes, patient browsing and app exit with pending work/addenda. Cancel keeps current edits; accepted save/discard follows the correct existing owner; no background mutation on cancel. | Browser |

## Cross-surface quality and acceptance

| Case | Priority | Scenario | Required outcome | Verification |
|---|---|---|---|---|
| Q01 | P1 | Status consistency table | For empty, partial, warning, blocked, ready, saving, failed, signed and handoff fixtures compare rail, checklist, preview and action dock from the same revision. Fail any contradictory scope/capability. | Unit + browser |
| Q02 | P1 | Review invalidation explanation | Edit a material date/site/provider/response after review; show the specific dependency to recheck. Exact no-op, disclosure and appointment-only changes do not cause spurious clinical invalidation. | Unit + browser |
| Q03 | P1 | Announcements and accessibility | One concise ordinary announcement per meaningful transition; required live feedback without unnecessary focus changes. Verify disclosure semantics, keyboard navigation, contrast, forced colors and reduced motion. | Browser + assistive-technology review |
| Q04 | P1 | Responsive and text enlargement | At 1440×900, 1366×768, 1024×768 and 800×600 inspect ordinary/expanded/long states. Check 200% text and zoom; do not use an unsupported-viewport gate as proof of accessibility. | Browser + visual review |
| Q05 | P1 | Repeated lifecycle stress | At least 20 menu/disclosure/mode/navigation cycles. Listeners/observers with temporary ownership return to baseline; callbacks, IDs, active editors and notification sinks remain singular. | Browser + instrumentation |
| Q06 | P1 | All service and print parity | Injection, UDS, Samples and Forms remain functional. Compare exact whole-note/section copy. Re-run integrated-appointment and long warning-heavy AVS cases; no screen CSS leakage to print. | Full suite + real generated PDFs |
| Q07 | P2 | Routine optional-free journey | Complete the legitimate routine path without opening unused vitals, extra documentation, appointment editing or advanced output controls. No additional mandatory clicks or inaccurate automatic statements. | Browser + measured staff task |
| Q08 | P2 | Findability and comprehension | Ask staff to find optional details, explain what is complete, distinguish saved/signed/filed, and close a populated section. Observe errors/backtracking; check handwriting and actual printers separately. | Clinic acceptance; not automation alone |

## Finding coverage

F01: P01–P08, Q01. F02: P02/P04/P05/P08, N01/N03. F03: S01–S04, Q01. F04: D01–D03/D05, Q02. F05: R01–R05/R07. F06: S05–S08, R05. F07: N01–N08, Q05. F08: P06, N07, Q02. F09: D04–D08, Q07/Q08. F10: Q01/Q03, N08.

## Completion gate

All P0/P1 cases must pass or have a documented, reviewed scope reason that does not leave a release blocker unresolved. Do not silently downgrade a safety case to a cosmetic follow-up. P2 engineering checks should pass; clinic observations and physical print tests must be reported as performed or outstanding, never inferred from Linux screenshots.

Keep the focused-view visual language and the four original PR #70 design acceptance gates. Behavioral correctness and reduced decision overload must be demonstrated alongside appearance, not substituted for it.
