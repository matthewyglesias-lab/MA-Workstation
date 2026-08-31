# Injection workflow API

This standalone Azure Functions app is the trusted bridge between the staff
Power App, the MA Workstation clinical engine, and Dataverse. Canvas may edit
and save a draft, but it cannot declare an injection complete, supply the
clinical clock or actor, or assemble the final note/AVS.

## Connected path

1. Canvas saves the complete evaluation envelope described in
   `../power-platform/README.md` to the Dataverse draft row.
2. `EvaluateInjection` reloads the draft by GUID, captures Dataverse's exact
   opaque weak ETag, validates the public encounter DTO, and runs the shared
   `InjectionEngine`.
3. `FinalizeInjection` reloads the draft by GUID, requires its current weak
   ETag and configured draft status, reruns the engine, rejects stale review,
   stamps the authenticated Entra principal and facility time, and creates the
   chart note and AVS from that same encounter.
4. One conditional Dataverse `PATCH` (`If-Match`) stores the final bundle,
   final status, and idempotency key before the API returns `finalized`.
5. `GetInjectionDocuments` and `GenerateInjectionAvs` reload the stored final
   artifacts for later copy/reprint. Their preview mode is never final.

Routes use the Functions `/api` prefix:

| Operation | Route | Persistence |
| --- | --- | --- |
| Evaluate | `POST /api/v1/injections/evaluate` | None |
| Finalize | `POST /api/v1/injections/finalize` | Atomic Dataverse update |
| Note | `POST /api/v1/injections/documents` | Read final or preview |
| AVS | `POST /api/v1/injections/avs` | Read final or preview |

## Required security boundary

Deploy this as a standalone Function App (or behind APIM), not as an
unauthenticated browser API. The code-level `authLevel: "anonymous"` is
intentional only because App Service Authentication/Easy Auth must validate
the Entra bearer token before the handler runs.

- Require authentication for every route and return 401 for unauthenticated
  requests.
- Configure the Function App's Entra audience to the API application ID used
  by the custom connector.
- Issue the `Injection.ReadWrite` delegated scope or app role and set
  `ENTRA_REQUIRED_ROLE` to the exact claim value.
- Do not expose a second host/path that bypasses Easy Auth or APIM.
- Enable a system-assigned managed identity on the Function App. Add it as a
  Dataverse application user with the smallest role that can read the draft
  columns and update only finalization fields.
- Apply the environment's Power Platform DLP policy to the custom connector.
- Do not log request bodies, encounter JSON, note text, or AVS HTML.

An API key is not a substitute for Entra identity because finalization must be
attributed to an individual staff principal.

### Authorization scope

Every principal holding `ENTRA_REQUIRED_ROLE` can evaluate, finalize, and
retrieve every clinical action this deployment serves — the API does not
enforce per-record or per-facility authorization beyond that single role and
`CLINIC_PROVIDER_REGISTER` being pinned to `san-bernardino-v1`. This build is
therefore deliberately scoped to one facility behind a tightly controlled
Entra app role held only by that facility's injection staff. Expanding to
multiple facilities or a broader staff population without adding real
record/facility-level authorization first would let any role holder act on
any other facility's records; treat that as an explicit blocker to expansion,
not a configuration detail to skip.

## Dataverse table contract

Use one row per selected Injection clinical action. The sample logical names
in `local.settings.example.json` are placeholders.

