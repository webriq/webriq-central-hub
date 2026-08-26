"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTip } from "./_icon-tip";

// Task 312 — Notes body field, converted from a plain `<textarea>` to a Tiptap rich text
// editor. `StarterKit` alone covers all six requested marks (Bold/Italic/Underline/Strike/
// Bulleted/Numbered) — Tiptap v3's StarterKit already bundles Underline and Strike, so no
// extra `@tiptap/extension-*` packages are added here (see `_onboarding-wizard.tsx:3316`'s
// same note). The toolbar is deliberately background-transparent so it sits directly on
// whichever `NOTE_CARD_BG[color]` the parent (editor modal) applies, per the "aligned with the
// note background" requirement — no separate gray/white toolbar bar like the description/
// comment editors use elsewhere in this app.
// Task 313 — paste/drop image support, same `Image` extension + upload-then-insert shape as
// `_task-description-editor.tsx`, posting to the Notes-scoped upload route instead.
export function NoteRichTextEditor({
  projectId,
  value,
  onChange,
  onEmptyChange,
  readOnly,
}: {
  projectId: string;
  value: string;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  readOnly: boolean;
}) {
  async function uploadAndInsertImage(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/notes/description-images`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return; // silently drop — a failed inline image paste isn't fatal to the note
    const { url } = await res.json();
    editor?.chain().focus().setImage({ src: url }).run();
  }

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Take a note…" }), Image],
    content: value,
    immediatelyRender: false,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none text-[13px] text-[#3A4565] min-h-[140px] leading-relaxed",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5 [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
          // Tiptap's Placeholder extension marks the empty node `.is-editor-empty` with a
          // `data-placeholder` attribute rather than rendering literal text — surface it via ::before.
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-[#5F6A88] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none"
        ),
      },
      handlePaste(_view, event) {
        // `editable: !readOnly` only blocks native contenteditable typing — paste/drop handlers
        // still fire (drop in particular doesn't even require focus), and a Tiptap command like
        // `setImage` isn't automatically blocked by `editable`. Guard explicitly so a view-only
        // collaborator can't trigger a real upload or a locally-visible content mutation.
        if (readOnly) return false;
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith("image/"));
        if (!imageItem) return false;
        event.preventDefault();
        const file = imageItem.getAsFile();
        if (file) void uploadAndInsertImage(file);
        return true;
      },
      handleDrop(_view, event) {
        if (readOnly) return false;
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

  const marks: { icon: typeof Bold; title: string; action: () => void; active: () => boolean }[] = [
    { icon: Bold, title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { icon: Italic, title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { icon: Underline, title: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false },
    { icon: Strikethrough, title: "Strikethrough", action: () => editor?.chain().focus().toggleStrike().run(), active: () => editor?.isActive("strike") ?? false },
  ];

  const lists: { icon: typeof List; title: string; action: () => void; active: () => boolean }[] = [
    { icon: List, title: "Bulleted list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
    { icon: ListOrdered, title: "Numbered list", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false },
  ];

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div className="flex items-center gap-0.5 mx-4 mt-2 pb-1.5 border-b border-black/[0.06]">
          {marks.map((m) => (
            <IconTip key={m.title} label={m.title}>
              <button
                type="button"
                onClick={m.action}
                aria-label={m.title}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors",
                  m.active() ? "bg-black/[0.08] text-[#0B1533]" : "text-[#5F6A88] hover:bg-black/[0.04]"
                )}
              >
                <m.icon size={14} />
              </button>
            </IconTip>
          ))}
          <div className="w-px h-5 bg-black/[0.08] self-center mx-1" />
          {lists.map((l) => (
            <IconTip key={l.title} label={l.title}>
              <button
                type="button"
                onClick={l.action}
                aria-label={l.title}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors",
                  l.active() ? "bg-black/[0.08] text-[#0B1533]" : "text-[#5F6A88] hover:bg-black/[0.04]"
                )}
              >
                <l.icon size={14} />
              </button>
            </IconTip>
          ))}
        </div>
      )}
      <EditorContent editor={editor} className="mx-4 mt-2" />
    </div>
  );
}
