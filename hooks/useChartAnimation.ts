"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Shared Recharts animation props: a tuned 600ms ease-out sweep on mount only.
 * Subsequent data changes (optimistic add/edit/delete patches) update the
 * chart without replaying the full animation, and reduced-motion users get
 * no animation at all. Spread onto <Area>/<Bar>/<Line>/<Pie> elements.
 */
export function useChartAnimation() {
  const reducedMotion = useReducedMotion();
  const isFirstRender = useRef(true);
  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  return {
    isAnimationActive: !reducedMotion && isFirstRender.current,
    animationDuration: 600,
    animationEasing: "ease-out",
  } as const;
}
