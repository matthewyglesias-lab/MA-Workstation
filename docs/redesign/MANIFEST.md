# Redesign Manifest

Companion to `PLAN.md`. This is the authoritative list of **what may change**,
**what is frozen**, and **the exact design tokens** to implement.

---

## 1. Frozen — do not edit

A change under any of these paths means the change is wrong. `git diff --stat`
against these must be empty at PR time.

```
public/legacy/legacy-runtime.js      11,605 lines — clinical runtime, authoritative
public/legacy/legacy.css              8,334 lines — print sheets, byte-identical fixture
src/legacy/legacy-markup.html           897 lines — legacy DOM the runtime binds to
src/legacy/loader.ts
src/legacy/clinical-source.ts
src/legacy/documentation-adapter.ts
src/legacy/shell-state.ts
src/domain/**                        dose tables, interval math, AVS content, screening
src/application/**                   store, coordinator, readiness + workstation projection
src/persistence/**                   storage keys, record codecs, activity log
src/documentation/**                 note grammar and encounter adapters
tests/fixtures/print-baseline-v1.json
tests/fixtures/clinical-parity-v1.json
scripts/generate-print-baseline-fixture.mjs
```

**Also frozen in behavior, editable in style only:**
`src/presentation/WorkstationLock.tsx` (idle-lock timing and semantics),
`src/presentation/FunctionKeyProfile.ts` (command vocabulary — restyle its
surface, do not remove commands).

---

## 2. Change manifest

### 2.1 New files

| Path | Purpose | Phase |
| --- | --- | --- |
| `src/presentation/tebra-tokens.css` | Single source of truth for brand + workstation tokens. `@media screen` scoped. Imported first. | 0 |
| `src/presentation/tebra-screen-contract.css` | Final screen contract; replaces `meditech-screen-contract.css`. Loaded last. | 2 |
| `src/presentation/kiosk/KioskShell.tsx` | Kiosk chrome: facesheet banner, single work column, sign-and-next. | 3 |
| `src/presentation/kiosk/FacesheetBanner.tsx` | Persistent patient banner. | 3 |
| `src/presentation/kiosk/CareChecklistRail.tsx` | Tebra presentation of `projectClinicalReadiness`. | 3 |
| `src/presentation/kiosk/InjectionStepper.tsx` | 7-step progress rail over existing `InjectionPanel` tabs. | 3 |
| `src/presentation/kiosk/SignAndNextCard.tsx` | Post-sign confirmation → print handout / next patient. | 3 |
| `src/presentation/kiosk/kiosk.css` | Kiosk-only layout. `@media screen`. | 3 |
| `src/presentation/use-kiosk-mode.ts` | `?kiosk=1` + persisted preference + Fullscreen API. | 3 |
| `tests/e2e/tebra-screen-contract.spec.js` | Replaces `meditech-screen-contract.spec.js`. | 2 |
| `tests/e2e/kiosk-flow.spec.js` | Identify → sign → next-patient loop. | 3 |

### 2.2 Modified files

