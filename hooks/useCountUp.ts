"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

const DURATION_MS = 500;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tweens toward `value` when it changes. The first render shows the value
 * as-is (no count-up from zero on page load); reduced motion snaps instantly.
 */
export function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }

    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setDisplay(from + (value - from) * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reducedMotion]);

  return display;
}
