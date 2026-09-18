import type { ComponentChildren } from "preact";
import { LightfullyMark } from "../lightfully/WorkspaceTools";
import { SHELL } from "../vocabulary";

interface AppHeaderProps {
  badge: ComponentChildren;
  account: ComponentChildren;
  children: ComponentChildren;
  tools?: ComponentChildren;
}

/** A quiet, persistent masthead; clinical context remains in its own safety band. */
export function AppHeader({ badge, account, children, tools }: AppHeaderProps) {
  return <header class="cd2004-application-header tebra-app-header lf-app-header cd2004-print-exclude">
    <div class="cd2004-app-titlebar tebra-app-header-main">
      <div class="lf-brand">
        <span class="cd2004-app-logo tebra-app-mark" aria-hidden="true"><LightfullyMark/></span>
        <span class="cd2004-app-title tebra-app-identity"><b>{SHELL.organizationShort}</b><span>{SHELL.productName}</span></span>
      </div>
      {tools}
      <span class="cd2004-app-environment tebra-app-context">{badge}{account}</span>
    </div>
    {children}
  </header>;
}
