# Final visual and operational review

Base: e857de4906ca5822e7545d21e75f3c9386b5364f, isolated Lightfully branch.

## Changes

Keyboard help and command search now use the same semantic dialog heading,
white surfaces, restrained dividers and close affordance as the service dialogs.
The command palette names the Worklist correctly. Reference, Daily closeout and
TMS have proper page headings with wrapping actions rather than a flush-left
legacy summary bar. TMS remains an explicitly unavailable placeholder.

Saved injection and UDS note browsers visibly show DOB from each saved record.
Long patient names wrap instead of truncating. Table typography and filters are
screen-only changes; row identity, sorting and open handlers are preserved.
The idle lock uses the existing line icon system with no authentication changes.

Record dialogs now update controlled state on native cancellation and reconcile
the DOM before paint. A delayed close event cannot close a newer opening, and
deferred focus restoration cannot steal focus from a new modal. Shared utility
dialogs wrap Tab/Shift+Tab. These changes address presentation lifecycle only,
not storage ownership or clinical decisions. Sources: WHATWG HTML interactive
(dialog close/cancel lifecycle); Preact v10 Hooks (useLayoutEffect).

## Verification plan

Run type/static checks; all unit tests; the complete browser and print suite;
the native single-file startup/save/reload test; and repeated rapid close/reopen
checks. New tests cover the actual layouts at 800x600 and 1440x900, modal focus,
record preservation, visible DOB and accessible reference search. Updated table
appearance expectations retain all behavioral assertions.

Protected boundary: public/legacy, src/legacy, src/domain, src/application,
src/persistence, src/documentation and tests/fixtures are unchanged.

## Use boundaries

Keep Tebra as the chart of record. Browser-local data does not migrate between
origins/profiles automatically. Do not bypass storage or writer-lock failures.
The staff-name lock is not enterprise authentication. Use synthetic patients for
clinic acceptance. Automated software tests do not independently validate all
clinical references or replace local workflow review. Live deployment unchanged.
