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
| Permanent test clinic ID                 | `0574d019-3142-4edc-804e-6bf4f33e45e3`; TEST clinic inserted                                |
| Runtime secret                           | Created 15 September 2026; expires 14 March 2027; transfer to Render pending                |
| Render health check                      | `/api/health`; saved in dashboard and verified through the service API                      |
| Verified Render outbound ranges          | `74.220.50.0/24`, `74.220.58.0/24`; observed in this service's Connect → Outbound panel     |

SQL uses selected public networks. The two verified Render outbound ranges have been saved; no virtual-network rule or “Allow Azure services and resources” exception was added. These ranges are shared with other Render services in Ohio, so database authentication and the restricted runtime role remain required. No company-wide group or staff access was added. Existing tenant/subscription administrator authority remains in place. The schema and TEST clinic are applied; staff count is zero and no patient data is present. The temporary exact administrator firewall rule was removed after bootstrap and permission checks.

## Completed checks

- The [console CI run](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/34947100684) passed console verification and SQL integration checks for the deployed revision.
- An isolated local production build and all 47 unit tests passed. The compiled PIN burst check peaked at approximately 208 MiB with the 192 MiB JavaScript heap cap.
- Render installed Node 22, completed the production build and dependency pruning, and reported zero dependency audit vulnerabilities. Deployment `dep-dakgjfgu01pc73f312bg` then failed at startup with `SQL_CLIENT_SECRET is required for the SQL app identity.`
- [The database bootstrap](../database/bootstrap/render-evaluation.sql) was executed successfully in the Azure SQL Query Editor as the configured Entra administrator (611 ms; final receipt: zero enrolled staff). It uses the exact four migration sources and checksums, a transaction, an exclusive migration lock, the permanent TEST clinic ID, and only the `console_runtime` database role for the runtime application.
- A separate live validation succeeded (742 ms): all four migration checksums and the TEST clinic matched; the external user's SID matched application/client ID `88c516fe-2d78-4faf-bf37-ef8850269ef7`; it had exactly one role, no additional/nested role membership, and no unexpected direct permissions. Under `EXECUTE AS USER='console-app'`, the real `PinStaff WITH (UPDLOCK,HOLDLOCK)` read succeeded while effective INSERT, UPDATE, and DELETE permissions remained denied. The test transaction rolled back and the administrator context was restored. This verifies database permissions; an external app-identity login and a full staff PIN login remain pending.
- The first SQL editor connection reported temporary database unavailability. After the serverless database resumed, the overview showed Online, paid overages Disabled, and 99,417 free vCore-seconds remaining. The subsequent administrator connection succeeded.
- The [synthetic acceptance script](render-smoke.md) passed complete local demo runs with both an injected PIN and the hidden interactive prompt. It checks authentication, inventory and injection workflows, replay/conflict handling, amendments, filing, reservation release, and logout. Local success does not verify Render or Azure SQL.

## Remaining activation steps

Azure and Render browser sign-ins have been restored. The runtime secret exists in Azure, but automatic approval review rejected reading its value from the browser and saving it locally because it is protected credential material. No value was obtained or transferred to Render. The user must copy the secret's **Value** directly from Azure to Render's `SQL_CLIENT_SECRET` setting. An empty, unsaved row with that key is prepared in Render; use **Save only** after entering the value. Do not paste the secret in chat, a shell command, source code, or this record.

1. Complete the direct secret transfer described above. Verify the existing tenant, application, and service IDs before making changes; do not create replacement resources. Render already has the non-secret SQL, clinic, PIN-auth, and Node settings.
2. Verify login and application operations using the restricted runtime identity. Check its role membership, denied direct PIN updates, and the persistent PIN authentication transaction. Exercise a real staff lookup or full PIN login; `SELECT TOP(0)` can optimize away table access and does not prove the locking query works. The existing integration suite is not a substitute for this restricted-identity check.
3. Enroll a named evaluation staff account using the administrator's `npm run staff:manage` hidden PIN prompt. No shared default production PIN exists. Remove any temporary administrator network access after setup.
4. Keep the existing health-check path and equivalent build/start settings. The direct-created service has an empty root directory and commands prefixed with `cd console &&`; the repository Blueprint uses root directory `console`. Either arrangement builds the same app. Do not apply both at once. Current commands are:

   ```sh
   # Build
   cd console && npm ci --include=dev && npm run build && npm prune --omit=dev
   # Start
   cd console && node --max-old-space-size=192 dist/server/server/main.js
   ```

5. Trigger one deployment after SQL and the credential are ready. Run the [synthetic acceptance script](render-smoke.md) to check health, unauthorized access, PIN sign-in, inventory reservation/consumption, idempotent retries, stale-version conflicts, amendments, and filing. Separately verify records and active sessions across a real service restart, then verify logout revokes the session. Reopen from a second workstation before calling the evaluation ready.

Keep one $7 service and the existing no-overage database. The source remains on draft PR #67; automatic deployment is off. The unrelated legacy Static Web App preview-slot failure remains separate from this console deployment.
