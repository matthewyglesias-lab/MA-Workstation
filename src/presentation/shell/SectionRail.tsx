import { DesktopIcon } from "../DesktopIcon";
import { IPMGBrand } from "../branding/IPMGBrand";
import type { WorkflowId } from "../types";

interface SectionRailProps {
  onDocumentService: () => void;
  selectedWorkflow: WorkflowId;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
  chartOpen: boolean;
}

/** Global destinations only. Patient and service navigation have their own
 * context below. There are no hidden alternate rails or document listeners. */
export function SectionRail({ selectedWorkflow, onWorkflowOpen, onDocumentService,
  onOpenRecords, chartOpen }: SectionRailProps) {
  return <nav class="tebra-section-rail lf-section-rail cd2004-print-exclude" aria-label="Workspace navigation">
    <div class="lf-masthead-brand"><IPMGBrand /></div>
    <div class="lf-primary-navigation">
      <button type="button" class={`cd2004-nav-item${selectedWorkflow === "home" && !chartOpen ? " is-selected" : ""}`}
        title="Worklist" aria-current={selectedWorkflow === "home" && !chartOpen ? "page" : undefined}
        onClick={() => onWorkflowOpen("home")}><DesktopIcon name="home"/><span>Worklist</span></button>
      <button type="button" class="cd2004-nav-item" disabled={!onOpenRecords} aria-label="Open saved notes (F11)"
        onClick={onOpenRecords}><DesktopIcon name="records"/><span>Saved records</span></button>
    </div>
    <button type="button" class="lf-document-action cd2004-worklist-new" aria-haspopup="dialog"
      aria-label="Document a service" title="Document a service" onClick={onDocumentService}>
      <DesktopIcon name="new"/><span>Document care</span>
    </button>
  </nav>;
}
