# Task 031 — GitHub PR Execution Mode (CODE_CHANGE_MINOR)

> **Recommended Model:** sonnet
> **Type:** minor (new integration — GitHub API; no DB migrations needed)

## Goal

Implement the `CODE_CHANGE_MINOR` execution path so that when a plan is approved for a code-change task, the Hub creates a real feature branch, commits Claude-generated code changes, and opens a PR — rather than falling through to the Sanity path (which would fail for non-CMS tasks).

This closes Sprint 5 task #6 (GitHub PR auto-generation) and unblocks AC3 for non-Sanity task types.

---

## Requirements

1. `POST /api/execution` detects `task_type === "CODE_CHANGE_MINOR"` on the classification record and routes to the GitHub path instead of Sanity.
2. GitHub path:
   - Fetches `customer_products.github_repo` (e.g. `"owner/repo"`)
   - Gets the repo's default branch name + its HEAD SHA
   - Extracts file paths from plan steps and fetches their current content + SHA via GitHub Contents API
   - Calls Claude Sonnet (`execution` layer) with context chain + plan steps + current file contents → returns structured output: modified files, PR title, PR body, `what_was_done`, `what_was_skipped`
   - Creates feature branch `hub/{customerId}-{planId[:8]}` off HEAD SHA
   - Commits each modified file (GitHub Contents API PUT per file)
   - Opens a PR → saves URL to `implementation_plans.github_pr_url`
   - Stores pre-action states (`{ path: { sha, content } }`) and post-action states (`{ github_pr_url, branch, pr_number }`) on `execution_records`
3. `POST /api/execution/[id]/revert` detects GitHub execution by checking `post_action_states` for a `github_pr_url` key and calls `closePRAndDeleteBranch()` instead of the Sanity revert path.
4. Auth: single `GITHUB_TOKEN` PAT from env — no per-customer GitHub credentials for Phase 1.
5. No new DB migrations — `github_repo`, `github_pr_url`, `pre_action_states`, `post_action_states` columns already exist.
6. Non-blocking Cliq notification and reply draft generation still fire on COMPLETED (same as Sanity path).

---

## File Changes

| File | Action |
|------|--------|
| `src/lib/github/index.ts` | Replace stub — full implementation |
| `src/app/api/execution/route.ts` | Add task_type branching + GitHub path |
| `src/app/api/execution/[id]/revert/route.ts` | Add GitHub revert path |

---

## Implementation Steps

### Step 1 — `src/lib/github/index.ts` (replace stub entirely)

Implement these functions using the GitHub REST API (`https://api.github.com`) with `Authorization: Bearer ${GITHUB_TOKEN}` header:

**`getDefaultBranch(repo: string): Promise<{ name: string; sha: string }>`**
- `GET /repos/{owner}/{repo}` → return `{ name: data.default_branch, sha }` where sha comes from `GET /repos/{owner}/{repo}/git/ref/heads/{branch}` → `object.sha`

**`getFilesContent(repo: string, paths: string[], branch: string): Promise<Array<{ path: string; content: string; sha: string }>>`**
- For each path: `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`
- Decode base64 content (`Buffer.from(data.content, 'base64').toString('utf-8')`)
- Return `[{ path, content, sha }]`
- Skip files that 404 (new files — no pre-state)

**`createBranch(repo: string, branchName: string, baseSha: string): Promise<void>`**
- `POST /repos/{owner}/{repo}/git/refs` with `{ ref: "refs/heads/{branchName}", sha: baseSha }`

**`commitFiles(repo: string, branch: string, files: Array<{ path: string; content: string; existingSha?: string }>, message: string): Promise<string>`**
- For each file: `PUT /repos/{owner}/{repo}/contents/{path}` with `{ message, content: base64(content), branch, sha: existingSha (if updating) }`
- Return the commit SHA from the last file's response

**`createPR(repo: string, title: string, body: string, branch: string, base: string): Promise<{ url: string; number: number }>`**
- `POST /repos/{owner}/{repo}/pulls` with `{ title, body, head: branch, base }`
- Return `{ url: data.html_url, number: data.number }`

**`closePRAndDeleteBranch(repo: string, prNumber: number, branch: string): Promise<void>`**
- `PATCH /repos/{owner}/{repo}/pulls/{prNumber}` with `{ state: "closed" }`
- `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}`

**`executeGitHubPlan(repo, steps, contextChain, planId, customerId): Promise<GitHubExecutionResult>`**

