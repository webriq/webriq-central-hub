import { adminClient } from "@/lib/supabase/admin";

export type KBHit = {
  id: string;
  request_pattern: string;
  classification: string;
  lane: number;
  execution_steps: unknown;
  similarity: number;
};

export type KBSaveInput = {
  request_pattern: string;
  classification: "sanity" | "code" | "both";
  lane: 1 | 2 | 3;
  tools_used: string[];
  execution_steps: unknown;
  outcome: "success" | "failed" | "overridden";
  project_id: string;
};

export type KBCorrectionInput = {
  kb_entry_id: string;
  original_lane: number;
  corrected_lane: number;
  corrected_by: string;
  reason?: string;
};

// Uses pg_trgm text similarity — no OpenAI/embedding API required.
export async function lookupKB(description: string): Promise<KBHit | null> {
  const { data } = await adminClient.rpc("match_kb_by_text", {
    query_text: description,
    match_threshold: 0.3,
    match_count: 1,
  });
  return data?.[0] ?? null;
}

export async function saveToKB(entry: KBSaveInput): Promise<void> {
  await adminClient.from("kb_entries").insert({
    request_pattern: entry.request_pattern,
    classification: entry.classification,
    lane: entry.lane,
    tools_used: entry.tools_used,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execution_steps: entry.execution_steps as any,
    outcome: entry.outcome,
    project_id: entry.project_id,
    last_used_at: new Date().toISOString(),
  });
}

export async function saveKBCorrection(input: KBCorrectionInput): Promise<void> {
  await adminClient.from("kb_corrections").insert(input);
  if (input.corrected_lane !== input.original_lane) {
    await adminClient
      .from("kb_entries")
      .update({ flagged: true })
      .eq("id", input.kb_entry_id);
  }
}
