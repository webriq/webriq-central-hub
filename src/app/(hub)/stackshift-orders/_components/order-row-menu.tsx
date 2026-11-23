"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ExternalLink, FolderSearch, MoreVertical, Trash2, type LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import LinkProjectDialog from "./link-project-dialog";
import type { OrderStatus } from "./orders-table";

const MENU_WIDTH = 200;
const MENU_HEIGHT = 190;

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_review: "Pending review",
  converted: "Converted",
  dismissed: "Dismissed",
};

type Action = "archive" | "restore" | "delete";

const ACTION_COPY: Record<Action, { busy: string; done: string; confirm: string; tone: "danger" | "neutral" }> = {
  archive: { busy: "Archiving…", done: "Order archived", confirm: "Archive order", tone: "neutral" },
  restore: { busy: "Restoring…", done: "Order restored", confirm: "Restore order", tone: "neutral" },
  delete: { busy: "Deleting…", done: "Order deleted", confirm: "Delete order", tone: "danger" },
};

const ITEM = "flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#007BFF]";

// Task 498 — Orders table row kebab: Open, Link existing project, Archive/Restore, Delete. Every
// mutation goes through a confirm dialog. Fixed-position dropdown anchored to the trigger so the
// table's overflow-hidden can't clip it (same technique as projects' _portfolio-card-menu.tsx).
export default function OrderRowMenu({
  order,
  archived,
  isSuperAdmin,
}: {
  order: { id: string; company_name: string; status: OrderStatus };
  archived: boolean;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  // Esc closes the menu and returns focus to the trigger (keyboard users).
  useEffect(() => {
    if (!menuPos) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuPos(null);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuPos]);

  function toggleMenu() {
    if (menuPos) return setMenuPos(null);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      x: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - MENU_HEIGHT - 8),
    });
  }

  function pick(fn: () => void) {
    setMenuPos(null);
    fn();
  }

  async function run(action: Action) {
    setBusy(true);
    try {
      const res = await fetch(`/api/stackshift-orders/${order.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Action failed — try again.");
      toast.success(ACTION_COPY[action].done);
      setPending(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  const canLink = order.status === "pending_review" && !archived;
  const canDelete = isSuperAdmin && order.status !== "converted";
  const items: { label: string; icon: LucideIcon; onSelect: () => void }[] = [
    { label: "Open order", icon: ExternalLink, onSelect: () => router.push(`${V2_ROUTES.STACKSHIFT_ORDERS}/${order.id}`) },
    ...(canLink ? [{ label: "Link existing project", icon: FolderSearch, onSelect: () => setLinkOpen(true) }] : []),
    archived
      ? { label: "Restore", icon: ArchiveRestore, onSelect: () => setPending("restore") }
      : { label: "Archive", icon: Archive, onSelect: () => setPending("archive") },
  ];

  const dialog = pending && {
    archive: {
      title: `Archive order from ${order.company_name}?`,
      body: "It moves to the Archived tab and can be restored there.",
    },
    restore: {
      title: `Restore order from ${order.company_name}?`,
      body: `It returns to the ${STATUS_LABEL[order.status]} tab.`,
    },
    delete: {
      title: `Delete order from ${order.company_name}?`,
      body: "It's removed from every tab. Only a database admin can recover it.",
    },
  }[pending];

  return (
    <div className="flex justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-label="Order actions"
        aria-haspopup="menu"
        aria-expanded={!!menuPos}
        className="flex items-center justify-center w-7 h-7 rounded-full text-[#5F6A88] hover:bg-[#EDF0F7] hover:text-[#0B1533] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
      >
        <MoreVertical size={15} />
      </button>

      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
          <div
            role="menu"
            aria-label={`Actions for ${order.company_name}`}
            className="fixed z-50 w-[200px] rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            {items.map(({ label, icon: Icon, onSelect }, i) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                autoFocus={i === 0}
                onClick={() => pick(onSelect)}
                className={cn(ITEM, "text-[#3A4565] hover:bg-[#F4F6FB]")}
              >
                <Icon size={13} className="text-[#5F6A88]" /> {label}
              </button>
            ))}
            {canDelete && (
              <>
                <div className="my-1 border-t border-[#EDF0F7]" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick(() => setPending("delete"))}
                  className={cn(ITEM, "text-[#C0392B] hover:bg-[#FDE8E6]")}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!dialog}
        title={dialog ? dialog.title : ""}
        body={dialog ? dialog.body : ""}
        tone={pending ? ACTION_COPY[pending].tone : "danger"}
        confirmLabel={pending ? (busy ? ACTION_COPY[pending].busy : ACTION_COPY[pending].confirm) : ""}
        confirmDisabled={busy}
        onConfirm={() => pending && run(pending)}
        onCancel={() => setPending(null)}
      />

      {linkOpen && (
        <LinkProjectDialog
          orderId={order.id}
          companyName={order.company_name}
          onClose={() => setLinkOpen(false)}
          onLinked={() => {
            setLinkOpen(false);
            toast.success("Order linked to project");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
