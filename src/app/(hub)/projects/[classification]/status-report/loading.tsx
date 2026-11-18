import { HeaderSkeleton, ToolbarSkeleton } from "../../_v2-listing/_list-skeleton";

// Mirrors _status-report-client.tsx's layout; the rows match StatusReportTable's own loading state
// so the handoff from this route fallback to the client fetch doesn't jump.
export default function StatusReportLoading() {
  return (
    <div>
      <div className="bg-[#F4F6FB]">
        <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
          {/* Heights pinned to the real header (back link 18px, title block 55px + mb-4, toolbar ~40px). */}
          <div className="h-4.5 w-32 mb-2 rounded-md animate-pulse motion-reduce:animate-none bg-[#EDF0F7]" />
          <div className="min-h-17.75">
            <HeaderSkeleton />
          </div>
          <div className="min-h-10">
            <ToolbarSkeleton />
          </div>
        </div>
      </div>
      <div className="max-w-350 mx-auto px-8 py-5 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-[14px] animate-pulse motion-reduce:animate-none bg-[#EDF0F7]" />
        ))}
      </div>
    </div>
  );
}
