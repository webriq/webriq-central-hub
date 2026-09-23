import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikiPageSummary, WikiProduct } from "@/types/wiki";

// Task 395 — page-tree node building + row rendering, shared by _wiki-tree-panel.tsx (page
// tree under an expanded space) and _wiki-space-list.tsx (same tree, nested under a
// drag-reorderable space row, task 399).

export type TreeNode = WikiPageSummary & { children: TreeNode[] };

export function buildTree(pages: WikiPageSummary[], product: WikiProduct): TreeNode[] {
  const byProduct = pages.filter((p) => p.product === product && p.status !== "archived");
  const byId = new Map<string, TreeNode>(byProduct.map((p) => [p.id, { ...p, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function PageRow({
  node,
  depth,
  selectedPageId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPageId: string | null;
  onSelect: (pageId: string) => void;
}) {
  const active = node.id === selectedPageId;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "w-full flex items-center gap-1.5 rounded-[6px] py-1.5 text-[12.5px] cursor-pointer transition-colors text-left",
          active ? "bg-[#FDEEE6] text-[#B85512] font-semibold" : "text-[#5F6A88] hover:bg-[#F4F6FB]"
        )}
        style={{ paddingLeft: 8 + depth * 16, paddingRight: 8 }}
      >
        <FileText size={12} className="shrink-0 opacity-75" />
        <span className="truncate flex-1">{node.title}</span>
        {/* Task 399 — version badge replaces the old draft-only status pill on every row,
            matching the mockup's own `.badge-count` (the doc canvas's status pill/dropdown and
            the info panel's Status row remain the actual draft/published/archived control). */}
        <span className="shrink-0 text-[9px] font-mono text-[#94A3B8] bg-[#F4F6FB] border border-[#E2E7F2] rounded-full px-1.5 py-0.5">
          v{node.version}
        </span>
      </button>
      {node.children.map((child) => (
        <PageRow key={child.id} node={child} depth={depth + 1} selectedPageId={selectedPageId} onSelect={onSelect} />
      ))}
    </div>
  );
}
