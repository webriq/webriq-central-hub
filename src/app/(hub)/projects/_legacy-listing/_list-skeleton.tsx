// Shared skeleton pieces — used by loading.tsx (first paint, route-level Suspense
// fallback) and by _projects-index.tsx's useTransition/isPending overlay (every
// subsequent search/filter/sort/pagination trigger, which loading.tsx alone never
// re-arms for — see task 263).

export function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className ?? ""}`} />;
}

export function CardSkeleton() {
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

export function CardSkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// Task 485 — mirrors _project-list-view.tsx's row card.
function RowSkeleton() {
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-[#EDF0F7] bg-white px-4 py-3">
      <div className="flex flex-col gap-1.5 flex-1 basis-48">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-28" />
      </div>
      <div className="shrink-0 md:order-last md:w-32 flex justify-end"><Bone className="h-5 w-20 rounded-full" /></div>
      <div className="basis-full h-0 md:hidden" />
      <div className="shrink-0 md:w-44"><Bone className="h-5 w-24 rounded-full" /></div>
      <div className="md:w-48"><Bone className="h-5 w-20 rounded-full" /></div>
      <div className="shrink-0 md:w-40"><Bone className="h-4 w-32" /></div>
      <div className="shrink-0 md:w-28 flex md:justify-end"><Bone className="h-6 w-16 rounded-full" /></div>
    </div>
  );
}

export function ListRowSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="flex items-center gap-3 mb-5">
      <Bone className="h-9 flex-1 max-w-md rounded-lg" />
      <Bone className="h-9 w-60 rounded-lg" />
      <Bone className="h-9 w-16 rounded-lg" />
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex flex-col gap-2">
        <Bone className="h-7 w-32" />
        <Bone className="h-4 w-24" />
      </div>
      <Bone className="h-9 w-28 rounded-lg" />
    </div>
  );
}

export function PaginationSkeleton() {
  return (
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
  );
}
