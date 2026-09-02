# Agent Prompt — Tebra-Language Injection Kiosk

Copy everything below the line into a fresh agent session that has write access
to `matthewyglesias-lab/MA-Workstation`.

---

You are rebuilding the presentation layer of the **IPMG MA Workstation** into a
**Tebra-language injection kiosk**. The repository is at
`matthewyglesias-lab/MA-Workstation`. Work on branch
`claude/ma-workstation-tebra-redesign-nu1aeq`.

**Read `docs/redesign/PLAN.md` and `docs/redesign/MANIFEST.md` first.** They
contain the full design rationale, the file-by-file change manifest, and the
exact Tebra design tokens (extracted from Tebra's own production CSS). This
prompt is the operating brief; those two files are the specification.

## The job in one paragraph

Today this app wears a 1990s MEDITECH client/server skin: Tahoma, square
bezels, a menu bar, an F-key command deck. Replace that with Tebra's design
language — deep teal `#004952`, coral `#ff8d6e`, warm sand `#f8f3eb`, rounded
generous controls, Tebra's real clinical vocabulary (*Facesheet*, *Open Notes*,
*Care Checklist*, *Sign*) — and reshape the shell around the one thing this
station does all day: **administering long-acting injectables**. It should feel
like a purpose-built Tebra kiosk: full-screen, touch-first, one patient at a
time, with a *sign → print handout → next patient* loop.

## The single most important constraint

**The clinical engine does not change.** This is a presentation project.

At PR time this command must print nothing:

```bash
git diff --stat -- public/legacy src/legacy src/domain src/application \
                   src/persistence src/documentation tests/fixtures
```

Those paths hold the dose tables, interval and missed-dose math, UDS gating,
AVS content, attestation, record locking, and the print renderers. They are
proven and they are frozen. If a visual change seems to require touching them,
it is the wrong change — restructure the presentation instead.

## Three traps that will bite you

1. **Print.** `public/legacy/legacy.css` is loaded from `index.html` at
   `media="print"` and solely owns the 8 patient-facing print sheets. Print
   output is asserted byte-identical against a fixture anchored to commit
   `bc4a255d`. **Every stylesheet you add must be wrapped in `@media screen`.**
   One `media="all"` link leaks your redesign into printed patient handouts and
   fails `npm run test:print`. That file was moved to print-only *specifically*
   so the screen cascade would be clean — the previous redesign needed ~900
   `!important` declarations because it was fighting a print stylesheet loading
   on screen. Do not undo that. Target zero new `!important`.

2. **`scripts/check-app.js`.** It asserts roughly 50 clinical-behavior regexes
   against the legacy runtime and markup — NKDA defaults, UDS panel neutrality,
   cup-expiry gating, dose-picker ordering, attestation preselection. If one
   goes red, your change reached the engine. **Revert the change. Never relax
   the assertion.** The script also asserts that
   `src/presentation/clinical-desktop.css` and
   `src/presentation/workflows/workflow-panels.css` exist — keep those exact
   filenames, or update the path assertion in the same commit.

3. **Visual snapshots.** All 8 Linux baselines will legitimately change. Update
   them **once per phase, deliberately**, and eyeball every image — never as a
   reflex to a red run. The `win32/` baselines cannot be regenerated in CI
   (`snapshotPathTemplate` is per-platform); leave them and flag them as stale
   in the PR body for a maintainer on Windows.

## What to build

Follow the phases in `PLAN.md` §5. One commit per phase, CI green before moving
on:

- **Phase 0 — Tokens.** Add `src/presentation/tebra-tokens.css` with the exact
  values from `MANIFEST.md` §3. Swap `@fontsource-variable/plus-jakarta-sans`
  for `@fontsource-variable/inter` plus a mono. No structural change yet.
- **Phase 1 — Vocabulary.** Rename user-facing labels to Tebra's real clinical
  nouns (`PLAN.md` §3). **Labels only** — do not touch `WorkflowId` union
  values, store keys, or persistence keys. Renaming a `WorkflowKey` breaks
  every saved record in a clinician's browser.
- **Phase 2 — Chrome.** App bar, module rail, footer, dialogs, buttons, fields.
  Retire `meditech-screen-contract.css/.spec.js` in favor of
  `tebra-screen-contract.css/.spec.js`.
