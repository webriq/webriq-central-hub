---
name: sanity-mcp-decision
description: Sanity integration uses experimental_createMCPClient (mcp.sanity.io Streamable HTTP), not @sanity/client REST for execution
metadata:
  type: project
---

Sanity execution uses `experimental_createMCPClient` with `type: 'http'` transport to `mcp.sanity.io`, authenticated via `SANITY_GLOBAL_TOKEN` (robot account bearer token). Decided 2026-06-19.

**Why:** The plan doc (`_docs/plan-v2/webriq-automation-pipeline.md`) specifies this architecture. The existing `@sanity/client` REST-based `executeSanityPlan()` is being replaced by MCP in Task 065.

**How to apply:**
- For any Sanity execution code: use `experimental_createMCPClient` from `ai`, transport `type: 'http'`, URL `https://mcp.sanity.io`, bearer `SANITY_GLOBAL_TOKEN`
- Always close the MCP client in a `finally` block (`sanityMCP.close()`)
- `@sanity/client` stays for preview URL generation (`createPreviewSecret`) and revert operations only
- `SANITY_GLOBAL_TOKEN` = robot account (`automation@webriq.com`) added as Editor to all client Sanity projects
- Do NOT use `type: 'sse'` — Sanity uses Streamable HTTP; SSE returns 405
- `SANITY_API_TOKEN` (per-project) remains as fallback for `getSanityClient()` during rollout

Related: [[project_pipeline_tasks]]
