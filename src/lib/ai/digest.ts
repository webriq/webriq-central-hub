import { generateObject } from "ai";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getModelConfig } from "@/lib/ai/model-config";
import { getLanguageModel } from "@/lib/ai/providers";
import { logLLMInvocation } from "@/lib/ai/logger";
import { sendCliqNotification } from "@/lib/zoho";
import type { Database } from "@/types/database";

type DigestLogRow = Database["public"]["Tables"]["digest_logs"]["Row"];

export type DigestType = "pm" | "dev";

const AttentionItemSchema = z.object({
  title: z.string(),
  customer_id: z.string(),
  priority: z.string(),
});

const DigestSchema = z.object({
  summary: z.string(),
  attention_items: z.array(AttentionItemSchema).max(5),
  stalled_items: z.array(z.string()).max(3),
  ready_to_close: z.number().int().min(0),
  highlights: z.string(),
  automation_queue_count: z.number().int().min(0),
  unassigned_count: z.number().int().min(0),
});

export async function generateDigest(type: DigestType): Promise<DigestLogRow | null> {
  const start = Date.now();
  let digestResult: z.infer<typeof DigestSchema> | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelId: string | null = null;

  const today = new Date().toISOString().split("T")[0];
  let context: string;
  // Used as fallback content if LLM fails — populated per type below
  let fallbackAttentionItems: Array<{ title: string; customer_id: string; priority: string }> = [];
  let fallbackActiveCount = 0;
  let automationQueueCount = 0;
  let unassignedCount = 0;

  if (type === "pm") {
    const [
      activeCustomersResult,
      completedOnboardingResult,
      pendingClassificationsResult,
      attentionItemsResult,
      automationQueueResult,
    ] = await Promise.all([
      adminClient
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      adminClient
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed_onboarding"),
      adminClient
        .from("classification_records")
        .select("id, title, customer_id, priority, task_type, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      adminClient
        .from("classification_records")
        .select("id, title, customer_id, priority, created_at")
        .eq("status", "pending")
        .in("priority", ["CRITICAL", "HIGH"])
        .order("created_at", { ascending: false })
        .limit(5),
      adminClient
        .from("classification_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("llm_eligible", "YES"),
    ]);

    const activeCount = activeCustomersResult.count ?? 0;
    const completedOnboardingCount = completedOnboardingResult.count ?? 0;
    const pendingItems = pendingClassificationsResult.data ?? [];
    const attentionItems = attentionItemsResult.data ?? [];
    automationQueueCount = automationQueueResult.count ?? 0;

    fallbackActiveCount = activeCount;
    fallbackAttentionItems = attentionItems.map(a => ({
      title: a.title,
      customer_id: a.customer_id,
      priority: a.priority ?? "NORMAL",
    }));

    context = [
      `=== DAILY OPERATIONAL SNAPSHOT ===`,
      `Date: ${today}`,
      `Digest Type: PM`,
      ``,
      `Active Clients: ${activeCount}`,
      `Clients in Completed Onboarding (need Zoho project): ${completedOnboardingCount}`,
      ``,
      `Automation Queue (LLM-eligible tasks awaiting assessment): ${automationQueueCount}`,
      ``,
      `Pending Classification Records: ${pendingItems.length}`,
      pendingItems.length > 0
        ? pendingItems.map(p => `  - [${p.priority ?? "?"}] ${p.title} (${p.customer_id})`).join("\n")
        : "  (none)",
      ``,
      `High Priority Items Needing Attention: ${attentionItems.length}`,
      attentionItems.length > 0
        ? attentionItems.map(a => `  - [${a.priority}] ${a.title} (${a.customer_id})`).join("\n")
        : "  (none)",
    ].join("\n");
  } else {
    // Dev digest: query assessment + classification data relevant to developers
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const [
      clearAssessmentsResult,
      blockedAssessmentsResult,
      oldestPendingResult,
      recentClearedResult,
      allLLMEligibleResult,
      allAssessedIdsResult,
    ] = await Promise.all([
      // Items assessed CLEAR — dev can start immediately
      adminClient
        .from("requirements_assessments")
        .select("id, classification_id, customer_id, overall_status, created_at, assessment_version")
        .eq("overall_status", "CLEAR")
        .order("created_at", { ascending: false })
        .limit(10),

      // Items BLOCKED or PARTIAL — need PM/customer action before dev can proceed
      adminClient
        .from("requirements_assessments")
        .select("id, classification_id, customer_id, overall_status, created_at")
        .in("overall_status", ["BLOCKED", "PARTIAL"])
        .order("created_at", { ascending: false })
        .limit(5),

      // Oldest LLM-eligible pending records with no assessment yet (overdue signals)
      adminClient
        .from("classification_records")
        .select("id, title, customer_id, priority, created_at")
        .eq("status", "pending")
        .eq("llm_eligible", "YES")
        .order("created_at", { ascending: true })
        .limit(5),

      // Assessments cleared in last 48h (recently ready for dev work)
      adminClient
        .from("requirements_assessments")
        .select("id, classification_id, customer_id, overall_status, created_at")
        .eq("overall_status", "CLEAR")
        .gte("created_at", cutoff48h)
        .order("created_at", { ascending: false })
        .limit(5),

      // All LLM-eligible pending IDs — used for unassigned count
      adminClient
        .from("classification_records")
        .select("id")
        .eq("status", "pending")
        .eq("llm_eligible", "YES"),

      // All assessed classification IDs — subtracted from above to get unassigned
      adminClient
        .from("requirements_assessments")
        .select("classification_id"),
    ]);

    const clearItems = clearAssessmentsResult.data ?? [];
    const blockedItems = blockedAssessmentsResult.data ?? [];
    const oldestPending = oldestPendingResult.data ?? [];
    const recentCleared = recentClearedResult.data ?? [];

    const assessedIds = new Set(
      (allAssessedIdsResult.data ?? []).map(a => a.classification_id)
    );
    unassignedCount = (allLLMEligibleResult.data ?? [])
      .filter(r => !assessedIds.has(r.id)).length;

    fallbackAttentionItems = clearItems.slice(0, 5).map(a => ({
      title: `Assessment ${a.classification_id.slice(0, 8)} — CLEAR`,
      customer_id: a.customer_id,
      priority: "NORMAL",
    }));

    const hoursAgo = (isoDate: string) => {
      const diff = Date.now() - new Date(isoDate).getTime();
      const h = Math.round(diff / (1000 * 60 * 60));
      return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
    };

    context = [
      `=== DEV OPERATIONAL SNAPSHOT ===`,
      `Date: ${today}`,
      `Digest Type: DEV`,
      ``,
      `Unassigned (LLM-eligible, no assessment started): ${unassignedCount} tasks`,
      ``,
      `Ready to Work (CLEAR assessment): ${clearItems.length} items`,
      clearItems.length > 0
        ? clearItems.map(a => `  - [${a.customer_id}] ${a.classification_id.slice(0, 8)} (assessed ${hoursAgo(a.created_at)})`).join("\n")
        : "  (none)",
      ``,
      `Waiting on PM / Customer (BLOCKED or PARTIAL): ${blockedItems.length} items`,
      blockedItems.length > 0
        ? blockedItems.map(a => `  - [${a.customer_id}] ${a.classification_id.slice(0, 8)} — ${a.overall_status} (${hoursAgo(a.created_at)})`).join("\n")
        : "  (none)",
      ``,
      `Overdue — LLM-Eligible Tasks Awaiting Assessment (oldest first): ${oldestPending.length} items`,
      oldestPending.length > 0
        ? oldestPending.map(p => `  - [${p.priority ?? "?"}] ${p.title} (${p.customer_id}) — ${hoursAgo(p.created_at)}`).join("\n")
        : "  (none)",
      ``,
      `Recently Cleared (last 48h): ${recentCleared.length} items`,
      recentCleared.length > 0
        ? recentCleared.map(a => `  - [${a.customer_id}] ${a.classification_id.slice(0, 8)} (${hoursAgo(a.created_at)})`).join("\n")
        : "  (none)",
    ].join("\n");
  }

  try {
    const config = await getModelConfig("digest");
    const model = getLanguageModel((config.provider ?? "anthropic") as "anthropic" | "openai", config.model_id);
    modelId = config.model_id;

    const pmPrompt = `You are an operational assistant for a web development agency PM.

Generate a concise daily digest based on the following operational snapshot.

${context}

Guidelines:
- summary: 2–3 sentence situational overview, actionable and direct
- attention_items: list up to 5 highest-priority items needing PM action today
- stalled_items: names or titles of tasks that appear stuck or overdue (if any)
- ready_to_close: count of items that appear complete and ready to close
- highlights: one positive signal (e.g. "3 projects are on track this week")
- automation_queue_count: exact count of LLM-eligible tasks in the assessment queue (from snapshot)
- unassigned_count: set to 0 (not applicable for PM digest)

Be specific, not generic. Reference actual client IDs and task names.`;

    const devPrompt = `You are an operational assistant for a web development agency developer.

Generate a concise daily dev digest based on the following operational snapshot.

${context}

Guidelines:
- summary: 2–3 sentence dev-focused overview — what can be started today, what is waiting on PM or customer
- attention_items: up to 5 items a developer should prioritize or flag to the PM today
- stalled_items: classification IDs or task titles that have been pending the longest without an assessment
- ready_to_close: count of CLEAR items ready to be picked up immediately
- highlights: one positive signal (e.g. "4 tasks cleared assessment this week and are ready to start")
- unassigned_count: exact count of LLM-eligible tasks with no assessment started yet (from snapshot)
- automation_queue_count: set to 0 (not applicable for dev digest)

Be specific. Reference actual customer IDs, classification IDs, and time elapsed where relevant.`;

    const { object, usage } = await generateObject({
      model,
      schema: DigestSchema,
      prompt: type === "dev" ? devPrompt : pmPrompt,
    });

    digestResult = object;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;

    await logLLMInvocation({
      layer: "digest",
      modelUsed: config.model_id,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "success",
    });
  } catch (err) {
    console.error("[digest] LLM call failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      layer: "digest",
      modelUsed: modelId ?? "unknown",
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  const { data: record, error: insertError } = await adminClient
    .from("digest_logs")
    .insert({
      digest_type: type,
      content: digestResult ?? {
        summary: "Digest generation failed — check LLM invocation logs.",
        attention_items: fallbackAttentionItems,
        stalled_items: [],
        ready_to_close: 0,
        highlights: fallbackActiveCount > 0 ? `${fallbackActiveCount} active clients.` : "No data available.",
        automation_queue_count: automationQueueCount,
        unassigned_count: unassignedCount,
      },
      model_used: modelId,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      digest_date: today,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("[digest] DB insert failed:", insertError?.message);
    return null;
  }

  if (digestResult) {
    const message = type === "dev"
      ? `🛠️ Dev Daily Digest for ${today} is ready — open the Hub to review what's cleared and ready to work.`
      : `📋 PM Daily Digest for ${today} is ready — open the Hub to view your situational overview.`;
    await sendCliqNotification(message, type);
  }

  return record;
}
