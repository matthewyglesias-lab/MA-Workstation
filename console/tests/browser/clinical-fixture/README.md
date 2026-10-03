# Clinical component fixture

Build from `console/`:

```sh
npx vite build --config tests/browser/clinical-fixture/vite.config.ts
```

Open `dist/clinical-fixture/Clinical-Workflow-Fixture.html` directly in a browser.
The HTML includes its scripts, fonts and styles. Its CSP disables network requests.

This test entry composes the real injection workspace, dialogs and document
components. A build-only alias routes their API calls to a fresh `seededDemo`
repository using the real input schemas, version checks and stock transactions.
It has no account system or credentials and imports neither production startup
nor the sign-in component. Production API and authentication code are unchanged.
Reference links remain visible for source inspection and open only if clicked.

Use Avery Chen for an unreviewed Sustenna maintenance encounter. Use the “To file”
queue to inspect Riley Bennett's completed encounter, note and bilingual AVS.
The remaining demo records support creating new encounters and trying other
dispositions. Every patient, order, finding and stock balance is fictional.
Reset or reload discards all changes. This fixture is not a deployment artifact.
