# Redesign Manifest

Companion to `PLAN.md`. The authoritative list of **what may change**, **what is
frozen**, **the exact design tokens**, and **the conventions that make this read
as first-party**.

**Implementation checkpoint — 2026-09-06.** The local branch contains Phases
0–2b through `1387d10`; PR #62 was still at `b674907`, so Phase 2b was not yet
remote. The commit containing this manifest is the locally complete Phase
2c authenticated-product refinement of shell geometry, Injection form rhythm,
record-lifecycle actions, Note Inspector chrome, UDS scroll ownership, and
keyboard focus. It may still need to be pushed to PR #62 alongside Phase 2b. It
adds no Phase 3 feature. The planned Phase 3 Notes,
Facesheet, patient-search, page-level `ActionBar`, status-chip, lock-indicator,
and hover-card components do not exist.

Every real-patient view in the production audit was read-only. Opening the
Injection editor on a verified Test Patient automatically created one blank
`Incomplete` note; no clinical text, Save, Sign, Submit, or Delete action
followed. The audit confirmed that global legacy **Open Notes** and modern
patient-chart **Notes** use different grammars; §4 records both. The committed
visual PNGs predate Phase 2b and remain stale.

---

## 1. Frozen — do not edit

A change under any of these paths means the change is wrong. `git diff --stat`
against them must be empty at PR time.

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

**Amendment (Phase 1): display copy is presentation, wherever it lives.**
The freeze protects clinical decisions, not the words attached to them. Three
label maps sat in `src/application/` — the readiness verdict headline/detail,
`WORKSTATION_RECORD_LIFECYCLE_LABEL`, and the transaction-phase labels — which
made a copy change look like it required editing clinical code. They moved to
`src/presentation/vocabulary.ts`; the projections now return `tone` / `state` /
`phase` and the presentation layer chooses the words. **No conditional,
threshold, ordering rule, or clinical decision changed** (verify with
`git diff -- src/application`: it is deletions and comments only). Everything
else under `src/application/**` remains frozen.

**Frozen in behavior, editable in style only:**
`WorkstationLock.tsx` (idle-lock timing and semantics),
`FunctionKeyProfile.ts` (command vocabulary — restyle its surface, keep the commands).

---

## 2. Change manifest

### 2.1 New files

| Path | Purpose | Phase |
| --- | --- | --- |
| `src/presentation/tebra-tokens.css` | Single source of truth for tokens. `@media screen`. Imported first; authenticated-product aliases refined in Phase 2c. | 0, 2c |
| `src/presentation/tebra-screen-contract.css` | Final screen contract; replaces `meditech-screen-contract.css`. Loaded last; lifecycle and inspector details refined in Phase 2c. | 2, 2c |
| `src/presentation/tebra-workstation.css` | Tebra shell composition; replaces `meditech-workstation.css`; measured geometry refined in Phase 2c. | 2, 2c |
| `src/presentation/shell/AppHeader.tsx` | Persistent product identity and truthful local-record context. Patient search and actions remain Phase 3. | 2 |
| `src/presentation/shell/SectionRail.tsx` | Left rail — current truthful workflow navigation and global Open Notes launch. Patient-chart sections remain Phase 3. | 2 |
| `src/presentation/shell/ActionBar.tsx` | Planned page-level coral split `New Note` · `Print` · `More` · `Customize View`; distinct from per-note `RecordLifecycleActions`. | 3 |
| `src/presentation/shell/PatientSearch.tsx` | "first 2–3 letters of the patient's name or date of birth (mm/dd/yyyy)". | 3 |
| `src/presentation/facesheet/FacesheetBanner.tsx` | Patient hub header. | 3 |
| `src/presentation/facesheet/PatientCardPopup.tsx` | Hover card on patient name. | 3 |
| `src/presentation/facesheet/SummaryCard.tsx` | Card grammar for Last injection / Site rotation / Allergies / Recent notes. | 3 |
| `src/presentation/notes/NotesTable.tsx` | Open Notes table: sort, lock, status chips. | 3 |
| `src/presentation/notes/StatusChip.tsx` | `Incomplete` · `Ready to sign` · `Signed`. | 3 |
| `src/presentation/notes/LockIndicator.tsx` | Lock glyph + hover "Signed by … at …". | 3 |
| `src/presentation/kiosk/KioskShell.tsx` | Kiosk chrome and sign-and-next loop. | 4 |
| `src/presentation/kiosk/InjectionStepper.tsx` | 7-step rail over existing `InjectionPanel` tabs. | 4 |
| `src/presentation/kiosk/CareChecklistRail.tsx` | Tebra presentation of `projectClinicalReadiness`. | 4 |
| `src/presentation/kiosk/SignAndNextCard.tsx` | Post-sign → print handout / next patient. | 4 |
| `src/presentation/kiosk/kiosk.css` | Kiosk-only layout. `@media screen`. | 4 |
| `src/presentation/use-kiosk-mode.ts` | `?kiosk=1` + persisted preference + Fullscreen API. | 4 |
| `tests/e2e/tebra-screen-contract.spec.js` | Replaces `meditech-screen-contract.spec.js`. | 2 |
| `tests/e2e/conventions.spec.js` | Asserts §4 grammar: sort, chips, lock hover, row click. | 3 |
| `tests/e2e/kiosk-flow.spec.js` | Identify → sign → next-patient loop. | 4 |

