import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { trapDialogTabKey } from "./records-drawer-shared";
import { outsideRect } from "./lightfully/interaction-policy";

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
  const backdropStart = useRef(false);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const isBackdrop = (event: MouseEvent | PointerEvent) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return false;
    const surface = dialog.querySelector<HTMLElement>(":scope > .cd2004-dialog-frame") ?? dialog;
    return outsideRect(event, surface.getBoundingClientRect());
  };
  return <dialog ref={dialogRef} class={className} aria-labelledby={labelledBy} aria-modal="true"
    onKeyDown={event => trapDialogTabKey(dialogRef.current, event)}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onPointerDown={event => { backdropStart.current = event.button === 0 && isBackdrop(event); }}
    onPointerCancel={() => { backdropStart.current = false; }}
    onClick={event => {
      const dismiss = dismissOnBackdrop && backdropStart.current && isBackdrop(event);
      backdropStart.current = false;
      if (dismiss) onDismiss();
    }}>{children}</dialog>;
}
