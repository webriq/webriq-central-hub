"use client";

import { useState } from "react";
import { Plus, Link2, KeyRound, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, StaffPerson, ASSET_ROLE_OPTIONS } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls, fieldLabelCls, fieldInputCls, PillTabs, IconTip } from "./_shared-ui";
import { PermissionPicker, permissionSummary } from "./_permission-picker";

function isValidUrl(v: string): boolean {
  try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
}

export function AccessTab({
  customerId, projectUuid, assets, staffDirectory, canEdit, onCreated, onDelete, onPermissionChange,
}: {
  customerId: string; projectUuid: string; assets: AssetRow[]; staffDirectory: StaffPerson[]; canEdit: boolean;
  onCreated: (asset: AssetRow) => void;
  onDelete: (id: string) => void;
  onPermissionChange: (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
}) {
  const [subTab, setSubTab] = useState<"credentials" | "links">("credentials");
  const [modalOpen, setModalOpen] = useState(false);

  const items = assets.filter((a) => a.type === (subTab === "credentials" ? "credential" : "link"));

  return (
    <div className={cn(cardCls, "p-4")}>
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <PillTabs tabs={[{ id: "credentials", label: "Credentials" }, { id: "links", label: "Links" }]} active={subTab} onChange={setSubTab} />
        {canEdit && (
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-[#007BFF] text-white cursor-pointer border-none hover:bg-[#0063D6] transition-colors">
            <Plus size={13} /> Add {subTab === "credentials" ? "credential" : "link"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 rounded-[10px] border-2 border-dashed border-[#E2E7F2] text-center px-6">
          {subTab === "credentials" ? <KeyRound size={22} className="text-[#A8B3CC]" /> : <Link2 size={22} className="text-[#A8B3CC]" />}
          <p className={cn("text-[12.5px] max-w-64", textMuted)}>
            {subTab === "credentials" ? "No credentials shared yet." : "No links shared yet."}
            {canEdit && " Add one above."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[10px] border border-[#E2E7F2] bg-white">
              <div className="min-w-0">
                <p className={cn("text-[12.5px] font-medium truncate", textPrimary)}>{item.label}</p>
                <p className={cn("text-[11px] truncate", textMuted)}>
                  {item.type === "link" ? item.value : `${(item.fields ?? []).length} field(s)`} · Visible to {permissionSummary(item.allowed_roles, item.allowed_user_ids)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canEdit && (
                  <>
                    <PermissionPicker allowedRoles={item.allowed_roles} allowedUserIds={item.allowed_user_ids} staffDirectory={staffDirectory} onChange={(u) => onPermissionChange(item.id, u)} />
                    <IconTip label="Remove">
                      <button type="button" onClick={() => onDelete(item.id)} aria-label="Remove" className="p-1.5 rounded-md border-none bg-transparent cursor-pointer text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6]">
                        <Trash2 size={13} />
                      </button>
                    </IconTip>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <AddCredentialLinkModal
          customerId={customerId}
          projectId={projectUuid}
          initialType={subTab === "credentials" ? "credential" : "link"}
          onClose={() => setModalOpen(false)}
          onCreated={(a) => { onCreated(a); setModalOpen(false); }}
        />
      )}
    </div>
  );
}

function AddCredentialLinkModal({
  customerId, projectId, initialType, onClose, onCreated,
}: {
  customerId: string; projectId: string; initialType: "link" | "credential";
  onClose: () => void; onCreated: (asset: AssetRow) => void;
}) {
  const [type, setType] = useState<"link" | "credential">(initialType);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [fields, setFields] = useState<{ label: string; value: string; masked: boolean }[]>([{ label: "", value: "", masked: true }]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = label.trim().length > 0 && (type === "link" ? value.trim().length > 0 && isValidUrl(value.trim()) : fields.some((f) => f.label.trim() && f.value.trim()));

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const cleanFields = fields.map((f) => ({ label: f.label.trim(), value: f.value.trim(), masked: f.masked })).filter((f) => f.label && f.value);
      const body = {
        type, label: label.trim(),
        masked: cleanFields.some((f) => f.masked),
        allowed_roles: allowedRoles,
        ...(type === "link" ? { value: value.trim() } : {}),
        ...(type === "credential" ? { fields: cleanFields } : {}),
        phase_number: 1,
        project_id: projectId,
      };
      const res = await fetch(`/api/customers/${customerId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to create asset");
      }
      onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EDF0F7]">
          <h2 className={cn("text-[14px] font-semibold", textPrimary)}>Add credential / link</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-[#5F6A88]/10 transition-colors", textMuted)}>
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className={fieldLabelCls}>Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value as "link" | "credential"); setValue(""); setFields([{ label: "", value: "", masked: true }]); }} className={fieldInputCls}>
              <option value="link">Link</option>
              <option value="credential">Credential</option>
            </select>
          </div>
          <div>
            <label className={fieldLabelCls}>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "credential" ? "e.g. HubSpot access" : "e.g. Staging URL"} className={fieldInputCls} />
          </div>
          {type === "link" && (
            <div>
              <label className={fieldLabelCls}>Value</label>
              <input type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://" className={fieldInputCls} />
              {value.trim() && !isValidUrl(value.trim()) && <p className="text-[11px] text-[#C0392B] mt-1">Must start with http:// or https://</p>}
            </div>
          )}
          {type === "credential" && (
            <div>
              <label className={fieldLabelCls}>Fields</label>
              <div className="flex flex-col gap-2">
                {fields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={field.label} onChange={(e) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, label: e.target.value } : f)))} placeholder="e.g. Username" className={fieldInputCls} />
                    <input value={field.value} onChange={(e) => setFields((prev) => prev.map((f, j) => (j === i ? { ...f, value: e.target.value } : f)))} placeholder="Value" className={fieldInputCls} />
                    <button type="button" onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove field" className="w-8 h-8 shrink-0 rounded-lg border cursor-pointer bg-transparent leading-none border-[#E2E7F2] text-[#5F6A88] hover:text-[#C0392B]">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setFields((prev) => [...prev, { label: "", value: "", masked: true }])} className="mt-2 text-[12px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer p-0">+ Add field</button>
            </div>
          )}
          <div>
            <label className={fieldLabelCls}>Visible to</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setAllowedRoles([])} className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors", allowedRoles.length === 0 ? "bg-[#007BFF] text-white border-[#007BFF]" : "bg-transparent text-[#5F6A88] border-[#E2E7F2]")}>All</button>
              {ASSET_ROLE_OPTIONS.map((role) => {
                const active = allowedRoles.includes(role.value);
                return (
                  <button key={role.value} type="button" onClick={() => setAllowedRoles((prev) => (active ? prev.filter((r) => r !== role.value) : [...prev, role.value]))} className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer transition-colors", active ? "bg-[#007BFF] text-white border-[#007BFF]" : "bg-transparent text-[#5F6A88] border-[#E2E7F2]")}>
                    {role.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10.5px] mt-1.5 text-[#5F6A88]">Named-person sharing can be set after adding, from the list.</p>
          </div>
          {error && <p className="text-[12px] text-[#C0392B] bg-[#FDE8E6] border border-[#C0392B]/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none bg-transparent text-[#3A4565] hover:bg-[#EDF0F7]">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving || !isValid} className="px-4 py-2 rounded-lg bg-[#007BFF] text-white text-[13px] font-semibold cursor-pointer border-none hover:bg-[#0063D6] transition-colors disabled:opacity-60">
            {saving ? "Adding…" : "Add asset"}
          </button>
        </div>
      </div>
    </div>
  );
}
