# Architectural contract

Architectural durability is the highest priority. This is a modular monolith: one backend deployment and one transactional database, with bounded modules. Frontend design can evolve independently of clinical rules and persistence.

## Ownership

| System/module              | Owns                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tebra                      | Clinical chart, signed notes, orders, diagnoses, medication list, official appointments                             |
| Patient links              | Internal identity, scoped Tebra identifier, identity verification provenance                                        |
| Work                       | Operational service lifecycle and explicit documentation handoff                                                    |
| Inventory                  | Physical stock balances, reservations, immutable movement history                                                   |
| Platform                   | Authentication, clinic scope, transactions, migrations, command receipts, audit, outbox                             |
| Future clinical assistance | Versioned deterministic guidance using explicitly verified Tebra facts; never autonomous prescribing or chart truth |

UI → `/api/v1` → validated command → domain policy → repository port → Azure SQL. The browser has no database credential. Clinic ID comes from server configuration; requests cannot choose their clinic. Composite foreign keys enforce same-clinic links. Each deployment is assigned one clinic. Before multi-clinic hosting, introduce explicit staff memberships and database row-level access controls rather than accepting a client-provided clinic ID.

`src/shared/contracts.ts` contains version-one DTOs and validators. `src/server/modules` contains pure policy. `platform/repository.ts` is the persistence port. `SqlRepository` is the transactional adapter; `DemoRepository` is synthetic, in-memory development support. Extract module-specific ports/adapters as capabilities grow; modules must not import another module's database implementation.

## Transaction contract

Every mutation requires an `Idempotency-Key` UUID. Azure SQL takes an application lock scoped to clinic/key, checks a SHA-256 fingerprint of operation + actor + normalized input, then performs the command. The domain write, command receipt, audit event and outbox event commit together. Identical retries return the original result; different input or actor under the same key is rejected. Unknown connection outcomes must be retried using the same key. Client retries within an open form preserve this key.

Every stock operation locks its stock bucket before reading reservations or reversal history. Patient reservations are derived from the full movement ledger. The stock balance is a transactionally maintained projection, constrained to `0 <= reserved <= onHand`. A reconciliation check compares it with ledger sums. Corrections append reversal events; a filtered unique index prevents reversing the same entry twice. The restricted runtime role has no UPDATE/DELETE permission on ledger, audit or command receipts.

Activity updates compare `expectedVersion` inside a transaction. A stale screen cannot overwrite a later update. Completion and Tebra filing are independent; filing is a human-confirmed handoff with a reference, not an integration success claim. Generic filed work items stay immutable. Injection addenda append a new event, preserve the original administration, and reopen Tebra filing.

## Identity and access

SQL mode uses explicit `AUTH_MODE=pin` or `AUTH_MODE=entra`. PIN mode verifies individual staff IDs and 6–12 digit PINs with scrypt, SQL-backed attempt limits, revocable opaque secure-cookie sessions, exact-origin checks, and CSRF tokens. Sessions expire after 15 minutes idle or eight hours absolute; the client locks and clears loaded records at five minutes idle. No runtime HTTP endpoint manages staff credentials; use the administrator CLI. See [PIN access](pin-access.md).

Entra mode accepts only signed Entra v2 access tokens with the configured tenant, API audience, approved SPA `azp`, `access_as_user` scope and an allowed app role. The signature, expiry, not-before time and issuer are verified. Token claims are never accepted from unsigned headers. API roles:

| Role              | Permissions                                                  |
| ----------------- | ------------------------------------------------------------ |
| Console.Reader    | Read operational workspace                                   |
| Console.Operator  | Link patients, create/update work, reserve/release/use stock |
| Inventory.Manager | Register products/lots, receive/waste/adjust/reverse stock   |

Roles are explicit and additive; manager does not imply clinical operator. All identities with any listed role can read the clinic workspace. Refine module-specific read permissions before expanding sensitive data scope.

For Entra mode, MSAL handles sign-in; authentication state uses session storage, while patient/work/inventory records are not cached in browser storage. API responses are `no-store`. Logs contain request ID and error type only, not request bodies, patient search terms, tokens or SQL errors. Read access is recorded in AuditEvents. Production uses managed identity to SQL and a distinct migration identity.

## Injection transaction boundary

Injection order and review details use versioned JSON snapshots behind relational clinic/patient/product keys, a unique ordered-occurrence constraint, and a relational stock allocation. Every change appends an immutable case event. Administration freezes identity/order/product/lot/review evidence, consumes its own reserved package units once, and writes an immutable administration record in the same transaction. Held/cancelled cases release allocations; reviewed stock cannot be consumed by generic inventory commands. Stock mutations take a clinic-scoped lock before bucket locks to establish a consistent lock order in this initial implementation. Revisit this serialization if measured clinic throughput requires finer locking.

## Clinical migration strategy

The existing root application's typed engines and legacy compatibility runtime currently differ in authority. Capture reference cases and compare both outputs before moving a rule. Golden fixtures are evidence of prior behavior, not medical authority: clinically significant rules require current source verification and clinic review. Rules and templates will have immutable versions attached to results. Persist confirmed facts separately from suggested values and imported historical context.

Preserve original legacy records during migration, including timestamps, addenda and provenance. Do not interpret browser-local staff labels as authenticated signatures. Reconcile identities against Tebra IDs; ambiguous name/DOB matches go to human review. Import each browser/source separately with repeat-safe import keys and reconcile totals before cutover.

## Extension and recovery

- Add schema changes as new migration files; applied checksums cannot change. Use expand/migrate/contract changes to allow safe application rollback. No automatic destructive down migrations.
- Outbox events include versioned type and entity ID, not patient data. Dispatching is not implemented. A future worker must have retry/backoff, failure visibility and destination deduplication.
- Products/units are explicitly structured. Future fractional inventory uses an approved base-unit representation and migrations, never floating-point assumptions or display-string parsing.
- Keep integrations behind ports: Tebra, kiosk, notifications and document storage can be introduced without rewriting inventory or work.
- Backups are only useful after restoration is demonstrated. Rehearse point-in-time restore, compare ledger/projection totals and command receipts, and verify access restrictions before live cutover.
- Failure to confirm a mutation is not a successful save. A network interruption must never silently become an administration or filed chart note.
- No offline clinical mode exists. Design downtime handling and reconciliation explicitly before supporting offline writes.
