import { useEffect, useRef } from "preact/hooks";
import { DesktopIcon } from "../DesktopIcon";
import { IPMGBrand } from "../branding/IPMGBrand";
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
  browsedPatientName?: string;
  onOpenChart?: (view: "facesheet" | "notes") => void;
  activeChartView?: "facesheet" | "notes" | null;
}

/** One calm masthead. All navigation still uses the shell's original guards. */
export function SectionRail({ selectedWorkflow, onWorkflowOpen, onDocumentService,
  onOpenRecords, patient = {}, browsedPatientName, onOpenChart,
  activeChartView = null }: SectionRailProps) {
  const nav = useRef<HTMLElement>(null);
  const patientName = browsedPatientName?.trim() || patient.name?.trim();
  const toolsActive = ["reference", "log", "tms"].includes(selectedWorkflow);
  const closeMenus = () => nav.current?.querySelectorAll<HTMLDetailsElement>("details[open]")
    .forEach(menu => { menu.open = false; });
  useEffect(() => {
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) closeMenus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      const open = nav.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (open) { closeMenus(); open.querySelector<HTMLElement>("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const go = (workflow: WorkflowId) => { closeMenus(); onWorkflowOpen(workflow); };

  return <nav ref={nav} class="cd2004-navigator tebra-section-rail lf-section-rail cd2004-print-exclude" aria-label="Workspace navigation">
    <div class="lf-masthead-brand"><IPMGBrand /></div>
    <div class="lf-primary-navigation">
      <button type="button" class={`cd2004-nav-item${selectedWorkflow === "home" && !activeChartView ? " is-selected" : ""}`}
        title="Dashboard" aria-current={selectedWorkflow === "home" && !activeChartView ? "page" : undefined}
        onClick={() => go("home")}><DesktopIcon name="home"/><span>Worklist</span></button>
      <button type="button" class="cd2004-nav-item" disabled={!onOpenRecords} aria-label="Open saved notes (F11)"
        onClick={() => { closeMenus(); onOpenRecords?.(); }}><DesktopIcon name="records"/><span>Saved records</span><kbd>F11</kbd></button>
      {onOpenChart && patientName && !activeChartView && <details class="lf-patient-navigation lf-header-disclosure">
        <summary class={activeChartView ? "is-selected" : ""} title={patientName}><DesktopIcon name="patient"/><span>Patient records</span><span aria-hidden="true">⌄</span></summary>
        <div class="lf-navigation-popover">
          <div class="tebra-section-rail-context"><small>CURRENT PATIENT</small><strong>{patientName}</strong></div>
          <button type="button" class={`cd2004-nav-item${activeChartView === "facesheet" ? " is-selected" : ""}`} data-chart-nav="facesheet"
            aria-current={activeChartView === "facesheet" ? "page" : undefined} aria-label={NAVIGATION.openFacesheet}
            onClick={() => { closeMenus(); onOpenChart("facesheet"); }}><DesktopIcon name="patient"/><span>{PATIENT.facesheet}</span></button>
          <button type="button" class={`cd2004-nav-item${activeChartView === "notes" ? " is-selected" : ""}`} data-chart-nav="notes"
            aria-current={activeChartView === "notes" ? "page" : undefined} aria-label={NAVIGATION.openPatientNotes}
            onClick={() => { closeMenus(); onOpenChart("notes"); }}><DesktopIcon name="note"/><span>Patient notes</span></button>
        </div>
      </details>}
      <details class="lf-tools-navigation lf-header-disclosure">
        <summary class={toolsActive ? "is-selected" : ""}><DesktopIcon name="reference"/><span>Tools</span><span aria-hidden="true">⌄</span></summary>
        <div class="lf-navigation-popover">{(["reference", "log", "tms"] as WorkflowId[]).map(workflow =>
          <button key={workflow} type="button" class={`cd2004-nav-item${selectedWorkflow === workflow ? " is-selected" : ""}`}
            title={WORKFLOW_LABELS[workflow]} aria-current={selectedWorkflow === workflow ? "page" : undefined}
            onClick={() => go(workflow)}><DesktopIcon name={workflow}/><span>{workflow === "tms" ? "TMS · not available" : WORKFLOW_LABELS[workflow]}</span></button>)}</div>
      </details>
    </div>
    {isDocumentService(selectedWorkflow) && !activeChartView && <span class="lf-current-service" aria-current="page"><DesktopIcon name={selectedWorkflow}/><span>{WORKFLOW_LABELS[selectedWorkflow]}</span></span>}
    <button type="button" class="lf-document-action cd2004-worklist-new" aria-haspopup="dialog"
      onClick={() => { closeMenus(); onDocumentService(); }}><DesktopIcon name="new"/><span>Document a service</span><span aria-hidden="true">→</span></button>
    {onOpenChart && patientName && activeChartView && <div class="lf-chart-navigation">
      <div class="tebra-section-rail-context"><small>CURRENT PATIENT</small><strong>{patientName}</strong></div>
      <button type="button" class={`cd2004-nav-item${activeChartView === "facesheet" ? " is-selected" : ""}`} data-chart-nav="facesheet"
        aria-current={activeChartView === "facesheet" ? "page" : undefined} aria-label={NAVIGATION.openFacesheet}
        onClick={() => onOpenChart("facesheet")}><DesktopIcon name="patient"/><span>{PATIENT.facesheet}</span></button>
      <button type="button" class={`cd2004-nav-item${activeChartView === "notes" ? " is-selected" : ""}`} data-chart-nav="notes"
        aria-current={activeChartView === "notes" ? "page" : undefined} aria-label={NAVIGATION.openPatientNotes}
        onClick={() => onOpenChart("notes")}><DesktopIcon name="note"/><span>Patient notes</span></button>
    </div>}
  </nav>;
}