### 2.2 Modified files

| Path | Change | Phase |
| --- | --- | --- |
| `index.html` | Boot identity, then Phase 2 loading skeleton; Phase 2c synchronizes measured shell geometry. **Keep `media="print"` on the legacy stylesheet link.** | 0, 2, 2c |
| `favicon.svg` | IPMG module mark in Tebra palette. Not a Tebra logo. | 0 |
| `package.json` | **Add** `@fontsource-variable/inter` + `@fontsource-variable/jetbrains-mono`. **Keep `plus-jakarta-sans`** — it is print-load-bearing (see §3.1). | 0 |
| `src/main.tsx` | Font imports; kiosk wiring (Phase 4). No coordinator or store changes. | 0, 4 |
| `src/presentation/clinical-desktop.css` | Retarget screen surfaces to tokens and retain established print layout/isolation rules. **Keep the filename** (`check-app.js` asserts it). | 0, 2, 2c |
| `src/presentation/workflows/workflow-panels.css` | Retarget to tokens; Phase 2c refines Injection and fixed transaction scroll ownership. **Keep the filename** (`check-app.js` asserts it). | 0, 2, 2c |
| `src/presentation/meditech-workstation.css` | **Deleted**; replaced by `tebra-workstation.css`. | 2 |
| `src/presentation/meditech-screen-contract.css` | **Deleted**; replaced by `tebra-screen-contract.css`. | 2 |
| `src/presentation/ClinicalDesktopShell.tsx` | Titlebar → `AppHeader`; nav → `SectionRail`; status bar → footer. Phase 2c also repairs synchronous mnemonic-menu focus. ARIA preserved. | 2, 2c |
| `src/presentation/MeditechChrome.tsx` | **Deleted**; replaced by `TebraChrome.tsx`. | 2 |
| `src/presentation/types.ts` | `WORKFLOW_LABELS` string values only. **Never touch `WorkflowId` union values.** | 1 |
| `src/presentation/StartCenter.tsx` | → "Dashboard"; facesheet card grammar. | 1, 3 |
| `src/presentation/RecordsWindow.tsx`, `UdsRecordsWindow.tsx` | → "Open Notes"; adopt `NotesTable`. | 1, 3 |
| `src/presentation/RecordActionDialog.tsx`, `RecordLifecycleActions.tsx` | "Attest and lock" → "Sign"; Phase 2c styles the existing per-note lifecycle actions as a fixed modern footer through the screen contract. Component lifecycle logic is unchanged. | 1, 2c |
| `src/presentation/NoteInspector.tsx` | Structurally unchanged in Phase 2c; its existing chrome is refined through `tebra-screen-contract.css`. Phase 3 supplies the patient Notes convention. | 3 |
| `src/presentation/WorkstationLock.tsx` | Restyle only. | 2 |
| `src/presentation/workflows/StatusFlag.tsx` | New triad; **verify icon + word, never color alone.** | 2 |
| `src/presentation/workflows/OutstandingRequirements.tsx` | → "Care Checklist". | 1 |
| `src/presentation/workflows/injection/InjectionPanel.tsx` | Stepper integration. Field logic untouched. | 4 |
| `src/presentation/workflows/uds/UdsPanel.tsx` | Phase 2c moves the existing preliminary-screening safety statement inside the clinical scroll owner; copy and logic unchanged. | 2c |
| `scripts/check-app.js` | Only if a CSS path above is renamed — update that assertion, **relax nothing else**. | 2 |
| `README.md` | Architecture + design-language section. | 5 |

