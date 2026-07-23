# 181: Remote MCP Server — OAuth 2.1/PKCE Scaffold + Two Read-Only Tools

**Created:** 2026-07-23
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Scaffold a remote MCP (Model Context Protocol) server as a new route inside the existing Next.js app — not a separate service — so Claude and other MCP clients can connect to the Hub as a custom connector. Auth is a self-hosted OAuth 2.1 + PKCE authorization server backed by our existing Supabase Auth users (no new user table). This session delivers scaffold + auth + exactly two **read-only** tools so the full handshake can be verified end-to-end before any write capability is added.

This is genuinely new infrastructure, not an extension of the existing "Sign in with Zoho" flow: that flow makes *our app* an OAuth **client** of Zoho. MCP requires the opposite — *our app* becomes an OAuth **authorization server** that issues tokens to external MCP clients. The two share only the underlying identity store (`auth.users` via Supabase).

## Corrections to the Original Request (confirmed with user)

- **Package manager: pnpm, not yarn.** `pnpm-lock.yaml` exists, no `yarn.lock`, and CLAUDE.md explicitly forbids `yarn add`/`npm install` in this repo (prior session feedback already corrected this once — see project memory). All install steps below use `pnpm add`.
- **RBAC backing: `profiles` table (v2), not `hub_users` (v1).** Confirmed with user via AskUserQuestion. `profiles.role` is `admin | hr | pm | developer | client | super_admin | marketing` (per `src/types/database.ts` — wider than the `admin|hr|pm|developer|client` CLAUDE.md documents; treat the DB type as source of truth). Consent-screen login reuses the v2 session (`/v2/auth/login`), and role checks reuse the `get_my_role()` / `get_my_customer_id()` security-definer pattern already established for v2 RLS policies (migration 026).
- **`work_items` table does not exist.** Confirmed with user: `list_open_tasks` reads from the real `tasks` table (migration 025) filtered on `is_completed = false` (there is no `type` column on `tasks` to filter on — the table already implies task semantics). `tickets` is a separate table, not used here.
- **Package name:** the user's requirement named `@vercel/mcp-adapter`. That package has moved — the current Vercel-maintained package is **`mcp-handler`** (GitHub: `vercel/mcp-handler`, same `createMcpHandler`/`withMcpAuth` API). Verify the current npm name at install time; use whichever resolves (`mcp-handler` as of this writing).

## Requirements

