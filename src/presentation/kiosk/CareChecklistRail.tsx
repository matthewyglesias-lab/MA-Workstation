import { summarizeReadinessVerdict } from "../../application/readiness-projection";
import type { WorkstationReadinessItem } from "../../application/workstation-projection";
import { DesktopIcon } from "../DesktopIcon";
import {
  CHECKLIST,
  KIOSK,
  readinessItemStateLabel,
  readinessVerdictCopy,
} from "../vocabulary";

interface CareChecklistRailProps {
  readiness: readonly WorkstationReadinessItem[];
}

const checklistIcon = (
  state: WorkstationReadinessItem["state"],
): "check" | "alert" | "note" =>
  state === "complete"
    ? "check"
    : state === "stop" || state === "warning"
      ? "alert"
      : "note";

export function CareChecklistRail({ readiness }: CareChecklistRailProps) {
  const verdict = summarizeReadinessVerdict(readiness);
  const verdictCopy = verdict ? readinessVerdictCopy(verdict) : null;

  return (
    <section class="kiosk-checklist" aria-labelledby="kiosk-checklist-title">
      <div class="kiosk-rail-heading">
        <h2 id="kiosk-checklist-title">{CHECKLIST.title}</h2>
        <p>{KIOSK.checklistDetail}</p>
      </div>
      {verdictCopy ? (
        <>
          <div
            class={`kiosk-checklist-verdict is-${verdict?.tone ?? "blocked"}`}
            role="status"
          >
            <strong>{verdictCopy.headline}</strong>
            <span>{verdictCopy.detail}</span>
          </div>
          <ul>
            {readiness.map((item) => (
              <li key={item.id} data-checklist-state={item.state}>
                <span class="kiosk-checklist-icon" aria-hidden="true">
                  <DesktopIcon name={checklistIcon(item.state)} />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{readinessItemStateLabel(item.state)}</small>
                  {item.detail && <p>{item.detail}</p>}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="kiosk-checklist-empty">{KIOSK.checklistEmpty}</p>
      )}
    </section>
  );
}
