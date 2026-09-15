# Handoff — Tebra Injection Kiosk Redesign

**Updated:** 2026-09-07 · Safety closure in verification
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
> PR #62 is complete through Phase 4 Product Voice. A presentation-layer
> safety closure is now in verification before Phase 5 begins. Azure deployment
> alone is blocked because the Static Web App already has its maximum number of
> staging environments; do not delete an environment or conflate that external
> capacity error with a code failure. Leave the eight `win32/` images unchanged
> and flagged stale for a Windows maintainer.
>
> The remote head, `aed2096`, contains Phase 4 Product Voice and its corrected
> product-family information-architecture rationale. The current working tree
> adds safety closure around transient Forms/Samples notes, UDS record switching
> and exclusive mutation access, Injection draft preservation and navigation
> vetoes, patient-scoped note handoffs, duplicate note labels, keyboard
> operation, and malformed local records. Keep these changes synthetic and
> presentation-scoped; do not edit the frozen clinical or persistence paths.
>
> **Your first job is to finish and verify the safety closure, not Kiosk work.**
> Run the static, unit, build, non-baseline interaction, and frozen-path gates
> before pushing; the pushed job owns renderer-sensitive print/visual checks.
> The committed Linux baselines are already current and authoritative
> for the Phase 4 base: GitHub's pinned chromium-1234 (Chromium 151) passed the
> production browser/visual/print job 129/129. Do NOT regenerate them with the
> local Chromium 149, which differs by roughly 3-5%, and do not loosen the
> threshold to absorb that. Use Chromium 149 for interaction evidence only.
>
> **Then take Phase 5.** Kiosk shell (`?kiosk=1`), the 7-step injection stepper
> over the existing `InjectionPanel` tabs, touch site picker, Care Checklist
> rail, and sign-and-next card, per `MANIFEST.md` §2.1, `PLAN.md` §4, and this
> handoff's §9.
>
> The bar is *a module Tebra's own team built*: a Tebra user should notice no
> seam in how anything works. The engine does not change — this is a
> presentation project, and `git diff --stat` over the frozen paths must be
> empty at review.

> **Production Tebra boundary:** prefer a verified demo/test patient for every
> cloud-browser inspection. Real charts are observation-only and only when
> necessary. Never open an editor that creates a note for a real patient.
> Re-verify the demo/test identity before every create, save, sign, submit,
> delete, or upload action, and never copy PHI into repository files,
> screenshots, logs, prompts, or fixtures.
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

PR #62 was fast-forwarded through Phase 2c with GitHub's Git Data API because
the shell had no Git credential. The API-authored commit ids differ from the
local ids, but both tree hashes were checked byte-for-byte before the ref moved.

| Commit | Phase | What it did |
| --- | --- | --- |
| `b11e228` `43994ea` | — | The specification: plan, manifest, agent brief, convention spec |
| `0f89f28` | **0 — Tokens** | `tebra-tokens.css` (the full colour/type/geometry/motion vocabulary, `:root` declarations only, `@media screen`). Added Inter Variable + JetBrains Mono. Boot splash and favicon in the palette. Deliberately pixel-inert in the shell. |
| `bf4ab1a` | **1 — Voice** | `vocabulary.ts` as the single source of user-facing copy. Dashboard / Open Notes / Facesheet / Care Checklist / Sign / Incomplete. Display copy extracted out of `src/application/`. |
| `b674907` | **2a — Visual base** | Retargeted the existing chrome and workflow styles at their source; removed the MEDITECH workstation and screen-contract stylesheets. |
| `1387d10` local / `4c1df21` remote | **2b — Shell** | Adds `TebraChrome`, `AppHeader`, `SectionRail`, `tebra-workstation.css`, the flat white application shell, loading skeleton, and current Tebra screen contract. Exact tree `4d32a24`. |
| `fb54d4a` local / `7eb8c9e` remote | **2c — Authenticated-product refinement** | Aligns measured shell/workflow geometry; repairs responsive clinical reachability, lifecycle/accessibility chrome, menu tracking, and immediate F12 dispatch; records the production-safe Tebra audit. Exact tree `f1daed58`. |
| `069ac15` local / `4cdce08` remote | **2d — Visual setup** | Removes the retired green-banner pixel assertion from the functional draft-opening helper so all three responsive states reach their snapshot assertions. |
| `13f7359` local / `353c117` remote | **2d — Visual closure** | Promotes the eight reviewed Chromium 151 Linux captures and records their provenance. `win32/` remains intentionally untouched. |
| `b791b21` | **3a — Global Open Notes** | Shared semantic five-column table for Injection and UDS; Visit Date sort, lifecycle chips, truthful signed lock, whole-row keyboard/mouse opening, exact 44px/mint grammar, synthetic tests. |
| `9988c71`–`681d4d4` | **3b–3e — Patient conventions and visual closure** | Patient chart and shared list grammar; desktop chrome retirement; reviewed Chromium 151 Linux baselines; 800×600 reachability repair. |
| `8592715` / `aed2096` | **4 — Product Voice** | Contemporary icon/illustration language, display typography and control geometry; corrected the chart-clone premise without changing information architecture. |
| *working tree* | **Safety closure** | Synthetic regression coverage and presentation guards for transient-note replacement, UDS record integrity, addenda/photos, navigation vetoes, keyboard access and duplicate note labels. Full verification and CI are still required before Phase 5. |

