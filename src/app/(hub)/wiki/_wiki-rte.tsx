"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { toast } from "sonner";
import { uploadWikiImage } from "@/lib/wiki/upload-image";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Heading2, Heading3, Quote, Code2, TableIcon,
  Rows3, Columns3, TableRowsSplit, TableColumnsSplit, Trash2, Loader2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Task 395 — Wiki page body editor. Same Tiptap pattern as `_note-rich-text-editor.tsx` /
// `_task-description-editor.tsx` (StarterKit + Placeholder + Image, paste/drop image upload)
// but rebuilt here rather than imported — this codebase's own precedent
// (`_task-description-editor.tsx`'s header comment, task 202) is to keep feature areas
// decoupled. Extends the toolbar with H2/H3/Blockquote/Code block, all already covered by
// StarterKit — no new `@tiptap/extension-*` packages.
//
// Task 397 — adds `@tiptap/extension-table` (Table/TableRow/TableHeader/TableCell — a single
// package in Tiptap v3, unlike v2's 4 separate installs). Without this, Tiptap's ProseMirror
// schema has no table node, so a `<table>` already present in imported content (task 396's
// .docx via mammoth, .md via marked's GFM tables) is silently dropped the first time that page
// is opened in Edit mode — this was a real correctness bug, not just a missing feature.
// `resizable: false` — column-resize UI wasn't requested; default column widths are fine.

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// Shared by marks/structure/tableControls below — `active` is optional since one-shot
// commands (insert table, delete row, …) have no pressed state to reflect.
type ToolbarItem = { icon: typeof Bold; title: string; action: () => void; active?: () => boolean };

