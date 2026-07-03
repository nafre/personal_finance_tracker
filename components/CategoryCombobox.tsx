"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "@/types";

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  categories: CategoryOption[];
  placeholder?: string;
}

export function CategoryCombobox({
  value,
  onChange,
  categories,
  placeholder = "Category",
}: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(value.toLowerCase())
  );
  const hasExactMatch = categories.some(
    (c) => c.name.toLowerCase() === value.toLowerCase()
  );
  const showUseOption = value.trim() !== "" && !hasExactMatch;
  const options: (CategoryOption & { isUseOption?: boolean })[] = [
    ...filtered,
    ...(showUseOption ? [{ name: value.trim(), isUseOption: true }] : []),
  ];

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  function select(option: CategoryOption & { isUseOption?: boolean }) {
    onChange(option.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        select(options[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="input-base w-full text-base sm:text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={isOpen && options.length > 0}
        aria-controls="category-combobox-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          highlightedIndex >= 0 ? `category-option-${highlightedIndex}` : undefined
        }
      />
      {isOpen && options.length > 0 && (
        <ul
          id="category-combobox-listbox"
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-auto max-h-48 py-1"
        >
          {options.map((option, i) => (
            <li
              key={option.isUseOption ? `__use__:${option.name}` : option.name}
              id={`category-option-${i}`}
              role="option"
              aria-selected={highlightedIndex === i}
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer flex items-center gap-2",
                highlightedIndex === i
                  ? "bg-slate-700"
                  : "hover:bg-slate-700/50",
                option.isUseOption ? "text-slate-400 italic" : "text-slate-200"
              )}
            >
              {!option.isUseOption && option.icon && (
                <span className="shrink-0">{option.icon}</span>
              )}
              {option.isUseOption ? `Use "${option.name}"` : option.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
