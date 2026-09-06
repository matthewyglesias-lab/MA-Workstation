# Handoff — Tebra Injection Kiosk Redesign

**Updated:** 2026-09-03 · after Phase 2
**Repo:** `matthewyglesias-lab/MA-Workstation`
**Branch:** `claude/pr-62-continuation-kp5wb0` · **PR:** #63 (draft), based on #62's head

Give the prompt in §1 to the next agent. Everything after it is the detail that
prompt refers to. Update this file at the end of each phase.

---

## 1. The prompt

> You are continuing the Tebra-language injection-kiosk redesign of the IPMG MA
> Workstation, on branch `claude/pr-62-continuation-kp5wb0`.
>
> **Read these first, in order:** `docs/redesign/HANDOFF.md` (current state, the
> verification gate, and the traps that have already cost time),
> `docs/redesign/PLAN.md` (what we are building and why),
> `docs/redesign/MANIFEST.md` (frozen paths, design tokens, convention spec, and
> the restructure posture in §5b).
>
> Phases 0, 1 and 2 are landed. **Your task is Phase 3: the conventions.** This
> is where first-party feel is won or lost — the Facesheet cards, the Open Notes
> table with header-click sorting, the lock glyph, the status chips, the hover
> patient card, and the `+ New Note` / `Print` / `More` / `Customize View`
> action bar. `MANIFEST.md` §4 is the specification, read off Tebra's own
> product documentation.
>
> The bar is *a module Tebra's own team built*: a Tebra user should notice no
> seam in how anything works. The engine does not change — this is a
> presentation project, and `git diff --stat` over the frozen paths must be
> empty at review.
>
> **Restructure, do not overlay.** The previous redesign failed by layering a
> stylesheet over one it was fighting, and needed ~900 `!important` declarations
> to win. `MANIFEST.md` §5b is the posture that prevents a repeat: change rules
> where they are declared, add zero new `!important`, leave no dead conditionals,
> and never derive a CSS class from display copy. Net CSS must fall — the current
> baseline is in §4 below.
>
> Phase 2 found that the same rule was being declared up to **four times** in
> `meditech-workstation.css` alone, in blocks that override each other. Before
> changing any rule, grep the whole file for its selector: editing the first
> declaration you find usually changes nothing on screen. §6 trap 7.
>
> Run the full gate in §5 before every commit. Commit Phase 3 on its own, push,
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
| `b674907` | **2a — Palette at source** | `tebra-screen-contract.css` replaces `meditech-screen-contract.css`. `--cd-*` retargeted onto the tokens; 411 navy/periwinkle literals mapped by luminance band; 70 Tahoma stacks to the token face. |
| `3d05888` | — | Capture-font fix: the visual-snapshot neutralizer covers `body *`, not just the shell subtree. See §5. |
| `5b11cd9` | **2b — Chrome** | App bar, menu bar, status bar, teal focus ring. The `--mt-*` alias layer deleted; `--mt-icon-*` finally declared, so the glyphs leave the MEDITECH palette. |
| `67063ca` | **2b — Rail** | The rail's four competing declarations folded into one. Facesheet banner out of upper-case Arial Narrow; command deck out of its terminal costume; two real defects fixed (see below). |
| `6196f30` | **2b — Panels** | `.cd2004-window` becomes a panel. The coral primary action exists for the first time. The viewport gate rebuilt as a card. Boot is a loading skeleton, not a brand splash. |

**Phase 2 is complete.** The shell no longer reads as a desktop window: flat app
bar, utility menu, section rail, panels with section headers, a coral primary
action, a flat command deck and a skeleton boot. Phase 3 is the conventions —
tables, cards, chips — which is where a third-party build gives itself away.

### Two defects the fold turned up, worth knowing about

Both were invisible in review and only surfaced once four declarations became
one:

- The rail's outstanding-work count rendered on desktop as a 7px dot with
  `color: transparent` on its number. Colour was carrying the entire meaning,
  which `MANIFEST.md` §5 question 7 forbids outright.
- The worklist's first cell stacks a priority word over a timestamp inside a
  19px row that clips. The time was on screen and unreadable at any size.

Assume there are more of these wherever a rule is declared more than once.

### Load-bearing facts about what landed

- **`src/presentation/vocabulary.ts` owns all user-facing copy.** New strings go
  there, not inline. `tests/unit/vocabulary.test.ts` guards it, including a
  case-insensitive check that the readiness verdict is never worded as clearance
  to administer, and a check that internal vocabulary (attest, posting, local
  record, projection) stays off screen.
