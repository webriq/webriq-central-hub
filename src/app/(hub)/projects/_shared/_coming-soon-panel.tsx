import { Sparkles } from "lucide-react";

// Task 282 (item D7) — the Overview tab's static empty state, extracted so V2's non-applicable
// branch (`_coming-soon-overview.tsx`) and the new Legacy Overview route render byte-identical
// markup. Sized/spaced to match `portfolio-tracker/page.tsx`'s retired-page notice (w-14/h-14
// rounded-2xl icon container, text-[22px] heading) instead of the smaller w-12/h-12 rounded-full
// treatment this replaces — same visual weight, no CTA button (see task doc's Flagged Decision 3:
// Overview already sits in the same tab strip as the tab this note points to, so a button would
// be redundant in a way it wasn't for the fully separate /portfolio-tracker page).
export function ComingSoonPanel({ body }: { body: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm text-center rounded-2xl border border-[#E2E7F2] bg-white px-8 py-10 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-[#E5F1FF] flex items-center justify-center">
          <Sparkles size={24} className="text-[#007BFF]" />
        </div>
        <h2 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533] mb-3">Coming soon</h2>
        <p className="text-[13px] leading-relaxed text-[#5F6A88]">{body}</p>
      </div>
    </div>
  );
}
