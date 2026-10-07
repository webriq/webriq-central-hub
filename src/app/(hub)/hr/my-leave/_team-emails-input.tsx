"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { fieldClass } from "../_components/ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Type an address and press Enter / comma / Tab to add it as a removable chip (max 10). */
export function TeamEmailsInput({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL.test(email)) return setError("Enter a full email address, like name@webriq.com.");
    if (value.length >= 10) return setError("You can tell up to 10 teammates.");
    if (!value.includes(email)) onChange([...value, email]);
    setDraft("");
    setError(null);
  }

  return (
    <div>
      <input
        id={id}
        type="email"
        className={fieldClass}
        value={draft}
        placeholder="Add a teammate's email"
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," ) { e.preventDefault(); commit(); } }}
      />
      {error && <p role="alert" className="mt-1 text-[11px] text-[#C0392B]">{error}</p>}
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((e) => (
            <li key={e} className="inline-flex items-center gap-1 rounded-full bg-[#EDF0F7] py-1 pl-2.5 pr-1 font-mono text-[11px] text-[#3A4565]">
              {e}
              <button type="button" aria-label={`Remove ${e}`} onClick={() => onChange(value.filter((x) => x !== e))} className="rounded-full p-0.5 text-[#5F6A88] hover:bg-white hover:text-[#0B1533]"><X size={11} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
