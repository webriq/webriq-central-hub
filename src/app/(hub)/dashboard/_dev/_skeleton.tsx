// Task 360 — skeleton rows in place of the real grid (design system §5: skeletons, never
// centred spinners).
//
// Deliberately NOT named `loading.tsx`: `_dev/` is a private folder, not a route segment, so
// Next would never pick one up here — and a `loading.tsx` at `dashboard/` would show this
// developer-shaped skeleton to PM/admin/marketing too. It is a plain component instead, rendered
// as the Suspense fallback around the developer branch in `page.tsx`.

const tile = "rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]";
const pulse = "animate-pulse motion-reduce:animate-none bg-[#EDF0F7] rounded";

export default function DevDashboardSkeleton() {
  return (
    <div className="py-6.5 px-8 max-lg:px-4 flex flex-col gap-5 bg-[#F4F6FB] min-h-full">
      <div className="flex items-end justify-between gap-5 flex-wrap">
        <div className="flex flex-col gap-2">
          <span className={`${pulse} h-6 w-56`} />
          <span className={`${pulse} h-4 w-72`} />
        </div>
        <div className="flex gap-2.5">
          <span className={`${pulse} h-9 w-28 rounded-full`} />
          <span className={`${pulse} h-9 w-32 rounded-full`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${tile} px-[18px] py-4 flex flex-col gap-3`}>
            <span className={`${pulse} h-3.5 w-24`} />
            <span className={`${pulse} h-7 w-16`} />
            <span className={`${pulse} h-3 w-28`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-[18px] items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
          <div className={`${tile} p-[18px] flex flex-col gap-4`}>
            <span className={`${pulse} h-4 w-56`} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`${pulse} h-24`} />
              ))}
            </div>
          </div>
          <div className={`${tile} p-[18px] flex flex-col gap-3`}>
            <span className={`${pulse} h-4 w-32`} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`${pulse} h-12`} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[18px] min-w-0">
          <span className={`${pulse} h-64 rounded-[14px]`} />
          <span className={`${pulse} h-40 rounded-[14px]`} />
          <span className={`${pulse} h-44 rounded-[14px]`} />
        </div>
      </div>
    </div>
  );
}
