import type { ComponentChildren } from "preact";
import { DesktopIcon } from "../DesktopIcon";
import { PATIENT, SHELL } from "../vocabulary";

interface AppHeaderProps {
  transactionCode: string;
  staffLabel?: string;
  locationLabel?: string;
  children: ComponentChildren;
}

/**
 * Persistent product header for the local IPMG module. The structure is
 * intentionally web-product chrome rather than a simulated operating-system
 * title bar, while the long-standing class names remain until the dedicated
 * mechanical class-vocabulary phase.
 */
export function AppHeader({
  transactionCode,
  staffLabel,
  locationLabel,
  children,
}: AppHeaderProps) {
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
        <span class="tebra-app-workspace" aria-label={SHELL.currentWorkspace}>
          {transactionCode}
        </span>
        <span class="cd2004-app-environment tebra-app-context">
          <b>{SHELL.localOnlyBadge}</b>
          <small>
            {staffLabel || PATIENT.notSignedIn}
            <span aria-hidden="true"> · </span>
            {locationLabel || PATIENT.noLocation}
          </small>
        </span>
      </div>
      {children}
    </header>
  );
}
