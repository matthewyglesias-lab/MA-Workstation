# Lightfully component polish — continuation checkpoint

## Baseline and scope

Continuation of the approved mature workspace at `8d752ac255854a58901e8c8e1e93ac30b5981e94`.
The screen-only component system now covers injection entry and guidance,
radio/checkbox controls, calculated readouts, traceability, administration sites,
exception disclosures, other services, reference lookup and saved-record dialogs.
The existing Worklist / Document a service / Saved records / Tools architecture stays.

## Presentation changes

- One common control, spacing, type, focus and status system. A single field-level
  focus outline replaces the previous outline around both field and input.
- Injection patient/order rows use purposeful name/DOB/provider proportions;
  encounter type precedes the active-order-purpose field. Site choices keep
  right and left pairs together. Provenance codes have readable display labels.
- Known documented-negative allergy text uses a neutral summary. Unknown or other
  allergy content keeps review styling. No allergy data/defaults were changed.
- Samples and forms retain their original actions in a bottom dock, outside
  their scrolling fields. Captions are associated with real controls for keyboard
  and assistive-technology access. No auto-submit or new completion rules.
- Native choice controls replace retired hand-painted pseudo-elements, including
  body-mounted dialogs. Clinical hold/error selections remain amber/red; ordinary
  selection is not a claim of completion or administration.
- Reference entries keep all descriptive lines inside the selected row.
  Large forms retain their content, existing help and optional exception paths.

## Protected implementation boundary

No changes to `public/legacy`, `src/legacy`, `src/domain`, `src/application`,
`src/persistence`, `src/documentation`, or `tests/fixtures`. The generated notes,
print templates, prescribing/timing logic, record schemas, storage guards and
signing pathways remain the original implementations. New styling is screen-only.

## Verification and interruption recovery

Use `npm run check`, `npm run test:unit`, `npm run build`, then the complete
Playwright suite. Set `VITE_ENABLE_INJECTION_PATIENT_SCREENING=true` for the build.
Run `node scripts/package-standalone.mjs` and the opt-in standalone-file test.
Intended appearance snapshots need review after these screen changes; clinical
and print assertions must not be removed to make a visual redesign pass.

The new tests exercise readable patient context, active requirements, stable
form/preview state, accessible captions, docked actions at 800x600 and 1440x900,
unchanged focus surface, and checked choice controls without overflowing marks.
The previous autosave-timing test now compares the entire record except its
mutable `updatedAt` timestamp, avoiding a race without discarding clinical facts.

This is still browser-local software, not a shared EHR or a Tebra sync service.
Never bypass storage/writer-protection errors. Keep Tebra as the chart of record.
Use a synthetic patient for local clinic acceptance testing before patient use.