**Phase 4 Product Voice is complete on the remote head.** The safety-closure
working tree is intentionally a gate between it and Phase 5: no Kiosk work
starts until the closure is committed, pushed, and its authoritative CI is
green apart from the known Azure capacity failure.

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

### 4.1 Live Tebra Notes audit — Phase 3 source and status

Every real-patient view in the production audit was read-only. On a separately
verified Test Patient, opening the Injection editor automatically created one
blank `Incomplete` note. No clinical text was entered and no Save, Sign,
Submit, or Delete action was used. The audit confirmed that "Notes" is not one
interchangeable component:

| Tebra surface | Measured grammar | Workstation destination |
| --- | --- | --- |
| Global **Open Notes** | Legacy sparse table; observed header near `#d4e0dd` (repository token `#d2dcda`); 44px white rows; visible visit-date sort caret; dedicated lock column; the row opens the note. | **Phase 3a implemented:** `RecordsWindow.tsx` and `UdsRecordsWindow.tsx` share `NotesTable`. |
| Patient chart **Notes** | Four 200×40 filters in a white radius-4, elevation-1 panel; 100px rows with 16px padding, about 20px bold title and 14px metadata; `Open` is 73×38. Observed chips: `Open` 59×32 on `#f0faf2`; `Signed` 69×32 on `#f0eee8`. | **Phase 3b implemented:** `notes/PatientNotesList.tsx`, a separate component from `NotesTable` by design. |
| Note creation | Coral 36px split `New Note`; adjacent menu about 242px wide with 36px rows. Opening an editor can itself create an `Incomplete` note. | **Phase 3b implemented:** `shell/ActionBar.tsx`. The blank-note side effect is deliberately NOT copied - opening a chart writes nothing, and an e2e test asserts it. |

Use the modern authenticated product as the source of truth for shell, cards,
fields, and actions. The legacy Open Notes/editor surface contributes its
workflow structure — sparse worklist, date sorting, lock placement, and note
editing sequence — but never its surrounding chrome or old control styling.

Phase 3a resolves signing staff/time from `attestation`; Injection Visit Date
from `fields.adminDate`; UDS Visit Date from `collectionDateTime`; and only then
falls back to `createdAt`. Persisted drafts are `Incomplete`; completed records
are `Signed`; `Ready to sign` is reserved for explicit live readiness and is
never inferred from populated fields.

### 4.2 Phase 3b outcome, and the deviations worth knowing

The page-level action bar, patient search, Facesheet, hover card and modern
patient Notes surface all landed. Three decisions are load-bearing:

- **The masthead is suppressed while a chart is open.** The strip is the open
  note's context, and over a chart it repeated that chart's own header and
  claimed "No patient selected" directly above a Facesheet. Clinic and staff
  are already in the header's top right, so suppressing it removed duplication
  rather than information. The one fact it uniquely carried - that a note is
  open for a different patient - moved into the chart header as a review-toned
  notice. The rail's context block and its patient group follow the browsed
  chart for the same reason.
