# Power Apps Canvas wiring

This guide wires a Canvas clinical-action modal to the **MA Workstation Injection Workflow** custom connector. Canvas owns navigation and draft entry only. Dataverse owns the draft, while the API owns the facility date, authenticated actor, timestamps, clinical evaluation, finalization decision, chart note, and AVS rendering.

Import `connector/apiDefinition.swagger.yaml` after replacing its host and Entra placeholders. Keep formula-level error management enabled. The examples use classic Check box/Text input properties (`Value`/`Text`) and en-US separators; use `Checked`/`Value` for modern controls and let Studio localize separators.

## Tebra/kiosk visual shell

Build the staff board with responsive auto-layout containers so it feels like
the kiosk on a desktop or tablet without copying browser-only persistence.
Keep the selected check-in visible on the left and open Clinical Actions in a
right-side panel at desktop widths; below 900 px, make that panel a full-screen
modal with a persistent Back action. Do not use hand-positioned controls for
the main form—their tablet wrapping and scaling are fragile in Canvas.

| Token/use | Value | Application |
| --- | --- | --- |
| Primary teal | `#0F8F83` | Selected tabs, primary buttons, focus accents |
| Deep ink | `#163B4A` | Headings and high-emphasis text |
| Canvas | `#F4F8F8` | Board/modal background |
| Card | `#FFFFFF` | Check-in rows, form groups, guidance cards |
| Divider | `#D8E6E7` | Quiet borders and separators |
| Success | `#2E8B6B` | Server-confirmed ready/final states only |
| Attention | `#B7791F` | Warnings and manual-check-in review |
| Stop | `#B84A4A` | Clinical stops and failed finalization |

Use the kiosk's locally uploaded SVG icon assets (never an external icon URL)
for Check-in, Injection, UDS, and TMS. Pair every icon with a visible label;
do not make color or the icon alone carry status. Use 44 px minimum targets,
12–14 px card radii, a restrained shadow, and the same icon placement on every
action card. UDS/TMS cards stay visually polished but carry a clear **Not
connected** badge and no completion affordance.

Within Injection, use six short sections and a sticky guidance rail on wide
screens:

1. Patient and active order
2. Medication, dose, cadence, and prior administration
3. Safety screen and medication-specific verifications
4. Product, route, site, needle, and traceability
5. Administration response and exceptions
6. Disposition, final review, note, and AVS

Bind the form to the server response rather than duplicating MA rules. The
custom connector returns `evaluation.output.requirements` as a typed array for
Canvas, `guidance` as cards, and the complete `needle` projection. For example,
the state of a field can be read with:

```powerfx
Coalesce(
    LookUp(
        varEvaluationEnvelope.evaluation.output.requirements,
        field = "patient.name",
        state
    ),
    "pending"
)
```

Display warnings/stops above the affected section, keep the guidance and
needle cards read-only, and reserve the green finalized treatment for a
successful `FinalizeInjection` response.

Use `samples/injection-encounter.example.json` as the DTO shape reference when
building `varInjectionEncounter`. It contains synthetic data only. Initialize
text fields to `""` and booleans to `false`; avoid `Blank()` for properties
that the API requires, because Canvas may serialize it as `null` or omit it.
Build optional initiation/paired-product records only when that workflow is
active, and serialize the final record once immediately before the Dataverse
draft `Patch`.

## Clinical-action modal

Use a gallery with checkboxes, not connector calls inside `ForAll`. Initialize its collection when the modal opens:

```powerfx
ClearCollect(
    colClinicalActions,
    { Key: "Injection", Label: "Injection", Selected: false, State: "available" },
    { Key: "UDS", Label: "UDS", Selected: false, State: "placeholder" },
    { Key: "TMS", Label: "TMS", Selected: false, State: "placeholder" }
);
Reset(chkManualCheckIn);
Reset(txtManualReason);
Reset(txtManualSource);
Reset(chkFinalReview);
Set(varClinicalActionOpen, true)
```

For each checkbox, capture the key before entering the collection record scope:

```powerfx
// OnCheck
With(
    { selectedKey: ThisItem.Key },
    UpdateIf(colClinicalActions, Key = selectedKey, { Selected: true })
)

// OnUncheck
With(
    { selectedKey: ThisItem.Key },
    UpdateIf(colClinicalActions, Key = selectedKey, { Selected: false })
)
```

