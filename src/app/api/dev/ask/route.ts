import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { getMyZohoTasks, getMyZohoTimeLogs } from "@/lib/zoho";

function todayZohoFormat(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let query: string;
  try {
    const body = await req.json();
    query = body?.query;
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Read zoho_user_id from hub_users
  const { data: profile } = await adminClient
    .from("hub_users")
    .select("zoho_user_id")
    .eq("id", user.id)
    .single();

  const zohoUserId = profile?.zoho_user_id ?? null;
  if (!zohoUserId) {
    return NextResponse.json({ error: "no_zoho_id" }, { status: 400 });
  }

  const portalId = process.env.ZOHO_PORTAL_ID ?? "";
  const todayDateStr = todayZohoFormat();

  // 4. Fetch Zoho data in parallel
  let myTasks: Awaited<ReturnType<typeof getMyZohoTasks>>;
  let timeLogs: Awaited<ReturnType<typeof getMyZohoTimeLogs>>;
  try {
    [myTasks, timeLogs] = await Promise.all([
      getMyZohoTasks(portalId, zohoUserId),
      getMyZohoTimeLogs(portalId, zohoUserId, todayDateStr),
    ]);
  } catch (err) {
    console.error("[dev/ask] Zoho fetch error:", err);
    return NextResponse.json({ error: "zoho_fetch_failed" }, { status: 502 });
  }

  // 5. Serialize context
  const context = `My open tasks:\n${myTasks.map((t) => `- ${t.name} [${t.priority}] due:${t.due_date ?? "none"}`).join("\n")}\n\nTime logs today:\n${timeLogs.map((l) => `- ${l.task?.name ?? "Unknown task"} (${l.project?.name ?? "Unknown project"}): ${l.log_hours}`).join("\n")}`;

  // 6. Call LLM via Vercel AI SDK (DB-driven model, no hard-coded IDs)
  const [model, modelConfig] = await Promise.all([
    getModel("digest"),
    getModelConfig("digest"),
  ]);

  const startMs = Date.now();
  const { text, usage } = await generateText({
    model,
    system:
      "You are a developer assistant. Answer questions about the developer's Zoho tasks and time logs based only on the data provided. Be concise — 1-3 sentences max.",
    prompt: `${context}\n\nQuestion: ${query}`,
  });
  const durationMs = Date.now() - startMs;

  // 7. Log invocation (never skip — project rule)
  await logLLMInvocation({
    layer: "digest",
    modelUsed: modelConfig.model_id,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    durationMs,
    status: "success",
    referenceType: "dev_ask",
  });

  return NextResponse.json({ answer: text });
}
