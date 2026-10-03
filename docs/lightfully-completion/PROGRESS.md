# Lightfully completion — recoverable checkpoints

Base: `7dbfd3a75531b7d1b5244c505f277e5102feaedb` (merged PR70).
This branch implements the user-approved post-PR70 audit without reopening the
clinical engine, persistence, focused journey design, or integrated appointment AVS.

## Checkpoint 1 — browsed-patient readability

Replaced the incomplete light-banner treatment in the existing utility surface
owner with a complete paired foreground/background contract: identity, DOB,
allergies, local scope, enabled/disabled actions, hover/focus, mismatch and forced
colors. No allergy text is interpreted or changed, and no event owner is added.

New browser tests cover actual record creation, patient browsing, informational
contrast, long names, four allergy representations, focus and return behavior.
Local browser navigation is blocked by the environment. This is not a passing
browser claim: existing GitHub CI will verify the committed version.

## Checkpoint 2 — attention is presentation, not permission

Added an exact-code/field presentation classifier that also requires positive
missing-field evidence from the existing progress projection. Routine blanks
become a compact, fully visible correction list rather than repeated red cards.
Clinical/invalid/unknown findings, safety confirmations and active exceptions
remain prominent. No issue, field, requirement, evaluator severity or command
capability is removed or changed; no extra progress store or listener exists.
The rail retains current/completed semantics, and a stale review stays explicit.

28 new targeted unit cases pass, including actual-engine missing-response,
volume-limit, advisory and signed cases, unknown issue fallback, no mutation,
and exact-code/evidence safeguards. Added two actual UI correction-route cases.
Browser verification remains with committed CI. Corrected the patient-header
test to read the actual patient trigger, not its containing tooltip host.

## Subsequent checkpoints

1. Clinical choice/destructive-action/lookup and menu consistency.
2. Timing and preview finishing; UDS, Samples, Forms, reference and closeout.
3. Deep-state inspection, necessary reference review and exact-head checks.

No merge or production deployment is authorized by this checkpoint. No Actions
files, secrets, infrastructure, branch protections or unrelated previews changed.
