"use client";

import { useState } from "react";
import { addCategory, deleteCategory } from "@/lib/actions";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#6366f1");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsAdding(true);
    setError("");
    try {
      const created = await addCategory({ name: name.trim(), icon, color });
      setCategories((prev) => [...prev, created]);
      setName("");
      setIcon("📦");
      setColor("#6366f1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    try {
      await deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  }

  const defaults = categories.filter((c) => c.isDefault);
  const custom = categories.filter((c) => !c.isDefault);

  return (
    <div className="space-y-6">
      {/* Category list */}
      <div data-testid="category-list" className="card divide-y divide-slate-700/50">
        {categories.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm">No categories yet.</p>
        ) : (
          <>
            {defaults.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Default</p>
              </div>
            )}
            {defaults.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onDelete={handleDelete} deletingId={deletingId} />
            ))}
            {custom.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom</p>
              </div>
            )}
            {custom.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onDelete={handleDelete} deletingId={deletingId} />
            ))}
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Add form */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Add category</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              onBlur={(e) => { if (!e.target.value.trim()) setIcon("📦"); }}
              className="input-base w-14 text-center text-lg"
              maxLength={4}
              aria-label="Icon (emoji)"
              title="Icon (emoji)"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              className="input-base flex-1"
              maxLength={50}
              required
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 shrink-0">Color:</span>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : "none",
                  outlineOffset: "2px",
                }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0 p-0 overflow-hidden"
              title="Custom color"
            />
            <div
              className="w-5 h-5 rounded-full border border-slate-600 shrink-0"
              style={{ backgroundColor: color }}
            />
          </div>

          <button
            type="submit"
            disabled={isAdding || !name.trim()}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {isAdding ? "Adding…" : "Add category"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CategoryRow({
  cat,
  onDelete,
  deletingId,
}: {
  cat: Category;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
        style={{ backgroundColor: `${cat.color}22`, border: `1.5px solid ${cat.color}55` }}
      >
        {cat.icon}
      </div>
      <span className="flex-1 text-sm font-medium text-slate-200">{cat.name}</span>
      {cat.isDefault ? (
        <span className="text-xs text-slate-500 px-2 py-0.5 rounded-md bg-slate-800">Default</span>
      ) : (
        <button
          onClick={() => onDelete(cat.id)}
          disabled={deletingId === cat.id}
          className="text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-40 p-1 rounded"
          aria-label={`Delete ${cat.name}`}
        >
          {deletingId === cat.id ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
