import { createClient, type SanityClient } from "@sanity/client";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { createPreviewSecret } from "@sanity/preview-url-secret/create-secret";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import type { Json } from "@/types/database";

export interface SanityExecutionResult {
  pre_action_states: Record<string, unknown>;
  post_action_states: Record<string, unknown>;
  what_was_done: string;
  what_was_skipped: string | null;
  retries: number;
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  estimated_hours?: number;
}

export class PartialExecutionError extends Error {
  constructor(
    message: string,
    public readonly whatWasDone: string,
    public readonly whatWasSkipped: string | null,
    public readonly attemptedRetries: number
  ) {
    super(message);
    this.name = "PartialExecutionError";
  }
}

const EXECUTION_SYSTEM_PROMPT = `
You are an AI operations assistant managing Sanity CMS for WEBRIQ client projects.

Rules:
- Never call publish_documents automatically — only create and patch as DRAFT
- Never guess a project ID — it is always provided in the task context
- Always use list_workspace_schemas before creating documents to verify field names
- Always use query_documents to check if a document exists before creating it
- Report: what you did, which tools you called, what was skipped
- When in doubt, do less and report what needs human review
`.trim();

function buildMCPPrompt(
  projectId: string,
  dataset: string,
  steps: PlanStep[],
  contextChain: string,
): string {
  return [
    `Sanity Project ID: ${projectId}`,
    `Dataset: ${dataset}`,
    '',
    '=== TASK CONTEXT ===',
    contextChain,
    '',
    '=== PLAN STEPS ===',
    steps.map((s) => `${s.order}. ${s.title}: ${s.description}`).join('\n'),
  ].join('\n');
}

export function getSanityClient(projectId: string, dataset?: string): SanityClient {
  const token = process.env.SANITY_GLOBAL_TOKEN ?? process.env.SANITY_API_TOKEN;
  if (!token) throw new Error("SANITY_GLOBAL_TOKEN is not set");
  return createClient({
    projectId,
    dataset: dataset ?? process.env.SANITY_DATASET ?? "production",
    apiVersion: "2024-01-01",
    token,
    useCdn: false,
  });
}

export async function executeSanityPlan(
  projectId: string,
  steps: PlanStep[],
  contextChain: string,
  dataset?: string,
): Promise<SanityExecutionResult> {
  const token = process.env.SANITY_GLOBAL_TOKEN;
  if (!token) throw new Error('SANITY_GLOBAL_TOKEN is not set');

  const [model, config] = await Promise.all([
    getModel('execution'),
    getModelConfig('execution'),
  ]);

  const sanityMCP = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://mcp.sanity.io',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const startMs = Date.now();
  try {
    const { text, usage } = await generateText({
      model,
      system: EXECUTION_SYSTEM_PROMPT,
      prompt: buildMCPPrompt(
        projectId,
        dataset ?? process.env.SANITY_DATASET ?? 'production',
        steps,
        contextChain,
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: await sanityMCP.tools() as any,
      stopWhen: stepCountIs(10),
    });

    await logLLMInvocation({
      layer: 'execution',
      modelUsed: config.model_id,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      durationMs: Date.now() - startMs,
    } as Parameters<typeof logLLMInvocation>[0]).catch(() => {});

    return {
      pre_action_states: {},
      post_action_states: {},
      what_was_done: text,
      what_was_skipped: null,
      retries: 0,
    };
  } finally {
    await sanityMCP.close();
  }
}

export async function generatePreviewUrl(
  projectId: string,
  dataset?: string | null,
): Promise<string | null> {
  if (!process.env.SANITY_PREVIEW_SECRET) return null;
  const client = getSanityClient(projectId, dataset ?? undefined);
  const { secret } = await createPreviewSecret(
    client,
    'webriq-hub',
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.webriq.com',
  );
  // Full preview URL requires client frontend base URL (via vercel_project_id).
  // Storing the secret token for now; UI can prepend the client domain.
  return secret;
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
       
      tx.createOrReplace({
        ...(doc as Record<string, unknown>),
        _id: docId,
      } as any);
    }
  }

  await tx.commit();
}
