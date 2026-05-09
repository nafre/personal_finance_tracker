"use client";

import { useState } from "react";
import { createUser, deleteUser, adminResetPassword } from "@/lib/actions";
import { stringToColor } from "@/lib/utils";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UserManagerProps {
  initialUsers: UserRecord[];
  currentUserId: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const ROLE_BADGE: Record<string, string> = {
  admin: "badge bg-indigo-500/20 text-indigo-400",
  user: "badge bg-slate-500/20 text-slate-400",
  demo: "badge bg-amber-500/20 text-amber-400",
};

export function UserManager({ initialUsers, currentUserId }: UserManagerProps) {
  const [users, setUsers] = useState<UserRecord[]>(initialUsers);

  // Create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<"user" | "admin" | "demo">("user");
  const [isCreating, setIsCreating] = useState(false);

  // Per-row state
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [expandedResetId, setExpandedResetId] = useState<string | null>(null);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [showResetPassword, setShowResetPassword] = useState<Record<string, boolean>>({});
  const [resettingIds, setResettingIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const adminCount = users.filter((u) => u.role === "admin").length;
  const isLastAdmin = (uid: string) =>
    users.find((u) => u.id === uid)?.role === "admin" && adminCount <= 1;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword) return;
    setIsCreating(true);
    setError("");
    setSuccess("");
    try {
      const created = await createUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      const newRecord: UserRecord = {
        id: created.id,
        email: created.email,
        name: newName.trim(),
        role: newRole,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setUsers((prev) => [...prev, newRecord]);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      setSuccess("User created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    setError("");
    setSuccess("");
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleResetPassword(id: string) {
    const pw = resetPasswords[id] ?? "";
    if (!pw) return;
    setResettingIds((prev) => new Set(prev).add(id));
    setError("");
    setSuccess("");
    try {
      await adminResetPassword(id, pw);
      setResetPasswords((prev) => ({ ...prev, [id]: "" }));
      setExpandedResetId(null);
      setSuccess("Password reset successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResettingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* User list */}
      <div className="card divide-y divide-slate-700/50 p-0 overflow-hidden">
        {users.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm">No users yet.</p>
        ) : (
          users.map((user) => {
            const isCurrent = user.id === currentUserId;
            const cannotDelete = isCurrent || isLastAdmin(user.id);
            const deleteTitle = isCurrent
              ? "You cannot delete your own account"
              : isLastAdmin(user.id)
              ? "Cannot delete the last admin account"
              : "Delete user";
            const isExpanded = expandedResetId === user.id;

            return (
              <div key={user.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white select-none"
                    style={{ background: stringToColor(user.name) }}
                  >
                    {getInitials(user.name)}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {user.name}
                      </span>
                      {isCurrent && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 font-medium flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 truncate block">{user.email}</span>
                  </div>

                  {/* Role badge */}
                  <span className={ROLE_BADGE[user.role] ?? ROLE_BADGE.user}>
                    {user.role}
                  </span>

                  {/* Reset password button */}
                  <button
                    onClick={() =>
                      setExpandedResetId((prev) => (prev === user.id ? null : user.id))
                    }
                    title="Reset password"
                    className={`p-1.5 rounded-lg transition-colors ${
                      isExpanded
                        ? "text-indigo-400 bg-indigo-500/10"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => !cannotDelete && handleDelete(user.id)}
                    disabled={cannotDelete || deletingIds.has(user.id)}
                    title={deleteTitle}
                    className={`p-1.5 rounded-lg transition-colors ${
                      cannotDelete
                        ? "text-slate-600 cursor-not-allowed opacity-40"
                        : "text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                    }`}
                  >
                    {deletingIds.has(user.id) ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Inline reset password form */}
                {isExpanded && (
                  <div className="flex items-center gap-2 pt-1 pl-11">
                    <div className="relative flex-1">
                      <input
                        type={showResetPassword[user.id] ? "text" : "password"}
                        value={resetPasswords[user.id] ?? ""}
                        onChange={(e) =>
                          setResetPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))
                        }
                        placeholder="New password (min. 8 chars)"
                        className="input-base w-full text-sm pr-9"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowResetPassword((prev) => ({ ...prev, [user.id]: !prev[user.id] }))
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        tabIndex={-1}
                      >
                        {showResetPassword[user.id] ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleResetPassword(user.id)}
                      disabled={resettingIds.has(user.id) || !resetPasswords[user.id]}
                      className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      {resettingIds.has(user.id) ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setExpandedResetId(null)}
                      className="btn-ghost text-xs px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Feedback */}
      {error && (
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {success}
        </p>
      )}

      {/* Create user form */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Add user</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            className="input-base w-full"
            required
          />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email address"
            className="input-base w-full"
            required
          />
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password (min. 8 characters)"
              className="input-base w-full pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              tabIndex={-1}
            >
              {showNewPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "user" | "admin" | "demo")}
            className="input-base w-full"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="demo">Demo</option>
          </select>
          <button
            type="submit"
            disabled={isCreating || !newName.trim() || !newEmail.trim() || !newPassword}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {isCreating ? "Creating…" : "Create user"}
          </button>
        </form>
      </div>
    </div>
  );
}
