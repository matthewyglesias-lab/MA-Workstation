import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { trapDialogTabKey } from "./records-drawer-shared";
import { useBackdropDismiss } from "./lightfully/use-backdrop-dismiss";

/** Native modal behavior, with light dismissal only for a genuine backdrop tap.
 * Padding clicks and drags that begin in the content never dismiss the dialog.
 */
export function ModalDialog({ class: className, labelledBy, onDismiss, children,
  dismissOnBackdrop = true,
}: {
  class?: string; labelledBy: string; onDismiss: () => void;
  children: ComponentChildren; dismissOnBackdrop?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropDismiss(onDismiss, dismissOnBackdrop);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} class={className} aria-labelledby={labelledBy} aria-modal="true"
    onKeyDown={event => trapDialogTabKey(dialogRef.current, event)}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    {...backdrop}>{children}</dialog>;
}
