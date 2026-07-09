"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

type KbFile = {
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  path: string;
};

type Customer = {
  id: string;
  customer_id: string;
  company_name: string;
};

const cardCls = "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeBasePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [loadedForId, setLoadedForId] = useState<string | null>(null);
  const loadingFiles = selectedId !== null && selectedId !== loadedForId;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // GET /api/customers returns a plain array (not wrapped in { customers: [] })
    fetch("/api/customers")
      .then((r) => r.json())
      .then((json) => setCustomers(Array.isArray(json) ? json : []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let ignore = false;
    const requestedId = selectedId;
    fetch(`/api/kb/${requestedId}`)
      .then((r) => r.json())
      .then((json) => { if (!ignore) setFiles(json.files ?? []); })
      .finally(() => { if (!ignore) setLoadedForId(requestedId); });
    return () => { ignore = true; };
  }, [selectedId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploadError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("customerId", selectedId);
    const res = await fetch("/api/kb/upload", { method: "POST", body: form });
    if (res.ok) {
      const listRes = await fetch(`/api/kb/${selectedId}`);
      const json = await listRes.json();
      setFiles(json.files ?? []);
    } else {
      const json = await res.json().catch(() => ({}));
      setUploadError(json.error ?? "Upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="p-6 flex gap-4 flex-1 overflow-hidden">
      {/* Left panel: customer selector */}
      <div className={cn(cardCls, "w-56 shrink-0 flex flex-col overflow-hidden")}>
        <div className="px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-900">Customers</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {customers.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
          ) : (
            customers.map((c) => (
              <button
                key={c.customer_id}
                onClick={() => setSelectedId(c.customer_id)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm border-none cursor-pointer font-[inherit] border-b border-slate-50 transition-colors",
                  selectedId === c.customer_id
                    ? "bg-indigo-50 text-brand font-semibold"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                {c.company_name}
                <div className="text-[11px] text-slate-400 font-normal">{c.customer_id}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: file list */}
      <div className={cn(cardCls, "flex-1 flex flex-col overflow-hidden")}>
        <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-900">
            {selectedId ? `KB Files — ${selectedId}` : "Select a customer"}
          </span>
          {selectedId && (
            <div className="flex items-center gap-2">
              {uploadError && (
                <span className="text-xs text-red-500">{uploadError}</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.txt,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-semibold px-3 py-1.5 bg-brand text-white rounded-lg border-none cursor-pointer font-[inherit] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {uploading ? "Uploading…" : "+ Upload File"}
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Select a customer to view their KB files.</p>
            </div>
          ) : loadingFiles ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Loading files…</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">No files uploaded yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">File</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Size</th>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={f.path} className={cn("border-b border-slate-50", i % 2 === 1 && "bg-slate-50/50")}>
                    <td className="px-5 py-2.5 font-medium text-slate-900">{f.name}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{f.mimeType || "—"}</td>
                    <td className="px-5 py-2.5 text-slate-500 text-xs">{formatBytes(f.size)}</td>
                    <td className="px-5 py-2.5 text-slate-400 text-xs">
                      {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
