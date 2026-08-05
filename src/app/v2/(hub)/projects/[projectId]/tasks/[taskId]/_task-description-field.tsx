"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { cn } from "@/lib/utils";

// Editable rich-text renderer for the task detail page's Description field (task 206).
// Same Tiptap stack/toolbar shape as `[projectId]/_task-description-editor.tsx` (task 205's
// New Task modal editor) — rebuilt locally rather than imported, since that component has no
// onBlur-save concept and its own top comment scopes it to creation only. StarterKit already
// bundles the Link extension with target="_blank" defaults, so imported/typed links render
// clickable with zero extra config (verified against node_modules, not assumed).
export function TaskDescriptionField({
  projectId,
  value,
  onSave,
  readOnly = false,
}: {
  projectId: string;
  value: string;
  onSave: (html: string) => void;
  readOnly?: boolean;
}) {
  async function uploadAndInsertImage(file: File) {
    if (readOnly) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v2/projects/${projectId}/tasks/description-images`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return; // silently drop — a failed inline image paste isn't fatal
    const { url } = await res.json();
    editor?.chain().focus().setImage({ src: url }).run();
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image,
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3 py-2.5 text-[13px] min-h-[100px] leading-relaxed",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
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
    onBlur: ({ editor: e }) => onSave(e.getHTML()),
  });

  const marks: { label: string; title: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "•", title: "Bullet list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
  ];

  return (
    <div className={cn(
      "rounded-[10px] border overflow-hidden transition-colors border-[#E2E7F2]",
      readOnly ? "bg-white" : "bg-[#F4F6FB] focus-within:border-[#007BFF] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#007BFF]/[0.14]"
    )}>
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#E2E7F2]/70">
          {marks.map((m) => (
            <button
              key={m.title}
              type="button"
              title={m.title}
              onClick={m.action}
              className={cn(
                "text-[12px] font-bold w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
                m.title === "Italic" && "italic",
                m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-white"
              )}
            >
              {m.label}
            </button>
          ))}
          <span className="text-[10px] text-[#5F6A88] ml-2">Paste or drag an image to embed it</span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
