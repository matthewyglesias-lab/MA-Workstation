import type { ComponentChildren } from "preact";
import { DesktopIcon } from "../DesktopIcon";
import { SHELL } from "../vocabulary";

interface AppHeaderProps {
  /** Always-visible provenance, and the storage-failure state with it. */
  badge: ComponentChildren;
  /** The account control, top right, where Tebra puts it. */
  account: ComponentChildren;
  children: ComponentChildren;
}

/**
 * Persistent product header for the local IPMG module.
 *
 * Web-product chrome, not a simulated operating-system title bar. Two things
 * left it when the desktop chrome was retired: the menu bar, which Tebra has
 * no equivalent of, and the transaction-code chip, which was a client/server
 * screen identifier that named the system's own internals rather than
 * anything a medical assistant does. The long-standing class names remain
 * until the dedicated mechanical class-vocabulary phase.
 */
export function AppHeader({ badge, account, children }: AppHeaderProps) {
  return (
    <header class="cd2004-application-header tebra-app-header cd2004-print-exclude">
      <div class="cd2004-app-titlebar tebra-app-header-main">
        <span class="cd2004-app-logo tebra-app-mark" aria-hidden="true">
          <DesktopIcon name="administer" />
        </span>
        <span class="cd2004-app-title tebra-app-identity">
          <b>{SHELL.organizationShort}</b>
          <span>{SHELL.productName}</span>
        </span>
        <span class="cd2004-app-environment tebra-app-context">
          {badge}
          {account}
        </span>
      </div>
      {children}
    </header>
  );
}
