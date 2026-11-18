import { HeaderSkeleton, RowSkeletonList, ToolbarSkeleton } from "./_list-skeleton";

export default function PortfolioTrackerLoading() {
  return (
    <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
      <HeaderSkeleton />
      <ToolbarSkeleton />
      <div className="mt-5">
        {/* Task 481 — List is the default view, so first load shows row skeletons. */}
        <RowSkeletonList count={9} />
      </div>
    </div>
  );
}
