# Handoff — Tebra Injection Kiosk Redesign

**Updated:** 2026-09-06 · after Phase 2c authenticated-product refinement
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
> The local branch contains Phases 0 through 2b through `1387d10`. At the
> 2026-09-06 audit, PR #62 still pointed at `b674907`, so **both Phase 2b and the
> Phase 2c commit containing this handoff may need to be pushed first.** Phase
> 2c is the locally complete authenticated-product refinement of the shell,
> Injection worksheet, record-lifecycle footer, Note Inspector, responsive
> scroll ownership, and keyboard behavior. Close every gate in §5 and confirm
> the remote branch contains both commits before starting Phase 3.
>
> **Then take Phase 3 as a separate conventions change.** Build the Facesheet
> and the two distinct Notes surfaces recorded in §4.1: global Open Notes uses
> the legacy sparse-table workflow grammar, while patient-scoped Notes uses the
> current filter-panel and list-row grammar. Add the page-level `ActionBar`,
> split `New Note` action, lifecycle chips, lock indicator, patient hover card,
> and exact sort/open behavior specified in `MANIFEST.md` §4. Do not confuse
> that planned `ActionBar` with the existing per-note `RecordLifecycleActions`.
>
> The bar is *a module Tebra's own team built*: a Tebra user should notice no
> seam in how anything works. The engine does not change — this is a
> presentation project, and `git diff --stat` over the frozen paths must be
> empty at review.
>
> **Restructure, do not overlay.** The previous redesign failed by layering a
> stylesheet over one it was fighting, and needed ~900 `!important` declarations
> to win. `MANIFEST.md` §5b is the posture that prevents a repeat: change rules
> where they are declared, delete superseded worklist/drawer rules instead of
> layering new selectors over them, add zero new `!important`, leave no dead
> conditionals, and never derive a CSS class from display copy.
>
> Run the full gate in §5 before every commit. Commit each phase on its own.
> Push only when GitHub write access is available; otherwise report the exact
> blocker instead of implying a push. Update this handoff for whoever comes next.

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

## 3. What exists on the local branch

At the 2026-09-06 audit, the remote PR head was still `b674907`. Entries after
that commit are local until a successful push is verified.

| Commit | Phase | What it did |
| --- | --- | --- |
| `b11e228` `43994ea` | — | The specification: plan, manifest, agent brief, convention spec |
| `0f89f28` | **0 — Tokens** | `tebra-tokens.css` (the full colour/type/geometry/motion vocabulary, `:root` declarations only, `@media screen`). Added Inter Variable + JetBrains Mono. Boot splash and favicon in the palette. Deliberately pixel-inert in the shell. |
| `bf4ab1a` | **1 — Voice** | `vocabulary.ts` as the single source of user-facing copy. Dashboard / Open Notes / Facesheet / Care Checklist / Sign / Incomplete. Display copy extracted out of `src/application/`. |
| `b674907` | **2a — Visual base** | Retargeted the existing chrome and workflow styles at their source; removed the MEDITECH workstation and screen-contract stylesheets. |
| `1387d10` | **2b — Shell** | Adds `TebraChrome`, `AppHeader`, `SectionRail`, `tebra-workstation.css`, the flat white application shell, loading skeleton, and current Tebra screen contract. Local at audit time; not yet on PR #62. |
| *this commit* | **2c — Authenticated-product refinement** | Aligns measured shell/workflow geometry; repairs responsive clinical reachability, lifecycle/accessibility chrome, menu tracking, and immediate F12 dispatch; records the production-safe Tebra audit. |

**The Phase 2c shell refinement is locally complete.** Phase 2b and Phase 2c may
both remain unpushed when GitHub write access is unavailable. The Dashboard and current Open Notes
drawers still use provisional markup; Phase 3 replaces those conventions
without reopening the shell architecture.

### Load-bearing facts about what landed

- **`src/presentation/vocabulary.ts` owns all user-facing copy.** New strings go
  there, not inline. `tests/unit/vocabulary.test.ts` guards it, including a
  case-insensitive check that the readiness verdict is never worded as clearance
  to administer, and a check that internal vocabulary (attest, posting, local
  record, projection) stays off screen.
- **`src/presentation/tebra-tokens.css` is imported first** in
  `ClinicalDesktopShell.tsx`, so the screen cascade resolves `var(--tw-*)`
  consistently. The current order is tokens → clinical base → workflow panels
  → Tebra workstation composition → final Tebra screen contract. Phase 2
  retargeted the shell to those names.
- **Display copy no longer lives in `src/application/`.** Three label maps moved
  to presentation (readiness verdict, record lifecycle, transaction phase); the
  projections return `tone` / `state` / `phase`. See `MANIFEST.md` §1 amendment.
  The rest of `src/application/**` is still frozen.
- **Plus Jakarta Sans is still installed and must stay.** The AVS patient
  handout sets its titles in it inside the `@media print` block, and
  `print-regression.spec.js` asserts that stack.

