# Tebra-Language Injection Kiosk — Redesign Plan

**Repository:** `matthewyglesias-lab/MA-Workstation`
**Branch:** `claude/ma-workstation-tebra-redesign-nu1aeq`
**Status:** Proposed. Nothing in this plan has been implemented.

---

## 1. The standard

**This must feel like a module Tebra's own team built.** Not "Tebra-inspired."
Not "Tebra-adjacent." A medical assistant who uses Tebra all morning should sit
down at this station in the afternoon and notice no seam in how anything works.

That is a convention bar, not a color bar. Matching the palette is the easy
tenth of it. The other nine tenths is obeying Tebra's product conventions:
their information architecture, their component inventory, their table
behavior, their microcopy voice, their empty states, their density. A page can
be perfectly on-palette and still feel obviously third-party because its table
headers don't sort the way Tebra's sort, or its buttons are named after the
database instead of after what the person is doing.

Three commitments, in priority order:

1. **The clinical engine does not change.** Not one line of `src/domain/`,
   `src/application/`, `src/persistence/`, `src/documentation/`, or
   `public/legacy/`. Dose tables, interval math, missed-dose logic, UDS
   gating, attestation, record locking, and every print sheet stay
   byte-for-byte what they are today. This is a **presentation** project.
2. **It obeys Tebra's conventions.** Section 2 is the specification for that,
   and it is the substance of this project.
3. **It is honest about what it is.** Section 7. Indistinguishable in craft;
   unambiguous about provenance. Those are not in tension — a first-party team
   shipping a local-only companion tool would design that disclosure carefully
   too, not bolt it on.

---

## 2. First-party fidelity

Everything below was read off Tebra's own product documentation and production
stylesheets. These are their conventions, not our invention of them.

### 2.1 Information architecture

Tebra's clinical product is organized around a **Facesheet** — a patient hub —
with a **left section rail**, a **top action bar**, and a body of **summary
cards**. Work arrives through **Open Notes**, a worklist of unsigned notes.
Notes are created from a `+ New Note` control, worked, and **signed**.

Our shell adopts that shape exactly:

| Tebra | Ours |
| --- | --- |
| Facesheet — patient hub, always the anchor | The kiosk's patient banner and summary, same role |
| Left section rail: History, Problems, Medications, Immunizations, Allergies, Vitals, Notes, Labs/Studies, Flowsheets, Demographics, Account, Care Checklist, Documents, Recall, Messages | The subset we truthfully have: **Allergies, Medications, Notes, Flowsheets, Care Checklist, Documents**. Nothing that dead-ends. |
| Top action bar: `+ New Note` (with note-type dropdown), `Print`, `More`, `Customize View` | Identical pattern. `+ New Note` opens Injection / UDS / Samples / Forms as note types. |
| Facesheet summary cards: Medications, Problems, Vitals, History, Labs/Studies, Clinical Recommendations | Our cards: **Last injection**, **Site rotation**, **Allergies**, **Care Checklist**, **Recent notes** |
| Open Notes worklist | Our record list, restructured to match — see 2.3 |
| Patient search: "first 2–3 letters of the patient's name or date of birth (mm/dd/yyyy)" | Same affordance, same placeholder wording, same match behavior |

### 2.2 Component inventory

Build these, named as Tebra names them. A component Tebra doesn't have is a
seam; a component Tebra has that we name differently is also a seam.

`AppHeader` · `PatientSearch` · `FacesheetBanner` · `PatientCardPopup` ·
`SectionRail` · `SummaryCard` · `ActionBar` · `NewNoteMenu` · `NotesTable` ·
`StatusChip` · `LockIndicator` · `CareChecklist` · `Flowsheet` ·
`NoteEditor` · `SignDialog` · `Toast` · `MoreMenu` · `CustomizeView`

### 2.3 Interaction grammar

These are the details that actually give away a third-party build. Match them:

- **Sortable table headers.** Click to sort, click again to reverse. Tebra's
  Open Notes sorts on Patient, Type, and Visit Date this way. Ours does the
  same on the same kinds of column.
