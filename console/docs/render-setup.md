# Render + Azure SQL

Prepared evaluation target: **one $7/month Render web service + Azure SQL's recurring free offer**. Not yet deployed.

**Use synthetic data only on this low-cost profile.** Render requires a HIPAA-enabled Scale or Enterprise workspace before an application processes patient PHI, even when the database is hosted in Azure. Current Scale pricing is $499/month plus compute, with an additional 20% usage fee for HIPAA-enabled workspaces. A BAA and completed workspace enablement are required. This corrects the earlier $7 clinic-hosting estimate: the affordable Render profile is for evaluation, not live patient work. No workspace upgrade, BAA acceptance or paid resource has been performed. See Render's [HIPAA requirements](https://render.com/docs/hipaa-compliance) and [workspace pricing](https://render.com/docs/new-workspace-plans).

## Deploy the application

Use the repository-root `render.yaml` from `feat/azure-sql-clinic-console`. It builds only `console/`, serves the frontend and API at the same HTTPS origin, pins Node 22, and selects `0.5c-512mb` (one instance) in Ohio, near the proposed Central US SQL database. The original workstation and letter builder keep their existing deployments.

No Render database, persistent disk, paid workspace upgrade, or preview replica is specified. Auto-deploy is off while the source is on the draft PR branch. After launch, use the reviewed release branch; the separate legacy Static Web App staging-quota failure needs resolution/scoping before `checksPass` can be used for automatic deployment.

| Setting        | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| Repository     | `matthewyglesias-lab/MA-Workstation`                            |
| Branch         | `feat/azure-sql-clinic-console`                                 |
| Root directory | `console`                                                       |
| Build          | `npm ci --include=dev && npm run build && npm prune --omit=dev` |
| Start          | `node --max-old-space-size=192 dist/server/server/main.js`      |
| Health check   | `/api/health`                                                   |
| Compute        | `0.5c-512mb`, one instance                                      |
| Region         | Ohio                                                            |
| Staff sign-in  | Individual PIN                                                  |

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. The latter is the exact allowed HTTPS origin unless a custom `PUBLIC_ORIGIN` is explicitly set. This value never comes from request headers.

The Blueprint prompts for `CLINIC_ID`, `SQL_SERVER`, `SQL_TENANT_ID`, `SQL_CLIENT_ID`, and `SQL_CLIENT_SECRET`. Generate one permanent clinic UUID and use it consistently in Render and `dbo.Clinics`. The database name is `clinic-console`.

## Provision the free database

Use **`infra/sql-for-render.bicep`**, not `infra/main.bicep`. It creates only SQL, backup retention and explicit firewall rules. It creates no App Service, VNet, private endpoint or private DNS.

The database is General Purpose serverless Gen5 (0.5–2 vCores, 32 GB), with a 60-minute idle pause, local backup redundancy, seven-day retention, `useFreeLimit=true` and `freeLimitExhaustionBehavior=AutoPause`. Verify that Azure displays the free offer and overage billing disabled. A free database must be created with the offer applied; the offer cannot be applied to an existing paid database.

Render connects through SQL's **public TLS endpoint**. Obtain the actual service's IPv4 ranges under **Connect → Outbound** and allow only those ranges in Azure SQL. Render's default ranges are shared with other customers in that region, so a firewall match does not authenticate an application. Do not add all-internet or “Allow all Azure services” rules. The template's default empty range list allows no public clients. Dedicated Render outbound IPs are a separately billed higher-plan feature and are outside this deployment.

## Entra identity and first bootstrap

1. Create a single-tenant Entra app named **IPMG Clinic Console Render Runtime**, with no redirect URI and no Microsoft Graph/API permission grants. Its application/client ID goes into Render. Its enterprise application's object ID is used for the SQL user; these are different IDs.
2. Keep the app secret only in Render's secret environment settings and the administrator's approved credential store. Record and manage its expiry. Never place it in git, a build command, browser code, chat or a shared document. The runtime uses the SQL driver's supported `azure-active-directory-service-principal-secret` authentication; an Azure App Service managed identity is unavailable on Render.
3. From an administrator's Entra-authenticated workstation, add a temporary exact workstation IP to SQL's firewall. Use default Azure credential mode on that workstation and run `npm run db:migrate`. Keep the runtime credential separate.
4. Insert the permanent clinic ID. Create a SQL contained user for the verified **enterprise application object ID** using SID/TYPE syntax, and grant only `console_runtime`. The SID example in [deployment readiness](deployment-readiness.md) applies with that object ID. The runtime must never be SQL administrator or `db_owner`.
5. Enroll named staff using `npm run staff:manage` and its hidden PIN prompt from the administrator's workstation. Remove its temporary SQL firewall rule after bootstrap. Do not place administrator credentials in Render or run migrations with the runtime identity.
6. Enter the runtime environment values for an empty evaluation database, deploy the verified commit and run a synthetic smoke test. Verify saved synthetic patient/injection records survive reload and service restart, and reopen them from a second workstation. Exercise locks, reservation/consumption, duplicate retry, amendments and separate Tebra filing. Do not connect a database containing real patient data to the low-cost evaluation workspace.

## Capacity and launch boundaries

PIN hashes keep the same scrypt strength. One calculation runs at a time, with a bounded queue; overload returns a retryable busy response. The JS heap is capped at 192 MiB to leave room for native hashing memory. The SQL pool has four connections maximum, zero minimum and a 30-second idle timeout. `scripts/check-pin-memory.mjs` checks a compiled-code sign-in burst, overload handling, recovery and peak memory. It includes the SQL driver's loaded modules, but uses synthetic repositories: Render CPU/memory metrics and simultaneous live SQL sign-ins still need verification.

The API conservatively ignores forwarding headers. Until Render's actual proxy chain is verified, IP limits can group clients behind the same proxy; staff-specific attempt limits still apply. Do not enable blanket `trustProxy=true`. Verify and explicitly bound the trusted proxy path first.

`/api/health` does not query SQL, so host probes do not keep it awake. Connection establishment allows up to 60 seconds for SQL to resume. An unconfirmed save must be retried with its retained idempotency key.

SQL's 100,000 monthly free vCore-seconds can be exhausted; it then pauses until next month. Paid Render hosting does not remove that limit. Live provisioning, identity setup, staff enrollment, recovery verification and deployed acceptance checks remain pending. Reconcile actual stock and Tebra identifiers before clinic use. Tebra remains the clinical record.

## References

- [Render pricing](https://render.com/pricing)
- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render environment variables](https://render.com/docs/environment-variables)
- [Outbound addresses](https://render.com/docs/outbound-ip-addresses)
- [Azure SQL free offer](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql)
- [Entra service principals and Azure SQL](https://learn.microsoft.com/en-us/azure/azure-sql/database/authentication-aad-service-principal?view=azuresql)