### 2.3 Test artifacts

| Path | Action |
| --- | --- |
| `tests/e2e/meditech-screen-contract.spec.js` | Delete; superseded. |
| `tests/e2e/visual-snapshots.spec.js-snapshots/linux/**` (8 PNGs) | **Currently pre-Phase-2b.** Regenerate in a compatible browser and review each image. |
| `tests/e2e/visual-snapshots.spec.js-snapshots/win32/**` (8 PNGs) | **Currently stale; cannot be regenerated in Linux CI.** Refresh on Windows or flag in the PR body. |
| `tests/e2e/tebra-screen-contract.spec.js` | Phase 2c updates measured shell, coral/status, and 800×600 contracts. |
| `tests/e2e/visual-contracts.spec.js` | Update Dashboard style and keyboard-focus expectations. |
| `tests/e2e/workstation.spec.js` | Update changed visual expectations without relaxing clinical journeys. |
| `tests/unit/ehr-refinement-contracts.test.ts` | Update if it asserts label strings. |

`npx playwright test tests/e2e/visual-snapshots.spec.js --update-snapshots`

> **Baseline browser drift — measured, not assumed.** `@playwright/test` 1.62
> pins chromium-1234 (Chromium 151), which remains authoritative. Phase 1
> showed that its seven then-changed baselines matched Chromium 141 against
> unchanged code. The 2026-09-06 audit used a temporary Chromium 149 binary,
> but did not establish snapshot equivalence. Never commit its ephemeral path
> or regenerate baselines on it without first proving unchanged-code parity.
> `win32/` is a genuinely different platform and cannot be refreshed on Linux.

Current temporary-Chromium-149 evidence: screen contract 6/6, Dashboard visual
contract 2/2, five changed journeys 5/5, and the final combined
screen/interaction run 66/66. The repaired UDS F12 and menu-tracking races each
passed 10/10 stress repeats. The full print suite was 13/18: four failures
reproduced at unchanged `1387d10`, and one was the likely-flaky four-step rail
mutation check. The two Phase-2c print-isolation paths pass 2/2. This is not a
pinned-browser print or visual-baseline pass.

---

## 3. Design token manifest

Extracted from Tebra's production stylesheets
(`www.tebra.com/tebranew/_next/static/css/*.css`, September 2026).

### 3.1 Typography

Tebra ships **Akkurat LL**, **Akkurat Mono LL**, and **Lora**. Akkurat is a
commercial Lineto family — **not licensed here.**

| Role | Tebra ships | We ship |
| --- | --- | --- |
| UI sans | Akkurat LL | **Inter Variable** — closest open neo-grotesque; excellent at 11–13px; true tabular figures |
| Mono | Akkurat Mono LL | **JetBrains Mono Variable** — record IDs, NDC, lot numbers |
| Serif | Lora | *not shipped* — editorial only, no workstation role |

> **`plus-jakarta-sans` must stay installed.** It is not a leftover: the AVS
> patient handout sets its titles in `"Plus Jakarta Sans Variable"` inside the
> `@media print` block of `clinical-desktop.css`, and
> `tests/e2e/print-regression.spec.js:428` asserts that stack. Removing it
> silently changes a printed patient document and fails `npm run test:print`.
> Inter and JetBrains Mono are **added alongside** it, for screen only.

```css
--tw-font-sans: "Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif;
--tw-font-mono: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace;
```

**Safety requirement:** every dose, date, time, interval, and lot number renders
with `font-variant-numeric: tabular-nums`. Proportional figures make `1064 mg`
and `1004 mg` scan alike at speed. Clinical property, not stylistic.

**Tebra's observed marketing scale:** 68 / 60 / 48 / 40 / 36 / 32 / 28 / 24 /
22 / 20 / 18 / 16 / 14 / 12 px. Letter-spacing tightens negatively as size
grows: `-1.92px` and `-1.6px` at the largest, `-0.02em` at display, `0` at
body, `+0.48px` on small uppercase labels.

**Two tiers to implement** (see `PLAN.md` §2.5 — calibrate to their *product*,
not their marketing site):

