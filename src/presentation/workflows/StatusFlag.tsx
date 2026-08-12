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
    ? "Not started"
    : stopCount > 0
      ? `${stopCount} stop${stopCount === 1 ? "" : "s"}`
      : warningCount > 0
        ? `${warningCount} to review`
        : "Ready";
  if (stopCount > 0 && onOpenRequirements) {
    return (
      <button type="button" class={`wfp-status-flag ${variant}`} onClick={onOpenRequirements}>
        {label}
      </button>
    );
  }
  return <span class={`wfp-status-flag ${variant}`}>{label}</span>;
}
