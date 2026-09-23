"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WikiPageDetail, WikiPageSummary, WikiProduct, WikiStatus } from "@/types/wiki";
import { WikiTreePanel } from "./_wiki-tree-panel";
import { WikiDocPanel } from "./_wiki-doc-panel";
import { WikiInfoPanel, type TocEntry } from "./_wiki-info-panel";
import { WikiNewPageModal } from "./_wiki-new-page-modal";
import { WikiImportModal } from "./_wiki-import-modal";
import { WikiEmptyState } from "./_wiki-empty-state";
import { V2_ROUTES } from "@/config/constants";

// Task 395 — client orchestrator for /kb. Owns selection state (synced to the URL via
// `router.replace`, Files-tab-deep-link precedent, task 359) and fetches page detail through
// the API routes; the server `page.tsx` only supplies the initial lightweight tree + resolved
// selection so first paint doesn't need a client round trip for the tree itself.

// Assigns sequential ids to h2/h3 in the rendered HTML and returns a matching TOC list — done
// once per content load so the doc panel and info panel stay in lockstep on the same ids.
function extractToc(html: string): { html: string; toc: TocEntry[] } {
  if (typeof window === "undefined" || !html.trim()) return { html, toc: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const toc: TocEntry[] = [];
  doc.querySelectorAll("h2, h3").forEach((el, i) => {
    const id = `wiki-heading-${i}`;
    el.id = id;
    toc.push({ id, level: el.tagName === "H2" ? 2 : 3, text: el.textContent ?? "" });
  });
  return { html: doc.body.innerHTML, toc };
}

export function WikiShell({
  initialPages,
  initialProduct,
  initialPageId,
  canWrite,
}: {
  initialPages: WikiPageSummary[];
  initialProduct: WikiProduct;
  initialPageId: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [selectedProduct, setSelectedProduct] = useState(initialProduct);
  const [selectedPageId, setSelectedPageId] = useState(initialPageId);
  const [detail, setDetail] = useState<WikiPageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContentHtml, setDraftContentHtml] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingPage, setDeletingPage] = useState(false);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const [newPageModal, setNewPageModal] = useState<{ product: WikiProduct; parentId: string | null } | null>(null);
  const [importModal, setImportModal] = useState<{ product: WikiProduct; parentId: string | null } | null>(null);

  const loadDetail = useCallback(async (pageId: string) => {
    setDetailLoading(true);
    setEditMode(false);
    setActiveTocId(null);
    try {
      const res = await fetch(`/api/wiki/pages/${pageId}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshPages = useCallback(async () => {
    const res = await fetch("/api/wiki/pages");
    if (res.ok) setPages(await res.json());
  }, []);

  useEffect(() => {
    // Deferred a microtask, matching this codebase's established fix for
    // react-hooks/set-state-in-effect (e.g. _ticket-detail.tsx, _attachments-tab.tsx) — an
    // effect body must not call setState synchronously, even indirectly through loadDetail().
    if (selectedPageId) Promise.resolve().then(() => loadDetail(selectedPageId));
    else Promise.resolve().then(() => setDetail(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId]);

  function updateUrl(product: WikiProduct, pageId: string | null) {
    const params = new URLSearchParams({ space: product });
    if (pageId) params.set("page", pageId);
    router.replace(`${V2_ROUTES.KB}?${params.toString()}`, { scroll: false });
  }

  function selectSpace(product: WikiProduct) {
    setSelectedProduct(product);
    updateUrl(product, selectedPageId);
  }

  function selectPage(pageId: string, product: WikiProduct) {
    setSelectedProduct(product);
    setSelectedPageId(pageId);
    updateUrl(product, pageId);
  }

  function enterEdit() {
    if (!detail) return;
    setDraftTitle(detail.title);
    setDraftContentHtml(detail.contentHtml);
    setDraftTags(detail.tags.join(", "));
    setEditMode(true);
  }

  async function save() {
    if (!detail || saving) return;
    setSaving(true);
    try {
      const tags = draftTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/wiki/pages/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim(), contentHtml: draftContentHtml, tags }),
      });
      if (res.ok) {
        setEditMode(false);
        await Promise.all([loadDetail(detail.id), refreshPages()]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deletePage(): Promise<boolean> {
    if (!detail || deletingPage) return false;
    setDeletingPage(true);
    try {
      const deletedId = detail.id;
      const deletedProduct = detail.product;
      const res = await fetch(`/api/wiki/pages/${deletedId}`, { method: "DELETE" });
      if (!res.ok) return false;
      const nextPages = pages.filter((p) => p.id !== deletedId && p.parentId !== deletedId);
      setPages(nextPages);
      const fallback = nextPages
        .filter((p) => p.product === deletedProduct && p.status !== "archived")
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (fallback) {
        selectPage(fallback.id, fallback.product);
      } else {
        setSelectedPageId(null);
        setDetail(null);
        updateUrl(deletedProduct, null);
      }
      void refreshPages();
      return true;
    } finally {
      setDeletingPage(false);
    }
  }

  async function changeStatus(status: WikiStatus) {
    if (!detail) return;
    const res = await fetch(`/api/wiki/pages/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await Promise.all([loadDetail(detail.id), refreshPages()]);
  }

  // Shared by both the New Page and Import modals — only one is ever open at a time, so
  // closing both is harmless and keeps this a single callback for the identical
  // `(page: WikiPageSummary) => void` contract each one already uses.
  function onPageCreated(page: WikiPageSummary) {
    setNewPageModal(null);
    setImportModal(null);
    void refreshPages();
    selectPage(page.id, page.product);
  }

  const { html: renderedHtml, toc } = useMemo(
    () => extractToc(detail?.contentHtml ?? ""),
    [detail?.contentHtml]
  );

  function scrollToHeading(id: string) {
    setActiveTocId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const hasPagesInSpace = pages.some((p) => p.product === selectedProduct);

  // `h-full` + `overflow-hidden` on the outer row, rather than each panel scrolling the shared
  // `<main>` (which already has its own `overflow-y-auto` in `v2-hub-shell.tsx`) — this reclaims
  // a bounded height so Panel 1/2/3 each get their own independent scroll region, matching the
  // Ticket Detail page's `h-full overflow-y-auto` precedent one level up.
  return (
    <div className="h-full flex overflow-hidden">
      <WikiTreePanel
        pages={pages}
        selectedProduct={selectedProduct}
        selectedPageId={selectedPageId}
        onSelectSpace={selectSpace}
        onSelectPage={selectPage}
        onNewPage={() => setNewPageModal({ product: selectedProduct, parentId: null })}
        onImport={() => setImportModal({ product: selectedProduct, parentId: null })}
        canWrite={canWrite}
      />

      {detailLoading ? (
        <div className="flex-1 flex flex-col gap-3 px-10 py-8 max-w-[760px] mx-auto w-full animate-pulse">
          <div className="h-5 w-40 bg-[#F4F6FB] rounded-full" />
          <div className="h-8 w-2/3 bg-[#F4F6FB] rounded-[8px] mt-2" />
          <div className="h-4 w-1/3 bg-[#F4F6FB] rounded-[6px] mt-2" />
          <div className="h-3 w-full bg-[#F4F6FB] rounded-[6px] mt-6" />
          <div className="h-3 w-full bg-[#F4F6FB] rounded-[6px]" />
          <div className="h-3 w-5/6 bg-[#F4F6FB] rounded-[6px]" />
        </div>
      ) : detail ? (
        <WikiDocPanel
          detail={detail}
          renderedHtml={renderedHtml}
          canWrite={canWrite}
          editMode={editMode}
          draftTitle={draftTitle}
          draftContentHtml={draftContentHtml}
          draftTags={draftTags}
          saving={saving}
          deleting={deletingPage}
          childCount={pages.filter((p) => p.parentId === detail.id).length}
          onDraftTitleChange={setDraftTitle}
          onDraftContentChange={setDraftContentHtml}
          onDraftTagsChange={setDraftTags}
          onEnterEdit={enterEdit}
          onCancelEdit={() => setEditMode(false)}
          onSave={save}
          onStatusChange={changeStatus}
          onDelete={deletePage}
        />
      ) : (
        <WikiEmptyState
          title={hasPagesInSpace ? "Select a page" : `No pages in ${selectedProduct} yet`}
          message={
            hasPagesInSpace
              ? "Choose a page from the tree on the left to read it."
              : canWrite
                ? "Create the first page for this space to get started."
                : "Nothing has been written for this space yet."
          }
          actionLabel={canWrite ? "New page" : undefined}
          onAction={canWrite ? () => setNewPageModal({ product: selectedProduct, parentId: null }) : undefined}
        />
      )}

      {detail && !detailLoading && (
        <WikiInfoPanel
          detail={detail}
          toc={toc}
          activeTocId={activeTocId}
          onTocClick={scrollToHeading}
          onSelectRelated={selectPage}
        />
      )}

      {newPageModal && (
        <WikiNewPageModal
          defaultProduct={newPageModal.product}
          defaultParentId={newPageModal.parentId}
          pages={pages}
          onClose={() => setNewPageModal(null)}
          onCreated={onPageCreated}
        />
      )}

      {importModal && (
        <WikiImportModal
          defaultProduct={importModal.product}
          defaultParentId={importModal.parentId}
          pages={pages}
          onClose={() => setImportModal(null)}
          onCreated={onPageCreated}
        />
      )}
    </div>
  );
}