```css
/* Brand tier — facesheet banner, primary action, site picker, sign card */
--tw-fs-display: 36px;  --tw-lh-display: 1.15;  --tw-ls-display: -0.02em;
--tw-fs-title:   24px;  --tw-lh-title:   1.25;  --tw-ls-title:   -0.01em;
--tw-fs-lead:    18px;  --tw-lh-lead:    27px;
--tw-fs-body:    16px;  --tw-lh-body:    24px;

/* Workstation tier — tables, worksheets, field labels */
--tw-fs-ws-base:  14px; --tw-lh-ws-base:  20px;
--tw-fs-ws-dense: 13px; --tw-lh-ws-dense: 18px;
--tw-fs-ws-meta:  12px; --tw-lh-ws-meta:  16px;
--tw-fs-ws-label: 11px; --tw-lh-ws-label: 14px; --tw-ls-ws-label: 0.48px;
```

The authenticated desktop product uses 16px/24px body text and a 32px/48px
main-view title. The workstation Dashboard's 32px/40px desktop title and
21px/28px compact title are deliberate local adaptations, not live
measurements.

### 3.2 Color

Verbatim Tebra values, with occurrence counts in their CSS:

```css
/* Teal — brand core */
--tw-teal-900: #003a43;  /* 95 uses — deepest; headings, dark surfaces */
--tw-teal-800: #004952;  /* 162 in markup — the logo teal, brand primary */
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
--tw-sand-150: #f8f3eb;  /* 64 uses — on-dark surface + dark-mode button fill */
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

**Tebra's four brand pillars**, found as gradient and theme class names in their
CSS: `core`, `growth`, `backbone`, `care`. If module accents are wanted, use
these — it is their own taxonomy, and inventing a different one is a seam.

#### 3.2.1 Clinical status triad — ours, not Tebra's

Derived to stay in the Tebra family while remaining unambiguous next to coral.
**Verify every pair against WCAG before shipping.**

```css
--tw-stop-fg: #8f2b32;  --tw-stop-bg: #fdecec;  --tw-stop-border: #d99aa0;
--tw-review-fg: #7a4f06; --tw-review-bg: #fdf3e2; --tw-review-border: #dcc08a;
--tw-ready-fg: #1f6f5c;  --tw-ready-bg: #e6f2ee;  --tw-ready-border: #9cc6b8;
```

- Coral is **only** the primary action. Never a status.
- Use `--tw-stop-fg` for clinical stops so they do not collide with Tebra's
  form-validation red `--tw-red-500`.
- Every status renders icon + word. Color is reinforcement, never the carrier.

#### 3.2.2 Semantic surface aliases

```css
--tw-surface-page:    #fbf9f8; /* authenticated product page canvas */
--tw-surface-panel:   var(--tw-white);
--tw-surface-sunken:  var(--tw-mint-50);
--tw-surface-inverse: var(--tw-teal-900);
--tw-surface-header:  #004852; /* authenticated product header */
--tw-surface-header-input: #002328;
--tw-on-inverse:      var(--tw-sand-150);
--tw-border-subtle:   var(--tw-mint-200);
--tw-border-strong:   var(--tw-teal-300);
--tw-text-primary:    var(--tw-teal-900);
--tw-text-secondary:  var(--tw-teal-600);
--tw-text-muted:      var(--tw-ink-400);
--tw-focus-ring:      0 0 0 3px rgb(0 73 82 / 0.24);
```

### 3.3 Buttons — source-specific observed specs

The first block is the public brand-stylesheet grammar. The authenticated
product is authoritative where it differs.

```css
/* primary */              background:#ff8d6e; border:2px solid #ff8d6e; color:#232323;
/* primary:hover */        background:#fec3b8;
/* primary:active */       background:#f37e5e; box-shadow:0 0 0 3px rgb(255 141 110 / .24);
/* secondary */            background:transparent; border:1px solid #004952; color:#004952;
/* secondary:hover */      background:rgb(0 73 82 / .08);
/* secondary:active */     background:rgb(0 73 82 / .24); box-shadow:0 0 0 3px rgb(0 73 82 / .08);
/* underline (tertiary) */ color:#004952; border-radius:4px; hover background:rgb(0 73 82 / .04);
/* on dark, primary */     background:#f8f3eb; border-color:#f8f3eb;
/* on dark, secondary */   background:transparent; border:1px solid #f8f3eb; color:#f8f3eb;
/* transition */           background-color .3s ease-in-out, filter .3s, color .3s, box-shadow .3s
```

**Tebra sizes:** cta 57px (radius 32px, padding 14px 24px) · large 57px ·
medium 49px · small 45px · x-small 32px (12px/18px type). cta and large drop to
46/49px on narrow.

**Workstation tier adds** a `ws` size — **32px tall, radius 6px** — for dense
toolbars. In the authenticated product, modern outlined actions are **38px
high, radius 24, with a `#b3c6c4` border**. The patient Notes `New Note` group
is a distinct **36px-high split action**. Use those product measurements for
shell and chart actions; use the public `#004952` border only where that broader
brand grammar is intended. Kiosk-primary actions keep Tebra's 57px/32px-radius
pill. **Kiosk minimum touch target: 44×44 CSS px.**

