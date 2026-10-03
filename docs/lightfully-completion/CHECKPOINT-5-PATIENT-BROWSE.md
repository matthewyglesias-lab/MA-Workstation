# Checkpoint 5 — read-only patient browse does not rewrite a clean injection draft

Phase 2 isolates the eight patient-browsing failures from checkpoint 4.

The search refresh itself is retained. Exact-head CI proved that search now finds the saved
patient and the chart remains readable, keyboard reachable and returnable. The only durable
record difference after browse/return was `updatedAt`.

Source tracing found that `ClinicalDesktopShell.openChart()` invokes the shell's
`onBeforeViewChange` boundary. The parent supplied the general workflow-leave handler, which
intentionally re-files saved injection drafts even when the typed encounter is clean so older
drafts can still migrate at real lifecycle boundaries. Patient chart browsing is read-only and
must not use that clean-draft migration behavior.

The shared leave handler now accepts a narrow `persistCleanInjectionDraft` option. Workflow
changes retain the existing default. Chart browsing passes false: a clean saved injection does
not write again, while a dirty encounter or an already-saving legacy boundary still follows the
existing protected save path. No record schema, migration path, clinical evaluator, signing
gate, note renderer, print path or search index owner changes.

The eight existing browse cases retain exact before/after localStorage equality and now also
instrument Storage writes after the settled baseline, requiring zero writes to the injection
record key during search, browse and return.

This checkpoint intentionally contains no styling or secondary-workflow work.
