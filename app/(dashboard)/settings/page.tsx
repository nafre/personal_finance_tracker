import { getCategories } from "@/lib/actions";
import { CategoryManager } from "@/components/CategoryManager";

export const metadata = { title: "Settings — Expenses" };

export default async function SettingsPage() {
  const categories = await getCategories();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm">Manage your expense categories.</p>
      </div>
      <CategoryManager initialCategories={categories} />
    </div>
  );
}
