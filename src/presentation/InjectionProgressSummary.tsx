import type { InjectionWorkflowProgress } from "../application/injection-workflow-progress";
import { injectionTabForField } from "../application/injection-workflow-progress";
import { partitionInjectionAttention } from "./injection-attention";
import type { ClinicalIssue } from "../domain/contracts";
import "./lightfully/injection-progress.css";

export function navigateInjectionConcern(issue: ClinicalIssue) {
  window.dispatchEvent(new CustomEvent("ipmg:navigate-workflow-source", {
    detail: { workflow: "administer", tab: injectionTabForField(issue.field), field: issue.field },
  }));
}
/** Status is shared, ordinary announcements belong to the shell. All active
 * evaluator concerns remain visible; completed detail is deliberately optional. */
export function InjectionProgressSummary({ progress, className = "" }: { progress: InjectionWorkflowProgress; className?: string }) {
  const { requirements, concerns } = partitionInjectionAttention(progress);
  return <section class={`lf-injection-progress ${className}`} aria-label="Injection documentation status">
    <div class="lf-progress-heading">
      <strong>{progress.headline}</strong>
      {progress.lifecycleLabel !== progress.headline && <span>{progress.lifecycleLabel}</span>}
    </div>
    {progress.actionDetail && <p class="lf-progress-capability">{progress.actionDetail}</p>}
    {!progress.signed && concerns.length > 0 && <div class="lf-progress-concerns" aria-label="What remains and clinical advisories">
      {concerns.map(issue => <button type="button" key={issue.code + issue.field} class={`lf-progress-issue is-${issue.severity}`}
        onClick={() => navigateInjectionConcern(issue)}><span>{issue.severity === "stop" ? "Needs attention" : issue.severity === "warning" ? "Advisory" : "Information"}</span>{issue.message}</button>)}
    </div>}
    {!progress.signed && requirements.length > 0 && <div class="lf-progress-requirements" aria-label="Documentation to complete">
      <h3>Documentation to complete <span>{requirements.length}</span></h3>
      <ul>{requirements.map(issue => <li key={issue.code + issue.field}>
        <button type="button" class="lf-progress-requirement" onClick={() => navigateInjectionConcern(issue)}>{issue.message}</button>
      </li>)}</ul>
    </div>}
    <details class="lf-progress-checks">
      <summary>View checks <span>{progress.completed} of {progress.total} steps recorded</span></summary>
      <ul>{progress.steps.filter(step => step.id !== "sign").map(step => <li key={step.id}>
        <strong>{step.label}</strong><span>{step.stateLabel}</span>
      </li>)}</ul>
    </details>
  </section>;
}
