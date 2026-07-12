"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const STORAGE_KEY = "app-preferences";

interface Preferences {
  /** Whether the privacy-mode feature is available (eye button in the nav). */
  privacyFeatureEnabled: boolean;
  /** Whether amounts are currently blurred (only effective while the feature is enabled). */
  privateMode: boolean;
  /** Whether deleting a transaction offers a 5s Undo toast. */
  undoDeleteEnabled: boolean;
}

const DEFAULTS: Preferences = {
  privacyFeatureEnabled: true,
  privateMode: false,
  undoDeleteEnabled: true,
};

interface PreferencesContextValue {
  privacyFeatureEnabled: boolean;
  /** Effective blur state — always false while the privacy feature is disabled. */
  isPrivate: boolean;
  undoDeleteEnabled: boolean;
  togglePrivate: () => void;
  setPreference: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  privacyFeatureEnabled: DEFAULTS.privacyFeatureEnabled,
  isPrivate: false,
  undoDeleteEnabled: DEFAULTS.undoDeleteEnabled,
  togglePrivate: () => {},
  setPreference: () => {},
});

function readStored(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    return { ...DEFAULTS, ...(parsed as Partial<Preferences>) };
  } catch {
    return DEFAULTS;
  }
}

function persist(next: Preferences): Preferences {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing quota etc.) — keep in-memory state.
  }
  return next;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  // Read after mount (not in the initializer) so SSR markup matches first paint,
  // and re-read on `storage` so the toggle syncs across tabs.
  useEffect(() => {
    setPrefs(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) setPrefs(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isPrivate = prefs.privacyFeatureEnabled && prefs.privateMode;

  // The CSS hook: [data-private] .tabular-nums blurs every currency figure.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-private", isPrivate);
  }, [isPrivate]);

  const togglePrivate = useCallback(() => {
    setPrefs((prev) => persist({ ...prev, privateMode: !prev.privateMode }));
  }, []);

  const setPreference = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => persist({ ...prev, ...patch }));
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        privacyFeatureEnabled: prefs.privacyFeatureEnabled,
        isPrivate,
        undoDeleteEnabled: prefs.undoDeleteEnabled,
        togglePrivate,
        setPreference,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
