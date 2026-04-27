import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950 px-4">
      <div className="text-center space-y-4">
        <p className="text-4xl font-bold text-slate-100">404</p>
        <p className="text-slate-400">Page not found.</p>
        <Link href="/dashboard" className="btn-primary inline-block px-4 py-2">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
