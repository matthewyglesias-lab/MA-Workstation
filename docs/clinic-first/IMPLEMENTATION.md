# Clinic-first workstation review

This increment continues draft PR #68. Tebra remains the chart of record.
It does not authorize a merge, deployment, or replacement of a clinic's working
copy. All review fixtures are synthetic.

## Workflow and data boundaries

| Responsibility | Owner and boundary |
| --- | --- |
| Medication rules | Existing pure domain engines; dose, formulation, route, interval and eligibility rules unchanged. |
| Documentation | Existing documentation adapters and formatters; Tebra section structure and renderer content fixtures retained. |
| Injection and UDS records | Existing versioned repositories, local storage keys, validated snapshots, stale-write and read-only guards. No migration. |
| Forms and Samples interruptions | `WorkflowRecovery` stores the exact typed encounter in this tab's `sessionStorage`. Separate from signed records. |
| Application state | The existing coordinator and typed panels remain authoritative. Worklist rows are read-only projections, never permission to open or overwrite a record. |
| Screen design | The three finishing stylesheets are consolidated in `lightfully/workspace.css`; compatibility base selectors remain to avoid a risky mechanical rewrite. |
| Paper design | Root-scoped `documents/injection-avs.css` and `documents/clinical-print.css` are independent of screen composition and clinical calculation. |

## Changes staff will experience

- Resume saved UDS drafts and unfinished Forms/Samples sessions from the worklist.
  A service chooser names an existing session before staff return to it. Existing
  Injection saving, history and chart navigation remain connected.
- Forms and Samples retain partial dates, free text, packages and review state
  across service changes and reload. Closing the tab still ends the session;
  the browser warns while either workflow has unfinished work.
- A recovery write must round-trip successfully. Denied/quota/no-op writes are
  not reported as saved. Corrupt, incompatible or unexpectedly changed recovery
  bytes are preserved; current input remains visible with a copy-before-leaving
  recovery path. Failed clearing cannot silently start a replacement session.
- A local signature is labeled **Signed locally**, never **FILED**. Copying a
  note does not confirm filing or a handoff in Tebra. Staff labels do not imply
  authentication. No accounts or PINs were added.
- New injection allergy status, verification checks and response start
  unconfirmed. Missing response in an older record stays missing. Documented
  historical values are not rewritten. See `DOCUMENTATION-SAFETY.md`.
- The UDS preview is a readable clinician report. Collection time is no longer
  displayed as an invented report time, and the organization name is corrected.
- The requested document type is visible in Forms tracking. It no longer
  influences the note from behind the unavailable letter-builder tab.
- Note headings, copy feedback, small-window notices, overlays and warnings use
  the same contemporary visual system. Individual active clinical warnings and
  existing completion requirements remain intact.

## Patient and clinician print review

The AVS keeps its content model, approved medication instructions, and verified
clinic information. Its next target date has stronger priority, preparation
instructions are larger, surfaces are restrained, and the bundled font avoids
machine-dependent line wrapping. Whitespace was adjusted instead of reducing
body type. Routine, long-identity and Vivitrol examples exercise one- and two-page
layouts, footer clearance, overlapping sections, visible print roots, Letter
page dimensions and renderer parity.

The existing 8:30 AM–5:00 PM hours, San Bernardino phone number and conditional
clinic-confirmed three-day return wording remain unchanged. They are not new
medication rules or evidence of an appointment. Held, unconfirmed, initiation,
restart and provider-directed paths retain their distinct wording.

Secondary print work uses the bundled font too. The clinician UDS report has
larger results and instructions. Sample and UDS patient handouts use quieter
surfaces. The provider letter has a reliable top inset and a flowing footer.
Letter content, signature/release requirements, worksheets and ledger data
are preserved.

## Verification method

The baseline at `6ed5b3f` ran the complete browser suite without retries:
261 passed, 32 failed. Its source and failing assertions were inspected rather
than treating an earlier targeted pass as proof of application-wide correctness.
The baseline unit suite had 736 tests.

The final gate is `.github/workflows/clinic-first-review.yml`: preservation
check, types/static checks, all unit tests, production build, standalone package,
then **every** Playwright test with retries disabled and standalone coverage
enabled. It uploads the exact commit/tree, screenshots, PDFs and test reports.
The PR description records the final run and outcome; a build alone is not a pass.

Coverage includes medication changes, initiation/held exceptions, date boundaries,
actual-administration details, signed-record reopening, legacy snapshots,
malformed/duplicate/stale storage, failed writes, focused-date navigation,
session replacement, copied text versus preview, addenda, printing, and the
native local HTML file. New recovery tests check exact bytes and failure cases.

Eleven Linux visual baselines were deliberately replaced after image inspection,
not by an unattended update. State/geometry captures normalize to the bundled
Inter font instead of an OS-dependent Arial fallback. Actual Lightfully display
typography is retained in home and deeper-surface captures. No screenshot
tolerance, clinical threshold, or document-content fixture was relaxed.

Visual inspection includes 800/1024/1366/1440px views, Forms/Samples recovery,
UDS preview, note contrast, the small-window boundary, routine and long AVS PDFs,
grayscale Vivitrol pages, sample handouts, clinician reports, provider letters,
and the activity ledger. Browser actions are automated; image/PDF inspection
is visual review, not a human clinic acceptance session.

## Remaining release boundaries

- Forms/Samples recovery is per tab, not a durable signed-record repository,
  cloud backup or cross-device feature. Closing a tab or changing the browser,
  profile or file path is not a migration. Staff must verify documentation in
  Tebra before closing unfinished work.
- The pre-existing letter-authoring gate remains off. Request tracking, its note,
  model and tested renderer remain available; this is not a claim that the
  disabled authoring UI is ready. TMS still requires documentation in Tebra and
  no longer offers a fictional completed-session note.
- Managed Edge, Windows snapshot approval, physical clinic printers, long real
  clinic wording and workflow acceptance still require clinic review. Linux
  Chromium results do not establish those outcomes or clinical validation.
- Existing development-tool advisory remediation/security review remains a
  release gate; this increment does not change dependencies.
- The compatibility runtime and base style layers remain substantial. Their
  presence is documented, not disguised as a complete architectural rewrite.

No SQL, server, synchronization, shared records, new dependency or medication
policy was introduced.
