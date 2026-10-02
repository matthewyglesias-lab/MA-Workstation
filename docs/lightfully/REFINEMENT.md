# Mature clinical workspace — presentation refinement

## Purpose

Make the standalone MA Workstation a focused documentation companion to Tebra,
not a parallel EHR or appointment queue. The user approved this information
architecture before implementation. Design reference: the user's IPMG Letter
Builder, notably `source/styles/lightfully-ui.css` and `clinic.css`. No clinical
content was imported from that application.

## Structure

The fixed left navigation contains **Worklist**, **Saved records**, and **Tools**,
with one **Document a service** launcher. Its chooser opens the original Injection,
UDS, Samples, or Forms workflow using the existing protected navigation path.
Choosing a service resumes that workspace; starting a fresh record remains an
explicit, guarded action within the service.

The worklist uses the original data projections. A single table displays patient
or task, service, date/time when supplied, status, and the available next action.
The original All work / Needs review / Today / Drafts filters remain. It is not a
Tebra appointment schedule and does not invent arrivals or statistics.

Each service has a full-width Details view and an opt-in generated-document
Preview. At wide desktop widths both can be visible. Below 1180 CSS pixels they
switch without unmounting the form or losing local input. Clinical section tabs
remain directly accessible; this is not a forced sequential wizard. The existing
seven-step injection focus mode remains available.

Patient context stays separate from form input and document review. A blank
workspace shows an identification prompt, not an allergy alert for a nonexistent
patient. Actual patient mismatches and clinical warnings retain the original
handling. Forms, UDS, Samples, saved records, references, closeout, and the original
TMS placeholder retain their existing capabilities.

## Preservation boundary

`public/legacy`, `src/legacy`, `src/domain`, `src/application`, `src/persistence`,
`src/documentation`, and `tests/fixtures` remain unchanged from the PR #62 baseline
`28ae520bb51161ef3eb4b3642071007601b9f64e`. No treatment rule, clinical default,
signing gate, persistence schema, or print template was replaced by this change.

All styling is screen-only. Presentation labels and locations changed, so UI
access selectors and intentional appearance expectations were updated; the
clinical, draft-integrity, writer-lock, patient-identity, and print assertions
remain active. New tests exercise preview/draft continuity, service selection
cancellation, modal precedence, and the four actual service workspaces.

## Review and use

This remains browser-local software. Keep Tebra as the chart of record. There is
no new shared database, Tebra sync, cloud backup, or enterprise authentication.
Opening a downloaded file is a separate storage location from a hosted copy;
records do not automatically migrate. Keep the file at a stable path in a managed
browser profile. Never bypass a storage or writer-protection error.

Use synthetic patients for clinic acceptance testing. Regression tests preserve
software behavior; they do not independently validate every clinical reference.
