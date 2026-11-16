import type { AssetFolder, WizardTabKey } from "./_wizard-v2-types";

// Task 222 — maps each Phase 1 swimlane deliverable (key from src/config/customer-phases.ts) to
// where clicking it in the Timeline swimlane should land inside the Onboarding Workspace: a tab,
// and for file-backed deliverables, a root-level Files folder. Folder names must stay in sync
// with SYSTEM_FOLDER_TREE (assets/folders/route.ts) and the client-side "Notes" auto-create
// effect in _onboarding-wizard-v2.tsx. Business Info is Kickoff-only (see
// _business-info-tab.tsx's task-202-follow-up comment) — the other deliverables don't have a
// Business Info section to land on, only a Files folder.
export const DELIVERABLE_WORKSPACE_TARGET: Record<string, { tab: WizardTabKey; folderPath?: string[] }> = {
  kickoff: { tab: "business-info" },
  "outcome-target": { tab: "files", folderPath: ["Outcome Target"] },
  "migration-checklist": { tab: "files", folderPath: ["Migration Checklist"] },
  "content-map": { tab: "files", folderPath: ["Content Map"] },
  "html-mockup": { tab: "files", folderPath: ["HTML Mockup"] },
  "storage-kb": { tab: "files" },
  "client-signoff": { tab: "files", folderPath: ["Notes"] },
};

const VALID_TABS: WizardTabKey[] = ["business-info", "files", "access", "checklist"];

export type WorkspaceSearchParams = { tab?: string; parent_folder?: string; [key: string]: string | undefined };

// Reads ?tab=&parent_folder=&sub_folder_l1=&sub_folder_l2=... off the raw searchParams object.
// Folder levels are read as a contiguous run starting at l1 — a gap (e.g. l1 present, l2
// missing, l3 present) stops the scan at the gap, since that shape never occurs in a URL this
// module itself generates.
export function parseWorkspaceSearchParams(searchParams: WorkspaceSearchParams): { tab: WizardTabKey; folderPath: string[] } {
  const tab = VALID_TABS.includes(searchParams.tab as WizardTabKey) ? (searchParams.tab as WizardTabKey) : "business-info";

  const folderPath: string[] = [];
  if (searchParams.parent_folder) folderPath.push(searchParams.parent_folder);
  let level = 1;
  while (searchParams[`sub_folder_l${level}`]) {
    folderPath.push(searchParams[`sub_folder_l${level}`]!);
    level++;
  }
  return { tab, folderPath };
}

// Inverse of parseWorkspaceSearchParams — builds the query string for a tab + root-to-leaf
// folder name path. Uses URLSearchParams so folder names containing spaces are encoded correctly.
export function buildWorkspaceQueryString(tab: WizardTabKey, folderPath: string[] = []): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  folderPath.forEach((name, i) => {
    params.set(i === 0 ? "parent_folder" : `sub_folder_l${i}`, name);
  });
  return params.toString();
}

// Resolves a root-to-leaf folder NAME path to the deepest matching folder id — walks the path in
// order, matching each name against the current level's children (parent_folder_id scoped to the
// previous match). Returns the deepest id it could resolve; stops early (without throwing) on the
// first name that doesn't match anything, e.g. a stale/bookmarked URL or a folder that hasn't
// been lazily created yet (see the "Notes" auto-create effect).
export function resolveFolderPath(folders: AssetFolder[], path: string[]): string | null {
  let parentId: string | null = null;
  for (const name of path) {
    const match = folders.find((f) => f.name === name && f.parent_folder_id === parentId);
    if (!match) break;
    parentId = match.id;
  }
  return parentId;
}

// Inverse of resolveFolderPath — walks a folder id's parent_folder_id chain back to root and
// returns the root-to-leaf name path, for reflecting the currently open folder back into the URL.
export function folderNamePath(folders: AssetFolder[], folderId: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  let cur = folderId ? byId.get(folderId) ?? null : null;
  while (cur) {
    path.unshift(cur.name);
    cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) ?? null : null;
  }
  return path;
}
