"use client";

import { useEffect, useRef } from "react";

/**
 * Shared behavior for modals / bottom sheets, built on the native <dialog>
 * element. `showModal()` puts the dialog in the top layer and makes the rest
 * of the document inert, so focus is genuinely trapped — Tab can't reach the
 * page behind (the old hand-rolled version moved focus in but didn't trap it).
 * Also: Escape-to-close (via the `cancel` event, intercepted so the exit
 * animation can play before React unmounts), body scroll lock while open, and
 * focus management (move focus into the dialog on open, restore on close).
 *
 * Returns a ref to attach to a <dialog> element (style it with the
 * `dialog-shell` utility). Keep the element mounted for the whole exit
 * animation — the dialog leaves the top layer when `open` flips false or the
 * element unmounts.
 */
export function useDialogBehavior(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Consumers pass inline closures; reading through a ref keeps the effect
  // from closing and re-opening the dialog on every parent re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const dialog = containerRef.current;
    if (!dialog) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();

    // Focus the first focusable element (or the dialog itself) so keyboard
    // and screen-reader users land inside the dialog.
    const focusable = dialog.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? dialog).focus();

    // Escape fires `cancel`; prevent the instant native close so the exit
    // animation can play — React unmounts the dialog when it's done.
    function handleCancel(e: Event) {
      e.preventDefault();
      onCloseRef.current();
    }
    // If the browser force-closes anyway (Chrome ignores preventDefault on a
    // second rapid Escape), keep React state in sync. The close event fires in
    // a queued task, so a close() from a previous effect cleanup can land after
    // this effect re-opened the dialog (StrictMode mounts do exactly that) —
    // only treat the event as real if the dialog is still closed.
    function handleClose() {
      if (dialog && !dialog.open) onCloseRef.current();
    }
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    // showModal() makes the page inert but doesn't stop it scrolling.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      document.body.style.overflow = prevOverflow;
      if (dialog.open) dialog.close();
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  return containerRef;
}
