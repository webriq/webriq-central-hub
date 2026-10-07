import { Bone, SkeletonRows } from "./_components/skeleton";

export default function HrLoading() {
  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-6 sm:px-8">
        <div className="mb-5 flex flex-col gap-2">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <div className="overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white">
          <SkeletonRows rows={6} />
        </div>
      </div>
    </div>
  );
}
