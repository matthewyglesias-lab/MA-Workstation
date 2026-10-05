# Clinical workflow scope for review

This candidate refines presentation and interaction over the existing clinical
engines, finalization gates, note builders, local record formats and approved
Injection AVS. It does not add treatment rules or independently revalidate the
clinic's clinical references.

| Area | Included behavior | Boundary to verify during review |
| --- | --- | --- |
| Injection | Patient/order, medication, timing, product and administration facts; required checks and response; optional vitals/details/exception; local note, signing and print | Existing gates remain authoritative. Ready is not signed; signed locally is not filed in Tebra. |
| Focused Injection | Guided view of the same encounter and existing checks | Switching views must preserve patient, values, review and output. |
| Injection AVS | Existing patient-facing content, due-date/timing language, warnings and pagination; optional write-in or typed provider reminder | Reminder metadata does not change an injection due date or book a visit. Staff must review all printed pages. |
| UDS | Collection/device/QC and physical panel order; direct keyboard result entry, flags and status; local note/lock/print | Results remain preliminary/presumptive. Positive/invalid evidence stays explicit; interpretation and confirmation remain clinical responsibilities. |
| Samples | Existing dispensing/package facts, patient instructions and optional titration/prescriber intent | Optional disclosure changes presentation only; it does not create prescribing authority or invent a required field. |
| Forms / requests | Existing request tracking, follow-up and documentation | Letter authoring remains disabled. Availability information is a small optional disclosure. |
| Worklist / saved records | Browser-local records, open sessions, counts, filtering and exact record resume | It is not an appointment schedule or a shared clinic census. Confirm patient identity before resuming. |
| Patient search / chart | Search of locally saved notes and read-only browsed context | Browsing does not create or overwrite an active encounter; deliberate patient promotion remains separate. |
| Reference | Clinical index and reading content, existing lookups | Reference browsing is not a clinical form or a new rule engine. |
| Daily closeout | Needs-review queue first, outputs, summary and activity; separate local management | Local activity is not proof of EHR filing. Clearing/deleting is deliberate and governed. |

TMS is unavailable. No scheduling integration, automatic Tebra filing, shared
database, centralized backup or app-level authentication is included.

## Preserved ownership and behavior

Existing clinical evaluators and sign gates remain intact. Injection/UDS record
schemas and keys, exact copied note text and canonical print renderers are
preserved. Menus and dialogs use their existing interaction/feedback owners;
patient-search refresh keeps its existing path. No parallel clinical state store
or second command dispatcher was introduced.

UDS now uses a native evidence table rather than an action-grid presentation.
Negative results are neutral; positive/invalid states retain full text, flags and
exceptional emphasis. Physical order, cycling/direct keys, counts, QC, locks and
note generation are unchanged. Local worklist lifecycle is visually neutral and
separate from actual review/stop concern.

Pilot reviewers should reconcile the software's retained scope with clinic
policy and authorized staff roles before using patient data.