- [ ] Add `mcp-handler` (or current name of the Vercel MCP adapter) and `@modelcontextprotocol/sdk` via `pnpm add`.
- [ ] `src/app/api/mcp/route.ts` — Streamable HTTP MCP server via `createMcpHandler`, wrapped in `withMcpAuth`.
- [ ] Self-hosted OAuth 2.1 Authorization Server (PKCE, S256 only — plain is forbidden by spec):
  - `GET/POST /api/oauth/register` — Dynamic Client Registration (RFC 7591), `token_endpoint_auth_method: "none"` (public/PKCE clients, no client secret).
  - `GET /oauth/authorize` + consent approval action — human-in-the-loop consent screen.
  - `POST /api/oauth/token` — `authorization_code` and `refresh_token` grants.
  - `GET /.well-known/oauth-authorization-server` — AS metadata.
  - `GET /.well-known/oauth-protected-resource` — RS metadata (via `mcp-handler`'s `protectedResourceHandler`).
- [ ] Consent screen at `/oauth/authorize` styled with the existing `AuthSplitShell` (navy `#071133`/`#07111f`, blue `#007BFF`, orange `#FB914E` CTA, Inter/Space Grotesk) — plain-language scope descriptions, Approve/Deny.
- [ ] Scopes: `projects:read`, `tasks:read`, `tasks:write` — defined in a role→scope grant map (`src/lib/mcp/scopes.ts`) tied to `profiles.role`, with Postgres RLS as the actual row-level enforcement (defense in depth, not just string matching). `tasks:write` is defined in the catalog for forward-compatibility but no tool requests it this session.
- [ ] Two read-only tools, both RLS-scoped to the authenticated user, never `adminClient`:
  - `get_project_status(customer_id)` — `customers` + `projects` (by `customer_id`).
  - `list_open_tasks(project_id)` — `tasks` where `project_id = $1 AND is_completed = false`.
- [ ] `invokeMCPTool()` in `src/lib/mcp/logger.ts`, mirroring `logLLMInvocation()` — logs every tool call (who, which tool, scopes, status, duration) to a new `mcp_tool_invocation_logs` table.
- [ ] Manual testing steps documented for adding the server as a custom connector (Settings → Connectors → Add custom connector).

## Out of Scope / Must-Not-Change

- No write tools (`tasks:write` scope stays defined-but-unused).
- No directory submission prep, no org-level Vercel/Organization connector rollout.
- No new MCP-specific user table — identity stays `auth.users` + `profiles`.
- Do not touch `hub_users` / v1 role-access (`src/lib/auth/role-access.ts`, `require-role.ts`) — this is v2/`profiles`-only.
- **Do not apply the Supabase migration below without explicit user approval** — this is an irreversible schema change per the user's standing instruction. Propose it, get a yes, then migrate.

## Proposed Schema (requires approval before migration is applied)

New tables, additive only, no changes to existing tables:

```sql
-- OAuth clients registered via Dynamic Client Registration (RFC 7591)
create table mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,           -- public identifier, returned to the MCP client
  client_name text not null,
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now()
);

-- Short-lived authorization codes (PKCE)
create table mcp_oauth_authorization_codes (
  code text primary key,                    -- high-entropy random, not a DB serial
  client_id text not null references mcp_oauth_clients(client_id),
  user_id uuid not null references auth.users(id),
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scopes text[] not null,
  supabase_refresh_token text not null,     -- captured from the user's live browser session at consent time
  expires_at timestamptz not null,          -- short TTL, e.g. 60s
  used_at timestamptz
);

-- Issued access/refresh token pairs — store HASHES only, never plaintext
create table mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,   -- sha256(token), hex
  refresh_token_hash text not null unique,
  client_id text not null references mcp_oauth_clients(client_id),
  user_id uuid not null references auth.users(id),
  scopes text[] not null,
  supabase_refresh_token text not null,     -- re-derives an RLS-scoped Supabase session per tool call
  access_token_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Audit trail, mirrors llm_invocation_logs
create table mcp_tool_invocation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  client_id text,
  tool_name text not null,
  scopes_used text[],
  status text not null default 'success',   -- success | error | unauthorized
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
```

**Security note to flag explicitly when asking for approval:** `supabase_refresh_token` is a live, long-lived credential stored server-side per MCP grant — functionally equivalent to a persistent session. There is no encryption-at-rest helper in this codebase today (no KMS/pgcrypto usage precedent found). Decide at approval time whether to store as plaintext in a service-role-only table (matches current `SUPABASE_SECRET_KEY` trust model) or add `pgcrypto` column encryption — the latter is more work and not currently used anywhere else in the schema. Also flag that there is no revocation UI in this session's scope (a "Connected Apps" settings page is a natural follow-up, not built here).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | `pnpm add mcp-handler @modelcontextprotocol/sdk` |
| `src/app/api/mcp/route.ts` | Create | Streamable HTTP MCP server, `withMcpAuth`-wrapped |
| `src/app/api/oauth/register/route.ts` | Create | Dynamic Client Registration (RFC 7591) |
| `src/app/api/oauth/token/route.ts` | Create | `authorization_code` + `refresh_token` grant handling |
| `src/app/oauth/authorize/page.tsx` | Create | Consent screen (Server Component; redirects to `/v2/auth/login?next=...` if no session) |
| `src/app/oauth/authorize/actions.ts` | Create | `"use server"` — approve/deny consent, mints authorization code |
| `src/app/.well-known/oauth-authorization-server/route.ts` | Create | AS metadata JSON |
| `src/app/.well-known/oauth-protected-resource/route.ts` | Create | RS metadata via `mcp-handler`'s `protectedResourceHandler` |
| `src/lib/mcp/scopes.ts` | Create | Scope catalog + `profiles.role` → allowed-scopes map |
| `src/lib/mcp/pkce.ts` | Create | S256 `code_challenge` verification, token generation/hashing helpers |
| `src/lib/mcp/verify-token.ts` | Create | `verifyToken(req, bearerToken)` passed to `withMcpAuth` |
| `src/lib/mcp/user-scoped-client.ts` | Create | Given a stored `supabase_refresh_token`, refresh it and return a per-request RLS-scoped Supabase client (never `adminClient`) |
| `src/lib/mcp/logger.ts` | Create | `invokeMCPTool()`, mirrors `src/lib/ai/logger.ts` |
| `src/lib/mcp/tools/get-project-status.ts` | Create | Tool implementation |
| `src/lib/mcp/tools/list-open-tasks.ts` | Create | Tool implementation |
| `supabase/migrations/0NN_mcp_oauth_schema.sql` | Create (pending approval) | New tables — see Proposed Schema |
| `env.example` | Modify | Document any new env var if one ends up being needed (current design needs none — issuer URL reuses `NEXT_PUBLIC_APP_URL`) |

## Code Context

### `src/lib/ai/logger.ts` — pattern to mirror for `invokeMCPTool()`

```ts
export async function logLLMInvocation(params: LogParams): Promise<void> {
  const costUsd = computeLLMCost(params.modelUsed, params.inputTokens, params.outputTokens);
  const { error } = await adminClient.from("llm_invocation_logs").insert({ ... });
  if (error) {
    // Non-fatal — log to stderr but never throw
    console.error("[llm-logger] failed to write invocation log:", error.message);
  }
}
```
`invokeMCPTool()` should follow the same non-fatal-on-log-failure shape, writing to `mcp_tool_invocation_logs` via `adminClient` (logging itself is infrastructure — same exception class as the documented `adminClient` writes, not a regular data read).

### `src/lib/supabase/admin.ts` — service-role client (writes only, never for tool data reads)

```ts
export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```

### `src/app/api/auth/callback/route.ts` — existing PKCE exchange (Zoho sign-in, for contrast only)

```ts
const { error } = await supabase.auth.exchangeCodeForSession(code);
```
This is Supabase's *own* OAuth client flow (our app as client of Zoho) — not reusable for the MCP authorization-server role. Do not extend this file; the new OAuth AS is fully separate code, sharing only the identity store.

### `mcp-handler` auth wrapper shape (from `vercel/mcp-handler` docs — verify exact export names against installed version)

```ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const handler = createMcpHandler((server) => {
  server.registerTool("get_project_status", { ... }, async ({ customer_id }, extra) => { ... });
}, {});

const verifyToken = async (req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  // hash bearerToken, look up mcp_oauth_tokens, check expiry/revocation, return scopes/clientId
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: [], // per-tool scope checks happen inside the tool handler via extra.authInfo.scopes
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST };
```

### `src/types/database.ts` — relevant existing tables (real shapes, do not assume otherwise)

- `customers`: `id, customer_id, company_name, contact_name, contact_email, status, ...`
- `projects`: keyed by `customer_id`; `name`, `project_type`, `status`, `external_project_id`, ...
- `tasks`: `id, project_id, ticket_id, title, status (text), is_completed (boolean), priority, ...` — **no `type` column**.
- `profiles`: `id, role ("admin"|"hr"|"pm"|"developer"|"client"|"super_admin"|"marketing"), full_name, customer_id, ...`

### `src/components/auth/auth-split-shell.tsx`

Shared shell (outside `src/app/v2`) already used by both v1 and v2 auth pages. Uses semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`) and a `ThemeToggle` — this is a deliberate exception to the v2 `isDark`-prop convention, scoped to auth-adjacent surfaces. Reuse `<AuthSplitShell title="Authorize {client_name}" subtitle="...">` directly for `/oauth/authorize` rather than building new chrome.

## Implementation Steps

1. **Stop and confirm the schema** in "Proposed Schema" with the user (plaintext vs. encrypted `supabase_refresh_token` storage) before creating or applying the migration.
2. `pnpm add mcp-handler @modelcontextprotocol/sdk` (verify actual current package name first).
3. Write the migration file (per step 1's answer) — do not run it until approved; note this explicitly when presenting the plan for `pnpm build`/`tsc` verification, since the code will not compile against `Database` types until `src/types/database.ts` is regenerated post-migration.
4. Build `src/lib/mcp/pkce.ts` (S256 challenge/verifier, token generation via `crypto.randomBytes`, SHA-256 hashing for storage).
5. Build `src/lib/mcp/scopes.ts` (role → scope grant map).
6. Build the OAuth AS routes: `/oauth/authorize` (page + actions), `/api/oauth/token`, `/api/oauth/register`, both `.well-known` routes.
7. Build `src/lib/mcp/verify-token.ts` and `src/lib/mcp/user-scoped-client.ts`.
8. Build `src/lib/mcp/logger.ts` (`invokeMCPTool`).
9. Build the two tools and wire them into `src/app/api/mcp/route.ts` via `createMcpHandler` + `withMcpAuth`.
10. Update `env.example` only if a new var proves necessary during implementation (current design needs none).

## Acceptance Criteria

- [ ] `pnpm build` and `npx tsc --noEmit` pass.
- [ ] Full OAuth handshake succeeds end-to-end against a real MCP client (see Manual Testing below) with PKCE S256 — a request with plain `code_challenge_method` or a mismatched verifier is rejected.
- [ ] `get_project_status` and `list_open_tasks` both return data scoped to the authenticated user's RLS, not admin-scoped data — verified by testing with a non-admin `profiles.role` account and confirming rows outside that role's access are absent.
- [ ] Every tool call produces one row in `mcp_tool_invocation_logs`, including failed/unauthorized calls.
- [ ] No `adminClient` usage in the tool data-read path (only in `invokeMCPTool`'s own log write, matching the documented exception pattern).
- [ ] Revoking or expiring a token causes subsequent tool calls to fail with 401, not silently fall back to any elevated access.

## Verification

```bash
pnpm install
npx tsc --noEmit
pnpm lint
pnpm build            # do not remove --webpack
pnpm dev
```

### Manual testing (post-implementation)

1. In Claude: **Settings → Connectors → Add custom connector**, enter the deployed `/api/mcp` URL.
2. Confirm the client discovers `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` and redirects to `/v2/oauth/authorize` (moved from the originally planned `/oauth/authorize` — see Implementation Notes → Deviations).
3. Log in via `/v2/auth/login` if no session exists, land back on the consent screen, confirm scopes are shown in plain language, click Approve.
4. Confirm the token exchange completes and the connector shows as connected.
5. Invoke `get_project_status` with a known `customer_id` and `list_open_tasks` with a known `project_id`; confirm results match what that user's role/RLS should see.
6. Check `mcp_tool_invocation_logs` in Supabase for both calls.
7. Revoke the token (manually null/expire the row) and confirm the next tool call fails cleanly.

## Compatibility Touchpoints

- New top-level routes (`/oauth/*`, `/.well-known/*`, `/api/mcp`, `/api/oauth/*`) — confirm none collide with existing `proxy.ts` session-refresh matcher config; `.well-known` and `/oauth` paths likely need to be excluded from the v2 auth-guard matcher the same way `(auth)`/`(public)` already are.
- `next.config.ts` — MCP request/response bodies are small (JSON-RPC), no `proxyClientMaxBodySize` change expected, but confirm during implementation.
- Adds two new runtime dependencies (`mcp-handler`, `@modelcontextprotocol/sdk`) — first third-party MCP tooling in this repo.

## Implementation Notes

### What Changed

- Installed `mcp-handler@1.1.0` and `@modelcontextprotocol/sdk@1.26.0` (pinned to the exact peer-dep version `mcp-handler` requires — `1.29.0` resolves by default but produces an unmet-peer warning). Confirmed via `npm view` that `mcp-handler` (GitHub `vercel/mcp-handler`) is the actively maintained successor; the old `@vercel/mcp-adapter` name is frozen at `0.3.2`.
- Confirmed with user (AskUserQuestion) before writing the migration: `supabase_refresh_token` is stored **plaintext** in the two OAuth tables, in a service-role-only (RLS-enabled, zero-policy) table — matches the existing `SUPABASE_SECRET_KEY`/`adminClient` trust model already used elsewhere in this repo.
- Wrote `supabase/migrations/087_mcp_oauth_schema.sql` (4 new tables: `mcp_oauth_clients`, `mcp_oauth_authorization_codes`, `mcp_oauth_tokens`, `mcp_tool_invocation_logs`) — **created only, not applied**. `src/types/database.ts` was hand-extended with matching Row/Insert/Update types (marked with a comment pointing at the unapplied migration) so the rest of the implementation type-checks now; these must be reconciled against the real generated types the moment the migration is actually run.
- Built the full self-hosted OAuth 2.1/PKCE authorization server: DCR (`/api/oauth/register`), consent screen (`/v2/oauth/authorize` page + `approveConsent`/`denyConsent` Server Actions), token endpoint (`/api/oauth/token`, `authorization_code` + `refresh_token` grants, S256-only PKCE), and both `.well-known` metadata documents.
- Built `src/lib/mcp/user-scoped-client.ts` (`withUserScopedClient`) — refreshes the stored Supabase refresh token per tool call and returns a client authenticated via `Authorization` header (RLS-scoped, never `adminClient` for data reads). Handles Supabase's refresh-token rotation by persisting the newly rotated token back to the `mcp_oauth_tokens` row immediately after every refresh, so the next tool call doesn't get rejected with an already-consumed token.
- Wired `get_project_status` and `list_open_tasks` into `src/app/api/mcp/route.ts` via `createMcpHandler` + `withMcpAuth`, both scope-gated and logged through `invokeMCPTool()`.
- Verified against the real installed package's `.d.ts` (not just the README snippet) that `withMcpAuth`'s `verifyToken` receives `(req, bearerToken)` and returns `AuthInfo | undefined`, and that tool callbacks receive `extra.authInfo` — this matches the task doc's Code Context section, no surprises there.
- `proxy.ts` needed **no changes**: its matcher only gates `/v2/*` (excluding `/v2/auth/*`) for password-change/MFA-pending redirects; `/oauth/*`, `/.well-known/*`, and `/api/mcp` all fall through untouched (the `getClaims()` call on every request is a harmless no-op when there's no session cookie, which is the normal case for MCP bearer-token calls). Compatibility Touchpoint 1 resolved itself — no action needed.
- `next.config.ts` needed no changes — Compatibility Touchpoint 2 confirmed as expected (bodies are small JSON-RPC/OAuth payloads).

### Files Changed

- `package.json`, `pnpm-lock.yaml` — added `mcp-handler`, `@modelcontextprotocol/sdk`
- `src/lib/mcp/pkce.ts` — S256 PKCE verification, token generation, SHA-256 hashing
- `src/lib/mcp/scopes.ts` — scope catalog + `profiles.role` → scope grant map
- `src/lib/mcp/user-scoped-client.ts` — RLS-scoped client derivation + refresh-token rotation persistence
- `src/lib/mcp/verify-token.ts` — `verifyMcpToken` for `withMcpAuth`
- `src/lib/mcp/logger.ts` — `invokeMCPTool()`, mirrors `logLLMInvocation()`
- `src/lib/mcp/run-tool.ts` — shared scope-check + RLS-scope + audit-log wrapper (not in the original file list — extracted so both tools share identical enforcement/logging instead of duplicating it; see Deviations)
- `src/lib/mcp/tools/get-project-status.ts`, `src/lib/mcp/tools/list-open-tasks.ts` — the two read-only tools
- `src/app/api/mcp/route.ts` — Streamable HTTP MCP server
- `src/app/api/oauth/register/route.ts` — Dynamic Client Registration
- `src/app/api/oauth/token/route.ts` — token endpoint
- `src/app/v2/oauth/authorize/page.tsx`, `src/app/v2/oauth/authorize/actions.ts` — consent screen (relocated from the originally planned `src/app/oauth/authorize/*` — see Deviations)
- `src/app/.well-known/oauth-authorization-server/route.ts` — hand-written RFC 8414 AS metadata (`mcp-handler` has no helper for this side)
- `src/app/.well-known/oauth-protected-resource/route.ts` — RS metadata via `mcp-handler`'s `protectedResourceHandler`
- `supabase/migrations/087_mcp_oauth_schema.sql` — created, **not applied**
- `src/types/database.ts` — hand-added provisional types for the 4 new tables + convenience row exports

### Deviations From Plan

- **Moved the consent screen from `src/app/oauth/authorize/*` to `src/app/v2/oauth/authorize/*`** (post-Testing fix, prompted by the user's next-steps question about deploying/testing). Root cause: `postLoginGate()` in `src/app/v2/(auth)/actions.ts:91` — the shared v2 post-login redirect used by every v2 login — only trusts a `returnTo` value that starts with `/v2/` (an open-redirect guard) and silently falls back to `/v2/dashboard` otherwise. The original plan's `/oauth/authorize` path failed that check, so any user without an active session would hit the login redirect, log in, and land on the dashboard instead of bouncing back to finish consent — breaking the flow for exactly the case it exists to handle. Moving the route under `/v2/` was the minimal fix: it satisfies the existing guard with no changes to shared login/gate code (which would have been a broader, security-sensitive change out of proportion to this task). Updated: the page's own `returnTo` param name and value, `.well-known/oauth-authorization-server`'s `authorization_endpoint`, and every doc reference below. Confirmed via `pnpm build` that `/v2/oauth/authorize` now builds correctly at the new path.
- Added `src/lib/mcp/run-tool.ts`, not in the original Proposed File Changes table. Both tools need identical scope-check → RLS-scoped-client → audit-log behavior; extracting it avoids duplicating that logic (and its failure-path logging) across every future tool, read or write. Small, in-spirit-of-the-plan addition, not a scope change.
- `list_open_tasks` orders by `tasks.position` (ascending, nulls last) rather than leaving order unspecified — matches how task lists are ordered elsewhere in the app; not called out explicitly in the plan but a natural fill-in.
- Discovered and worked around an unrelated stale-`.next`-cache build failure (`TypeError: Cannot read properties of null (reading 'hash')`) during verification — confirmed via isolation (moving all new route files aside, still failed; `rm -rf .next` fixed it) that this was pre-existing local build-cache corruption, not caused by this task's changes. No code change was needed; noting it here in case it resurfaces for the next person who runs `pnpm build` without a clean cache.

### Post-Deploy Bug: `/api/mcp` 404 for authenticated requests

Found during the user's real end-to-end connector test against the deployed instance (migration already applied by the user at that point) — full systematic-debugging pass, root-caused via Vercel function logs + reading `mcp-handler`'s compiled source directly (not just its README/`.d.ts`).

**Symptom:** OAuth handshake completed fully (`/v2/oauth/authorize` → 303, `/api/oauth/token` → 200), but every subsequent `GET`/`POST /api/mcp` from Claude's real client returned `404 Not found` with no log output — while my own earlier unauthenticated `curl` tests against the same endpoint had correctly returned `401`. Vercel's Function Invocation trace for one of the 404s showed the function *did* run (`Route: /api/mcp`) and made a real, successful (`200`) call out to Supabase — meaning auth verification (`verifyMcpToken`) genuinely executed and succeeded, and the 404 happened *after* that, inside successful, authenticated request handling.

**Root cause:** `mcp-handler`'s internal request dispatcher (`node_modules/mcp-handler/dist/index.js`, function `mcpApiHandler`) routes on `url.pathname === streamableHttpEndpoint`, where `streamableHttpEndpoint` defaults to the literal string `"/mcp"` unless a `basePath` is passed in config — it has no awareness of which file/route it's actually mounted at. `src/app/api/mcp/route.ts` only passed `{ disableSse: true }`, no `basePath`, so the library was checking for `"/mcp"` while the real request path was `"/api/mcp"` — always false, always falling into its final `else { res.statusCode = 404; ... }` branch. `withMcpAuth` wraps this dispatcher and only calls it *after* `verifyMcpToken` succeeds, which is why unauthenticated requests correctly got `401` (from `withMcpAuth` itself, never reaching the buggy dispatcher) while authenticated ones got `404` (auth passed, dispatcher's own path check then failed).

**Fix:** added `basePath: "/api"` to `createMcpHandler`'s config in `src/app/api/mcp/route.ts` — `mcp-handler` derives `streamableHttpEndpoint` as `${basePath}/mcp`, i.e. `"/api/mcp"`, matching the real mount point.

**Also fixed while investigating (unrelated but adjacent):** `src/lib/mcp/verify-token.ts` was discarding the Supabase query's `error` and treating any query failure identically to "token not found" — no log, no signal. Added explicit `console.error` on that path so a future genuine DB/config failure doesn't look indistinguishable from a normal 401 again.

**Not yet re-verified end-to-end** — this fix is in the working tree, type-checked and built clean locally, but has not been redeployed or retested against a live Claude connection yet. That's the next step, not something I can verify without the user deploying again.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- `pnpm build` (after `rm -rf .next`) — PASS, all 6 new routes present in the route manifest: `/api/mcp`, `/api/oauth/register`, `/api/oauth/token`, `/oauth/authorize`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`
- `pnpm dev` / full OAuth handshake / Claude custom-connector test — SKIPPED (requires the migration to actually be applied to a real Supabase instance first, which is explicitly gated on a separate approval per Out of Scope; also requires deploying or tunneling a public URL for Claude to reach). See Manual Testing section above for the exact steps once the migration is applied.
- Migration **not run** — `supabase/migrations/087_mcp_oauth_schema.sql` exists on disk only. Applying it (and regenerating real Supabase types afterward, to replace the hand-authored provisional ones in `src/types/database.ts`) is the next explicit approval needed before any end-to-end testing can happen.
