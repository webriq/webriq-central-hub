"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MERGE_STEPS, type MergeStep } from "@/lib/projects/merge/types";
import { AssistantLine, ProgressBar } from "./_merge-bits";

export type StepProgress = Partial<Record<MergeStep, { done: number; total: number }>>;

/** Overall = Σdone/Σtotal over steps the server has reported so far (steps not yet reported count as one unit each). */
export function overall(p: StepProgress) {
  let done = 0, total = 0;
  for (const s of MERGE_STEPS) {
    const v = p[s.key];
    if (v) { done += v.done; total += Math.max(v.total, 1); } else total += 1;
  }
  return { done, total };
}

export function StepProgressView({ progress, error, finished }: { progress: StepProgress; error: string | null; finished: boolean }) {
  const { done, total } = overall(progress);
  const current = MERGE_STEPS.find((s) => { const v = progress[s.key]; return v && v.done < v.total; });
  return (
    <div className="flex flex-col gap-5">
      <AssistantLine pulse={!error && !finished}>
        {error ? "The merge stopped. Nothing was lost — what already moved is consistent, and you can resume." : finished ? "All done." : `Working through ${current?.label.toLowerCase() ?? "your project"}…`}
      </AssistantLine>
      <ProgressBar done={finished ? total : done} total={total} label="Merge progress" />
      <ol className="overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white">
        {MERGE_STEPS.map((s) => {
          const v = progress[s.key];
          const complete = !!v && v.done >= v.total;
          const active = !!v && !complete && !error;
          return (
            <li key={s.key} className="flex items-center justify-between gap-3 border-t border-[#EDF0F7] px-4 py-2.5 first:border-t-0">
              <span className={cn("flex items-center gap-2.5 text-[13px]", complete ? "text-[#0B1533]" : "text-[#5F6A88]")}>
                {complete ? <Check size={14} className="text-[#177E48]" aria-hidden /> : active ? <Loader2 size={14} className="text-[#007BFF] motion-safe:animate-spin" aria-hidden /> : <Circle size={14} aria-hidden />}
                {s.label}
              </span>
              <span className="font-mono text-[11px] text-[#5F6A88]">{v ? `${v.done} / ${v.total}` : "waiting"}</span>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="rounded-[10px] bg-[#FDE8E6] px-3 py-2.5 text-[12.5px] text-[#C0392B]">{error}</p>}
    </div>
  );
}
