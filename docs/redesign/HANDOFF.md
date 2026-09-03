# Handoff — Tebra Injection Kiosk Redesign

**Updated:** 2026-09-02 · after Phase 1
**Repo:** `matthewyglesias-lab/MA-Workstation`
**Branch:** `claude/ma-workstation-tebra-redesign-nu1aeq` · **PR:** #62 (draft)

Give the prompt in §1 to the next agent. Everything after it is the detail that
prompt refers to. Update this file at the end of each phase.

---

## 1. The prompt

> You are continuing the Tebra-language injection-kiosk redesign of the IPMG MA
> Workstation, on branch `claude/ma-workstation-tebra-redesign-nu1aeq`.
>
> **Read these first, in order:** `docs/redesign/HANDOFF.md` (current state, the
> verification gate, and the traps that have already cost time),
> `docs/redesign/PLAN.md` (what we are building and why),
> `docs/redesign/MANIFEST.md` (frozen paths, design tokens, convention spec, and
> the restructure posture in §5b).
>
> Phases 0 and 1 are landed. **Your task is Phase 2: the chrome.** Replace the
> MEDITECH shell with Tebra's — app header, section rail, action bar, footer,
> dialogs, buttons, fields — and swap the boot splash for the loading skeleton
> specified in `MANIFEST.md` §5c.
>
> The bar is *a module Tebra's own team built*: a Tebra user should notice no
> seam in how anything works. The engine does not change — this is a
> presentation project, and `git diff --stat` over the frozen paths must be
> empty at review.
>
> **Restructure, do not overlay.** The previous redesign failed by layering a
> stylesheet over one it was fighting, and needed ~900 `!important` declarations
> to win. `MANIFEST.md` §5b is the posture that prevents a repeat: change rules
> where they are declared, delete `meditech-screen-contract.css` rather than
> superseding it, add zero new `!important`, leave no dead conditionals, and
> never derive a CSS class from display copy. Net CSS must fall — the current
> baseline is in §4 below.
>
> Run the full gate in §5 before every commit. Commit Phase 2 on its own, push,
> and update `docs/redesign/HANDOFF.md` for whoever comes next.

---

## 2. What this project is

Replace the workstation's 1990s MEDITECH client/server presentation with
Tebra's design language, reshaped around the one thing this station does all
day: administering long-acting injectables. Presentation only — the clinical
engine is frozen.

Full rationale in `PLAN.md`. The short version: matching Tebra's palette is the
easy tenth; the other nine tenths is obeying their product conventions (how
tables sort, what status chips say, where the action bar sits), which is where a
third-party build gives itself away.

---

## 3. What is landed

| Commit | Phase | What it did |
| --- | --- | --- |
| `b11e228` `43994ea` | — | The specification: plan, manifest, agent brief, convention spec |
| `0f89f28` | **0 — Tokens** | `tebra-tokens.css` (the full colour/type/geometry/motion vocabulary, `:root` declarations only, `@media screen`). Added Inter Variable + JetBrains Mono. Boot splash and favicon in the palette. Deliberately pixel-inert in the shell. |
| `bf4ab1a` | **1 — Voice** | `vocabulary.ts` as the single source of user-facing copy. Dashboard / Open Notes / Facesheet / Care Checklist / Sign / Incomplete. Display copy extracted out of `src/application/`. |

**The shell still looks MEDITECH.** Phase 1 changed words, not visual language.
Phase 2 is where that changes.

### Load-bearing facts about what landed

- **`src/presentation/vocabulary.ts` owns all user-facing copy.** New strings go
  there, not inline. `tests/unit/vocabulary.test.ts` guards it, including a
  case-insensitive check that the readiness verdict is never worded as clearance
  to administer, and a check that internal vocabulary (attest, posting, local
  record, projection) stays off screen.
- **`src/presentation/tebra-tokens.css` is imported first** in
  `ClinicalDesktopShell.tsx`, so later stylesheets resolve `var(--tw-*)` against
  it. It contains `:root` declarations and no other selector — nothing it
  defines is applied yet. **Phase 2's job is to retarget the existing
  stylesheets onto these names.**
