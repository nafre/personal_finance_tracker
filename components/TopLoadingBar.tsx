"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function TopLoadingBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navKey = `${pathname}?${searchParams.toString()}`;
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the in-flight navigation will announce its own completion via
  // nav-end (MonthSelector). The URL updates optimistically well before the
  // new data commits, so for these the navKey fallback below must stay out.
  const managedNav = useRef(false);

  useEffect(() => {
    function onNavStart(e: Event) {
      managedNav.current = (e as CustomEvent).detail?.managed === true;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setActive(true);
    }
    function onNavEnd() {
      managedNav.current = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setActive(false), 200);
    }
    window.addEventListener("nav-start", onNavStart);
    window.addEventListener("nav-end", onNavEnd);
    return () => {
      window.removeEventListener("nav-start", onNavStart);
      window.removeEventListener("nav-end", onNavEnd);
    };
  }, []);

  // Fallback for navigations that never dispatch nav-end (NavBar page links —
  // their segments have loading.tsx skeletons, so commit is quick).
  useEffect(() => {
    if (!active || managedNav.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 500);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

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

export function TopLoadingBar() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <TopLoadingBarInner />
    </Suspense>
  );
}
