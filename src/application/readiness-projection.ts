import type { ClinicalEvaluation, ClinicalIssue, ReadinessState } from "../domain/contracts";
import type { ReadinessItem, WorkflowId } from "../presentation/types";

/**
 * Presentation-facing readiness is deliberately derived from the typed
 * clinical engines rather than from decorative DOM state in legacy panels.
 * In particular, an untouched record is pending -- never partially complete.
 */
export interface ProjectedReadiness {
  items: ReadinessItem[];
  readiness: ReadinessState;
  firstBlockingDetail?: string;
}

interface ReadinessStage {
  id: string;
  label: string;
  sections: readonly string[];
}

const STAGES: Partial<Record<WorkflowId, readonly ReadinessStage[]>> = {
  administer: [
    { id: "patient-order", label: "Patient & order", sections: ["patient", "order"] },
    {
      id: "medication-schedule",
      label: "Medication & schedule",
      sections: ["medication", "timing", "initiation"],
    },
    { id: "safety", label: "Safety", sections: ["safety"] },
    { id: "product-trace", label: "Product trace", sections: ["traceability"] },
    {
      id: "administration",
      label: "Administration",
      sections: ["administration", "response", "details"],
    },
    {
      id: "disposition-followup",
      label: "Disposition / follow-up",
      sections: ["disposition", "follow-up"],
    },
  ],
  uds: [
    { id: "patient", label: "Patient & visit", sections: ["patient", "visit"] },
    { id: "collection", label: "Collection", sections: ["collection", "specimen"] },
    { id: "results", label: "Results", sections: ["results", "result"] },
    { id: "review", label: "Review / handoff", sections: ["review", "handoff", "output"] },
  ],
  samples: [
    { id: "patient", label: "Patient & visit", sections: ["patient", "visit"] },
    { id: "package", label: "Package trace", sections: ["package", "traceability"] },
    { id: "directions", label: "Directions & education", sections: ["directions", "education"] },
    { id: "review", label: "Review / output", sections: ["review", "output"] },
  ],
  forms: [
    { id: "patient", label: "Patient & request", sections: ["patient", "request"] },
    { id: "details", label: "Form details", sections: ["details", "form"] },
    { id: "status", label: "Status / follow-up", sections: ["status", "follow-up"] },
    { id: "review", label: "Review / output", sections: ["review", "output"] },
  ],
};

function issuesForStage(
  stage: ReadinessStage,
  issues: readonly ClinicalIssue[],
): ClinicalIssue[] {
  return issues.filter((item) => {
    const section = item.section?.toLowerCase();
    return Boolean(section && stage.sections.includes(section));
  });
}

function stageDetail(issue?: ClinicalIssue): string | undefined {
  return issue?.message || undefined;
}

/**
 * The evaluator deliberately reports every applicable stop; its append order
 * is implementation detail, not an operator workflow.  Choose the first
 * blocking item using the fixed scanning order shown in the workstation so a
 * staff member is sent to the earliest meaningful part of the record rather
 * than, for example, the final disposition before the ordered medication.
 */
export function firstActionableClinicalIssue(
  workflow: WorkflowId,
  evaluation: ClinicalEvaluation | undefined,
): ClinicalIssue | undefined {
  if (!evaluation) return undefined;

  const stages = STAGES[workflow] ?? [];
  const inWorkflowOrder = (issues: readonly ClinicalIssue[]): ClinicalIssue | undefined =>
    stages.flatMap((stage) => issuesForStage(stage, issues))[0];

  // Stops always take precedence over a warning elsewhere in the worksheet.
  // An unclassified issue is intentionally retained after known stages rather
  // than silently losing it from the staff-facing route.
  return (
    inWorkflowOrder(evaluation.stops) ??
    evaluation.stops.find((item) => !item.section) ??
    inWorkflowOrder(evaluation.warnings) ??
    evaluation.warnings.find((item) => !item.section) ??
    evaluation.stops[0] ??
    evaluation.warnings[0]
  );
}

/**
 * Translate typed engine validation into a fixed, clinical scanning layout.
 * Until an engine says a record is ready we remain conservative: sections
 * without a proven issue are pending rather than displayed as complete.
 */
export function projectClinicalReadiness(
  workflow: WorkflowId,
  evaluation: ClinicalEvaluation | undefined,
): ProjectedReadiness {
  const stages = STAGES[workflow] ?? [];
  if (!evaluation || !stages.length) {
    return { items: [], readiness: "idle" };
  }

  const stops = evaluation.stops;
  const warnings = evaluation.warnings;
  const firstBlockingDetail = firstActionableClinicalIssue(workflow, evaluation)?.message;

  const items = stages.map<ReadinessItem>((stage) => {
    if (evaluation.readiness === "idle") {
      return { id: `${workflow}-${stage.id}`, label: stage.label, state: "pending" };
    }

    const stop = issuesForStage(stage, stops)[0];
    if (stop) {
      return {
        id: `${workflow}-${stage.id}`,
        label: stage.label,
        detail: stageDetail(stop),
        state: "stop",
      };
    }

    const warning = issuesForStage(stage, warnings)[0];
    if (warning) {
      return {
        id: `${workflow}-${stage.id}`,
        label: stage.label,
        detail: stageDetail(warning),
        state: "warning",
      };
    }

    if (evaluation.readiness === "ready") {
      return { id: `${workflow}-${stage.id}`, label: stage.label, state: "complete" };
    }

    return { id: `${workflow}-${stage.id}`, label: stage.label, state: "pending" };
  });

  // Surface an unclassified engine issue rather than quietly hiding it. The
  // last stage is the least surprising place for a general review blocker.
  const classified = new Set(
    stages.flatMap((stage) => stage.sections),
  );
  const unclassified = [...stops, ...warnings].find(
    (item) => !item.section || !classified.has(item.section.toLowerCase()),
  );
  if (unclassified && items.length) {
    const finalItem = items[items.length - 1]!;
    if (
      finalItem.state === "pending" ||
      finalItem.state === "complete" ||
      (unclassified.severity === "stop" && finalItem.state === "warning")
    ) {
      finalItem.state = unclassified.severity === "stop" ? "stop" : "warning";
      finalItem.detail = unclassified.message;
    } else if (!finalItem.detail) {
      finalItem.detail = unclassified.message;
    }
  }

  return { items, readiness: evaluation.readiness, firstBlockingDetail };
}
