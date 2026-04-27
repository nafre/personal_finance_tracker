"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/context/SyncProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SyncProvider>{children}</SyncProvider>
    </SessionProvider>
  );
}
