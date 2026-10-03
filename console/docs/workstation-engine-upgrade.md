# Original Workstation clinical engine integration

This follow-up brings the original MA-Workstation injection engine and documentation path into the console. It builds on the [initial injection workflow release](injection-workflow-upgrade.md). Tebra's verified chart, medication order, and prescriber direction remain authoritative. Publication, final CI results, and live acceptance evidence belong in the [deployment record](render-evaluation-status.md); this document does not assert a completed deployment.

## Engine and staff workflow

The console now consumes the original injection evaluator, medication catalog, clinical references, needle and NDC resolvers, response wording, initiation pathways, and patient screening content. The shared bridge translates the console's order, review, stock, and administration snapshots into the original encounter contract. Both the staff interface and server use the integrated evaluation; viewing a suggested step does not complete its required review.

Staff can work through product-specific cadence, preparation, site/needle inputs, initiation or restart instructions, oral-component documentation, and linked injectable components. Response wording requires an explicit selection and confirmation that its findings and actions occurred. Acute-safety and preparation checks remain explicit. Generic products retain an ordered interval and provider instructions without receiving a borrowed product algorithm.

The imported clinical source is preserved separately from console policy. [Engine provenance](../src/shared/workstation/domain/provenance.json) records original and imported hashes; the [sync script](../scripts/sync-workstation-engine.mjs) checks for source drift. The [clinical policy adapter](workstation-clinical-policy.md) documents primary prescribing-information sources and targeted corrections for calendar intervals, missed-dose thresholds, treatment-stage history, Sustenna first-maintenance anchoring, and indication-specific review. Unsupported inputs or missing history do not select a regimen. Source parity and software checks do not establish clinical clearance.

## Original documents, refreshed presentation

The Tebra path uses the original encounter adapter and compact clinical formatter, including its separate **CC, Assessment, and Plan** bodies and single-copy text. Staff can copy each field independently. The console adds recorded facts that the original contract could not express, including provider communication, screening details, actual delivery errors, observation outcomes, and attributed amendments. It preserves source text and distinguishes historical omissions from normal findings.

The English AVS uses the original content model: patient identity, dated treatment timeline, administered product and lot, next-visit instructions, site care, product-specific guidance, clinic contact, and emergency instructions. Its Lightfully presentation uses warm ivory, navy serif headings, muted teal date emphasis, and a restrained coral emblem. Long content flows without fixed page-height truncation. Print staging is cleared after printing, locking, document replacement, or leaving the encounter.

Audited adapter corrections prevent the original model from implying a completed injection in a draft, assuming a paired or oral dose occurred, treating every Sustenna 234 mg dose as initiation, or shifting the first maintenance target with a delayed second starting dose. See the [documentation source contract](../src/shared/workstation/documentation/README.md) and [documentation provenance](../src/shared/workstation/documentation/provenance.json).

The original patient screening questionnaire is available in English and Spanish. The original AVS itself is English-only; the existing Spanish console visit summary remains a separately identified option. Staff-entered text keeps its original language. An SVG favicon matches the console's restrained clinic identity and is embedded in the standalone preview.

## Stock, historical truth, and remaining limits

Each physical injection keeps its own encounter, lot, reservation, and stock transaction. The server verifies paired-component identity and compatibility and freezes actual component evidence. A link or selected protocol cannot assert a second injection was given; pending components and follow-up instructions remain visible. Oral medication is recorded as administered or verified with its supporting source, without being inferred from a protocol choice.

Retrospective entry records the historical event date separately from today's documentation, with a reason and confirmation that its package use has not already been recorded. It does not backdate the review or turn missing historical checks into completed bedside observations. **The exact historical lot must still be active, unexpired, available, and eligible for that patient today.** Expired, absent, depleted, or otherwise ineligible historical stock cannot be reconciled through this flow; substituting a different lot is not supported.

Focused tests compare the imported engine and document formatter against the original modules and cover policy boundaries, stale review invalidation, independent paired stock, duplicate administration protection, frozen snapshots, incomplete delivery, retrospective truthfulness, and AVS text preservation. Final test totals and deployment checks are intentionally deferred to the release record. Authenticated staff rehearsal and printed-document review remain acceptance work; no hosting, recovery, or clinical approval is implied by this integration.
