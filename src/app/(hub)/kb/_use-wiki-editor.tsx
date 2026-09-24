"use client";

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { WikiConflictInfo, WikiDraftContent, WikiPageDetail } from "@/types/wiki";
import { useWikiDraft, type WikiDraftValues } from "./_use-wiki-draft";
import { WikiChoiceDialog, WikiCompareModal, type WikiDialogAction } from "./_wiki-conflict-modal";

// Task 402 — the wiki editor's state machine, pulled out of `_wiki-shell.tsx` (already ~290
// lines) so the shell stays wiring-only. Owns: edit mode + draft fields, the revision the edit
// started from (`baseRevision`, sent with Save for the server's conflict check), server-draft
// autosave (`useWikiDraft`), and the three dialogs — resume-draft, cancel-with-changes, and the
// 409 save-conflict compare.

type Conflict = { theirs: WikiPageDetail; info: WikiConflictInfo | null; busy: boolean };
type StaleCompare = { draft: WikiDraftValues; theirs: WikiPageDetail; resume: () => void; discard: () => void };
type Choice = { title: string; body: string; actions: WikiDialogAction[] };

function timeOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function valuesOf(page: WikiPageDetail): WikiDraftValues {
  return { title: page.title, contentHtml: page.contentHtml, tags: page.tags };
}

