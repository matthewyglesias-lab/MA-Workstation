# Phase 4B — saved records and preview boundaries

Local implementation checkpoint: `f3d4267a50bcf52b2df41d51f50599f797c4f569`;
tree `866ce4316d3b31c7fc8f8938cb1922b8c16e46e0`.

Saved injection records and Saved UDS records identify each window's actual task.
Their subtitle explicitly scopes records to this browser on this workstation.
Preview retains its existing signed/read-only mode and one clear boundary:
Copying does not file it. Confirm the final note separately in Tebra.

Type/static and build passed. Seven unique targeted browser cases passed,
retries=0, no skipped/unexpected/flaky: both window widths with exact stored-byte
preservation and focus return, signed-local boundary, both workflow recovery
previews, repeated UDS modal lifecycle, and patient search by local name/DOB.
The first new heading check loaded an earlier preview bundle; trace asset hashes
established that mismatch. A fresh preview port with reuse disabled and sequential
build/test execution passed against the current bundle.

Reviewed populated injection and empty UDS windows at 1440x900 and 800x600:
headings, locality, table columns, focused search, native modal and footer actions
remain legible. No snapshot references or thresholds changed. No new persistence,
feedback owner, listener or PatientSearch refresh path was introduced.

The targeted phase gate is green; final exact-head certification remains Phase 6.
