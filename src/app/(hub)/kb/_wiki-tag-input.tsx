"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cleanWikiTag,
  normalizeWikiTags,
  rankTagSuggestions,
  resolveWikiTagCasing,
  type WikiTagCount,
} from "@/lib/wiki/tags";

// Task 401 — tag pill input shared by the doc panel's edit mode and the New Page modal.
// Existing tags render as removable pills; typing suggests catalog tags, and a tag with no
// matching suggestion is created as new on Enter / comma / blur. A case-insensitive match to a
// catalog tag reuses the catalog's casing so `CiteForge` and `citeforge` don't both exist.

export function WikiTagInput({
  id,
  value,
  onChange,
  catalog,
  contextTitle = "",
  className,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  catalog: WikiTagCount[];
  contextTitle?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = cleanWikiTag(text);
  const suggestions = useMemo(
    () => rankTagSuggestions(catalog, query, contextTitle, value),
    [catalog, query, contextTitle, value]
  );
  const alreadyAdded = value.some((t) => t.toLowerCase() === query.toLowerCase());
  const exactExists = catalog.some((c) => c.tag.toLowerCase() === query.toLowerCase());
  const showCreate = query.length > 0 && !exactExists && !alreadyAdded;

  function commit(raw: string[]) {
    const added = raw.map((t) => resolveWikiTagCasing(cleanWikiTag(t), catalog));
    const next = normalizeWikiTags([...value, ...added]);
    if (next.length !== value.length) onChange(next);
    setText("");
    setHighlight(-1);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleChange(next: string) {
    // Pasting or typing "a, b" commits everything before the last comma.
    if (next.includes(",")) {
      const parts = next.split(",");
      const rest = parts.pop() ?? "";
      commit(parts);
      setText(rest.trimStart());
    } else {
      setText(next);
      setHighlight(-1);
    }
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Only swallow Enter when it commits a tag — an empty input lets it submit the
      // surrounding form (New Page modal).
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault();
        commit([suggestions[highlight]]);
      } else if (query) {
        e.preventDefault();
        commit([query]);
      }
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      remove(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Escape") {
      // Keep the Escape from also closing a parent modal.
      if (open) e.stopPropagation();
      setOpen(false);
      setHighlight(-1);
    }
  }

  const dropdownVisible = open && (suggestions.length > 0 || showCreate);

  return (
    <div className={cn("relative", className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 min-h-9 px-2 py-1.5 rounded-[8px] border border-[#E2E7F2] bg-[#F4F6FB] cursor-text transition-colors focus-within:border-[#007BFF] focus-within:bg-white"
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-[11.5px] bg-white border border-[#E2E7F2] text-[#3A4565] rounded-full pl-2 pr-1 py-0.5"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(tag); }}
              aria-label={`Remove tag ${tag}`}
              className="flex items-center justify-center w-4 h-4 rounded-full text-[#94A3B8] cursor-pointer transition-colors hover:bg-[#FDE8E6] hover:text-[#C0392B]"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (query) commit([query]);
          }}
          placeholder={value.length === 0 ? "Add tags…" : ""}
          className="flex-1 min-w-24 bg-transparent outline-none text-[12.5px] text-[#3A4565] placeholder:text-[#94A3B8] py-0.5"
        />
      </div>

      {dropdownVisible && (
        // onMouseDown preventDefault keeps focus in the input so its onBlur doesn't commit
        // the half-typed text before the click lands.
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1"
        >
          {!query && (
            <p className="px-2 pt-1 pb-1.5 text-[10.5px] font-bold tracking-[0.06em] text-[#94A3B8]">SUGGESTED</p>
          )}
          {suggestions.map((tag, i) => (
            <button
              key={tag}
              type="button"
              onClick={() => commit([tag])}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex w-full items-center rounded-[7px] px-2 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors",
                i === highlight ? "bg-[#F4F6FB]" : "hover:bg-[#F4F6FB]"
              )}
            >
              {tag}
            </button>
          ))}
          {showCreate && (
            <>
              {suggestions.length > 0 && <div className="my-1 h-px bg-[#EDF0F7]" />}
              <button
                type="button"
                onClick={() => commit([query])}
                onMouseEnter={() => setHighlight(-1)}
                className="flex w-full items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-[#0063D6] cursor-pointer transition-colors hover:bg-[#F0F7FF]"
              >
                <Plus size={12} /> Create &ldquo;{query}&rdquo;
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
