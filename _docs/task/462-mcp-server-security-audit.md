# 462: MCP server security audit — findings and pending fixes

**Created:** 2026-10-22
**Priority:** HIGH
**Type:** audit
**Status:** Open — nothing in this doc is fixed yet

---

## Overview

Audit of the remote MCP server (`src/app/api/mcp/route.ts` + `src/lib/mcp/**` + the self-hosted
OAuth 2.1 authorization server). The foundation is sound — S256-only PKCE, access/refresh tokens
stored as SHA-256 hashes, every tool call executed through an RLS-scoped client re-derived from a
stored Supabase refresh token, per-tool scope gates, audit logging, and service-role-only OAuth
tables. It is **not** high-assurance yet: three authorization gaps and one reliability bug are
listed below in severity order. `npx tsc --noEmit` passes on the audited code.

## Findings

### HIGH — consent Server Action trusts client-supplied OAuth fields
`src/app/oauth/authorize/actions.ts:10-46`

`approveConsent` takes `client_id`, `redirect_uri`, `code_challenge` and `scopes` from `FormData`
and inserts the code without re-checking `redirect_uri` against
`mcp_oauth_clients.redirect_uris` or re-filtering scopes against the user's role. The page
validates them, but the page is not the trust boundary; RFC 6749 requires the AS to validate
`redirect_uri` at code issuance. `denyConsent` has the same open-redirect shape.
Requires an authenticated same-origin POST (Next's Origin check blocks drive-by), so this is not
remotely exploitable today — it becomes token minting the moment any XSS exists.
**Fix:** re-read client + role inside the action and derive `scopesToGrant` server-side.

### HIGH — developer role gets org-wide visibility, not "their projects"
`src/lib/mcp/scopes.ts:52`, `supabase/migrations/048_super_admin_rls.sql:36`,
`supabase/migrations/084_tighten_pipeline_rls.sql:23`

The code comment claims RLS confines developer reads. It does not: `tasks_staff_read` and
`customers_staff_read` grant every developer SELECT on **all** tasks and customers. A developer's
connector can call `list_open_tasks` with any `project_id` (titles, assignees, due dates) and
`get_project_status` with any customer (incl. `contact_email`), bypassing the in-app
`getDeveloperAccessibleProjectIds` restriction.
**Fix:** filter those two tools by accessible project ids, or tighten the RLS to project membership.

### MEDIUM-HIGH — no revocation path; refresh tokens never expire
`supabase/migrations/087_mcp_oauth_schema.sql`, `src/app/api/oauth/token/route.ts:81-89`

No `revoked_at` is ever set except by rotation, there is no revoke endpoint or UI, and refresh
tokens carry no expiry column or check. A leaked token is permanent until an operator edits the row.
Scopes are frozen at consent, so a demoted user keeps the old scope set until manual revocation
(data access is still re-checked by RLS at query time).
**Fix:** add `refresh_token_expires_at`, a revoke endpoint + "connected apps" UI, and re-check the
caller's current role on token refresh.

### MEDIUM-HIGH — open DCR + full staff scopes enables consent phishing
`src/app/api/oauth/register/route.ts`

Anyone can register a client with any `client_name` and redirect URI, and the consent screen shows
only that attacker-chosen name. A registered client may request the full PM scope set including
`tasks:delete` and `orchestration:run`. `client_name` and the redirect host should both be
allowlisted (or the redirect host at minimum shown on the consent screen).

### MEDIUM — Supabase refresh-token rotation races and can log the user out
`src/lib/mcp/user-scoped-client.ts:20-34`

Every tool call spends the stored Supabase refresh token and writes the rotated one back. Therefore:
- two concurrent tool calls race, and one writes back an already-spent token;
- authorizing a **second** connector captures a different (browser) token into a second row, and
  the two rows then fight over rotation;
- consent stores the *browser's* refresh token, so an MCP rotation can invalidate the user's Hub
  session on its next refresh (Supabase reuse detection outside the reuse interval) → random logouts.

**Fix:** one refresh-token row per user/connector family behind a lock, retry once on
`Invalid Refresh Token` by re-reading the row, and stop sharing the browser session's token.

### MEDIUM — authorization-code exchange is check-then-mark, non-atomic
`src/app/api/oauth/token/route.ts:39-65`

Two concurrent exchanges of the same code can both pass the `used_at` check before either update
lands. Codes are also stored in plaintext (tokens are hashed) — acceptable at a 60 s TTL but
inconsistent.
**Fix:** conditional update (`.is("used_at", null).select()`) and treat zero rows as `invalid_grant`.

### MEDIUM — plaintext Supabase refresh tokens at rest
`supabase/migrations/087_mcp_oauth_schema.sql`

Documented, user-approved decision. One leak of `mcp_oauth_tokens` (table or backup) equals full
impersonation of every connected user. Revisit with pgcrypto/Vault if it becomes a compliance item.

### LOW
- No rate limiting on `/api/oauth/register` or `/api/oauth/token`.
- Registration accepts `http://` and localhost redirect URIs with no scheme validation.
- The refresh grant does not require `client_id`.
- `list_assignable_users` uses `adminClient` behind a PM scope, exposing all staff names/roles.
- Raw DB error messages are returned to external clients in `server_error` descriptions.
- Expired codes, expired tokens and invocation logs are never cleaned up.
- PKCE verifier length (RFC 7636 43–128) is not validated — harmless under S256.

### Bugs / doc drift
- `_docs/central-hub-mcp-tools.md` omits `list_filed_tickets` (14 tools registered, 13 documented),
  points at `/v2/oauth/authorize` (actual path is `/oauth/authorize`), and has no connector
  setup steps — violating its own maintenance rule and task 181's requirement.
- `supabase/migrations/087_mcp_oauth_schema.sql:18` still says "NOT YET APPLIED" although later
  docs treat it as applied; `src/types/database.ts` still carries hand-written types for that
  migration and needs regenerating.
- Refresh rotation revokes the old row *before* inserting the new pair — an insert failure locks the
  user out with no valid token.

## Tool inventory (for the record)

14 tools on `POST/GET /api/mcp`, Streamable HTTP, OAuth bearer required:

`get_project_status`, `list_open_tasks`, `list_tasks`, `create_task`, `update_task`,
`update_task_status`, `assign_task`, `delete_task`, `list_assignable_users`,
`list_classifications`, `update_classification_status`, `list_tickets`, `list_filed_tickets`,
`run_orchestration`.

Discovered (`.well-known/oauth-authorization-server`, `.well-known/oauth-protected-resource`),
DCR `/api/oauth/register`, consent `/oauth/authorize`, token `/api/oauth/token`.

Reporting gaps for external use: no date-range filters, max 50 rows with no pagination/cursor, no
customer or project list (the caller must already know `customer_id`/`project_id`), no time logs,
no ticket detail/comments, no aggregates.

## Verification

- Static audit only. No deployed instance was exercised, no live OAuth flow was run, and the
  "migration applied" status is unverified.
- Refresh-token rotation behaviour is reasoned from code + documented Supabase semantics, not
  reproduced.
