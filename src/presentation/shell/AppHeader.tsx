import type { ComponentChildren } from "preact";
import { LightfullyMark } from "../lightfully/WorkspaceTools";
import { SHELL } from "../vocabulary";

interface AppHeaderProps {
  badge: ComponentChildren;
  account: ComponentChildren;
  children: ComponentChildren;
  tools?: ComponentChildren;
  search?: ComponentChildren;
}

/** A quiet, persistent masthead; clinical context remains in its own safety band. */
export function AppHeader({ badge, account, children, tools, search }: AppHeaderProps) {
  return <header class="cd2004-application-header tebra-app-header lf-app-header cd2004-print-exclude">
    <div class="cd2004-app-titlebar tebra-app-header-main">
      <div class="lf-header-search">{search}</div>
      {tools}
      <span class="cd2004-app-environment tebra-app-context">{badge}{account}</span>
    </div>
    {children}
  </header>;
}
