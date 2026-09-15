# Render evaluation deployment status

Verified 15 September 2026. The approved **$7/month Render service is created and its production build passed**. Azure SQL's free-offer database is online. **The application is not live:** its first start correctly stopped because `SQL_CLIENT_SECRET` is not configured. No staff login or persistent record workflow has been verified on the hosted service.

This is the synthetic evaluation deployment for [PR #67](https://github.com/matthewyglesias-lab/MA-Workstation/pull/67), branch `feat/azure-sql-clinic-console`. The deployed build used commit `1fda66441aaa133e5af5d7d506de92c38eb1a900`. The existing workstation and letter-builder deployments were left unchanged.

## Created resources

| Resource                                 | Verified configuration                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Render workspace                         | My Workspace; `tea-d8k88hnlk1mc73cksp40`                                                    |
| Render service                           | `ipmg-clinic-console`; `srv-dakgjf0u01pc73f30vug`                                           |
| Render compute                           | Ohio; `0.5c-512mb`; one instance; automatic deploys and previews off                        |
| Service dashboard                        | [Render settings and deployment](https://dashboard.render.com/web/srv-dakgjf0u01pc73f30vug) |
| Reserved application URL                 | <https://ipmg-clinic-console.onrender.com> — not yet usable                                 |
| Azure tenant                             | IPMG / `inlandpsych.com`; `9c6209e9-b979-4c09-9e07-5eeef988516d`                            |
| Azure subscription                       | Azure subscription 1; `c22a36c0-36d7-4d64-ab33-ef38ecb260b2`                                |
| Azure resource group                     | `rg-ipmg-clinic-console`; Central US                                                        |
| SQL server                               | `ipmg-clinic-console-sql.database.windows.net`                                              |
| SQL database                             | `clinic-console`; online; free offer applied; 32 GB; paid overages disabled                 |
| SQL administrator                        | The user's verified Matthew Yglesias Entra account; Entra-only authentication               |
| Runtime application                      | `IPMG Clinic Console Render Runtime`; single tenant; no API permissions                     |
| Runtime application/client ID            | `88c516fe-2d78-4faf-bf37-ef8850269ef7`                                                      |
| Runtime enterprise application object ID | `9dba966b-b0b9-4663-ba60-feb904fb567e`                                                      |
| Permanent test clinic ID                 | `0574d019-3142-4edc-804e-6bf4f33e45e3` — not yet inserted                                   |

The SQL firewall was inspected after creation: selected public networks, no IP rules, no virtual-network rules, and “Allow Azure services and resources” unchecked. No company-wide group or staff access was added. Existing tenant/subscription administrator authority remains in place. No application secret, staff PIN, schema, or patient data has been written to SQL.

## Completed checks

- The [console CI run](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/34947100684) passed console verification and SQL integration checks for the deployed revision.
- An isolated local production build and all 47 unit tests passed. The compiled PIN burst check peaked at approximately 208 MiB with the 192 MiB JavaScript heap cap.
- Render installed Node 22, completed the production build and dependency pruning, and reported zero dependency audit vulnerabilities. Deployment `dep-dakgjfgu01pc73f312bg` then failed at startup with `SQL_CLIENT_SECRET is required for the SQL app identity.`
- [The database bootstrap](../database/bootstrap/render-evaluation.sql) is prepared from the exact four migration sources. It uses checksum checks, a transaction, an exclusive migration lock, the permanent TEST clinic ID, and only the `console_runtime` database role for the runtime application. Its embedded sources were checked against the originals; it has not been executed against SQL.
- The [synthetic acceptance script](render-smoke.md) passed complete local demo runs with both an injected PIN and the hidden interactive prompt. It checks authentication, inventory and injection workflows, replay/conflict handling, amendments, filing, reservation release, and logout. Local success does not verify Render or Azure SQL.

## Remaining activation steps

Azure browser input stopped responding during credential setup. A fresh Azure tab requires sign-in; the Render dashboard also requires sign-in. The connected Render API remains available, but does not expose outbound IPs or the health-check setting. These account sessions are the current blocker, not missing authorization for the approved deployment.

1. Restore Azure and Render dashboard sign-in. Verify the tenant, existing application registration, and service IDs above before making changes; do not create replacement resources.
2. Create an expiring runtime application secret and store it only in Render's `SQL_CLIENT_SECRET` secret setting and an approved credential store. Record its expiry without recording its value. Render already has the non-secret SQL, clinic, PIN-auth, and Node settings.
3. Read the actual service's **Connect → Outbound** IPv4 ranges and allow only those ranges on the SQL server. Add an exact, temporary administrator client IP only if needed for bootstrap, then remove it. Keep the all-Azure-services exception off.
4. Run the full [evaluation bootstrap](../database/bootstrap/render-evaluation.sql) as the configured SQL Entra administrator in `clinic-console`. The contained application SID must derive from the **application/client ID**, resulting in `0xfe16c588782daf4fbf37ef8850269ef7`; the enterprise application's object ID is not the SID input for this SQL syntax.
5. Verify login and application operations using the restricted runtime identity. Check its role membership, denied direct PIN updates, and the persistent PIN authentication transaction. Exercise a real staff lookup or full PIN login; `SELECT TOP(0)` can optimize away table access and does not prove the locking query works. The existing integration suite is not a substitute for this restricted-identity check.
6. Enroll a named evaluation staff account using the administrator's `npm run staff:manage` hidden PIN prompt. No shared default production PIN exists. Remove temporary administrator network access after setup.
7. Set Render's health-check path to `/api/health`. The direct-created service currently has an empty root directory and equivalent commands prefixed with `cd console &&`; the repository Blueprint uses root directory `console`. Either arrangement builds the same app. Do not apply both at once. Current commands are:

   ```sh
   # Build
   cd console && npm ci --include=dev && npm run build && npm prune --omit=dev
   # Start
   cd console && node --max-old-space-size=192 dist/server/server/main.js
   ```

8. Trigger one deployment after SQL and the credential are ready. Run the [synthetic acceptance script](render-smoke.md) to check health, unauthorized access, PIN sign-in, inventory reservation/consumption, idempotent retries, stale-version conflicts, amendments, and filing. Separately verify records and active sessions across a real service restart, then verify logout revokes the session. Reopen from a second workstation before calling the evaluation ready.

Keep one $7 service and the existing no-overage database. The source remains on draft PR #67; automatic deployment is off. The unrelated legacy Static Web App preview-slot failure remains separate from this console deployment.
