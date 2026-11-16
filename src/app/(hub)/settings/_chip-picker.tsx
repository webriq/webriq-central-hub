"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Task 476 rev 4 — one Settings field: a label and a textarea-style box holding the selected
// records as removable chips. Typing searches existing records; Save sends only what changed.
export type PickerItem = { id: string; label: string; sub?: string | null };
type Row = Record<string, unknown>;

export function ChipPicker({
  label, description, placeholder, endpoint, params, toItem, initial, kind, confirmText,
}: {
  label: string;
  description: string;
  placeholder: string;
  endpoint: string;
  params?: Record<string, string>;
  toItem: (row: Row) => PickerItem;
  initial: PickerItem[];
  kind?: "customer" | "project";
  // Shown before saving when the change has side effects (company → its projects).
  confirmText?: (added: number, removed: number) => string;
}) {
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const [selected, setSelected] = useState(initial);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PickerItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  const initialIds = new Set(initial.map((i) => i.id));
  const selectedIds = new Set(selected.map((i) => i.id));
  const add = selected.filter((i) => !initialIds.has(i.id)).map((i) => i.id);
  const remove = initial.filter((i) => !selectedIds.has(i.id)).map((i) => i.id);
  const dirty = add.length + remove.length > 0;
  const paramKey = JSON.stringify(params ?? {});

  // Debounced server search (300 ms); already-selected records are left out of the suggestions.
  useEffect(() => {
    if (!q.trim()) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      const qs = new URLSearchParams({ ...JSON.parse(paramKey), q });
      fetch(`${endpoint}?${qs}`, { signal: ctrl.signal })
        .then(async (res) => {
          const d = await res.json() as { rows?: Row[]; error?: string };
          if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
          setOptions((d.rows ?? []).map(toItem));
          setActive(0);
        })
        .catch((e: Error) => { if (e.name !== "AbortError") setError(e.message); })
        .finally(() => setSearching(false));
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, endpoint, paramKey, toItem]);

  const suggestions = q.trim() ? options.filter((o) => !selectedIds.has(o.id)).slice(0, 8) : [];
  const showList = open && q.trim() !== "";

  // Open the suggestions above the box when there isn't room for the list (max-h-64 = 256px) below it.
  useLayoutEffect(() => {
    if (!showList || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setDropUp(below < 264 && r.top > below);
  }, [showList]);

  function pick(item: PickerItem) {
    setSelected((s) => [...s, item]);
    setQ("");
    setOptions([]);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && showList && suggestions[active]) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Backspace" && !q && selected.length) setSelected((s) => s.slice(0, -1));
  }

  async function save() {
    setConfirming(false);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(kind ? { kind } : {}), add, remove }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(`${label} saved`);
      router.refresh(); // reloads every field's saved state (a company change also moves its projects)
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={inputId} className="text-[13px] font-semibold text-[#0B1533]">{label}</label>
        <p className="text-[12px] text-[#5F6A88]">{description}</p>
      </div>

      <div ref={boxRef} className="relative">
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex min-h-24 cursor-text flex-wrap content-start gap-1.5 rounded-[10px] border border-[#E2E7F2] bg-white p-2 transition-colors focus-within:border-[#007BFF] focus-within:ring-[3px] focus-within:ring-[#007BFF]/15"
        >
          {selected.map((item) => (
            <span key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F0F7FF] py-0.5 pl-2.5 pr-1 text-[12px] text-[#0B1533]">
              <span className="truncate">{item.label}</span>
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                onClick={(e) => { e.stopPropagation(); setSelected((s) => s.filter((i) => i.id !== item.id)); }}
                className="rounded-full p-0.5 text-[#5F6A88] transition-colors hover:bg-[#E5F1FF] hover:text-[#0B1533] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
            value={q}
            placeholder={selected.length ? "Type to add more…" : placeholder}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setError(null); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-[13px] text-[#0B1533] outline-none placeholder:text-[#5F6A88]"
          />
        </div>

        {showList && (
          <ul id={listId} role="listbox" className={cn("absolute inset-x-0 z-20 max-h-64 overflow-y-auto rounded-[10px] border border-[#E2E7F2] bg-white p-1 shadow-lg", dropUp ? "bottom-full mb-1" : "top-full mt-1")}>
            {searching && suggestions.length === 0 ? (
              <li className="flex items-center gap-2 px-2.5 py-2 text-[12px] text-[#5F6A88]"><Loader2 size={12} className="animate-spin" aria-hidden /> Searching…</li>
            ) : suggestions.length === 0 ? (
              <li className="px-2.5 py-2 text-[12px] text-[#5F6A88]">No matches for “{q.trim()}”</li>
            ) : (
              suggestions.map((o, i) => (
                <li
                  key={o.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("cursor-pointer rounded-md px-2.5 py-1.5 transition-colors", i === active ? "bg-[#F0F7FF]" : "hover:bg-[#F4F6FB]")}
                >
                  <p className="truncate text-[13px] text-[#0B1533]">{o.label}</p>
                  {o.sub && <p className="truncate text-[11px] text-[#5F6A88]">{o.sub}</p>}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <span className="text-[12px] text-[#3A4565]">{confirmText?.(add.length, remove.length)}</span>
            <button type="button" onClick={() => void save()} className="rounded-lg bg-[#007BFF] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0063D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF] focus-visible:ring-offset-1">Confirm</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF]">Cancel</button>
          </>
        ) : (
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => (confirmText ? setConfirming(true) : void save())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#007BFF] px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0063D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007BFF] focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" aria-hidden />} Save
          </button>
        )}
        {dirty && !confirming && (
          <span className="text-[12px] text-[#5F6A88]">
            {[add.length && `${add.length} to add`, remove.length && `${remove.length} to remove`].filter(Boolean).join(", ")}
          </span>
        )}
        {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      </div>
    </div>
  );
}
