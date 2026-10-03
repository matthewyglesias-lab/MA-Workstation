# Azure SQL deployment preparation

For the requested **Render + Azure SQL free offer** evaluation, use [Render setup](render-setup.md). Its $7 profile is for synthetic data; live patient PHI requires a separately approved HIPAA-enabled Render workspace. The App Service architecture below is an alternative.

This branch prepares Azure resources as code; it does not provision or deploy them. See [deployment readiness](deployment-readiness.md) for the verified IPMG environment, proposed resources, current retail estimate, and private database bootstrap. Review the Bicep what-if and resource costs for the selected region first.

## Topology

The first Azure target is **Linux App Service serving the frontend and API from the same origin**, plus **Azure SQL Database**. This avoids cross-origin authentication complexity while retaining independent frontend and domain modules. The existing Azure Static Web App at the repo root stays intact.

`infra/main.bicep` provisions a Basic App Service plan, an Azure SQL free-offer General Purpose serverless database (32 GB, 0.5–2 vCores, no overage billing), Entra-only SQL authentication, a private SQL endpoint with private DNS, and App Service VNet integration. Public SQL networking is disabled. App Service has a system-assigned managed identity; no SQL password is supplied. Seven-day short-term backups are requested; this is initial sizing/retention, not a final clinic retention policy or a claim of tested recovery. The database pauses until next month if its 100,000 monthly free vCore-seconds are exhausted. App hosting and private networking are separately billed; the database offer does not make the whole stack free. Review capacity, availability and retention before production. See [free-offer limits](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql).

## Staff sign-in

The default is `AUTH_MODE=pin`: individual named staff accounts with a server-verified PIN. `PUBLIC_ORIGIN` is set to the actual App Service origin by Bicep, including any generated hostname suffix. Staff PINs are enrolled through the separate administration CLI after database migrations; they are never shipped in the UI. See [PIN access](pin-access.md).

Azure SQL still uses Entra managed identity regardless of the staff sign-in choice. The SQL administrator group, migration identity, and limited runtime identity remain separate. PIN mode does not require an API or SPA app registration.

## Optional Entra staff sign-in

Set Bicep `authMode=entra` only when this alternate sign-in mode is wanted, then complete the following registration steps:

1. Create an Entra single-tenant **API** registration. Set requested access-token version to 2, expose `api://<api-client-id>/access_as_user`, and define user app roles `Console.Reader`, `Console.Operator`, and `Inventory.Manager`.
2. Create a single-tenant **SPA** registration with the App Service origin as its SPA redirect URI, grant the API delegated scope, and consent as required by the tenant. Do not request Microsoft Graph patient data access or store a client secret in the SPA.
3. Assign staff/groups the API app roles. Operators and inventory managers can be assigned both roles. Restrict enterprise-application assignment according to clinic policy.
4. Use an Entra administrator group for SQL provisioning. Deployment identity, database migration identity and application runtime identity have different responsibilities.

## Provision and initialize

Run from an authenticated Azure CLI session with the correct subscription selected. Keep parameters outside the repository if they contain deployment-specific information.

```sh
az bicep build --file console/infra/main.bicep
az deployment group what-if --resource-group <resource-group> --template-file console/infra/main.bicep --parameters @<parameters.json>
az deployment group create --resource-group <resource-group> --template-file console/infra/main.bicep --parameters @<parameters.json>
```

Required parameters: `name`, `clinicId` (new permanent UUID), `sqlAdminGroupObjectId`, `sqlAdminGroupName`. `authMode` defaults to `pin`; `apiClientId` and `webClientId` are required only for `entra`. `tenantId`, `location`, clinic timezone, and the default public origin have defaults.

The private endpoint means a public GitHub runner cannot run migrations against this database. Use an authorized workstation/runner with VNet connectivity and private DNS resolution. The [deployment readiness guide](deployment-readiness.md) describes a temporary administrative App Service on the same plan with a separate identity. SQL public access stays disabled.

From that migration environment, run `npm ci` in `console/`, set `SQL_SERVER`, `SQL_DATABASE`, `SQL_AUTH=azure-active-directory-default`, sign in as the migration identity, and run `npm run db:migrate`. The runtime identity must never run this command.

Provision the clinic and runtime user through an administrator connection to the application database. Use the actual configured clinic UUID and app managed-identity name:

```sql
INSERT dbo.Clinics(id,name,timezone)
VALUES('<clinic-uuid>',N'IPMG San Bernardino',N'America/Los_Angeles');
CREATE USER [<app-managed-identity-name>] FROM EXTERNAL PROVIDER;
ALTER ROLE console_runtime ADD MEMBER [<app-managed-identity-name>];
```

Confirm user identity resolution follows the tenant's Entra/SQL requirements. Do not grant `db_owner` to the runtime app. Use a different database/runtime identity for each clinic-scoped deployment; the initial runtime role is not a multi-tenant database isolation boundary.

## Package and deploy

Build and test from `console/`: `npm ci`, `npm run check`, `npx playwright test`. Create a deployment archive containing `dist/`, `database/migrations/`, `package.json`, `package-lock.json`, and production `node_modules/` installed on Linux with Node 22. The app starts using `npm start`; the current working directory must contain these files. Compiled migrations and staff administration commands run only from the separate administrative environment, never during runtime app startup. Do not include `.env`, test artifacts or synthetic fixtures as database seeds.

Deploy the archive to the newly provisioned App Service, after database initialization. Its Bicep settings select `CONSOLE_MODE=sql` and `NODE_ENV=production`. App Service supplies the listening port; the app binds to `HOST=0.0.0.0`. No automatic migration or demo fallback occurs on start.

Before a pilot, verify unauthenticated API requests receive 401, each role has only intended actions, SQL resolves privately, the managed identity can perform permitted transactions, and the UI never labels an unfiled service as filed. Exercise unknown-save retries, duplicate submissions, concurrent reservations, conflicting activity edits and restoration from a backup. Frontend assets may load without authentication; all record APIs require it.

## References

- [Microsoft: Node.js with Azure SQL and passwordless authentication](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart?view=azuresql)
- [Microsoft: Access token validation](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [Microsoft: Azure SQL server Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.sql/2023-08-01/servers)
- [Microsoft: Node.js on App Service](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
