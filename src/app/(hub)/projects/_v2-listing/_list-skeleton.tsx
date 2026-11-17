// Shared skeleton pieces — used by loading.tsx (first paint, route-level Suspense fallback) and
// by _onboarding-list.tsx's useTransition/isPending overlay (every subsequent search/filter/
// sort/pagination trigger, which loading.tsx alone never re-arms for — see task 263).

function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#EDF0F7] ${className ?? ""}`} />;
}

function CardSkeleton() {
  return (
    <div className="h-full flex flex-col rounded-[14px] border border-[#EDF0F7] bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex flex-col gap-1.5 flex-1">
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-24" />
        </div>
        <Bone className="h-5 w-16 rounded-full" />
      </div>
      <Bone className="h-1.5 w-full rounded-full mb-1.5" />
      <Bone className="h-3 w-28 mb-3" />
      <div className="mt-auto pt-2.5 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
        <Bone className="h-5 w-20 rounded-full" />
        <Bone className="h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// Task 480 — List view counterpart of CardSkeleton, mirroring _project-row.tsx's layout.
function RowSkeleton() {
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-[#EDF0F7] bg-white px-4 py-3">
      <div className="flex flex-col gap-1.5 flex-1 basis-48">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-28" />
      </div>
      <div className="shrink-0 md:order-last md:w-24 md:flex md:justify-end"><Bone className="h-5 w-20 rounded-full" /></div>
      <div className="basis-full h-0 md:hidden" />
      <div className="shrink-0 md:w-52"><Bone className="h-5 w-24 rounded-full" /></div>
      <div className="flex-1 md:flex-none md:w-72 flex items-center gap-2">
        <Bone className="h-1.5 flex-1 rounded-full" />
        <Bone className="h-3 w-16 md:w-36" />
      </div>
      <div className="hidden lg:block shrink-0 w-28"><Bone className="h-5 w-20 rounded-full" /></div>
      <div className="shrink-0 md:w-36 flex md:justify-end"><Bone className="h-6 w-24 rounded-full" /></div>
    </div>
  );
}

export function RowSkeletonList({ count = 15 }: { count?: number }) {
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
    <div className="flex items-center gap-3 flex-wrap">
      <Bone className="h-9 w-56 rounded-[10px]" />
      <Bone className="h-8 w-28 rounded-full" />
      <Bone className="h-8 w-32 rounded-full" />
      <Bone className="h-8 w-28 rounded-full" />
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex flex-col gap-2">
        <Bone className="h-6 w-44" />
        <Bone className="h-3.5 w-64" />
      </div>
      <Bone className="h-9 w-32 rounded-full" />
    </div>
  );
}
