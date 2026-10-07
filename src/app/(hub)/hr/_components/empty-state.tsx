import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Empty state that teaches: icon, one line of what goes here and when, optional action. */
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-[#E5F1FF] text-[#0063D6]">
        <Icon size={18} aria-hidden />
      </span>
      <p className="text-[13px] font-semibold text-[#0B1533]">{title}</p>
      {hint && <p className="max-w-[44ch] text-[12px] text-[#5F6A88]">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