- **The rail is a flex column, not a three-row grid.** Its children are now
  conditional (search, and the patient group), and the old
  `grid-template-rows: auto auto minmax(0, 1fr)` counted for three: the fourth
  and fifth children landed in the wrong rows and the context block was drawn
  over the group heading below it. Nothing places rail children explicitly, so
  the switch is contained.
- **Patient search sits in the section rail, not the product header.** Tebra
  centres it in the header. Measured at 1440 / 1366 / 1024 / 840 / 800, this
  module's header cannot hold it: the absolutely-positioned menu bar - an
  affordance Tebra does not have - owns the centre, leaving 326px of clear
  space at 1440 but only 122px at 1024 and about 55px at the 800px floor.
  Putting it in the header made it collide (the first e2e run failed on the
  menu bar intercepting the click) and would have made it vanish exactly at the
  supported minimum. The rail is 158-192px at every width and is already where
  this app's patient context lives. A repository adaptation; revisit only if
  the menu bar ever leaves the header.
- **`chartPatientKey` collapses internal whitespace; `siteHistoryPatientKey`
  does not.** It normalizes runs of whitespace before delegating, so
  `"Baker,   Test"` and `"Baker, Test"` are one patient. Rotation lookups still
  pass the name exactly as the note recorded it, so that store's own keying is
  unchanged.
- **The chart index keys on the record's real `patient.name`, never on
  `NotesTableRow.patientLabel`.** That label falls back to the record summary,
  which turned an unnamed draft into a browsable patient named after its
  medication. `recordIdentity()` exists for exactly that reason.

The last two were caught by the new unit test, not by review. Keep it.

---

## 5. The verification gate

Run all of it before every commit. This closure has no intentional CSS or
baseline-image change. Local Chromium 149 is authoritative for interactions
and computed-layout contracts only; GitHub's pinned Chromium 151 owns the full
visual/print result.

```bash
export VITE_ENABLE_INJECTION_PATIENT_SCREENING=true
npm run check
npm run test:unit
npm run build

test -f dist/index.html
test -f dist/staticwebapp.config.json
test -f dist/legacy/legacy-runtime.js
test -f dist/legacy/legacy.css

npx playwright test --config=<Chromium-149 config, see below> \
  tests/e2e/conventions.spec.js \
  tests/e2e/injection-decision-support.spec.js \
  tests/e2e/injection-full-draft-safety.spec.js \
  tests/e2e/persistence-hardening.spec.js \
  tests/e2e/print-hardening.spec.js \
  tests/e2e/tebra-screen-contract.spec.js \
  tests/e2e/uds-record-integrity.spec.js \
  tests/e2e/visual-contracts.spec.js \
  tests/e2e/workstation.spec.js

safety_base=aed20964a1761b5affaaee9ef4e6925498156172
assert_unchanged() {
  scope_name=$1
  shift
  git diff --exit-code "$safety_base" -- "$@"
  if git status --porcelain=v1 --untracked-files=all -- "$@" | rg .; then
    echo "Unexpected changes in ${scope_name}" >&2
    return 1
  fi
}
assert_unchanged frozen-clinical-paths \
  public/legacy src/legacy src/domain src/application src/documentation \
  src/persistence tests/fixtures
assert_unchanged stylesheets ':(glob)**/*.css'
assert_unchanged visual-baseline-images \
  ':(glob)tests/e2e/*-snapshots/**'
```

Do not use local `npm run test:e2e`, `npm run test:ci`, `npm run test:visual`,
`npm run test:print`, or `--update-snapshots` as release evidence: those mix
Chromium-151-sensitive PNG/PDF assertions into a Chromium 149 run. A local
`print-regression.spec.js` run may be diagnostic only. The pushed
`Test the exact production artifact` job runs the complete suite with the
pinned renderer and is the release gate.

### Running Playwright in a remote sandbox

The current workspace has Chromium 149 and a throwaway local Playwright config
at `/workspace/scratch/7f69ca486a14/playwright.current.config.cjs`. Use that
exact config while this scratch workspace exists. If it does not, recreate an
equivalent config from the recipe below. Never commit the executable path or
run visual/print baseline updates through it. GitHub's repo-pinned
chromium-1234 (Chromium 151) remains the authoritative visual and print
renderer.

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

