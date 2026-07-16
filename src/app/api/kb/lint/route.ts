import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

export async function POST(req: NextRequest) {
  // Accept cron calls via x-cron-secret or authenticated session
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // List all files in the global KB folder
  const { data: fileList, error: listError } = await adminClient.storage
    .from("kb")
    .list("global", { limit: 100 });

  if (listError) {
    console.error("[kb/lint] list error:", listError.message);
    return NextResponse.json({ error: "Failed to list KB files" }, { status: 500 });
  }

  if (!fileList?.length) {
    return NextResponse.json({ message: "No global KB files to lint." });
  }

  // Download and read each file's text content
  const fileContents: string[] = [];
  for (const f of fileList) {
    const { data } = await adminClient.storage.from("kb").download(`global/${f.name}`);
    if (data) {
      const text = await data.text();
      fileContents.push(`=== ${f.name} ===\n${text}`);
    }
  }

  const combinedContent = fileContents.join("\n\n");

  const model = await getModel("wiki_lint");
  const config = await getModelConfig("wiki_lint");
  const started = Date.now();

  let report: Record<string, unknown> = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let lintStatus: "success" | "error" = "success";

  try {
    const result = await generateText({
      model,
      system:
        "You are a technical documentation auditor. Analyze the provided KB documents and identify: (1) contradictions between documents, (2) orphaned references (mentioned but not defined), (3) stale or outdated information markers. Return ONLY a JSON object with keys: contradictions (array of strings), orphans (array of strings), stale (array of strings), summary (string).",
      messages: [{ role: "user", content: combinedContent }],
    });

    try {
      report = JSON.parse(result.text);
    } catch {
      report = { raw: result.text };
    }

    inputTokens = result.usage?.inputTokens ?? 0;
    outputTokens = result.usage?.outputTokens ?? 0;
  } catch (err) {
    lintStatus = "error";
    report = { error: String(err) };
    console.error("[kb/lint] LLM error:", err);
  }

  // Store the lint report (kb_lint_logs added in migration 017 — cast until types regenerated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (adminClient as any).from("kb_lint_logs").insert({
    report,
    files_audited: fileList.length,
    model_used: config.model_id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });

  if (insertError) {
    console.error("[kb/lint] insert error:", insertError.message);
  }

  await logLLMInvocation({
    layer: "wiki_lint",
    modelUsed: config.model_id,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - started,
    status: lintStatus,
  });

  return NextResponse.json({ ok: true, filesAudited: fileList.length, report });
}
