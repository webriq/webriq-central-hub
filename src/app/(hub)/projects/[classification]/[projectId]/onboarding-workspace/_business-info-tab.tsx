"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, Check, Loader2, FolderOpen, Eye, Download } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AssetFolder, AssetRow } from "./_wizard-v2-types";
import { textMuted, textPrimary, cardCls, fieldLabelCls, fieldInputCls, formatFileSize, RichTextField, IconTip } from "./_shared-ui";
import { FileTypeTile, FilePreviewModal } from "./_file-previews";

// Matches ../_onboarding-wizard.tsx's ContactEntry shape exactly.
type ContactEntry = { fullName: string; position: string; email: string; phone: string; socialMedia: string };

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidPhone(v: string): boolean {
  return /^[+()0-9\s-]{6,}$/.test(v.trim());
}
function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Mockup 02's required (*) / optional label markers — every field states which it is instead of
// leaving it implicit in placeholder text.
function FieldLabel({ children, required, optional }: { children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <label className={fieldLabelCls}>
      {children} {required && <span className="text-[#C0392B]">*</span>}
      {optional && <span className={cn("font-normal", textMuted)}>(optional)</span>}
    </label>
  );
}

// Shared field-block heading (title + hint) — matches mockup 02's `.field-block h3`/`p.hint`
// pattern exactly (Space Grotesk/font-heading, 15px, semibold; 11px muted hint, 14px gap below),
// reused for every top-level grouping (Contacts, Web presence, Business facts, Notes).
function GroupHeading({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h3 className={cn("font-heading text-[15px] font-semibold mb-[3px]", textPrimary)}>{title}</h3>
      <p className={cn("text-[11px] mb-3.5", textMuted)}>{description}</p>
    </>
  );
}

// Task 202 follow-up: Business Info is Kickoff-only now — Outcome Target, Migration Checklist,
// Content Map, and Client Sign-off no longer have their own Business Info card. Their content
// is file-first (upload into their own Files-tab folder); there is no separate typed-notes
// surface for them anymore, matching the client's "just dump raw data into a folder" framing.
export function BusinessInfoTab({
  customerId, wizardData, folders, assets, canEdit, onSaveSection, onOpenFolder,
}: {
  customerId: string;
  wizardData: Record<string, Record<string, unknown>>;
  folders: AssetFolder[];
  assets: AssetRow[];
  canEdit: boolean;
  onSaveSection: (subPhaseKey: string, data: Record<string, unknown>) => Promise<void>;
  onOpenFolder: (folderName: string) => void;
}) {
  const notesFolder = folders.find((f) => f.name === "Notes" && f.parent_folder_id === null);
  const notesFiles = useMemo(
    () => (notesFolder ? assets.filter((a) => a.type === "file" && a.folder_id === notesFolder.id) : []),
    [assets, notesFolder]
  );

  return (
    <div className={cardCls}>
      <div className="px-4 py-4">
        <KickoffFields
          data={wizardData.kickoff ?? {}}
          canEdit={canEdit}
          onSave={(d) => onSaveSection("kickoff", d)}
          customerId={customerId}
          notesFiles={notesFiles}
          onOpenFolder={onOpenFolder}
        />
      </div>
    </div>
  );
}

