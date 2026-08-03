import { formatFormsDocumentation } from "./forms";
import { formatInjectionDocumentation } from "./injection";
import { formatSamplesDocumentation } from "./samples";
import { formatUdsDocumentation } from "./uds";
import type {
  DocumentationEncounterMap,
  DocumentationEvaluation,
  DocumentationResult,
  DocumentationWorkflow,
  FormsDocumentationInput,
  InjectionDocumentationInput,
  InjectionDocumentationResult,
  SamplesDocumentationInput,
  UdsDocumentationInput,
} from "./types";

export * from "./forms";
export * from "./grammar";
export * from "./injection";
export * from "./samples";
export * from "./types";
export * from "./uds";

export class ClinicalDocumentationEngine {
  format(
    workflow: "injection",
    encounter: InjectionDocumentationInput,
    evaluation?: DocumentationEvaluation,
  ): InjectionDocumentationResult;
  format(
    workflow: "uds",
    encounter: UdsDocumentationInput,
    evaluation?: DocumentationEvaluation,
  ): DocumentationResult;
  format(
    workflow: "samples",
    encounter: SamplesDocumentationInput,
    evaluation?: DocumentationEvaluation,
  ): DocumentationResult;
  format(
    workflow: "forms",
    encounter: FormsDocumentationInput,
    evaluation?: DocumentationEvaluation,
  ): DocumentationResult;
  format<W extends DocumentationWorkflow>(
    workflow: W,
    encounter: DocumentationEncounterMap[W],
    evaluation?: DocumentationEvaluation,
  ): DocumentationResult;
  format(
    workflow: DocumentationWorkflow,
    encounter: DocumentationEncounterMap[DocumentationWorkflow],
    evaluation?: DocumentationEvaluation,
  ): DocumentationResult {
    switch (workflow) {
      case "injection":
        return formatInjectionDocumentation(
          encounter as InjectionDocumentationInput,
          evaluation,
        );
      case "uds":
        return formatUdsDocumentation(
          encounter as UdsDocumentationInput,
          evaluation,
        );
      case "samples":
        return formatSamplesDocumentation(
          encounter as SamplesDocumentationInput,
          evaluation,
        );
      case "forms":
        return formatFormsDocumentation(
          encounter as FormsDocumentationInput,
          evaluation,
        );
    }
  }
}

/**
 * Presentation-independent formatter used by the classic desktop adapter.
 */
export const DocumentationEngine = new ClinicalDocumentationEngine();

