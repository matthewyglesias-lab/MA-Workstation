import { DesktopIcon } from "../DesktopIcon";
import type { WorkflowId } from "../types";

/** Presentation prompts, not clinical rules, attestations, or saved review state. */
const REMINDERS: Partial<Record<WorkflowId, string>> = {
  administer: "Compare patient, current order, product and timing with Tebra. Recheck any value you change.",
  uds: "Match the patient and specimen. Record observed results; leave unknown findings unconfirmed.",
  samples: "Compare patient, product, strength, quantity and lot with the items being dispensed.",
  forms: "Compare patient, recipient and dates with the request. Review every included clinical detail.",
};

export function reviewCue(workflow: WorkflowId, previewOpen: boolean) {
  const detail = REMINDERS[workflow];
  if (!detail) return null;
  return previewOpen
    ? { label: "Before you finish", detail: "Compare patient, dates and recorded details before copying or printing. File and verify separately in Tebra." }
    : { label: "Check as you go", detail };
}

/** Never claims a check is complete. No live region, popup, new gate, or persistence. */
export function ReviewCue({ workflow, previewOpen }: { workflow: WorkflowId; previewOpen: boolean }) {
  const cue = reviewCue(workflow, previewOpen);
  if (!cue) return null;
  return (
    <div class="ipmg-review-cue cd2004-print-exclude" data-review-cue={previewOpen ? "preview" : workflow}
      role="note" aria-label="Documentation review reminder">
      <details class="lf-review-disclosure">
        <summary><DesktopIcon name="note"/><strong>{cue.label}</strong><span class="lf-review-brief">{previewOpen ? "Check the final note, then file and verify in Tebra." : "Confirm the patient and details. Recheck changes."}</span><span class="lf-review-tail">Review tips <span aria-hidden="true">⌄</span></span></summary>
        <p class="lf-review-detail">{cue.detail}</p>
      </details>
    </div>
  );
}
