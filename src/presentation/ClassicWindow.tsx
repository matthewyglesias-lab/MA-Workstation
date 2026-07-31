import type { ComponentChildren } from "preact";
import type { DesktopPane, WindowMode } from "./types";

interface ClassicWindowProps {
  pane: DesktopPane;
  title: string;
  subtitle?: string;
  mode: WindowMode;
  active?: boolean;
  mobileActive?: boolean;
  canClose?: boolean;
  canMinimize?: boolean;
  canMaximize?: boolean;
  children: ComponentChildren;
  toolbar?: ComponentChildren;
  footer?: ComponentChildren;
  onActivate?: (pane: DesktopPane) => void;
  onModeChange?: (pane: DesktopPane, mode: WindowMode) => void;
}

export function ClassicWindow({
  pane,
  title,
  subtitle,
  mode,
  active = false,
  mobileActive = false,
  canClose = true,
  canMinimize = true,
  canMaximize = true,
  children,
  toolbar,
  footer,
  onActivate,
  onModeChange,
}: ClassicWindowProps) {
  if (mode === "closed") return null;

  const isMinimized = mode === "minimized";
  const isMaximized = mode === "maximized";
  const setMode = (nextMode: WindowMode) => onModeChange?.(pane, nextMode);

  return (
    <section
      class={[
        "cd2004-window",
        `cd2004-${pane}-window`,
        active ? "is-active" : "",
        isMinimized ? "is-minimized" : "",
        isMaximized ? "is-maximized" : "",
        mobileActive ? "is-mobile-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pane={pane}
      data-window-mode={mode}
      id={`cd2004-pane-${pane}`}
      role="tabpanel"
      aria-labelledby={`cd2004-pane-tab-${pane}`}
      aria-label={`${title} window`}
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
        <span class="cd2004-window-controls">
          {canMinimize && (
            <button
              type="button"
              class="cd2004-caption-button"
              aria-label={isMinimized ? `Restore ${title}` : `Minimize ${title}`}
              title={isMinimized ? "Restore" : "Minimize"}
              onClick={(event) => {
                event.stopPropagation();
                setMode(isMinimized ? "normal" : "minimized");
              }}
            >
              <span aria-hidden="true">_</span>
            </button>
          )}
          {canMaximize && (
            <button
              type="button"
              class="cd2004-caption-button"
              aria-label={isMaximized ? `Restore ${title}` : `Maximize ${title}`}
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={(event) => {
                event.stopPropagation();
                setMode(isMaximized ? "normal" : "maximized");
              }}
            >
              <span aria-hidden="true">{isMaximized ? "❐" : "□"}</span>
            </button>
          )}
          {canClose && (
            <button
              type="button"
              class="cd2004-caption-button cd2004-caption-close"
              aria-label={`Close ${title}`}
              title="Close"
              onClick={(event) => {
                event.stopPropagation();
                setMode("closed");
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </span>
      </header>
      {!isMinimized && (
        <>
          {toolbar && <div class="cd2004-window-toolbar">{toolbar}</div>}
          <div class="cd2004-window-body">{children}</div>
          {footer && <footer class="cd2004-window-footer">{footer}</footer>}
        </>
      )}
    </section>
  );
}
