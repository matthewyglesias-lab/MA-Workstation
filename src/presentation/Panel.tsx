import type { ComponentChildren } from "preact";
import { DesktopIcon } from "./DesktopIcon";
import type { DesktopIconName, DesktopPane } from "./types";

interface PanelProps {
  pane: DesktopPane;
  title: string;
  icon?: DesktopIconName;
  subtitle?: string;
  active?: boolean;
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
  icon,
  subtitle,
  active = false,
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
      id={`cd2004-pane-${pane}`}
      role="region"
      aria-label={`${title} panel`}
      tabIndex={-1}
      onMouseDown={() => onActivate?.(pane)}
      onFocusCapture={() => onActivate?.(pane)}
    >
      <header class="cd2004-window-titlebar">
        <span class={`cd2004-window-mark ${icon ? "has-icon" : ""}`} aria-hidden="true">
          {icon && <DesktopIcon name={icon} />}
        </span>
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
