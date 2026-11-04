"use client";

import { useCallback, useRef, useState } from "react";
import type { CandidateProject, Decisions, MergeEvent, MergePlan, MergeSummary } from "@/lib/projects/merge/types";
import { streamNdjson } from "./_stream-ndjson";
import type { StepProgress } from "./_step-progress";

export type WizardStep = "target" | "scan" | "review" | "confirm" | "merge" | "done";

const api = (key: string, path: string) => `/api/v2/projects/${encodeURIComponent(key)}/merge/${path}`;

async function narrateText(key: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(api(key, "narrate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()).text as string | null) : null;
  } catch {
    return null; // templated copy takes over
  }
}

/** All wizard state + the two streaming calls. Components stay presentational. */
export function useMergeWizard(projectKey: string) {
  const [step, setStep] = useState<WizardStep>("target");
  const [target, setTarget] = useState<CandidateProject | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [progress, setProgress] = useState<StepProgress>({});
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  const [narration, setNarration] = useState<{ review: string | null; summary: string | null }>({ review: null, summary: null });
  const [error, setError] = useState<string | null>(null);
  const mergeId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const scan = useCallback(async () => {
    if (!target) return;
    setStep("scan"); setError(null); setNotes([]); setPlan(null);
    abort.current = new AbortController();
    let got: MergePlan | null = null;
    try {
      await streamNdjson(api(projectKey, "plan"), { targetId: target.id }, (e: MergeEvent) => {
        if (e.type === "note") setNotes((n) => [...n, e.text]);
        if (e.type === "plan") got = e.plan;
        if (e.type === "error") setError(e.message);
      }, abort.current.signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Scan failed");
    }
    if (!got) return;
    const p: MergePlan = got;
    setPlan(p);
    if (p.resumable) { setDecisions(p.resumable.decisions); mergeId.current = p.resumable.mergeId; }
    setStep("review");
    void narrateText(projectKey, { kind: "review", targetId: target.id }).then((t) => setNarration((n) => ({ ...n, review: t })));
  }, [projectKey, target]);

  const run = useCallback(async () => {
    if (!target) return;
    setStep("merge"); setError(null);
    let finished: MergeSummary | null = null;
    try {
      await streamNdjson(api(projectKey, "execute"), { targetId: target.id, decisions, mergeId: mergeId.current }, (e: MergeEvent) => {
        if (e.type === "started") mergeId.current = e.mergeId;
        if (e.type === "step") setProgress((p) => ({ ...p, [e.step]: { done: e.done, total: e.total } }));
        if (e.type === "error") setError(e.message);
        if (e.type === "done") { finished = e.summary; setSummary(e.summary); }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection lost during the merge");
    }
    if (finished) {
      setStep("done");
      void narrateText(projectKey, { kind: "summary", summary: finished }).then((t) => setNarration((n) => ({ ...n, summary: t })));
    } else setError((e) => e ?? "Connection lost during the merge. Resume to continue where it stopped.");
  }, [projectKey, target, decisions]);

  const pickTarget = (c: CandidateProject) => { setTarget(c); setPlan(null); setDecisions({}); mergeId.current = null; };
  const cancelScan = () => { abort.current?.abort(); setStep("target"); };

  return { step, setStep, target, pickTarget, plan, decisions, setDecisions, notes, progress, summary, narration, error, scan, run, cancelScan };
}
