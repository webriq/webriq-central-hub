import { CardSkeletonGrid, HeaderSkeleton, ToolbarSkeleton } from "./_list-skeleton";

export default function PortfolioTrackerLoading() {
  return (
    <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
      <HeaderSkeleton />
      <ToolbarSkeleton />
      <div className="mt-5">
        <CardSkeletonGrid count={9} />
      </div>
    </div>
  );
}