Use the explicit nine-file command in §5, substituting the recreated config
path. A generic all-suite command is intentionally not shown because it would
reintroduce the false local baseline failures this split prevents.

### Current local verification status

**Safety-closure working tree:** the local gate is complete. TypeScript/static
checks, the production build, and **653/653 unit tests** pass.
Focused synthetic interaction results include Injection safety **27/27**, UDS
record integrity **22/22**, date/viewport regressions **5/5**, and UDS
lock/focus handoffs **3/3**; these sets overlap and must not be summed. The
explicit nine-file Chromium 149 interaction run passed **177/177** serially;
the base-relative frozen, CSS, PNG, package/browser-config, and workflow checks
also passed with no changes. Do not mark the closure complete or begin Phase 5
until the pushed Chromium 151 exact-production-artifact job is green.
Renderer-sensitive print and visual release evidence comes only from that
pushed job, not local Chromium 149.

All patient names and clinical details in the new coverage are synthetic test
fixtures. The closure must not add captured production data, touch the frozen
engine/persistence paths, or create a new visual baseline from Chromium 149.

**Historical Phase 3b evidence, temporary Chromium 149:**

- `npm run check` - passed (typecheck plus the ~50 clinical assertions).
- Unit tests - **602/602 passed** across 39 files (Phase 3a was 580/580; the 22
  new ones are `patient-chart-model.test.ts` plus four vocabulary guards).
- `npm run build` - passed.
- `conventions.spec.js` - **17/17 passed**: the 5 Phase 3a global-ledger cases
  plus 10 Phase 3b cases covering search, Facesheet cards and their stated
  rules, the hover card, the 200x40 / 100px / 73x38 patient-list grammar, the
  single coral action group and its 242px menu, Customize View persistence
  across a reload, read-only browsing, opening an injection note and a UDS
  note, and 800x600 containment.
- The five browser suites together - **101/101 passed**. No journey regressed
  from the shell changes, and Phase 3b touches no print source.
- Frozen-path diff - empty.
- New `!important` declarations - **zero**.
- **CSS delta: +801 lines** (12,156 -> 12,957), of which about 150 are the
  compact-width block. Cumulative is now **+300 over the 12,657-line starting
  point**, so the redesign is net UP on CSS for the first time. Read that
  honestly rather than against the old cumulative reduction: Phase 3b adds five
  components that had no predecessor to delete, so there was no MEDITECH rule
  to remove at its source. The posture's other four clauses hold (no new
  `!important`, no dead conditionals, no class derived from copy, all copy in
  `vocabulary.ts`). If the net-down clause is to be met, Phase 6's deletion of
  dead MEDITECH CSS is where it happens, and it should be sized against this
  number.
- **Visual snapshots pass.** The eight Linux baselines were regenerated on the
  pinned chromium-1234 after the §5 safety check confirmed this environment
  reproduces the CI renderer, and every image was reviewed at full resolution.
  The full suite is 129/129.

**Prior (Phase 3a) status, retained for comparison:**

- Phase 3a: `npm run check`, 580/580 unit tests, and the production build pass.
  The frozen-path diff is empty, no `!important` was added, and Phase 3a CSS is
  net -15 lines (`clinical-desktop.css` -27; lifecycle tokens +12).
- Phase 3a conventions: 5/5 passed on temporary Chromium 149, including exact
  columns/header/44px rows, sort reversal, truthful lock tooltip, icon+word
  chips, non-mutating hover/focus/sort, mouse/Enter/Space open, and 800x600.
- Broader changed interaction coverage: 80/80 passed (68 workstation/decision/
  conventions journeys plus 12 persistence/screen/visual-contract checks).
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
- Phase 3a full print suite on Chromium 149: 27/30 passed. The three AVS layout
  failures are the documented non-authoritative browser drift; Phase 3a changes
  screen-only drawer CSS and no print source. Chromium 151 CI is authoritative.
- Pinned Chromium 151 CI run `34058368138` completed 105/112 tests; its only
  seven failures were the deliberately stale visual-snapshot tests. All other
  browser and print paths passed. The run produced all eight named actual PNGs.
