"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUGGEST_THRESHOLD } from "@/lib/projects/merge/similarity";
import type { CandidateProject } from "@/lib/projects/merge/types";
import { AssistantLine } from "./_merge-bits";

function Row({ c, selected, onPick, suggested }: { c: CandidateProject; selected: boolean; onPick: () => void; suggested?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
        selected ? "border-[#071133] bg-[#071133] text-white" : "border-[#E2E7F2] bg-white hover:bg-[#F0F7FF]",
      )}
    >
      <span className="min-w-0">
        <span className={cn("block truncate text-[13px] font-semibold", selected ? "text-white" : "text-[#0B1533]")}>{c.name}</span>
        <span className={cn("block font-mono text-[10.5px]", selected ? "text-[#B9C2E0]" : "text-[#5F6A88]")}>{c.project_id ?? c.id.slice(0, 8)} · {c.customer_id}</span>
      </span>
      {suggested && <span className={cn("shrink-0 font-mono text-[10.5px] font-semibold", selected ? "text-[#B9C2E0]" : "text-[#0063D6]")}>{Math.round(c.score * 100)}% match</span>}
    </button>
  );
}

export function StepTarget({ projectKey, projectName, targetId, onPick }: { projectKey: string; projectName: string; targetId: string | null; onPick: (c: CandidateProject) => void }) {
  const [candidates, setCandidates] = useState<CandidateProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/v2/projects/${encodeURIComponent(projectKey)}/merge/suggest`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!live) return;
        if (ok) setCandidates(j.candidates);
        else setError(j.error ?? "Could not load projects");
      })
      .catch(() => live && setError("Could not load projects"));
    return () => { live = false; };
  }, [projectKey]);

  const { suggested, rest } = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (candidates ?? []).filter((c) => !term || c.name.toLowerCase().includes(term) || (c.project_id ?? "").toLowerCase().includes(term));
    const sug = term ? [] : list.filter((c) => c.score >= SUGGEST_THRESHOLD).slice(0, 3);
    return { suggested: sug, rest: list.filter((c) => !sug.includes(c)).sort((a, b) => a.name.localeCompare(b.name)) };
  }, [candidates, q]);

  return (
    <div className="flex flex-col gap-4">
      <AssistantLine>Which project should <strong className="text-[#0B1533]">{projectName}</strong> be merged into? Everything moves over to the one you pick, and nothing changes until you confirm.</AssistantLine>
      <label className="relative block">
        <span className="sr-only">Search projects</span>
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or project ID" className="w-full rounded-[10px] border border-transparent bg-[#F4F6FB] text-[#0B1533] placeholder:text-[#5F6A88] py-2 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/15" />
      </label>
      {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      {!candidates && !error && <div className="flex flex-col gap-2" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="h-[52px] rounded-[10px] bg-[#EDF0F7] motion-safe:animate-pulse" />)}</div>}
      {candidates && suggested.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Suggested — closest name</h3>
          {suggested.map((c) => <Row key={c.id} c={c} suggested selected={c.id === targetId} onPick={() => onPick(c)} />)}
        </section>
      )}
      {candidates && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{suggested.length ? "All projects" : "Projects"} <span className="font-mono">({rest.length})</span></h3>
          {rest.length === 0 ? <p className="text-[12.5px] text-[#5F6A88]">No projects match “{q}”. Try a project ID or part of the name.</p> : rest.map((c) => <Row key={c.id} c={c} selected={c.id === targetId} onPick={() => onPick(c)} />)}
        </section>
      )}
    </div>
  );
}
