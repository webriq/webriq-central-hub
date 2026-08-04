"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, FolderOpen, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetFolder } from "./_wizard-v2-types";
import { textMuted, cardCls, fieldLabelCls, fieldInputCls, RichTextField, IconTip } from "./_shared-ui";

// Matches ../_onboarding-wizard.tsx's ContactEntry shape exactly.
type ContactEntry = { fullName: string; position: string; email: string; phone: string; socialMedia: string };

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidPhone(v: string): boolean {
  return /^[+()0-9\s-]{6,}$/.test(v.trim());
}

// Task 202 follow-up: Business Info is Kickoff-only now — Outcome Target, Migration Checklist,
// Content Map, and Client Sign-off no longer have their own Business Info card. Their content
// is file-first (upload into their own Files-tab folder); there is no separate typed-notes
// surface for them anymore, matching the client's "just dump raw data into a folder" framing.
export function BusinessInfoTab({
  wizardData, folders, canEdit, onSaveSection, onOpenFolder,
}: {
  wizardData: Record<string, Record<string, unknown>>;
  folders: AssetFolder[];
  canEdit: boolean;
  onSaveSection: (subPhaseKey: string, data: Record<string, unknown>) => Promise<void>;
  onOpenFolder: (folderName: string) => void;
}) {
  const notesFolderExists = folders.some((f) => f.name === "Notes" && f.parent_folder_id === null);

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-end px-4 py-3.5 border-b border-[#EDF0F7]">
        <button
          type="button"
          onClick={() => onOpenFolder("Notes")}
          disabled={!notesFolderExists}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-default disabled:no-underline"
        >
          <FolderOpen size={13} /> Kickoff Notes
        </button>
      </div>
      <div className="px-4 py-4">
        <KickoffFields data={wizardData.kickoff ?? {}} canEdit={canEdit} onSave={(d) => onSaveSection("kickoff", d)} />
      </div>
    </div>
  );
}

function useSaveStatus() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return { status, setStatus };
}

