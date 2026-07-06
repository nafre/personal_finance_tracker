"use client";

import { useState } from "react";
import { addCategory, deleteCategory, addDefaultCategories, updateCategory } from "@/lib/actions";
import { Pencil, Trash2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#64748b", name: "Grey" },
];

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#6366f1");
  const [isAdding, setIsAdding] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", icon: "📦", color: "#6366f1" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);


  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditForm({ name: cat.name, icon: cat.icon, color: cat.color });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setIsSavingEdit(true);
    setError("");
    try {
      await updateCategory(editingId, { name: editForm.name.trim(), icon: editForm.icon, color: editForm.color });
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? { ...c, name: editForm.name.trim(), icon: editForm.icon, color: editForm.color }
            : c
        )
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleRestoreDefaults() {
    setIsRestoring(true);
    setError("");
    try {
      const added = await addDefaultCategories();
      if (added.length > 0) {
        const newCats = added.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          icon: c.icon,
          color: c.color,
          isDefault: true,
        }));
        setCategories((prev) => [...prev, ...newCats]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore defaults");
    } finally {
      setIsRestoring(false);
    }
  }

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
      {/* Missing defaults banner */}
      {defaults.length === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <p className="text-sm text-indigo-300">No default categories yet.</p>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            disabled={isRestoring}
            className="shrink-0 text-xs font-medium text-indigo-300 hover:text-indigo-100 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            {isRestoring ? "Adding…" : "Add default categories"}
          </button>
        </div>
      )}

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
              <CategoryRow
                key={cat.id}
                cat={cat}
                onDelete={handleDelete}
                deletingId={deletingId}
                isEditing={editingId === cat.id}
                editForm={editForm}
                setEditForm={setEditForm}
                isSavingEdit={isSavingEdit}
                onStartEdit={startEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={cancelEdit}
              />
            ))}
            {custom.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom</p>
              </div>
            )}
            {custom.map((cat) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                onDelete={handleDelete}
                deletingId={deletingId}
                isEditing={editingId === cat.id}
                editForm={editForm}
                setEditForm={setEditForm}
                isSavingEdit={isSavingEdit}
                onStartEdit={startEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={cancelEdit}
              />
            ))}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
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
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                style={{
                  backgroundColor: c.hex,
                  outline: color === c.hex ? `2px solid ${c.hex}` : "none",
                  outlineOffset: "2px",
                }}
                aria-label={`Select color: ${c.name}`}
                aria-pressed={color === c.hex}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0 p-0 overflow-hidden"
              title="Custom color"
              aria-label="Pick a custom color"
            />
            <div
              className="w-7 h-7 rounded-full border border-slate-600 shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
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
  isEditing,
  editForm,
  setEditForm,
  isSavingEdit,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  cat: Category;
  onDelete: (id: string) => void;
  deletingId: string | null;
  isEditing: boolean;
  editForm: { name: string; icon: string; color: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ name: string; icon: string; color: string }>>;
  isSavingEdit: boolean;
  onStartEdit: (cat: Category) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  if (isEditing) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={editForm.icon}
            onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
            onBlur={(e) => { if (!e.target.value.trim()) setEditForm((f) => ({ ...f, icon: "📦" })); }}
            className="input-base w-14 text-center text-lg"
            maxLength={4}
            aria-label="Icon"
          />
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            className="input-base flex-1"
            maxLength={50}
            autoFocus
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 shrink-0">Color:</span>
          {PRESET_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setEditForm((f) => ({ ...f, color: c.hex }))}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              style={{
                backgroundColor: c.hex,
                outline: editForm.color === c.hex ? `2px solid ${c.hex}` : "none",
                outlineOffset: "2px",
              }}
              aria-label={`Select color: ${c.name}`}
              aria-pressed={editForm.color === c.hex}
            />
          ))}
          <input
            type="color"
            value={editForm.color}
            onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
            className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0 p-0 overflow-hidden"
            title="Custom color"
            aria-label="Pick a custom color"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSaveEdit}
            disabled={isSavingEdit || !editForm.name.trim()}
            className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
          >
            {isSavingEdit ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancelEdit}
            disabled={isSavingEdit}
            className="btn-ghost text-xs px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => onStartEdit(cat)}
            className="text-slate-500 hover:text-indigo-400 transition-colors p-1.5 rounded-lg flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            aria-label={`Edit ${cat.name}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={() => onDelete(cat.id)}
            disabled={deletingId === cat.id}
            className="text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-40 p-1.5 rounded-lg flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
            aria-label={`Delete ${cat.name}`}
          >
            {deletingId === cat.id ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
