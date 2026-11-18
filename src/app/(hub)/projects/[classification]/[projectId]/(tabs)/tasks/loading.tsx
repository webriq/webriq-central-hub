export default function ProjectTasksSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 animate-pulse">
      {/* View dropdown toolbar */}
      <div className="flex items-center justify-end px-8 py-2 bg-white border-b border-slate-200 shrink-0">
        <div className="h-7 w-20 bg-slate-100 rounded-lg" />
      </div>

      {/* List content */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 px-8 py-5">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-6 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="h-3 w-12 bg-slate-200 rounded flex-1" />
            <div className="h-3 w-12 bg-slate-200 rounded w-[140px]" />
            <div className="h-3 w-14 bg-slate-200 rounded w-[120px]" />
            <div className="h-3 w-8 bg-slate-200 rounded w-[110px]" />
            <div className="h-3 w-16 bg-slate-200 rounded w-[100px]" />
          </div>

          {/* Tasklist groups */}
          {[4, 3, 5].map((count, gi) => (
            <div key={gi}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/80 border-b border-slate-100">
                <div className="h-3.5 w-3.5 bg-slate-200 rounded" />
                <div className="h-3 w-28 bg-slate-200 rounded" />
                <div className="h-3 w-6 bg-slate-100 rounded" />
              </div>

              {/* Task rows */}
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_140px_120px_110px_100px] items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0"
                >
                  <div className="h-3.5 bg-slate-100 rounded" style={{ width: `${55 + (i * 13 + gi * 7) % 35}%` }} />
                  <div className="h-5 w-20 bg-slate-100 rounded-full" />
                  <div className="h-3.5 w-14 bg-slate-100 rounded" />
                  <div className="h-3.5 w-16 bg-slate-100 rounded" />
                  <div className="flex items-center gap-1">
                    <div className="h-6 w-6 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