- The closure commit imports those exact PNGs. Its follow-up exact-artifact CI
  run `34060740885` passed.

### Visual baselines

The eight committed Linux states are current for the Phase 4 base and passed in
the pinned Chromium 151 production-artifact job: empty chart, Dashboard
worklist, active draft at 1366, active draft at 840, minimum 800×600, ready to
sign, signed/read-only, and the deliberate 390px unsupported gate. They contain
fixed synthetic fixtures only, not production patient data.

Chromium 151 is the sole visual authority. Temporary Chromium 149 differs from
these images by roughly 3–5%, so it must not regenerate them and the threshold
must not be loosened to accommodate it. If an intentional later visual change
requires new baselines, capture them with the pinned Chromium 151 job and
review every image at full resolution before promotion. The `win32/` set still
shows the pre-Phase-2b shell and can only be refreshed on that platform.

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
7. **The stale baseline was hiding a real failure.** `minimum workstation
   keeps command disclosure and clinical actions reachable` asserts 800x600
   containment *after* its screenshot. While the baseline was stale the
   screenshot assertion threw first, so those containment checks never ran -
   and a genuinely clipped control sat undetected behind a failure everyone
   (including this handoff) had written off as cosmetic. For an intentional
   visual change, regenerate promptly on authoritative Chromium 151 and review
   the image; this nonvisual safety closure must keep the current PNGs
   unchanged. A stale baseline is not a harmless red, and neither is a
   mismatched-renderer diff evidence that a baseline is stale.
   The safety closure repairs the *synthetic setup* for two Injection v4 rows in
   `visual-snapshots.spec.js` by supplying required empty encounter sections
   and matching the accessible row name with its date suffix. All seven tests
   now reach their eight screenshot assertions. No PNG, CSS, threshold, browser
   config, package pin, or workflow changed.
8. **A transient must never enter a baseline.** The toast clears on a 4s
   timer, so whether it appears in a capture depends on how long the preceding
   steps took. It is excluded in `CAPTURE_STYLES`, alongside the print action.
9. **A panel that is not mounted cannot hear an event.** Phase 3b's chart
   replaces the work area, so `UdsPanel` is unmounted while a chart is open.
   The production chart path now calls the top-level `onOpenUdsRecord` boundary,
   which validates and stages the durable record before navigation. The delayed
   `WORKSTATION_OPEN_NOTE_REQUEST` path remains only as a fallback for a shell
   without that callback; it must still dispatch after the panel mounts. Any
   future event-only shell-to-panel request has the same timing hazard.
10. **`.wfp-panel` renders encounter fields, not the record summary.** An e2e
   assertion that a resumed record shows its `summary` string will fail even
   when the restore worked. Assert a restored field value instead - the
   existing UDS journeys use `input[placeholder="Last, First"]`.
11. **A blanket reset can outrank every component that names a token.** Until
   Phase 4, `clinical-desktop.css` carried
   `.cd2004-shell button, input, select, textarea { border-radius: 0 }` - left
   over from the hand-painted beveled chrome that Phase 3c deleted. At (0,1,1)
   it beat `.tebra-record-action { border-radius: var(--tw-radius-action) }`, so
   the shell rendered square no matter what the tokens said, and the tokens
   looked wrong when the reset was at fault. If a token appears not to apply,
   check the computed value in the browser and find the *matched rules* -
   `CSS.getMatchedStylesForNode` over a CDP session names the offender in
   seconds - before concluding the token is wrong.
12. **`ReadinessVerdict.tone` is coarser than it looks.** It reports `"blocked"`
   when `blockers || pending`, so a note nobody has typed into yet is
   indistinguishable by tone from one holding a contraindication. Read
   `verdict.blockers` when the presentation needs to tell them apart. Do not
   "fix" this in `readiness-projection.ts`: it is frozen, and presentation is
   the layer that chooses treatment, exactly as it chooses the words.