| Path | Change | Phase |
| --- | --- | --- |
| `index.html` | Boot splash → Tebra teal/sand, title/meta copy. **Keep `media="print"` on the legacy stylesheet link.** | 0 |
| `favicon.svg` | IPMG mark in Tebra palette. Not a Tebra logo. | 0 |
| `package.json` | Swap `@fontsource-variable/plus-jakarta-sans` → `@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono`. | 0 |
| `src/main.tsx` | Font imports; kiosk-mode wiring (Phase 3). No coordinator/store changes. | 0, 3 |
| `src/presentation/clinical-desktop.css` | Retarget to tokens. **Keep the filename** (`check-app.js` asserts it). | 0, 2 |
| `src/presentation/meditech-workstation.css` | Rewrite as Tebra composition, or delete after `tebra-screen-contract.css` lands. | 2, 4 |
| `src/presentation/meditech-screen-contract.css` | Delete once replaced. | 2 |
| `src/presentation/workflows/workflow-panels.css` | Retarget to tokens. **Keep the filename** (`check-app.js` asserts it). | 0, 2 |
| `src/presentation/ClinicalDesktopShell.tsx` | Titlebar → app bar, nav → module rail, status bar → footer. Structure/ARIA preserved. | 2 |
| `src/presentation/types.ts` | `WORKFLOW_LABELS` string values only. **Do not touch `WorkflowId` union values.** | 1 |
| `src/presentation/MeditechChrome.tsx` | Rename to `TebraChrome.tsx`, restyle. | 2 |
| `src/presentation/StartCenter.tsx` | Label → "Dashboard"; Tebra cards. | 1, 2 |
| `src/presentation/RecordsWindow.tsx`, `UdsRecordsWindow.tsx` | Label → "Open Notes"; Tebra table. | 1, 2 |
| `src/presentation/RecordActionDialog.tsx`, `RecordLifecycleActions.tsx` | "Attest and lock" → "Sign". Copy only; no lifecycle change. | 1 |
| `src/presentation/WorkstationLock.tsx` | Restyle only. | 2 |
| `src/presentation/workflows/StatusFlag.tsx` | New status triad; **verify icon + text, never color alone.** | 2 |
| `src/presentation/workflows/OutstandingRequirements.tsx` | → "Care Checklist". | 1 |
| `src/presentation/workflows/injection/InjectionPanel.tsx` | Stepper integration. Field logic untouched. | 3 |
| `scripts/check-app.js` | Only if a CSS path in §2.2 is renamed — update the path assertion, **relax nothing else**. | 2 |
| `README.md` | Architecture + design-language section. | 4 |

### 2.3 Test artifacts that will change

| Path | Action |
| --- | --- |
| `tests/e2e/meditech-screen-contract.spec.js` | Delete; superseded by `tebra-screen-contract.spec.js`. |
| `tests/e2e/visual-snapshots.spec.js-snapshots/linux/**` (8 PNGs) | Regenerate once per phase, review each image. |
| `tests/e2e/visual-snapshots.spec.js-snapshots/win32/**` (8 PNGs) | **Cannot be regenerated in CI.** Flag as stale in the PR body. |
| `tests/e2e/visual-contracts.spec.js` | Update selector/style expectations. |
| `tests/unit/ehr-refinement-contracts.test.ts` | Update if it asserts label strings. |

Regenerate baselines with:
`npx playwright test tests/e2e/visual-snapshots.spec.js --update-snapshots`

---

## 3. Design token manifest

All values below were extracted from Tebra's own production stylesheets
(`www.tebra.com/tebranew/_next/static/css/*.css`, September 2026).

### 3.1 Typography

Tebra ships **Akkurat LL**, **Akkurat Mono LL**, and **Lora**. Akkurat is a
commercial Lineto family — **not licensed here.**

| Role | Tebra ships | We ship | Rationale |
| --- | --- | --- | --- |
| UI sans | Akkurat LL | **Inter Variable** (`@fontsource-variable/inter`) | Closest open neo-grotesque; excellent at 11–13px; true tabular figures |
| Mono | Akkurat Mono LL | **JetBrains Mono Variable** | Record IDs, NDC, lot numbers |
| Serif | Lora | *not shipped* | Editorial only; no workstation role |

```css
--tw-font-sans: "Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif;
--tw-font-mono: "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace;
```

**Safety requirement:** every dose, date, time, interval, and lot number renders
with `font-variant-numeric: tabular-nums`. Proportional figures make `1064 mg`
and `1004 mg` scan alike at speed. This is a clinical property, not a stylistic one.

**Tebra's observed marketing scale** (for the brand tier): 68 / 60 / 48 / 40 /
36 / 32 / 28 / 24 / 22 / 20 / 18 / 16 / 14 / 12 px.
Letter-spacing tightens negatively as size grows: `-0.02em` at display sizes,
`-1.92px`/`-1.6px` at the largest, `0` at body, `+0.48px` on small caps/labels.

**Two-tier scale to implement:**

