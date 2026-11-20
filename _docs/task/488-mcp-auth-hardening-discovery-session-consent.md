# 488: MCP Auth Hardening — OAuth Discovery, Separate Supabase Session, Consent Validation

**Created:** 2026-11-19
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

An audit of the remote MCP server (`/api/mcp`, built in tasks 181/182) found three problems in its OAuth layer:

1. **OAuth discovery is gated as a hub route.** Since task 255, `src/proxy.ts` treats every path not in `nonHubPrefixes` as a hub page. `/.well-known/*` is not in that list, and the matcher's file-extension exclusion doesn't match it. So an MCP client with no session cookie that fetches `/.well-known/oauth-protected-resource` or `/.well-known/oauth-authorization-server` gets a 307 to `/auth/login` instead of JSON. That breaks every new connector setup. Connections that already have tokens keep working because `/api/` is excluded. Task 181's note that "proxy.ts needed no changes" was written before the task 255 rewrite.
2. **The MCP connection and the hub browser login share one Supabase refresh token.** `approveConsent` stores the browser session's own refresh token (`sessionData.session.refresh_token`). `withUserScopedClient` then spends and rotates it on every tool call, while the browser keeps refreshing the same token family. Whichever side refreshes second holds an already-spent token. Outside Supabase's reuse interval, that counts as token reuse and can revoke the whole session. The symptoms are random hub logouts and MCP calls failing with `mcp: failed to refresh user session`. A related problem: an in-flight tool call writes the rotated token back by row `id`, so when the MCP refresh grant has just rotated that row, the new row keeps the stale token.
3. **The consent Server Actions trust hidden form fields.** `approveConsent` reads `scopes`, `client_id`, `redirect_uri` and `code_challenge` from the posted form and never re-validates them. The page filters scopes by role, but the action doesn't. A developer can edit the hidden `scopes` input and grant themselves `tasks:delete`, `orchestration:run`, etc. RLS still limits the session-client tools, but `list_assignable_users` and `run_orchestration` read with `adminClient` and rely only on the scope check. `redirect_uri` is not re-checked against the client's registered URIs, and `denyConsent` redirects to any posted `redirect_uri`, which makes it an open redirect. Both actions also build the redirect as `${redirectUri}?…`, which breaks when the URI already has a query string.

## Requirements