- **`src/presentation/tebra-tokens.css` is imported first** in
  `ClinicalDesktopShell.tsx`, so later stylesheets resolve `var(--tw-*)` against
  it. It contains `:root` declarations and no other selector. Phases 2a and 2b
  retargeted the existing stylesheets onto these names; **new rules take tokens,
  never literals.**
- **The load order is `tebra-tokens` → `clinical-desktop` → `workflow-panels` →
  `meditech-workstation` → `tebra-screen-contract`.** `meditech-workstation.css`
  is not in `MANIFEST.md` §6's list but is the composition layer, and it wins
  over `clinical-desktop.css`. `tebra-screen-contract.css` wins over everything.
- **`--mt-icon-*` is declared on `:root`, not on the shell.** `DesktopIcon` and
  `SiteIcon` read those eight names with hard-coded MEDITECH fallbacks. The
  unsupported-viewport gate renders icons outside `.cd2004-shell`, so a
  shell-scoped palette silently leaves that screen on the fallbacks.
- **The boot skeleton in `index.html` mirrors the shell's chrome geometry.**
  `MANIFEST.md` §5c calls this out as a coupling; it is now asserted, in
  `tebra-screen-contract.spec.js`. Change an app-bar, menu-bar, banner, deck or
  status-bar height and change the skeleton in the same commit, or that test
  fails — which is the point.
- **The coral primary action is `.cd2004-worklist-new`.** It is the only coral
  fill allowed on a screen and the contract asserts the count is exactly one.
  A new screen with its own primary action means moving the coral, not adding
  a second one.
- **Display copy no longer lives in `src/application/`.** Three label maps moved
  to presentation (readiness verdict, record lifecycle, transaction phase); the
  projections return `tone` / `state` / `phase`. See `MANIFEST.md` §1 amendment.
  The rest of `src/application/**` is still frozen.
- **Plus Jakarta Sans is still installed and must stay.** The AVS patient
  handout sets its titles in it inside the `@media print` block, and
  `print-regression.spec.js` asserts that stack.

---

## 4. Phase 3 starting numbers

The restructure posture says net CSS must fall. Measure against these:

```
CSS lines total                          12,536
  clinical-desktop.css                     5,679   (519 !important)
  meditech-workstation.css                 3,285   (  6 !important)
  workflows/workflow-panels.css            2,829   (  3 !important)
  tebra-screen-contract.css                  428   (  9 !important)
  tebra-tokens.css                           211   (  0 !important)
!important declarations                      537
```

Count declarations, not `grep -c '!important'`: comments mention the word, and
counting lines inflates the number.

```bash
grep -h '!important' src/presentation/*.css src/presentation/workflows/*.css \
  | grep -v '^\s*\*' | wc -l
```

Across Phase 2 the total moved 12,657 → 12,536 (−121) with `!important` at
542 → 537 and **none added**. Most of the reduction is duplicate declarations
being folded, not rules being tuned. Report the line-count and `!important`
delta in the Phase 3 PR.

`clinical-desktop.css` *grew* over the phase, and that is the intended shape:
rules moved into it from `meditech-workstation.css`, which fell by 441 lines.
The base file is meant to end up owning the declarations.

---

## 5. The verification gate

Run all of it before every commit.

```bash
npm run check        # typecheck + check-app.js (~50 clinical assertions)
npm run test:unit    # currently 569 passing
npm run build
npx playwright test --reporter=line                       # currently 111 passing

git diff --stat -- public/legacy src/legacy src/domain src/application \
                   src/persistence src/documentation tests/fixtures  # MUST be empty
```

### Running Playwright in the Claude Code sandbox

**Install the pinned browser. Earlier advice here said not to; it was wrong.**

The repo pins `@playwright/test` 1.62, which wants chromium-1234 (Chromium 151).
The sandbox preinstalls chromium-1194 (Chromium 141) at `/opt/pw-browsers` and
sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, so a bare `npx playwright test` fails
with "browser not found". Phase 1 concluded that `playwright install` could not
fix that and worked around it with a throwaway config pointing at 141. **The
download works.** Both variables are just environment defaults:

```bash
export PLAYWRIGHT_BROWSERS_PATH=/tmp/.../pw-browsers
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 npx playwright install chromium
npx playwright test --reporter=line     # with PLAYWRIGHT_BROWSERS_PATH exported
```

Use the repo's own `playwright.config.cjs` — no override config, no
`executablePath`. Keep `PLAYWRIGHT_BROWSERS_PATH` exported in every shell that
runs tests, or Playwright looks in the default cache and finds nothing.

