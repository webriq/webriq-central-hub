export default function ProjectIssuesSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 animate-pulse">
      {/* View dropdown toolbar */}
      <div className="flex items-center justify-end px-8 py-2 bg-white border-b border-slate-200 shrink-0">
        <div className="h-7 w-20 bg-slate-100 rounded-lg" />
      </div>

      {/* List content — Issue Name / Status / Assignee / Due / Severity */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 px-8 py-5">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-6 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="h-3 w-20 bg-slate-200 rounded flex-1" />
            <div className="h-3 w-12 bg-slate-200 rounded w-[120px]" />
            <div className="h-3 w-14 bg-slate-200 rounded w-[120px]" />
            <div className="h-3 w-8 bg-slate-200 rounded w-[100px]" />
            <div className="h-3 w-14 bg-slate-200 rounded w-[100px]" />
          </div>

          {/* Issue rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_120px_120px_100px_100px] items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0"
            >
              <div className="h-3.5 bg-slate-100 rounded" style={{ width: `${50 + (i * 11) % 40}%` }} />
              <div className="h-5 w-20 bg-slate-100 rounded-full" />
              <div className="h-6 w-6 bg-slate-100 rounded-full" />
              <div className="h-3.5 w-16 bg-slate-100 rounded" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
