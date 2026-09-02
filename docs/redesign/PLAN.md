# Tebra-Language Injection Kiosk — Redesign Plan

**Repository:** `matthewyglesias-lab/MA-Workstation`
**Branch:** `claude/ma-workstation-tebra-redesign-nu1aeq`
**Status:** Proposed. Nothing in this plan has been implemented.

---

## 1. What we are building

Replace the workstation's MEDITECH/Windows-client-server presentation with a
**Tebra-language clinical kiosk**, tuned for the one thing this station actually
does all day: **administer and document long-acting injectables**.

Three commitments, in priority order:

1. **The clinical engine does not change.** Not one line of `src/domain/`,
   `src/application/`, `src/persistence/`, `src/documentation/`, or
   `public/legacy/`. Dose tables, interval math, missed-dose logic, UDS
   gating, attestation, record locking, and every print sheet stay
   byte-for-byte what they are today. This is a **presentation** project.
2. **It reads as Tebra.** Real Tebra palette, real Tebra type character, real
   Tebra product vocabulary (*Facesheet*, *Open Notes*, *Care Checklist*,
   *Sign*), real Tebra control grammar (rounded, generous, coral primary on
   teal ground).
3. **It behaves as a kiosk.** One task at a time, full-screen, touch-first
   targets, an idle lock, and a *sign → handout → next patient* loop that a
   medical assistant can run without leaving the station.

### What "but better" means concretely

| Today | After |
| --- | --- |
| 1990s client/server chrome; menu bar, titlebar, F-key deck as primary UI | Tebra app bar + module rail; F-keys demoted to a power-user popover, not deleted |
| "Record List", "Start Center", "attest and lock" | "Open Notes", "Dashboard", "Sign" — Tebra's actual clinical vocabulary |
| Dense 11–12px Tahoma everywhere | Tebra type character with a **two-tier scale**: kiosk-large for primary actions, workstation-dense for worksheets |
| Injection worksheet = tabbed panel | Injection = a **7-step stepper** over the same panels, with a Care Checklist rail |
| Site selection = small tiles | Large touch body-map/tile grid with rotation history surfaced |
| After locking a record, you are just… on a locked record | **Sign-and-next**: confirmation card → print handout → start next patient |
| Idle lock exists but looks like an OS lock screen | Tebra-branded lock with fast staff re-entry |

---

## 2. The tension we are deliberately managing

Tebra's public design language is a **marketing** language: 18px body copy,
57px-tall buttons, 24–32px radii, wide margins, coral CTAs on cream. Applied
literally to an injection worksheet it would roughly halve information density
and push safety-critical fields below the fold.

So the token system has **two tiers**:

- **Brand tier** — exact Tebra values (color, typeface character, motion,
  radii). This is what makes it unmistakably Tebra.
- **Workstation tier** — a compressed scale *derived from* the brand tier for
  dense worksheet surfaces. Same colors, same typeface, smaller steps.

Tebra's large treatment is kept exactly where it genuinely belongs at a
touchscreen: the facesheet banner, the site picker, the primary action button,
and the sign/next confirmation. Everywhere else, density wins.

### The one place we must bound the brand: clinical status color

Tebra's accent coral `#ff8d6e` sits close to a clinical "warning" hue. That is
unacceptable in a workstation where color carries stop/review/ready meaning.

**Rule (non-negotiable):**
- Coral is reserved for **the single primary action on a screen**. It never
  carries clinical meaning.
- Clinical status uses a separate declared triad (see `MANIFEST.md` §3.2),
  chosen to stay in the Tebra family while remaining distinguishable.
- **Status is never color-only.** Every stop / review / ready state carries an
  icon *and* a text label. Verify `StatusFlag.tsx` still enforces this after
  restyle.

---

## 3. Product vocabulary: adopt Tebra's real clinical nouns

Harvested from Tebra's own clinical help taxonomy. Renaming the shell to these
is what makes the product read as Tebra beyond the color layer.

| Current | Tebra term | Applies to |
| --- | --- | --- |
| Start Center | **Dashboard** | `WORKFLOW_LABELS.home` |
| Record List / Records Window | **Open Notes** (unsigned) / **Charts** | `RecordsWindow`, `UdsRecordsWindow` |
| Chart context / patient banner | **Facesheet** | `cd2004-patient-*` |
| Readiness / Outstanding Requirements | **Care Checklist** | `readiness-projection`, `OutstandingRequirements` |
| Attest and lock | **Sign** / **Signed** | `RecordActionDialog`, `RecordLifecycleActions` |
| Injection / UDS / Samples / Forms | **Note types** | `WorkflowLedgerTabs` |
| Activity log | **Audit Trail** | `activity-log` |
| Injection history / site rotation | **Flowsheet** | injection history views |
| Knowledge | **Reference** | `KnowledgePanel` |
| Daily Closeout | **Daily Closeout** (keep — no Tebra equivalent) | `DailyCloseoutPanel` |

**Labels only.** No store keys, no persistence keys, no storage schema, no
`WorkflowId` union values change. Renaming a `WorkflowKey` breaks saved records.

Explicitly **out of scope** (Tebra has them; we do not): Charge Capture,
ePrescribe, Patient Portal, Message Center, Billing, Telehealth. Do not add
navigation entries that dead-end.