export function WikiRte({
  pageId,
  value,
  onChange,
}: {
  pageId: string;
  value: string;
  onChange: (html: string) => void;
}) {
  const [uploadingCount, setUploadingCount] = useState(0);

  // Task 500 — browser-direct upload of every image, in order, at the drop point (`pos`) or the
  // cursor; failures toast. Inserts via the handler's `view`, not `editor`: editorProps close over
  // the first render, where `editor` is still null (`immediatelyRender: false`).
  async function uploadAndInsertImages(view: EditorView, files: File[], pos?: number) {
    setUploadingCount((c) => c + files.length);
    let at = pos;
    for (const file of files) {
      try {
        const src = await uploadWikiImage(pageId, file);
        if (view.isDestroyed) continue; // user left Edit mid-upload
        const node = view.state.schema.nodes.image.create({ src });
        let tr = view.state.tr;
        if (at === undefined) {
          tr = tr.replaceSelectionWith(node);
        } else {
          at = Math.min(at, tr.doc.content.size); // doc may have shrunk while uploading
          tr = tr.replaceRangeWith(at, at, node);
          at = tr.mapping.map(at); // next image lands after this one
        }
        view.dispatch(tr);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image upload failed");
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write the page…" }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "wiki-prose outline-none text-[13px] leading-[1.7] text-[#3A4565] min-h-[300px]",
          "[&_h2]:font-heading [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-[#0B1533] [&_h2]:mt-7 [&_h2]:mb-2.5",
          "[&_h3]:font-heading [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#0B1533] [&_h3]:mt-5 [&_h3]:mb-2",
          "[&_p]:my-0 [&_p+p]:mt-3.5",
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1",
          "[&_blockquote]:flex [&_blockquote]:gap-2.5 [&_blockquote]:bg-[#EEF3FF] [&_blockquote]:border [&_blockquote]:border-[#D7E3FF] [&_blockquote]:rounded-[10px] [&_blockquote]:px-3.5 [&_blockquote]:py-3 [&_blockquote]:my-3.5 [&_blockquote]:text-[13px] [&_blockquote]:text-[#243B6B] [&_blockquote]:not-italic [&_blockquote_p]:my-0",
          "[&_pre]:bg-[#0F172A] [&_pre]:text-[#D7E0F7] [&_pre]:rounded-[10px] [&_pre]:px-4 [&_pre]:py-3.5 [&_pre]:my-3.5 [&_pre]:text-[12.5px] [&_pre]:leading-[1.6] [&_pre]:overflow-x-auto [&_pre]:font-mono",
          "[&_code]:font-mono [&_code]:text-[12.5px]",
          "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2.5 [&_li[data-type=taskItem]>label]:mt-1 [&_li[data-type=taskItem]_input]:pointer-events-none [&_li[data-type=taskItem]_input]:opacity-60 [&_li[data-type=taskItem]>div]:flex-1",
          "[&_li]:leading-[1.65] [&_li>p]:my-0 [&_li>p+p]:mt-1.5",
          "[&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#E2E7F2] [&_hr]:my-3.5",
          "[&_img]:max-w-full [&_img]:rounded-[10px] [&_img]:my-3",
          // Table spec per central-hub-design-system.md's "Table" component — header 9.5px/700
          // caps --muted on #FAFBFE, cells 11-12px padding/13px text with --line-soft dividers,
          // row hover --blue-50, first column padded 18px. `block`+`overflow-x-auto` directly on
          // the <table> makes the table itself the scroll container, so a too-wide table scrolls
          // horizontally with its scrollbar right under the table (not at the page bottom) and no
          // wrapper element is needed (Tiptap's TableView wrapper isn't serialized into stored
          // content_html). The bar is always visible via the `.wiki-prose table` scrollbar-color
          // rule in globals.css.
          "[&_table]:block [&_table]:w-max [&_table]:min-w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:my-3.5 [&_table]:border-collapse",
          "[&_th]:text-[9.5px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.09em] [&_th]:text-[#5F6A88] [&_th]:bg-[#FAFBFE] [&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:border-b [&_th]:border-[#EDF0F7]",
          "[&_td]:text-[13px] [&_td]:text-[#3A4565] [&_td]:px-2.5 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#EDF0F7]",
          "[&_th:first-child]:pl-[18px] [&_td:first-child]:pl-[18px]",
          "[&_tr]:transition-colors [&_tr:hover]:bg-[#F0F7FF]",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-[#94A3B8] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none"
        ),
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((i) => i.type.startsWith("image/"))
          .map((i) => i.getAsFile())
          .filter((f): f is File => f !== null);
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsertImages(view, files);
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadAndInsertImages(view, files, pos);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const marks: ToolbarItem[] = [
    { icon: Bold, title: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: () => editor?.isActive("bold") ?? false },
    { icon: Italic, title: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: () => editor?.isActive("italic") ?? false },
    { icon: Underline, title: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: () => editor?.isActive("underline") ?? false },
    { icon: Strikethrough, title: "Strikethrough", action: () => editor?.chain().focus().toggleStrike().run(), active: () => editor?.isActive("strike") ?? false },
  ];

  const structure: ToolbarItem[] = [
    { icon: Heading2, title: "Heading", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive("heading", { level: 2 }) ?? false },
    { icon: Heading3, title: "Subheading", action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor?.isActive("heading", { level: 3 }) ?? false },
    { icon: List, title: "Bulleted list", action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive("bulletList") ?? false },
    { icon: ListOrdered, title: "Numbered list", action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive("orderedList") ?? false },
    { icon: Quote, title: "Callout", action: () => editor?.chain().focus().toggleBlockquote().run(), active: () => editor?.isActive("blockquote") ?? false },
    { icon: Code2, title: "Code block", action: () => editor?.chain().focus().toggleCodeBlock().run(), active: () => editor?.isActive("codeBlock") ?? false },
    { icon: TableIcon, title: "Insert table", action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => editor?.isActive("table") ?? false },
  ];

  // Task 397 — only shown with the cursor inside a table, so the always-visible toolbar
  // doesn't grow permanently for a feature most pages won't use. Five distinct icons (not
  // Trash2 x3) so add/delete row/column/table are visually distinguishable, not just by
  // tooltip text.
  const tableControls: ToolbarItem[] = [
    { icon: Rows3, title: "Add row below", action: () => editor?.chain().focus().addRowAfter().run() },
    { icon: Columns3, title: "Add column right", action: () => editor?.chain().focus().addColumnAfter().run() },
    { icon: TableRowsSplit, title: "Delete row", action: () => editor?.chain().focus().deleteRow().run() },
    { icon: TableColumnsSplit, title: "Delete column", action: () => editor?.chain().focus().deleteColumn().run() },
    { icon: Trash2, title: "Delete table", action: () => editor?.chain().focus().deleteTable().run() },
  ];

  function ToolbarButton({ icon: Icon, title, action, active = () => false }: ToolbarItem) {
    return (
      <IconTip label={title}>
        <button
          type="button"
          onClick={action}
          aria-label={title}
          aria-pressed={active()}
          className={cn(
            "w-7.5 h-7.5 rounded-[7px] flex items-center justify-center cursor-pointer transition-colors",
            active() ? "bg-[#E5F1FF] text-[#007BFF]" : "text-[#5F6A88] hover:bg-[#F4F6FB]"
          )}
        >
          <Icon size={15} />
        </button>
      </IconTip>
    );
  }

  const inTable = editor?.isActive("table") ?? false;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5 pb-2.5 mb-4 border-b border-[#E2E7F2] flex-wrap">
        {marks.map((m) => <ToolbarButton key={m.title} {...m} />)}
        <div className="w-px h-5 bg-[#E2E7F2] self-center mx-1.5" />
        {structure.map((s) => <ToolbarButton key={s.title} {...s} />)}
        {inTable && (
          <>
            <div className="w-px h-5 bg-[#E2E7F2] self-center mx-1.5" />
            {tableControls.map((t) => <ToolbarButton key={t.title} {...t} />)}
          </>
        )}
        <span aria-live="polite" className="ml-auto flex items-center gap-1.5 text-[11px] text-[#5F6A88]">
          {uploadingCount > 0 && (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {uploadingCount > 1 ? `Uploading ${uploadingCount} images…` : "Uploading image…"}
            </>
          )}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