---

## 4. Phase 2b outcome and Phase 2c refinement

The restructure posture required net CSS and override pressure to fall. The
landed Phase 2b commit (`1387d10`) reached 11,098 lines (-1,559 from the
starting 12,657). The Phase 2c commit measures:

```
CSS lines total                          12,171   (was 12,657;   -486)
  clinical-desktop.css                     5,468   (241 !important)
  tebra-workstation.css                    2,294   (  0 !important)
  workflows/workflow-panels.css            3,428   (  0 !important)
  tebra-screen-contract.css                  752   (  9 !important)
  tebra-tokens.css                           229   (  0 !important)
!important total                             250   (was 542; -292)
```

Phase 2c alone is +1,073 CSS lines over `1387d10`; the cumulative redesign is
still -486 from the 12,657-line starting point. Review that expansion against
the restructure posture before landing it rather than reporting only the
cumulative reduction.

`meditech-workstation.css`, `meditech-screen-contract.css`, and
`MeditechChrome.tsx` are deleted. The remaining `!important` declarations are
legacy debt in the retained clinical stylesheet plus nine documented screen
contract survivors. Phase 2c added none; later phases must keep that invariant.

The authenticated-product audit established these desktop measurements:

| Surface | Live measurement |
| --- | --- |
| Product header | `#004852`, 65px high; central search well `#002328`, 347×33 with 16px text. |
| Page and rail | `#fbf9f8` page; 192px flush white rail, 48px rows, 16px row padding, no rail radius; 32px content inset. |
| Type and panels | Body 16px/24px; main title 32px/48px; white radius-4 cards with Material elevation 1. |
| Actions | Coral `New Note` split group is 36px high; modern outlined actions are 38px high, radius 24, with `#b3c6c4` borders. |

Phase 2c adapts those desktop facts at the workstation's supported minimum:
56px header and 166px rail at ≤919px; 54px header, 158px rail, and 6px content
inset at 800–839px. Dashboard headings use 32px/40px on desktop and 21px/28px
at compact widths. These breakpoint values are repository adaptations, not
measurements taken from Tebra.

### 4.1 Live Tebra Notes audit — Phase 3 target

Every real-patient view in the production audit was read-only. On a separately
verified Test Patient, opening the Injection editor automatically created one
blank `Incomplete` note. No clinical text was entered and no Save, Sign,
Submit, or Delete action was used. The audit confirmed that "Notes" is not one
interchangeable component:

| Tebra surface | Measured grammar | Workstation destination |
| --- | --- | --- |
| Global **Open Notes** | Legacy sparse table; observed header near `#d4e0dd` (repository token `#d2dcda`); 44px white rows; visible visit-date sort caret; dedicated lock column; the row opens the note. | Replace the provisional drawer/worklist rows in `RecordsWindow.tsx` and `UdsRecordsWindow.tsx` with the shared Phase 3 `NotesTable`. |
| Patient chart **Notes** | Four 200×40 filters in a white radius-4, elevation-1 panel; 100px rows with 16px padding, about 20px bold title and 14px metadata; `Open` is 73×38. Observed chips: `Open` 59×32 on `#f0faf2`; `Signed` 69×32 on `#f0eee8`. | Add a patient-scoped Notes view. Do not restyle the global table into this modern list. |
| Note creation | Coral 36px split `New Note`; adjacent menu about 242px wide with 36px rows. Opening an editor can itself create an `Incomplete` note. | Phase 3 page-level `ActionBar`; preserve repository persistence and confirmation contracts even where Tebra behaves differently. |

Use the modern authenticated product as the source of truth for shell, cards,
fields, and actions. The legacy Open Notes/editor surface contributes its
workflow structure — sparse worklist, date sorting, lock placement, and note
editing sequence — but never its surrounding chrome or old control styling.

The repository already has the data needed for a presentation-only global
table: signing staff/timestamp in `attestation`, injection visit date in
`fields.adminDate`, UDS visit date in `collectionDateTime`, and `createdAt` as
the fallback. The current global rows expose unrelated columns and use dense
13px/11px text with an amber draft badge. The planned Phase 3 Notes, status,
lock, page-level action-bar, patient-search, and Facesheet components are not
present in the Phase 2c commit. Do not write assertions for them until
they land.

---

## 5. The verification gate

Run all of it before every commit.

```bash
npm run check        # typecheck + check-app.js (~50 clinical assertions)
npm run test:unit
npm run test:print   # renderer hashes plus print-layout/PDF gate
npm run build
npx playwright test --config=<local config, see below>

git diff --stat -- public/legacy src/legacy src/domain src/documentation \
                   src/persistence tests/fixtures        # MUST be empty
```

### Running Playwright in a remote sandbox

The repo pins `@playwright/test` 1.62, whose authoritative browser is
chromium-1234 (Chromium 151). This audit used a temporary Chromium 149 binary
through a throwaway config. Its scratch path is ephemeral: locate the current
binary, pass it as `PW_CHROMIUM`, and never commit the path.

