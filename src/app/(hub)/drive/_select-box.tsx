import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Selection checkbox shared by file and folder tiles. A sibling of the open-item button, never
// nested inside it (button-in-button is invalid HTML), so clicking the tile body keeps opening it.
export function SelectBox({ selected, visible, label, onToggle, className }: {
  selected: boolean; visible: boolean; label: string; onToggle: () => void; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#007BFF]/40",
        selected ? "border-[#007BFF] bg-[#007BFF] text-white opacity-100" : "border-[#C7D2E8] bg-white text-transparent hover:border-[#007BFF]",
        !selected && !visible && "opacity-0",
        className,
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
