import { getCategories, getSessionRole, getUsers } from "@/lib/actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SettingsTabs } from "@/components/SettingsTabs";

export const metadata = { title: "Settings — Expenses" };

export default async function SettingsPage() {
  const [categories, role, session] = await Promise.all([
    getCategories(),
    getSessionRole(),
    getServerSession(authOptions),
  ]);

  // Sequential — getUsers() throws Forbidden for non-admins, so only call once role is confirmed.
  const users = role === "admin" ? await getUsers() : [];
  const currentUserId = session?.user?.userId ?? "";

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm">Manage your categories and account.</p>
      </div>

      <SettingsTabs
        role={role}
        currentUserId={currentUserId}
        categories={categories}
        users={users}
      />
    </div>
  );
}
