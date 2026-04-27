"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh flex items-center justify-center bg-slate-950 px-4">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Something went wrong.</p>
          <button onClick={reset} className="btn-primary px-4 py-2">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
