"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Task 466 — `@` mention for the task/ticket comment composers (v2 + legacy copies). Picking a
// person inserts `<span data-type="mention" class="mention" data-id="<uuid>" data-label="<name>">`;
// the comment POST routes read those ids server-side (src/lib/comments/mentions.ts) and notify
// each person. Also the extension task 460's Cliq DMs reuse.

type MentionMember = { id: string; full_name: string; role: string };
type MentionAttrs = { id: string; label: string };

const MAX_ITEMS = 8;

// Styles a mention token both in the composer and in the posted-comment render.
export const MENTION_CLASSES =
  "[&_.mention]:rounded-full [&_.mention]:bg-[#E8F1FC] [&_.mention]:px-1.5 [&_.mention]:py-px [&_.mention]:font-medium [&_.mention]:text-[#0063D6] [&_.mention]:whitespace-nowrap";

// Fetched once per page load and shared by every composer on the page; a failed fetch is
// forgotten so the next `@` retries.
let membersPromise: Promise<MentionMember[]> | null = null;

function loadMembers(): Promise<MentionMember[]> {
  membersPromise ??= fetch("/api/staff/members")
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((rows: Array<Omit<MentionMember, "full_name"> & { full_name: string | null }>) =>
      rows.filter((m): m is MentionMember => !!m.full_name?.trim()))
    .catch((err) => {
      console.error("[mentions] staff members fetch failed:", err);
      membersPromise = null;
      return [];
    });
  return membersPromise;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  pm: "PM",
  developer: "Developer",
  hr: "HR",
  marketing: "Marketing",
};

type MentionListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionMember, MentionAttrs>>(
  function MentionList({ items, command, editor, loading }, ref) {
    const [active, setActive] = useState(0);
    const listId = useId();
    const optionId = (i: number) => `${listId}-opt-${i}`;

    useEffect(() => setActive(0), [items]);

    function pick(i: number) {
      const m = items[i];
      if (m) command({ id: m.id, label: m.full_name });
    }

    // Focus never leaves the editor, so the combobox wiring lives on its contenteditable.
    useEffect(() => {
      const dom = editor.view.dom;
      dom.setAttribute("aria-expanded", "true");
      // The listbox only exists while there are options (loading/empty states render a <p>).
      if (items.length > 0) {
        dom.setAttribute("aria-controls", listId);
        dom.setAttribute("aria-activedescendant", optionId(active));
      } else {
        dom.removeAttribute("aria-controls");
        dom.removeAttribute("aria-activedescendant");
      }
      return () => {
        dom.removeAttribute("aria-controls");
        dom.removeAttribute("aria-expanded");
        dom.removeAttribute("aria-activedescendant");
      };
    });

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          setActive((a) => (a + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((a) => (a + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pick(active);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-64 overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-white py-1 shadow-lg">
        {loading && items.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#6B7A99]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Loading people…
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-[#6B7A99]">No matching people</p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Mention a person" className="max-h-60 overflow-y-auto">
            {items.map((m, i) => (
              <li
                key={m.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // mousedown, not click — keeps focus (and the selection) in the editor.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-[13px] transition-colors",
                  i === active ? "border-[#0063D6] bg-[#E8F1FC] text-[#0063D6]" : "border-transparent text-[#3A4565]"
                )}
              >
                <span className="truncate font-medium">{m.full_name}</span>
                <span className="shrink-0 text-[11px] text-[#6B7A99]">{ROLE_LABEL[m.role] ?? m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);

export const CommentMention = Mention.configure({
  HTMLAttributes: { class: "mention" },
  deleteTriggerWithBackspace: true,
  suggestion: {
    char: "@",
    // Locked composers (posting in progress) never open the list.
    allow: ({ editor }) => editor.isEditable,
    items: async ({ query }) => {
      const q = query.trim().toLowerCase();
      const members = await loadMembers();
      return members.filter((m) => !q || m.full_name.toLowerCase().includes(q)).slice(0, MAX_ITEMS);
    },
    render: () => {
      let component: ReactRenderer<MentionListHandle, SuggestionProps<MentionMember, MentionAttrs>> | null = null;
      let unmount: (() => void) | undefined;
      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, { props, editor: props.editor });
          unmount = props.mount(component.element as HTMLElement);
        },
        onUpdate: (props) => component?.updateProps(props),
        onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
        onExit: () => {
          unmount?.();
          component?.destroy();
          component = null;
        },
      };
    },
  },
});
