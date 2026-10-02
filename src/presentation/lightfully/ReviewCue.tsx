import { ActionShelf } from "./ActionShelf";
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

/** Optional explanatory guidance; required fields and actual clinical warnings
 * retain their own visible state. This surface never records a review. */
export function ReviewCue({ workflow, previewOpen }: { workflow: WorkflowId; previewOpen: boolean }) {
  const cue = reviewCue(workflow, previewOpen);
  if (!cue) return null;
  return <div class="lf-service-reminder cd2004-print-exclude" data-review-cue={previewOpen ? "preview" : workflow}>
    <ActionShelf label="Review tips" heading={cue.label} class="lf-review-disclosure">
      <p class="lf-review-detail">{cue.detail}</p>
      <p class="lf-form-legend"><span aria-hidden="true">*</span> Required when applicable. No check is assumed complete.</p>
    </ActionShelf>
  </div>;
}
