"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePreferences } from "@/context/PreferencesContext";
import { useSyncContext } from "@/context/SyncProvider";
import { enrollFingerprint, isInstalledApp, isPlatformAuthAvailable, markActive, verifyFingerprint } from "@/lib/app-lock";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}

function ToggleRow({ label, description, checked, onChange, disabled, testId }: ToggleRowProps) {
  return (
    <label
      data-testid={testId}
      className={`flex items-center justify-between gap-4 py-3 min-h-11 ${disabled ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
      </span>
      <span className="relative inline-block w-10 h-6 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-slate-700 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900 after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4"
        />
      </span>
    </label>
  );
}

// Fingerprint app lock — shown only in the installed PWA. Enabling enrolls a
// platform credential and immediately verifies it; disabling requires the
// fingerprint too. Client-side shield only — see lib/app-lock.ts.
function FingerprintLockRow() {
  const { appLock, setPreference } = usePreferences();
  const { userId } = useSyncContext();
  const { data: session } = useSession();
  const [support, setSupport] = useState<"hidden" | "unsupported" | "supported">("hidden");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInstalledApp()) return;
    isPlatformAuthAvailable().then((ok) => setSupport(ok ? "supported" : "unsupported"));
  }, []);

  if (support === "hidden") return null;

  if (support === "unsupported") {
    return (
      <div data-testid="fingerprint-lock-unsupported" className="py-3">
        <span className="block text-sm font-medium text-slate-200">Fingerprint lock</span>
        <span className="block text-xs text-slate-500 mt-0.5">Not supported on this device.</span>
      </div>
    );
  }

  const enabled = appLock !== null && appLock.userId === userId;

  async function handleChange(checked: boolean) {
    if (busy || !userId) return;
    setBusy(true);
    setError(null);
    try {
      if (checked) {
        const name = session?.user?.email ?? "Expenses user";
        const credentialId = await enrollFingerprint(userId, name);
        if (!(await verifyFingerprint(credentialId))) {
          setError("Couldn't verify your fingerprint — lock not enabled.");
          return;
        }
        markActive();
        setPreference({ appLock: { userId, credentialId } });
      } else {
        if (appLock && !(await verifyFingerprint(appLock.credentialId))) {
          setError("Fingerprint required to turn the lock off.");
          return;
        }
        setPreference({ appLock: null });
      }
    } catch {
      setError("Fingerprint setup was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ToggleRow
        testId="fingerprint-lock-toggle"
        label="Fingerprint lock"
        description="Ask for your fingerprint when opening the app, and after 5 minutes away."
        checked={enabled}
        disabled={busy}
        onChange={handleChange}
      />
      {error && (
        <p role="alert" className="text-xs text-rose-400 pb-3 -mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

export function PreferencesPanel() {
  const { privacyFeatureEnabled, undoDeleteEnabled, setPreference } = usePreferences();

  return (
    <div data-testid="preferences-panel" className="card">
      <h2 className="text-sm font-semibold text-slate-300">Preferences</h2>
      <p className="text-xs text-slate-500 mt-0.5">Device-level settings, stored in this browser.</p>

      <div className="mt-2 divide-y divide-slate-800">
        <ToggleRow
          label="Privacy mode"
          description="Show an eye button in the navigation to blur amounts."
          checked={privacyFeatureEnabled}
          onChange={(checked) => setPreference({ privacyFeatureEnabled: checked })}
        />
        <ToggleRow
          label="Undo delete"
          description="Show an Undo option for 5 seconds after deleting a transaction."
          checked={undoDeleteEnabled}
          onChange={(checked) => setPreference({ undoDeleteEnabled: checked })}
        />
        <FingerprintLockRow />
      </div>
    </div>
  );
}
