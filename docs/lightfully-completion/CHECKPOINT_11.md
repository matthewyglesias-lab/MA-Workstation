# Phase 5C — compact shell/worklist

Implementation `2c4c8ef166b79ef0580ea7a8a66025d37790be68`, tree
`06bc85f083268b0bf3bcad543cf062902220322f`.

Native worklist cells align at the top so long patient/task lines do not displace
neighboring service, date and status baselines. Recorded-local lifecycle uses a
neutral state; real review/stop cues remain exceptional. No row projection,
counts, columns, source IDs, resume commands or patient identity changed.

Type/static/build passed. Five targeted cases passed, retries=0, covering native
populated worklist geometry and keyboard resume at 1440/800, compact composition
at supported widths and UDS draft resume with the correct patient. Reviewed both
populated screenshots; all four rows remain available through the native scroll
region, patient identities and action labels are intact. Full certification pending.
