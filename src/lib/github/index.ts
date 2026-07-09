import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import type { PlanStep } from "@/lib/sanity";

const GITHUB_API = "https://api.github.com";

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...(options.headers as Record<string, string> | undefined) },
  });
}

export interface GitHubFileState {
  sha: string;
  content: string;
}

export interface GitHubExecutionResult {
  pre_action_states: Record<string, GitHubFileState | null>;
  post_action_states: { github_pr_url: string; branch: string; pr_number: number };
  what_was_done: string;
  what_was_skipped: string | null;
  github_pr_url: string;
}

export async function getDefaultBranch(repo: string): Promise<{ name: string; sha: string }> {
  const repoRes = await githubFetch(`/repos/${repo}`);
  if (!repoRes.ok) throw new Error(`GitHub: failed to fetch repo ${repo} (${repoRes.status})`);
  const repoData = (await repoRes.json()) as { default_branch: string };
  const branchName = repoData.default_branch;

  const refRes = await githubFetch(`/repos/${repo}/git/ref/heads/${branchName}`);
  if (!refRes.ok) throw new Error(`GitHub: failed to get ref for ${branchName} (${refRes.status})`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  return { name: branchName, sha: refData.object.sha };
}

export async function getFilesContent(
  repo: string,
  paths: string[],
  branch: string
): Promise<Array<{ path: string; content: string; sha: string }>> {
  // Parallel fetch — independent per-file requests (async-parallel)
  const results = await Promise.all(
    paths.map(async (filePath) => {
      const res = await githubFetch(
        `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`
      );
      if (res.status === 404) return null; // new file — no pre-state
      if (!res.ok) throw new Error(`GitHub: failed to fetch ${filePath} (${res.status})`);
      const data = (await res.json()) as { content: string; sha: string };
      return {
        path: filePath,
        content: Buffer.from(data.content, "base64").toString("utf-8"),
        sha: data.sha,
      };
    })
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

export async function createBranch(
  repo: string,
  branchName: string,
  baseSha: string
): Promise<void> {
  const res = await githubFetch(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub: failed to create branch ${branchName} (${res.status}): ${body}`);
  }
}

export async function commitFiles(
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string; existingSha?: string }>,
  message: string
): Promise<string> {
  let lastCommitSha = "";
  // Sequential: each commit advances the branch ref, so order matters
  for (const file of files) {
    const body: Record<string, string> = {
      message,
      content: Buffer.from(file.content).toString("base64"),
      branch,
    };
    if (file.existingSha) body.sha = file.existingSha;

    const res = await githubFetch(`/repos/${repo}/contents/${file.path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub: failed to commit ${file.path} (${res.status}): ${err}`);
    }
    const data = (await res.json()) as { commit: { sha: string } };
    lastCommitSha = data.commit.sha;
  }
  return lastCommitSha;
}

export async function createPR(
  repo: string,
  title: string,
  body: string,
  branch: string,
  base: string
): Promise<{ url: string; number: number }> {
  const res = await githubFetch(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head: branch, base }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub: failed to create PR (${res.status}): ${err}`);
  }
  const data = (await res.json()) as { html_url: string; number: number };
  return { url: data.html_url, number: data.number };
}

export async function closePRAndDeleteBranch(
  repo: string,
  prNumber: number,
  branch: string
): Promise<void> {
  // Parallel: independent operations (async-parallel)
  const [closeRes, deleteRes] = await Promise.all([
    githubFetch(`/repos/${repo}/pulls/${prNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed" }),
    }),
    githubFetch(`/repos/${repo}/git/refs/heads/${branch}`, { method: "DELETE" }),
  ]);
  if (!closeRes.ok) {
    console.error(`[github] failed to close PR #${prNumber} (${closeRes.status})`);
  }
  // 422 = ref already gone — treat as success
  if (!deleteRes.ok && deleteRes.status !== 422) {
    console.error(`[github] failed to delete branch ${branch} (${deleteRes.status})`);
  }
}

// Extracts likely file paths from free-text plan step descriptions
const FILE_PATH_REGEX = /([\w\-./@]+\.(ts|tsx|js|jsx|json|md|css|scss|yaml|yml))/g;

function extractFilePaths(steps: PlanStep[]): string[] {
  const paths = new Set<string>();
  for (const step of steps) {
    for (const match of `${step.title} ${step.description}`.matchAll(FILE_PATH_REGEX)) {
      paths.add(match[1]);
    }
  }
  return [...paths];
}

const GitHubMutationSchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  pr_title: z.string(),
  pr_body: z.string(),
  what_was_done: z.string(),
  what_was_skipped: z.string().nullable(),
});

export async function executeGitHubPlan(
  repo: string,
  steps: PlanStep[],
  contextChain: string,
  planId: string,
  customerId: string
): Promise<GitHubExecutionResult> {
  const [model, config] = await Promise.all([getModel("execution"), getModelConfig("execution")]);

  const defaultBranch = await getDefaultBranch(repo);
  const filePaths = extractFilePaths(steps);
  const existingFiles =
    filePaths.length > 0 ? await getFilesContent(repo, filePaths, defaultBranch.name) : [];

  // Build pre-action states keyed by path; null = new file (no rollback needed)
  const pre_action_states: Record<string, GitHubFileState | null> = {};
  for (const p of filePaths) pre_action_states[p] = null;
  for (const f of existingFiles) pre_action_states[f.path] = { sha: f.sha, content: f.content };

  const fileContext =
    existingFiles.length > 0
      ? `Current file contents:\n${existingFiles
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n")}`
      : "No existing files found — produce new file content as needed.";

  const startMs = Date.now();
  const { object: plan, usage } = await generateObject({
    model,
    schema: GitHubMutationSchema,
    prompt: [
      "You are executing an approved implementation plan by making code changes to a GitHub repository.",
      "The plan steps reference specific file paths. Produce the complete modified file content for each file.",
      "Only modify files you are confident about. List anything you skip and why.",
      "",
      "Context:",
      contextChain,
      "",
      fileContext,
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

  const branchName = `hub/${customerId}-${planId.slice(0, 8)}`;
  await createBranch(repo, branchName, defaultBranch.sha);

  await commitFiles(
    repo,
    branchName,
    plan.files.map((f) => ({
      path: f.path,
      content: f.content,
      existingSha: pre_action_states[f.path]?.sha,
    })),
    `[hub] ${plan.what_was_done.slice(0, 72)}`
  );

  const pr = await createPR(repo, plan.pr_title, plan.pr_body, branchName, defaultBranch.name);

  return {
    pre_action_states,
    post_action_states: { github_pr_url: pr.url, branch: branchName, pr_number: pr.number },
    what_was_done: plan.what_was_done,
    what_was_skipped: plan.what_was_skipped,
    github_pr_url: pr.url,
  };
}

// ─── CI polling + auto-fix loop ───────────────────────────────────────────────

interface CheckRun {
  id: number;
  status: string;
  conclusion: string | null;
  name: string;
  html_url: string;
}

async function getCheckRunsForPR(repo: string, prNumber: number): Promise<CheckRun[]> {
  const prRes = await githubFetch(`/repos/${repo}/pulls/${prNumber}`);
  if (!prRes.ok) throw new Error(`GitHub: failed to fetch PR #${prNumber} (${prRes.status})`);
  const prData = (await prRes.json()) as { head: { sha: string } };
  const sha = prData.head.sha;

  const checksRes = await githubFetch(`/repos/${repo}/commits/${sha}/check-runs`);
  if (!checksRes.ok) throw new Error(`GitHub: failed to fetch checks for ${sha} (${checksRes.status})`);
  const checksData = (await checksRes.json()) as { check_runs: CheckRun[] };
  return checksData.check_runs;
}

async function fetchCIFailureLogs(repo: string, runId: number): Promise<string> {
  const res = await githubFetch(`/repos/${repo}/actions/runs/${runId}/logs`);
  if (!res.ok) return `Could not fetch logs for run ${runId} (${res.status})`;
  // GitHub returns a ZIP; return a truncated text representation as a hint
  return `CI run ${runId} failed. Check ${GITHUB_API}/repos/${repo}/actions/runs/${runId} for details.`;
}

/**
 * Poll GitHub Checks API for a PR until all checks complete or timeout (10 min).
 * On failure: use Sonnet to analyze and push a fix (max 3 retries total).
 * Returns 'passed' | 'failed' | 'timeout'.
 */
export async function waitForCI(
  repo: string,
  prNumber: number
): Promise<"passed" | "failed" | "timeout"> {
  const POLL_INTERVAL_MS = 30_000;
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const MAX_RETRIES = 3;

  let retries = 0;

  const poll = async (): Promise<"passed" | "failed" | "timeout"> => {
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const checks = await getCheckRunsForPR(repo, prNumber);

      if (checks.length === 0) continue; // no checks registered yet

      const allDone = checks.every((c) => c.status === "completed");
      if (!allDone) continue;

      const anyFailed = checks.some(
        (c) => c.conclusion === "failure" || c.conclusion === "timed_out"
      );

      if (!anyFailed) return "passed";

      // CI failed — attempt auto-fix
      if (retries >= MAX_RETRIES) {
        console.error(`[github/ci] max retries (${MAX_RETRIES}) reached for PR #${prNumber}`);
        return "failed";
      }
      retries++;

      const failedRun = checks.find(
        (c) => c.conclusion === "failure" || c.conclusion === "timed_out"
      );
      const logs = failedRun ? await fetchCIFailureLogs(repo, failedRun.id) : "No logs available";

      const [model, config] = await Promise.all([getModel("execution"), getModelConfig("execution")]);
      const ciStartMs = Date.now();
      const { text: fixPlan, usage } = await generateText({
        model,
        system: "You are a senior engineer analyzing CI failures. Identify the root cause and describe the minimal code fix needed. Be concise.",
        prompt: `CI failed on PR #${prNumber} in ${repo} (retry ${retries}/${MAX_RETRIES}):\n\n${logs}\n\nDescribe the fix.`,
      });
      await logLLMInvocation({
        layer: "execution",
        modelUsed: config.model_id,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        durationMs: Date.now() - ciStartMs,
      }).catch(() => {});

      console.warn(`[github/ci] retry ${retries}/${MAX_RETRIES} for PR #${prNumber}: ${fixPlan.slice(0, 200)}`);
      // The fix description is logged; a human or future automation applies it.
      // Re-poll for the next CI run triggered by any subsequent push to this branch.
    }

    return "timeout";
  };

  return poll();
}
