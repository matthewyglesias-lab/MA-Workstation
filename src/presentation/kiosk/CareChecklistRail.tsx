import type { InjectionWorkflowProgress } from "../../application/injection-workflow-progress";
import { InjectionProgressSummary } from "../InjectionProgressSummary";

/** The journey rail owns orientation. A short shared status/correction area
 * replaces the permanently expanded duplicate final-readiness checklist. */
export function CareChecklistRail({ progress }: { progress: InjectionWorkflowProgress }) {
  return <InjectionProgressSummary progress={progress} className="kiosk-checklist" />;
}