### 3.4 Radii, spacing, motion

```css
/* Tebra observed radii by frequency: 8(24) 16(21) 4(14) 24(14) 32(6) */
--tw-radius-pill:  999px;
--tw-radius-cta:   32px;
--tw-radius-panel: 24px;   /* their product-hubs panel radius */
--tw-radius-card:  16px;
--tw-radius-ctl:   8px;    /* most common */
--tw-radius-ws:    6px;    /* workstation tier */
--tw-radius-tight: 4px;
--tw-radius-action: 24px;

--tw-shadow-elevation-1:
  0 2px 1px -1px rgb(0 0 0 / 20%),
  0 1px 1px 0 rgb(0 0 0 / 14%),
  0 1px 3px 0 rgb(0 0 0 / 12%);

--tw-header-height: 65px;

--tw-container-base: 1280px;
--tw-container-pad:  20px;   /* 30px @ md, 80px @ lg */
--tw-gutter-sm: 8px; --tw-gutter-md: 14px; --tw-gutter-lg: 16px;

--tw-ease: cubic-bezier(0.4, 0, 0.2, 1);
--tw-dur-fast: 120ms;   /* workstation feedback */
--tw-dur-base: 300ms;   /* Tebra's own .3s ease-in-out */
```

Authenticated-product desktop geometry: 65px `#004852` header; 347×33
`#002328` search well; `#fbf9f8` page; 192px flush rail with 48px rows and 16px
row padding; 32px content inset; radius-4 elevation-1 cards. The repository's
56/54px compact headers, 166/158px compact rails, and 8/6px compact insets are
supported-workstation adaptations, not live Tebra measurements.

```css
@media (prefers-reduced-motion: reduce) {
  :root { --tw-dur-fast: 0ms; --tw-dur-base: 0ms; }
}
```

---

## 4. Convention spec

The tokens make it look right. This section makes it *feel* first-party. It
combines authenticated-product observations, legacy workflow observations, and
explicit repository adaptations; each subsection names which source governs.

### 4.1 Global Open Notes table

This is the legacy global worklist grammar observed in production, not the
modern patient-chart list in §4.1.1. Its worklist and editor inform workflow
structure only. The modern authenticated product remains authoritative for the
surrounding shell, cards, fields, and actions.

| Behavior | Spec |
| --- | --- |
| Columns | `Patient · Lock · Type · Status · Visit Date` |
| Header | Sparse pale mint surface observed near `#d4e0dd`; use the nearest repository token, `--tw-mint-200` (`#d2dcda`), without heavy cell or row boxes. |
| Rows | 44px, white, without zebra striping or heavy boxes. |
| Sorting | Default to Visit Date descending. Click a sortable header to sort; click again to reverse. Sortable on Patient, Type, Visit Date. |
| Sort affordance | Visit Date shows its direction caret; other unsorted headers show an affordance on hover only. |
| Row target | The **whole row** opens the note. No trailing "open" link. |
| Lock column | Glyph when the record is signed; hover reveals `Signed by {staff} · {time}` from the existing attestation. |
| Visit Date | The appointment date, or the note's creation date/time when there is no appointment. |
| Status | `StatusChip` — see 4.2. |
| Empty state | One line in voice, plus the primary action. Never a bare "No records." |

For the existing record shapes, resolve Visit Date in presentation only:
injection `fields.adminDate`, UDS `collectionDateTime`, then `createdAt` as the
fallback. Resolve the lock tooltip from the existing `attestation` staff and
timestamp. Do not add or change persistence fields for this table.

### 4.1.1 Patient-chart Notes list

