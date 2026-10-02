# Precision polish and read-only presentation performance

Continues draft PR #68. Keep the approved Lightfully-led design; no main merge,
production deployment, new service, account, database or record migration.

## Visual finishing

One final screen-only geometry contract aligns field labels whether they have
provenance controls or not. The previous populated patient/DOB controls were 4px
below their adjacent provider control. They now share one baseline. Lookup
controls have one continuous border and square internal joins. Fixed responsive
gutters align titles, fields, section rules and action docks. Tab counts, table
headers, dialog insets, icon/text rows, patient cards, reference panels and the
daily ledger use consistent spacing and readable wrapping. Plain dimmed backdrops
avoid full-window blur; reduced-motion and forced-color support remain.

## Performance without changing clinical behavior

- Global and patient-specific saved-note labels use a linear-time batch pass,
  preserving the original visible-name and distinct-key disambiguation exactly.
  The original helpers remain for compatibility and independent parity tests.
- Record windows reuse formatted rows and lazily normalized whole-record search
  text **within one validated repository snapshot**. Reloads create a new view.
  Search strings are bounded to 1 MiB UTF-16 content per window; oversized records
  are still searched without retaining their strings. Nothing is persisted or
  used as authorization to open/save/sign a record.
- Worklist grouping, counts and normalized display-text indexing are memoized by
  their source lists, rather than rebuilt on each filter keystroke.
- Daily activity preserves fresh reads and original deletion indexes, replacing
  repeated indexOf scans with a single map of first occurrences.
- Patient search no longer performs the same search twice on every keystroke.
  Composition Enter does not select a patient; leaving the search with Tab closes
  its results without changing the active record.

The domain engines, storage, writer locks, pagehide saving, print renderers and
AVS policy are untouched. No debounce was added to clinical input or saves. No
records, results, warnings or controls are omitted to improve benchmark numbers.

## Evidence and remaining release gates

Local type/static checks and all 736 unit tests passed. New cases compare old
and new labels, distinct/same-key collisions, lazy search, bounded caches and
snapshot replacement. A 1,000-row synthetic same-process benchmark compares
only accessible-label computation (five timed runs after warm-up). It is not a
claim about whole-app speed or a substitute for managed-workstation testing.

New browser scenarios exercise real field geometry at 1440/1024/800px, repeated
Preview/Details transitions with unchanged records, all four workflows, a
300-record search/reload and patient-search keyboard/composition behavior.
Existing Injection/UDS integrity, modal, focus, local-file and print regression
coverage must still pass on the committed source. Full original-suite results
are tracked separately from the targeted suite; no snapshots or safety thresholds
are silently relaxed in this pass.

## Dependency audit triage (unchanged lockfile)

The read-only audit produced three development-tool advisories: Vitest and its
mocker (<4.1.11), and nanoid (<3.3.18). `npm audit --omit=dev` reported zero known
production dependency advisories; this is not a security/compliance certification.
The affected development packages are not imported by application source. Keep
development servers private and update/test the locked toolchain separately.
No dependency version was changed in this design/performance increment.

Primary advisory references:
- https://github.com/advisories/GHSA-82fw-gwwq-j7x9
- https://github.com/advisories/GHSA-2v37-7h3g-55p8
