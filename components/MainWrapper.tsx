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
    <main
      className={`flex-1 min-w-0 pb-20 md:pb-0 transition-[margin] duration-300 ease-in-out ${
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