The current patient Notes product uses a newer, roomier list convention. Build
it as a patient-scoped view; do not make the global Open Notes table imitate it.

| Element | Measured spec |
| --- | --- |
| Page | 32px content padding. |
| Filters | Exactly four 200×40 fields in one white panel; 4px radius (`--tw-radius-tight`) and elevation 1. |
| Row | 100px high with 16px padding. |
| Row title | Approximately 20px, bold. |
| Metadata | 14px sans text. |
| Status | 32px lifecycle chips, intrinsic width: observed `Open` 59px on `#f0faf2`, `Signed` 69px on `#f0eee8`. Do not reuse the clinical stop/review/ready triad. |
| Open | 73×38 outlined button on the row. |
| New note | Coral 36px split action: primary `New Note` segment plus disclosure; its menu is about 242px wide with 36px rows. |

### 4.2 Status chips

`Incomplete` · `Ready to sign` · `Signed`

Tebra ships `Incomplete` and `Needs Cosign`. We keep `Incomplete` verbatim,
extend with `Ready to sign` and `Signed`, and drop `Needs Cosign` — there is no
cosign flow here and inventing one is worse than omitting it. Keep a shared
32px-high component, but allow intrinsic text width and status-specific neutral
backgrounds: the observed `Open` and `Signed` chips were different widths and
used `#f0faf2` and `#f0eee8`, respectively. These are note-lifecycle states,
not clinical readiness states; the stop/review/ready triad remains reserved for
clinical meaning.

### 4.3 Action bar

The planned page-level `ActionBar` holds a 36px coral split `New Note` (primary
segment plus adjacent menu for Injection · UDS · Samples · Forms), then
`Print` · `More` · `Customize View`, top right in that order. Its menu is about
242px wide with 36px rows. `More` holds low-frequency actions; `Customize View`
persists per browser. The split control is one primary-action group, not two
competing coral buttons, and it is not the existing per-note
`RecordLifecycleActions` footer.

Workflow observation: selecting Injection in the live product opened the
editor and immediately created a blank `Incomplete` note, before Save. Record
creation is therefore not safe to treat as read-only navigation. Preserve this
repository's frozen persistence and confirmation contracts rather than copying
that side effect blindly.

### 4.4 Patient search

Placeholder and matching behavior follow Tebra: **first 2–3 letters of the
patient's name, or date of birth as `mm/dd/yyyy`**. Same affordance, same
copy, matched against local records only.

### 4.5 Facesheet cards

Summary cards, each with a heading, an ordering rule stated the way Tebra
states theirs, and a link into the full section:

| Card | Ordering rule |
| --- | --- |
| Last injection | Most recent administration, with site and date |
| Site rotation | Last five sites by administration date |
| Allergies | Active allergies, or `No known allergies` |
| Care Checklist | Open items first, then satisfied |
| Recent notes | Up to the last five notes by visit date |

### 4.6 Hover patient card

Hovering a patient name raises a card with what we truthfully hold:
name, DOB, local record id, allergies, last visit. Not demographics we do not
have. Tebra's card carries insurance and contact detail; ours carries less, and
that is correct — an empty field is a worse seam than an absent one.

### 4.7 Microcopy

Full rewrite table in `PLAN.md` §2.4. The rules:

- Imperative, second person, plain. Name things by what the person recognizes.
- A control says exactly what happens: `Sign` → toast `Signed`.
- Errors say what went wrong and how to fix it. No apologies, no system nouns.
- Never surface internal vocabulary: *compatibility runtime*, *typed engine*,
  *legacy*, *projection*, *workflow key*, *coordinator*.
- Sentence case for buttons and headings; Title Case only for proper nouns.

---

## 5. Convention review — run before each phase ships

Screen by screen, answer yes to all of these. A no is a seam.

1. Would a Tebra PM recognize every component on this screen as one of theirs?
2. Does global Open Notes sort, lock, and row-open like the legacy worklist,
   while patient Notes uses its four-filter panel, modern list, and `Open`
   button?
3. Is every string in Tebra's product voice — imperative, plain, named after the
   user's action rather than the system's internals?
4. Does any control link to something that doesn't exist here?
5. Is the density calibrated to Tebra's *product*, not their marketing site?
6. Does coral appear on exactly one primary action or split-action group,
   carrying no clinical meaning?