This matters more than convenience: it is the **same renderer CI uses**, so a
green run here means a green run there. Phase 2 confirmed the equivalence in
both directions — six visual snapshots that CI rejected reproduced locally on
151 with the identical failure list, and passed on 141.

### Visual baselines

**Regenerate on 151, and only on 151.** Anything generated on the sandbox's 141
is a guess about what the runner will draw.

```bash
export PLAYWRIGHT_BROWSERS_PATH=/tmp/.../pw-browsers
npx playwright test tests/e2e/visual-snapshots.spec.js --update-snapshots
```

Phase 1 measured the 141/151 gap and found the seven baselines of the day
survived it, because the capture CSS forces `Arial, "Liberation Sans"` with
`font-synthesis: none` and disables animations. That held while the shell was
square and untinted. It stopped holding in Phase 2: the rail's 6px radius under
`overflow: hidden` rasterizes differently between the two, and six captures
failed CI by 430–470 pixels each against a 202-pixel budget — pure corner
antialiasing, no layout change, and invisible until the diff image was opened.

Two things follow. Do not tune `maxDiffPixelRatio` to absorb a renderer gap you
can eliminate by using the right renderer. And when a snapshot fails on CI but
passes locally, **look at the diff image** before theorising: it localised that
failure to one 40×190px region in seconds.

The capture stylesheet (`CAPTURE_STYLES` in `visual-snapshots.spec.js`) forces
Arial over `body *`, not just the shell subtree — a surface that declares its
own `font-family` outside `.cd2004-shell` otherwise keeps it and encodes a
webfont into the baseline. That was the Phase 2a CI failure, in the
unsupported-viewport gate.

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
7. **Grep the whole file before editing a rule.** `meditech-workstation.css`
   declares the same selector up to four times, in blocks that override one
   another — the base block, two `min-width: 701px` blocks, and a trailing
   unconditional `@media screen` pass at the end of the file. Whichever comes
   last wins, so editing the first one you find usually changes nothing on
   screen and looks like the change "did not work". Phase 2 folded the rail,
   the header, the window and the status bar; the worklist, the launcher, the
   start centre and the workflow panels have not been checked.
8. **`tebra-screen-contract.css` loads last and can silently claim a surface.**
   Its control grammar addresses `.cd2004-nav-item`, which is both a launcher
   tile and a section-rail row; the rail rows had to be excluded by selector
   before their own declaration could take effect. When a rule in
   `meditech-workstation.css` appears to do nothing, check the contract too.

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

`Build and Deploy` is red on PR **#62** and **it is not that PR's failure.**
Azure rejects the preview deploy with:

```
This Static Web App already has the maximum number of staging environments.
```

Every PR **based on `main`** claims one Static Web Apps staging environment; the
Free tier allows three. Every code-level job passes. The remedy belongs to a
maintainer: close one stale draft PR, or upgrade the SWA plan. A standing-down
comment is already posted on #62 (`issuecomment-5504255572`) — do not post a
second one while that blocker holds.

**PR #63 does not have this problem.** `build_and_deploy_job` is gated on
`github.base_ref == 'main'`, and #63 is based on #62's head branch, so the deploy
job never runs and no staging environment is claimed. Keep continuation PRs
based on the redesign branch and this stays true.

---

## 9. Remaining phases

| Phase | Scope |
| --- | --- |
| **3 — Conventions** | Facesheet cards, Open Notes table with sort/lock/status chips, hover patient card, `+ New Note` / `Print` / `More` / `Customize View`. **Where first-party feel is won or lost.** |
| **4 — Kiosk** | Kiosk shell (`?kiosk=1`), 7-step injection stepper over existing `InjectionPanel` tabs, touch site picker, Care Checklist rail, sign-and-next card. |
| **5 — Cleanup** | Delete dead MEDITECH CSS, update `README.md`. |
| **(carried)** | The all-caps strip vocabulary the chrome work left standing — `CLINICAL MODULES`, `RECORDS STAY IN THIS BROWSER`, `VIEW:`, `CMD`. These are section labels and an internal command prompt, not chrome, so Phase 2 left them; `MANIFEST.md` §4.7 retires them. |
| **(unscheduled)** | The `cd2004-*` / `meditech-*` / `wfp-*` class rename. Mechanical, ~1000 usages, touches every e2e selector — **its own phase**, never mixed with design work. |

Run the nine-question convention review in `MANIFEST.md` §5 screen by screen
before each phase ships.
