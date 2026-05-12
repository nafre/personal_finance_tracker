"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { changePassword } from "@/lib/actions";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCurrentPasswordError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      // Sign out to clear the now-stale JWT — session version was incremented
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      if (msg === "Current password is incorrect") {
        setCurrentPasswordError(msg);
      } else {
        setError(msg);
      }
      setIsLoading(false);
    }
  }

  return (
    <div data-testid="change-password-form" className="card space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Change password</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-400">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setCurrentPasswordError("");
            }}
            className="input-base w-full"
            placeholder="••••••••"
            required
            autoComplete="current-password"
            disabled={isLoading}
          />
          {currentPasswordError && (
            <p className="text-xs text-rose-400">{currentPasswordError}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-400">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-base w-full"
            placeholder="Min. 8 characters"
            required
            autoComplete="new-password"
            disabled={isLoading}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-400">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-base w-full"
            placeholder="Re-enter new password"
            required
            autoComplete="new-password"
            disabled={isLoading}
          />
        </div>

        {error && (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
          className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