```css
/* Brand tier — kiosk-primary surfaces: facesheet, primary action, sign card */
--tw-fs-display: 36px;  --tw-lh-display: 1.15;  --tw-ls-display: -0.02em;
--tw-fs-title:   24px;  --tw-lh-title:   1.25;  --tw-ls-title:   -0.01em;
--tw-fs-lead:    18px;  --tw-lh-lead:    27px;  /* Tebra body */
--tw-fs-body:    16px;  --tw-lh-body:    24px;

/* Workstation tier — dense worksheets, tables, field labels */
--tw-fs-ws-base:  14px; --tw-lh-ws-base:  20px;
--tw-fs-ws-dense: 13px; --tw-lh-ws-dense: 18px;
--tw-fs-ws-meta:  12px; --tw-lh-ws-meta:  16px;
--tw-fs-ws-label: 11px; --tw-lh-ws-label: 14px; --tw-ls-ws-label: 0.48px;
```

### 3.2 Color

**Verbatim Tebra values** (hex, with observed usage frequency in their CSS):

```css
/* Teal — brand core */
--tw-teal-900: #003a43;  /* 95 uses — deepest; headings, dark surfaces */
--tw-teal-800: #004952;  /* 162 uses in markup — the logo teal, brand primary */
--tw-teal-700: #054a53;
--tw-teal-600: #1f5f67;
--tw-teal-500: #3a6d71;
--tw-teal-300: #82a4a7;
--tw-teal-200: #c5d6d7;

/* Mint — cool tinted neutrals */
--tw-mint-200: #d2dcda;
--tw-mint-150: #ebf0ef;
--tw-mint-125: #edf1f0;
--tw-mint-100: #e9efee;
--tw-mint-75:  #ebf0f1;
--tw-mint-50:  #f6f8f8;
--tw-mint-25:  #f5f8f8;

/* Coral — accent / primary CTA */
--tw-coral-600: #f37e5e;  /* active */
--tw-coral-500: #ff8d6e;  /* default primary button */
--tw-coral-300: #fec3b8;  /* hover */
--tw-coral-100: #fee3df;
--tw-coral-50:  #fff6f3;

/* Sand — warm grounding earth tones */
--tw-sand-300: #e0d3c8;
--tw-sand-250: #d8d5cf;
--tw-sand-200: #f2eee9;
--tw-sand-150: #f8f3eb;  /* 64 uses — the on-dark surface + dark-mode button fill */
--tw-sand-100: #faf6f1;
--tw-sand-75:  #fcf9f5;
--tw-sand-50:  #f9f7f6;
--tw-sand-25:  #fdfbfb;

/* Neutral */
--tw-ink-900: #232323;   /* Tebra button text */
--tw-ink-800: #2b2b2b;
--tw-ink-400: #a4a4a4;
--tw-ink-200: #dcdcdc;
--tw-white:   #ffffff;

/* Tebra's own error red */
--tw-red-500: #da5960;
```

**Tebra also names four brand pillars** (found as gradient/theme class names):
`core`, `growth`, `backbone`, `care`. Use these as the semantic grouping for
module accents if module color-coding is wanted — it is Tebra's own taxonomy.

#### 3.2.1 Clinical status triad — ours, not Tebra's

Derived to stay in the Tebra family while remaining unambiguous next to coral.
**The implementer must verify every pair against WCAG before shipping.**

```css
--tw-stop-fg:     #8f2b32;  /* on --tw-stop-bg */
--tw-stop-bg:     #fdecec;
--tw-stop-border: #d99aa0;

--tw-review-fg:     #7a4f06;
--tw-review-bg:     #fdf3e2;
--tw-review-border: #dcc08a;

--tw-ready-fg:     #1f6f5c;  /* pulled toward teal to stay in-family */
--tw-ready-bg:     #e6f2ee;
--tw-ready-border: #9cc6b8;
```

Rules:
- Coral (`--tw-coral-*`) is **only** the primary action. Never a status.
- Red `--tw-red-500` is Tebra's marketing error red; use `--tw-stop-fg` for
  clinical stops so it does not collide with form-validation red.
- Every status renders icon + text label. Color is reinforcement, never the
  sole carrier.

#### 3.2.2 Semantic surface aliases

```css
--tw-surface-page:    var(--tw-sand-50);
--tw-surface-panel:   var(--tw-white);
--tw-surface-sunken:  var(--tw-mint-50);
--tw-surface-inverse: var(--tw-teal-900);
--tw-on-inverse:      var(--tw-sand-150);
--tw-border-subtle:   var(--tw-mint-200);
--tw-border-strong:   var(--tw-teal-300);
--tw-text-primary:    var(--tw-teal-900);
--tw-text-secondary:  var(--tw-teal-600);
--tw-text-muted:      var(--tw-ink-400);
--tw-focus-ring:      0 0 0 3px rgb(0 73 82 / 0.24);
```