export function useWikiEditor({
  detail,
  onSaved,
  onReload,
}: {
  detail: WikiPageDetail | null;
  // Successful save — the shell reloads the page/tree and broadcasts the new revision.
  onSaved: (pageId: string, revision: number) => void;
  onReload: (pageId: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContentHtml, setDraftContentHtml] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<WikiDraftValues | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [entering, setEntering] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [staleCompare, setStaleCompare] = useState<StaleCompare | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);

  const values = useMemo(
    () => ({ title: draftTitle, contentHtml: draftContentHtml, tags: draftTags }),
    [draftTitle, draftContentHtml, draftTags]
  );
  const draft = useWikiDraft({ pageId: detail?.id ?? null, enabled: editMode, values, baseline, baseRevision });

  function begin(v: WikiDraftValues, base: number) {
    setDraftTitle(v.title);
    setDraftContentHtml(v.contentHtml);
    setDraftTags(v.tags);
    setBaseline(v);
    setBaseRevision(base);
    setEditMode(true);
  }

  function exit() {
    setEditMode(false);
    setBaseline(null);
    setBaseRevision(null);
    setConflict(null);
  }

  async function enterEdit() {
    if (!detail) return;
    const page = detail;
    if (!page.myDraft) return begin(valuesOf(page), page.revision);

    setEntering(true);
    let saved: WikiDraftContent;
    try {
      const res = await fetch(`/api/wiki/pages/${page.id}/draft`);
      if (!res.ok) return begin(valuesOf(page), page.revision);
      saved = (await res.json()) as WikiDraftContent;
    } finally {
      setEntering(false);
    }
    const draftValues: WikiDraftValues = { title: saved.title, contentHtml: saved.contentHtml, tags: saved.tags };
    const stale = saved.baseRevision < page.revision;

    // Resuming keeps the draft's own base revision, so a stale draft still hits the server's
    // conflict check on Save instead of silently overwriting the newer page.
    const resume = () => {
      setChoice(null);
      setStaleCompare(null);
      begin(draftValues, saved.baseRevision);
    };
    const discard = async () => {
      setChoice(null);
      setStaleCompare(null);
      await draft.discard(page.id);
      begin(valuesOf(page), page.revision);
    };

    setChoice({
      title: "Resume your draft?",
      body: `You have unsaved changes on this page from ${timeOf(saved.updatedAt)}.${
        stale ? " The page has been updated since then — review the differences before continuing." : ""
      }`,
      actions: [
        ...(stale
          ? [{ label: "View differences", onClick: () => { setChoice(null); setStaleCompare({ draft: draftValues, theirs: page, resume, discard: () => void discard() }); } }]
          : []),
        { label: "Discard draft", onClick: () => void discard(), variant: "danger" },
        { label: "Resume draft", onClick: resume, variant: "primary" },
      ],
    });
  }

  function cancelEdit() {
    if (!detail) return;
    if (!draft.dirty && draft.savedAt === null) return exit();
    const pageId = detail.id;
    setChoice({
      title: "Keep your changes?",
      body: "Your edits haven't been saved to the page. Keep them as a private draft you can resume later, or discard them.",
      actions: [
        { label: "Keep editing", onClick: () => setChoice(null) },
        {
          label: "Discard changes",
          variant: "danger",
          onClick: () => {
            setChoice(null);
            void draft.discard(pageId).then(() => onReload(pageId));
            exit();
          },
        },
        {
          label: "Keep as draft",
          variant: "primary",
          // Persist BEFORE exit(): exiting clears baseRevision, which the draft write needs.
          onClick: () => {
            setChoice(null);
            void draft.persistNow().then(() => {
              exit();
              onReload(pageId);
            });
          },
        },
      ],
    });
  }

  // Leaving the page (tree click, related page, delete) while editing — the changes are kept
  // server-side rather than dropped, same as closing the tab.
  function leaveForNavigation() {
    if (!editMode) return;
    if (draft.dirty) {
      void draft.flush();
      toast("Your edits were kept as a draft — open Edit on that page to resume.");
    }
    exit();
  }

  // Returns true only when the page was saved; false leaves the user in edit mode.
  async function submit(page: WikiPageDetail, base: number): Promise<boolean> {
    const res = await fetch(`/api/wiki/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draftTitle.trim(), contentHtml: draftContentHtml, tags: draftTags, baseRevision: base }),
    });

    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { current?: WikiConflictInfo | null } | null;
      const latest = await fetch(`/api/wiki/pages/${page.id}`);
      if (!latest.ok) {
        toast.error("This page changed while you were editing, and the latest version couldn't be loaded.");
        return false;
      }
      setConflict({ theirs: (await latest.json()) as WikiPageDetail, info: body?.current ?? null, busy: false });
      return false;
    }
    if (!res.ok) {
      toast.error("Couldn't save the page. Your changes are still here — try again.");
      return false;
    }
    const { revision } = (await res.json()) as { revision: number };
    setConflict(null);
    exit();
    onSaved(page.id, revision);
    return true;
  }

  async function save() {
    if (!detail || saving || baseRevision === null) return;
    setSaving(true);
    try {
      await draft.settle();
      // settle() dropped the queued draft write; if the save didn't land, write the draft now
      // so the latest edits are still protected (and the tab-close guard isn't the only net).
      if (!(await submit(detail, baseRevision))) void draft.persistNow();
    } finally {
      setSaving(false);
    }
  }

  async function overwrite() {
    if (!conflict || !detail) return;
    setConflict({ ...conflict, busy: true });
    // Base the retry on THEIR revision: an explicit, informed overwrite. Their version is not
    // lost — it's already a revision in History.
    await submit(detail, conflict.theirs.revision);
    setConflict((c) => (c ? { ...c, busy: false } : c));
  }

  async function reloadTheirs() {
    if (!detail) return;
    const pageId = detail.id;
    setConflict(null);
    await draft.persistNow();
    exit();
    onReload(pageId);
    toast("Loaded the latest version. Your changes are saved as a draft — open Edit to compare and resume.");
  }

  let dialogs: ReactNode = null;
  if (conflict) {
    const who = conflict.info?.updatedBy?.name ?? "Someone";
    dialogs = (
      <WikiCompareModal
        title="This page was changed while you were editing"
        message={`${who} saved a newer version${conflict.info ? ` at ${timeOf(conflict.info.updatedAt)}` : ""}. Review what differs between their version and yours, then choose how to continue.`}
        oldSide={valuesOf(conflict.theirs)}
        newSide={values}
        oldLabel={`${who}'s version`}
        newLabel="Your changes"
        onClose={() => setConflict(null)}
        actions={[
          { label: "Keep editing", onClick: () => setConflict(null), disabled: conflict.busy },
          { label: "Load theirs, keep mine as draft", onClick: () => void reloadTheirs(), disabled: conflict.busy },
          { label: "Overwrite with mine", onClick: () => void overwrite(), variant: "danger", busy: conflict.busy },
        ]}
      />
    );
  } else if (staleCompare) {
    dialogs = (
      <WikiCompareModal
        title="Your draft is based on an older version"
        message="Someone saved this page after you started your draft. Compare, then resume your draft (you'll confirm before overwriting on save) or discard it."
        oldSide={valuesOf(staleCompare.theirs)}
        newSide={staleCompare.draft}
        oldLabel="Current page"
        newLabel="Your draft"
        onClose={() => setStaleCompare(null)}
        actions={[
          { label: "Discard draft", onClick: staleCompare.discard, variant: "danger" },
          { label: "Resume draft", onClick: staleCompare.resume, variant: "primary" },
        ]}
      />
    );
  } else if (choice) {
    dialogs = <WikiChoiceDialog title={choice.title} body={choice.body} actions={choice.actions} onClose={() => setChoice(null)} />;
  }

  return {
    editMode,
    draftTitle,
    draftContentHtml,
    draftTags,
    setDraftTitle,
    setDraftContentHtml,
    setDraftTags,
    saving,
    entering,
    draftStatus: draft.status,
    draftSavedAt: draft.savedAt,
    enterEdit,
    cancelEdit,
    save,
    leaveForNavigation,
    dialogs,
  };
}
