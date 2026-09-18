import { useRef } from "preact/hooks";
import { DesktopIcon } from "../DesktopIcon";
import { DialogHeading } from "./DialogHeading";
import { ModalDialog } from "../ModalDialog";
import { WORKFLOW_LABELS, type WorkflowId, type WorkflowSummary } from "../types";

/** Navigation metadata only. The original service owns its form and validation. */
export const SERVICES = [
  { id: "administer", label: "Injection", detail: "Medication, timing, administration and after-visit instructions." },
  { id: "uds", label: "Urine drug screen", detail: "Collection, quality checks, results and documentation." },
  { id: "samples", label: "Medication samples", detail: "Dispensed samples and patient instructions." },
  { id: "forms", label: "Forms & requests", detail: "Track a request and prepare its documentation." },
] as const;
export const isDocumentService = (id: WorkflowId) => SERVICES.some(service => service.id === id);

export function ServiceChooser({ onDismiss, onOpen }: {
  onDismiss: () => void;
  onOpen: (workflow: WorkflowId) => void;
  summaries: Partial<Record<WorkflowId, WorkflowSummary>>;
}) {
  const pending = useRef(false);
  return <ModalDialog class="lf-service-dialog cd2004-print-exclude" labelledBy="lf-service-title" onDismiss={onDismiss}>
    <DialogHeading id="lf-service-title" title="Document a service" description="Choose the service you need. Existing work stays protected when you switch." closeLabel="Close service selection" onClose={onDismiss} />
    <div class="lf-service-options">
      {SERVICES.map(service => <button type="button" class="lf-service-option cd2004-nav-item" title={WORKFLOW_LABELS[service.id]} data-service-open={service.id} onClick={() => {
        if (pending.current) return;
        pending.current = true;
        onDismiss();
        // Exit the native top layer before asking the existing transition guard.
        requestAnimationFrame(() => onOpen(service.id));
      }}><span class="lf-service-icon"><DesktopIcon name={service.id}/></span><span><strong>{service.label}</strong><small>{service.detail}</small></span><span class="lf-service-tail">Open <span aria-hidden="true">→</span></span></button>)}
    </div>
  </ModalDialog>;
}

export function ServiceHeader({ workflow, previewOpen, onPreview, onChangeService }: {
  workflow: WorkflowId; previewOpen: boolean; onPreview: () => void; onChangeService: () => void;
}) {
  const service = SERVICES.find(item => item.id === workflow);
  return <header class="lf-service-header">
    <div class="lf-service-heading"><h1>{service?.label ?? WORKFLOW_LABELS[workflow]}</h1><p class="lf-form-legend"><span aria-hidden="true">*</span> Required when applicable. Other fields are optional.</p></div>
    <div class="lf-service-header-actions"><button type="button" class="lf-text-button" onClick={onChangeService} aria-haspopup="dialog">Change service <span aria-hidden="true">⌄</span></button><div class="lf-view-switch" role="group" aria-label="Workspace view"><button type="button" aria-pressed={!previewOpen} onClick={() => { if(previewOpen) onPreview(); }}>Details</button><button type="button" aria-pressed={previewOpen} aria-controls="lf-document-preview" onClick={onPreview}><DesktopIcon name="note"/>Preview</button></div></div>
  </header>;
}
