import { DesktopIcon } from "../DesktopIcon";
import { LightfullyMark } from "../lightfully/WorkspaceTools";
import { isDocumentService } from "../lightfully/ServiceWorkspace";
import { WORKFLOW_LABELS, type PatientContext, type WorkflowId, type WorkflowSummary } from "../types";
import { PATIENT, NAVIGATION } from "../vocabulary";
interface SectionRailProps {
  onDocumentService: () => void;
  selectedWorkflow: WorkflowId;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
  patient?: PatientContext;
  onWorkflowOpen: (workflow: WorkflowId) => void;
  onOpenRecords?: () => void;
  /**
   * The patient whose chart is currently being browsed, when one is. The rail
   * follows it rather than the open note's patient, so it cannot say "No
   * patient selected" beside that patient's own Facesheet.
   */
  browsedPatientName?: string;
  /**
   * Opens the chart for the patient currently in context. Absent when no
   * patient is identified, which is why the group below is conditional: a rail
   * entry that leads nowhere is the most obvious tell there is.
   */
  onOpenChart?: (view: "facesheet" | "notes") => void;
  /** Which chart page is showing, when the chart is the active destination. */
  activeChartView?: "facesheet" | "notes" | null;
}


/** Global navigation names jobs, not each nested worksheet page. */
export function SectionRail({ selectedWorkflow, onWorkflowOpen, onDocumentService, onOpenRecords,
  patient = {}, browsedPatientName, onOpenChart, activeChartView = null }: SectionRailProps) {
  const patientName = browsedPatientName?.trim() || patient.name?.trim();
  const toolsActive = ["reference", "log", "tms"].includes(selectedWorkflow);
  return <nav class="cd2004-navigator tebra-section-rail lf-section-rail cd2004-print-exclude" aria-label="Workspace navigation">
    <div class="lf-sidebar-brand"><span class="lf-brand-symbol"><LightfullyMark small/></span><span class="cd2004-app-title"><b>IPMG</b><span>MA Workstation</span></span></div>
    <button type="button" class="lf-document-action cd2004-worklist-new" aria-haspopup="dialog" onClick={onDocumentService}><DesktopIcon name="new"/><span>Document a service</span></button>
    <div class="lf-primary-navigation">
      <button type="button" class={`cd2004-nav-item${selectedWorkflow === "home" && !activeChartView ? " is-selected" : ""}`} title="Dashboard" aria-current={selectedWorkflow === "home" && !activeChartView ? "page" : undefined} onClick={() => onWorkflowOpen("home")}><DesktopIcon name="home"/><span>Worklist</span></button>
      {isDocumentService(selectedWorkflow) && !activeChartView && <div class="lf-current-service" aria-current="page"><DesktopIcon name={selectedWorkflow}/><span>{WORKFLOW_LABELS[selectedWorkflow]}<small>Current workspace</small></span></div>}
      <button type="button" class="cd2004-nav-item" disabled={!onOpenRecords} aria-label="Open saved notes (F11)" onClick={onOpenRecords}><DesktopIcon name="records"/><span>Saved records</span><kbd>F11</kbd></button>
    </div>
    {onOpenChart && patientName && <section class="lf-patient-navigation" aria-label="Patient records"><div class="tebra-section-rail-context"><small>CURRENT PATIENT</small><strong>{patientName}</strong></div><button type="button" class={`cd2004-nav-item${activeChartView === "facesheet" ? " is-selected" : ""}`} data-chart-nav="facesheet" aria-current={activeChartView === "facesheet" ? "page" : undefined} aria-label={NAVIGATION.openFacesheet} onClick={() => onOpenChart("facesheet")}><DesktopIcon name="patient"/><span>{PATIENT.facesheet}</span></button><button type="button" class={`cd2004-nav-item${activeChartView === "notes" ? " is-selected" : ""}`} data-chart-nav="notes" aria-current={activeChartView === "notes" ? "page" : undefined} aria-label={NAVIGATION.openPatientNotes} onClick={() => onOpenChart("notes")}><DesktopIcon name="note"/><span>Patient notes</span></button></section>}
    <details class="lf-tools-navigation" open={toolsActive || undefined}><summary><DesktopIcon name="reference"/><span>Tools</span><span aria-hidden="true">⌄</span></summary><div>{(["reference", "log", "tms"] as WorkflowId[]).map(workflow => <button type="button" class={`cd2004-nav-item${selectedWorkflow === workflow ? " is-selected" : ""}`} title={WORKFLOW_LABELS[workflow]} aria-current={selectedWorkflow === workflow ? "page" : undefined} onClick={() => onWorkflowOpen(workflow)}><DesktopIcon name={workflow}/><span>{workflow === "tms" ? "TMS · not available" : WORKFLOW_LABELS[workflow]}</span></button>)}</div></details>
    <div class="lf-rail-footer"><span class="lf-local-dot" aria-hidden="true"/><span>Browser-local records<small>Tebra is the chart of record</small></span></div>
  </nav>;
}
