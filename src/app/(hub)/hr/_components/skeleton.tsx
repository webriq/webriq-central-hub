export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#EDF0F7] motion-reduce:animate-none ${className}`} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[#EDF0F7] px-[18px] py-3.5 last:border-0">
          <Bone className="size-[30px] rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Bone className="h-3.5 w-40" />
            <Bone className="h-3 w-24" />
          </div>
          <Bone className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