7. Does every clinical status carry an icon and a word?
8. Is the local-only storage disclosure visible and in voice?
9. Does the screen still say truthfully which system this is?

---

## 5b. Restructure posture — replace, never overlay

The previous redesign failed by layering: it added a stylesheet that fought the
one underneath, and needed ~900 `!important` declarations to win. These rules
exist so this one does not repeat that.

1. **Change rules at their source.** A MEDITECH value gets edited where it is
   declared. Adding a later rule that overrides it is forbidden, even when it
   is faster.
2. **Net CSS must go down.** Phase 2 deleted
   `meditech-screen-contract.css` and `meditech-workstation.css` instead of
   superseding them. Continue changing rules at their source and report the
   line-count delta in every phase's PR.
3. **Zero new `!important`.** Each one that survives review carries a comment
   naming exactly what it beats.
4. **No dead conditionals.** Collapsing a distinction is fine; leaving a
   three-branch ternary whose branches are identical is not. (Phase 1 hit this
   with `chartContextLabel` and collapsed it.)
5. **Never derive a class from copy.** `is-${label.toLowerCase()}` couples the
   stylesheet to the words, so renaming silently drops styling. Modifier
   classes come from state keys. (Phase 1 hit this with `.is-filed`.)
6. **Copy lives in `vocabulary.ts`**, not inline. New user-facing strings go
   there so a rename stays one edit.
7. **The class vocabulary rename (`cd2004-*`, `meditech-*`, `wfp-*`) gets its
   own phase.** It is mechanical, touches ~1000 usages and every e2e selector,
   and mixing it with design work makes both unreviewable.

## 5c. Boot experience — skeleton, not splash

Phase 2 replaced the interim Phase 0 splash with a loading skeleton. A
full-screen brand splash is a native
desktop idiom — the same idiom the MEDITECH shell was built on. A Tebra-quality
web product shows the chrome immediately with placeholder content, so the first
frame communicates *what is loading* rather than *who made it*.

The current Phase 2b plus Phase 2c contract is:

- The 65px `#004852` app header (56px compact; 54px at 800–839px), `#002328`
  search well, patient context band, flush white section rail, and 32px page
  inset paint immediately with the real shell geometry.
- The placeholder Open Notes panel uses the landed 4px/elevation-1 card and
  38px action geometry; its cells remain quiet mint skeleton blocks.
- No shimmer animation by default; a slow, low-contrast pulse at most, disabled
  under `prefers-reduced-motion`.
- It stays inline HTML+CSS in `index.html` with literal token values, because
  it has to paint before the module graph loads — the same constraint the splash
  has today.
- **Coupling to declare:** the skeleton mirrors the shell's structure, so it must
  be updated in the same commit as any shell layout change or it flashes the
  wrong shape. That is why it lands in Phase 2 (when the structure is settled)
  rather than now, against a layout being thrown away.
- The local-only disclosure keeps its place in the first frame.

## 6. CSS load order (must be exact)

```
1. tebra-tokens.css               @media screen — tokens only, no selectors past :root
2. clinical-desktop.css           mixed — screen structural base plus established print rules (filename pinned)
3. workflows/workflow-panels.css  @media screen — (filename pinned)
4. tebra-workstation.css          @media screen — shell composition
5. kiosk/kiosk.css                @media screen — kiosk layout (Phase 4; not present yet)
6. tebra-screen-contract.css      @media screen — final contract, loaded last
--- print never joins the Tebra screen cascade ---
   clinical-desktop.css           @media print — established typed-sheet layout and shell isolation
   public/legacy/legacy.css       media="print" — FROZEN legacy print rules
```

> `legacy.css` was moved to `media="print"` precisely so the screen cascade
> would be clean; the previous redesign needed ~900 `!important` declarations
> because it was fighting a print stylesheet loading on screen.
> `clinical-desktop.css` still intentionally owns print layout and isolation.
> Do not expose either print source to the Tebra screen cascade. **Zero new
> `!important` is the target**; each survivor needs a comment naming what it
> beats.

---

## 7. Verification gate

```bash
npm run check        # typecheck + check-app.js (all ~50 clinical assertions)
npm run test:unit
npm run test:print   # renderer hashes plus print-layout/PDF gate
npm run test:e2e
git diff --stat -- public/legacy src/legacy src/domain src/application \
                   src/persistence src/documentation tests/fixtures
                   # ^ MUST be empty
```
