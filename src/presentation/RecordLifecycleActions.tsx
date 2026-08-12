import type { ComponentChildren } from "preact";

export type RecordLifecycle = "new" | "draft" | "locked" | "saving" | "error";

const LIFECYCLE_LABEL: Record<RecordLifecycle, string> = {
  new: "NEW LOCAL DRAFT",
  draft: "SAVED LOCAL DRAFT",
  locked: "LOCAL RECORD LOCKED",
  saving: "SAVING LOCAL DRAFT",
  error: "SAVE ATTENTION REQUIRED",
};

export interface RecordLifecycleActionsProps {
  /** e.g. "INJECTION RECORD" / "UDS RECORD". */
  recordLabel: string;
  ariaLabel: string;
  lifecycle: RecordLifecycle;
  /** Caller-resolved detail sentence for the current lifecycle - domain
   * wording ("disposition" vs. "screen") and blocker/error text differ
   * legitimately per workflow, so this stays their call, not this
   * component's. */
  detail: string;
  /** The button row. Save/finish/discard enable-logic is workflow-specific
   * (Injection gates on typed readiness and a legacy posting state; UDS is
   * simpler), so buttons stay caller-owned rather than forced into a single
   * rigid prop shape. */
  buttons: ComponentChildren;
  /** Sets a boolean marker attribute (e.g. "data-injection-record-actions")
   * on the root section, for callers with existing e2e hooks depending on
   * it. Omit for callers with no such dependency. */
  rootTestAttribute?: string;
}

/**
 * Shared chrome for the record-lifecycle status/action bar every lockable
 * workflow (Injection, UDS) docks above its footer: a colored state band
 * naming the record type, its current lifecycle, and a live detail line.
 * Previously Injection's copy of this lived in ClinicalDesktopShell.tsx and
 * UDS hand-rolled an independent, already-drifted copy of the same markup.
 */
export function RecordLifecycleActions({
  recordLabel,
  ariaLabel,
  lifecycle,
  detail,
  buttons,
  rootTestAttribute,
}: RecordLifecycleActionsProps) {
  const locked = lifecycle === "locked";
  return (
    <section
      class={`cd2004-record-actions is-${lifecycle}`}
      aria-label={ariaLabel}
      {...(rootTestAttribute ? { [rootTestAttribute]: true } : {})}
    >
      <div
        class="cd2004-record-actions-state"
        tabIndex={locked ? -1 : undefined}
        data-locked-record-action={locked ? true : undefined}
      >
        <span>{recordLabel}</span>
        <strong>{LIFECYCLE_LABEL[lifecycle]}</strong>
        <small role="status" aria-live="polite">
          {detail}
        </small>
      </div>
      <div class="cd2004-record-actions-buttons">{buttons}</div>
    </section>
  );
}
