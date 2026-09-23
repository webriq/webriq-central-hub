"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIKI_PRODUCTS, type WikiPageSummary, type WikiProduct } from "@/types/wiki";

// Task 396 — Import modal. `.docx`/`.md` are converted + sanitized entirely client-side
// (mammoth/marked/DOMPurify — all already installed, already proven in this exact codebase:
// mammoth+marked client-side in `_onboarding-wizard.tsx`'s file previews, DOMPurify client-side
// in `_message-html.ts`'s sanitizeMessageHtml). `.pdf` needs Node (`pdf-parse` reads `fs`), so
// that one file type is uploaded to the new `/api/wiki/pages/import-pdf` route instead. Either
// way the result is a plain `contentHtml` string handed to the existing
// `POST /api/wiki/pages` (task 395), same as `WikiNewPageModal` — this modal never talks to
// `wiki_pages` directly.
const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";
const ACCEPTED_EXTENSIONS = [".docx", ".md", ".markdown", ".pdf"];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB — matches the server-side PDF route's own cap

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return (dot === -1 ? filename : filename.slice(0, dot)).trim();
}

async function convertToHtml(file: File): Promise<string> {
  const ext = extensionOf(file.name);
  const { default: DOMPurify } = await import("dompurify");

  if (ext === ".pdf") {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/wiki/pages/import-pdf", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to read this PDF");
    }
    const { contentHtml } = (await res.json()) as { contentHtml: string };
    // Task 398 — a "complex" page's contentHtml may come back from an LLM vision transcription
    // call rather than this app's own trusted RTE, so it's sanitized the same as every other
    // non-authored import type below (a no-op for "simple" pages, which are already self-escaped).
    return DOMPurify.sanitize(contentHtml, { USE_PROFILES: { html: true } });
  }

  if (ext === ".docx") {
    const { default: mammoth } = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true } });
  }

  if (ext === ".md" || ext === ".markdown") {
    const { marked } = await import("marked");
    const text = await file.text();
    const html = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  throw new Error(`Unsupported file type: ${ext || "unknown"}`);
}

export function WikiImportModal({
  defaultProduct,
  defaultParentId,
  pages,
  onClose,
  onCreated,
}: {
  defaultProduct: WikiProduct;
  defaultParentId: string | null;
  pages: WikiPageSummary[];
  onClose: () => void;
  onCreated: (page: WikiPageSummary) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<WikiProduct>(defaultProduct);
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentOptions = pages.filter((p) => p.product === product);

  function pickFile(picked: File | null) {
    setError(null);
    if (!picked) return;
    const ext = extensionOf(picked.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type "${ext || picked.name}" — supports ${ACCEPTED_EXTENSIONS.join(", ")}.`);
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError(`File size exceeds 15MB limit (${(picked.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }
    setFile(picked);
    if (!title.trim()) setTitle(titleFromFilename(picked.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const contentHtml = await convertToHtml(file);
      const res = await fetch("/api/wiki/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, title: title.trim(), parentId: parentId || null, contentHtml }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to create page");
        return;
      }
      const page = (await res.json()) as WikiPageSummary;
      onCreated(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import this file");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="w-full max-w-md rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E7F2]">
          <h3 className="font-heading text-[15px] font-semibold text-[#0B1533]">Import a document</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#94A3B8] hover:text-[#5F6A88] transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          <p className="text-[12px] text-[#5F6A88] -mt-1">Creates a new page in the selected space from an uploaded file.</p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0] ?? null); }}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed px-4 py-6 text-center cursor-pointer transition-colors",
              dragOver ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#E2E7F2] bg-[#F4F6FB] hover:border-[#A8C6F5]"
            )}
          >
            {file ? (
              <>
                <FileText size={20} className="text-[#007BFF]" />
                <span className="text-[12.5px] font-semibold text-[#0B1533]">{file.name}</span>
                <span className="text-[11px] text-[#94A3B8]">Click or drop to replace</span>
              </>
            ) : (
              <>
                <Upload size={20} className="text-[#94A3B8]" />
                <span className="text-[12.5px] text-[#5F6A88]">
                  Drag a file here, or <span className="text-[#007BFF] font-semibold">browse</span>
                </span>
                <span className="text-[11px] text-[#94A3B8]">Supports .docx · .md · .pdf</span>
              </>
            )}
          </button>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-import-title">Title</label>
            <input
              id="wiki-import-title"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the file name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-import-space">Space</label>
            <select
              id="wiki-import-space"
              className={cn(inputClass, "cursor-pointer")}
              value={product}
              onChange={(e) => { setProduct(e.target.value as WikiProduct); setParentId(""); }}
            >
              {WIKI_PRODUCTS.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="wiki-import-parent">Parent page (optional)</label>
            <select
              id="wiki-import-parent"
              className={cn(inputClass, "cursor-pointer")}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">None — top level</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-[12.5px] font-semibold text-[#5F6A88] px-4 py-2 rounded-full border border-[#E2E7F2] bg-white cursor-pointer transition-colors hover:border-[#A8C6F5] disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !file || !title.trim()}
              className="text-[12.5px] font-semibold text-white px-4 py-2 rounded-full bg-[#007BFF] cursor-pointer transition-colors hover:bg-[#0063D6] disabled:opacity-45 flex items-center gap-1.5"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Import & create page
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