---

## 4. Kiosk mode

New, and the substance of "better".

1. **Kiosk shell** — `?kiosk=1` and a persisted preference. Hides the menu bar
   and desktop metaphor; single work column; Fullscreen API on user gesture.
   The standard shell stays available for chart review at a desk.
2. **Persistent facesheet banner** — name, DOB, allergies (NKDA default),
   last injection + site, next due. Tabular figures throughout.
3. **Injection stepper** — Identify → Verify order → Prepare → Site →
   Administer → Response → Sign. Each step maps **1:1 onto an existing legacy
   panel tab**; the stepper is a navigation and progress skin over
   `InjectionPanel`, not a new flow. The engine still owns every gate.
4. **Touch-first site picker** — large tiles with rotation history from
   `site-history.ts`. Minimum 44×44 CSS px targets everywhere in kiosk mode.
5. **Sign-and-next loop** — after signing: a Tebra confirmation card offering
   *Print patient handout* and *Start next patient*. Both already exist as
   actions; this makes them the obvious next step instead of a hunt.
6. **Care Checklist rail** — same `projectClinicalReadiness` data, Tebra
   presentation, always visible in kiosk mode.
7. **Idle lock** — keep `useIdleLock` (15 min) and its semantics exactly;
   restyle only.
8. **Accessibility** — honor `prefers-reduced-motion` (cap Tebra's `.3s
   ease-in-out`), `prefers-contrast`, and keep the skip link and every existing
   ARIA role. Kiosk mode must remain fully keyboard-operable.

---

## 5. Phasing

Each phase is one commit, CI green before the next. Visual snapshots are
regenerated **deliberately, once per phase** — never as a reflex to a red run.

| Phase | Scope | Risk |
| --- | --- | --- |
| **0 — Tokens** | New `tebra-tokens.css` (screen-scoped). Font swap Plus Jakarta → Inter Variable + mono. No structural change. | Low. Snapshot churn only. |
| **1 — Vocabulary** | Label-only renames per §3. No logic, no keys. | Low. Test-string updates. |
| **2 — Chrome** | App bar, module rail, footer, dialogs, buttons, fields restyled to Tebra. Retire `meditech-screen-contract.*` → `tebra-screen-contract.*`. | Medium. Whole-app snapshot rebase. |
| **3 — Kiosk** | Kiosk shell, stepper, facesheet, site picker, sign-and-next. | Medium-high. New e2e coverage required. |
| **4 — Cleanup** | Delete dead MEDITECH CSS, refresh README, prune unused rules. | Low. |

**Rollback:** every phase is additive at the CSS layer until Phase 4. Reverting
a phase commit restores the prior look with the engine untouched throughout.

---

## 6. Hard constraints the implementer must not violate

1. **Print is frozen.** `public/legacy/legacy.css` loads at `media="print"` and
   is the sole owner of the 8 print sheets. Print output is asserted
   byte-identical against a fixture anchored to `bc4a255d`. **Every new
   stylesheet must be `@media screen`-scoped.** A single `media="all"` link
   leaks the redesign into patient handouts and fails `npm run test:print`.
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
6. Supported viewport floor is **800×600**; 390px is an intentional
   unsupported-mobile gate and must keep failing gracefully.
7. **Win32 visual baselines cannot be regenerated in CI** (`snapshotPathTemplate`
   is per-platform). Only `linux/` baselines can be refreshed here. Flag the
   stale `win32/` set for a maintainer on a Windows machine.

---

## 7. Trademark and licensing — read before shipping

- **Tebra is a third-party trademark.** This is an internal clinic tool that
  adopts a Tebra-*inspired* design language. Do not ship Tebra's logo or
  wordmark, do not use the name in the product title or favicon, and do not
  imply endorsement or affiliation. The product stays IPMG-branded.
- **Akkurat LL and Akkurat Mono LL are commercial Lineto fonts** and are not
  licensed for this project. Ship the open substitute (Inter Variable + a mono)
  specified in `MANIFEST.md` §3.1. Do not download or self-host Akkurat.
- Color values are observations of a public website; using a similar palette is
  ordinary design practice. Copying logo artwork or licensed font binaries is
  not. Keep the line there.

If the clinic wants a true Tebra-licensed look, that is a conversation with
Tebra, not a code change.

---

## 8. Definition of done

- [ ] `npm run test:ci` green (check + unit + e2e).
- [ ] `npm run test:print` green with **zero** print-fixture diff.
- [ ] `scripts/check-app.js` green with **no assertion relaxed**.
- [ ] Linux visual baselines regenerated and reviewed image-by-image.
- [ ] Stale `win32/` baselines flagged in the PR body.
- [ ] No horizontal overflow at 800×600, 1024×768, 1366×768, 1440×900.
- [ ] Kiosk mode fully keyboard-operable; `prefers-reduced-motion` honored.
- [ ] Every clinical status carries icon + text, not color alone.
- [ ] Contrast verified ≥ 4.5:1 for body text, ≥ 3:1 for UI boundaries.
- [ ] `git diff --stat` shows **zero** changed lines under the frozen paths in §6.2.
