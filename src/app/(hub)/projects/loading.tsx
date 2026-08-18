import { CardSkeletonGrid, HeaderSkeleton, PaginationSkeleton, ToolbarSkeleton } from "./_list-skeleton";

export default function ProjectsLoading() {
  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      <HeaderSkeleton />
      <ToolbarSkeleton />
      <CardSkeletonGrid count={9} />
      <PaginationSkeleton />
    </div>
  );
}
