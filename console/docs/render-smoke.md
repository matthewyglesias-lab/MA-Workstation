# Synthetic Render acceptance

Run only after SQL bootstrap, staff enrollment and deployment have completed. The target must contain synthetic evaluation data only. This script checks the running API through the application's configured runtime SQL identity. The test staff account needs both `Console.Operator` and `Inventory.Manager`.

From `console/`, using Node 22 or newer:

```sh
CONSOLE_SMOKE_SYNTHETIC=YES node scripts/smoke-render.mjs
```

The default target is `https://ipmg-clinic-console.onrender.com`. The script prompts for a staff code and a hidden PIN. `CONSOLE_SMOKE_STAFF_CODE` can supply the staff code. For an unattended run, inject `CONSOLE_SMOKE_PIN` from an approved secret environment; do not write the PIN in a shell command, source file, log, or shared document. The script never prints the PIN, cookie or CSRF token. `CONSOLE_SMOKE_URL` can select another exact HTTPS origin; plain HTTP is accepted only for a loopback demo using PIN authentication.

`CONSOLE_SMOKE_SYNTHETIC=YES` explicitly confirms the database is an evaluation target. The script also checks that a remote API reports SQL/PIN mode, or demo/PIN mode for a local loopback target. It cannot independently prove that the database contains no real patient data.

The run checks unauthenticated access, Origin and CSRF enforcement, session-cookie attributes, stock receipt/reservation/consumption, injection administration, identical-key replay, stale-version and changed-key-content conflicts, immutable amendments, separate filing acknowledgments, held/cancelled reservation release, fresh-read persistence and logout revocation. It uses simulated review details and filing references; it never contacts Tebra or represents a real medication administration.

Each run retains one clearly labeled `SMOKE-...` patient, product and lot, plus three injection cases: one administered/amended/refiled, one held and one cancelled. The lot ends with one synthetic unit on hand and none reserved. Nothing is deleted. A failed run may retain partial work, and an unconfirmed network response must not be assumed saved. Rerunning creates a distinct test set. The script attempts to revoke its session even after failure.

Exit code `0` means the listed API checks passed; exit code `1` identifies the failed stage without printing sensitive responses. Service-restart persistence, access from another workstation, browser/print layout, failed-login lockout and live Render capacity require separate checks. Do not run lockout tests against a staff member's everyday account.

To validate against a local demonstration API, start the existing console with `CONSOLE_MODE=demo`, `AUTH_MODE=pin`, a clinic UUID and loopback host/port. Set `CONSOLE_SMOKE_URL=http://127.0.0.1:3100`; use the documented local demo credentials through the prompt. Local success does not verify Azure SQL or Render.
