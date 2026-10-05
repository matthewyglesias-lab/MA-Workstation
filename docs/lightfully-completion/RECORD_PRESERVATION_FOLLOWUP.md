# Patient-browsing record preservation — certification follow-up

The documentation-only head `fd2e61c29ec869e4ea8ac2946af53e6cfdc7d306`
passed all 898 units and all 414 full-review cases in run `37276079688`.
Its separate production-artifact run `37276079720` passed 412 cases, skipped
the standalone-only opt-in case and failed one patient-browsing preservation
check. The only reported difference was the active draft's `updatedAt`, from
`2026-10-05T07:10:40.283Z` to `2026-10-05T07:10:40.678Z`.

The test took its pre-existing-record baseline after typing the new encounter.
At that point the 700ms autosave can already have persisted it. The existing
guarded save before browsing then legitimately updates that same active draft;
the test incorrectly classifies it as an untouched old record. The production
log's `Injection` summary and current timestamp identify this new draft, rather
than any of the four dated, named synthetic fixture records.

The correction captures pre-existing records before edits and controls timers
before typing. Two cases explicitly exercise pending autosave and completed
autosave. Both require all original records to remain fully identical, exact
UDS bytes to remain unchanged, exactly one new active draft with the entered
identity, and exact durable bytes to remain unchanged after returning from the
read-only chart and after another second of delayed tasks. The completed-save
case also verifies the same draft ID survives the guarded browse save.

No timestamp is ignored, stripped or normalized in comparisons. No runtime,
clinical rule, schema, note grammar, print source, fixture or screenshot tolerance
changes. One browser case is added: the full review now contains 415 cases.

Local preservation/static/type checks, 898 units and production build passed.
Local Chromium could not launch in the refreshed execution environment, before
any test interaction, so local browser results are not claimed. CI source and
exact production-artifact validation of this correction are pending.

Harness follow-up before final certification: the chart return restores focus
on animation frames. With the test clock paused, explicitly advance it before
checking restored focus. Immediate and delayed exact-storage comparisons remain
on either side of that advancement. No application focus logic is changed.

The earlier review ZIP remains an immutable package of its pinned, passing
engineering source `4886db988834783058ca06cc97e39548edd5be44`; it is not silently
relabeled as evidence for this follow-up. PR #71 remains draft, main/production
unchanged, and merge/deployment are outside this continuation's scope.

## Source-review print harness follow-up

At source `c1591153c9ec5d64e2dc48df1bbb1ea54e21773f`, both new
record-preservation cases passed in both CI paths. Production-artifact browser
review `37342369789` passed 414 cases and skipped the standalone-only case, with
zero retries. Its deployment step hit the existing staging-environment limit.
Full source review `37342369778` passed 414 cases and failed one separate AVS
write-in geometry assertion, which measured all four lines as zero height.

The retained trace shows the staged AVS subtree rebuilt between successive
assertion snapshots while `print-avs` remains staged. The later failure
screenshot shows all four writing lines. The legacy autosave calls `renderAVS`,
which replaces `avsSheet.innerHTML`; a locator's previously resolved node list
can therefore be detached before its geometry callback executes. This is a
timing explanation supported by the trace and renderer, rather than a claimed
local browser reproduction.

The follow-up queries the current document and measures its lines in one browser
task, using the existing assertion timeout to wait for rendered geometry. It
requires the exact expected count (four write-in, two partial, zero typed or
schedule), every node connected, and every line at least 22px high. No threshold,
page-fit, semantic, PDF, fixture, screenshot or production source changes. The
full 415-case source and 414-case production reviews must pass again before this
follow-up is certified; retries remain zero.
