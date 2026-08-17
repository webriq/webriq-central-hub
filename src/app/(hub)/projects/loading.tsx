function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? ""}`} />;
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <Bone className="h-5 w-40" />
          <Bone className="h-3.5 w-28" />
        </div>
        <Bone className="h-5 w-16 rounded-full" />
      </div>
      <Bone className="h-5 w-24 rounded-md" />
      <div className="flex gap-1">
        <Bone className="h-4 w-16 rounded-full" />
        <Bone className="h-4 w-20 rounded-full" />
      </div>
      <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bone className="h-7 w-7 rounded-full" />
          <Bone className="h-3.5 w-20" />
        </div>
        <Bone className="h-9 w-9 rounded-full" />
      </div>
    </div>
  );
}

export default function ProjectsLoading() {
  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-2">
          <Bone className="h-7 w-32" />
          <Bone className="h-4 w-24" />
        </div>
        <Bone className="h-9 w-28 rounded-lg" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <Bone className="h-9 flex-1 max-w-md rounded-lg" />
        <Bone className="h-9 w-60 rounded-lg" />
        <Bone className="h-9 w-16 rounded-lg" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-2">
          <Bone className="h-4 w-10" />
          <Bone className="h-7 w-8 rounded-md" />
          <Bone className="h-7 w-8 rounded-md" />
          <Bone className="h-7 w-8 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Bone className="h-4 w-24" />
          <Bone className="h-7 w-7 rounded-md" />
          <Bone className="h-7 w-7 rounded-md" />
        </div>
      </div>
    </div>
  );
}
