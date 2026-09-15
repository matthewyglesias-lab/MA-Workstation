# Original workstation injection documentation

These files preserve the documentation path that the original typed InjectionPanel actually uses:

1. `src/presentation/workflows/injection/InjectionPanel.tsx` calls `injectionEncounterToDocumentationInput(encounter, evaluation)`.
2. `DocumentationEngine.format("injection", input).text` delegates to `formatInjectionDocumentation`.
3. The administered path uses `noteFacts` and the RC6.1 compact clinical prose. It provides separate CC, Assessment, and Plan bodies plus the same single-copy text. Held, escalated, and provider-directed encounters use the original non-administration grammar.

Use the exported `injectionEncounterToDocumentationInput` and `formatInjectionDocumentation` directly. The adapter requires an `InjectionEncounter` and its `ClinicalEvaluation<InjectionEvaluationOutput>`. It returns null for an untouched encounter, a stale administration review, or an administration that is not documented by the evaluator. Keep these gates when integrating it into the console.

The only source adaptation is explicit `.js` ESM import extensions and formatting. `initiation-protocol.ts` extracts the original pure `mapLegacyInitiationProtocol` and its exact helpers from the legacy DOM adapter, so browser and other-workflow code do not enter the server bundle. `provider-register.ts` preserves the original stable provider-key resolution.

## Original AVS content

The original runtime's `avsInput()` in `public/legacy/legacy-runtime.js` passes documented fields to `window.ipmgBuildInjectionAvsHtml`. That bridge calls `buildInjectionAvsHtml` from `src/domain/injection-avs-render.ts`, which consumes `buildInjectionAvsModel` from `src/domain/injection-avs-content.ts`.

The vendored model and baseline renderer preserve that content and output. The new Lightfully presentation should consume the model. Do not use the baseline renderer's styling for the new presentation.

The original AVS is English only. The original bilingual content belongs to the separate patient screening questionnaire; no Spanish AVS was found in either its typed content path or legacy print callsite.

Exact source parity is not a clinical approval. In particular, the original AVS has known assertions that need an explicit console adapter correction: Sustenna 234 mg is not exclusively a starting dose; first monthly Sustenna timing must not be reset from the second starting injection; dual-initiation prose must be gated to actual paired and oral administration; an empty disposition must not look like a completed patient copy. Keep audited corrections in the console adapter so the original source and the correction remain reviewable separately.

`console/tests/workstation-document-parity.test.ts` compares original and vendored adapters, all Tebra sections and copied text, all 12 initiation mappings, all 13 catalog AVS profiles, all 12 initiation AVS variants, disposition semantics, and the original baseline renderer. The tests import the original modules at runtime; they do not depend on hand-copied expected fixtures alone.

See `provenance.json` for source and destination hashes and the source commit.
