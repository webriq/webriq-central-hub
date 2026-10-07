import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Neutral, read-only chips (design system: chips are never clickable; permission/classification
// chips are neutral). Not used as buttons anywhere.
export function PermissionChip({ label }: { label: string }) {
  return <span className="whitespace-nowrap rounded-[5px] bg-[#EDF0F7] px-1.5 py-0.5 text-[10px] font-bold text-[#5F6A88]">{label}</span>;
}

export function SharedChip({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      title={`Shared with ${count} ${count === 1 ? "person or role" : "people and roles"}`}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-[#E5F1FF] px-1.5 py-0.5 text-[10px] font-bold text-[#0063D6]", className)}
    >
      <Users size={10} aria-hidden /> <span className="font-mono">{count}</span> <span className="sr-only">shared</span>
    </span>
  );
}