- **Display copy no longer lives in `src/application/`.** Three label maps moved
  to presentation (readiness verdict, record lifecycle, transaction phase); the
  projections return `tone` / `state` / `phase`. See `MANIFEST.md` §1 amendment.
  The rest of `src/application/**` is still frozen.
- **Plus Jakarta Sans is still installed and must stay.** The AVS patient
  handout sets its titles in it inside the `@media print` block, and
  `print-regression.spec.js` asserts that stack.

---

## 4. Phase 2 starting numbers

The restructure posture says net CSS must fall. Measure against these:

```
CSS lines total                          12,657
  clinical-desktop.css                     5,487   (517 !important)
  meditech-workstation.css                 3,726   ( 10 !important)
  workflows/workflow-panels.css            2,829   (  3 !important)
  meditech-screen-contract.css               404   ( 12 !important)
  tebra-tokens.css                           211   (  0 !important)
!important total                             542
```

`meditech-screen-contract.css` exists only to force one visual language over
another. Once tokens own that, it is **deleted**, not superseded. Report the
line-count and `!important` delta in the Phase 2 PR.

---

## 5. The verification gate

Run all of it before every commit.

```bash
npm run check        # typecheck + check-app.js (~50 clinical assertions)
npm run test:unit    # currently 569 passing
npm run build
npx playwright test --config=<local config, see below>    # currently 108 passing

git diff --stat -- public/legacy src/legacy src/domain src/documentation \
                   src/persistence tests/fixtures        # MUST be empty
```

### Running Playwright in the Claude Code sandbox

The repo pins `@playwright/test` 1.62, which wants chromium-1234 (Chromium 151).
The sandbox ships chromium-1194 (Chromium 141), so `npx playwright test` fails
with "browser not found" and **`npx playwright install` is not the answer.**
Point it at the local binary with a throwaway config:

```js
// /tmp/.../pw-local.cjs
const path = require('node:path');
const root = '/home/user/MA-Workstation';
const base = require(path.join(root, 'playwright.config.cjs'));
module.exports = {
  ...base,
  testDir: path.join(root, 'tests/e2e'),
  outputDir: path.join(root, 'test-results'),
  webServer: { ...base.webServer, cwd: root },   // cwd matters: npm run preview
  projects: [{
    name: 'chromium',
    use: { browserName: 'chromium',
           launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
  }],
};
```

```bash
npx playwright test --config=/tmp/.../pw-local.cjs --reporter=line
```

### Visual baselines

Phase 1 **measured** the version gap rather than assuming it: all 7 CI-made
(Chromium 151) baselines passed on local 141 against unchanged code, because the
capture CSS forces `Arial, "Liberation Sans"` with `font-synthesis: none` and
disables animations. Regenerating on 141 is therefore safe today.

**Re-run that check whenever the version gap widens or the capture settings
change.** The method: `git worktree add <tmp> <last green commit>`, symlink
`node_modules`, build, and run `visual-snapshots.spec.js` there against the
committed baselines. If they pass, regeneration is safe.

```bash
npx playwright test --config=/tmp/.../pw-local.cjs \
  tests/e2e/visual-snapshots.spec.js --update-snapshots
```

Review every regenerated image. `win32/` is a different platform and **cannot**
be refreshed here — flag it as stale in the PR body.

---

## 6. Traps that have already cost time

1. **Print is byte-identical and print-only.** `public/legacy/legacy.css` loads
   at `media="print"` and solely owns the 8 patient-facing print sheets, asserted
   against a fixture anchored to `bc4a255d`. **Every stylesheet you add must be
   `@media screen`-scoped.** One `media="all"` link puts the redesign into
   printed patient handouts.
2. **`scripts/check-app.js` guards ~50 clinical regexes** against the legacy
   runtime and markup — NKDA defaults, UDS panel neutrality, cup-expiry gating,
   dose-picker ordering. If one goes red your change reached the engine:
   **revert it, never relax the assertion.** It also asserts that
   `clinical-desktop.css` and `workflows/workflow-panels.css` exist by name —
   renaming either means updating that assertion in the same commit.
