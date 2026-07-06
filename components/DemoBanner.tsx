import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DemoBanner() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "demo") return null;

  return (
    <div
      role="status"
      className="w-full mb-4 px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-amber-200 rounded-xl border border-amber-600/40 bg-linear-to-r from-amber-950/95 via-amber-900/95 to-amber-950/95"
    >
      <span aria-hidden="true">👀</span>
      <span>
        You are viewing a <strong>demo account</strong> — data resets periodically and password changes are disabled.
      </span>
    </div>
  );
}
