import { cn } from "@/lib/utils";
import { DRIVE_LABEL, DRIVE_SECTIONS } from "@/config/constants";
import type { DriveView } from "@/lib/drive/types";

// Task 436 — page title + the two section tabs. Navy fill = the active section (selection is navy
// across the Hub; blue is reserved for actions). The only orange CTA ("Upload files") lives in the
// browser toolbar below.
export function DriveHeader({ view, onChange }: { view: DriveView; onChange: (v: DriveView) => void }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-[22px] font-bold tracking-[-0.015em] text-[#0B1533]">{DRIVE_LABEL}</h1>
        <p className="mt-0.5 max-w-[65ch] text-[13px] text-[#5F6A88]">Your private files and folders. Only what you share is visible to others.</p>
      </div>
      <div role="tablist" aria-label="Drive sections" className="flex items-center gap-1.5">
        {DRIVE_SECTIONS.map((s) => {
          const active = view === s.id;
          return (
            <button
              key={s.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(s.id)}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]",
                active ? "border-[#071133] bg-[#071133] text-white" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
