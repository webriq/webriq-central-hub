// Task 312 — initial-load skeleton for the Notes tab, shaped like the real board (capture bar
// + folder rail + note-card grid) so the layout doesn't visually jump once data arrives. Plain
// `animate-pulse` divs, matching this repo's existing skeleton convention (see
// `_project-detail-header.tsx:85`) rather than a new shadcn `Skeleton` primitive.
export function NotesLoadingSkeleton() {
  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-[#F4F6FB]">
      <div className="p-5">
        <div className="w-60 shrink-0 flex flex-col gap-1.5 pr-3 border-r border-[#E2E7F2]">
          <div className="h-9 rounded-[10px] bg-[#EDF0F7] animate-pulse" />
          <div className="h-9 rounded-[10px] bg-[#EDF0F7] animate-pulse mt-3" />
          <div className="h-9 rounded-[10px] bg-[#EDF0F7] animate-pulse" />
          <div className="h-9 rounded-[10px] bg-[#EDF0F7] animate-pulse" />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
        <div className="w-full max-w-xl mx-auto h-[52px] rounded-[14px] bg-[#EDF0F7] animate-pulse mb-6" />

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-[#E2E7F2] bg-white p-3.5 min-h-[140px] flex flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded-full bg-[#EDF0F7] animate-pulse" />
              <div className="h-3 w-full rounded-full bg-[#EDF0F7] animate-pulse" />
              <div className="h-3 w-5/6 rounded-full bg-[#EDF0F7] animate-pulse" />
              <div className="h-3 w-1/2 rounded-full bg-[#EDF0F7] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
