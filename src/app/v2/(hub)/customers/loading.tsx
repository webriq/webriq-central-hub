function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? ""}`} />;
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_1fr_90px_140px_100px] items-center gap-3 px-5 py-3 border-b border-slate-50 last:border-0">
      <div className="flex flex-col gap-1.5">
        <Bone className="h-4 w-32" />
        <Bone className="h-3 w-20" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Bone className="h-4 w-24" />
        <Bone className="h-3 w-28" />
      </div>
      <Bone className="h-5 w-16 rounded-full" />
      <Bone className="h-3 w-full rounded-full" />
      <div className="flex justify-end">
        <Bone className="h-6 w-12 rounded-lg" />
      </div>
    </div>
  );
}

export default function CustomersLoading() {
  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-50">
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <Bone className="h-7 w-32" />
              <Bone className="h-4 w-24" />
            </div>
            <Bone className="h-9 w-32 rounded-lg" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <Bone className="h-9 flex-1 max-w-md rounded-lg" />
            <Bone className="h-9 w-64 rounded-lg" />
            <div className="flex-1" />
            <Bone className="h-8 w-56 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-[1400px] mx-auto px-8 py-5">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_90px_140px_100px] gap-3 px-5 py-2.5 border-b border-slate-100 bg-slate-50">
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-14" />
            <Bone className="h-3 w-12" />
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
