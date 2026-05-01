"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function TopLoadingBar() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onNavStart() {
      setActive(true);
    }
    window.addEventListener("nav-start", onNavStart);
    return () => window.removeEventListener("nav-start", onNavStart);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 500);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none overflow-hidden"
      aria-hidden
    >
      <div className="h-full bg-indigo-500 animate-nav-progress" />
    </div>
  );
}
