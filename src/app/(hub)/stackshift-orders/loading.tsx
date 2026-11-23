import { Bone, OrdersTableSkeleton } from "./_components/orders-skeleton";

// First load only — Next.js doesn't re-show this for search-param-only navigations; orders-table.tsx
// covers those with the same OrdersTableSkeleton (task 499).
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
            <div className="flex gap-1.5">
              {["w-30", "w-24", "w-24", "w-22"].map((w, i) => (
                <Bone key={i} className={`h-6 rounded-full ${w}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-5">
        <OrdersTableSkeleton />
      </div>
    </div>
  );
}
