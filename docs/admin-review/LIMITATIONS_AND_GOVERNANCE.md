# Limits and governance decisions

The app is frontend-only and static. Browser-local records, drafts, preferences
and activity are bound to the browser profile and origin. A downloaded file,
another hosted origin, another profile or another workstation must not be
assumed to share records. There is no server database, app authentication,
cross-workstation synchronization or centralized backup.

The standalone boots without remote asset requests; optional remote reference
lookups can still require a network connection. File-URL storage behavior is
browser-dependent. A storage or writer-protection warning is a reason to use the
clinic's fallback, not evidence that work has been safely saved elsewhere.

Local save, local signing/locking and append-only addenda do not establish Tebra
filing or enterprise identity. Staff names and idle locking are not enterprise
authentication. Copy/print outcomes are local actions. An appointment reminder
does not reserve a provider visit or schedule an injection.

## Required written decisions before a patient-data pilot

| Question | Accountable role | Required decision / evidence |
| --- | --- | --- |
| Are supported devices managed and encrypted? | IT / security | Approved device inventory and controls |
| Is browser-local PHI permitted? | Security / privacy / clinical governance | Explicit approval for this architecture and pilot scope |
| Are profiles shared or staff-specific? | IT / operations | Profile and access policy; accountable documenting staff |
| What retention and clearing policy applies? | Privacy / clinical operations | Retention period, authorized clearing and chart-of-record policy |
| What if browser storage is deleted? | IT / operations | Expected loss/recovery limits and a verified fallback |
| What if a workstation is replaced? | IT | Replacement procedure; no assumed synchronization or backup |
| What is the unattended-workstation policy? | IT / clinic operations | Device access, idle/unattended handling and staff training |
| How is final documentation filed in Tebra? | Clinical operations / providers | Filing and verification SOP with a named owner |
| Are local records convenience copies only? | Clinical governance | Written chart-of-record classification |
| Who may locally sign/lock and add addenda? | Clinical governance | Authorized roles, training and correction process |
| Who owns support and incident response? | Operations / IT | Named owner, contact route, triage and rollback authority |
| Which Windows/Edge builds and printers are supported? | IT / clinic staff | Recorded versions/devices and acceptance results |

All decisions above are pending unless the organization supplies separate written
approval. This package asserts no organization-wide security, privacy or
company-wide readiness approval.

## Operational limits to teach

If storage fails, keep the current encounter visible, read the actual status and
follow the approved fallback. Do not assume that refreshing, closing the tab or
switching profiles will recover unsaved work. Do not clear storage or delete
local records as an informal troubleshooting step. The local log does not prove
that Tebra contains the final note.

Validate the exact package on managed Windows/Edge, at the supported 800x600
floor and representative desktop sizes, with native zoom, keyboard use and
physical office printers. Linux Chromium automation is engineering evidence,
not that managed-workstation acceptance.

Pilot incident reports must follow the organization's privacy process. Keep
patient-identifiable information out of repository issues and public screenshots.
The review scenes in this package are fictional/synthetic fixtures only.
