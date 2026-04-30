"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/context/SidebarContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transactions", icon: "📋" },
];

function ChevronLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-testid="sidebar"
        className={cn(
          "hidden md:flex flex-col min-h-dvh bg-slate-900 border-r border-slate-800 p-3 fixed left-0 top-0 z-30",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Collapse toggle — floating on right edge, well away from sign out */}
        <button
          data-testid="sidebar-toggle"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-6 z-40 w-6 h-6 rounded-full bg-slate-700 border border-slate-600 text-slate-400 hover:text-slate-100 hover:bg-slate-600 hover:border-slate-500 transition-colors flex items-center justify-center shadow-md"
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>

        {/* Brand */}
        <div className={cn("flex items-center mb-8 pt-1", collapsed ? "justify-center" : "gap-3 px-1")}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
            }}
          >
            💸
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold text-slate-100 text-base leading-tight whitespace-nowrap">Expenses</p>
              <p className="text-xs text-slate-500 leading-tight whitespace-nowrap">Personal tracker</p>
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors w-full",
                  collapsed ? "justify-center py-3" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100",
                  isActive && !collapsed && "border-l-2 border-indigo-500"
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="pt-2 border-t border-slate-800/60">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors w-full",
              collapsed ? "justify-center py-3" : "gap-3 px-3 py-2.5"
            )}
          >
            <span className="text-base leading-none">🚪</span>
            {!collapsed && <span className="whitespace-nowrap">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        data-testid="bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50 flex"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
              pathname === item.href ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
            )}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium text-slate-500 hover:text-rose-400 transition-colors"
        >
          <span className="text-lg leading-none">🚪</span>
          Sign out
        </button>
      </nav>
    </>
  );
}
