function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#EDF0F7] ${className ?? ""}`} />;
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-[84px_1fr_150px_140px_130px_120px_120px_112px] items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0">
      <Bone className="h-3 w-10" />
      <Bone className="h-4 w-40" />
      <Bone className="h-3 w-24" />
      <Bone className="h-3 w-20" />
      <Bone className="h-3 w-20" />
      <Bone className="h-3 w-16" />
      <Bone className="h-3 w-16" />
      <Bone className="h-5 w-16 rounded-[5px]" />
    </div>
  );
}

export default function DeskTicketsLoading() {
  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <Bone className="h-7 w-24" />
              <Bone className="h-4 w-20" />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <Bone className="h-9 flex-1 max-w-md rounded-[10px]" />
            <Bone className="h-9 w-80 rounded-full" />
            <div className="flex-1" />
            <Bone className="h-8 w-56 rounded-full" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-[1400px] mx-auto px-8 py-5">
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
          <div className="grid grid-cols-[84px_1fr_150px_140px_130px_120px_120px_112px] gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-14" />
            <Bone className="h-3 w-12" />
            <Bone className="h-3 w-12" />
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-14" />
            <Bone className="h-3 w-12" />
            <Bone className="h-3 w-10" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
