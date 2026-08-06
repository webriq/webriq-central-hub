"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, X, FileText, Check, Loader2 } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AssetFolder, AssetRow } from "./_wizard-v2-types";
import { textMuted, textPrimary, cardCls, fieldLabelCls, fieldInputCls, RichTextField, IconTip } from "./_shared-ui";

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
    <div className="flex flex-col gap-3.5">
      <div className={cardCls}>
        <div className="px-4 py-4">
          <KickoffFields data={wizardData.kickoff ?? {}} canEdit={canEdit} onSave={(d) => onSaveSection("kickoff", d)} />
        </div>
      </div>

      {notesFiles.length > 0 && (
        <div className={cardCls}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDF0F7]">
            <span className={cn("text-[12.5px] font-semibold", textPrimary)}>Kickoff notes</span>
            <button
              type="button"
              onClick={() => onOpenFolder("Notes")}
              className="text-[11.5px] font-medium text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline"
            >
              View all in Files
            </button>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {notesFiles.map((file) => (
              <KickoffNoteCard key={file.id} customerId={customerId} file={file} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mockup 02's kickoff-notes reference card — icon, filename, upload date (no uploader name: the
// row's byline is only "Uploaded Jul 24" not "Uploaded by X · Jul 24" since customer_assets has
// no uploader column), "Open" button (signed URL in a new tab, same as Files tab's View action).
function KickoffNoteCard({ customerId, file }: { customerId: string; file: AssetRow }) {
  const [opening, setOpening] = useState(false);
  const handleOpen = async () => {
    setOpening(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/assets/${file.id}/file-url`);
      if (!res.ok) throw new Error();
      const data: { url: string } = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      // Non-fatal — no dedicated error UI for a sandbox preview action.
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#E2E7F2] px-3.5 py-3">
      <span className="w-8.5 h-8.5 rounded-[9px] bg-[#E5F1FF] text-[#0063D6] flex items-center justify-center shrink-0">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12.5px] font-semibold truncate", textPrimary)}>{file.file_name ?? file.label}</p>
        <p className={cn("text-[10.5px]", textMuted)}>Uploaded {formatRelativeTime(file.created_at)}</p>
      </div>
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] cursor-pointer hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors disabled:opacity-60"
      >
        {opening ? "Opening…" : "Open"}
      </button>
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

function KickoffFields({ data, canEdit, onSave }: {
  data: Record<string, unknown>; canEdit: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>((data.contacts as ContactEntry[]) ?? []);
  const [websiteUrl, setWebsiteUrl] = useState<string>((data.websiteUrl as string) ?? "");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>((data.competitorUrls as string[]) ?? []);
  const [businessFacts, setBusinessFacts] = useState<string>((data.businessFacts as string) ?? "");
  const [additionalNotes, setAdditionalNotes] = useState<string>((data.additionalNotes as string) ?? "");
  const { status, setStatus, savedAt, setSavedAt } = useSaveStatus();
  const lastSaved = useRef(JSON.stringify({ contacts, websiteUrl, competitorUrls, businessFacts, additionalNotes }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const payload = { contacts, websiteUrl, competitorUrls: competitorUrls.map((u) => u.trim()).filter(Boolean), businessFacts, additionalNotes };
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
  }, [contacts, websiteUrl, competitorUrls, businessFacts, additionalNotes, onSave, setStatus, setSavedAt]);

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
      <div className="flex flex-col gap-4">
        <div>
          <label className={fieldLabelCls}>Contacts</label>
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
          <FieldLabel required>Current website URL</FieldLabel>
          <div className="relative">
            {websiteInitial && (
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-[4px] bg-[#E5F1FF] text-[#0063D6] text-[8px] font-bold flex items-center justify-center">{websiteInitial}</span>
            )}
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://client.com"
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
                  placeholder="https://another-competitor.com"
                  disabled={!canEdit}
                  className={cn(fieldInputCls, "flex-1")}
                />
                {canEdit && (
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
      <div className="flex flex-col gap-4">
        <RichTextField label="Business facts" value={businessFacts} onChange={setBusinessFacts} placeholder="History, services, value proposition, target customers…" disabled={!canEdit} maxLength={2000} />
        <RichTextField label="Additional notes" value={additionalNotes} onChange={setAdditionalNotes} placeholder="Leave blank if none." disabled={!canEdit} maxLength={2000} />
      </div>
      <div className="lg:col-span-2">
        <AutosaveFooter status={status} savedAt={savedAt} />
      </div>
    </div>
  );
}
