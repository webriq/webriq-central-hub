import { cn } from "@/lib/utils";
import ProjectTabContentSkeleton from "./(tabs)/loading";

// Task 484 — opening a project. This boundary sits below [projectId]/layout (slug check, 2 small
// queries) and above (tabs)/layout (getProjectDetailData's 9 queries), so the URL commits and this
// shows before the heavy work. Header mirrors _shared/_project-detail-header.tsx.
// Also the fallback for task/ticket/milestone detail pages and onboarding-workspace (D2).
export default function ProjectSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-8 pt-6 pb-4 bg-white shrink-0 animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-24 bg-slate-200 rounded mb-3" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="h-7 w-64 bg-slate-200 rounded" />
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
            <div className="h-4 w-44 bg-slate-100 rounded" />
            <div className="h-6 w-32 bg-slate-100 rounded-full" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-9 bg-slate-100 rounded-full" />
            <div className="h-9 w-9 bg-slate-100 rounded-full" />
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {["w-16", "w-16", "w-12", "w-14", "w-20", "w-10", "w-14"].map((w, i) => (
            <div key={i} className={cn("h-7 rounded-full", w, i === 1 ? "bg-white" : "bg-slate-200")} />
          ))}
        </div>
      </div>
      <ProjectTabContentSkeleton />
    </div>
  );
}