- **Table columns.** Tebra's Open Notes runs `Patient | Lock | Type | Status |
  Visit Date`. Ours runs `Patient | Lock | Type | Status | Visit Date` — the
  same shape, with our note types.
- **Lock indicator.** Tebra shows a lock icon when a note is open elsewhere and
  reveals *who* holds it on hover. We have no multi-user server, so ours shows
  the lock for a **signed** record and reveals *who signed it and when* on
  hover. Same affordance, truthful content.
- **Status chips.** Tebra uses `Incomplete` and `Needs Cosign`. Ours uses
  `Incomplete`, `Ready to sign`, and `Signed` — the same chip component, the
  same placement, vocabulary extended only where we genuinely differ.
- **Row click opens.** The whole row is the target, not a trailing link.
- **Hover patient card.** Hovering a patient name raises a card with
  demographics and visit detail. We do the same with what we truthfully hold.
- **Visit date fallback.** Tebra shows the appointment date, or the note's
  creation date/time when there is no appointment. Same rule.
- **Allergies read as prose.** Tebra's Facesheet shows `No known allergies`,
  not an abbreviation. Display copy follows that. (The `NKDA` default in the
  legacy input stays exactly as it is — that is engine, not display.)

### 2.4 Microcopy voice

Tebra's product voice is **imperative, second person, plain, and named after
what the person is doing** — never after the system's internals. Their company
voice is warmer and uses "we"; their *product* voice is short and directive.
Recurring vocabulary from their own writing: *friction*, *backbone*,
*resilient*, *personal*, *support care, not compete with it*.

Concrete rewrites required:

| Today | Tebra voice |
| --- | --- |
| "Attest and lock" | **Sign** |
| "Local record locked" | **Signed** · hover: "Signed by A. Rivera, MA · 2:14 PM" |
| "Outstanding requirements" | **Care Checklist** |
| "Compatibility runtime" / "typed engine" | *never user-visible* |
| "Record List" | **Open Notes** |
| "Start Center" | **Dashboard** |
| "Post" / "Posting strip" | **Save** · **Saving…** · **Saved** |
| "NKDA — staff review" | **No known allergies** · *Review* |
| "Workflow" (user-facing) | **Note type** |

Rules: a button says exactly what happens (`Sign`, then a toast that says
`Signed`). Errors say what went wrong and how to fix it. No apologies, no
system nouns, no invented jargon.

### 2.5 Density — match the product, not the marketing site

Tebra's *marketing* site is airy: 18px body, 57px buttons, 24–32px radii.
Tebra's *product* is considerably denser — tables, cards, a section rail, real
clinical data on one screen. Calibrate to the product.

The token system therefore has two tiers (exact values in `MANIFEST.md` §3):

- **Brand tier** — Tebra's real marketing sizes, reserved for the surfaces a
  touchscreen genuinely wants big: the facesheet banner, the primary action,
  the site picker, the sign confirmation.
- **Workstation tier** — compressed, same colors and typeface, for tables,
  worksheets, and field labels. This is where a Tebra product screen actually
  lives.

Getting this split wrong in either direction reads as third-party: too airy and
it looks like the marketing site pretending to be an app; too dense and it
looks like the old MEDITECH shell wearing Tebra colors.

### 2.6 Motion and feedback

Tebra transitions `background-color`, `filter`, `color`, and `box-shadow` at
`.3s ease-in-out`. Use exactly that for controls. Workstation-tier feedback
(field validation, row selection) runs faster at 120ms. Cap both to zero under
`prefers-reduced-motion`.

### 2.7 The one place we must not follow Tebra

Tebra's accent coral `#ff8d6e` sits close to a clinical warning hue. In a
station where color carries stop/review/ready meaning, that is unacceptable.

**Rule (non-negotiable):**
- Coral marks **the single primary action on a screen**. It never carries
  clinical meaning.
- Clinical status uses the separate triad in `MANIFEST.md` §3.2.1, derived to
  sit in the Tebra family while staying distinguishable from coral.
- **Status is never color-only.** Every stop / review / ready state carries an
  icon *and* a word. Verify `StatusFlag.tsx` still enforces this after restyle.

---

## 3. Kiosk mode

The station's whole day is administering long-acting injectables. A first-party
team building *this* module would not ship a general EHR shell — they would
ship a focused one.

1. **Kiosk shell** — `?kiosk=1` plus a persisted preference. Section rail
   collapses to the sections this task needs; single work column; Fullscreen
   API on user gesture. The full shell stays available for chart review.
2. **Persistent Facesheet banner** — name, DOB, allergies, last injection and
   site, next due. Tabular figures throughout.
3. **Injection stepper** — Identify → Verify order → Prepare → Site →
   Administer → Response → Sign. Each step maps **1:1 onto an existing legacy
   panel tab**. The stepper is navigation and progress only; the engine still
   owns every gate.
4. **Touch-first site picker** — large tiles with rotation history from
   `site-history.ts`. Minimum 44×44 CSS px targets throughout kiosk mode.
5. **Sign-and-next loop** — after signing: a confirmation card offering
   `Print patient handout` and `Start next patient`. Both actions already
   exist; this makes them the obvious next step.
6. **Care Checklist rail** — same `projectClinicalReadiness` data, Tebra
   presentation, always visible in kiosk mode.
7. **Idle lock** — keep `useIdleLock` (15 min) semantics exactly; restyle only.
8. **Accessibility** — honor `prefers-reduced-motion` and `prefers-contrast`,
   keep the skip link and every existing ARIA role, stay fully keyboard-operable.

---

## 4. Phasing

One commit per phase, CI green before the next. Visual snapshots regenerated
**deliberately, once per phase** — never as a reflex to a red run.

