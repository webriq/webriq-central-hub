import { cn } from "@/lib/utils";

// Task 499 — one skeleton for the Orders table, shared by loading.tsx (first load) and
// orders-table.tsx's useTransition swap (tab / search / pagination), so the two can't drift.
// Mirrors the real table: 4 content columns + task 498's 44px menu column.

export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-[#EDF0F7]", className)} />;
}

const COLS = "grid grid-cols-[1.3fr_1.2fr_1.4fr_120px] items-center gap-3 px-5";

function Row({ withMenu }: { withMenu: boolean }) {
  return (
    <div className={cn("grid items-center border-b border-[#EDF0F7] last:border-0", withMenu ? "grid-cols-[1fr_44px]" : "grid-cols-1")}>
      <div className={cn(COLS, "py-3")}>
        <div className="flex flex-col gap-1.5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3.5 w-24" />
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
      {withMenu && <Bone className="h-5 w-1.5 mx-auto" />}
    </div>
  );
}

export function OrdersTableSkeleton({ rows = 8, withMenu = true }: { rows?: number; withMenu?: boolean }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden" aria-hidden="true">
      <div className={cn("grid items-center border-b border-[#EDF0F7] bg-[#FAFBFE]", withMenu ? "grid-cols-[1fr_44px]" : "grid-cols-1")}>
        <div className={cn(COLS, "py-2.5")}>
          <Bone className="h-3.5 w-16" />
          <Bone className="h-3.5 w-14" />
          <Bone className="h-3.5 w-16" />
          <Bone className="h-3.5 w-14 ml-auto" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Row key={i} withMenu={withMenu} />
      ))}
    </div>
  );
}
