import { cn } from "@/lib/utils";

// Read-mode typography for rendered wiki HTML — shared by the doc panel (task 395) and the task
// 402 history diff view, so a revision diff reads exactly like the page itself.
export const WIKI_PROSE_CLASS = cn(
  "text-[13px] leading-[1.7] text-[#3A4565]",
  "[&_h2]:font-heading [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-[#0B1533] [&_h2]:mt-7 [&_h2]:mb-2.5",
  "[&_h3]:font-heading [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#0B1533] [&_h3]:mt-5 [&_h3]:mb-2",
  "[&_p+p]:mt-3.5",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1",
  "[&_blockquote]:bg-[#EEF3FF] [&_blockquote]:border [&_blockquote]:border-[#D7E3FF] [&_blockquote]:rounded-[10px] [&_blockquote]:px-3.5 [&_blockquote]:py-3 [&_blockquote]:my-3.5 [&_blockquote]:text-[13px] [&_blockquote]:text-[#243B6B] [&_blockquote]:not-italic",
  "[&_pre]:bg-[#0F172A] [&_pre]:text-[#D7E0F7] [&_pre]:rounded-[10px] [&_pre]:px-4 [&_pre]:py-3.5 [&_pre]:my-3.5 [&_pre]:text-[12.5px] [&_pre]:leading-[1.6] [&_pre]:overflow-x-auto [&_pre]:font-mono",
  "[&_code]:font-mono [&_code]:text-[12.5px]",
  "[&_img]:max-w-full [&_img]:rounded-[10px] [&_img]:my-3",
  // Task 397 — same Table spec as the RTE's editable view (central-hub-design-
  // system.md), so imported/edited tables look identical in read and edit mode.
  "[&_table]:block [&_table]:overflow-x-auto [&_table]:w-full [&_table]:my-3.5 [&_table]:border-collapse",
  "[&_th]:text-[9.5px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.09em] [&_th]:text-[#5F6A88] [&_th]:bg-[#FAFBFE] [&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:border-b [&_th]:border-[#EDF0F7]",
  "[&_td]:text-[13px] [&_td]:text-[#3A4565] [&_td]:px-2.5 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#EDF0F7]",
  "[&_th:first-child]:pl-[18px] [&_td:first-child]:pl-[18px]",
  "[&_tr]:transition-colors [&_tr:hover]:bg-[#F0F7FF]"
);
