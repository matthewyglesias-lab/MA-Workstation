# IPMG MedAssist — Azure Static Web App

This repo is ready to deploy the standalone IPMG MedAssist HTML app to **Azure Static Web Apps**.

## What is included

- `index.html` — the standalone app file.
- `staticwebapp.config.json` — Azure Static Web Apps routing/security headers.
- `.github/workflows/azure-static-web-apps.yml` — GitHub Actions deployment workflow.
- `package.json` — optional local smoke-test helper.

## Local test

```bash
npm install
npm run check
npm start
```

Then open the local URL shown in the terminal.

## Create the GitHub repo

1. Create a new GitHub repository, for example: `ipmg-medassist-static-webapp`.
2. Upload or push all files from this folder to the repository root.
3. Make sure your default branch is `main`.

## Deploy in Azure Static Web Apps

1. In Azure Portal, create a new **Static Web App**.
2. Choose your subscription and resource group.
3. Plan type: **Free** is fine for testing/internal lightweight use.
4. Deployment source: **GitHub**.
5. Select your GitHub organization, repository, and `main` branch.
6. Build preset: **Custom**.
7. App location: `/`
8. API location: leave blank.
9. Output location: leave blank.
10. Finish creation and allow GitHub Actions to deploy.

## If you use the included workflow manually

The included workflow expects a GitHub repository secret named:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
```

You can copy the deployment token from the Azure Static Web App resource, then add it in GitHub under:

`Settings → Secrets and variables → Actions → New repository secret`

## Notes

- This app is intentionally static: no server, no database, and no API folder.
- Browser/local storage behavior remains the same as the original standalone HTML.
- Do not add patient-identifiable production data unless you have appropriate security, access controls, retention rules, and clinic approvals in place.