- [ ] **R1** — Unauthenticated `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-authorization-server` return 200 JSON. No redirect, and no `mfa_pending` / `change_password_required` cookie redirect either.
- [ ] **R2** — Each MCP consent creates its **own** Supabase session for the user, separate from the browser login. The browser session's refresh token is never stored in `mcp_oauth_*` tables.
- [ ] **R3** — If minting that session fails, consent fails. The action redirects to the client with `error=server_error`, and there is no fallback to the browser token.
- [ ] **R4** — When a tool call rotates the Supabase refresh token, the new value is written to every `mcp_oauth_tokens` row that held the old value (the token's lineage), not only the row the call came in on. A failed write is logged.
- [ ] **R5** — `approveConsent` re-validates everything on the server: there is a session, the client exists, `redirect_uri` is in that client's `redirect_uris`, `code_challenge` matches `^[A-Za-z0-9_-]{43,128}$`, and the scopes stored are the intersection of the posted scopes, `MCP_SCOPES`, and `allowedScopesForRole(<role read from profiles>)`. If that intersection is empty, no code is issued.
- [ ] **R6** — `denyConsent` redirects to `redirect_uri` only after the same client and redirect check. Otherwise it redirects to `/dashboard`.
- [ ] **R7** — Every redirect back to the client is built with `URL` / `searchParams`, so an existing query string survives.
- [ ] **R8** — The consent page and both actions share one validation helper, so the checks can't drift apart.
- [ ] **R9** — An operator script in `supabase/manual/` revokes every MCP token issued before the fix (decision D1), and the release notes tell users to reconnect the connector once.

## Decisions

- **D1 (user, 2026-11-19): revoke pre-fix connections.** All `mcp_oauth_tokens` issued before deploy share the browser token. The user chose to revoke them with a manual script and have users reconnect, rather than leave them to break on their own.
- **D2: how to mint the separate session.** On the server, `adminClient.auth.admin.generateLink({ type: "magiclink", email })` returns `properties.hashed_token`. Pass it to `verifyOtp({ token_hash, type: "magiclink" })` on a throwaway publishable-key client (`persistSession: false`). The result is a brand-new session and token family. `generateLink` doesn't send email. The repo already uses this pattern with `type: "recovery"` (`src/app/(auth)/actions.ts:278` → `src/app/(auth)/auth/verify/page.tsx:96`). Signing our own JWTs was rejected: it needs the legacy JWT secret and skips Supabase session tracking, so `force_logout_*` couldn't revoke it.
- **D3: side effects accepted.**
  - The new session is `aal1`. Nothing in `src/` or the migrations checks `aal`, since MFA is enforced by the `mfa_pending` cookie in `proxy.ts`.
  - Consent updates `auth.users.last_sign_in_at`.
  - `force_logout_user` (migration 144) and `force_logout_all_except` (migration 009) delete all of a user's sessions, so they now also cut MCP connections. That's the intended behaviour for deactivation.
  - A plain hub sign-out (local scope) no longer affects MCP.
  - A banned user can't mint a session, so their consent fails (R3).

## Out of Scope / Must-Not-Change

- Audit findings 4–6: `client_id` binding at the token endpoint, atomic code redemption, refresh-token expiry, open Dynamic Client Registration (DCR) / `client_name` spoofing, the missing `_docs/mcp-tools.md`, and cleanup of the 087 header. Those are a separate task.
- `/oauth/authorize` **stays** a gated hub route. The proxy's login redirect with `returnTo` is what sends a signed-out user back to consent. Only `/.well-known/` gets excluded.
- `postLoginGate()` and the rest of `src/app/(auth)/actions.ts`: don't touch them.
- `src/app/api/oauth/token/route.ts` and `src/app/api/oauth/register/route.ts`: no behaviour change.
- MCP tool files (`src/lib/mcp/tools/*`), `scopes.ts` role grants, and `verify-token.ts`: unchanged.
- No new migration under `supabase/migrations/`. The token-revocation SQL is an operator script in `supabase/manual/` (it's a deploy-time action, not schema).
- No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modify | Add `"/.well-known/"` to `nonHubPrefixes` (R1) |
| `src/lib/mcp/authorize-request.ts` | Create | Shared helpers: `loadRegisteredClient(clientId, redirectUri)`, `grantableScopes(requested, role)`, `isValidCodeChallenge(s)`, `clientRedirectUrl(redirectUri, params)` (R5–R8). Server-only (imports `adminClient`); keep the pure functions free of I/O so the check script can import them |
| `src/lib/mcp/mint-session.ts` | Create | `mintMcpSupabaseSession(userId)` → `{ refreshToken }`: looks up the email via `adminClient.auth.admin.getUserById`, runs `generateLink` (magiclink) and then `verifyOtp` on a non-persisting client (R2, D2) |
| `src/app/oauth/authorize/actions.ts` | Modify | Re-validate via the helpers; store the minted token instead of the browser token; use `URL`-built redirects; `denyConsent` validates before redirecting (R3, R5–R7) |
| `src/app/oauth/authorize/page.tsx` | Modify | Use `loadRegisteredClient` + `grantableScopes` instead of the inline checks (R8). No UI change |
| `src/lib/mcp/user-scoped-client.ts` | Modify | Write the rotated token `where supabase_refresh_token = <old>` instead of `where id = …`; log the update error (R4) |
| `supabase/manual/488_revoke_pre_fix_mcp_tokens.sql` | Create | Operator script: revoke live tokens created before the deploy timestamp and delete unredeemed codes (R9, D1) |
| `_docs/task/488-mcp-authorize.check.ts` | Create | Pure-logic checks for the helpers, run with `npx tsx` |
| `_docs/task/181-remote-mcp-server-oauth-scaffold.md` | Modify | Add a short follow-up note that the proxy and session-sharing assumptions were fixed in 488 |

## Code Context

### File: `src/proxy.ts` (lines 56–60)

```ts
const pathname = request.nextUrl.pathname;
const nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"];
const isHubRoute = pathname !== "/" && !nonHubPrefixes.some((prefix) => pathname.startsWith(prefix));
```

Matcher exclusion `.*\\.[a-zA-Z0-9]+$` doesn't catch `/.well-known/oauth-protected-resource`: the only `.` is followed by `well-known/…`, which contains `-` and `/`. Adding `"/.well-known/"` to the list also skips the `mfa_pending` / `change_password_required` redirects below it, which is correct for these files.

### File: `src/app/oauth/authorize/actions.ts` (current, trimmed)

```ts
const clientId = formData.get("client_id") as string;
const redirectUri = formData.get("redirect_uri") as string;
const codeChallenge = formData.get("code_challenge") as string;
const scopes = ((formData.get("scopes") as string) ?? "").split(" ").filter(Boolean); // ← trusted as-is
const { data: sessionData } = await supabase.auth.getSession();
// …
supabase_refresh_token: sessionData.session.refresh_token,               // ← browser's own token
// …
redirect(`${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);

export async function denyConsent(formData: FormData) {
  const redirectUri = formData.get("redirect_uri") as string;           // ← unvalidated
  redirect(`${redirectUri}?error=access_denied&state=…`);
}
```

Target shape:

```ts
const { data: claims } = await supabase.auth.getClaims();
if (!claims?.claims) redirect("/auth/login");
const client = await loadRegisteredClient(clientId, redirectUri);   // null → redirect("/dashboard")
if (!client || !isValidCodeChallenge(codeChallenge)) redirect("/dashboard");
const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
const scopes = grantableScopes(postedScopes, profile?.role ?? "client");
if (scopes.length === 0) redirect(clientRedirectUrl(redirectUri, { error: "access_denied", state }));
let refreshToken: string;
try { ({ refreshToken } = await mintMcpSupabaseSession(userId)); }
catch (err) { console.error("[mcp-consent] session mint failed:", err); redirect(clientRedirectUrl(redirectUri, { error: "server_error", state })); }
// insert code with supabase_refresh_token: refreshToken
```

Note: `redirect()` throws, so keep it outside the `try` that guards the mint (or re-throw `NEXT_REDIRECT`). Call it after the `try`/`catch`.

### File: `src/app/oauth/authorize/page.tsx` (lines 65–88): checks to move into the helper

```ts
const { data: client } = await adminClient.from("mcp_oauth_clients")
  .select("client_id, client_name, redirect_uris").eq("client_id", clientId).maybeSingle();
if (!client || !client.redirect_uris.includes(redirectUri)) { /* "Unknown Connector" */ }
const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
const grantedScopes = allowedScopesForRole(profile?.role ?? "client");
const scopesToGrant = requestedScopes.filter((scope) => grantedScopes.includes(scope));
```

`grantableScopes` must also drop strings that aren't in `MCP_SCOPES`. Today the page casts `requestedScope.split(" ")` straight to `McpScope[]`.

### File: `src/lib/mcp/user-scoped-client.ts`: rotation write (R4)

```ts
await adminClient
  .from("mcp_oauth_tokens")
  .update({ supabase_refresh_token: data.session.refresh_token })
  .eq("id", mcpTokenRecordId);          // → .eq("supabase_refresh_token", supabaseRefreshToken), check { error }
```

This is safe once R2 lands: each consent's Supabase token is unique, so its value identifies the lineage. `mcpTokenRecordId` may then be unused, so drop the parameter and update `run-tool.ts`'s call site.

### Precedent for D2: `src/app/(auth)/actions.ts:278` and `src/app/(auth)/auth/verify/page.tsx:96`

```ts
const { data } = await adminClient.auth.admin.generateLink({ type: "recovery", email: target.email });
// …client:
await supabase.auth.verifyOtp({ token_hash: result.hashedToken, type: "recovery" });
```

For MCP, use `type: "magiclink"` on both sides, run entirely on the server with:

```ts
createClient(URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
```

This mirrors `user-scoped-client.ts`'s bootstrap client. Check the installed `@supabase/supabase-js` types accept `"magiclink"` for `verifyOtp`. If they don't, use `"email"`.

### Manual script shape: `supabase/manual/488_revoke_pre_fix_mcp_tokens.sql`

```sql
-- Operator: set the deploy timestamp of task 488 before running. Aborts if left unset.
do $$ begin
  if '<<DEPLOYED_AT>>' like '<<%' then raise exception 'set DEPLOYED_AT first'; end if;
end $$;
update public.mcp_oauth_tokens set revoked_at = now()
 where revoked_at is null and created_at < '<<DEPLOYED_AT>>'::timestamptz;
delete from public.mcp_oauth_authorization_codes where used_at is null;
```

Run it **after** deploy, so no new pre-fix tokens can be issued in between.

## Implementation Steps

1. `src/proxy.ts`: add `"/.well-known/"` to `nonHubPrefixes`, with a one-line comment that MCP OAuth discovery must be reachable without a session (task 488).
2. Create `src/lib/mcp/authorize-request.ts` with the four helpers. Keep `grantableScopes`, `isValidCodeChallenge` and `clientRedirectUrl` pure. `loadRegisteredClient` does the `adminClient` lookup, an exact `redirect_uris.includes` match, and returns `{ client_id, client_name } | null`.
3. Create `src/lib/mcp/mint-session.ts` (D2). Throw on any error. Never log the token.
4. Refactor `page.tsx` to use the helpers. The rendered output must stay identical.
5. Rewrite `approveConsent` / `denyConsent` per the target shape. Remove the `getSession()` call.
6. Update `user-scoped-client.ts` (R4) and its caller in `run-tool.ts` if the signature changes.
7. Write `_docs/task/488-mcp-authorize.check.ts`. Cover:
   - scope intersection: developer posting staff scopes gets `projects:read` and `tasks:read` only; an unknown scope is dropped; `client` role gets an empty list
   - code challenge: 43 chars OK, 42 rejected, `+` or `/` rejected
   - `clientRedirectUrl`: an existing `?a=1` survives, `state` is encoded
8. Write the manual SQL script and add the follow-up note to task 181.
9. Run `npx tsc --noEmit` and the check script.

## Acceptance Criteria

- [ ] `curl -i <host>/.well-known/oauth-protected-resource` and `…/oauth-authorization-server` with no cookies → `200` with `application/json`.
- [ ] Unauthenticated `GET /oauth/authorize?...` still redirects to `/auth/login?returnTo=…`, and after login returns to consent.
- [ ] A fresh Claude custom-connector setup completes end to end and `get_project_status` succeeds.
- [ ] After consent, `auth.sessions` has one more row for the user than before (separate session). The `supabase_refresh_token` in `mcp_oauth_authorization_codes` / `mcp_oauth_tokens` is different from the browser session's.
- [ ] Hub browser and MCP coexist: make several MCP tool calls, call `supabase.auth.refreshSession()` in the browser console, make more tool calls, reload the hub. Both stay signed in. A local hub sign-out doesn't break MCP. `force_logout_user` on that user breaks MCP (expected, D3).
- [ ] After a refresh-token grant, a tool call still works, and the old and new token rows both hold the latest Supabase token (R4).
- [ ] As a developer, editing the hidden `scopes` input to `tasks:delete orchestration:run` and approving issues a code whose `scopes` are a subset of `{projects:read, tasks:read}`.
- [ ] Posting `approveConsent` / `denyConsent` with a `redirect_uri` the client didn't register (e.g. `https://evil.example`) → redirects to `/dashboard`, and no code row is created.
- [ ] A registered redirect URI with an existing query string gets `code` / `state` appended correctly.
- [ ] Simulated mint failure (e.g. temporarily throwing in `mintMcpSupabaseSession`) → the client receives `error=server_error`, and no code row is created.
- [ ] The manual script aborts while `DEPLOYED_AT` is unset. Once set, it revokes only pre-deploy tokens.
- [ ] `npx tsc --noEmit` passes and `npx tsx _docs/task/488-mcp-authorize.check.ts` passes.

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/488-mcp-authorize.check.ts
pnpm build   # uses --webpack
# Discovery (local: pnpm dev; then deployed)
curl -i http://localhost:3000/.well-known/oauth-protected-resource
curl -i http://localhost:3000/.well-known/oauth-authorization-server
```

Then browser and connector acceptance checks as listed above. Inspect `auth.sessions`, `mcp_oauth_authorization_codes` and `mcp_oauth_tokens` with the Supabase SQL editor.

## Compatibility Touchpoints

- **Users:** every existing MCP connector must reconnect once after the manual script runs. Say so in the release notes.
- **Deploy order:** deploy the code first, then run `supabase/manual/488_revoke_pre_fix_mcp_tokens.sql` with the deploy timestamp.
- **Docs:** add the follow-up note to task 181. `_docs/mcp-tools.md` is still missing (out of scope; there are no tool changes here). If a `_docs/context/` MCP file is added later, it should describe the separate-session model.
- **Proxy:** any future non-hub top-level path (not just `.well-known`) needs the same `nonHubPrefixes` treatment.

## Implementation Notes

### What Changed
- **Finding 1:** `/.well-known/` added to `nonHubPrefixes` in `proxy.ts`. OAuth discovery no longer redirects to login or hits the MFA/password-change cookie redirects. `/oauth/authorize` stays gated.
- **Finding 2:** consent now creates a separate Supabase session per connection (`mintMcpSupabaseSession`: `getUserById` → `generateLink` magiclink → `verifyOtp` on a non-persisting client, with a check that the session belongs to the same user id). If minting fails, the client gets `error=server_error` and no code is stored. The browser token is no longer read: `getSession()` was removed from the action. Rotated tokens are written to every row holding the old value. The `mcpTokenRecordId` parameter was dropped from `withUserScopedClient`.
- **Finding 3:** `approveConsent` re-validates everything: session, client plus exact registered `redirect_uri` (must also parse as a URL), PKCE challenge format, and scopes capped to the role. An empty scope set redirects with `access_denied`. `denyConsent` now requires `client_id` and only redirects to a registered URI, falling back to `/dashboard` otherwise. All client redirects are built with `URL`/`searchParams`. The page uses the same helpers.
- **D1:** an operator script revokes pre-deploy tokens and unredeemed codes.

### Files Changed
- `src/proxy.ts`: `/.well-known/` excluded from the hub gate
- `src/lib/mcp/authorize-rules.ts` (new): pure rules (`grantableScopes`, `splitScopes`, `isValidCodeChallenge`, `clientRedirectUrl`)
- `src/lib/mcp/authorize-request.ts` (new): `loadRegisteredClient` (adminClient lookup), re-exports the rules
- `src/lib/mcp/mint-session.ts` (new): separate session per consent
- `src/app/oauth/authorize/actions.ts`: rewritten, both actions validate server-side
- `src/app/oauth/authorize/page.tsx`: uses the shared helpers; the deny form now posts `client_id`
- `src/lib/mcp/user-scoped-client.ts`: rotation written to the whole lineage, error logged
- `src/lib/mcp/run-tool.ts`: call site updated for the new signature
- `supabase/manual/488_revoke_pre_fix_mcp_tokens.sql` (new): guarded revocation script
- `_docs/task/488-mcp-authorize.check.ts` (new): pure-logic checks
- `_docs/task/181-remote-mcp-server-oauth-scaffold.md`: follow-up note

### Deviations From Plan
- The pure helpers are in a separate `authorize-rules.ts`, re-exported from `authorize-request.ts`. Reason: importing `@/lib/supabase/admin` throws without env vars, so the check script couldn't import one combined module.
- The page now applies `isValidCodeChallenge` in its existing "Invalid Request" branch. Without that, a malformed challenge would only fail after the user clicked Approve and was sent to `/dashboard`. This is the same check as the action, and the UI text is unchanged.
- `loadRegisteredClient` also rejects a `redirect_uri` that doesn't parse as a URL (`URL.canParse`), because registration doesn't validate URIs and `clientRedirectUrl` would throw on one.
- `McpAuthInfoExtra.tokenRecordId` is left in `verify-token.ts` (now unused by `run-tool.ts`), since that file is out of scope.
- The manual script deletes only codes that expired before the deploy window plus 1 minute, rather than every unredeemed code, so codes minted after deploy are untouched.

### Verification Run
- `npx tsx _docs/task/488-mcp-authorize.check.ts`: PASS
- `npx tsc --noEmit`: PASS for changed files. The only 2 errors are stale `.next/**/validator.ts` references to `src/app/(hub)/projects/[classification]/page.js`, which task 483 moved. They're generated-type leftovers that this change didn't cause.
- `npx eslint src/lib/mcp src/app/oauth src/proxy.ts`: PASS
- `pnpm build`: SKIPPED (task 484 notes a pre-existing `dashboard/users` build error; run during `test`)
- Discovery `curl`, connector end-to-end, session-coexistence, tampering and manual-script checks: PENDING (need a running instance and a real connector; covered by `test 488`)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Every requirement R1–R9 maps to code: R1 `proxy.ts`; R2/R3 `mint-session.ts` and `approveConsent`; R4 `user-scoped-client.ts`; R5–R7 `actions.ts` with `authorize-rules.ts`; R8 page and actions share helpers; R9 manual script. Out-of-scope files (token/register routes, tools, `scopes.ts` grants, `postLoginGate`) are untouched.
- Errors are handled on purpose:
  - A failed session mint or code insert redirects with `server_error` and is logged without token values.
  - A failed client lookup is logged and treated as "unknown client".
  - A failed rotation write is logged but doesn't fail the tool call, which matches the earlier behaviour.
- `redirect()` returns `never`, so `client` / `refreshToken` narrow correctly after the guard clauses, with no casts. The `try` covers only the mint, so `NEXT_REDIRECT` is never swallowed.
- `"use server"` file: only async functions are exported; `field()` is a private sync helper, which is allowed.
- No `any`, no commented-out code, and no debug logging beyond tagged `console.error` lines that follow the existing `[mcp-*]` convention.
- `URL.canParse` needs Node ≥ 19.9. `tsc` accepts it, and the Vercel Node 20+ runtimes cover it.
- Minor leftover: `McpAuthInfoExtra.tokenRecordId` (`verify-token.ts`) is now set but never read. That file was out of scope, so this is left for findings 4–6. Not blocking.
- Minor duplication: the non-persisting publishable-key client is built in both `mint-session.ts` and `user-scoped-client.ts`. Two short call sites aren't worth a shared factory yet. Not blocking.

### Deviations
- **Minor:** pure rules split into `authorize-rules.ts`, so the check script can import them without `adminClient`. Same API, re-exported from `authorize-request.ts`.
- **Minor:** the page applies `isValidCodeChallenge` in its existing "Invalid Request" branch. It's the same check as the action, failing earlier, with no UI text change.
- **Minor:** `loadRegisteredClient` rejects an unparseable `redirect_uri`. This hardens R5 and prevents `new URL` throwing in `clientRedirectUrl`.
- **Minor:** the manual script deletes only codes that expire by deploy time plus 1 minute, so codes issued after deploy survive. That's narrower than the plan's sketch, and safer.
- **Medium (user-visible):** `denyConsent` now needs `client_id`. A consent tab opened before deploy will send Deny to `/dashboard` instead of back to the client. This is a one-time, harmless edge case, since the client just sees no callback and the user can retry. Accepted.

### Required Fixes
- None.