13. **UDS and Injection have deliberately different concurrency guarantees.**
   UDS holds an exclusive same-origin Web Lock in the unkeyed application
   parent for the whole time UDS is selected, so keyed panel remounts and chart
   Open/New handoffs keep one owner. Every mutation requires owned access;
   pending, busy, or unsupported sessions are read-only and contenders do not
   auto-promote. Leave and reopen UDS after the owner releases the lock.
   A durable change to the active UDS row also latches an output quarantine:
   stale report preview, print, panel copy, shell copy, and confirmations stay
   unavailable until staff explicitly re-open freshly validated bytes.
   Pre-deploy tabs and direct/noncooperating `localStorage` writers do not honor
   that lock, and there is no CAS against them: close or reload old tabs during
   rollout. Injection re-reads durable bytes, reacts to storage events, and
   embeds its material semantic sidecar in the frozen writer's same write, but
   it has no Web Lock or CAS. One editable Injection tab is the supported mode.
14. **A cached chart row is not authority for patient identity.** Both UDS and
   Injection chart opens re-read the durable record and compare normalized
   name plus DOB before changing patient, workflow, or active-record state. A
   mismatch keeps the chart open, writes nothing, announces the problem, and
   defers index refresh until the chart closes so the user must search and
   explicitly select the record under its current patient.

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

PR #62 remote head `aed2096` (Phase 4 documentation correction) passed the
pinned Chromium 151 production browser, visual, and print job **129/129**.
The committed Linux baselines are current for that base. `Build and Deploy`
remains the only known external red because Azure Static Web Apps is at its
staging-environment capacity; no deployment started. Do not delete an
environment without separate authorization.

The safety-closure working tree has not yet established an authoritative CI
result. Push it only after the complete local gate passes, then inspect the
exact-artifact job. Treat pinned Chromium 151 as visual/print authority;
temporary Chromium 149 is interaction evidence only. Do not refresh snapshots
merely because Chromium 149 reports pixel drift.

---

## 9. Remaining phases

| Phase | Scope |
| --- | --- |
| **2b — Shell** | **On PR #62.** App header, section rail, footer, dialogs, buttons, fields, loading skeleton, and deletion of the MEDITECH contract. |
| **2c — Authenticated-product refinement** | **On PR #62.** Measured geometry, responsive/keyboard repairs, lifecycle footer, inspector, and UDS scroll ownership. |
| **2d — Visual closure** | **On PR #62; exact artifact green.** Eight reviewed Chromium 151 Linux baselines; `win32/` remains stale for a Windows maintainer. |
| **3a — Global Open Notes** | **On PR #62.** Shared Injection/UDS table with date sort, lock, lifecycle, and whole-row open conventions. |
| **3b — Patient conventions** | **On PR #62.** Facesheet cards; separate modern patient Notes filters/list; patient search and hover card; page-level coral split `New Note`, backed actions only. |
| **3c — Retire the desktop chrome** | **On PR #62.** Menu bar, status bar and transaction-code chip deleted; account menu and Toast added. |
| **3d — One list grammar** | **On PR #62.** The Dashboard's 2004 worklist table becomes the same card list the patient chart uses. |
| **3e — Visual closure** | **On PR #62; exact artifact green.** Eight baselines regenerated on the pinned browser and reviewed; a clipped 800x600 control fixed; the toast excluded from captures. |
| ~~3b/3c visual closure~~ | ~~Superseded by 3e; done.~~ |
| **4 — Product voice** | **On PR #62.** Contemporary duotone icon set; spot illustrations for empty states; Plus Jakarta Sans on the display tier; component-owned geometry; lighter masthead; neutral treatment for an untouched readiness state. Information architecture deliberately unchanged — see `PLAN.md` 2.1, amended. |
| **Safety closure** | **Working tree; full gate and CI pending.** Synthetic record-integrity, draft-preservation, navigation-veto and accessibility coverage before Kiosk work. |
| **5 — Kiosk** | **Next only after safety closure CI.** Kiosk shell (`?kiosk=1`), 7-step injection stepper over existing `InjectionPanel` tabs, touch site picker, Care Checklist rail, sign-and-next card. |
| **6 — Cleanup** | Delete dead MEDITECH CSS, update `README.md`. |
| **(unscheduled)** | The `cd2004-*` / `meditech-*` / `wfp-*` class rename. Mechanical, ~1000 usages, touches every e2e selector — **its own phase**, never mixed with design work. |

Run the nine-question convention review in `MANIFEST.md` §5 screen by screen
before each phase ships.