- **Phase 3 — Kiosk.** Kiosk shell (`?kiosk=1` + persisted preference),
  persistent facesheet banner, 7-step injection stepper mapped 1:1 onto the
  existing `InjectionPanel` tabs, large touch site picker, Care Checklist rail,
  and the sign-and-next card.
- **Phase 4 — Cleanup.** Delete dead MEDITECH CSS, update `README.md`.

The stepper is a **navigation and progress skin** over the existing panel tabs.
The engine still owns every gate — do not reimplement validation in the stepper.

## Design judgment you must exercise

Tebra's public design language is a *marketing* language: 18px body, 57px
buttons, 24–32px radii. Applied literally to an injection worksheet it would
halve information density and push safety-critical fields below the fold. So
`MANIFEST.md` §3 gives you **two token tiers** — a brand tier (Tebra's real
sizes, for kiosk-primary surfaces: facesheet, primary action, sign card, site
picker) and a workstation tier (compressed, same colors and typeface, for dense
worksheets). Use the brand tier where a touchscreen genuinely wants a big
target. Use the workstation tier everywhere else. Getting this split right is
the difference between "looks like Tebra" and "is usable at the injection
station."

**Two rules you may not trade away:**

- **Coral `#ff8d6e` is the single primary action on a screen. It never carries
  clinical meaning.** It sits too close to a warning hue. Clinical status uses
  the separate triad in `MANIFEST.md` §3.2.1.
- **Status is never color-only.** Every stop / review / ready state carries an
  icon *and* a text label. Verify `src/presentation/workflows/StatusFlag.tsx`
  still enforces this after you restyle it.

Verify contrast yourself before shipping: ≥ 4.5:1 for body text, ≥ 3:1 for UI
boundaries. The triad values in the manifest are a starting point, not a
guarantee — check them.

## Do not ship

- **Tebra's logo or wordmark.** Tebra is a third-party trademark; this is an
  internal clinic tool in a Tebra-*inspired* language. The product stays
  IPMG-branded and must not imply Tebra endorsement or affiliation.
- **Akkurat LL / Akkurat Mono LL.** Commercial Lineto fonts, not licensed here.
  Ship Inter Variable + JetBrains Mono per the manifest. Do not download or
  self-host Akkurat.
- **Navigation to features that do not exist.** Tebra has Charge Capture,
  ePrescribe, Patient Portal, Message Center, Billing, Telehealth. This app has
  none of them. No dead-end menu entries.

## Technical facts

- Preact (not React). Strict TypeScript with `noUncheckedIndexedAccess`.
- Node 22. Vite 8, Vitest 4, Playwright 1.62.
- Supported viewport floor is **800×600**. 390px is an intentional
  unsupported-mobile gate — keep it failing gracefully.
- Kiosk mode must stay fully keyboard-operable, honor `prefers-reduced-motion`
  (cap Tebra's `.3s` transitions to 0), and keep the skip link and every
  existing ARIA role.
- Minimum touch target in kiosk mode: 44×44 CSS px.
- Keep `useIdleLock` (15-minute idle lock) semantics exactly; restyle only.
- Keep `FunctionKeyProfile` commands; demote the deck to a power-user popover
  rather than deleting it.

## Verify before every commit

```bash
npm run check        # typecheck + all ~50 clinical assertions
npm run test:unit
npm run test:print   # MUST be zero-diff
npm run test:e2e
git diff --stat -- public/legacy src/legacy src/domain src/application \
                   src/persistence src/documentation tests/fixtures   # MUST be empty
```

Regenerate baselines only when you intend to:
`npx playwright test tests/e2e/visual-snapshots.spec.js --update-snapshots`

## Deliverable

Commit each phase separately with a clear message. Push to
`claude/ma-workstation-tebra-redesign-nu1aeq` and open a **draft** PR. In the PR
body: list what changed per phase, state explicitly that the frozen-path diff
is empty, confirm print is zero-diff, and flag the stale `win32/` visual
baselines for a maintainer on Windows.

If you hit something in the plan that turns out to be wrong once you are in the
code, say so plainly in the PR and proceed with the rest — do not silently
narrow the scope.
