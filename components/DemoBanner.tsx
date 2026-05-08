import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DemoBanner() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "demo") return null;

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-amber-200"
      style={{
        background:
          "linear-gradient(90deg, rgba(120,53,15,0.95), rgba(146,64,14,0.95), rgba(120,53,15,0.95))",
        borderBottom: "1px solid rgba(217,119,6,0.4)",
      }}
    >
      <span aria-hidden="true">👀</span>
      <span>
        You are viewing a <strong>demo account</strong> — data resets periodically and password changes are disabled.
      </span>
    </div>
  );
}
