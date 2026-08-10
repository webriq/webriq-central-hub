"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, CheckCircle2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentProgrammeDay, getPhaseByNumber } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";
import { AssetRow, AssetFolder, DeliverableRow, InternalDeliverableRow, StaffPerson, WizardV2Project, WizardTabKey } from "./_wizard-v2-types";
import { textPrimary, textMuted, cardCls } from "./_shared-ui";
import { WorkspaceHeader } from "./_workspace-header";
import { uploadFileWithProgress } from "./_upload-queue";
import { BusinessInfoTab } from "./_business-info-tab";
import { FilesTab } from "./_files-tab";
import { AccessTab } from "./_access-tab";
import { ChecklistTab } from "./_checklist-tab";
import { buildWorkspaceQueryString, resolveFolderPath, folderNamePath } from "./_workspace-url-params";

const WIZARD_ROLES = ["admin", "super_admin", "marketing", "pm"];
const WRITE_ROLES = ["admin", "super_admin", "marketing"];
const PHASE1 = getPhaseByNumber(1);
// Task 204 — same Phase 1 deliverable config the Checklist tab renders (_checklist-tab.tsx:9),
// used here to gate the "Proceed to Phase 2" button on every deliverable being done.
const DELIVERABLES = PHASE1.deliverables;

export default function OnboardingWizardV2({
  project, role, initialTab, initialFolderPath,
}: {
  project: WizardV2Project;
  role: string | null;
  // Task 222 — deep-link target from ?tab=&parent_folder=&sub_folder_l1=... (parsed server-side
  // in page.tsx via _workspace-url-params.ts). initialFolderPath is a root-to-leaf folder NAME
  // path, resolved to a folder id once `folders` has loaded (see the effect below).
  initialTab?: WizardTabKey;
  initialFolderPath?: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<WizardTabKey>(initialTab ?? "business-info");
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [internalDeliverables, setInternalDeliverables] = useState<InternalDeliverableRow[]>([]);
  const [wizardData, setWizardData] = useState<Record<string, Record<string, unknown>>>({});
  const [currentDay, setCurrentDay] = useState(1);
  const [programmeStartedAt, setProgrammeStartedAt] = useState<string | null>(null);
  const [isPhaseActive, setIsPhaseActive] = useState(true);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [completingPhase, setCompletingPhase] = useState(false);
  const [completePhaseError, setCompletePhaseError] = useState<string | null>(null);
  const [phaseTransition, setPhaseTransition] = useState(false);
  const [phaseDone, setPhaseDone] = useState(false);
  const notesFolderRequested = useRef(false);
  const initialFolderApplied = useRef(false);

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
        if (data.programme_started_at) {
          setCurrentDay(getCurrentProgrammeDay(data.programme_started_at));
          setProgrammeStartedAt(data.programme_started_at);
        }
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

  // Task 222 — resolves the ?parent_folder=&sub_folder_l1=... deep-link (a root-to-leaf folder
  // NAME path) to a folder id once folders have loaded. Only commits once the *whole* path
  // resolves (folderNamePath's length matches) — a shorter match usually means a lazily-created
  // folder (e.g. "Notes", created by the effect above) hasn't landed in `folders` yet, so this
  // effect re-checks whenever `folders` changes instead of settling for a shallower folder.
  useEffect(() => {
    if (loading || initialFolderApplied.current || !initialFolderPath || initialFolderPath.length === 0) return;
    const resolvedId = resolveFolderPath(folders, initialFolderPath);
    if (folderNamePath(folders, resolvedId).length < initialFolderPath.length) return;
    // Deferred a tick (matches the fetch().then() pattern the "Notes" auto-create effect above
    // uses) rather than calling the setters synchronously in the effect body — avoids
    // react-hooks/set-state-in-effect's cascading-render warning for a same-tick setState.
    queueMicrotask(() => {
      setTab("files");
      setOpenFolderId(resolvedId);
      initialFolderApplied.current = true;
    });
  }, [loading, folders, initialFolderPath]);

  // Task 222 — keeps the address bar in sync with the current tab/folder as the user navigates
  // inside the Workspace (tab bar, folder tiles, breadcrumbs, "Go to Notes folder", "Attach from
  // Files" all flow through setTab/setOpenFolderId). Uses the native History API rather than
  // router.replace: this page is `force-dynamic`, so a router navigation on every folder click
  // would re-run the server component (loadOnboardingDetailData) on every click — replaceState
  // updates the URL with zero data refetch and no risk to already-mounted local state.
  useEffect(() => {
    if (loading) return;
    const qs = buildWorkspaceQueryString(tab, folderNamePath(folders, openFolderId));
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
  }, [tab, openFolderId, folders, loading]);

  const isPM = role === "pm";
  const isWriteRole = !!role && WRITE_ROLES.includes(role);
  const canEditFiles = (isWriteRole || isPM) && isPhaseActive;
  const canEditBusinessInfo = isWriteRole && isPhaseActive;
  const canEditChecklist = isWriteRole && isPhaseActive;
  // Task 204 — mirrors the Checklist tab's own status source: a deliverable's status is
  // auto-derived server-side from its internal checklist items (internal-deliverables/
  // [deliverableKey]/route.ts), so "every deliverable done" is exactly "checklist all checked".
  const allDeliverablesDone = deliverables.length > 0
    && DELIVERABLES.every((cfg) => deliverables.find((d) => d.deliverable_key === cfg.key)?.status === "done");

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

  const handleUpload = async (file: File, folderId: string, onProgress?: (pct: number) => void) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", project.id);
    const uploaded = await uploadFileWithProgress(`/api/customers/${project.customer_id}/assets/upload`, formData, onProgress);
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

  const handleCreateFolder = async (name: string, parentFolderId: string | null = null) => {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
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

  // Task 204 — same request the shipping Onboarding Wizard makes on "Complete Phase 1 & notify
  // PM" (../_onboarding-wizard.tsx:2088-2106); notifyProjectMembers() inside this route already
  // notifies every project_members row, including a PM added as a collaborator, so no separate
  // notification call is needed here.
  const handleCompletePhase = async () => {
    setCompletingPhase(true);
    setCompletePhaseError(null);
    setPhaseTransition(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/complete-phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase_number: 1 }),
      });
      if (!res.ok) throw new Error();
      setPhaseDone(true);
    } catch {
      setCompletePhaseError("Failed to complete Phase 1 — please try again.");
      setPhaseTransition(false);
    } finally {
      setCompletingPhase(false);
    }
  };

  if (phaseTransition && !phaseDone) {
    return (
      <div className={cn(cardCls, "max-w-lg mx-auto p-8 mt-8")}>
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="w-14 h-14 rounded-full bg-[#E5F1FF] flex items-center justify-center mx-auto mb-4"
          >
            <Sparkles size={24} className="text-[#007BFF]" />
          </motion.div>
          <div className={cn("text-lg font-bold mb-1 font-heading", textPrimary)}>Wrapping up Phase 1…</div>
          <p className={cn("text-[13px]", textMuted)}>Preparing the project view and handing over to the PM.</p>
        </div>
      </div>
    );
  }

  if (phaseDone) {
    const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
    const doneInternal = internalDeliverables.filter((d) => d.status === "done").length;
    return (
      <div className={cn(cardCls, "max-w-lg mx-auto p-8 text-center mt-8")}>
        <div className="w-16 h-16 rounded-full bg-[#177E48] flex items-center justify-center mx-auto mb-5">
          <Check size={30} className="text-white" strokeWidth={2.5} />
        </div>
        <div className={cn("text-lg font-bold mb-1.5 font-heading", textPrimary)}>Phase 1 complete</div>
        <p className={cn("text-[13px] mb-5", textMuted)}>{project.company_name} has been handed over to the PM — the project is now visible in Customers/Projects.</p>
        <div className="flex flex-col gap-2 mb-5 text-left">
          {[
            `${doneDeliverables} of ${deliverables.length} deliverables marked done`,
            `${doneInternal} of ${internalDeliverables.length} internal deliverables marked done`,
            `PM notified — Phase 2 begins`,
          ].map((label, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[12px] font-medium border-[#177E48]/25 bg-[#E3F5EA] text-[#0B1533]">
              <CheckCircle2 size={14} className="text-[#177E48] shrink-0" /> {label}
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push(project.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${project.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER)}
          className="w-full text-[13px] font-semibold text-white bg-[#007BFF] rounded-lg py-2.5 hover:opacity-90 transition-opacity border-none cursor-pointer"
        >
          Back to Onboarding Timeline
        </button>
      </div>
    );
  }

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

  const doneDeliverableCount = deliverables.filter((d) => d.status === "done").length;
  const overdueCount = DELIVERABLES.filter((cfg) => {
    const status = deliverables.find((d) => d.deliverable_key === cfg.key)?.status ?? "pending";
    return status !== "done" && currentDay > cfg.dayEnd;
  }).length;
  const filesCount = assets.filter((a) => a.type === "file").length;
  const accessCount = assets.filter((a) => a.type === "credential" || a.type === "link").length;

  const cta = allDeliverablesDone && isWriteRole && isPhaseActive && (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <button
        type="button"
        onClick={handleCompletePhase}
        disabled={completingPhase}
        className="inline-flex items-center gap-[7px] text-[12px] font-semibold text-[#471F02] rounded-full px-[15px] py-2 border-none cursor-pointer disabled:opacity-45 bg-[#FB914E] hover:bg-[#E2762F] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-[#007BFF] focus-visible:outline-offset-2"
      >
        {completingPhase ? "Completing…" : <><Check size={13} strokeWidth={2.4} /> Proceed to Phase 2</>}
      </button>
      {completePhaseError && <p className="text-[12px] text-[#C0392B]">{completePhaseError}</p>}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      <WorkspaceHeader
        companyName={project.company_name}
        projectRouteId={project.project_id}
        classification={project.classification}
        existingWebsite={project.existing_website}
        currentDay={currentDay}
        dayStart={PHASE1.dayStart}
        dayEnd={PHASE1.dayEnd}
        overdueCount={overdueCount}
        startedAt={programmeStartedAt}
        tab={tab}
        tabCounts={{ files: filesCount, access: accessCount, checklist: `${doneDeliverableCount}/${DELIVERABLES.length}` }}
        onTabChange={setTab}
        cta={cta}
      />

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
              customerId={project.customer_id}
              wizardData={wizardData}
              folders={folders}
              assets={assets}
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
              onOpenFolder={openFolderByName}
              onGoToAccess={() => setTab("access")}
            />
          )}
        </>
      )}
    </div>
  );
}
