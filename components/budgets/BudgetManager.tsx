"use client";

import { useState, useEffect } from "react";
import { getBudgets, saveBudget, deleteBudget, getCategories, getUsedLabels } from "@/lib/actions";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useDialogBehavior } from "@/hooks/useDialogBehavior";
import { Trash2, X } from "lucide-react";
import type { Budget, BudgetType } from "@/types";

interface Category {
  id: string;
  name: string;
  icon: string;
}

interface BudgetManagerProps {
  onClose: () => void;
}

const TYPE_META: Record<BudgetType, { label: string; color: string; desc: string }> = {
  overall:  { label: "Overall",   color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/30",  desc: "Total monthly expenses" },
  category: { label: "Category",  color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", desc: "Single category spending" },
  excluded: { label: "Excluded",  color: "text-amber-400 bg-amber-500/15 border-amber-500/30",    desc: "All expenses minus categories" },
  label:    { label: "By Label",  color: "text-violet-400 bg-violet-500/15 border-violet-500/30",  desc: "Transactions by label tag" },
};

function TypeBadge({ type }: { type: BudgetType }) {
  const meta = TYPE_META[type];
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", meta.color)}>
      {meta.label}
    </span>
  );
}

const EMPTY_FORM = {
  formType: "category" as BudgetType,
  formName: "",
  formAmount: "",
  formCategory: "",
  formExcluded: [] as string[],
  formLabels: [] as string[],
  editingId: null as string | null,
};

export function BudgetManager({ onClose }: BudgetManagerProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formType, setFormType] = useState<BudgetType>(EMPTY_FORM.formType);
  const [formName, setFormName] = useState(EMPTY_FORM.formName);
  const [formAmount, setFormAmount] = useState(EMPTY_FORM.formAmount);
  const [formCategory, setFormCategory] = useState(EMPTY_FORM.formCategory);
  const [formExcluded, setFormExcluded] = useState<string[]>(EMPTY_FORM.formExcluded);
  const [formLabels, setFormLabels] = useState<string[]>(EMPTY_FORM.formLabels);
  const [editingId, setEditingId] = useState<string | null>(EMPTY_FORM.editingId);
  const dialogRef = useDialogBehavior(true, onClose);

  useEffect(() => {
    Promise.all([getBudgets(), getCategories(), getUsedLabels()])
      .then(([b, c, l]) => {
        setBudgets(b as Budget[]);
        setCategories(c as Category[]);
        setAvailableLabels(l);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function resetForm() {
    setFormType("category");
    setFormName("");
    setFormAmount("");
    setFormCategory("");
    setFormExcluded([]);
    setFormLabels([]);
    setEditingId(null);
    setError(null);
  }

  function startEdit(b: Budget) {
    setFormType(b.budgetType);
    setFormName(b.name);
    setFormAmount(String(b.amount));
    setFormCategory(b.category ?? "");
    setFormExcluded(b.excludedCategories);
    setFormLabels(b.labels);
    setEditingId(b.id);
    setError(null);
  }

  function handleTypeChange(t: BudgetType) {
    setFormType(t);
    setFormName(t === "overall" ? "Overall" : "");
    setFormCategory("");
    setFormExcluded([]);
    setFormLabels([]);
    setError(null);
  }

  function handleCategorySelect(name: string) {
    setFormCategory(name);
    if (formType === "category" && !editingId) setFormName(name);
  }

  async function handleSave() {
    const parsed = parseFloat(formAmount);
    if (!parsed || parsed <= 0) { setError("Enter a valid amount."); return; }
    if (formType === "category" && !formCategory) { setError("Select a category."); return; }
    if (formType === "excluded" && formExcluded.length === 0) { setError("Exclude at least one category."); return; }
    if (formType === "label" && formLabels.length === 0) { setError("Select at least one label."); return; }
    if (!formName.trim()) { setError("Enter a budget name."); return; }

    setIsSaving(true);
    setError(null);
    try {
      await saveBudget(
        {
          name: formName.trim(),
          amount: parsed,
          budgetType: formType,
          category: formType === "category" ? formCategory : null,
          excludedCategories: formType === "excluded" ? formExcluded : [],
          labels: formType === "label" ? formLabels : [],
        },
        editingId ?? undefined
      );
      const updated = await getBudgets();
      setBudgets(updated as Budget[]);
      resetForm();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("Unique") || msg.includes("unique")
        ? "A budget with this name already exists."
        : msg);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteBudget(id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    if (editingId === id) resetForm();
  }

  const usedCategoryNames = new Set(
    budgets.filter((b) => b.budgetType === "category").map((b) => b.category ?? "")
  );
  const hasOverall = budgets.some((b) => b.budgetType === "overall");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-manager-title"
        className="card w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-b-none sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-indigo-500 opacity-60" />
            <h2 id="budget-manager-title" className="text-sm font-semibold text-slate-200">Manage Budgets</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close budget manager"
            className="text-slate-500 hover:text-slate-300 transition-colors p-2 -m-1 flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">

          {/* Existing budgets */}
          {isLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
          ) : budgets.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No budgets set yet.</p>
          ) : (
            <div className="space-y-1">
              {budgets.map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  aria-label={editingId === b.id ? `Stop editing ${b.name}` : `Edit budget ${b.name}`}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus:outline-none",
                    editingId === b.id
                      ? "bg-slate-700/60 ring-1 ring-indigo-500/40"
                      : "hover:bg-slate-700/40 cursor-pointer"
                  )}
                  onClick={() => editingId === b.id ? resetForm() : startEdit(b)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (editingId === b.id) resetForm();
                      else startEdit(b);
                    }
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TypeBadge type={b.budgetType} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{b.name}</p>
                      {b.budgetType === "excluded" && b.excludedCategories.length > 0 && (
                        <p className="text-[10px] text-slate-500 truncate">
                          Excl: {b.excludedCategories.join(", ")}
                        </p>
                      )}
                      {b.budgetType === "label" && b.labels.length > 0 && (
                        <p className="text-[10px] text-slate-500 truncate">
                          {b.labels.map((l) => `#${l}`).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-slate-400 tabular-nums">{formatCurrency(b.amount)}/mo</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                      className="text-rose-400 hover:text-rose-300 transition-colors p-2 -m-1 flex items-center justify-center [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11"
                      title="Delete"
                      aria-label={`Delete budget ${b.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-700/50" />

          {/* Add / Edit form */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {editingId ? "Edit Budget" : "Add Budget"}
              {editingId && (
                <button onClick={resetForm} className="ml-3 text-indigo-400 normal-case font-normal hover:text-indigo-300">
                  ← New
                </button>
              )}
            </p>

            {/* Type picker */}
            {!editingId && (
              <div className="flex gap-1.5 flex-wrap">
                {(["overall", "category", "excluded", "label"] as BudgetType[]).map((t) => {
                  const meta = TYPE_META[t];
                  const disabled = t === "overall" && hasOverall;
                  return (
                    <button
                      key={t}
                      onClick={() => !disabled && handleTypeChange(t)}
                      title={disabled ? "Overall budget already exists" : meta.desc}
                      aria-pressed={formType === t}
                      className={cn(
                        "text-xs px-3 py-2 rounded-full border transition-all",
                        formType === t
                          ? meta.color + " font-semibold"
                          : "text-slate-400 border-slate-600 hover:border-slate-500",
                        disabled && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
            {editingId && <TypeBadge type={formType} />}

            {/* Overall: no extra fields needed */}

            {/* Category picker */}
            {formType === "category" && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => handleCategorySelect(e.target.value)}
                  className="input-base w-full text-base sm:text-sm"
                >
                  <option value="">Select category…</option>
                  {categories
                    .filter((c) => !usedCategoryNames.has(c.name) || c.name === formCategory)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Excluded categories multi-select */}
            {formType === "excluded" && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Exclude from total</label>
                <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-800/60 rounded-lg border border-slate-700 min-h-[36px]">
                  {formExcluded.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full"
                    >
                      {cat}
                      <button
                        onClick={() => setFormExcluded((prev) => prev.filter((c) => c !== cat))}
                        className="hover:text-amber-100 p-1 -m-1"
                        aria-label={`Remove ${cat}`}
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setFormExcluded((prev) => [...prev, e.target.value]);
                    }}
                    className="text-xs bg-transparent text-slate-400 focus:outline-none cursor-pointer"
                  >
                    <option value="">+ Add category</option>
                    {categories
                      .filter((c) => !formExcluded.includes(c.name))
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Budget tracks all expenses <em>except</em> the selected categories
                </p>
              </div>
            )}

            {/* Label multi-select */}
            {formType === "label" && (
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Match transactions tagged</label>
                <div className="flex flex-wrap gap-1.5 items-center p-2 bg-slate-800/60 rounded-lg border border-slate-700 min-h-[36px]">
                  {formLabels.map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-1 text-xs bg-violet-500/15 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full"
                    >
                      #{lbl}
                      <button
                        onClick={() => setFormLabels((prev) => prev.filter((l) => l !== lbl))}
                        className="hover:text-violet-100 p-1 -m-1"
                        aria-label={`Remove label ${lbl}`}
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {availableLabels.filter((l) => !formLabels.includes(l)).length > 0 ? (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setFormLabels((prev) => [...prev, e.target.value]);
                      }}
                      className="text-xs bg-transparent text-slate-400 focus:outline-none cursor-pointer"
                    >
                      <option value="">+ Add label</option>
                      {availableLabels
                        .filter((l) => !formLabels.includes(l))
                        .map((l) => (
                          <option key={l} value={l}>
                            #{l}
                          </option>
                        ))}
                    </select>
                  ) : availableLabels.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No labels used yet</span>
                  ) : null}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Tracks expenses from any transaction tagged with these labels (OR match)
                </p>
              </div>
            )}

            {/* Name field */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Budget name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={
                  formType === "overall"
                    ? "Overall"
                    : formType === "category"
                    ? "e.g. Food"
                    : formType === "excluded"
                    ? "e.g. Discretionary"
                    : "e.g. Work Expenses"
                }
                readOnly={formType === "overall"}
                className={cn(
                  "input-base w-full text-base sm:text-sm",
                  formType === "overall" && "opacity-50 cursor-default"
                )}
              />
            </div>

            {/* Amount field */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Monthly limit (RM)</label>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="input-base w-full text-base sm:text-sm tabular-nums"
              />
            </div>

            {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}

            <div className="flex gap-2">
              {editingId && (
                <button onClick={resetForm} className="btn-ghost flex-1 text-sm border border-slate-700">
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || !formAmount}
                className="btn-primary flex-1 text-sm"
              >
                {isSaving ? "Saving…" : editingId ? "Update Budget" : "Save Budget"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
