"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";

// Rich Text Notes field for the Add/Edit Time Log modal (task 230, Requirement 7) — same Tiptap
// stack as `../projects/[projectId]/tasks/[taskId]/_comment-editor.tsx`, deliberately without that
// component's image-paste/upload extension (Assumption 8: not requested for a Notes field, and
// adding it would need a new upload endpoint out of scope here). `content`/`onChange` carry HTML,
// matching how `note` is already stored/rendered as plain text elsewhere in this feature area —
// the modal is responsible for stripping to a plain-text emptiness check before validating.
export function TimeLogNotesEditor({
  content, onChange,
}: {
  content: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3 py-2 text-[13px] min-h-[56px] leading-relaxed",
          "[&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          "text-[#3A4565]"
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  const marks: { label: string; title: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "•", title: "Bullet list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
  ];

  return (
    <div className="rounded-[10px] border overflow-hidden transition-colors border-[#E2E7F2] bg-[#F4F6FB] focus-within:border-[#007BFF] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#007BFF]/[0.14]">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-[#E2E7F2]/70">
        {marks.map((m) => (
          <button
            key={m.title}
            type="button"
            title={m.title}
            onClick={m.action}
            className={cn(
              "text-[11px] font-bold w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none",
              m.title === "Italic" && "italic",
              m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-white"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
