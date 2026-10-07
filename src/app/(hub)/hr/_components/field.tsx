import type { ReactNode } from "react";
import { labelClass } from "./ui";

/** Label above, control, then an inline plain-language error (what happened, how to fix). */
export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-[#5F6A88]">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-[11px] text-[#C0392B]">{error}</p>}
    </div>
  );
}
