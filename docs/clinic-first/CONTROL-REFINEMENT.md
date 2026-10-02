# Control refinement and release scope

The October 1 follow-up asks for a closer relationship to the Letter Builder,
especially inputs, icons and color. The user subsequently authorized merging
PR #68 to main after verification. That supersedes earlier draft-only release
boundaries. Main's existing Azure workflow builds, tests and deploys the app.

## Reference and changes

The actual September 14 `IPMG_Letter_Builder_Standalone.html` was opened locally
and inspected at 1440 × 1000, including its workspace and dialog. This pass
adopts its white working fields, navy text, restrained lavender/sage surfaces,
consistent corners and Lora/Mulish typography while preserving the workstation's
service desk, section navigation and patient context.

- `controls.css` owns native input appearance across clinical forms, supporting
  tools and portalled dialogs. Twenty-seven superseded field rules were removed
  from older presentation layers. Labels, entered values, placeholders, focus,
  disabled/read-only states and invalid fields have explicit treatments.
- Native selects and their F9 search buttons form a single aligned control.
  Keyboard selection, date parsing, validation and lookup behavior are unchanged.
  Forced colors restores the native select arrow; focus remains visible.
- The reference's unmodified Lora and Mulish WOFF2 files are bundled locally,
  with both complete SIL Open Font Licenses. No remote fonts or dependencies
  were added. Font definitions and token changes are screen-only; the existing
  standalone packager includes both fonts.
- Uniform line arrows and disclosure icons replace platform-dependent glyphs
  in navigation. Medication samples now uses a capsule rather than a specimen
  tube. All decorative SVGs remain hidden from assistive technology.
- Menus and dialogs have consistent corners, quieter headers and aligned
  controls. Clinical warning, stop and ready colors retain their meanings.

## Verification

The certified starting point was `ba77395`: 752 unit tests and 306 browser tests.
The first detail review caught inadequate contrast for navy text on the coral
start action (3.76:1). Its text is now darker; the unchanged 4.5:1 requirement
passes. Joined-select corner and compact-search cascade conflicts were also
corrected before release. Visual review found white text retained from a legacy
dark UDS schedule header on its pale replacement; the heading now has explicit
navy text and a regression check for at least 4.5:1 contrast.

Four additional browser journeys check field and lookup alignment, readable
text/borders, bundled fonts, visible focus, F9/Escape and retained input at
800 × 600, including forced colors. Existing clinical, persistence, document,
printing, interruption and standalone coverage remains. Intentional screen
contracts and inspected Linux captures follow the new visual system; screenshot
tolerances and clinical/document fixtures are unchanged.

The PR records final exact-source CI results. Visual review is engineering
review, not clinical acceptance. Managed Edge/Windows, physical printing and
real clinic use remain outside this Linux browser verification.

This pass changes no clinical rule, record schema, local storage key, Tebra note
content, AVS/print stylesheet, clinic contact detail or medication instruction.
