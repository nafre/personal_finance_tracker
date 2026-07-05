"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Enter/exit presence for conditionally rendered elements.
 *
 * `mounted` — render the element while true (stays true for `exitMs` after
 * `open` flips off so the exit transition can play).
 * `visible` — drive the transition classes with this; it flips on one frame
 * after mount so the enter transition actually runs (an element mounted
 * already in its final state never transitions).
 */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF: first frame paints the hidden state, second starts the transition.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, visible };
}
