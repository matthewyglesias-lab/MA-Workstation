# Phase 5D — preview, reference and closeout

Implementation `91889f9bfdca2a6967ff9fb34e38277aaa4346ec`, tree
`6ea0d37a7b01025f392c64b8ce8b91802ffb4f40`.

Closeout now presents the actual needs-review queue first, outputs second, then
summary and activity. Local management remains a separate deliberate disclosure.
Preview locality was completed in Phase 4B; Reference already uses its clinical
index and reading surface. Neither was rebuilt. Output handlers, log filtering,
original row indexes/deletion and print renderer are unchanged.

Type/static/build passed. Ten unique targeted cases passed in the final combined
run, retries=0, including supported wide/narrow Reference and Closeout layouts,
reference read-only browsing, output/management separation, keyboard filtering
and non-destructive empty recovery. Added explicit first/second/third section
order and horizontal output-group assertions. Visual inspection caught inherited
column flex direction; the dedicated closeout group now lays out compact actions
horizontally. Reviewed final populated wide and narrow management renderings.
No visual references/tolerances changed. Full final certification is next.