function SaveHint({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") return <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88]"><Loader2 size={11} className="animate-spin" /> Saving…</span>;
  if (status === "saved") return <span className="inline-flex items-center gap-1 text-[11px] text-[#177E48]"><Check size={11} /> Saved</span>;
  if (status === "error") return <span className="text-[11px] text-[#C0392B]">Failed to save</span>;
  return null;
}

function KickoffFields({ data, canEdit, onSave }: {
  data: Record<string, unknown>; canEdit: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>((data.contacts as ContactEntry[]) ?? []);
  const [websiteUrl, setWebsiteUrl] = useState<string>((data.websiteUrl as string) ?? "");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>((data.competitorUrls as string[]) ?? []);
  const [competitorInput, setCompetitorInput] = useState("");
  const [businessFacts, setBusinessFacts] = useState<string>((data.businessFacts as string) ?? "");
  const [additionalNotes, setAdditionalNotes] = useState<string>((data.additionalNotes as string) ?? "");
  const { status, setStatus } = useSaveStatus();
  const lastSaved = useRef(JSON.stringify({ contacts, websiteUrl, competitorUrls, businessFacts, additionalNotes }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const payload = { contacts, websiteUrl, competitorUrls, businessFacts, additionalNotes };
    const json = JSON.stringify(payload);
    if (json === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("saving");
      onSave(payload)
        .then(() => { lastSaved.current = json; setStatus("saved"); })
        .catch(() => setStatus("error"));
    }, 1500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [contacts, websiteUrl, competitorUrls, businessFacts, additionalNotes, onSave, setStatus]);

  const updateContact = (i: number, patch: Partial<ContactEntry>) => setContacts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeContact = (i: number) => setContacts((prev) => prev.filter((_, j) => j !== i));
  const addContact = () => setContacts((prev) => [...prev, { fullName: "", position: "", email: "", phone: "", socialMedia: "" }]);
  const miniInputCls = cn(
    "w-full text-[13px] rounded-[9px] px-3 py-2.5 border-[1.5px] outline-none transition-[border-color,box-shadow] duration-150 font-[inherit]",
    "bg-white border-[#E2E7F2] text-[#0B1533] placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
  );

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
                <div key={i} className="rounded-[9px] border-[1.5px] border-[#E2E7F2] bg-white p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    {i === 0 ? (
                      <span className="inline-flex items-center text-[10px] font-semibold text-[#007BFF] bg-[#E5F1FF] rounded-full px-2 py-0.5">Primary contact</span>
                    ) : (
                      <span className={cn("text-[10px] font-medium", textMuted)}>Contact {i + 1}</span>
                    )}
                    {i > 0 && canEdit && (
                      <button type="button" onClick={() => removeContact(i)} className="bg-transparent border-none cursor-pointer text-[#C0392B] p-0 flex items-center gap-1 text-[11px]" aria-label={`Remove contact ${i + 1}`}>
                        <Trash2 size={11} /> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={c.fullName} onChange={(e) => updateContact(i, { fullName: e.target.value })} placeholder="Full name" className={miniInputCls} disabled={!canEdit} />
                    <input value={c.position} onChange={(e) => updateContact(i, { position: e.target.value })} placeholder="Position (optional)" className={miniInputCls} disabled={!canEdit} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input value={c.email} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="Email" className={cn(miniInputCls, emailInvalid && "border-[#C0392B]")} disabled={!canEdit} />
                      {emailInvalid && <p className="text-[10px] text-[#C0392B] mt-0.5">Enter a valid email.</p>}
                    </div>
                    <div>
                      <input value={c.phone} onChange={(e) => updateContact(i, { phone: e.target.value })} placeholder="Phone (optional)" className={cn(miniInputCls, phoneInvalid && "border-[#C0392B]")} disabled={!canEdit} />
                      {phoneInvalid && <p className="text-[10px] text-[#C0392B] mt-0.5">Enter a valid phone number.</p>}
                    </div>
                  </div>
                  <input value={c.socialMedia} onChange={(e) => updateContact(i, { socialMedia: e.target.value })} placeholder="Social media accounts (optional, comma-separated)" className={miniInputCls} disabled={!canEdit} />
                </div>
              );
            })}
          </div>
          {canEdit && (
            <IconTip label="Add contact">
              <button type="button" onClick={addContact} aria-label="Add contact" className="inline-flex items-center justify-center w-11 h-11 mt-2 rounded-[9px] border-[1.5px] border-[#007BFF]/25 text-[#007BFF] bg-transparent cursor-pointer hover:bg-[#007BFF]/5 transition-colors">
                <Plus size={16} />
              </button>
            </IconTip>
          )}
        </div>
        <div>
          <label className={fieldLabelCls}>Current website URL</label>
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://client.com" disabled={!canEdit} className={fieldInputCls} />
        </div>
        <div>
          <label className={fieldLabelCls}>Competitor / reference URLs</label>
          {competitorUrls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {competitorUrls.map((u, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#007BFF] bg-[#E5F1FF] rounded-md px-2.5 py-1">
                  {u}
                  {canEdit && (
                    <button onClick={() => setCompetitorUrls((prev) => prev.filter((_, j) => j !== i))} className="bg-transparent border-none cursor-pointer text-[#007BFF] p-0 flex" aria-label={`Remove ${u}`}>
                      <Trash2 size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <input
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (competitorInput.trim()) { setCompetitorUrls((p) => [...p, competitorInput.trim()]); setCompetitorInput(""); } } }}
                placeholder="https://competitor.com"
                className={fieldInputCls}
              />
              <button type="button" onClick={() => { if (competitorInput.trim()) { setCompetitorUrls((p) => [...p, competitorInput.trim()]); setCompetitorInput(""); } }} className="px-3.5 rounded-[9px] border-[1.5px] border-[#007BFF]/25 text-[#007BFF] bg-transparent cursor-pointer">
                <Plus size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <RichTextField label="Business facts" value={businessFacts} onChange={setBusinessFacts} placeholder="History, services, value proposition, target customers…" disabled={!canEdit} />
        <RichTextField label="Additional notes" value={additionalNotes} onChange={setAdditionalNotes} placeholder="Leave blank if none." disabled={!canEdit} />
        <SaveHint status={status} />
      </div>
    </div>
  );
}