| Phase | Scope | Risk |
| --- | --- | --- |
| **0 — Tokens** | `tebra-tokens.css` (screen-scoped). Add Inter Variable + JetBrains Mono (Plus Jakarta stays — print). Boot splash and favicon. No structural change. | Low |
| **1 — Voice** | Microcopy per §2.4. Label-only; no logic, no keys. | Low |
| **2 — Chrome** | App header, section rail, action bar, footer, dialogs, buttons, fields. Retire `meditech-screen-contract.*`. | Medium |
| **3 — Conventions** | Facesheet cards, Open Notes table with sort/lock/status chips, hover patient card, `+ New Note` menu, `More`, `Customize View`. | Medium |
| **4 — Kiosk** | Kiosk shell, stepper, site picker, sign-and-next. | Medium-high |
| **5 — Cleanup** | Delete dead MEDITECH CSS, refresh README. | Low |

**Rollback:** every phase is additive at the CSS layer until Phase 5. Reverting
a phase commit restores the prior look with the engine untouched throughout.

---

## 5. Hard constraints

1. **Print is frozen.** `public/legacy/legacy.css` loads at `media="print"` and
   solely owns the 8 print sheets. Output is asserted byte-identical against a
   fixture anchored to `bc4a255d`. **Every new stylesheet must be `@media
   screen`-scoped.** One `media="all"` link leaks the redesign into patient
   handouts and fails `npm run test:print`.
2. **Do not edit** `public/legacy/legacy-runtime.js`, `public/legacy/legacy.css`,
   `src/legacy/legacy-markup.html`, `src/domain/**`, `src/application/**`,
   `src/persistence/**`, `src/documentation/**`.
3. `scripts/check-app.js` asserts the existence of
   `src/presentation/clinical-desktop.css` and
   `workflows/workflow-panels.css`. Keep those paths, or update `check-app.js`
   in the same commit.
4. `scripts/check-app.js` also asserts ~50 clinical-behavior regexes against
   the legacy runtime and markup. If one goes red, the change touched the
   engine — revert it, do not relax the assertion.
5. Preact, not React. Strict TS with `noUncheckedIndexedAccess`.
6. Viewport floor is **800×600**; 390px is an intentional unsupported-mobile
   gate and must keep failing gracefully.
7. **Win32 visual baselines cannot be regenerated in CI** (`snapshotPathTemplate`
   is per-platform). Only `linux/` can be refreshed here. Flag the stale
   `win32/` set for a maintainer on Windows.

---

## 6. Out of scope

Tebra has these; we do not, and inventing them would be the most obvious tell
of all — a first-party module never links to a feature that isn't there:
**Charge Capture, ePrescribe, Patient Portal, Message Center, Billing,
Telehealth, Labs ordering, Referrals, Recall.** No dead-end navigation.

---

## 7. Provenance — the one seam we keep on purpose

Match Tebra's craft completely. Be unambiguous about what system this is. Those
are not in tension, and the reason is clinical, not legal.

**This app has no server, no database, and no synchronization.** Records,
drafts, and audit activity live in the current browser and nowhere else. The
README already requires the status bar to disclose that. If the interface
becomes visually indistinguishable from Tebra with no other signal, a medical
assistant will reasonably conclude their documentation landed in the patient's
chart. It did not. That is a real patient-safety failure mode, and the more
faithful the design gets, the sharper it becomes.

So the fidelity work raises the bar on the disclosure rather than removing it:

- **Name the module truthfully.** It presents as an IPMG module — its own name,
  its own mark — designed *in* Tebra's language, the way a first-party team
  would ship a companion tool. Not as Tebra itself.
- **Design the local-only disclosure properly**, in Tebra's own voice and
  component grammar, always visible, never a bolted-on warning banner. A
  Tebra-quality team would sweat this exact detail.
- **Do not ship Tebra's logo or wordmark**, and do not imply endorsement or
  affiliation. Tebra is a third-party trademark.
- **Do not ship Akkurat LL or Akkurat Mono LL.** They are commercial Lineto
  families and are not licensed here. Ship the open substitutes in
  `MANIFEST.md` §3.1.

Adopting a vendor's design conventions so staff carry zero context-switch cost
is ordinary, good practice. Shipping their trademarked marks and licensed
fonts, or letting staff believe local-only data reached the real chart, is not.
The line sits there.

If the clinic wants a genuinely Tebra-licensed, Tebra-integrated module, that is
a conversation with Tebra — a partnership and an API, not a stylesheet.

---

## 8. Definition of done

- [ ] `npm run test:ci` green.
- [ ] `npm run test:print` green with **zero** print-fixture diff.
- [ ] `scripts/check-app.js` green with **no assertion relaxed**.
- [ ] Linux visual baselines regenerated and reviewed image-by-image.
- [ ] Stale `win32/` baselines flagged in the PR body.
- [ ] No horizontal overflow at 800×600, 1024×768, 1366×768, 1440×900.
- [ ] Kiosk mode fully keyboard-operable; `prefers-reduced-motion` honored.
- [ ] Every clinical status carries icon + word, never color alone.
- [ ] Contrast ≥ 4.5:1 body text, ≥ 3:1 UI boundaries.
- [ ] Local-only storage disclosure visible on every screen, in voice.
- [ ] **Convention review** (`MANIFEST.md` §5) passed screen by screen.
- [ ] `git diff --stat` shows **zero** changed lines under the frozen paths in §5.2.
