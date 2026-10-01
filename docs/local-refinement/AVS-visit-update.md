# AVS clinic hours and return-window wording

User-requested increment, 1 October 2026, within draft PR #68. No merge or
production deployment is authorized.

## Patient-facing changes

- Clinic hours: **Monday-Friday, 8:30 AM - 5:00 PM (appointments preferred)**.
- Routine scheduled next-dose instruction: **With clinic confirmation, you may
  come in up to 3 days before or 3 days after your due date.**
- The due date remains prominent. Scheduling/rescheduling and cold-chain
  call-ahead instructions remain visible. A due date is not represented as an
  appointment, and no Tebra synchronization is implied.

The window is conditional scheduling guidance, not medication authorization.
Starting/restarting/loading doses, named initiation protocols, held/escalated/
provider-directed encounters, unscheduled dates, PRN/one-time orders and Initio
retain their existing specific next-visit wording. All AVSs receive the new
hours. Medication-specific preparation, safety guidance, calculated dates and
administration eligibility are unchanged.

## Controlled implementation

The original `injection-avs-content.ts` is preserved byte-for-byte as
`injection-avs-guidance.ts`. The public entry point re-exports it and applies
only the approved clinic-copy changes to the resulting model. Both the
next-dose model and printed timeline use the same wording. Routine call-clinic
copy no longer contradicts the three-day window.

The original guidance blob is `c1c0664d922cdf414590cc4e1e3fda061a7126aa`.
The protected-boundary check permits only exact pinned blobs for the public
AVS wrapper, preserved guidance and amended AVS print fixture; all other
protected paths remain pinned to the original Lightfully baseline.
No renderer, print CSS, clinical engine, storage format, dependency, account,
PIN or database change is included.

## Validation

- Type/static checks, production build and 92 focused unit tests passed locally
  (18 new policy cases, 49 AVS content cases, 25 AVS stress cases).
- Independent Chromium rendering of synthetic baseline, routine Sustenna,
  Vivitrol, Uzedy, starting-series and Asimtufii AVSs produced one- or two-page
  layouts without measured page overflow or content/footer overlap. The routine
  screenshot was visually inspected for the due-date wording and both hours rows.
- The original 6,212-byte PRN/ordered AVS fixture was independently reproduced
  with its existing SHA-256. Changing only its hours produced the new pinned
  6,212-byte hash. Other print-root fixture hashes were not changed.
- The print-regression test retains its geometry and parity assertions and now
  checks the new hours plus routine-window wording on the Vivitrol sheet.

The local source archive has the same protected AVS/render/print code but not
all of the latest PR screen-layer changes. Local HTTP browser navigation was
blocked by this execution environment (`net::ERR_BLOCKED_BY_ADMINISTRATOR`), so
independent rendered-document checks are **not** a claim that the complete
application browser journey passed. Branch CI must verify the exact committed
revision. Existing unrelated UI-suite failures and clinic acceptance remain
outside this AVS-copy increment; the PR stays in draft.
