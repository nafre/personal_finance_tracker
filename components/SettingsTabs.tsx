"use client";

import { useState } from "react";
import { CategoryManager } from "@/components/CategoryManager";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { UserManager, type UserRecord } from "@/components/UserManager";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

interface SettingsTabsProps {
  role: string;
  currentUserId: string;
  categories: Category[];
  users: UserRecord[];
}

export function SettingsTabs({ role, currentUserId, categories, users }: SettingsTabsProps) {
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState(isAdmin ? "users" : "categories");

  const tabs = [
    ...(isAdmin ? [{ id: "users", label: "Users" }] : []),
    { id: "categories", label: "Categories" },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="space-y-6">
      <div role="tablist" className="flex gap-1 border-b border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && isAdmin && (
        <UserManager initialUsers={users} currentUserId={currentUserId} />
      )}

      {activeTab === "categories" && (
        <CategoryManager initialCategories={categories} />
      )}

      {activeTab === "account" && (
        role === "demo" ? (
          <div className="card">
            <p className="text-sm text-slate-400">
              Password changes are disabled for demo accounts.
            </p>
          </div>
        ) : (
          <ChangePasswordForm />
        )
      )}
    </div>
  );
}
