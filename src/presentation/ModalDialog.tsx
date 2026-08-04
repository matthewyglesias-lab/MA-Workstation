import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * Thin wrapper over the native <dialog> element. showModal() supplies the top
 * layer, ::backdrop, Escape-to-cancel, focus trapping, focus restoration, and
 * inerting of everything behind it - replacing the hand-rolled backdrop div,
 * Tab trap, and sibling-isolation effect this shell used to carry.
 */
export function ModalDialog({
  class: className,
  labelledBy,
  onDismiss,
  children,
}: {
  class?: string;
  labelledBy: string;
  onDismiss: () => void;
  children: ComponentChildren;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      class={className}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
