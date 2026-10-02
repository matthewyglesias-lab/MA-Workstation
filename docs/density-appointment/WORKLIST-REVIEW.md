# Populated worklist inspection correction

After the 820-unit / 52-focused-browser candidate review, visual inspection of
the populated-worklist image revealed a real inherited CSS conflict: a native
`tr` reused `tebra-record-row`, whose legitimate owner is the patient-note flex
card. This changed table row display to flex and collapsed the first column.

The worklist now uses its own row and patient-cell classes, preserving native
table layout. No extra override stylesheet, event listener, or second row
renderer is introduced. Patient-note cards retain their own styling.

The populated-worklist screenshot test now checks computed table-row/table-cell
display, cell alignment with headers, minimum usable patient width, and bounded
row height. Two complete journeys at 1440 and 800 pixels also resume the correct
saved draft with the keyboard and verify both patient name and DOB. A source
ownership test prevents the incorrect class reuse from returning. Screenshot
references are replaced only after the new geometry and journeys pass, followed
by independent full PR regression. Earlier passing image-generation tests were
not accepted as proof of visual quality.

The full-suite review of 80342e6 also found two stale expectations: patient-note
filters now use their explicitly defined 40px height when Compact is active,
and newly saved typed encounter envelopes are version 3. Their tests now assert
those exact values and additionally prove that a legacy record does not acquire
new-encounter appointment metadata. No clinical assertion or screenshot tolerance
is relaxed. Existing Actions workflows are unchanged.