UDS and TMS may be selected to preserve the intended action list, but label them **Not connected** and keep `State = "placeholder"`. Do not give either action a finalize button, connector call, or path to `complete`. A placeholder-only selection cannot continue.

For a manually confirmed check-in, show all three controls and reset them whenever the modal opens:

- an unchecked acknowledgement checkbox;
- a required reason;
- a required source, such as the order or provider direction used for the manual check-in.

If the selected schedule row has a verified Tebra check-in, use acknowledgement kind `tebra`. The linked Clinical Action row must also carry the board-owned `Tebra Acknowledged` Two Options value; the API reloads it and rejects an unsupported Tebra claim. The clinical modal must not be allowed to write that protected column. Otherwise use `manual` and require the explicit controls. The Continue/Finalize gate is:

```powerfx
With(
    {
        hasInjection: CountIf(colClinicalActions, Selected && Key = "Injection") = 1,
        manualReady: varCheckInKind <> "manual" ||
            (
                chkManualCheckIn.Value &&
                !IsBlank(Trim(txtManualReason.Text)) &&
                !IsBlank(Trim(txtManualSource.Text))
            )
    },
    If(
        hasInjection && manualReady && !varInjectionBusy,
        DisplayMode.Edit,
        DisplayMode.Disabled
    )
)
```

The checkbox is an intent, not audit provenance. Send only the acknowledgement kind and, for `manual`, its reason and source. The API must stamp the Entra subject, staff display name, and UTC time. Never send a client-created actor or timestamp.

## Injection state model

Keep one explicit `varInjectionState` and render from it:

| State | Meaning | Allowed next action |
| --- | --- | --- |
| `editing` | Draft changed; any earlier evaluation is stale. | Evaluate |
| `evaluating` | `EvaluateInjection` is in flight. | None |
| `needs-review` | Evaluation is not finalizable; render any stops and warnings. | Edit, then evaluate |
| `ready-to-finalize` | Server response says `output.canFinalize = true`. | Finalize |
| `finalizing` | `FinalizeInjection` is in flight. | None |
| `finalized` | A successful finalization response returned that status. | Use returned documents |
| `failed` | Transport, authentication, schema, or server failure. | Retry safely or return to review |

Every encounter field change must clear the evaluation and return to editing:

```powerfx
Set(varEvaluationEnvelope, Blank());
Set(varEvaluatedEncounterJson, Blank());
Set(varFinalizeKey, Blank());
Set(varInjectionState, "editing")
```

### Evaluate

Serialize the pure encounter once, save a complete envelope to the authoritative draft, and then ask the API to evaluate that row by ID. The API—not Canvas—reloads the row and captures its exact Dataverse ETag. The response remains strongly typed, so do not `ParseJSON` it.

The formula below uses a schematic Dataverse table named `'Clinical Actions'` with `Clinical Action ID`, `Draft JSON`, `Status`, and the protected `Tebra Acknowledged` flag maintained by the check-in board. Replace those display names with the target environment's columns. `varClinicalActionRecord` must be an existing `Draft` row originally selected from that table; check-in, patient, and order IDs must come from authoritative records, not labels. Disable editing for every other status and use ID-only document retrieval for finalized rows.

```powerfx
Set(varInjectionBusy, true);
Set(varCallFailed, false);
Set(varCallError, Blank());
Set(varInjectionState, "evaluating");
Set(
    varEvaluatedEncounterJson,
    JSON(varInjectionEncounter, JSONFormat.Compact)
);
Set(
    varStoredDraftJson,
    JSON(
        {
            schemaVersion: "2026-08-30.1",
            source: {
                actionId: Text(varClinicalActionRecord.'Clinical Action ID'),
                checkInId: Text(varCheckInId),
                patientId: Text(varPatientId),
                orderId: Text(varOrderId),
                patientRecordNumber: If(
                    IsBlank(varPatientRecordNumber),
                    "",
                    Text(varPatientRecordNumber)
                )
            },
            encounterJson: varEvaluatedEncounterJson
        },
        JSONFormat.Compact
    )
);
IfError(
    Set(
        varSavedAction,
        Patch(
            'Clinical Actions',
            varClinicalActionRecord,
            { 'Draft JSON': varStoredDraftJson }
        )
    ),
    Set(varCallFailed, true);
    Set(varCallError, Coalesce(FirstError.Message, "The injection draft could not be saved."))
);
If(
    !varCallFailed,
    Set(varClinicalActionRecord, varSavedAction);
    IfError(
        With(
            {
                result: 'MA Workstation Injection Workflow'.EvaluateInjection(
                    {
                        schemaVersion: "2026-08-30.1",
                        injectionId: Text(varSavedAction.'Clinical Action ID')
                    }
                )
            },
            Set(varEvaluationEnvelope, result)
        ),
        Set(varCallFailed, true);
        Set(varCallError, Coalesce(FirstError.Message, "Injection evaluation failed."))
    )
);
Set(varInjectionBusy, false);
If(
    varCallFailed,
    Set(varInjectionState, "failed"),
    Set(
        varInjectionState,
        If(
            varEvaluationEnvelope.evaluation.output.canFinalize,
            "ready-to-finalize",
            "needs-review"
        )
    )
)
```