Define `GitHubExecutionResult`:
```ts
interface GitHubExecutionResult {
  pre_action_states: Record<string, { sha: string; content: string } | null>;
  post_action_states: { github_pr_url: string; branch: string; pr_number: number };
  what_was_done: string;
  what_was_skipped: string | null;
  github_pr_url: string;
}
```

Claude output schema (use `generateObject` with `getModel("execution")`):
```ts
const GitHubMutationSchema = z.object({
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  pr_title: z.string(),
  pr_body: z.string(),
  what_was_done: z.string(),
  what_was_skipped: z.string().nullable(),
});
```

Claude prompt (same pattern as `executeSanityPlan`):
```
You are executing an approved implementation plan by making code changes to a GitHub repository.
The plan steps reference specific file paths. Produce the complete modified file content for each file.
Only modify files you are confident about. List anything you skip and why.

Context:
{contextChain}

Current file contents:
{files.map(f => `### ${f.path}\n${f.content}`).join('\n\n')}

Plan steps:
{steps.map(s => `${s.order}. ${s.title}: ${s.description}`).join('\n')}
```

Flow inside `executeGitHubPlan`:
1. `getDefaultBranch(repo)` → `{ name, sha }`
2. Extract file paths from `steps` text (regex for common extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.css`)
3. `getFilesContent(repo, paths, defaultBranch.name)` → build `pre_action_states`
4. Call Claude with `generateObject` → `GitHubMutationSchema`
5. Log with `logLLMInvocation({ layer: "execution", ... })`
6. `createBranch(repo, branchName, defaultBranch.sha)` — branch name: `hub/${customerId}-${planId.slice(0, 8)}`
7. `commitFiles(repo, branch, plan.files with existingSha from pre_action_states, commitMessage)`
8. `createPR(repo, plan.pr_title, plan.pr_body, branch, defaultBranch.name)` → `{ url, number }`
9. Return `GitHubExecutionResult`

---

### Step 2 — `src/app/api/execution/route.ts`

**Add to the `PostSchema`:** no changes needed — `classificationId` is already included.

**After the plan fetch (line ~38), also fetch `task_type` from the classification record:**
```ts
const { data: classification } = await adminClient
  .from("classification_records")
  .select("task_type")
  .eq("id", classificationId)
  .maybeSingle();

const taskType = classification?.task_type ?? "CONTENT_UPDATE";
```

**Replace the Sanity-only try/catch block** with a branch:

```ts
if (taskType === "CODE_CHANGE_MINOR") {
  // GitHub path
  const { data: product } = await adminClient
    .from("customer_products")
    .select("github_repo")
    .eq("customer_id", customerId)
    .not("github_repo", "is", null)
    .maybeSingle();

  if (!product?.github_repo) {
    return NextResponse.json(
      { error: "No GitHub repo configured for this customer" },
      { status: 422 }
    );
  }

  // ... executeGitHubPlan, update execution_records, update implementation_plans with github_pr_url
} else {
  // existing Sanity path (move current try/catch here, unchanged)
}
```

On GitHub path success:
- `execution_records`: update with `status: "COMPLETED"`, `pre_action_states`, `post_action_states`, `what_was_done`, `what_was_skipped`
- `implementation_plans`: update `status: "COMPLETE"`, `github_pr_url`
- Fire non-blocking Cliq + reply draft (same as Sanity path)

Circuit breaker logic applies to both paths — keep it outside the branch, in the catch block.

---

### Step 3 — `src/app/api/execution/[id]/revert/route.ts`

**Add GitHub revert detection** before the current Sanity revert call.

After fetching the execution record, inspect `post_action_states`:

```ts
const postStates = execution.post_action_states as Record<string, unknown> | null;
const isGitHubExecution = typeof postStates?.github_pr_url === "string";

if (isGitHubExecution) {
  const { data: product } = await adminClient
    .from("customer_products")
    .select("github_repo")
    .eq("customer_id", execution.customer_id)
    .not("github_repo", "is", null)
    .maybeSingle();

  if (!product?.github_repo) {
    return NextResponse.json({ error: "No GitHub repo configured" }, { status: 422 });
  }

  const prNumber = postStates.pr_number as number;
  const branch = postStates.branch as string;

  try {
    await closePRAndDeleteBranch(product.github_repo, prNumber, branch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GitHub revert failed";
    console.error("[revert] GitHub revert failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // update status to REVERTED + reset plan to APPROVED (same pattern as Sanity revert)
  ...
  return NextResponse.json({ ok: true });
}

// else: fall through to existing Sanity revert path
```

Remove the hard `sanity_project_id` check that currently 422s before even reaching the revert — it needs to come after the GitHub branch check, only for Sanity executions.

---

## Code Context

