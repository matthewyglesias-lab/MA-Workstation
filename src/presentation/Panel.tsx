import type { ComponentChildren } from "preact";
import type { DesktopPane } from "./types";

interface PanelProps {
  pane: DesktopPane;
  title: string;
  active?: boolean;
  /** Keep the editor mounted for records/print, but unavailable behind an outcome. */
  suspended?: boolean;
  children: ComponentChildren;
  toolbar?: ComponentChildren;
  footer?: ComponentChildren;
  onActivate?: (pane: DesktopPane) => void;
}

/**
 * A fixed structural region of the clinical workspace. Panels cannot be
 * minimized, maximized, closed, or reordered: every region a workflow needs
 * remains in its predictable place.
 */
export function Panel({
  pane,
  title,
  active = false,
  suspended = false,
  children,
  toolbar,
  footer,
  onActivate,
}: PanelProps) {
  return (
    <section
      class={[
        "cd2004-window",
        `cd2004-${pane}-window`,
        active ? "is-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pane={pane}
      data-suspended={suspended ? "true" : undefined}
      inert={suspended}
      aria-hidden={suspended ? "true" : undefined}
      id={`cd2004-pane-${pane}`}
      role="region"
      aria-label={`${title} panel`}
      tabIndex={-1}
      onFocusCapture={() => onActivate?.(pane)}
    >
      {toolbar && <div class="cd2004-window-toolbar">{toolbar}</div>}
      <div class="cd2004-window-body">{children}</div>
      {footer && <footer class="cd2004-window-footer">{footer}</footer>}
    </section>
  );
}
