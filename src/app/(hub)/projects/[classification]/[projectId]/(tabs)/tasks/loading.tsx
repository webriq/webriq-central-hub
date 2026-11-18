// Task 487 — matches the redesigned Tasks tab: toolbar, progress strip, phase band › list header › rows.
const ROW_WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-[45%]"] as const;

export default function ProjectTasksSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 animate-pulse motion-reduce:animate-none bg-[#F4F6FB]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-8 py-2.5 bg-white border-b border-[#E2E7F2] shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7.5 w-56 rounded-[10px] bg-[#EDF0F7]" />
          {["w-16", "w-18", "w-20", "w-24"].map((w) => <div key={w} className={`h-7.5 rounded-full bg-[#EDF0F7] ${w}`} />)}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7.5 w-24 rounded-full bg-[#EDF0F7]" />
          <div className="h-8 w-28 rounded-full bg-[#FFEFE3]" />
        </div>
      </div>

      {/* Progress strip */}
      <div className="mx-8 mt-5 flex items-center gap-6 rounded-[14px] border border-[#E2E7F2] bg-white px-5 py-4">
        <div className="h-5 w-32 rounded bg-[#EDF0F7]" />
        <div className="h-1.5 flex-1 rounded-full bg-[#EDF0F7]" />
        <div className="h-4 w-40 rounded bg-[#EDF0F7]" />
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden px-8 pt-4 pb-5">
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
          <div className="flex items-center gap-6 px-4 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
            <div className="h-2.5 flex-1 max-w-24 rounded bg-[#E2E7F2]" />
            <div className="ml-auto h-2.5 w-16 rounded bg-[#E2E7F2]" />
            <div className="h-2.5 w-20 rounded bg-[#E2E7F2]" />
            <div className="h-2.5 w-16 rounded bg-[#E2E7F2]" />
            <div className="h-2.5 w-14 rounded bg-[#E2E7F2]" />
          </div>
          {[4, 3].map((count, pi) => (
            <div key={pi}>
              <div className="flex items-center gap-3 px-4 py-3 bg-[#F4F6FB] border-b border-[#E2E7F2]">
                <div className="size-6 rounded-[7px] bg-[#E2E7F2]" />
                <div className="h-4 w-14 rounded-[5px] bg-[#E2E7F2]" />
                <div className="h-3.5 w-44 rounded bg-[#E2E7F2]" />
                <div className="ml-auto h-1.5 w-16 rounded-full bg-[#E2E7F2]" />
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-[#FAFBFE] border-b border-[#E2E7F2]">
                <div className="h-5 w-0.75 rounded-full bg-[#E2E7F2]" />
                <div className="h-3 w-28 rounded bg-[#E2E7F2]" />
              </div>
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="grid grid-cols-[32px_1fr_148px_156px_108px_80px] items-center gap-3 px-4 py-3 border-b border-[#EDF0F7]">
                  <div className="size-3.5 rounded bg-[#EDF0F7]" />
                  <div className={`h-3.5 rounded bg-[#EDF0F7] ${ROW_WIDTHS[(i + pi * 2) % ROW_WIDTHS.length]}`} />
                  <div className="h-5 w-24 rounded-full bg-[#EDF0F7]" />
                  <div className="size-6 rounded-full bg-[#EDF0F7]" />
                  <div className="h-3 w-12 rounded bg-[#EDF0F7]" />
                  <div className="h-3 w-12 rounded bg-[#EDF0F7]" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