Render stops and warnings directly from `varEvaluationEnvelope.evaluation.stops` and `.warnings`. The stored envelope deliberately has no row-version property. On reload, the API validates the saved identifiers/encounter, reads Dataverse's opaque weak ETag, and returns it as `source.sourceRecordVersion`; finalization must echo that exact value. Never construct an ETag from Canvas's `Version Number` or compare ETags numerically. The connector evaluation is read-only, and the preceding `Patch` never marks an action complete. Do not patch again between a ready evaluation and finalization. Any edit must return to `editing`, save, and evaluate the new saved row.

### Finalize

Require the ready state, the current evaluation fingerprint, an explicit final-review checkbox, and the check-in gate. The API reloads the saved draft by ID and rejects a changed row version. Generate one key per logical attempt and retain it across retries of the identical request.

Set the Finalize button's `DisplayMode` from the ready state, final-review checkbox, manual check-in gate, and `varInjectionBusy`; do not rely on validation inside the connector call alone.

```powerfx
With(
    {
        manualReady: varCheckInKind <> "manual" ||
            (
                chkManualCheckIn.Value &&
                !IsBlank(Trim(txtManualReason.Text)) &&
                !IsBlank(Trim(txtManualSource.Text))
            )
    },
    If(
        varInjectionState = "ready-to-finalize" &&
        chkFinalReview.Value &&
        manualReady &&
        !varInjectionBusy,
        DisplayMode.Edit,
        DisplayMode.Disabled
    )
)
```

```powerfx
If(IsBlank(varFinalizeKey), Set(varFinalizeKey, Text(GUID())));
Set(varInjectionBusy, true);
Set(varCallFailed, false);
Set(varCallError, Blank());
Set(varInjectionState, "finalizing");
IfError(
    With(
        {
            result: 'MA Workstation Injection Workflow'.FinalizeInjection(
                varFinalizeKey,
                {
                    schemaVersion: "2026-08-30.1",
                    injectionId: Text(varSavedAction.'Clinical Action ID'),
                    sourceRecordVersion: varEvaluationEnvelope.source.sourceRecordVersion,
                    evaluationFingerprint: varEvaluationEnvelope.evaluationFingerprint,
                    confirmation: {
                        confirmed: chkFinalReview.Value &&
                            (varCheckInKind <> "manual" || chkManualCheckIn.Value),
                        acknowledgementKind: varCheckInKind,
                        manualReason: If(
                            varCheckInKind = "manual",
                            Trim(txtManualReason.Text),
                            ""
                        ),
                        manualSource: If(
                            varCheckInKind = "manual",
                            Trim(txtManualSource.Text),
                            ""
                        )
                    }
                }
            )
        },
        Set(varFinalizeResult, result)
    ),
    Set(varCallFailed, true);
    Set(varCallError, Coalesce(FirstError.Message, "Injection finalization failed."))
);
Set(varInjectionBusy, false);
If(
    varCallFailed,
    Set(varInjectionState, "failed"),
    If(
        varFinalizeResult.status = "finalized",
        Set(varInjectionState, "finalized");
        Set(varFinalizedInjectionId, varFinalizeResult.injectionId);
        Set(varInjectionDocuments, varFinalizeResult.documents);
        Set(varInjectionAvs, varFinalizeResult.avs);
        UpdateIf(colClinicalActions, Key = "Injection", { State: "complete" }),
        Set(varCallError, "The API did not return a final status.");
        Set(varInjectionState, "failed")
    )
)
```

