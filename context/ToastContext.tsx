"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  leaving?: boolean;
}

interface ToastContextValue {
  /** Show a transient toast. Defaults to type "info"; auto-dismisses after 5s. */
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const AUTO_DISMISS_MS = 5000;
const EXIT_MS = 200;
const MAX_VISIBLE = 3;

const TYPE_STYLES: Record<
  ToastType,
  { Icon: typeof Info; iconCls: string; borderCls: string }
> = {
  success: { Icon: CheckCircle2, iconCls: "text-emerald-400", borderCls: "border-emerald-500/30" },
  error: { Icon: AlertTriangle, iconCls: "text-rose-400", borderCls: "border-rose-500/30" },
  info: { Icon: Info, iconCls: "text-indigo-400", borderCls: "border-indigo-500/30" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    // Two-phase: mark as leaving so the exit animation plays, then remove.
    setToasts((prev) =>
      prev.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t))
    );
    timersRef.current.set(
      id,
      setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, EXIT_MS)
    );
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, type }]);
      timersRef.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Sits above the mobile bottom nav (like .fab); regular bottom margin on desktop */}
      <div
        aria-live="polite"
        className="fixed inset-x-0 bottom-[calc(80px+var(--safe-bottom))] md:bottom-6 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {toasts.map(({ id, message, type, leaving }) => {
          const { Icon, iconCls, borderCls } = TYPE_STYLES[type];
          return (
            <div
              key={id}
              role={type === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-center gap-2.5 max-w-sm w-full sm:w-auto",
                "bg-slate-800 border rounded-xl shadow-lg px-3.5 py-2.5",
                leaving ? "animate-fade-out-down" : "animate-slide-up",
                borderCls
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", iconCls)} aria-hidden="true" />
              <span className="text-sm text-slate-200 flex-1 min-w-0">{message}</span>
              <button
                onClick={() => dismiss(id)}
                className="p-1.5 -m-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors shrink-0 [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11 flex items-center justify-center"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
