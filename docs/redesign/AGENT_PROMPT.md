# Agent Prompt — Tebra-Language Injection Kiosk

Copy everything below the line into a fresh agent session with write access to
`matthewyglesias-lab/MA-Workstation`.

---

You are rebuilding the presentation layer of the **IPMG MA Workstation** so that
it reads as **a module Tebra's own team built** — a focused injection station in
Tebra's design language, sitting beside their Clinical product without a seam.
Repository: `matthewyglesias-lab/MA-Workstation`. Branch:
`claude/ma-workstation-tebra-redesign-nu1aeq`.

**Read `docs/redesign/PLAN.md` and `docs/redesign/MANIFEST.md` before writing
code.** They carry the design rationale, the file-by-file manifest, the exact
Tebra tokens (extracted from Tebra's production CSS), and the convention spec.
This prompt is the operating brief; those two files are the specification.

## The bar

Not "Tebra-inspired." A medical assistant who uses Tebra all morning should sit
down here in the afternoon and notice nothing different about *how things work*.

Matching the palette is the easy tenth. The other nine tenths is convention
fidelity — and it is where a third-party build gives itself away:

- Their tables sort on header click and reverse on the second click.
- Their Open Notes runs `Patient · Lock · Type · Status · Visit Date`, and the
  whole row is the target.
- Their lock glyph reveals *who* holds the note on hover.
- Their status chips read `Incomplete`, not `PENDING_SIGNATURE`.
- Their action bar is `+ New Note` · `Print` · `More` · `Customize View`, in
  that order, top right.
- Their patient search takes "the first 2–3 letters of the patient's name or
  date of birth (mm/dd/yyyy)".
- Their Facesheet is a patient hub of summary cards with a left section rail.
- Their buttons are named after what the person is doing, never after the
  system's internals.

`MANIFEST.md` §4 specifies all of this. Build to it. `MANIFEST.md` §5 is a
nine-question convention review — run it screen by screen before each phase
ships. A "no" on any question is a seam, and seams are the whole point of this
project.

## The constraint that outranks everything

**The clinical engine does not change.** This is a presentation project.

For the current safety closure, both commands must print nothing. The explicit
base matters: a diff against `HEAD` becomes a false pass as soon as the closure
is committed, and `git diff` alone does not include untracked files.

```bash
safety_base=aed20964a1761b5affaaee9ef4e6925498156172
git diff --exit-code "$safety_base" -- public/legacy src/legacy src/domain \
  src/application src/persistence src/documentation tests/fixtures
git status --porcelain=v1 --untracked-files=all -- public/legacy src/legacy \
  src/domain src/application src/persistence src/documentation tests/fixtures
```

Those paths hold the dose tables, interval and missed-dose math, UDS gating,
AVS content, attestation, record locking, and the print renderers. They are
proven and frozen. If a visual change seems to require touching them, it is the
wrong change — restructure the presentation instead.

### Production Tebra safety boundary

Prefer a verified demo or test patient for every cloud-browser inspection. A
real patient chart may be observed only when necessary and remains strictly
read-only. Never open an editor when opening it creates a note unless the
patient is first verified as demo/test. Before every create, save, sign, submit,
delete, or upload action, re-verify that demo/test identity. Never copy PHI into
the repository, screenshots, logs, prompts, or test fixtures.

## Three traps that will bite you

1. **Print.** `public/legacy/legacy.css` is loaded from `index.html` at
   `media="print"` and solely owns the 8 patient-facing print sheets. Print
   output is asserted byte-identical against a fixture anchored to commit
   `bc4a255d`. **Every stylesheet you add must be wrapped in `@media screen`.**
   One `media="all"` link leaks the redesign into printed patient handouts and
   fails `npm run test:print`. That file was made print-only *specifically* so
   the screen cascade would be clean — the previous redesign needed ~900
   `!important` declarations because it was fighting a print stylesheet loading
   on screen. Do not undo that. Target zero new `!important`.

2. **`scripts/check-app.js`.** It asserts roughly 50 clinical-behavior regexes
   against the legacy runtime and markup — NKDA defaults, UDS panel neutrality,
   cup-expiry gating, dose-picker ordering, attestation preselection. If one
   goes red, your change reached the engine. **Revert it. Never relax the
   assertion.** The script also asserts that
   `src/presentation/clinical-desktop.css` and
   `src/presentation/workflows/workflow-panels.css` exist — keep those exact
   filenames, or update the path assertion in the same commit.

3. **Visual snapshots.** The eight committed Linux baselines are current for
   the Phase 4 base and authoritative only from the pinned Chromium 151 job.
   Local Chromium 149 differs by roughly 3–5%: use it for interaction checks,
   never to regenerate Linux baselines or justify a looser threshold. Review
   every intentional Chromium 151 update image-by-image. The `win32/`
   baselines cannot be regenerated in Linux CI; leave them and flag them as
   stale for a Windows maintainer.
   The safety closure changes only two synthetic v4 fixture shapes and an
   accessible row-name matcher so every screenshot assertion is reached; no
   PNG, CSS, threshold, browser pin, or workflow change belongs in that work.

## Phases

Use independently reviewable change sets, with CI green before moving on. Full
detail is in `PLAN.md` §4.

- **0 — Tokens.** `src/presentation/tebra-tokens.css` with the exact values from
  `MANIFEST.md` §3. **Add** `@fontsource-variable/inter` and
  `@fontsource-variable/jetbrains-mono`; **keep `plus-jakarta-sans`**, which the
  AVS print sheet depends on. No structural change. *(Done.)*
- **1 — Voice.** Microcopy per `PLAN.md` §2.4, routed through one
  `src/presentation/vocabulary.ts`. **Never touch** `WorkflowId` union values,
  store keys, persistence keys, or `statementVersion` — those are addressed by
  legacy panel selectors and persisted inside saved records. *(Done.)*
- **2 — Chrome.** `AppHeader`, `SectionRail`, footer, dialogs, buttons, fields.
  Retire `meditech-screen-contract.css/.spec.js` for
  `tebra-screen-contract.css/.spec.js`. *(Done.)*
- **3 — Conventions.** Facesheet cards, Open Notes table with sort/lock/status
  chips, hover patient card, `+ New Note` menu, `Print`, `More`,
  `Customize View`. This phase is where first-party feel is won or lost.
  *(Done.)*
- **4 — Product Voice.** Contemporary duotone icons and illustrations, display
  typography, component-owned control geometry and neutral untouched-readiness
  presentation. Information architecture remains task-shaped. *(Done.)*
- **Safety closure.** Before Kiosk, finish presentation-layer guards and
  synthetic regression coverage for transient drafts, record switching,
  patient-scoped handoffs, addenda/photos, navigation vetoes and
  keyboard/accessibility behavior. UDS mutations require the session-held Web
  Lock; pending/busy/unsupported contenders are read-only and old tabs must be
  closed or reloaded during rollout. Injection uses exact durable guards and a
  same-write material semantic sidecar but has no CAS/Web Lock, so only one
  editable Injection tab is supported. The full local gate and pushed Chromium
  151 CI must pass.
- **5 — Kiosk.** Kiosk shell (`?kiosk=1` + persisted preference), 7-step
  injection stepper mapped 1:1 onto existing `InjectionPanel` tabs, large touch
  site picker, Care Checklist rail, sign-and-next card.
- **6 — Cleanup.** Delete dead MEDITECH CSS, update `README.md`.

The stepper is a **navigation and progress skin** over existing panel tabs. The
engine still owns every gate — do not reimplement validation in the stepper.

## Judgment you must exercise

**Calibrate density to Tebra's product, not their marketing site.** Their
marketing pages are airy — 18px body, 57px buttons, 24–32px radii. Their
*product* is much denser: tables, cards, a section rail, real clinical data on
one screen. `MANIFEST.md` §3 gives you two token tiers. The brand tier goes on
surfaces a touchscreen genuinely wants big (facesheet banner, primary action,
site picker, sign card); the workstation tier carries everything else. Too airy
reads as the marketing site pretending to be an app; too dense reads as the old
MEDITECH shell wearing Tebra colors. Both are seams.

**Two rules you may not trade away:**

- **Coral `#ff8d6e` is the single primary action on a screen, and never carries
  clinical meaning.** It sits too close to a warning hue. Clinical state uses
  the separate triad in `MANIFEST.md` §3.2.1.
- **Status is never color-only.** Every stop / review / ready state carries an
  icon *and* a word. Verify `src/presentation/workflows/StatusFlag.tsx` still
  enforces this after you restyle it.

Verify contrast yourself: ≥ 4.5:1 body text, ≥ 3:1 UI boundaries. The triad
values are a starting point, not a guarantee.

## Where fidelity stops, and why

Match Tebra's craft completely. Be unambiguous about what system this is. The
reason is clinical, not legal.

**This app has no server, no database, and no sync.** Records, drafts, and audit
activity live in the current browser and nowhere else. If the interface becomes
visually indistinguishable from Tebra with no other signal, a medical assistant
will reasonably conclude their documentation reached the patient's chart. It did
not. The more faithful the design gets, the sharper that failure mode becomes.

So the fidelity work *raises* the bar on the disclosure rather than removing it:

- The module presents truthfully as an IPMG module — its own name, its own mark
  — built in Tebra's language. Not as Tebra itself.
- Design the local-only storage disclosure properly: in Tebra's voice and
  component grammar, always visible, never a bolted-on warning banner. A
  Tebra-quality team would sweat exactly this detail.
- **Do not ship Tebra's logo or wordmark**, and do not imply endorsement or
  affiliation. Tebra is a third-party trademark.
- **Do not ship Akkurat LL or Akkurat Mono LL** — commercial Lineto families,
  not licensed here. Ship Inter Variable + JetBrains Mono per the manifest.
- **Do not add navigation to features that do not exist here**: Charge Capture,
  ePrescribe, Patient Portal, Message Center, Billing, Telehealth, Labs
  ordering, Referrals, Recall. A first-party module never links to a feature
  that isn't there — dead ends are the most obvious tell of all.

## Technical facts

- Preact (not React). Strict TypeScript with `noUncheckedIndexedAccess`.
- Node 22. Vite 8, Vitest 4, Playwright 1.62.
- Viewport floor **800×600**. 390px is an intentional unsupported-mobile gate —
  keep it failing gracefully.
- Kiosk mode stays fully keyboard-operable, honors `prefers-reduced-motion`
  (cap Tebra's `.3s` transitions to 0), and keeps the skip link and every
  existing ARIA role.
- Minimum touch target in kiosk mode: 44×44 CSS px.
- Keep `useIdleLock` (15-minute idle lock) semantics exactly; restyle only.
- Keep `FunctionKeyProfile` commands; demote the deck to a power-user popover
  rather than deleting it.

## Verify before every commit

```bash
npm run check        # typecheck + all ~50 clinical assertions
npm run test:unit
npm run build

# Local Chromium 149 is interaction/computed-layout evidence only. Run the
# explicit non-baseline list in HANDOFF.md §5; do not use npm run test:e2e,
# test:ci, test:visual, or test:print as local visual authority.

safety_base=aed20964a1761b5affaaee9ef4e6925498156172
git diff --exit-code "$safety_base" -- public/legacy src/legacy src/domain \
  src/application src/persistence src/documentation tests/fixtures
git status --porcelain=v1 --untracked-files=all -- public/legacy src/legacy \
  src/domain src/application src/persistence src/documentation tests/fixtures

# These base-relative tracked and untracked checks must also print nothing for
# every **/*.css file and tests/e2e/*-snapshots/** path.
```

The pushed exact-production-artifact job runs every interaction, visual, and
print test with pinned Chromium 151. Regenerate baselines only for an
intentional visual change on that renderer. Never update them from local
Chromium 149.

> **Continuing rather than starting?** `docs/redesign/HANDOFF.md` carries the
> live state, the paste-able continuation prompt, the sandbox Playwright config,
> and the phase-by-phase numbers. Read that first; this file is the standing
> brief it refers to.

## Current state — read this before starting

Phases 0–4 are landed on the branch. The safety closure passes its local gate
(653/653 units and 177/177 explicit non-baseline interactions) and awaits
pushed Chromium 151 verification before Phase 5. What that means for you:

- **`src/presentation/vocabulary.ts` is the single source of user-facing copy.**
  New strings go there, not inline. `tests/unit/vocabulary.test.ts` guards it,
  including a case-insensitive check that the readiness verdict is never worded
  as clearance to administer, and a check that internal vocabulary (attest,
  posting, local record, projection) stays off the screen.
- **`src/presentation/tebra-tokens.css` holds the token vocabulary** and is
  imported first in `ClinicalDesktopShell`. It declares `:root` properties
  only; the Phase 2+ presentation stylesheets consume those names.
- **Display copy no longer lives in `src/application/`.** Three label maps were
  extracted (readiness verdict, record lifecycle, transaction phase); the
  projections return `tone` / `state` / `phase`. See `MANIFEST.md` §1 amendment.
  The rest of `src/application/**` is still frozen.
- **The shell and Product Voice redesign are implemented.** Preserve the
  current information architecture while closing record-integrity,
  draft-preservation and accessibility gaps; Kiosk comes only after green CI.

Three things that cost time in Phase 1, so you do not repeat them:

1. **Grep for HTML entities too.** `Attest &amp; lock local record` in JSX did
   not match a plain-text grep and survived a full pass.
2. **Some strings are data, not copy.** `statementVersion:
   "local-attestation-v1"` is persisted in saved records. Patient names like
   `"QA, Start Center Open"` are test fixtures typed into inputs. Neither is UI
   copy; renaming either breaks something real.
3. **The renderer distinction is settled.** Pinned Chromium 151 is the
   visual/print authority. Local Chromium 149 is interaction evidence only and
   materially drifts from the committed images. Do not regenerate or loosen
   thresholds for it. See `MANIFEST.md` §2.3.

## Deliverable

Commit each phase separately with a clear message. Continue draft PR #62 on
`claude/ma-workstation-tebra-redesign-nu1aeq`. In the PR body: what changed per
phase, the §5 convention review result, explicit
confirmation that the frozen-path diff is empty and print is zero-diff, and a
flag on the stale `win32/` visual baselines.

If something in the plan turns out to be wrong once you are in the code, say so
plainly in the PR and finish the rest — do not silently narrow the scope.
