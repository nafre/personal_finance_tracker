"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { FingerprintPattern } from "lucide-react";
import { usePreferences } from "@/context/PreferencesContext";
import { useSyncContext } from "@/context/SyncProvider";
import { useDialogBehavior } from "@/hooks/useDialogBehavior";
import { clearLocalDataForSignOut } from "@/lib/sync";
import { clearActive, isInstalledApp, markActive, readLastActive, shouldRelock, verifyFingerprint } from "@/lib/app-lock";

// Fingerprint lock screen for the installed PWA. A client-side curtain, not a
// security boundary — see lib/app-lock.ts. Cold launches are locked before
// first paint by the inline script in app/layout.tsx (`data-locked` on
// <html>); this component owns the overlay, unlocking, and re-locking after
// LOCK_GRACE_MS in the background.

function setLockedAttr(locked: boolean) {
  document.documentElement.toggleAttribute("data-locked", locked);
}

const noop = () => {};

export function AppLock() {
  const { appLock, hydrated } = usePreferences();
  const { userId } = useSyncContext();
  const [installed, setInstalled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoPrompted = useRef(false);

  // The lock only applies to the account that enrolled it — another user
  // signing in on this device isn't held behind someone else's finger.
  const active = installed && appLock !== null && (!userId || appLock.userId === userId);

  useEffect(() => {
    setInstalled(isInstalledApp());
    setLocked(document.documentElement.hasAttribute("data-locked"));
  }, []);

  // Release a pre-paint lock that turns out not to apply (lock disabled in
  // another tab, different user, or not actually installed).
  useEffect(() => {
    if (!hydrated || active || !locked) return;
    if (installed && appLock && !userId) return; // session still loading
    setLockedAttr(false);
    setLocked(false);
  }, [hydrated, active, locked, installed, appLock, userId]);

  const lock = useCallback(() => {
    clearActive();
    setLockedAttr(true);
    setError(null);
    autoPrompted.current = false;
    setLocked(true);
  }, []);

  // Re-lock after LOCK_GRACE_MS in the background. The last-active marker is
  // only written while unlocked, so a reload while locked stays locked.
  useEffect(() => {
    if (!active) return;
    const lockedRef = { current: locked };
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (!lockedRef.current) markActive();
      } else if (!lockedRef.current && shouldRelock(readLastActive(), Date.now())) {
        lock();
      }
    }
    function onPageHide() {
      if (!lockedRef.current) markActive();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [active, locked, lock]);

  const unlock = useCallback(async () => {
    if (!appLock || verifying) return;
    setVerifying(true);
    setError(null);
    const ok = await verifyFingerprint(appLock.credentialId);
    setVerifying(false);
    if (ok) {
      markActive();
      setLockedAttr(false);
      setLocked(false);
    } else {
      setError("Fingerprint not recognised — try again.");
    }
  }, [appLock, verifying]);

  const showOverlay = active && locked;

  // Prompt once as soon as the lock screen is visible. Browsers that insist
  // on a user gesture (Safari) reject this; the Unlock button covers them, so
  // the auto-prompt failure isn't surfaced as an error.
  useEffect(() => {
    if (!showOverlay || autoPrompted.current || document.visibilityState !== "visible") return;
    autoPrompted.current = true;
    if (!appLock) return;
    setVerifying(true);
    verifyFingerprint(appLock.credentialId).then((ok) => {
      setVerifying(false);
      if (ok) {
        markActive();
        setLockedAttr(false);
        setLocked(false);
      }
    });
  }, [showOverlay, appLock]);

  const dialogRef = useDialogBehavior(showOverlay, noop);

  async function handleUsePassword() {
    await clearLocalDataForSignOut();
    await signOut({ callbackUrl: "/login" });
  }

  if (!showOverlay) return null;

  return (
    <dialog
      ref={dialogRef}
      data-testid="app-lock-overlay"
      aria-labelledby="app-lock-title"
      className="dialog-shell z-100 bg-slate-950"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.14) 0%, #0f172a 60%)" }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center pb-[var(--safe-bottom)]">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-3xl bg-linear-to-br from-brand to-brand-violet shadow-[0_8px_28px_rgba(99,102,241,0.5)]"
          aria-hidden="true"
        >
          💸
        </div>
        <h1 id="app-lock-title" className="text-xl font-bold text-slate-100">
          Expenses is locked
        </h1>
        <p className="text-sm text-slate-400 mt-1">Use your fingerprint to continue.</p>

        <button
          type="button"
          onClick={unlock}
          disabled={verifying}
          className="btn-primary mt-8 inline-flex items-center gap-2 min-h-11 disabled:opacity-60"
        >
          <FingerprintPattern className="w-5 h-5" aria-hidden="true" />
          {verifying ? "Waiting for fingerprint…" : "Unlock"}
        </button>

        <p role="alert" className="min-h-5 mt-3 text-sm text-rose-400">
          {error}
        </p>

        <button type="button" onClick={handleUsePassword} className="btn-ghost mt-4 text-sm min-h-11">
          Use password instead
        </button>
      </div>
    </dialog>
  );
}