### Current stub (src/lib/github/index.ts)
```ts
export async function createFeatureBranch(_repo: string, _branchName: string): Promise<void> {
  throw new Error("GitHub client not yet implemented — Sprint 5");
}

export async function createPullRequest(_repo: string, _title: string, _branch: string): Promise<string> {
  throw new Error("GitHub PR creation not yet implemented — Sprint 5");
}
```

### Current execution route — Sanity-only try/catch (route.ts:96–149)
```ts
try {
  const contextChain = await buildContextChain(classificationId);
  const result = await executeSanityPlan(product.sanity_project_id, steps, contextChain);

  await adminClient.from("execution_records").update({
    status: "COMPLETED", outcome: "SUCCESS",
    pre_action_states: result.pre_action_states as unknown as Json,
    post_action_states: result.post_action_states as unknown as Json,
    what_was_done: result.what_was_done,
    what_was_skipped: result.what_was_skipped,
    completed_at: new Date().toISOString(),
  }).eq("id", execution.id);

  const [planUpdate, classUpdate] = await Promise.all([
    adminClient.from("implementation_plans").update({ status: "COMPLETE" }).eq("id", planId),
    adminClient.from("classification_records").update({ status: "closed" }).eq("id", classificationId),
  ]);
  if (planUpdate.error) console.error("[execution] implementation_plans status update failed", ...);
  if (classUpdate.error) console.error("[execution] classification_records status update failed", ...);

  sendCliqNotification(`✅ Execution complete for ${customerId}: ${result.what_was_done}`).catch(() => {});
  generateReplyDraft({ classificationId, customerId, executionRecordId: execution.id, whatWasDone: result.what_was_done }).catch(...);

  return NextResponse.json({ ok: true, executionId: execution.id });
} catch (err) { ... circuit breaker ... }
```

### Current revert route — Sanity-hardcoded (revert/route.ts)
```ts
const { data: product } = await adminClient
  .from("customer_products")
  .select("sanity_project_id")
  .eq("customer_id", execution.customer_id)
  .not("sanity_project_id", "is", null)
  .maybeSingle();

if (!product?.sanity_project_id) {
  return NextResponse.json({ error: "No Sanity project configured" }, { status: 422 });
}

try {
  await revertSanityExecution(product.sanity_project_id, execution.pre_action_states);
} catch (err) { ... }
```

### Pattern reference — generateObject + logLLMInvocation (src/lib/sanity/index.ts:63–86)
```ts
const startMs = Date.now();
const { object: plan, usage } = await generateObject({
  model,
  schema: SanityMutationSchema,
  prompt: [...].join("\n"),
});

await logLLMInvocation({
  layer: "execution",
  modelUsed: config.model_id,
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  durationMs: Date.now() - startMs,
}).catch(() => {});
```

---

## Notes for Implementation Agent

- **sonnet reason:** new external API integration (GitHub REST), cross-cuts lib + 2 route files, security-sensitive token handling.
- **GITHUB_TOKEN** is in `env.example` already — read via `process.env.GITHUB_TOKEN`. Throw if unset (same pattern as `SANITY_API_TOKEN` in sanity lib).
- **File path extraction from steps:** plan steps are free-text descriptions. Use a simple regex on each step's `title` + `description` to find likely file paths: `/([\w\-./]+\.(ts|tsx|js|jsx|json|md|css|scss|yaml|yml))/g`. Deduplicate. If no paths found, skip file fetch and let Claude generate new files.
- **Base64 encoding for GitHub API:** `Buffer.from(content).toString('base64')` for upload; `Buffer.from(data.content, 'base64').toString('utf-8')` for download.
- **GitHub Contents API note:** when updating an existing file, the `sha` field is required in the PUT body (it's the blob SHA from the GET response, stored in `pre_action_states`). New files (no pre-state) omit `sha`.
- **Branch naming:** keep it deterministic — `hub/${customerId}-${planId.slice(0, 8)}`. This lets PM find the branch easily in GitHub.
- **Sanity product check in execution route:** the current code fetches `sanity_project_id` before creating the execution record. With branching, move each product check inside its respective path — create the execution record first (before the product check), so failures are logged.
- **Revert detection:** use `post_action_states?.github_pr_url` as the discriminator — it's only set on GitHub executions. Do NOT rely on `task_type` from the classification record (it could change; the post-state is the source of truth for what actually ran).
- **`logLLMInvocation` call:** must fire for the GitHub Claude call, same as Sanity. Layer is `"execution"`.
- **No Vercel preview URL in this task** — that's a separate gap; this task only covers GitHub PR creation.