The imported action signature is `FinalizeInjection(idempotencyKey, body[, advanced options])`. If Studio shows a different order after a connector schema change, remove and re-add the data source and use the generated formula-bar signature; do not guess header placement.

Only the success branch above may make Injection complete. Do not patch Dataverse `Status` to complete from Canvas; the finalization host must do that transactionally. A ready evaluation, saved draft, generated preview, timeout, or optimistic UI transition is never completion. UDS and TMS remain placeholders even when Injection completes.

### Documents and AVS

The finalization response already contains the atomic final `documents` and `avs`; bind those values read-only. For a non-authoritative preview, omit `injectionId` and call the two operations with the same source and encounter snapshot:

```powerfx
Set(
    varDocumentPreview,
    'MA Workstation Injection Workflow'.GetInjectionDocuments(
        {
            schemaVersion: "2026-08-30.1",
            source: varEvaluationEnvelope.source,
            encounterJson: varEvaluatedEncounterJson
        }
    )
);
Set(
    varAvsPreview,
    'MA Workstation Injection Workflow'.GenerateInjectionAvs(
        {
            schemaVersion: "2026-08-30.1",
            source: varEvaluationEnvelope.source,
            encounterJson: varEvaluatedEncounterJson,
            locale: "en-US"
        }
    )
)
```

For a later copy or reprint, send only the finalized ID (plus the AVS locale); the API reloads stored artifacts:

```powerfx
Set(
    varFinalDocuments,
    'MA Workstation Injection Workflow'.GetInjectionDocuments(
        {
            schemaVersion: "2026-08-30.1",
            injectionId: varFinalizedInjectionId
        }
    )
);
Set(
    varFinalAvs,
    'MA Workstation Injection Workflow'.GenerateInjectionAvs(
        {
            schemaVersion: "2026-08-30.1",
            injectionId: varFinalizedInjectionId,
            locale: "en-US"
        }
    )
)
```

Set `varFinalizedInjectionId` from the selected finalized `'Clinical Actions'` row when opening an older record. Never mix `injectionId` with preview `source`/`encounterJson`. Display `.documents.note` and `.avs.html` as returned. Do not concatenate clinical-note sentences in Canvas, call `PDF()`, insert a client time with `Now()`, or promote preview content to final. Final note/AVS content and all displayed audit times must come from a successful server response.

## Failure and retry rules

- On any failure, leave the encounter intact, stop the busy state, show a generic user message, and retain the returned correlation ID or Monitor trace for support.
- After a timeout or unknown finalization outcome, lock editing and retry the identical request with the same `varFinalizeKey`. Never run field-change invalidation or generate a new key just because the response was lost.
- For an explicit stale-version/fingerprint conflict, return to editing, re-read the source record, evaluate again, and then create a new finalization key.
- For a clinical/documentation stop, show the server issues and return to `needs-review`; never bypass the stop locally.
- For 401/403, require reconnection or access correction. Do not retry in a loop.
- Do not use `Concurrent` for evaluate -> finalize -> document dependencies, and do not put finalization in `ForAll`; connector side effects and ordering are not guaranteed there.

## Production-ready checklist

The Swagger file is a connector contract, not a deployed API. Call the workflow ready only after all of the following pass in the target environment:

- host, tenant, application ID, delegated scope, redirect URI, and DLP policy are configured;
- the API validates Entra tokens and derives facility date, identity, clinic configuration, and timestamps server-side;
- evaluation reloads the just-saved draft by ID and returns the exact Dataverse ETag used by finalization;
- finalization durably persists the record, status, artifacts, and idempotency result before returning success;
- an incomplete saved draft evaluates with typed stops, while a complete one reaches `ready-to-finalize`;
- manual check-in cannot finalize without reason and source, and the response contains server-stamped `attestation.subject` and `attestation.timestamp`;
- Tebra acknowledgement cannot finalize unless the board-owned Dataverse acknowledgement flag is true;
- replaying the same finalization key returns the same result, while reusing it for changed content returns a conflict;
- final note and AVS match the final evaluation fingerprint and clinical-reference version;
- a failed/denied call never changes Injection to complete; and
- UDS and TMS remain visibly unavailable and cannot become complete.