### 3.3 Buttons — Tebra's exact observed spec

```css
/* primary */              background:#ff8d6e; border:2px solid #ff8d6e; color:#232323;
/* primary:hover */        background:#fec3b8;
/* primary:active */       background:#f37e5e; box-shadow:0 0 0 3px rgb(255 141 110 / .24);
/* secondary */            background:transparent; border:1px solid #004952; color:#004952;
/* secondary:hover */      background:rgb(0 73 82 / .08);
/* secondary:active */     background:rgb(0 73 82 / .24); box-shadow:0 0 0 3px rgb(0 73 82 / .08);
/* underline (tertiary) */ color:#004952; border-radius:4px; background:rgb(0 73 82 / .04) on hover;
/* on dark, primary */     background:#f8f3eb; border-color:#f8f3eb;
/* on dark, secondary */   background:transparent; border:1px solid #f8f3eb; color:#f8f3eb;
/* transition */           background-color .3s ease-in-out, filter .3s, color .3s, box-shadow .3s
```

**Tebra sizes:** cta 57px (radius 32px, padding 14px 24px) · large 57px ·
medium 49px · small 45px · x-small 32px (12px/18px type).
Responsive: cta and large drop to 46/49px on narrow.

**Workstation tier adds** a `ws` size — **32px tall, radius 6px** — for dense
worksheet toolbars. Kiosk-primary actions keep Tebra's 57px/32px-radius pill.
**Kiosk minimum touch target: 44×44 CSS px.**

### 3.4 Radii, spacing, motion

```css
/* Tebra observed radii, by frequency: 8(24) 16(21) 4(14) 24(14) 32(6) */
--tw-radius-pill:   999px;   /* CTA pills */
--tw-radius-cta:    32px;
--tw-radius-panel:  24px;    /* their product-hubs panel radius */
--tw-radius-card:   16px;
--tw-radius-ctl:    8px;     /* most common */
--tw-radius-ws:     6px;     /* workstation-tier controls */
--tw-radius-tight:  4px;     /* square/underline buttons */

/* Tebra container system */
--tw-container-base: 1280px;
--tw-container-pad:  20px;   /* 30px @ md, 80px @ lg */
--tw-gutter-sm: 8px; --tw-gutter-md: 14px; --tw-gutter-lg: 16px;

/* Motion — cap under prefers-reduced-motion */
--tw-ease: cubic-bezier(0.4, 0, 0.2, 1);
--tw-dur-fast: 120ms;   /* workstation feedback */
--tw-dur-base: 300ms;   /* Tebra's own .3s ease-in-out */
```

```css
@media (prefers-reduced-motion: reduce) {
  :root { --tw-dur-fast: 0ms; --tw-dur-base: 0ms; }
}
```

---

## 4. CSS load order (must be exact)

```
1. tebra-tokens.css          @media screen — tokens only, no selectors beyond :root
2. clinical-desktop.css      @media screen — structural base (filename pinned by check-app.js)
3. workflows/workflow-panels.css  @media screen — (filename pinned by check-app.js)
4. kiosk/kiosk.css           @media screen — kiosk layout
5. tebra-screen-contract.css @media screen — final contract, loaded last
--- print, entirely separate ---
   public/legacy/legacy.css  media="print" — FROZEN, never joins the screen cascade
```

> **Why order matters:** `legacy.css` was moved to `media="print"` precisely so
> the screen cascade would be clean; the previous redesign needed ~900
> `!important` declarations because it was fighting a print stylesheet that was
> loading on screen. Do not reintroduce that. **Zero new `!important` is the
> target**; each one that survives review needs a comment explaining what it
> is beating.

---

## 5. Verification gate

Run before every commit:

```bash
npm run check        # typecheck + check-app.js (all ~50 clinical assertions)
npm run test:unit
npm run test:print   # MUST be zero-diff
npm run test:e2e
git diff --stat -- public/legacy src/legacy src/domain src/application \
                   src/persistence src/documentation tests/fixtures
                   # ^ MUST be empty
```