```js
// /tmp/.../pw-local.cjs
const path = require('node:path');
const root = process.cwd();
const base = require(path.join(root, 'playwright.config.cjs'));
const executablePath = process.env.PW_CHROMIUM;
if (!executablePath) throw new Error('Set PW_CHROMIUM to the Chromium binary');
module.exports = {
  ...base,
  testDir: path.join(root, 'tests/e2e'),
  outputDir: path.join(root, 'test-results'),
  webServer: { ...base.webServer, cwd: root },   // cwd matters: npm run preview
  projects: [{
    name: 'chromium',
    use: { browserName: 'chromium',
           launchOptions: { executablePath } },
  }],
};
```

```bash
PW_CHROMIUM=/path/to/chromium \
  npx playwright test --config=/tmp/.../pw-local.cjs --reporter=line
```

### Current local verification status

- `tebra-screen-contract.spec.js`: 6/6 passed on temporary Chromium 149,
  including visible clinical-page intersection and keyboard detail/focus-ring
  coverage at short workstation sizes plus lifecycle overlap checks at tall
  desktop widths.
- `visual-contracts.spec.js`: 2/2 passed.
- Five journeys covering the changed interactions: 5/5 passed.
- The final combined screen/interaction run passed 66/66. Before the final
  keyboard fix, the UDS F12 journey reproduced at 2/5 on both this tree and
  unchanged `1387d10`; keeping the current save callback in a presentation ref
  raised it to 10/10. Menu hover/Alt/arrow tracking also passed 10/10.
- Full print suite on Chromium 149: 13/18 passed. Four failures reproduce at
  unchanged `1387d10`; the fifth is the likely-flaky four-step rail mutation
  check. The two print-isolation paths touched by Phase 2c (early Injection AVS
  and UDS clinician report) pass 2/2. Chromium 151 remains authoritative, so
  the complete print gate is still open.
- No full Chromium 151 e2e run or current committed snapshot review is recorded.

### Visual baselines

Phase 1 **measured** the version gap rather than assuming it: all 7 then-changed
CI-made Chromium 151 baselines passed on Chromium 141 against unchanged code,
because the capture CSS forces `Arial, "Liberation Sans"` with
`font-synthesis: none` and disables animations. That established compatibility
for those captures at that time; it does not authorize regeneration on the
temporary Chromium 149 binary.

The committed Linux images still show the pre-Phase-2b shell and must be
regenerated against the current implementation before Phase 2's visual gate is
closed. The `win32/` set is also stale and can only be refreshed on that
platform. Never update either set without reviewing every image.

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

1. **Print is independently guarded.** `public/legacy/legacy.css` is frozen and
   loads at `media="print"`; `clinical-desktop.css` also contains established
   print layout and shell-isolation rules. The suite pins renderer HTML hashes
   to the fixture anchored at `bc4a255d` and checks Letter-page layout/PDF
   output. New visual stylesheets must be `@media screen`-scoped. One
   `media="all"` link can put the redesign into printed patient handouts.
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

## 8. Last known CI status — verify before acting

At the Phase 1 handoff, `Build and Deploy` was red on PR #62 because Azure
rejected the preview deploy with:

```
This Static Web App already has the maximum number of staging environments.
```

That was external staging-capacity state, not a code failure. It was not
re-checked during the 2026-09-06 design audit. Inspect the current run before
acting or repeating the standing-down comment (`issuecomment-5504255572`).

---

## 9. Remaining phases

| Phase | Scope |
| --- | --- |
| **2b — Shell** | **Present locally at `1387d10`; PR #62 was still at `b674907` during the audit.** App header, section rail, footer, dialogs, buttons, fields, loading skeleton, and deletion of the MEDITECH contract. |
| **2c — Authenticated-product refinement** | **Completed by the commit containing this handoff; its remote push may still be pending alongside Phase 2b.** Confirm PR #62 contains both commits, then finish the full Chromium 151 browser/print gate and regenerate/review current visual baselines. |
| **3 — Conventions** | **After 2c lands.** Facesheet cards; global legacy-style Open Notes table with date sort/lock/status; separate modern patient Notes filters/list; hover patient card; page-level coral split `New Note`, `Print`, `More`, `Customize View`. **Where first-party feel is won or lost.** |
| **4 — Kiosk** | Kiosk shell (`?kiosk=1`), 7-step injection stepper over existing `InjectionPanel` tabs, touch site picker, Care Checklist rail, sign-and-next card. |
| **5 — Cleanup** | Delete dead MEDITECH CSS, update `README.md`. |
| **(unscheduled)** | The `cd2004-*` / `meditech-*` / `wfp-*` class rename. Mechanical, ~1000 usages, touches every e2e selector — **its own phase**, never mixed with design work. |

Run the nine-question convention review in `MANIFEST.md` §5 screen by screen
before each phase ships.
