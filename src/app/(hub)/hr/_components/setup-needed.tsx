import { DatabaseZap } from "lucide-react";
import { EmptyState } from "./empty-state";
import { PageShell } from "./page-shell";

/** Shown instead of crashing when the hr schema isn't reachable or migration 164 isn't applied. */
export function SetupNeeded({ canFix, detail }: { canFix: boolean; detail: string }) {
  return (
    <PageShell title="HR">
      <div className="overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
        <EmptyState
          icon={DatabaseZap}
          title="HR isn't set up yet"
          hint={
            canFix
              ? "In Supabase, add `hr` to Settings → Data API → Exposed schemas, then apply migration 164 (supabase db push). Reload this page afterwards."
              : "An admin is finishing the HR setup. Check back soon."
          }
        />
        {canFix && <p className="border-t border-[#EDF0F7] px-6 py-3 text-center font-mono text-[11px] text-[#5F6A88]">{detail}</p>}
      </div>
    </PageShell>
  );
}
