"use client";

import { useState } from "react";

export type CustomerOption = { customer_id: string; company_name: string };

export const TEXT_INPUT =
  "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none border-[#E2E7F2] bg-white text-[#3A4565] focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

// Task 498 — customer typeahead shared by the order detail Convert panel and the Link existing
// project dialog (moved verbatim from _convert-panel.tsx). The parent owns the selected id.
export function CustomerSearch({
  initialQuery = "",
  selectedId,
  onSelect,
}: {
  initialQuery?: string;
  selectedId: string;
  onSelect: (customer: CustomerOption) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CustomerOption[]>([]);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q.trim())}&limit=8`);
      const json = await res.json();
      if (Array.isArray(json)) {
        setResults(json.map((c: CustomerOption) => ({ customer_id: c.customer_id, company_name: c.company_name })));
      }
    } catch {
      setResults([]);
    }
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search customers…"
        aria-label="Search customers"
        className={TEXT_INPUT}
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] overflow-hidden">
          {results.map((c) => (
            <button
              key={c.customer_id}
              type="button"
              onClick={() => {
                onSelect(c);
                setQuery(c.company_name);
                setResults([]);
              }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
            >
              <span className="text-[#0B1533]">{c.company_name}</span>{" "}
              <span className="font-mono text-[#5F6A88]">{c.customer_id}</span>
            </button>
          ))}
        </div>
      )}
      {selectedId && <p className="text-[11px] text-[#5F6A88] mt-1 font-mono">Selected: {selectedId}</p>}
    </div>
  );
}
