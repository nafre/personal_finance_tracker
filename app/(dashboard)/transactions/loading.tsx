export default function TransactionsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-slate-800 rounded-xl w-1/3" />
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
