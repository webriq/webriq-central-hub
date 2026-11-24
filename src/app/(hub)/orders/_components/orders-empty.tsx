import { ClipboardList, Search, X } from "lucide-react";

// Task 499 — the Orders table's empty state, split out to keep orders-table.tsx within the
// file-length guide. Teaches the next step per the design guide (search → clear, archived → how).
export default function OrdersEmpty({
  searchQ,
  tabLabel,
  archived,
  onClear,
}: {
  searchQ: string;
  tabLabel: string;
  archived: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
        {searchQ ? <Search size={24} className="text-[#007BFF]" /> : <ClipboardList size={26} className="text-[#007BFF]" />}
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-[#0B1533]">
          {searchQ ? "No orders match your search" : `No ${tabLabel.toLowerCase()} orders`}
        </div>
        <p className="text-[13px] text-[#5F6A88] mt-1">
          {searchQ
            ? "Try a different search term or clear the filter."
            : archived
              ? "Archive an order from its row menu to move it here."
              : "New submissions from the StackShift Order Form will appear here."}
        </p>
      </div>
      {searchQ && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
        >
          <X size={13} /> Clear search
        </button>
      )}
    </div>
  );
}
