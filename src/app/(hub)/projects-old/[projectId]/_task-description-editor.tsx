"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Local rich text description editor for the New Task modal (task 205) — same Tiptap library
// and toolbar shape as _shared-ui.tsx's RichTextField (portfolio-tracker/v2 sandbox), rebuilt
// here rather than imported to keep the two feature areas decoupled (task 202 precedent), plus
// an Image extension + paste/drop upload handler that field doesn't have.

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function TaskDescriptionEditor({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string;
  onChange: (html: string) => void;
}) {
  async function uploadAndInsertImage(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v2/projects/${projectId}/tasks/description-images`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return; // silently drop — a failed inline image paste isn't fatal to the form
    const { url } = await res.json();
    editor?.chain().focus().setImage({ src: url }).run();
  }

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3 py-2 text-[13px] min-h-[70px] max-h-[220px] overflow-y-auto",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
          "text-[#3A4565]"
        ),
      },
      handlePaste(_view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith("image/"));
        if (!imageItem) return false;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (file) void uploadAndInsertImage(file);
        return true;
      },
      handleDrop(_view, event) {
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        void uploadAndInsertImage(file);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const marks: { label: string; title: string; cls: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", cls: "font-bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", cls: "italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "•", title: "Bullet list", cls: "", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
  ];

  return (
    <div
      className="rounded-[10px] border overflow-hidden transition-colors border-[#E2E7F2] bg-[#F4F6FB] focus-within:border-[#007BFF] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#007BFF]/[0.14]"
    >
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#E2E7F2]/70">
        {marks.map((m) => (
          <IconTip key={m.title} label={m.title}>
            <button
              type="button"
              onClick={m.action}
              className={cn(
                "text-[12px] w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                m.cls,
                m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-white"
              )}
            >
              {m.label}
            </button>
          </IconTip>
        ))}
        <span className="text-[10px] text-[#5F6A88] ml-2">Paste or drag an image to embed it</span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
