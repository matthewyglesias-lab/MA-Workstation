import type { ComponentChildren } from "preact";
import type { DesktopPane } from "./types";

interface PanelProps {
  pane: DesktopPane;
  title: string;
  subtitle?: string;
  active?: boolean;
  mobileActive?: boolean;
  children: ComponentChildren;
  toolbar?: ComponentChildren;
  footer?: ComponentChildren;
  onActivate?: (pane: DesktopPane) => void;
}

/**
 * A fixed structural section of the desktop (nav rail, main work area, note
 * rail) styled like a classic terminal panel. Unlike the retired window
 * manager, panels cannot be minimized, maximized, closed, or reordered —
 * every panel a workflow needs is always in its place.
 */
export function Panel({
  pane,
  title,
  subtitle,
  active = false,
  mobileActive = false,
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
        mobileActive ? "is-mobile-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pane={pane}
      id={`cd2004-pane-${pane}`}
      role="tabpanel"
      aria-labelledby={`cd2004-pane-tab-${pane}`}
      aria-label={`${title} panel`}
      tabIndex={-1}
      onMouseDown={() => onActivate?.(pane)}
      onFocusCapture={() => onActivate?.(pane)}
    >
      <header class="cd2004-window-titlebar">
        <span class="cd2004-window-mark" aria-hidden="true" />
        <span class="cd2004-window-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </span>
      </header>
      {toolbar && <div class="cd2004-window-toolbar">{toolbar}</div>}
      <div class="cd2004-window-body">{children}</div>
      {footer && <footer class="cd2004-window-footer">{footer}</footer>}
    </section>
  );
}
