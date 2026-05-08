import { getCategories, getSessionRole } from "@/lib/actions";
import { CategoryManager } from "@/components/CategoryManager";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const metadata = { title: "Settings — Expenses" };

export default async function SettingsPage() {
  const [categories, role] = await Promise.all([getCategories(), getSessionRole()]);

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm">
          Manage your expense categories and account.
        </p>
      </div>

      <section className="space-y-4" data-testid="categories-section">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Categories
        </h2>
        <CategoryManager initialCategories={categories} />
      </section>

      <section className="space-y-4" data-testid="account-section">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Account
        </h2>
        {role === "demo" ? (
          <div className="card">
            <p className="text-sm text-slate-400">Password changes are disabled for demo accounts.</p>
          </div>
        ) : (
          <ChangePasswordForm />
        )}
      </section>
    </div>
  );
}
