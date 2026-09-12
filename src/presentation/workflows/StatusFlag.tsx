import { CHECKLIST, NOTES } from "../vocabulary";

export interface StatusFlagProps {
  idle: boolean;
  stopCount: number;
  warningCount: number;
  /** Not every caller has a jump-to-blockers flyout; when present, a stop
   * count becomes a button that opens it instead of a plain badge. */
  onOpenRequirements?: () => void;
}

/**
 * Readiness badge for a workflow panel's summary bar: idle, N stop(s), N to
 * review, or Ready. Was independently hand-copied into all four workflow
 * panels; one copy (Injection) had already drifted to "N required" instead
 * of "N stop(s)".
 */
export function StatusFlag({ idle, stopCount, warningCount, onOpenRequirements }: StatusFlagProps) {
  const variant = idle
    ? "is-idle"
    : stopCount > 0
      ? "is-stop"
      : warningCount > 0
        ? "is-warning"
        : "is-ready";
  const label = idle
    ? NOTES.statusNotStarted
    : stopCount > 0
      ? CHECKLIST.stopCount(stopCount)
      : warningCount > 0
        ? CHECKLIST.reviewCount(warningCount)
        : NOTES.statusReadyToSign;
  const icon = idle ? "○" : stopCount > 0 ? "×" : warningCount > 0 ? "!" : "✓";
  if (stopCount > 0 && onOpenRequirements) {
    return (
      <button type="button" class={`wfp-status-flag ${variant}`} onClick={onOpenRequirements}>
        <span class="wfp-status-icon" aria-hidden="true">{icon}</span>
        {label}
      </button>
    );
  }
  return (
    <span class={`wfp-status-flag ${variant}`}>
      <span class="wfp-status-icon" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}
