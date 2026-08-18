"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";
import { normalizeZohoDescriptionHtml } from "../_pm-shared";
import { ImageLightboxModal } from "./_image-lightbox-modal";

// Editable rich-text renderer for a detail page's Description field (task 206, task detail).
// Task 234 relocates this from tasks/[taskId]/_task-description-field.tsx to this shared
// [projectId]/ level (same directory _task-timer-button.tsx already lives at, for the same
// reason: shared by both tasks/[taskId]/ and issues/[issueId]/) and replaces the hard-coded
// tasks-only image upload endpoint with an `uploadUrl` prop so issue detail can point it at its
// own description-images route. Same Tiptap stack/toolbar shape as
// `[projectId]/_task-description-editor.tsx` (task 205's New Task modal editor) — rebuilt
// locally rather than imported, since that component has no onBlur-save concept and its own top
// comment scopes it to creation only. StarterKit already bundles the Link extension with
// target="_blank" defaults, so imported/typed links render clickable with zero extra config
// (verified against node_modules, not assumed).
export function DescriptionField({
  uploadUrl,
  value,
  onSave,
  readOnly = false,
  fullBleed = false,
  scrollable = false,
}: {
  uploadUrl: string;
  value: string;
  onSave: (html: string) => void;
  readOnly?: boolean;
  // Drop the field's own corner radius so it covers the full, edge-to-edge content area of a
  // `noPadding` `AccordionCard` — the parent's own `rounded-[14px] overflow-hidden` clips the
  // bottom corners to match, so no radius is needed here.
  fullBleed?: boolean;
  // Cap the editor body at 420px and let it scroll internally past that — the toolbar (outside
  // this wrapper) stays fixed/visible regardless of content length.
  scrollable?: boolean;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const isEmptyReadOnly = readOnly && !value;

  async function uploadAndInsertImage(file: File) {
    if (readOnly) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl, {
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
      Placeholder.configure({ placeholder: "Add a description…" }),
    ],
    content: normalizeZohoDescriptionHtml(value),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      handleClickOn(_view, _pos, node, _nodePos, event) {
        if (node.type.name === "image") {
          event.preventDefault();
          setLightboxSrc(node.attrs.src as string);
          return true;
        }
        return false;
      },
      attributes: {
        class: cn(
          "outline-none px-3 py-2.5 text-[13px] min-h-[100px] leading-relaxed",
          "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
          "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
          // Blank-line dividers from Zoho-imported HTML (task 238's normalizeZohoDescriptionHtml)
          // parse into a <p> whose only content is a real hardBreak immediately followed by
          // ProseMirror's own trailing-break companion <br> — i.e. exactly
          // `<p><br><br class="ProseMirror-trailingBreak"></p>`. Every <p> already gets the same
          // `[&_p]:my-1` margin above, so relying on that pair's own two-line-box rendering to make
          // this specific paragraph read as "one blank line" makes the height an emergent side
          // effect of how a given browser lays out two stacked <br>s, not something this stylesheet
          // actually controls. Hide both <br>s and size the paragraph itself explicitly instead, so
          // the blank-line height is deterministic.
          "[&_p:has(>br+br.ProseMirror-trailingBreak)]:min-h-[1em] [&_p:has(>br+br.ProseMirror-trailingBreak)>br]:hidden",
          // Tiptap's Placeholder extension marks the empty node `.is-editor-empty` with a
          // `data-placeholder` attribute rather than rendering literal text — surface it via ::before.
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-[#8A93AC] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_img]:cursor-zoom-in",
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

  // Read-only + empty — skip the editor shell entirely rather than showing a blank box
  // (task 257, Requirement A: explicit empty state). `useEditor` above still runs (rules-of-hooks
  // requires every hook to run unconditionally) — its instance is simply never rendered here.
  if (isEmptyReadOnly) {
    return <p className="text-[13px] text-[#5F6A88] px-3 py-2.5">No description provided.</p>;
  }

  return (
    <div className={cn(
      "border overflow-hidden transition-colors border-[#E2E7F2]",
      // fullBleed sits flush against a `noPadding` parent Card/AccordionCard's own
      // `rounded-[14px]` — a plain 0-radius child still renders a square corner notch at the
      // parent's inner edge (overflow-hidden clips what's outside the parent's curve, not a
      // flush-fitting square border inside it), so the bottom corners need their own matching
      // radius (13px = parent's 14px minus its 1px border) rather than none at all.
      fullBleed ? "rounded-b-[13px]" : "rounded-[10px]",
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
      <div className={cn(scrollable && "max-h-[420px] overflow-y-auto")}>
        <EditorContent editor={editor} />
      </div>
      {lightboxSrc && (
        <ImageLightboxModal src={lightboxSrc} alt="Description image" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
