"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentProgrammeDay } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";
import { AssetRow, AssetFolder, DeliverableRow, InternalDeliverableRow, StaffPerson, WizardV2Project, WizardTabKey } from "./_wizard-v2-types";
import { textPrimary, textMuted, PillTabs } from "./_shared-ui";
import { BusinessInfoTab } from "./_business-info-tab";
import { FilesTab } from "./_files-tab";
import { AccessTab } from "./_access-tab";
import { ChecklistTab } from "./_checklist-tab";

const WIZARD_ROLES = ["admin", "super_admin", "marketing", "pm"];
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

export default function OnboardingWizardV2({ project, role }: { project: WizardV2Project; role: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<WizardTabKey>("business-info");
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [internalDeliverables, setInternalDeliverables] = useState<InternalDeliverableRow[]>([]);
  const [wizardData, setWizardData] = useState<Record<string, Record<string, unknown>>>({});
  const [currentDay, setCurrentDay] = useState(1);
  const [isPhaseActive, setIsPhaseActive] = useState(true);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const notesFolderRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [programmeRes, foldersRes, assetsRes, staffRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/programme`),
        fetch(`/api/customers/${project.customer_id}/assets/folders?projectId=${project.id}&phaseNumber=1`),
        fetch(`/api/customers/${project.customer_id}/assets`),
        fetch("/api/staff-directory"),
      ]);
      if (cancelled) return;

      if (programmeRes.ok) {
        const data = await programmeRes.json();
        const phases: { phase_number: number; status: string; wizard_data: Record<string, Record<string, unknown>> | null }[] = data.phases ?? [];
        const phase1 = phases.find((p) => p.phase_number === 1);
        setIsPhaseActive(phase1?.status === "active");
        setWizardData(phase1?.wizard_data ?? {});
        setDeliverables((data.deliverables ?? []).filter((d: DeliverableRow) => d.phase_number === 1));
        setInternalDeliverables(data.internal_deliverables ?? []);
        if (data.programme_started_at) setCurrentDay(getCurrentProgrammeDay(data.programme_started_at));
      }
      if (foldersRes.ok) setFolders(await foldersRes.json());
      if (assetsRes.ok) {
        const data: AssetRow[] = await assetsRes.json();
        setAssets(data.filter((a) => a.phase_number === 1 && a.project_id === project.id));
      }
      if (staffRes.ok) setStaffDirectory(await staffRes.json());
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [project.id, project.customer_id]);

  // Task 202 follow-up: Kickoff and Client sign-off file into a dedicated "Notes" folder, not
  // the server's SYSTEM_FOLDER_TREE (server-side, in the existing/unedited folders route) — so
  // this sandbox creates it client-side the same way the "New folder" button already does,
  // once, the first time it's missing after the initial folder fetch.
  useEffect(() => {
    if (loading || notesFolderRequested.current) return;
    if (folders.some((f) => f.name === "Notes" && f.parent_folder_id === null)) return;
    notesFolderRequested.current = true;
    fetch(`/api/customers/${project.customer_id}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name: "Notes" }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((created: AssetFolder | null) => { if (created) setFolders((prev) => [...prev, created]); })
      .catch(() => { /* non-fatal — Business Info's "open in Files" link just won't resolve until a refresh */ });
  }, [loading, folders, project.customer_id, project.id]);

  const isPM = role === "pm";
  const isWriteRole = !!role && WRITE_ROLES.includes(role);
  const canEditFiles = (isWriteRole || isPM) && isPhaseActive;
  const canEditBusinessInfo = isWriteRole && isPhaseActive;
  const canEditChecklist = isWriteRole && isPhaseActive;

  const openFolderByName = useCallback((name: string) => {
    const folder = folders.find((f) => f.name === name && f.parent_folder_id === null);
    setTab("files");
    setOpenFolderId(folder?.id ?? null);
  }, [folders]);

  const handleSaveSection = async (subPhaseKey: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/projects/${project.id}/programme/wizard-data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subPhaseKey, data }),
    });
    if (!res.ok) throw new Error("Failed to save");
    setWizardData((prev) => ({ ...prev, [subPhaseKey]: { ...(prev[subPhaseKey] ?? {}), ...data } }));
  };

  const handleUpload = async (file: File, folderId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", project.id);
    const uploadRes = await fetch(`/api/customers/${project.customer_id}/assets/upload`, { method: "POST", body: formData });
    if (!uploadRes.ok) return;
    const uploaded: { path: string; filename: string; size: number; mimeType: string } = await uploadRes.json();
    const assetRes = await fetch(`/api/customers/${project.customer_id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "file", label: uploaded.filename, file_path: uploaded.path, file_name: uploaded.filename,
        file_size: uploaded.size, file_mime_type: uploaded.mimeType, phase_number: 1, project_id: project.id, folder_id: folderId,
      }),
    });
    if (!assetRes.ok) return;
    const newAsset: AssetRow = await assetRes.json();
    setAssets((prev) => [...prev, newAsset]);

    // Regression guard for task 199: uploading an .html file into the "HTML Mockup" folder
    // still triggers the existing paired build-spec MD auto-generation route.
    const targetFolder = folders.find((f) => f.id === folderId);
    if (targetFolder?.name === "HTML Mockup" && uploaded.mimeType === "text/html") {
      fetch(`/api/customers/${project.customer_id}/assets/${newAsset.id}/generate-md`, { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then((mdAsset: AssetRow | null) => { if (mdAsset) setAssets((prev) => [...prev, mdAsset]); })
        .catch(() => { /* non-blocking — mirrors the original wizard's failure handling */ });
    }
  };

  const handleDeleteAsset = async (id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/customers/${project.customer_id}/assets?id=${id}`, { method: "DELETE" });
  };

  const handleAssetPermissionChange = async (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  };

  const handleFolderPermissionChange = async (folderId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
  };

  const handleCreateFolder = async (name: string) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name }),
    });
    if (!res.ok) return;
    const created: AssetFolder = await res.json();
    setFolders((prev) => [...prev, created]);
  };

  const handleRenameAsset = async (assetId: string, fileName: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_name: fileName }) });
    if (!res.ok) return false;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    return true;
  };

  const handleRenameFolder = async (folderId: string, name: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return false;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    return true;
  };

  const handleDeleteFolder = async (folderId: string) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/folders/${folderId}`, { method: "DELETE" });
    if (!res.ok) return;
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  };

  const handleMoveAsset = async (assetId: string, folderId: string) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: folderId }) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  };

  const handleToggleInternal = async (key: string, status: "pending" | "in_progress" | "done") => {
    setTogglingKey(key);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/internal-deliverables/${key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      const data: { internalDeliverable: InternalDeliverableRow; deliverable: DeliverableRow | null } = await res.json();
      setInternalDeliverables((prev) => {
        const exists = prev.some((d) => d.deliverable_key === data.internalDeliverable.deliverable_key);
        return exists ? prev.map((d) => (d.deliverable_key === data.internalDeliverable.deliverable_key ? data.internalDeliverable : d)) : [...prev, data.internalDeliverable];
      });
      if (data.deliverable) setDeliverables((prev) => prev.map((d) => (d.id === data.deliverable!.id ? data.deliverable! : d)));
    } finally {
      setTogglingKey(null);
    }
  };

  if (role === "developer") {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16 text-center">
        <p className={cn("text-[14px]", textMuted)}>Developer access to this workspace isn&apos;t available in the Onboarding Wizard.</p>
      </div>
    );
  }
  if (!role || !WIZARD_ROLES.includes(role)) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-16 text-center">
        <p className={cn("text-[14px]", textMuted)}>You don&apos;t have access to this workspace.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      <button
        type="button"
        onClick={() => router.push(project.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${project.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#5F6A88] hover:text-[#0B1533] bg-transparent border-none cursor-pointer mb-3 transition-colors"
      >
        <ArrowLeft size={14} /> Back to {project.name}
      </button>

      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className={cn("text-[22px] font-bold tracking-[-0.015em]", textPrimary)} style={{ fontFamily: "var(--font-space-grotesk, inherit)" }}>
            {project.company_name} — Onboarding workspace
          </h1>
          <p className={cn("text-[13px] mt-1", textMuted)}>
            Sandbox preview (task 202) — file-management-first redesign of Phase 1. No step order required.
          </p>
        </div>
      </div>

      <div className="mt-5 mb-4">
        <PillTabs
          tabs={[
            { id: "business-info", label: "Business info" },
            { id: "files", label: "Files" },
            { id: "access", label: "Access" },
            { id: "checklist", label: "Checklist" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {!isPhaseActive && (
        <div className="mb-4 px-3.5 py-2.5 rounded-[10px] bg-[#FFF3D6] border border-[#8A5A00]/15 text-[12.5px] text-[#8A5A00]">
          Phase 1 isn&apos;t the active phase for this project — this workspace is view-only.
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-[14px] bg-[#F4F6FB] animate-pulse" />)}
        </div>
      ) : (
        <>
          {tab === "business-info" && (
            <BusinessInfoTab
              wizardData={wizardData}
              folders={folders}
              canEdit={canEditBusinessInfo}
              onSaveSection={handleSaveSection}
              onOpenFolder={openFolderByName}
            />
          )}
          {tab === "files" && (
            <FilesTab
              customerId={project.customer_id}
              assets={assets}
              folders={folders}
              staffDirectory={staffDirectory}
              canEdit={canEditFiles}
              openFolderId={openFolderId}
              onOpenFolder={setOpenFolderId}
              onUpload={handleUpload}
              onDeleteAsset={handleDeleteAsset}
              onAssetPermissionChange={handleAssetPermissionChange}
              onFolderPermissionChange={handleFolderPermissionChange}
              onCreateFolder={handleCreateFolder}
              onRenameAsset={handleRenameAsset}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveAsset={handleMoveAsset}
            />
          )}
          {tab === "access" && (
            <AccessTab
              customerId={project.customer_id}
              projectUuid={project.id}
              assets={assets}
              staffDirectory={staffDirectory}
              canEdit={canEditFiles}
              onCreated={(a) => setAssets((prev) => [...prev, a])}
              onDelete={handleDeleteAsset}
              onPermissionChange={handleAssetPermissionChange}
            />
          )}
          {tab === "checklist" && (
            <ChecklistTab
              deliverables={deliverables}
              internalDeliverables={internalDeliverables}
              currentDay={currentDay}
              role={role}
              canEditInternal={canEditChecklist}
              togglingKey={togglingKey}
              onToggleInternal={handleToggleInternal}
            />
          )}
        </>
      )}
    </div>
  );
}
