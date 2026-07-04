"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/context/SyncProvider";
import { ToastProvider } from "@/context/ToastContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <SyncProvider>{children}</SyncProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
