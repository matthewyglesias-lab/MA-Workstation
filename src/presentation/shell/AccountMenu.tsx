import { DesktopIcon } from "../DesktopIcon";
import { ACCOUNT, PATIENT, SHELL } from "../vocabulary";
import { MenuButton } from "./MenuButton";

interface AccountMenuProps {
  staffLabel: string;
  locationLabel: string;
  onOpenStaff?: () => void;
  onOpenLocation?: () => void;
  onOpenShortcuts?: () => void;
}

/**
 * Who is signed in and where, as a menu — Tebra's own top-right user control.
 *
 * This is where the retired menu bar's genuinely homeless commands landed.
 * Everything else it held already had a Tebra-native home: Save and Sign are
 * on the note, Open Notes and the note types are in the section rail, New Note
 * is the action bar's split control. Only staff sign-in and visit location had
 * nowhere else to be, and in Tebra those are account-level settings reached
 * from exactly here.
 */
export function AccountMenu({
  staffLabel,
  locationLabel,
  onOpenStaff,
  onOpenLocation,
  onOpenShortcuts,
}: AccountMenuProps) {
  return (
    <MenuButton
      label={staffLabel}
      menuLabel={ACCOUNT.label}
      trigger="quiet"
      class="tebra-account-trigger"
      icon={
        <span class="tebra-account-avatar" aria-hidden="true">
          <DesktopIcon name="staff" />
        </span>
      }
    >
      {(dismiss) => (
        <>
          <p class="tebra-account-identity" role="none">
            <strong>{staffLabel}</strong>
            <small>{locationLabel}</small>
          </p>
          <button
            type="button"
            role="menuitem"
            data-account-action="staff"
            disabled={!onOpenStaff}
            onClick={() => {
              dismiss();
              onOpenStaff?.();
            }}
          >
            {ACCOUNT.staffSignIn}
          </button>
          <button
            type="button"
            role="menuitem"
            data-account-action="location"
            disabled={!onOpenLocation}
            onClick={() => {
              dismiss();
              onOpenLocation?.();
            }}
          >
            {ACCOUNT.visitLocation}
          </button>
          <button
            type="button"
            role="menuitem"
            data-account-action="shortcuts"
            disabled={!onOpenShortcuts}
            onClick={() => {
              // Focus returns to the trigger before the dialog opens, so the
              // dialog captures the trigger as its return target rather than
              // the menu item that is about to unmount.
              dismiss();
              onOpenShortcuts?.();
            }}
          >
            {SHELL.shortcuts}
          </button>
          {/*
            The provenance line, in the menu that names the account. This app
            has no server; the more faithfully it reads as a real EHR the more
            it needs to say so where someone checking "am I signed in?" will
            see it.
          */}
          <p class="tebra-account-scope" role="none">
            {SHELL.localOnlyDetail}
          </p>
        </>
      )}
    </MenuButton>
  );
}

interface WorkspaceBadgeProps {
  localStorageAvailable: boolean;
}

/**
 * The always-visible provenance badge.
 *
 * It also carries the storage-failure state, which used to live in the status
 * bar. That bar is gone, and a browser that cannot save must never fail
 * quietly: staff would keep documenting into a note that is not being kept.
 */
export function WorkspaceBadge({ localStorageAvailable }: WorkspaceBadgeProps) {
  return (
    <span
      class={`tebra-workspace-badge ${localStorageAvailable ? "is-local" : "is-error"}`}
      data-workspace-badge={localStorageAvailable ? "local" : "storage-error"}
      title={localStorageAvailable ? SHELL.localOnlyDetail : SHELL.storageUnavailable}
    >
      {localStorageAvailable ? SHELL.localOnlyBadge : SHELL.storageError}
    </span>
  );
}

/** Not exported for use elsewhere; kept beside the badge it labels. */
export const accountLocationLabel = (location: string): string =>
  location.trim() || PATIENT.noLocation;
