import { DesktopIcon } from "../DesktopIcon";
import { ACCOUNT, KIOSK, PATIENT, SHELL } from "../vocabulary";
import { MenuButton } from "./MenuButton";

interface AccountMenuProps {
  staffLabel: string; locationLabel: string;
  onOpenStaff?: () => void; onOpenLocation?: () => void;
  onOpenShortcuts?: () => void; kioskMode?: boolean; onToggleKiosk?: () => void;
}

/** Local context, not authentication. All mutations remain caller-owned. */
export function AccountMenu({ staffLabel, locationLabel, onOpenStaff, onOpenLocation,
  onOpenShortcuts, kioskMode = false, onToggleKiosk }: AccountMenuProps) {
  const displayStaff = staffLabel === PATIENT.notSignedIn ? "Staff name" : staffLabel.replace(/^Signed in:\s*/i, "");
  const actions = [
    { id: "staff", label: "Documenting staff", invoke: onOpenStaff },
    { id: "location", label: ACCOUNT.visitLocation, invoke: onOpenLocation },
    { id: "shortcuts", label: SHELL.shortcuts, invoke: onOpenShortcuts },
    { id: "kiosk", label: kioskMode ? KIOSK.exitMode : KIOSK.enterMode, invoke: onToggleKiosk },
  ];
  return <MenuButton label={displayStaff} menuLabel={ACCOUNT.label} trigger="quiet"
    class="tebra-account-trigger" icon={<span class="tebra-account-avatar" aria-hidden="true"><DesktopIcon name="staff" /></span>}>
    {dismiss => <>
      <p class="tebra-account-identity" role="none"><strong>{displayStaff}</strong><small>{locationLabel}</small></p>
      {actions.map(action => <button key={action.id} type="button" role="menuitem"
        data-account-action={action.id} disabled={!action.invoke}
        onClick={() => {
          // Restore the stable trigger before the next dialog captures its opener.
          dismiss(); action.invoke?.();
        }}>{action.label}</button>)}
      <p class="tebra-account-scope" role="none">{SHELL.localOnlyDetail}</p>
    </>}
  </MenuButton>;
}

/** Locality and failed storage must remain visible, including on small screens. */
export function WorkspaceBadge({ localStorageAvailable }: { localStorageAvailable: boolean }) {
  return <span class={`tebra-workspace-badge ${localStorageAvailable ? "is-local" : "is-error"}`}
    data-workspace-badge={localStorageAvailable ? "local" : "storage-error"}
    title={localStorageAvailable ? SHELL.localOnlyDetail : SHELL.storageUnavailable}>
    {localStorageAvailable ? SHELL.localOnlyBadge : SHELL.storageError}
  </span>;
}
export const accountLocationLabel = (location: string): string => location.trim() || PATIENT.noLocation;
