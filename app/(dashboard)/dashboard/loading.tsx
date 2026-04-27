export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-12 bg-slate-800 rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-800 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
