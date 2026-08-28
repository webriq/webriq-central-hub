"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared Note/Reply rich-text composer (task 320) — same minimal Tiptap shape as
// src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_comment-editor.tsx, but without the
// Image extension/paste-upload handlers (no attachment-upload endpoint for ticket notes/replies
// — out of scope). StarterKit v3 already bundles Underline + Link (see
// _onboarding-wizard.tsx:3316's precedent) — do not add @tiptap/extension-underline separately,
// it triggers a "Duplicate extension names" runtime warning.
export function RichTextEditor({
  onChange,
  onEmptyChange,
  placeholder,
  disabled = false,
}: {
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: "",
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3 py-2 text-[13px] min-h-[70px] leading-relaxed",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          "[&_a]:text-[#007BFF] [&_a]:underline",
          // Tiptap's Placeholder extension marks the empty node `.is-editor-empty` with a
          // `data-placeholder` attribute rather than rendering literal text — surface it via
          // ::before, same pattern as _note-rich-text-editor.tsx.
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-[#5F6A88] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none",
          "text-[#3A4565]"
        ),
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
      onEmptyChange(e.isEmpty);
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled);
  }, [disabled, editor]);

  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL");
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const marks: { icon: typeof Bold; title: string; action: () => void; active: () => boolean }[] = [
    { icon: Bold, title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { icon: Italic, title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { icon: UnderlineIcon, title: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false },
    { icon: List, title: "Bullet list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
    { icon: ListOrdered, title: "Numbered list", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false },
    { icon: Link2, title: "Link", action: toggleLink, active: () => editor?.isActive("link") ?? false },
  ];

  return (
    <div
      className={cn(
        "rounded-[10px] border overflow-hidden transition-colors border-[#E2E7F2] bg-[#F4F6FB]",
        disabled ? "cursor-not-allowed opacity-70" : "focus-within:border-[#007BFF] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#007BFF]/[0.14]"
      )}
    >
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#E2E7F2]/70">
        {marks.map((m) => (
          <button
            key={m.title}
            type="button"
            title={m.title}
            aria-label={m.title}
            onClick={m.action}
            disabled={disabled}
            className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center transition-colors border-none",
              disabled ? "cursor-not-allowed text-[#C7CEDD]" : cn("cursor-pointer", m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-white")
            )}
          >
            <m.icon size={13} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className={disabled ? "cursor-not-allowed pointer-events-none" : undefined} />
    </div>
  );
}