// Post-ship follow-up — "Dannea M" not "Dannea Mendoza": first name in full, second word's
// initial only. Single-word names pass through unchanged.
function shortUploaderName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[1][0].toUpperCase()}`;
}

// Task 219 — file-reference card: type-aware icon (the same FileTypeTile used by the Files
// tab, so the two never look inconsistent), a size+uploaded(+by name) line, an eye button that
// opens an in-app preview modal (replacing the old "Open" button, which opened a new tab), and
// a download button.
function NoteFileCard({ customerId, file }: { customerId: string; file: AssetRow }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileName = file.file_name ?? file.label;

  const fetchFileUrl = async (download: boolean) => {
    const res = await fetch(`/api/customers/${customerId}/assets/${file.id}/file-url${download ? "?download=1" : ""}`);
    if (!res.ok) throw new Error();
    const data: { url: string } = await res.json();
    return data.url;
  };

  // Opens the modal immediately (matches ../_onboarding-wizard.tsx's handleViewOutcomeFile) —
  // the fetch happens after, while the modal's own loading state is visible, instead of making
  // the whole click wait on the network round-trip before anything appears.
  const handlePreview = () => {
    setPreviewOpen(true);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    fetchFileUrl(false)
      .then(setPreviewUrl)
      .catch(() => setPreviewError("Failed to load file preview."))
      .finally(() => setPreviewLoading(false));
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await fetchFileUrl(true);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Non-fatal — no dedicated error UI for a sandbox download action.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#E2E7F2] px-3.5 py-3">
      <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0">
        <FileTypeTile mime={file.file_mime_type ?? ""} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12.5px] font-semibold truncate", textPrimary)}>{fileName}</p>
        <p className={cn("text-[10.5px]", textMuted)}>
          {formatFileSize(file.file_size)} · Uploaded {formatRelativeTime(file.created_at)}
          {file.uploader_name ? ` by ${shortUploaderName(file.uploader_name)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <IconTip label="Preview">
          <button
            type="button"
            onClick={handlePreview}
            aria-label="Preview"
            className="w-9 h-9 rounded-[9px] border border-[#E2E7F2] flex items-center justify-center text-[#3A4565] bg-white cursor-pointer hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors"
          >
            <Eye size={14} />
          </button>
        </IconTip>
        <IconTip label="Download">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Download"
            className="w-9 h-9 rounded-[9px] border border-[#E2E7F2] flex items-center justify-center text-[#3A4565] bg-white cursor-pointer hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors disabled:opacity-60"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
        </IconTip>
      </div>
      {previewOpen && (
        <FilePreviewModal
          fileName={fileName}
          mimeType={file.file_mime_type ?? ""}
          url={previewUrl}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function useSaveStatus() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  return { status, setStatus, savedAt, setSavedAt };
}

// Mockup 02's full-width autosave footer — one row under the whole grid instead of a per-column
// inline indicator.
function AutosaveFooter({ status, savedAt }: { status: "idle" | "saving" | "saved" | "error"; savedAt: Date | null }) {
  if (status === "idle" && !savedAt) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] mt-4 pt-3.5 border-t border-[#EDF0F7]">
      {status === "saving" && <><Loader2 size={13} className={cn("animate-spin", textMuted)} /><span className={textMuted}>Saving…</span></>}
      {status === "saved" && savedAt && <><Check size={13} className="text-[#177E48]" /><span className={textMuted}>Saved automatically · last change {formatRelativeTime(savedAt)}</span></>}
      {status === "error" && <span className="text-[#C0392B]">Failed to save — retrying on the next change.</span>}
    </div>
  );
}

function KickoffFields({ data, canEdit, onSave, customerId, notesFiles, onOpenFolder }: {
  data: Record<string, unknown>; canEdit: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  customerId: string;
  notesFiles: AssetRow[];
  onOpenFolder: (folderName: string) => void;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>((data.contacts as ContactEntry[]) ?? []);
  const [websiteUrl, setWebsiteUrl] = useState<string>((data.websiteUrl as string) ?? "");
  // At least one visible row by default — an empty array left just the "+ Add another URL"
  // button with nothing to add "another" to (reported bug: no way to enter the first URL).
  const savedCompetitorUrls = data.competitorUrls as string[] | undefined;
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(savedCompetitorUrls?.length ? savedCompetitorUrls : [""]);
  const [businessFacts, setBusinessFacts] = useState<string>((data.businessFacts as string) ?? "");
  const { status, setStatus, savedAt, setSavedAt } = useSaveStatus();
  const lastSaved = useRef(JSON.stringify({ contacts, websiteUrl, competitorUrls, businessFacts }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const payload = { contacts, websiteUrl, competitorUrls: competitorUrls.map((u) => u.trim()).filter(Boolean), businessFacts };
    const json = JSON.stringify(payload);
    if (json === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("saving");
      onSave(payload)
        .then(() => { lastSaved.current = json; setStatus("saved"); setSavedAt(new Date()); })
        .catch(() => setStatus("error"));
    }, 1500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [contacts, websiteUrl, competitorUrls, businessFacts, onSave, setStatus, setSavedAt]);

  const updateContact = (i: number, patch: Partial<ContactEntry>) => setContacts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeContact = (i: number) => setContacts((prev) => prev.filter((_, j) => j !== i));
  const addContact = () => setContacts((prev) => [...prev, { fullName: "", position: "", email: "", phone: "", socialMedia: "" }]);
  const miniInputCls = cn(
    "w-full text-[13px] rounded-[9px] px-3 py-2.5 border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    "bg-white border-[#E2E7F2] text-[#0B1533] placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
  );

  const websiteValid = websiteUrl.trim() !== "" && isValidUrl(websiteUrl.trim());
  const websiteInitial = (() => {
    if (!websiteValid) return null;
    try { return new URL(websiteUrl.trim()).hostname.replace(/^www\./, "")[0]?.toUpperCase() ?? "•"; } catch { return null; }
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5">
      <div className="flex flex-col gap-5">
        <div>
          <GroupHeading title="Contacts" description="Who we coordinate with during project development process and maintenance." />
          <div className="flex flex-col gap-3">
            {contacts.map((c, i) => {
              const emailInvalid = c.email.trim() !== "" && !isValidEmail(c.email);
              const phoneInvalid = c.phone.trim() !== "" && !isValidPhone(c.phone);
              return (
                <div key={i} className="relative rounded-[9px] border-[1.5px] border-[#E2E7F2] bg-white p-3 pt-4 flex flex-col gap-2">
                  {i === 0 ? (
                    <span className="absolute -top-2 left-3 inline-flex items-center text-[9.5px] font-bold uppercase tracking-wide text-[#0063D6] bg-[#E5F1FF] rounded-[5px] px-2 py-0.5">Primary contact</span>
                  ) : (
                    canEdit && (
                      <IconTip label="Remove contact">
                        <button
                          type="button"
                          onClick={() => removeContact(i)}
                          aria-label={`Remove contact ${i + 1}`}
                          className="absolute top-2 right-2 w-6 h-6 rounded-[6px] flex items-center justify-center text-[#5F6A88] bg-transparent border-none cursor-pointer hover:bg-[#FDE8E6] hover:text-[#C0392B] transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </IconTip>
                    )
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel required>Full name</FieldLabel>
                      <input value={c.fullName} onChange={(e) => updateContact(i, { fullName: e.target.value })} placeholder="e.g. Jordan Lee" className={miniInputCls} disabled={!canEdit} />
                    </div>
                    <div>
                      <FieldLabel optional>Position</FieldLabel>
                      <input value={c.position} onChange={(e) => updateContact(i, { position: e.target.value })} placeholder="e.g. Operations Manager" className={miniInputCls} disabled={!canEdit} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel required>Email</FieldLabel>
                      <input value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="name@company.com" className={cn(miniInputCls, emailInvalid && "border-[#C0392B]")} disabled={!canEdit} />
                      {emailInvalid && <p className="text-[10px] text-[#C0392B] mt-0.5">Enter a full address, e.g. name@company.com</p>}
                    </div>
                    <div>
                      <FieldLabel optional>Phone</FieldLabel>
                      <input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} placeholder="+1 (555) 000-0000" className={cn(miniInputCls, phoneInvalid && "border-[#C0392B]")} disabled={!canEdit} />
                      {phoneInvalid && <p className="text-[10px] text-[#C0392B] mt-0.5">Enter a valid phone number.</p>}
                    </div>
                  </div>
                  <div>
                    <FieldLabel optional>Social accounts (comma-separated)</FieldLabel>
                    <input value={c.socialMedia} onChange={(e) => updateContact(i, { socialMedia: e.target.value })} placeholder="linkedin.com/company/..., @handle" className={miniInputCls} disabled={!canEdit} />
                  </div>
                </div>
              );
            })}
          </div>
          {canEdit && (
            <button type="button" onClick={addContact} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#0063D6] border border-dashed border-[#A8C6F5] rounded-full py-2 bg-transparent cursor-pointer hover:bg-[#F0F7FF] hover:border-[#007BFF] transition-colors">
              <Plus size={13} /> Add another contact
            </button>
          )}
        </div>
        <div>
          <GroupHeading title="Web presence" description="Used to brief the design and content team." />
          <div className="flex flex-col gap-4">
            <div>
              <FieldLabel optional>Current website URL</FieldLabel>
              <div className="relative">
                {websiteInitial && (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-[4px] bg-[#E5F1FF] text-[#0063D6] text-[8px] font-bold flex items-center justify-center">{websiteInitial}</span>
                )}
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.yourdomain.com"
                  disabled={!canEdit}
                  className={cn(fieldInputCls, websiteInitial && "pl-8", websiteValid && "pr-8 border-[#177E48]")}
                />
                {websiteValid && <Check size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#177E48]" />}
              </div>
            </div>
            <div>
              <FieldLabel optional>Competitor / reference URLs</FieldLabel>
              <div className="flex flex-col gap-2">
                {competitorUrls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={url}
                      onChange={(e) => setCompetitorUrls((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))}
                      placeholder="https://www.competitordomain.com"
                      disabled={!canEdit}
                      className={cn(fieldInputCls, "flex-1")}
                    />
                    {canEdit && competitorUrls.length > 1 && (
                      <IconTip label="Remove">
                        <button
                          type="button"
                          onClick={() => setCompetitorUrls((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remove URL ${i + 1}`}
                          className="w-9 h-9 shrink-0 rounded-[9px] border border-[#E2E7F2] flex items-center justify-center text-[#5F6A88] bg-transparent cursor-pointer hover:border-[#C0392B] hover:text-[#C0392B] transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </IconTip>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <button type="button" onClick={() => setCompetitorUrls((prev) => [...prev, ""])} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#0063D6] border border-dashed border-[#A8C6F5] rounded-full py-2 bg-transparent cursor-pointer hover:bg-[#F0F7FF] hover:border-[#007BFF] transition-colors">
                  <Plus size={13} /> Add another URL
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <RichTextField
          label="Business facts"
          description="History, services, value proposition, target customers."
          value={businessFacts}
          onChange={setBusinessFacts}
          placeholder="Start typing, or paste from your notes…"
          disabled={!canEdit}
          maxLength={2000}
        />
        <div>
          <GroupHeading
            title="Notes"
            description="Upload documents/notes recorded during the client kickoff and sign-off calls. Added files on the notes folder will be listed here."
          />
          {notesFiles.length > 0 ? (
            <div className="flex flex-col gap-2 mb-3">
              {notesFiles.map((file) => (
                <NoteFileCard key={file.id} customerId={customerId} file={file} />
              ))}
            </div>
          ) : (
            <p className={cn("text-[11.5px] mb-3", textMuted)}>No files uploaded yet.</p>
          )}
          <button
            type="button"
            onClick={() => onOpenFolder("Notes")}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline"
          >
            <FolderOpen size={13} /> Go to Notes folder
          </button>
        </div>
      </div>
      <div className="lg:col-span-2">
        <AutosaveFooter status={status} savedAt={savedAt} />
      </div>
    </div>
  );
}
