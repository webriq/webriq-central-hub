"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AccessTab as AccessTabPresentational } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_access-tab";
import type { AssetRow, StaffPerson } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_wizard-v2-types";

// Task 276 — Access tab (credentials/links/repos), shared by both the legacy and v2
// project-detail routes. Thin data-wrapping component around the existing, pure presentational
// `AccessTab` from the Onboarding Workspace (imported directly, not duplicated — 268 lines,
// prop-driven; its own internal "Add credential/link" modal already POSTs to
// `/api/customers/${customerId}/assets` with `phase_number: 1` hardcoded, which this wrapper
// does not touch or override).
//
// Same customer-scoped data model as the Files tab (see `_files-tab.tsx`'s comment) — credentials
// and links show up across every project belonging to this customer, intentionally, matching the
// Onboarding Workspace's own behavior.
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

export function AccessTab({
  projectId, customerId, currentUserRole,
}: {
  projectId: string;
  customerId: string;
  currentUserRole: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);

  const canEdit = currentUserRole === "pm" || (!!currentUserRole && WRITE_ROLES.includes(currentUserRole));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [assetsRes, staffRes] = await Promise.all([
        fetch(`/api/customers/${customerId}/assets`),
        fetch("/api/staff-directory"),
      ]);
      if (cancelled) return;
      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (staffRes.ok) setStaffDirectory(await staffRes.json());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  async function handleDelete(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/customers/${customerId}/assets?id=${id}`, { method: "DELETE" });
  }

  async function handlePermissionChange(assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#5F6A88]">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-8 py-5 overflow-y-auto h-full">
      <AccessTabPresentational
        customerId={customerId}
        projectUuid={projectId}
        assets={assets}
        staffDirectory={staffDirectory}
        canEdit={canEdit}
        onCreated={(a) => setAssets((prev) => [...prev, a])}
        onDelete={handleDelete}
        onPermissionChange={handlePermissionChange}
      />
    </div>
  );
}
