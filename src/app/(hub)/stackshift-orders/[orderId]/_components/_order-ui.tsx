import { Building2, CheckCircle2, Download, FileText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared presentational pieces for the StackShift order review page (task 347).

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-5">
      <h2 className="text-[13px] font-bold text-[#0B1533] mb-3">{title}</h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">{children}</div>
    </div>
  );
}

export function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={cn(full && "col-span-2")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#5F6A88]">{label}</div>
      <div className="text-[13px] text-[#3A4565] mt-0.5 whitespace-pre-wrap break-words">{value || "—"}</div>
    </div>
  );
}

export function FileRow({
  label,
  filename,
  onOpen,
}: {
  label: string;
  filename: string | null;
  onOpen: () => void;
}) {
  return (
    <div className="col-span-2 flex items-center justify-between gap-3 rounded-[10px] border border-[#EDF0F7] bg-[#FAFBFE] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={15} className="text-[#5F6A88] shrink-0" />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[#0B1533]">{label}</div>
          <div className="text-[11px] text-[#5F6A88] truncate">{filename ?? "—"}</div>
        </div>
      </div>
      {filename && (
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors shrink-0"
        >
          <Download size={12} /> Download
        </button>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending_review: { label: "Pending review", cls: "bg-[#FFF3D6] text-[#8A5A00]", icon: <Building2 size={12} /> },
    converted: { label: "Converted", cls: "bg-[#E4F6EC] text-[#1E7C4B]", icon: <CheckCircle2 size={12} /> },
    dismissed: { label: "Dismissed", cls: "bg-[#EDF0F7] text-[#5F6A88]", icon: <XCircle size={12} /> },
  };
  const s = map[status] ?? map.pending_review;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0", s.cls)}>
      {s.icon} {s.label}
    </span>
  );
}

export const ERROR_BOX_CLASS =
  "rounded-[10px] border border-[#F3C7C7] bg-[#FDF2F2] px-4 py-2.5 text-[12px] text-[#9B2C2C]";
