export default function ProjectMilestonesSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 animate-pulse">
      {/* Milestone table */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 px-8 py-5">
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-100 rounded" />
          </div>
          <div className="flex items-center gap-6 px-4 py-2 border-b border-slate-100">
            <div className="h-3 w-10 bg-slate-200 rounded" style={{ width: "38%" }} />
            <div className="h-3 w-10 bg-slate-200 rounded" style={{ width: "18%" }} />
            <div className="h-3 w-10 bg-slate-200 rounded" style={{ width: "20%" }} />
            <div className="h-3 w-10 bg-slate-200 rounded" style={{ width: "14%" }} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-2.5 border-b border-slate-50 last:border-0">
              <div className="h-3.5 bg-slate-100 rounded" style={{ width: `${30 + (i * 9) % 20}%` }} />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
              <div className="h-3.5 w-14 bg-slate-100 rounded" />
              <div className="h-3.5 w-10 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
