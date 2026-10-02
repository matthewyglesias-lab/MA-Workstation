# Explicit findings before documentation

The source audit found new-injection defaults of NKDA, six checked attestations,
and a tolerated-well response in the compatibility runtime. These are encounter
facts, not medication rules. New encounters now start blank/unconfirmed. The
existing completion requirements, medication thresholds, and dose/timing rules
are unchanged. Staff enter observed facts through existing individual controls.
Existing historical values and signed record bytes are not rewritten.

Samples' typed factory already starts unconfirmed; the compatibility markup and
reset path now agree. The retired hidden fast-review controls clear values
instead of manufacturing normal findings. Loading an old injection record with
no response leaves that response missing instead of substituting tolerated well.

## Authoritative basis reviewed 2026-10-01

- NICE CG183, recommendations 1.2.1 and 1.2.6, distinguish known negative allergy
  status from inability to establish it and require confirmation before a drug
  is prescribed, dispensed or administered. The source page was search-index
  retrievable; direct page access returned HTTP 403 in this environment.
  https://www.nice.org.uk/guidance/cg183/chapter/1-recommendations
- AHRQ PSNet, Scott MacDonald (2023), “Copy and Paste” Notes and Autopopulated Text
  in the Electronic Health Records: describes documentation errors caused by
  reused/unobserved findings and the need to review accuracy. Full page read.
  https://psnet.ahrq.gov/web-mm/copy-and-paste-notes-and-autopopulated-text-electronic-health-record

These references support the documentation principle. They do not clinically
validate this app or establish new product-specific medication rules.

## Required regression evidence

- Empty and partly completed encounters do not emit NKDA, performed checks,
  tolerated-well wording, or a completed administration.
- An administration disposition alone cannot satisfy missing confirmations.
- Complete synthetic fixture scenarios explicitly select each performed check.
- Older-record reload, full-snapshot persistence, note and AVS parity remain in
  the browser regression gate. Historical records are preserved, not re-attested.
