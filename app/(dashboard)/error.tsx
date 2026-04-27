"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-slate-400">Something went wrong loading this page.</p>
      <button onClick={reset} className="btn-primary px-4 py-2">
        Try again
      </button>
    </div>
  );
}
