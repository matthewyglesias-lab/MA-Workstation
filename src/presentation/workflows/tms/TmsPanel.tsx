import "../workflow-panels.css";

const PLANNED_CAPABILITIES: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "Planned session note",
    detail:
      "Patient, treatment number, protocol, motor-threshold date, session parameters, tolerance, side effects, and next session.",
  },
  {
    title: "Safety checklist",
    detail:
      "Seizure-risk screen, medication changes, sleep/alcohol changes, new neurologic symptoms, pain/headache, and provider-review triggers.",
  },
  {
    title: "Progress tracking",
    detail:
      "PHQ-9 / GAD-7 cadence, response/remission markers, missed-session tracking, and technician initials.",
  },
];

const DRAFT_NOTE_PREVIEW =
  "TMS session completed today per protocol. Patient tolerated treatment without acute complication. " +
  "No new safety concern reported during session. Treatment parameters documented in the TMS record. " +
  "Next session to continue as scheduled.";

/**
 * TMS has no encounter, no domain engine, and no print output - it's a
 * placeholder describing what a future TMS workflow will capture. Kept as a
 * real typed panel (rather than legacy markup) purely for visual/structural
 * consistency with the rest of the workstation.
 */
export function TmsPanel() {
  return (
    <div class="wfp-panel">
      <div class="wfp-summary-bar">
        <strong>Future / TMS</strong>
        <span class="wfp-status-flag is-idle">Not active yet</span>
      </div>

      <div class="wfp-wall">
        <div class="wfp-wall-title">TMS treatment support — coming soon</div>
        <p>
          This placeholder is ready for a future TMS workflow. Once the device, protocol, and documentation
          requirements are confirmed, this becomes a session-by-session assistant for technicians and MAs.
        </p>
      </div>

      <div class="wfp-section">
        <div class="wfp-section-head">Planned capabilities</div>
        <div class="wfp-section-body">
          <div class="wfp-row">
            {PLANNED_CAPABILITIES.map((item) => (
              <div key={item.title}>
                <div class="wfp-option-title">{item.title}</div>
                <div class="wfp-option-desc">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div class="wfp-section">
        <div class="wfp-section-head">Draft future note style</div>
        <div class="wfp-section-body">
          <p class="wfp-field-hint">Placeholder only — refine after the protocol is confirmed.</p>
          <div class="wfp-preview">{DRAFT_NOTE_PREVIEW}</div>
        </div>
      </div>
    </div>
  );
}
