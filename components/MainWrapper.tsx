"use client";

import { useSidebar } from "@/context/SidebarContext";
import { ReactNode } from "react";

export function MainWrapper({
  banner,
  children,
}: {
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { collapsed } = useSidebar();
  return (
    // The app shell doesn't scroll — this is the scroll region. `overscroll-contain`
    // stops scroll chaining to the root, which is what would otherwise let the
    // browser's dynamic URL bar retract and strand the in-flow bottom nav.
    <main
      data-scroll-region
      className={`flex-1 min-w-0 overflow-y-auto overscroll-contain transition-[margin] duration-300 ease-in-out ${
        collapsed ? "md:ml-16" : "md:ml-56"
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 py-6">
        {banner}
        {children}
      </div>
    </main>
  );
}
