"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Design tokens straight from _final_design/guide/central-hub-design-system.md — the same
// fixed-hex convention ../_onboarding-wizard.tsx already uses (this feature area is light-only,
// not the isDark-prop convention used elsewhere in v2).
export const textPrimary = "text-[#0B1533]"; // --ink
export const textBody = "text-[#3A4565]"; // --body
export const textMuted = "text-[#5F6A88]"; // --muted
export const cardCls = "bg-white border border-[#E2E7F2] rounded-[14px]"; // --r-lg
export const fieldLabelCls = cn("block text-[13px] font-medium mb-1.5", textPrimary);
export const fieldInputCls = cn(
  "w-full text-sm rounded-[9px] px-3.5 py-[11px] border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
  "bg-white border-[#E2E7F2] text-[#0B1533] placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
);

export function IconTip({ label, side = "top", children }: { label: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Per-deliverable due/overdue chip — design system §4 "Status chips", ok/warn/late tints.
export function DueBadge({ currentDay, dayStart, dayEnd, done }: { currentDay: number; dayStart: number; dayEnd: number; done: boolean }) {
  const dayRange = dayStart === dayEnd ? `Day ${dayStart}` : `Day ${dayStart}–${dayEnd}`;
  if (done) {
    return <span className="font-mono text-[10px] font-semibold uppercase tracking-wide rounded-[7px] px-1.5 py-0.5 text-[#177E48] bg-[#E3F5EA]">Done</span>;
  }
  if (currentDay > dayEnd) {
    return <span className="font-mono text-[10px] font-semibold uppercase tracking-wide rounded-[7px] px-1.5 py-0.5 text-[#C0392B] bg-[#FDE8E6]">Overdue · Due day {dayEnd}</span>;
  }
  if (currentDay >= dayStart) {
    return <span className="font-mono text-[10px] font-semibold uppercase tracking-wide rounded-[7px] px-1.5 py-0.5 text-[#8A5A00] bg-[#FFF3D6]">Due day {dayEnd}</span>;
  }
  return <span className="font-mono text-[10px] font-semibold uppercase tracking-wide rounded-[7px] px-1.5 py-0.5 text-[#5F6A88] bg-[#EDF0F7]">{dayRange}</span>;
}

// Simplified rich-text field (tiptap StarterKit, bold/italic/underline/bullets) — same library
// as the original wizard's RichTextField, rebuilt fresh here since the original isn't exported.
export function RichTextField({
  label, value, onChange, placeholder, hasError, disabled, maxLength,
}: {
  label: string; value: string; onChange: (html: string) => void; placeholder?: string;
  hasError?: boolean; disabled?: boolean;
  // Task 217 (mockup 02) — when set, shows an "N / maxLength" plain-text-length counter footer.
  // Soft limit only (not enforced/truncated) since rich text length is HTML-tag-inclusive and a
  // hard cutoff mid-tag would corrupt the document — matches the mockup's counter-only intent.
  maxLength?: number;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3.5 py-[11px] text-sm min-h-[88px] max-h-[260px] overflow-y-auto",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          textPrimary
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const marks: { label: string; title: string; cls: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", cls: "font-bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", cls: "italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "U", title: "Underline", cls: "underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false },
    { label: "•", title: "Bullet list", cls: "", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
  ];

  const textLength = editor?.getText().length ?? stripHtml(value).length;

  return (
    <div>
      <label className={fieldLabelCls}>{label}</label>
      <div
        className={cn(
          "rounded-[9px] border-[1.5px] overflow-hidden transition-[border-color,box-shadow] duration-150 bg-white",
          hasError
            ? "border-[#C0392B] shadow-[0_0_0_3px_rgba(192,57,43,0.25)]"
            : "border-[#E2E7F2] focus-within:border-[#007BFF] focus-within:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
        )}
      >
        {!disabled && (
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#EDF0F7] bg-[#F4F6FB]/50">
            {marks.map((m) => (
              <IconTip key={m.title} label={m.title} side="bottom">
                <button
                  type="button"
                  onClick={m.action}
                  className={cn(
                    "text-[12px] w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                    m.cls,
                    m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-[#EDF0F7]"
                  )}
                >
                  {m.label}
                </button>
              </IconTip>
            ))}
          </div>
        )}
        <EditorContent editor={editor} />
        {typeof maxLength === "number" && (
          <div className="flex justify-end px-2.5 py-1 border-t border-[#EDF0F7] font-mono text-[10px] text-[#5F6A88]">
            {textLength} / {maxLength}
          </div>
        )}
      </div>
      {placeholder && <p className="text-[11px] mt-1 text-[#5F6A88]">{placeholder}</p>}
    </div>
  );
}

// Pill-tab bar — reused for the top-level 4-tab shell and the Access tab's Credentials/Links
// sub-tabs, matching the pill-tab visual pattern already established across v2 (project detail
// Tasks/Issues/Milestones, storage-kb's task-198 tabs).
export function PillTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-pressed={active === tab.id}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer border-none",
            active === tab.id ? "bg-white text-[#007BFF] shadow-[0_1px_2px_rgba(7,17,51,.08)]" : "bg-transparent text-[#5F6A88] hover:text-[#0B1533]"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Top-level 4-tab shell (mockup 01) — underline-on-active, deliberately distinct from PillTabs'
// filled-segment look so tabs (navigation) never read as filter/segmented pills (a different
// interaction) per the mockup's own annotation. Sub-tabs (Access's Credentials/Links, the
// grid/list view toggle) keep PillTabs/segmented styling — only this top-level bar switches.
export function UnderlineTabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { id: T; label: string; count?: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-0 border-b border-[#E2E7F2] overflow-x-auto" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative py-2.5 mr-5 text-[13px] font-semibold whitespace-nowrap cursor-pointer border-none bg-transparent transition-colors",
            active === tab.id ? textPrimary : cn(textMuted, "hover:text-[#0B1533]")
          )}
        >
          {tab.label}
          {tab.count && <span className="font-mono text-[10px] text-[#5F6A88] ml-1">{tab.count}</span>}
          {active === tab.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-t-sm bg-[#007BFF]" />}
        </button>
      ))}
    </div>
  );
}
