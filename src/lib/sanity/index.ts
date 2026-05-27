import { createClient, type SanityClient } from "@sanity/client";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import type { Json } from "@/types/database";

export interface SanityExecutionResult {
  pre_action_states: Record<string, unknown>;
  post_action_states: Record<string, unknown>;
  what_was_done: string;
  what_was_skipped: string | null;
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  estimated_hours?: number;
}

const SanityMutationSchema = z.object({
  mutations: z.array(
    z.object({
      action: z.enum(["create", "patch", "delete", "publish"]),
      documentId: z.string(),
      document: z.object({ _type: z.string() }).catchall(z.unknown()).optional(),
      patch: z
        .object({
          set: z.record(z.string(), z.unknown()).optional(),
          unset: z.array(z.string()).optional(),
        })
        .optional(),
    })
  ),
  what_was_done: z.string(),
  what_was_skipped: z.string().nullable(),
});

export function getSanityClient(projectId: string): SanityClient {
  const token = process.env.SANITY_API_TOKEN;
  if (!token) throw new Error("SANITY_API_TOKEN is not set");
  return createClient({
    projectId,
    dataset: process.env.SANITY_DATASET ?? "production",
    apiVersion: "2024-01-01",
    token,
    useCdn: false,
  });
}

export async function executeSanityPlan(
  projectId: string,
  steps: PlanStep[],
  contextChain: string
): Promise<SanityExecutionResult> {
  const client = getSanityClient(projectId);
  const [model, config] = await Promise.all([
    getModel("execution"),
    getModelConfig("execution"),
  ]);

  const startMs = Date.now();
  const { object: plan, usage } = await generateObject({
    model,
    schema: SanityMutationSchema,
    prompt: [
      "You are executing an approved implementation plan against a Sanity CMS project.",
      "Translate the following plan steps into specific Sanity API mutations.",
      "Only produce mutations you are confident about. List anything you skip.",
      "",
      "Context:",
      contextChain,
      "",
      "Plan steps:",
      steps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join("\n"),
    ].join("\n"),
  });

  await logLLMInvocation({
    layer: "execution",
    modelUsed: config.model_id,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    durationMs: Date.now() - startMs,
  }).catch(() => {});

  // Capture pre-states for all documents we will touch (batched fetch, deduplicated)
  const pre_action_states: Record<string, unknown> = {};
  const allDocIds = [...new Set(plan.mutations.map((m) => m.documentId))];
  const preDocs = await client.getDocuments(allDocIds);
  allDocIds.forEach((id, i) => {
    pre_action_states[id] = preDocs[i] ?? null;
  });

  // Execute content mutations in a single transaction (skip if nothing to apply)
  const contentMutations = plan.mutations.filter((m) => m.action !== "publish");
  if (contentMutations.length > 0) {
    const tx = client.transaction();
    for (const m of contentMutations) {
      if (m.action === "create" && m.document) {
        // document is guaranteed to have _type from Zod schema validation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx.create({ _id: m.documentId, ...m.document } as any);
      } else if (m.action === "patch" && m.patch) {
        tx.patch(m.documentId, {
          set: m.patch.set ?? {},
          unset: m.patch.unset ?? [],
        });
      } else if (m.action === "delete") {
        tx.delete(m.documentId);
      }
    }
    await tx.commit();
  }

  // Publish mutations run separately (they operate on draft → published pairs)
  // `publish` is a valid Sanity mutation but not reflected in @sanity/client's Mutation type — cast is safe
  for (const m of plan.mutations.filter((m) => m.action === "publish")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.mutate([{ publish: { id: m.documentId } }] as any);
  }

  // Capture post-states
  const post_action_states: Record<string, unknown> = {};
  for (const m of plan.mutations) {
    const doc = await client.getDocument(m.documentId).catch(() => null);
    post_action_states[m.documentId] = doc ?? null;
  }

  return {
    pre_action_states,
    post_action_states,
    what_was_done: plan.what_was_done,
    what_was_skipped: plan.what_was_skipped,
  };
}

export async function revertSanityExecution(
  projectId: string,
  preActionStates: Json
): Promise<void> {
  const client = getSanityClient(projectId);
  const states = preActionStates as Record<string, unknown>;
  const tx = client.transaction();

  for (const [docId, doc] of Object.entries(states)) {
    if (doc === null) {
      tx.delete(docId);
    } else {
      // doc came from client.getDocument() so it always carries _id and _type — cast is safe
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx.createOrReplace({
        ...(doc as Record<string, unknown>),
        _id: docId,
      } as any);
    }
  }

  await tx.commit();
}
