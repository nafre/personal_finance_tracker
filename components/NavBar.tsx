"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { clearLocalDataForSignOut } from "@/lib/sync";
import { useSidebar } from "@/context/SidebarContext";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  ReceiptText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function dispatchNavStart(href: string, currentPathname: string) {
  if (currentPathname !== href) {
    window.dispatchEvent(new Event("nav-start"));
  }
}

// Wipe the IDB mirror + SW page caches before dropping the session so
// financial data isn't readable offline by the next person on this device.
async function handleSignOut() {
  await clearLocalDataForSignOut();
  await signOut({ callbackUrl: "/login" });
}

export function NavBar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-testid="sidebar"
        className={cn(
          "hidden md:flex flex-col min-h-dvh bg-slate-900 border-r border-slate-800 p-3 fixed left-0 top-0 z-30",
          // Suppress the width transition until after hydration so the
          // localStorage-restored collapsed state doesn't animate on load.
          mounted && "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Collapse toggle — floating on right edge, well away from sign out */}
        <button
          data-testid="sidebar-toggle"
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3 top-6 z-40 w-6 h-6 rounded-full bg-slate-700 border border-slate-600 text-slate-400 hover:text-slate-100 hover:bg-slate-600 hover:border-slate-500 transition-colors flex items-center justify-center shadow-md after:absolute after:-inset-2.5 after:content-['']"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
          )}
        </button>

        {/* Brand */}
        <div className={cn("flex items-center mb-8 pt-1", collapsed ? "justify-center" : "gap-3 px-1")}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 bg-linear-to-br from-brand to-brand-violet shadow-[0_4px_12px_rgba(99,102,241,0.4)]"
            aria-hidden="true"
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
            const isActive = mounted && pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                onClick={() => dispatchNavStart(item.href, pathname)}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors w-full",
                  collapsed ? "justify-center py-3" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100",
                  isActive && !collapsed && "border-l-2 border-indigo-500"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="pt-2 border-t border-slate-800/60">
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign out" : undefined}
            aria-label={collapsed ? "Sign out" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors w-full",
              collapsed ? "justify-center py-3" : "gap-3 px-3 py-2.5"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="whitespace-nowrap">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        data-testid="bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50 flex pb-(--safe-bottom)"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => dispatchNavStart(item.href, pathname)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                mounted && pathname === item.href ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={handleSignOut}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium text-slate-500 hover:text-rose-400 transition-colors"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          Sign out
        </button>
      </nav>
    </>
  );
}
