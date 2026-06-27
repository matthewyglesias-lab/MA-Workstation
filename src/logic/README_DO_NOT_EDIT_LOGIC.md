# Logic guardrail

The app currently runs from the inline JavaScript inside `index.html` and `standalone.html`.

For a third-party visual polish pass, avoid editing JavaScript. The read-only snapshot here is included so a developer can inspect function names and state contracts without hunting through the large HTML file.

If JavaScript must be changed, run `node qa/logic-smoke.js` afterward and manually smoke-test all Print Center outputs.
