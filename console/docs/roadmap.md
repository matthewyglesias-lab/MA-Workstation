# Build roadmap and release boundaries

## Foundation delivered in this branch

Independent console package, Azure SQL schema/migration runner, modular API, identity links, operational service lifecycle, Tebra handoff tracking, inventory transaction engine, synthetic UI, test suites and Azure infrastructure source. The existing production app is not replaced.

## Next increment: operational readiness

1. Replace the bounded overview bootstrap with paginated module queries and server-side patient/product/lot search. Add individual-record retrieval, stale-data indicators and staff update refresh.
2. Persist/recover pending mutation keys across page reloads, add unknown-save reconciliation, signed-out screen clearing and full Entra browser-flow testing in a real test tenant.
3. Add patient identity re-verification, demographic correction history and duplicate-link reconciliation with Tebra. No auto-merge based only on name/DOB.
4. Add inventory quarantine/release controls, count sessions, linked transfers/returns, source/supplier records, and lot expiry conventions. Track patient supply separately from clinical billing assumptions.
5. Add an explicit reference between stock use and its operational service activity; display whether Tebra documentation was reconciled. Preserve the distinction between recorded inventory use and an authoritative administration record.
6. Add append-only work/handoff corrections and auditable patient/work details screens.

## Clinical vertical slice

Migrate one complete injection workflow: verify patient/order/history against Tebra; evaluate versioned clinical rules; record today's screening; reserve correct supply; prepare documentation/AVS; record stock disposition; explicitly reconcile Tebra filing. Test scheduled/initiation/missed/held/declined/error cases. Match the existing workstation's proven capabilities before clinical cutover.

## Broader clinic engine

UDS, samples, TMS workflow support, forms, calls, referrals, authorization tracking, follow-up tasks, inventory replenishment and expiry/recall worklists. Integrate kiosk/QR/staff arrivals through one queue, with a migration plan for existing CheckIns data and Teams acknowledgements.

## Release evidence required

Real Azure SQL test deployment and migration execution; Entra role matrix; application/SQL negative access tests; simultaneous-user tests; clinical parity and source review; patient-switch protection; note/AVS print validation; backup restoration; downtime procedure; migration reconciliation; staff pilot. Use synthetic data until the clinic's deployment and access requirements are met. No clinical readiness claim based only on a passing frontend build.
