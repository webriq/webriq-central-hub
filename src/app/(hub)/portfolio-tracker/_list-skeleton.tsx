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
