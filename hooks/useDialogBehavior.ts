"use client";

import { useEffect, useRef } from "react";

/**
 * Shared behavior for modals / bottom sheets: Escape-to-close, body scroll
 * lock while open, and focus management (move focus into the dialog on open,
 * restore it to the previously-focused element on close).
 *
 * Returns a ref to attach to the dialog container element.
 */
export function useDialogBehavior(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element (or the container itself) so keyboard
    // and screen-reader users land inside the dialog.
    const container = containerRef.current;
    if (container) {
      const focusable = container.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? container).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  return containerRef;
}
