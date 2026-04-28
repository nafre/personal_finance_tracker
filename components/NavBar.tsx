"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transactions", icon: "📋" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside data-testid="sidebar" className="hidden md:flex flex-col w-56 min-h-dvh bg-slate-900 border-r border-slate-800 p-4 fixed left-0 top-0">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 px-2 pt-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}
          >
            💸
          </div>
          <div>
            <p className="font-bold text-slate-100 text-base leading-tight">Expenses</p>
            <p className="text-xs text-slate-500 leading-tight">Personal tracker</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-500"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors w-full"
        >
          <span>🚪</span>
          Sign out
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <nav data-testid="bottom-nav" className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50 flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
              pathname === item.href
                ? "text-indigo-400"
                : "text-slate-500 hover:text-slate-300"
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
