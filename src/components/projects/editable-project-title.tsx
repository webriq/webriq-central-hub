"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type EditableProjectTitleHandle = { startEditing: () => void };

// Task 268 — rename-in-place card title, shared by both the Projects grid card and the
// Portfolio Tracker card. Edit mode is entered only via an external `startEditing()` call,
// wired to the kebab menu's "Rename Project" item via a forwardRef. (An earlier version also
// entered edit mode on hover, per the original request's description — removed per user
// feedback: hovering the title to silently swap it for an input caused UX problems, e.g.
// accidental edits from a mouse just passing over the card. The kebab item is now the sole
// entry point; it still reuses this one submit/validate/toast implementation.)
//
// PATCH /api/v2/projects/[projectId] already accepts `{ name }` (task 268 added empty/duplicate
// validation there) — `projectId` here is the display project_id, matching that route's own key.
export const EditableProjectTitle = forwardRef<EditableProjectTitleHandle, {
  name: string;
  projectId: string | null;
  canRename: boolean;
  onRenamed: (newName: string) => void;
  onSearchName: (name: string) => void;
  className?: string;
}>(function EditableProjectTitle({ name, projectId, canRename, onRenamed, onSearchName, className }, ref) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the input's seed value in sync with the current name (e.g. after a rename elsewhere,
  // or a router.refresh() reconciling server state) whenever not actively mid-edit.
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useImperativeHandle(ref, () => ({
    startEditing: () => { if (canRename && projectId) setEditing(true); },
  }));

  if (!canRename || !projectId) {
    return <span className={className}>{name}</span>;
  }

  function revert() {
    setValue(name);
    setEditing(false);
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Project name cannot be empty");
      return;
    }
    if (trimmed === name) {
      revert();
      return;
    }
    setSaving(true);
    const toastId = toast.loading("Saving changes…");
    try {
      const res = await fetch(`/api/v2/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        toast.error(`A project named "${trimmed}" already exists`, {
          id: toastId,
          action: { label: "View", onClick: () => onSearchName(trimmed) },
        });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update project name");
      }
      toast.success("Project name updated", { id: toastId });
      onRenamed(trimmed);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update project name", { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return <span className={className}>{name}</span>;
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value.trim() === name) revert(); }}
      onKeyDown={(e) => {
        // Always stop propagation — both listing cards' clickable wrappers (an <a> for the
        // Projects grid, a <button> for Portfolio Tracker) sit as DOM ancestors of this input
        // (a pre-existing nesting the task doc's Quality Gate Notes already flagged as a risk).
        // Without this, a bare Space keypress bubbles to the ancestor <button>, whose native
        // "Space activates" behavior fires a click on it — reported live as Space redirecting to
        // the project detail page instead of typing a space into the field.
        e.stopPropagation();
        if (e.key === "Escape") revert();
        if (e.key === "Enter") submit();
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        // pointer-events-auto is hardcoded here (not folded into the shared `className` prop,
        // which also styles the plain, non-editing <span>) — the stretched-link card pattern
        // (see _project-grid-view.tsx/_project-card.tsx) sets the whole card's content wrapper
        // to pointer-events-none so clicks pass through to the underlying full-card link/button;
        // this input is the one piece that must opt back in to receive clicks/focus itself.
        "pointer-events-auto w-full cursor-text rounded-md border border-[#A8C6F5] bg-white px-1.5 py-0.5 outline-none focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-60",
        className
      )}
    />
  );
});
