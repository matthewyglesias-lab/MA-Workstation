# Staff PIN access

Each staff member signs in with their own staff code and 4–12 digit PIN. Leading zeros are preserved, and existing longer PINs continue to work. The browser can remember the staff code; it must never save a PIN or session token in web storage. A returning staff member enters only their PIN. **Change staff** returns to code entry. Roles and audit identity belong to the individual account.

## Azure configuration

```dotenv
CONSOLE_MODE=sql
AUTH_MODE=pin
PUBLIC_ORIGIN=https://YOUR-CONSOLE.azurewebsites.net
CLINIC_ID=YOUR-CLINIC-UUID
CLINIC_TIMEZONE=America/Los_Angeles
SQL_SERVER=YOUR-SERVER.database.windows.net
SQL_DATABASE=clinic-console
```

`PUBLIC_ORIGIN` must be the exact HTTPS origin, with no trailing slash or path. Production PIN access requires HTTPS, the SQL store, and explicit configuration. Entra IDs are unnecessary in PIN mode. Managed identity still authenticates the API to Azure SQL. There is no default staff account, shared PIN, production demonstration bypass, or automatic credential provisioning.

The existing Microsoft option remains available with `AUTH_MODE=entra` and `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_WEB_CLIENT_ID`. It uses the existing application roles. Changing staff sign-in does not change SQL authentication.

## Create the first account

1. Apply all migrations with the separate database administrator/migration identity: `npm run db:migrate`.
2. Create the clinic row using the deployment instructions before creating staff.
3. From an administrator terminal with the same SQL server/database/clinic configuration, run `npm run staff:manage`.
4. Choose `create`, enter a staff code and name, assign roles, then enter and repeat the hidden PIN. The PIN is never passed as an argument, printed, or stored in source control.

Available roles are `Console.Reader`, `Console.Operator`, and `Inventory.Manager`. An MA normally receives `Console.Operator`; the inventory lead additionally receives `Inventory.Manager`. Assign both where both are needed. The runtime SQL role cannot create, reset, disable, or change staff accounts. Run account management with the separate administrator identity.

`reset` replaces the PIN/name/roles, re-enables an account, and revokes existing sessions. `disable` prevents sign-in and revokes sessions. `revoke` ends all sessions without changing the PIN. Every administration action is recorded with the database administrator identity. Do not share personal PINs.

## Session and attempt controls

- PINs use a fresh 128-bit salt and scrypt (`N=131072, r=8, p=1`), with 256-bit derived keys. Repeated, sequential, and common PIN patterns are rejected during provisioning.
- Opaque 256-bit session tokens are generated after successful authentication. SQL stores only their SHA-256 hashes. The browser receives a `__Host-console_session` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`.
- Sessions expire after 15 minutes without a request or 8 hours total. The database checks expiry, disabled state, and credential version on every authenticated request. Reset/revocation takes effect across all running API instances.
- Sign-in allows five attempts per staff code and twenty per socket IP within fifteen minutes. SQL transactions and ordered application locks enforce these limits across multiple instances. Blocked attempts do not extend an existing lock indefinitely. All attempts, including unknown accounts, receive the same failure response.
- Login requires an exact approved Origin. Authenticated mutations and logout also require a session-bound CSRF token. Forwarded headers are not trusted for client IP. On Azure, users behind the same platform peer may share the IP limit; staff-specific limits still apply. Configure trusted proxy behavior only after establishing a verified network boundary, never by accepting arbitrary forwarding headers.
- Logs do not contain PINs, session tokens, patient data, or raw IP addresses. A dedicated SQL access-event table records success, failure, throttling, and account administration.

The PIN mechanism implements the requested daily access pattern. The deployed clinic still needs its own access review, administrator custody, device controls, backup recovery, and operating acceptance before real patient use. This implementation does not represent a certification.

## Local fictional demo

```dotenv
CONSOLE_MODE=demo
AUTH_MODE=pin
CLINIC_ID=11111111-1111-4111-8111-111111111111
HOST=127.0.0.1
PORT=3100
```

Use staff code **demo**, PIN **123456**. Demo credentials exist only in the local synthetic adapter; SQL mode never creates or accepts that account automatically. Local development accepts origins on loopback port 3100 (or configured `PORT`) and Vite port 5175. Its cookie is called `console_demo_session`, is HTTP-only, and is deliberately limited to non-production loopback mode. `AUTH_MODE=demo` is an explicit local test-harness bypass; it is rejected by SQL configuration.

## API contract

- `POST /api/auth/pin`: JSON `{ "staffCode": "...", "pin": "..." }`; returns `{ actor, csrfToken }` and sets the session cookie.
- `GET /api/v1/session`: returns `{ actor, csrfToken }`. A missing, expired, disabled, or revoked session returns HTTP 401.
- All POST/PATCH/DELETE requests include the exact `Origin` and `X-CSRF-Token`; existing idempotency keys remain required for clinical/inventory commands.
- `POST /api/auth/logout`: revokes the server session and expires its cookie. Clear the UI and any in-memory patient data after sign-out.

## References

The hashing settings follow the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Cookie, timeout, and CSRF controls are informed by the [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
