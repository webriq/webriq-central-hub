function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#EDF0F7] ${className ?? ""}`} />;
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-[1.3fr_1.2fr_1.4fr_120px] items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0">
      <div className="flex flex-col gap-1.5">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-24" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Bone className="h-4 w-28" />
        <Bone className="h-3 w-36" />
      </div>
      <div className="flex gap-1.5">
        <Bone className="h-5 w-20 rounded-full" />
        <Bone className="h-5 w-16 rounded-full" />
      </div>
      <Bone className="h-3 w-16 ml-auto" />
    </div>
  );
}

export default function StackShiftOrdersLoading() {
  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="flex flex-col gap-2 mb-4">
            <Bone className="h-7 w-48" />
            <Bone className="h-4 w-80" />
          </div>
          <div className="flex items-center gap-3">
            <Bone className="h-9 flex-1 max-w-md rounded-[10px]" />
            <Bone className="h-9 w-72 rounded-full" />
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-5">
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
          <div className="grid grid-cols-[1.3fr_1.2fr_1.4fr_120px] gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-14" />
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-14 ml-auto" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
