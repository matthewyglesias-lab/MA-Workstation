# Injection console deployment readiness

Status checked 15 September 2026. **Prepared, not deployed.** The new console has no live Azure SQL environment yet. A synthetic preview can verify the screens but cannot preserve clinic records.

## Confirmed environment

The authenticated Azure portal is in the IPMG directory (`inlandpsych.com`), with **Azure subscription 1** selected. All resources currently lists four Static Web Apps: MA-Workstation, ipmg-letter-builder, IPMG-CALL-LOG, and IPMG-Intakes. No existing SQL server, App Service plan, or virtual network is visible in that subscription. Subscription and tenant GUIDs were verified in the portal and should be placed in deployment parameters outside git.

The existing workstation is in resource group `ipmg-ma_workstation`, Central US, on the Free Static Web Apps plan. Its production deployment is ready; it remains the original app. Its three preview environments belong to already merged PRs #21, #29, and #57. They were inspected and left unchanged. This is why PR #67's old-app deployment fails with the staging-environment limit. Reclaiming one slot can restore the original app's PR preview, but does not deploy this console's API or SQL database.

At commit `845a139596cfd0a228539258ea684fa8d19c49b3`, the [console foundation workflow passed](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/34941421889). That result precedes the injection and PIN changes; their final revision needs its own passing checks. The [old-app workflow](https://github.com/matthewyglesias-lab/MA-Workstation/actions/runs/34941421932) passed build, browser, visual, and print tests, then failed only at Azure deployment.

## Proposed resources and cost

Use a separate resource group **`rg-ipmg-clinic-console`** in **Central US**, matching the existing app deployments. Proposed name prefix **`ipmg-clinic-console`** is subject to Azure global name availability. Keeping US data residency is an explicit property of this proposal; it does not establish the clinic's complete data-retention policy.

| Resource               | Initial configuration                                | Approximate monthly USD |
| ---------------------- | ---------------------------------------------------- | ----------------------: |
| Linux App Service plan | B1, one instance; Node 22 frontend and API           |                  $13.14 |
| Azure SQL Database     | Single Basic, 5 DTU, 2 GB                            |                   $4.90 |
| SQL private endpoint   | One endpoint                                         |                   $7.30 |
| Private DNS            | One private zone                                     |                   $0.50 |
| **Base total**         | **730 compute hours; SQL normalized to 730/24 days** |              **$25.84** |

These are Microsoft public retail rates retrieved 15 September 2026, before tax, traffic, extra retention, monitoring, or subscription-specific discounts. SQL and App Service are separate recurring charges. Private Link additionally charges $0.01/GB at the initial ingress/egress tier; private DNS queries are $0.40 per million. No paid resources have been created.

Rates and reproducible source queries:

- Linux B1: $0.018/hour, Central US. [Microsoft Retail Prices API](https://prices.azure.com/api/retail/prices?%24filter=productName%20eq%20%27Azure%20App%20Service%20Basic%20Plan%20-%20Linux%27%20and%20armRegionName%20eq%20%27centralus%27%20and%20skuName%20eq%20%27B1%27).
- SQL Single Basic: $0.161/day, Central US. [Microsoft Retail Prices API](https://prices.azure.com/api/retail/prices?%24filter=productName%20eq%20%27SQL%20Database%20Single%20Basic%27%20and%20armRegionName%20eq%20%27centralus%27%20and%20skuName%20eq%20%27B%27).
- Private endpoint: $0.01/hour, Global meter. [Microsoft Retail Prices API](https://prices.azure.com/api/retail/prices?%24filter=productName%20eq%20%27Virtual%20Network%20Private%20Link%27%20and%20armRegionName%20eq%20%27Global%27%20and%20skuName%20eq%20%27Standard%27).
- Private DNS: $0.50/zone at the first tier. [Microsoft Retail Prices API](https://prices.azure.com/api/retail/prices?%24filter=serviceName%20eq%20%27Azure%20DNS%27%20and%20skuName%20eq%20%27Private%27%20and%20armRegionName%20eq%20%27Zone%201%27).

B1 supports the outbound VNet integration used here, without a separate integration fee. The SQL endpoint remains private. This does not make the web app itself private; its HTTPS record API requires the configured staff authentication. [Microsoft VNet integration documentation](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration).

Basic is an initial small-clinic pilot size, with a hard 2 GB limit and limited compute. The template requests seven days of locally redundant backups. That provides point-in-time recovery in the configured period, but not regional disaster recovery. Before relying on the console operationally, perform a restore and decide whether to use geo-redundant backup storage and longer retention on a higher SQL tier. [Microsoft SQL resource limits](https://learn.microsoft.com/en-us/azure/azure-sql/database/resource-limits-dtu-single-databases?view=azuresql), [Microsoft backup documentation](https://learn.microsoft.com/en-us/azure/azure-sql/database/automated-backups-overview?view=azuresql).

## Concrete provisioning sequence

The remaining launch prerequisites are acceptance of the new recurring cost, confirmed deployment and SQL-administrator permissions, a permanent clinic UUID, and individual staff PIN enrollment. The existing authenticated portal resolves the account; no password, deployment token, or patient data belongs in git.

1. Select the verified IPMG subscription. Confirm permission to create the proposed resource group/resources and to manage the dedicated SQL administrator group. Create or select an **IPMG Clinic Console SQL Administrators** Entra security group containing the authorized database administrators. This is database administration; staff PIN accounts do not require Entra application registrations.
2. Prepare a private parameter file for `infra/main.bicep`: `name=ipmg-clinic-console`, `location=centralus`, the permanent `clinicId`, and the actual SQL admin group's name/object ID. `authMode=pin` is the default. `publicOrigin` can stay empty: Bicep obtains the actual generated App Service hostname. Entra client IDs are only required for `authMode=entra`.
3. Run Bicep validation and resource-group what-if; inspect the actual SKU, region, identities, and cost before creating resources. The template creates SQL with public network access disabled. No wildcard SQL firewall rule is needed.

```sh
az account set --subscription '<verified-IPMG-subscription-id>'
az group create --name rg-ipmg-clinic-console --location centralus
az deployment group what-if --resource-group rg-ipmg-clinic-console \
  --template-file console/infra/main.bicep --parameters @console-azure.parameters.json
az deployment group create --name clinic-console \
  --resource-group rg-ipmg-clinic-console \
  --template-file console/infra/main.bicep --parameters @console-azure.parameters.json
az deployment group show --resource-group rg-ipmg-clinic-console \
  --name clinic-console --query properties.outputs
```

These are the planned commands, not a record of execution. Save the returned `appName`, `planName`, `integrationSubnetId`, `runtimeIdentityObjectId`, `sqlHost`, and `appUrl`. Do not guess the generated hostname.

## Private database bootstrap without a public SQL firewall

A normal public GitHub runner and ordinary Cloud Shell cannot resolve/reach this private SQL endpoint. Use a short-lived **migration App Service** on the new B1 plan. It shares the plan's compute, so no second plan is needed. Its identity is separate from the runtime identity. App Service supports multiple apps sharing a plan's resources; they contend for that capacity. [Microsoft App Service plan documentation](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans).

1. Build the verified revision on Linux/Node 22. Prepare a ZIP with `dist/`, `database/migrations/`, `package.json`, `package-lock.json`, and production `node_modules/`. Exclude `.env`, patient data, test results, and demo database seeds. Include migration and staff administration compiled code for the temporary administrative app. The runtime app never invokes either automatically.
2. Create `ipmg-clinic-migrate` in the same resource group and **existing `ipmg-clinic-console-plan`**. Use the built-in Node 22 Linux runtime. Set a maintenance-only startup command that returns HTTP 503; do not start the console API on this administrative app. Deny public site access with App Service access restrictions, while preserving authenticated administrator access to its SCM/SSH endpoint.
3. Assign the migration app its own system-managed identity and add **only that identity** to the SQL admin group, before its first SQL token request. Never add the console runtime identity. Group/identity propagation must be verified; membership changes may not take effect immediately.
4. Integrate the migration app with the same app-integration subnet. Deploy the administrative package. Set `SQL_SERVER`, `SQL_DATABASE=clinic-console`, `SQL_AUTH=azure-active-directory-default`, and `CLINIC_ID`. The database name and hostname should match the deployment outputs. No password or long-lived SQL token is supplied.
5. Open **SSH on the migration app**, not on the production console. Built-in Linux App Service images support an authenticated browser/CLI SSH session. From `/home/site/wwwroot`, confirm SQL DNS resolves to the private endpoint, then run the compiled migration command below. [Microsoft SSH documentation](https://learn.microsoft.com/en-us/azure/app-service/configure-linux-open-ssh-session).

```sh
cd /home/site/wwwroot
node dist/server/server/platform/migrate.js
```

6. In the application database, insert the configured clinic, and create a contained database user for the **verified runtime managed-identity object ID**, granting only `console_runtime`. Use the SID/TYPE syntax shown below if the SQL server has no Graph directory-reading permissions. This avoids adding broad directory privileges simply to resolve the runtime user. The operator must verify the object ID because this syntax performs no directory validation. [Microsoft managed identity guidance](https://learn.microsoft.com/en-us/azure/azure-sql/database/authentication-azure-ad-user-assigned-managed-identity?view=azuresql).

```sql
-- Run as the migration identity in the application database.
INSERT dbo.Clinics(id,name,timezone)
VALUES('<permanent-clinic-uuid>',N'IPMG San Bernardino',N'America/Los_Angeles');

-- Replace this with the runtimeIdentityObjectId from the deployment output.
DECLARE @runtimeObjectId uniqueidentifier = '<runtime-managed-identity-object-id>';
DECLARE @runtimeSid varchar(34) = CONVERT(varchar(34),CONVERT(binary(16),@runtimeObjectId),1);
DECLARE @createUser nvarchar(max) = N'CREATE USER [console-app] WITH SID=' + @runtimeSid + N', TYPE=E;';
EXEC sys.sp_executesql @createUser;
ALTER ROLE console_runtime ADD MEMBER [console-app];
```

7. Provision one named staff identity per person with the staff administration CLI, entering each PIN through its hidden interactive prompt. A shared clinic PIN would discard staff attribution and is not the launch configuration. On a development/migration checkout use `npm run staff:manage`; in the production-only package use `node dist/server/server/platform/manage-staff.js` in the interactive SSH terminal. See [PIN access](pin-access.md). Staff credentials are not placed in a frontend bundle or environment file.
8. Exit administrative sessions, remove the migration identity from the SQL admin group, stop and delete the temporary migration app, and verify its identity is removed. Do not delete the shared App Service plan, SQL server, or database. Repeat this isolated setup for future schema/PIN administration until a permanent controlled migration runner is configured. Removing group membership alone does not revoke already-issued cached tokens immediately; remove the temporary execution environment as well.
9. Deploy the verified package to the runtime app and start it with the template's `npm start`. It uses PIN staff sign-in and a limited managed identity for SQL. Test on the **returned app URL**. Verify a saved record survives browser reload, app restart, and access from a second workstation.

This is a workable bootstrap design, not an exercised deployment. Azure creation, private DNS resolution, SQL grants, staff enrollment, and the first restore remain to be executed and verified.

## First-use acceptance

Use synthetic records for the deployed smoke test. Verify PIN sign-in, failed-attempt lockout, manual/idle lock, inventory reservation and consumption, simultaneous stock edits, duplicate save retry, cancellation, completed-injection correction, note/AVS generation, and separate Tebra filing acknowledgment. Reopen each saved result from another browser. Confirm that unauthenticated record requests fail and that the app cannot alter staff credentials through the runtime database role.

Reconcile actual inventory lots/counts and patient Tebra identifiers before first use. Tebra remains the clinical record. The app's handoff is only marked filed after staff records that it was entered in Tebra. Keep the existing workstation available until the injection console's deployed checks and recovery test succeed; a calendar deadline does not prove those checks have passed.
