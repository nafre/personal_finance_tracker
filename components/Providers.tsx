"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/context/SyncProvider";
import { ToastProvider } from "@/context/ToastContext";
import { PreferencesProvider } from "@/context/PreferencesContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <PreferencesProvider>
          <SyncProvider>{children}</SyncProvider>
        </PreferencesProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
