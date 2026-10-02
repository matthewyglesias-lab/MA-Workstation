import { ToolPageHeader } from "../../lightfully/ToolPageHeader";

/** No encounter engine exists for TMS in this local helper. */
export function TmsPanel() {
  return <div class="wfp-panel">
    <ToolPageHeader title="TMS"><span class="wfp-status-flag is-idle">Not available</span></ToolPageHeader>
    <div class="wfp-wall">
      <h2 class="wfp-wall-title">TMS documentation</h2>
      <p>This workstation does not yet support TMS session records.</p>
      <p>Document the session in Tebra using the clinic's approved workflow.</p>
    </div>
  </div>;
}
