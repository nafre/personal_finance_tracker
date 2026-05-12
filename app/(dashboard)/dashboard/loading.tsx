export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      {/* Month selector row */}
      <div className="flex items-center justify-between">
        <div className="animate-pulse bg-slate-800 rounded-xl h-8 w-48" />
      </div>

      {/* Quick-add input — desktop only */}
      <div className="animate-pulse bg-slate-800 rounded-xl h-12 hidden md:block" />

      {/* Recurring card */}
      <div className="animate-pulse bg-slate-800 rounded-xl h-14" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse bg-slate-800 rounded-2xl h-24" />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="animate-pulse bg-slate-800 rounded-xl h-48" />
        <div className="animate-pulse bg-slate-800 rounded-xl h-48" />
      </div>

      {/* Budget card */}
      <div className="animate-pulse bg-slate-800 rounded-xl h-20" />

      {/* Recent transactions */}
      <div className="space-y-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse bg-slate-800 rounded-xl h-12" />
        ))}
      </div>
    </div>
  );
}
