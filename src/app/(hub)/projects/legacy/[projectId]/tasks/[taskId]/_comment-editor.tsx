"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { cn } from "@/lib/utils";

// Rich-text comment composer (task 212) — same Tiptap stack/toolbar as
// ../_description-field.tsx, rebuilt locally rather than shared: a composer tracks its
// content live via onUpdate (not onBlur) and resets via a parent-driven `key` remount (see
// TaskComments), a different lifecycle than the Description field's edit-in-place/save-on-blur.
export function CommentEditor({
  taskId,
  onChange,
  onEmptyChange,
  disabled = false,
}: {
  taskId: string;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  // Task 301 — locked while the comment is posting; the editor itself stays mounted (only a
  // successful post/Clear remounts it via the parent's resetKey), so `disabled` has to be able
  // to change after creation without recreating the Tiptap instance — handled via
  // editor.setEditable() below rather than the `editable` create-time option alone.
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  // handlePaste/handleDrop are bound once at editor creation, so they'd otherwise capture a
  // stale `disabled` from that first render — this ref keeps them reading the current value.
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  async function uploadAndInsertImage(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v2/tasks/${taskId}/comments/description-images`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) return; // silently drop — a failed inline image paste isn't fatal
    const { url } = await res.json();
    editor?.chain().focus().setImage({ src: url }).run();
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image,
    ],
    content: "",
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none px-3 py-2 text-[13px] min-h-[70px] leading-relaxed",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
          "text-[#3A4565]"
        ),
      },
      handlePaste(_view, event) {
        if (disabledRef.current) return false;
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith("image/"));
        if (!imageItem) return false;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (file) void uploadAndInsertImage(file);
        return true;
      },
      handleDrop(_view, event) {
        if (disabledRef.current) return false;
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        void uploadAndInsertImage(file);
        return true;
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

  const marks: { label: string; title: string; action: () => void; active: () => boolean }[] = [
    { label: "B", title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { label: "I", title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { label: "•", title: "Bullet list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
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
            onClick={m.action}
            disabled={disabled}
            className={cn(
              "text-[12px] font-bold w-7 h-7 rounded-md flex items-center justify-center transition-colors border-none",
              m.title === "Italic" && "italic",
              disabled ? "cursor-not-allowed text-[#C7CEDD]" : cn("cursor-pointer", m.active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-white")
            )}
          >
            {m.label}
          </button>
        ))}
        <span className="text-[10px] text-[#5F6A88] ml-2">
          {uploading ? "Uploading image…" : "Paste or drag an image to embed it"}
        </span>
      </div>
      <EditorContent editor={editor} className={disabled ? "cursor-not-allowed pointer-events-none" : undefined} />
    </div>
  );
}
