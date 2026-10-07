import { DriveSkeleton } from "./_drive-empty";

export default function DriveLoading() {
  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-6 sm:px-8">
        <div className="mb-5 flex flex-col gap-2">
          <div className="h-7 w-32 animate-pulse rounded-md bg-[#E2E7F2] motion-reduce:animate-none" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-[#EDF0F7] motion-reduce:animate-none" />
        </div>
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-4"><DriveSkeleton /></div>
      </div>
    </div>
  );
}