3. **Grep for HTML entities too.** `Attest &amp; lock local record` in JSX
   survived a full plain-text pass in Phase 1.
4. **Some strings are data, not copy.** `statementVersion:
   "local-attestation-v1"` is persisted inside saved records. Patient names like
   `"QA, Start Center Open"` are test fixtures typed into inputs. Renaming
   either breaks something real. Likewise `WorkflowId` values (`administer`,
   `tms`, `log`, `reference`) address legacy panel selectors like
   `#panel-administer` — internal keys never change, only labels.
5. **Never derive a CSS class from display copy.** `is-${label.toLowerCase()}`
   produced `.is-filed`; renaming the label silently dropped its styling.
   Modifier classes come from state keys.
6. **Do not leave dead conditionals.** Collapsing a distinction is fine; leaving
   a three-branch ternary whose branches are now identical is not.

---

## 7. Design rules you may not trade away

- **Coral `#ff8d6e` is the single primary action on a screen, and never carries
  clinical meaning.** It sits too close to a warning hue. Clinical state uses
  the separate triad in `MANIFEST.md` §3.2.1. Verify contrast yourself:
  ≥ 4.5:1 body text, ≥ 3:1 UI boundaries.
- **Status is never colour-only.** Every stop / review / ready state carries an
  icon *and* a word.
- **Calibrate density to Tebra's product, not their marketing site.** Their
  marketing pages are airy (18px body, 57px buttons); their product is dense.
  `MANIFEST.md` §3 gives two token tiers — brand tier for surfaces a touchscreen
  wants big, workstation tier for everything else.
- **No navigation to features that do not exist here** — Charge Capture,
  ePrescribe, Patient Portal, Message Center, Billing, Telehealth, Labs
  ordering, Referrals, Recall. Dead ends are the most obvious tell of all.
- **Do not ship Tebra's logo, wordmark, or Akkurat LL.** Tebra is a third-party
  trademark and Akkurat is a commercial Lineto family. The module presents
  truthfully as IPMG's, built in Tebra's language, with the local-only
  disclosure designed in voice and always visible — this app has no server, and
  the more faithful the design gets, the likelier staff are to assume their
  documentation reached the patient's chart. See `PLAN.md` §7.

---

## 8. CI status — do not chase this

`Build and Deploy` is red on PR #62 and **it is not this PR's failure.** Azure
rejects the preview deploy with:

```
This Static Web App already has the maximum number of staging environments.
```

Every open PR against `main` claims one Static Web Apps staging environment; the
Free tier allows three, and there are four open (#56, #59, #60, #62). Every
code-level job passes. The remedy belongs to a maintainer: close one stale draft
PR, or upgrade the SWA plan. A standing-down comment is already posted
(`issuecomment-5504255572`) — do not post a second one while that blocker holds.

---

## 9. Remaining phases

| Phase | Scope |
| --- | --- |
| **2 — Chrome** | App header, section rail, action bar, footer, dialogs, buttons, fields. Boot splash → loading skeleton. Delete `meditech-screen-contract.*`. |
| **3 — Conventions** | Facesheet cards, Open Notes table with sort/lock/status chips, hover patient card, `+ New Note` / `Print` / `More` / `Customize View`. **Where first-party feel is won or lost.** |
| **4 — Kiosk** | Kiosk shell (`?kiosk=1`), 7-step injection stepper over existing `InjectionPanel` tabs, touch site picker, Care Checklist rail, sign-and-next card. |
| **5 — Cleanup** | Delete dead MEDITECH CSS, update `README.md`. |
| **(unscheduled)** | The `cd2004-*` / `meditech-*` / `wfp-*` class rename. Mechanical, ~1000 usages, touches every e2e selector — **its own phase**, never mixed with design work. |

Run the nine-question convention review in `MANIFEST.md` §5 screen by screen
before each phase ships.
