// Task 484 — tab-switch fallback. Sits under (tabs)/layout, so the real header + tab strip stay;
// only the content area is a skeleton. Tasks/Tickets/Milestones override it with their own.
export default function ProjectTabContentSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 px-8 py-5 animate-pulse motion-reduce:animate-none">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="h-5 w-48 bg-slate-200 rounded" />
        <div className="h-8 w-28 bg-slate-200 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
