"use client";

import { usePreferences } from "@/context/PreferencesContext";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 min-h-11 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
      </span>
      <span className="relative inline-block w-10 h-6 shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
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

export function PreferencesPanel() {
  const { privacyFeatureEnabled, setPreference } = usePreferences();

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
      </div>
    </div>
  );
}
