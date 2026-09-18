import type { ComponentChildren } from "preact";

/** Shared visual heading. Modal focus, Escape and all clinical actions stay owned by the caller. */
export function DialogHeading({ id, title, description, closeLabel = "Close", onClose }: {
  id: string; title: ComponentChildren; description?: string; closeLabel?: string; onClose: () => void;
}) {
  return <header class="cd2004-dialog-titlebar lf-dialog-title">
    <div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>
    <button type="button" class="lf-dialog-close" aria-label={closeLabel} onClick={onClose}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
  </header>;
}
