import Link from "next/link";
import { GitMerge } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Task 468 — a project that was merged away is archived + read-only: banner linking to the project it
// merged into, and the page content is `inert` (no clicks/focus). Header/tab strip stay usable so the
// archived record can still be browsed. UI-level only: the write APIs are not blocked.
export async function MergedProjectView({ mergedIntoId, variant, children }: { mergedIntoId: string | null | undefined; variant: "legacy" | "v2"; children: React.ReactNode }) {
  if (!mergedIntoId) return <div className="flex-1 min-h-0 flex flex-col">{children}</div>;

  const supabase = await createClient();
  const { data: target } = await supabase.from("projects").select("id,project_id,name").eq("id", mergedIntoId).maybeSingle();
  const href = target ? `/projects/${variant}/${variant === "legacy" ? target.id : target.project_id ?? target.id}` : null;

  return (
    <>
      <div role="status" className="mx-8 mb-3 flex items-center gap-2.5 rounded-[10px] border border-[#E2E7F2] bg-[#F0F7FF] px-3.5 py-2.5 text-[12.5px] text-[#3A4565]">
        <GitMerge size={14} className="shrink-0 text-[#0063D6]" aria-hidden />
        <span>
          This project was merged into{" "}
          {href ? <Link href={href} className="font-semibold text-[#0063D6] hover:underline">{target!.name}</Link> : "another project"}. It&apos;s archived and read-only.
        </span>
      </div>
      <div inert className="flex-1 min-h-0 flex flex-col opacity-90">{children}</div>
    </>
  );
}