| Column | Recommended type | Requirement |
| --- | --- | --- |
| Clinical Action ID | Unique identifier | Row primary key; sent as `injectionId` |
| Draft JSON | Multiline text | At least 262,144 UTF-8 bytes; full evaluation envelope; Canvas-writable only while `Draft` |
| Final JSON | Multiline text | At least 900,000 UTF-8 bytes; server-owned; strict schema-validated on every read |
| Workflow Status | Choice or text | Draft and finalized values configured below; server-owned |
| Idempotency Key | Text (200) | Server-owned; bound to the complete finalize request, not just the key string |
| Tebra Acknowledged | Two Options | Board/integration-owned; Canvas-read-only |
| Check-in ID | Unique identifier or text | Board/integration-owned; Canvas-read-only; authoritative over Draft JSON's claimed check-in ID; trimmed, whitespace-only rejected |
| Patient ID | Unique identifier or text | Board/integration-owned; Canvas-read-only; authoritative over Draft JSON's claimed patient ID; trimmed, whitespace-only rejected |
| Order ID | Unique identifier or text | Board/integration-owned; Canvas-read-only; authoritative over Draft JSON's claimed order ID; trimmed, whitespace-only rejected |
| Patient Context JSON | Multiline text | **Required.** Board/integration-owned; Canvas-read-only; `{name, dob, mrn}` protected patient-identity snapshot. Authoritative for every final clinical note and AVS — Canvas-supplied Draft JSON never determines final-document patient demographics. A tenant that has not populated this column on a row cannot evaluate or finalize that row at all (fails closed with `patient-context-invalid`); see "Authoritative patient context" below. |
| Order Context JSON *(optional column; required fields once configured)* | Multiline text | Board/integration-owned; Canvas-read-only; `{medicationKey, dose, orderingProvider, route, intervalKey}` snapshot checked against the encounter on both Evaluate and Finalize when `DATAVERSE_ORDER_CONTEXT_COLUMN` is configured. Once configured, every row must carry a complete, non-blank snapshot — a blank value, `{}`, or a partially populated order fails closed with `order-context-invalid` rather than being treated as "no context to check." |
| Ack Source, Ack At, Ack By, Ack Check-in ID *(optional, all four together)* | Text / DateTime / Unique identifier / Unique identifier | Board/integration-owned; Canvas-read-only; real Tebra acknowledgement provenance recorded on finalization when all four are configured and populated. The API refuses to start if only some of the four are configured (`ackProvenanceColumns` in `api/src/config.ts`). If a row carries only some of the four values, finalization with `acknowledgementKind: "tebra"` fails closed with `acknowledgement-provenance-invalid` rather than silently omitting board provenance. A configured-and-complete acknowledgement is further rejected if its timestamp is not a real UTC instant, is in the future, or its check-in ID does not match the protected Check-in ID column. This provenance is persisted in the stored Final JSON for audit but is intentionally **not** included in the `FinalizeInjectionResponse` public contract (only the authenticated finalizer's own `attestation` is) — a PHI-minimizing choice, not an oversight. |
| Row ETag | Dataverse-managed | Read by the API; never constructed or compared by Canvas |

### Authoritative patient context

`DATAVERSE_PATIENT_CONTEXT_COLUMN` is a required application setting (see
below), not an optional acceptance-gate limitation like order context. This
is a deliberate design choice: the clinical note and AVS must never let
Canvas-supplied Draft JSON determine final-document patient demographics, so
a tenant that has not wired a real, board-owned patient-context column
**cannot start this API at all** — every request fails closed at
configuration load (`service-not-configured`) rather than silently trusting
Draft JSON for patient name/DOB/MRN. Populating this column with a real,
governed patient-identity feed (not a copy of Canvas's own Draft JSON) is a
**mandatory implementation blocker for tenant integration**, not something a
go-live checklist can accept around.

### Reopening a finalized action

The API never overwrites a prior finalization. If a row's Workflow Status is
reset back to the configured draft value while Final JSON or the
Idempotency Key column still holds a value from a previous finalization,
`FinalizeInjection` fails closed with `stale-final-artifact` and performs no
write. A finalized action can only be re-finalized through a separate,
explicit, audited reset/new-action process that this connector does not
implement — for example, creating a new clinical-action row rather than
reusing the old one — never by flipping the status column back to draft on
the same row.

For a Choice status column, put its integer option values in
`DATAVERSE_DRAFT_STATUS_VALUE` and `DATAVERSE_FINAL_STATUS_VALUE`; the host
parses integer settings and writes a number. Text values are also supported.
Do not configure a Choice logical column with labels such as `draft` or
`finalized`—the Web API requires its numeric option values.

Use column security so the clinical modal cannot write Final JSON, Workflow
Status, Idempotency Key, Tebra Acknowledged, Check-in ID, Patient ID, Order
ID, Order Context JSON, or any of the four Ack columns. The existing check-in
board/integration owns all of those columns. The API rejects a Tebra
acknowledgement when the saved flag is false; staff must use the explicit
manual path with reason and source when appropriate. It also rejects a row
that is neither the configured draft status nor a valid replay of an
already-finalized record, and rejects Draft JSON whose claimed check-in,
patient, or order identifier disagrees with the protected columns above — a
reload from Dataverse does not make client-originated Draft JSON
authoritative on its own.

## Application settings

Copy the names from `local.settings.example.json` into Function App settings.
Do not deploy `local.settings.json`.

- Clinic values render the final AVS and resolve the facility-local date.
- `CLINIC_PROVIDER_REGISTER` is intentionally restricted to
  `san-bernardino-v1` in this build.
- `DATAVERSE_URL` must be the HTTPS organization origin.
- Entity-set and column settings must be Dataverse logical names, not Canvas
  display names.
- `DATAVERSE_PATIENT_CONTEXT_COLUMN` is required whenever `DATAVERSE_URL` is
  set — see "Authoritative patient context" above.
- `DATAVERSE_ACK_SOURCE_COLUMN`, `DATAVERSE_ACK_AT_COLUMN`,
  `DATAVERSE_ACK_BY_COLUMN`, and `DATAVERSE_ACK_CHECKIN_ID_COLUMN` must be
  either all set or all left unset; a partial set fails configuration load.

The managed identity requests the Dataverse `/.default` scope; no Dataverse
client secret belongs in this project.

## Build and verify

```bash
npm ci --prefix api
npm run typecheck --prefix api
npm test --prefix api
npm run build --prefix api
npm audit --prefix api --omit=dev
npx --yes @apidevtools/swagger-cli@4 validate power-platform/connector/apiDefinition.swagger.yaml
```

Deploy the `api` directory only after the build creates
`api/dist/api/src/index.js`. Import
`../power-platform/connector/apiDefinition.swagger.yaml` after replacing its
host and Entra placeholders. Then remove and re-add the connector data source
in Power Apps so Studio refreshes operation signatures.

## Release gates

Do not describe the workflow as clinically live until all of these are true in
the target environment:

- Easy Auth rejects a missing/invalid token and a user without the required
  role or scope.
- Managed identity can read and conditionally update only the intended
  Dataverse table.
- A Canvas draft round-trip evaluates by ID, returns the exact opaque ETag,
  and finalizes with that same token.
- A changed row, stale fingerprint, non-draft status, clinical stop, or missing
  manual acknowledgement fails closed.
- A Draft JSON check-in/patient/order identifier that disagrees with the
  protected Dataverse columns fails closed with `source-identity-mismatch`,
  and — where `DATAVERSE_ORDER_CONTEXT_COLUMN` is configured — an encounter
  that disagrees with the linked order (medication, dose, ordering provider,
  route, or interval) fails closed too, on both Evaluate and Finalize.
- Every final clinical note and AVS carry the protected Patient Context
  JSON's name/DOB/MRN, never Draft JSON's — see "Authoritative patient
  context" above.
- A Tebra acknowledgement fails unless the authoritative clinical-action row
  is marked acknowledged by the check-in board path. Real board
  acknowledgement provenance (when configured) is validated independently —
  partial, malformed, future-dated, or check-in-mismatched provenance fails
  closed rather than being attached to the finalized record.
- Repeating the same finalization key **and** request content replays the
  stored result; reusing the key with a different ETag, evaluation
  fingerprint, acknowledgement data, or authenticated principal returns
  `409 idempotency-conflict`.
- A record whose status reads Draft but still carries a residual Final JSON
  payload or Idempotency Key from a previous finalization fails closed with
  `stale-final-artifact` instead of being finalized over — see "Reopening a
  finalized action" above.
- A stored final record is validated against the strict stored-final schema
  before every retrieval or replay; a malformed, incomplete, non-final
  (including reopened/voided), or identity-mismatched record is rejected
  rather than echoed. Identity binding covers the requested action ID, the
  envelope's own injectionId/source.actionId, source.checkInId/patientId/
  orderId against the protected Dataverse columns, and the envelope's
  idempotencyKey against the protected Dataverse Idempotency Key column —
  the same shared check for finalize replay, note retrieval, and AVS
  retrieval alike.
- Final note and AVS are reviewed against the MA Workstation output and share
  the stored final fingerprint/reference version, and the stored envelope's
  `noteTemplateVersion`/`avsTemplateVersion` are persisted for audit
  reconstruction.
- Every AVS preview — any disposition — reads `"STAFF PREVIEW - NOT FINAL"`;
  only a successful finalize response reads `"PATIENT COPY"` or
  `"CARE HANDOFF"`.
- UDS/TMS remain visibly unavailable, Spanish AVS remains blocked, and the
  HTML AVS print surface is accepted for the clinic's workflow.
- The deployment is confirmed single-facility with a tightly controlled
  injection-staff Entra role before go-live; broader record/facility
  authorization is added first if the deployment ever needs to expand beyond
  that scope (see "Authorization scope" above).

This connector does not write into Tebra. `tebra` acknowledgement means the
existing check-in board supplied a verified check-in state; a manual path
requires reason and source. Any future Tebra API write-back requires a separate
approved integration and reconciliation design.

## Microsoft references

- [App Service/Functions Microsoft Entra authentication](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad)
- [Power Platform custom connector Entra authentication](https://learn.microsoft.com/en-us/connectors/custom-connectors/azure-active-directory-authentication)
- [Dataverse conditional operations and opaque ETags](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api)
- [Power Fx Patch return value](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/function-patch)
