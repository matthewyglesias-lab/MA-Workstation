# Render evaluation deployment status

Verified 15 September 2026. The approved **$7/month Render service is live with Azure SQL and four-digit PIN support**. PINs may contain 4–12 digits; leading zeros are preserved and existing longer PINs remain valid. The full synthetic API acceptance run and an actual Render restart passed on the earlier release, preserving its original session and every captured synthetic record. **All three approved named staff accounts are enrolled, enabled and verified on the live service.** Each account passed four-digit PIN sign-in, identity/role checks, authenticated reads and logout invalidation; no patient or inventory data changed during these checks. The temporary smoke account is disabled and its former PIN is rejected. All temporary administrator firewall rules and temporary enrollment credential artifacts were removed; the final firewall check at **18:54 UTC** showed only the two verified Render ranges.

This is the synthetic evaluation deployment for [PR #67](https://github.com/matthewyglesias-lab/MA-Workstation/pull/67), branch `feat/azure-sql-clinic-console`. The current live deployment is `dep-dakp52p5efls7394ckrg`, running commit `034895e49839080609afd878b7c73630188a6f74`; it became live at **18:48:22 UTC**. This release adds four-digit PIN support. The earlier deployment `dep-daknkah42hec73cg7m10` ran `f72765a48bdfb78106b45a6726fa07063a14fcd4` from **17:04:04 UTC**, and the recorded hosted synthetic workflow/restart checks below exercised that revision. The existing workstation and letter-builder deployments were left unchanged.

## Created resources

| Resource                                 | Verified configuration                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Render workspace                         | My Workspace; `tea-d8k88hnlk1mc73cksp40`                                                    |
| Render service                           | `ipmg-clinic-console`; `srv-dakgjf0u01pc73f30vug`                                           |
| Render compute                           | Ohio; `0.5c-512mb`; one instance; automatic deploys and previews off                        |
| Service dashboard                        | [Render settings and deployment](https://dashboard.render.com/web/srv-dakgjf0u01pc73f30vug) |
| Live application URL                     | <https://ipmg-clinic-console.onrender.com> — SQL/PIN service live                           |
| Azure tenant                             | IPMG / `inlandpsych.com`; `9c6209e9-b979-4c09-9e07-5eeef988516d`                            |
| Azure subscription                       | Azure subscription 1; `c22a36c0-36d7-4d64-ab33-ef38ecb260b2`                                |
| Azure resource group                     | `rg-ipmg-clinic-console`; Central US                                                        |
| SQL server                               | `ipmg-clinic-console-sql.database.windows.net`                                              |
| SQL database                             | `clinic-console`; online; free offer applied; 32 GB; paid overages disabled                 |
| SQL administrator                        | The user's verified Microsoft Entra account; Entra-only authentication                      |
| Runtime application                      | `IPMG Clinic Console Render Runtime`; single tenant; no API permissions                     |
| Runtime application/client ID            | `88c516fe-2d78-4faf-bf37-ef8850269ef7`                                                      |
| Runtime enterprise application object ID | `9dba966b-b0b9-4663-ba60-feb904fb567e`                                                      |
| Permanent test clinic ID                 | `0574d019-3142-4edc-804e-6bf4f33e45e3`; TEST clinic inserted                                |
| Runtime secret                           | Created 15 September 2026; expires 14 March 2027; saved directly to Render by the user      |
| Render health check                      | `/api/health`; saved in dashboard and verified through the service API                      |
| Verified Render outbound ranges          | `74.220.50.0/24`, `74.220.58.0/24`; observed in this service's Connect → Outbound panel     |

SQL uses selected public networks. The permanent target is only the two verified Render outbound ranges; no virtual-network rule or “Allow Azure services and resources” exception was added. These ranges are shared with other Render services in Ohio, so database authentication and the restricted runtime role remain required. No company-wide group or broad Azure access was added. Application access is limited to the approved named accounts and their assigned roles. Existing tenant/subscription administrator authority remains in place.

The exact four-migration schema and named TEST clinic are applied. The database contains explicitly synthetic acceptance records. The temporary account `smoke-render-20260915` is disabled: the SQL cleanup receipt was confirmed, and its formerly valid PIN now receives HTTP 401. Its temporary credential artifacts were removed; staff identity and audit history remain. All three approved named accounts are verified. At **18:54 UTC**, the exact temporary Query Editor rule was explicitly deleted, the earlier Cloud Shell rule was absent, and the final CLI firewall listing contained only `render-ohio-74-220-50` (`74.220.50.0`–`74.220.50.255`) and `render-ohio-74-220-58` (`74.220.58.0`–`74.220.58.255`). The Query Editor tab was closed and temporary enrollment credential/SQL artifacts were deleted. No staff names, account IDs or PIN values are recorded here.

## Completed checks

- Four-digit support in live revision `034895e49839080609afd878b7c73630188a6f74` passed a production build and **12 targeted PIN tests**. Render deployment `dep-dakp52p5efls7394ckrg` became live at **18:48:22 UTC**. The accepted range is 4–12 digits, with leading zeros and longer existing PINs preserved. Named-account enrollment and hosted verification are independently established by the evidence below.
- The [console CI run](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/34947100684) passed console verification and SQL integration for revision `1fda66441aaa133e5af5d7d506de92c38eb1a900`. This is a prior-revision result, not a claim that CI ran on current live `034895e`. The four-digit release has the separate production-build and 12-test evidence above. The hosted workflow and restart evidence below applies to earlier live revision `f72765a`.
- On the earlier revision, an isolated local production build and all 47 unit tests passed. The compiled PIN burst check peaked at approximately 208 MiB with the 192 MiB JavaScript heap cap. This local burst check does not establish sustained hosted capacity.
- Render installed Node 22 and completed the production build and dependency pruning. The first start stopped correctly while `SQL_CLIENT_SECRET` was missing. The user subsequently saved the secret directly into Render; the current deployment started successfully. No secret value belongs in source control or this record.
- [The database bootstrap](../database/bootstrap/render-evaluation.sql) executed successfully in Azure SQL Query Editor as the configured Entra administrator (611 ms; zero staff at bootstrap). It used exact migration sources/checksums, one transaction, an exclusive migration lock, the permanent TEST clinic ID, and only `console_runtime` for the runtime application.
- Separate live permission validation succeeded (742 ms): all four migration checksums and the TEST clinic matched; the external user's SID matched application/client ID `88c516fe-2d78-4faf-bf37-ef8850269ef7`; it had exactly one role, no additional/nested role membership, and no unexpected direct permissions. Under `EXECUTE AS USER='console-app'`, an actual `PinStaff WITH (UPDLOCK,HOLDLOCK)` read succeeded while effective INSERT, UPDATE, and DELETE remained denied. The transaction rolled back and the administrator context was restored.
- Hosted `/api/health` returned HTTP 200, public configuration reported SQL/PIN mode, and protected record endpoints rejected unauthenticated requests with HTTP 401. The sign-in screen was visible in the live browser. Full authenticated API operations succeeded using Render's restricted runtime SQL identity.
- [Synthetic acceptance](render-smoke.md) passed on the live service: `SMOKE-1789492168115-b8d02c44`. Checks covered PIN/session/cookie boundaries, Origin/CSRF enforcement, stock reservation and one consumption, replay safety, stale-version conflicts, amendments/refiling, held/cancelled reservation release, fresh reads, and logout invalidation. One synthetic patient, product and lot, three injection cases, and seven stock movements remain for review. No real medication was administered and no Tebra action was sent.
- A real Render restart was observed at approximately **17:13 UTC**: instance suffix changed from `hh5s2` to `cds5f`, and the replacement logged SQL-mode listening at **17:13:52 UTC**. The session captured at 17:13:18 UTC was reused without signing in again. At **17:14:28 UTC**, the original session still matched, exact canonical synthetic records matched, and logout caused the old cookie to receive HTTP 401.
- Cloud Shell authenticated as the configured administrator and connected to `clinic-console`. The earlier enrollment wrapper passed Bash syntax validation, invokes the original `staff:manage` hidden-PIN command with a 900-second foreground timeout, and has an EXIT cleanup trap scoped only to the exact temporary Cloud Shell firewall rule. The three approved named accounts were subsequently created in one atomic SQL transaction and individually verified. Both administrator firewall exceptions were confirmed absent in the final 18:54 UTC listing.
- All **three approved named staff accounts** were created atomically with `Console.Operator` and `Inventory.Manager`, enabled with credential version 1. Each passed live four-digit PIN authentication, including leading-zero handling, the expected identity and roles, Secure/HttpOnly session cookies and CSRF checks, and authenticated API reads. Null-body probes passed the role guard and reached HTTP 400 validation on injection/product endpoints without creating records. Each logout caused the former session cookie to receive HTTP 401. Read-only SQL receipts showed exactly one creation audit, one successful sign-in and one session per account, with zero unrevoked sessions. These account checks made no patient or inventory changes. Names, account IDs and PINs remain outside this public record.
- Final live-browser verification confirmed the sign-in input is a password field with minimum length 4, maximum length 12 and digit pattern `[0-9]{4,12}`. At **18:54 UTC**, the final SQL firewall list contained only the two verified Render ranges; both temporary administrator rules were absent, the Query Editor tab was closed, and temporary enrollment credential/SQL artifacts were deleted. The all-Azure-services exception remains off and no company-wide group grant was added.
- The initial SQL editor connection encountered a serverless resume delay; a subsequent administrator connection succeeded. The free-offer database was Online with paid overages Disabled. The earlier observed free balance of 99,417 vCore-seconds is a point-in-time observation, not a current balance.

Restart comparisons preserved one patient, one product, one lot, seven movements and three injection cases (zero activities). These hashes describe the synthetic API snapshots, excluding access audit events written by reads:

| Snapshot   | Matching SHA-256 before and after restart                          |
| ---------- | ------------------------------------------------------------------ |
| Overview   | `aa72dadad9d5361eaca1b01e7c3795867c3ee113e88d4a4c47f932adb7385e99` |
| Injections | `d10b3d3ee50a31c869080a0c07ab6d125bb844486ebcdf4445ac62c3a1aa30a7` |
| Combined   | `4450b98e6dd08d8b0568da577af10894ed3cdef6a21ae28e85e2851b6b6f45c6` |

## Remaining activation and acceptance steps

Staff enrollment, individual hosted sign-in/role/logout verification, and temporary access cleanup are complete. Runtime staff-write denials stay in force; there is no shared default PIN or public enrollment bypass.

Complete authenticated live-browser workflow and note/AVS print review, access from a second physical workstation, sustained hosted load testing, and a backup/restore exercise. The verified live sign-in field, API and restart checks do not establish these remaining checks. Failed-attempt lockout testing should use a dedicated test identity rather than an everyday staff account.

Keep the existing health-check path and equivalent build/start settings. The directly created service has an empty root directory and commands prefixed with `cd console &&`; the repository Blueprint uses root directory `console`. Either arrangement builds the same app. Do not apply both at once. Current commands are:

```sh
# Build
cd console && npm ci --include=dev && npm run build && npm prune --omit=dev
# Start
cd console && node --max-old-space-size=192 dist/server/server/main.js
```

Keep one $7 service and the existing free-offer database with paid overages off. The source remains on draft PR #67; automatic deployment and preview replicas are off. The unrelated legacy Static Web App preview-slot failure remains separate from this console deployment. This record establishes a working synthetic evaluation, a deployed four-digit PIN release, and three individually verified named staff accounts. Temporary-firewall and credential-artifact cleanup are complete; the remaining browser/print, second-workstation, sustained-load and backup/restore checks are still open.
