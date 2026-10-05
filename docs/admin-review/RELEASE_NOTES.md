# Admin review candidate — release notes

Certified runtime: `4886db988834783058ca06cc97e39548edd5be44`.
This is a controlled-pilot review candidate; PR #71 remains draft.

## Changes staff will see

- Samples keeps patient instructions visible and discloses optional titration/
  prescriber intent only when needed. Disclosure does not change stored facts.
- Forms/request tracking keeps unavailable letter authoring out of its navigation;
  a small availability disclosure follows documentation.
- Saved windows identify Injection or UDS and state browser/workstation locality.
  Preview concisely states that copying does not file the note in Tebra.
- UDS uses a native evidence table with full analyte names, physical position,
  result, flag and status. Negative results are neutral; positive/invalid evidence
  stays explicit. Counts follow the table without covering results.
- Service selection, provider lookup and workspace/account menus have consistent
  readable controls while retaining their separate semantic jobs. Long menu
  descriptions wrap and all six Injection workspace actions fit at 800x600.
- Compact worklist rows align patient/task, service, date, state and action. Local
  recorded lifecycle is neutral and retains its visible SVG marker.
- Daily closeout presents actual needs-review work first, outputs second, then
  summary/activity. Local data management remains separate and deliberate.

Earlier refinements improve read-only browsed-patient context, quiet routine
documentation attention, semantic Reference reading, provider lookup and
signed-control boundaries. A missing required response still blocks signing;
quiet presentation does not establish clinical clearance.

## Preserved behavior

Clinical engines, actual sign gates, patient isolation, recovery/writer guards,
record schemas/keys, exact note copy and approved Injection AVS/print renderers
remain intact. UDS physical order, result cycle/direct keys, bulk/QC operations,
preliminary status and locks are retained. No second feedback/event owner was
introduced. Superseded UDS grid and chooser CSS was removed rather than adding
a catch-all final stylesheet.

## Verification and availability

898 unit tests and 414 full browser/visual/print cases passed. Exact production
artifact testing passed 413 cases with the standalone-only opt-in case covered
in the full review. Both paths use zero retries. Strict visual references changed
only after expected/actual/difference inspection; tolerances and clinical/print
golden contracts remain unchanged.

Azure PR preview capacity is exhausted. The review archive therefore carries
the exact tested standalone HTML and production ZIP with checksum/provenance
evidence. Main and production deployment are unchanged.

Records remain browser-local. Local signing/copying/printing does not file in
Tebra, and AVS appointment metadata does not book a visit. There is no app
authentication, central database, synchronization or centralized backup. TMS
and letter authoring remain unavailable. Managed Windows/Edge, office-printer,
security/governance and controlled-pilot acceptance remain organizational gates.
