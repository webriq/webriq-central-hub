import { HardDrive } from "lucide-react";

// Shown instead of a raw PostgREST error when migration 166 hasn't been applied yet.
export function SetupNeeded({ detail }: { detail: string }) {
  return (
    <div className="min-h-full bg-[#F4F6FB]">
      <div className="mx-auto max-w-[640px] px-4 pt-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F1FF] text-[#007BFF]"><HardDrive size={22} /></div>
        <h1 className="font-heading text-[18px] font-bold text-[#0B1533]">Drive isn&apos;t set up yet</h1>
        <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-[#5F6A88]">
          The Drive tables are missing from this database. Ask an admin to apply migration <span className="font-mono">166_user_drive.sql</span>, then reload.
        </p>
        <p className="mt-3 font-mono text-[11px] text-[#5F6A88]">{detail}</p>
      </div>
    </div>
  );
}
