# IPMG MA Workstation — controlled pilot review

Decision requested: approve a **one-clinic, 1–2 week controlled pilot**, subject to
the written prerequisites in [LIMITATIONS_AND_GOVERNANCE.md](LIMITATIONS_AND_GOVERNANCE.md).
Company-wide rollout is a later leadership decision.

The engineering candidate is `4886db988834783058ca06cc97e39548edd5be44`, tree
`c5309c9630b3bbdaf1d63bdd40cdaa34cd7ea650`. Preservation, type/static, all 898 unit
tests and all 414 full browser/visual/print cases passed. The separate production
artifact passed 413 cases; its one skipped standalone-only case passed in the
414-case review. Both browser paths enforce zero retries.

The review archive preserves the exact tested standalone HTML and production
bundle, original manifests and checksums, test provenance, six review documents,
17 synthetic scenes and appointment/long-warning print examples. Open its
`index.html` for the review gallery. No real patient records are included.

Azure's PR preview deployment was blocked by the maximum staging-environment
limit after the engineering tests passed. No unrelated environments were deleted.
The archive is the stable review fallback; it does not require a preview slot.
PR #71 remains draft. Main was not changed and production was not deployed.

## What staff should review

Use the scenes to discuss the worklist, read-only patient browsing, routine and
blocked Injection, timing, ready versus signed-locally states, full/focused entry,
appointment AVS, UDS results, Samples, Forms, saved records and failed storage.
The exact scene provenance is in [TEST_EVIDENCE.md](TEST_EVIDENCE.md).

During a synthetic walkthrough, ask staff to identify the patient, remaining
required work, optional details, save/lock state and the next action. Demonstrate
returning from disclosures without changing the note; resuming the correct
record; and responding to a failed save. Review both 800x600 and ordinary desktop
use, keyboard access and the printed pages on the actual office printer.

## Boundaries leadership must accept

This is a static, frontend-only app. Patient records, drafts, preferences and
activity remain in one browser/profile on one workstation. It has no central
database, application authentication, workstation synchronization or centralized
backup. Staff-name attestation is local context, not verified identity.

**Signed locally does not mean filed in Tebra. Copying and printing do not prove
filing.** The clinic must define who verifies final Tebra documentation and when.
An appointment reminder on an AVS does not book an appointment. TMS and letter
authoring remain unavailable.

Automated regression protects existing software behavior, note grammar and
approved print content. It does not replace clinical policy review, security
approval, managed Windows/Edge validation or physical printer acceptance.

## Decision record

| Decision | Owner / evidence required | Current status |
| --- | --- | --- |
| Accept the engineering review candidate | Engineering test evidence | Green |
| Permit browser-local patient data for the pilot | Security/privacy and IT, in writing | Pending |
| Approve clinical scope and Tebra filing procedure | Clinical and operational leads | Pending |
| Name pilot, support and incident owners | Operations and IT | Pending |
| Accept managed devices, Edge and office printers | IT and representative staff | Pending |
| Authorize the one-clinic pilot and stop criteria | Leadership | Pending |
| Authorize broader rollout | Later pilot review and separate approval | Not requested |

Record the actual owners, approval dates and supported configurations before
patient-data use. Follow [PILOT_PLAN.md](PILOT_PLAN.md) for execution and review.
