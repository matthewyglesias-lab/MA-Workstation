export type WorkflowKey =
  | "dashboard"
  | "injection"
  | "uds"
  | "samples"
  | "forms"
  | "records"
  | "knowledge";

export type ReadinessState = "idle" | "blocked" | "review" | "ready";

export type ClinicalIssueSeverity = "stop" | "warning" | "info";

export interface ClinicalIssue {
  code: string;
  message: string;
  severity: ClinicalIssueSeverity;
  field?: string;
  section?: string;
}

export interface ClinicalRecommendation {
  code: string;
  message: string;
  action?: string;
}

export interface ClinicalEvaluation<TOutput = unknown> {
  workflow: Exclude<WorkflowKey, "dashboard" | "records" | "knowledge">;
  readiness: ReadinessState;
  stops: ClinicalIssue[];
  warnings: ClinicalIssue[];
  recommendations: ClinicalRecommendation[];
  calculatedDates: Record<string, string>;
  output: TOutput;
}

export interface ClinicalEngine<TEncounter, TContext = Record<string, never>, TOutput = unknown> {
  evaluate(encounter: TEncounter, context: TContext): ClinicalEvaluation<TOutput>;
}

export interface PatientIdentity {
  name: string;
  dob: string;
}

export const issue = (
  severity: ClinicalIssueSeverity,
  code: string,
  message: string,
  field?: string,
  section?: string,
): ClinicalIssue => ({
  code,
  message,
  severity,
  ...(field ? { field } : {}),
  ...(section ? { section } : {}),
});

export const uniqueIssues = (items: ClinicalIssue[]): ClinicalIssue[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.severity}|${item.code}|${item.field ?? ""}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const readinessFrom = (
  started: boolean,
  stops: ClinicalIssue[],
  warnings: ClinicalIssue[],
): ReadinessState => {
  if (!started) return "idle";
  if (stops.length) return "blocked";
  if (warnings.length) return "review";
  return "ready";
};
