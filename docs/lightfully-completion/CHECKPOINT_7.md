# Phase 4A — Samples and Forms

Local implementation checkpoint: `877e0ccce73db47aa79de4d8b929de7caf28b4fc`;
tree `ba54a33255c04cabdb0da45d1d80cb8c979643e8`.

Patient instructions remains visible. Optional sample titration uses the existing
TransactionLine with Optional / Instructions entered summaries; Review needed
comes only from an actual titration stop. A real stop opens that disclosure.
Opening and closing changes presentation state only.

Forms request/follow-up stays primary. Disabled letter authoring has no working
tab or large placeholder screen; the small Letter drafting availability disclosure
explains the existing clinic workflow. Authoring remains disabled.

Preservation, type/static and production build passed. Eight unique browser cases
passed with retries=0: four new wide/narrow keyboard, exact recovery and copied-note
journeys, two existing recovery journeys, failed recovery and malformed recovery.
An initial new Forms locator incorrectly omitted the existing accessible “optional”
suffix; correcting that locator produced the complete eight-case pass. The two Forms
cases also reran successfully after adding full explanation scroll inspection.

Reviewed synthetic screenshots at 1440x900 and 800x600: patient context, instructions,
populated intent summary, keyboard focus, explanation and footer remain legible.
The existing service scroll provides access to the explanation without hiding
request fields or changing the footer owner. No visual references or tolerances changed.
Clinical engines, note grammar, recovery schemas and print builders are unchanged.

Phase 4A's targeted gate is green. Complete exact-head certification remains Phase 6.
