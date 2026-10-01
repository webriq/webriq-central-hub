"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

// Task 411 — inline edit form shared by the task and ticket comment threads. The two threads use
// different Tiptap editors (each wired to its own image-upload route), so the editor is a render
// prop; this owns only the Save/Cancel chrome, the saving state, and the inline error.

export type CommentEditorRenderProps = {
  initialHtml: string;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  disabled: boolean;
};

// A comment counts as edited once `updated_at` moves meaningfully past `created_at` (rows get both
// stamped within the same insert, so allow a couple of seconds of skew).
export function isCommentEdited(createdAt: string, updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 2000;
}

export function CommentEditForm({
  initialHtml,
  allowEmpty,
  renderEditor,
  onSave,
  onCancel,
}: {
  initialHtml: string;
  // True when the comment has attachments — an attachment-only comment is legal (task 301).
  allowEmpty: boolean;
  renderEditor: (props: CommentEditorRenderProps) => ReactNode;
  // Resolves to an error message, or null on success (the parent then closes the form).
  onSave: (html: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [html, setHtml] = useState(initialHtml);
  const [isEmpty, setIsEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unchanged = html.trim() === initialHtml.trim();
  const canSave = !saving && !unchanged && (!isEmpty || allowEmpty);

  async function save() {
    setSaving(true);
    setError(null);
    const message = await onSave(html);
    // On success the parent unmounts this form, so only the failure path needs to reset state.
    if (message) {
      setError(message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      {renderEditor({ initialHtml, onChange: setHtml, onEmptyChange: setIsEmpty, disabled: saving })}
      {error && <p role="alert" className="text-[11px] text-[#C0392B]">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-2.5 py-1 rounded-md text-[12px] text-[#5F6A88] hover:bg-[#F4F6FB] cursor-pointer transition-colors disabled:opacity-45"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#007BFF] text-[12px] font-medium text-white hover:bg-[#0063D6] cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}
