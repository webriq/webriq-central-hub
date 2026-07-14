import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type FolderRow = Database["public"]["Tables"]["customer_asset_folders"]["Row"];

async function getRequesterRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role ?? null;
}

// Mirror of assets/route.ts's canSeeAsset() (task 138) — same OR-combined role/user
// semantics, applied to folders (task 144). No inheritance: a folder's own
// allowed_roles/allowed_user_ids governs only that folder, not its files or nested
// sub-folders, which are governed independently by their own permission columns.
function canSeeFolder(
  role: string | null, userId: string | null,
  allowedRoles: string[] | null, allowedUserIds: string[] | null
) {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && !!userId && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}

// Former hardcoded folderForAsset() mapping (tasks 134/139) — used only for the one-time
// server-side backfill below, not for ongoing client-side folder derivation. Values must
// stay in sync with the folder names provisioned in SYSTEM_FOLDER_TREE.
const LABEL_TO_SYSTEM_FOLDER: Record<string, string> = {
  "Business Facts": "Business Files",
  "Documents": "Business Files",
  "Outcome Target": "Outcome Target",
  "Migration Checklist": "Checklist",
  "Content Map": "Content Map",
  "HTML Mockup": "HTML Mockup",
};

// Business Files gets three pre-seeded sub-folders (task 141) replacing the old free-text
// "Documents (branding / proposals / collateral)" note field — they start empty; nothing
// backfills into them automatically (existing "Documents"/"Business Facts" assets keep
// landing flat in "Business Files", same as before, until manually moved).
const SYSTEM_FOLDER_TREE: { name: string; children?: string[] }[] = [
  { name: "Business Files", children: ["Branding", "Proposals", "Collateral"] },
  { name: "Outcome Target" },
  { name: "Checklist" },
  { name: "Content Map" },
  { name: "HTML Mockup" },
  { name: "Other" },
];

// Idempotently ensures the system folder tree exists for this (customerId, projectId,
// phaseNumber) scope, then backfills folder_id on any of this scope's assets that don't
// have one yet. Safe to call on every GET — a no-op after the first time.
async function provisionAndBackfill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  projectId: string,
  phaseNumber: number
) {
  const { data: existing, error: fetchError } = await supabase
    .from("customer_asset_folders")
    .select("*")
    .eq("customer_id", customerId)
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber);
  if (fetchError) throw fetchError;

  const byParentAndName = new Map<string, FolderRow>();
  for (const f of existing ?? []) {
    byParentAndName.set(`${f.parent_folder_id ?? "root"}::${f.name}`, f);
  }

  const idByName = new Map<string, string>();
  for (const node of SYSTEM_FOLDER_TREE) {
    let topRow = byParentAndName.get(`root::${node.name}`);
    if (!topRow) {
      const { data: inserted, error: insertError } = await supabase
        .from("customer_asset_folders")
        .insert({
          customer_id: customerId,
          project_id: projectId,
          phase_number: phaseNumber,
          parent_folder_id: null,
          name: node.name,
          is_system: true,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      topRow = inserted;
    }
    idByName.set(node.name, topRow.id);

    for (const childName of node.children ?? []) {
      const existingChild = byParentAndName.get(`${topRow.id}::${childName}`);
      if (!existingChild) {
        const { error: childInsertError } = await supabase.from("customer_asset_folders").insert({
          customer_id: customerId,
          project_id: projectId,
          phase_number: phaseNumber,
          parent_folder_id: topRow.id,
          name: childName,
          is_system: true,
        });
        // Ignore a duplicate-name race (23505) — another concurrent request already
        // created it; everything else should still fail loudly.
        if (childInsertError && childInsertError.code !== "23505") throw childInsertError;
      }
    }
  }

  const { data: unfiled, error: unfiledError } = await supabase
    .from("customer_assets")
    .select("id, label")
    .eq("customer_id", customerId)
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .is("folder_id", null);
  if (unfiledError) throw unfiledError;

  const idsByTargetFolder = new Map<string, string[]>();
  for (const asset of unfiled ?? []) {
    const folderName = LABEL_TO_SYSTEM_FOLDER[asset.label] ?? "Other";
    const folderId = idByName.get(folderName);
    if (!folderId) continue;
    if (!idsByTargetFolder.has(folderId)) idsByTargetFolder.set(folderId, []);
    idsByTargetFolder.get(folderId)!.push(asset.id);
  }
  for (const [folderId, ids] of idsByTargetFolder) {
    const { error: updateError } = await supabase.from("customer_assets").update({ folder_id: folderId }).in("id", ids);
    if (updateError) throw updateError;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId } = await params;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const phaseNumberRaw = searchParams.get("phaseNumber");
    const phaseNumber = phaseNumberRaw ? Number(phaseNumberRaw) : NaN;
    if (!projectId || !Number.isInteger(phaseNumber)) {
      return NextResponse.json({ error: "projectId and phaseNumber query params are required" }, { status: 400 });
    }

    await provisionAndBackfill(supabase, customerId, projectId, phaseNumber);

    const { data, error } = await supabase
      .from("customer_asset_folders")
      .select("*")
      .eq("customer_id", customerId)
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("GET .../assets/folders error:", error);
      return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
    }

    const myRole = await getRequesterRole(supabase, user.id);
    const visible = (data ?? []).filter((f) => canSeeFolder(myRole, user.id, f.allowed_roles, f.allowed_user_ids));
    return NextResponse.json(visible);
  } catch (err) {
    console.error("GET .../assets/folders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId } = await params;
    const body = await request.json();
    const { projectId, phaseNumber, name, parent_folder_id: parentFolderId } = body as {
      projectId?: string;
      phaseNumber?: number;
      name?: string;
      parent_folder_id?: string | null;
    };

    if (!projectId || !Number.isInteger(phaseNumber) || !name?.trim()) {
      return NextResponse.json({ error: "projectId, phaseNumber, and name are required" }, { status: 400 });
    }

    if (parentFolderId) {
      const { data: parent, error: parentError } = await supabase
        .from("customer_asset_folders")
        .select("id")
        .eq("id", parentFolderId)
        .eq("customer_id", customerId)
        .eq("project_id", projectId)
        .eq("phase_number", phaseNumber!)
        .maybeSingle();
      if (parentError) {
        console.error("POST .../assets/folders parent lookup error:", parentError);
        return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
      }
      if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("customer_asset_folders")
      .insert({
        customer_id: customerId,
        project_id: projectId,
        phase_number: phaseNumber!,
        parent_folder_id: parentFolderId ?? null,
        name: name.trim(),
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A folder with that name already exists here" }, { status: 400 });
      }
      console.error("POST .../assets/folders error:", error);
      return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST .../assets/folders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
