import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateObject } from "ai";
import { z } from "zod";
import { getModelConfig } from "@/lib/ai/model-config";
import { getLanguageModel } from "@/lib/ai/providers";

const ClassificationSchema = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
  confidence_score: z.number().min(0).max(100),
  reasoning: z.string(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await adminClient
    .from("hub_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!["pm", "admin"].includes(caller?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { title: string; description?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description } = body;
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const config = await getModelConfig("classification");
    const model = getLanguageModel(
      (config.provider ?? "anthropic") as "anthropic" | "openai",
      config.model_id
    );

    const { object } = await generateObject({
      model,
      schema: ClassificationSchema,
      prompt: `You are a task classification assistant for a web development agency.

Classify the following task or support ticket:

Title: ${title}
${description ? `Description: ${description}` : ""}

Guidelines:
- task_type: choose the most specific type (CONTENT_UPDATE, SETTINGS_CHANGE, BLOG_PUBLISH, ASSET_UPLOAD, CODE_CHANGE_MINOR, SEO_UPDATE, BUG_REPORT, FEATURE_REQUEST, STRATEGIC, OTHER)
- priority: CRITICAL (blocking production), HIGH (urgent, same-day), NORMAL (standard SLA), LOW (nice to have)
- llm_eligible: YES = task is clearly understood AND confidence ≥ 60; NO = needs human judgment or confidence < 60; HUMAN_ONLY = never automate (billing, credentials, sensitive client decisions). When in doubt, use NO.
- confidence_score: 0–100 representing your certainty in this classification
- reasoning: one concise sentence explaining your classification choice`,
      abortSignal: req.signal,
    });

    return NextResponse.json(object);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "Cancelled" }, { status: 499 });
    }
    console.error("[classification/classify] LLM call failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
