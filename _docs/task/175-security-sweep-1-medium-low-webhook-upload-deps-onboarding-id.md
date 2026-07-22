# 175: Security Sweep #1 — Medium/Low: Webhook Auth, Upload Validation, ops-chat Tool Gating, Dependencies

**Created:** 2026-07-22
**Priority:** MEDIUM
**Type:** security
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Second half of the first OWASP sweep's findings — Medium/Low severity items (#6–#11), deliberately scoped as a separate follow-up from the Critical/High fixes in task 174 per user direction ("Separate follow-up task" when asked how to prioritize). Covers a config-dependent auth bypass on the Zoho webhook, an unauthenticated public-upload endpoint with weak validation, a Sanity MCP tool-access gap in the ops-chat assistant, an unfixable-via-npm dependency vulnerability, and the onboarding customer-ID brute-force hardening (design choice made via `AskUserQuestion`, implemented here since it's the same finding family as task 174's ID-widening).

1. **Zoho webhook signature verification was optional** — `src/app/api/webhooks/route.ts` only checked the HMAC signature `if (hmacSecret)` was configured. An environment missing `ZOHO_WEBHOOK_SECRET` would accept unauthenticated requests capable of triggering paid LLM classification calls and flipping `implementation_plans.status` via a guessed `zoho_task_id`. It also logged the full raw request body on every call.
2. **`/api/upload` (public, unauthenticated by design)** allowed `image/svg+xml` (stored-XSS vector) and didn't validate that the supplied `customerId`/`productName` corresponded to a real, in-progress onboarding — enabling anonymous storage-quota abuse under arbitrary paths.
3. **ops-chat's Sanity MCP write tools** (`create_documents`, `patch_documents`) were merged into every authenticated user's tool set regardless of role — the "admin/pm only" restriction existed only as a system-prompt instruction, not an actual code-level gate, unlike the local tools in `ops-chat-tools.ts` which do enforce role server-side.
4. **17 HIGH-severity `pnpm audit` findings** across direct and transitive dependencies (`xlsx`, `sharp`, `serialize-javascript`, `brace-expansion`, `js-yaml`, `fast-uri`), on top of the `next` CVEs already fixed in task 174.
5. Confirmed via `AskUserQuestion`: widen the onboarding customer ID (already implemented in task 174 as part of the same finding family — the 4→8 hex-char change lives there, not duplicated here).
6. `role-access.ts`'s fail-open default for unlisted page routes — evaluated and **deliberately left as-is** per user decision: it only gates legacy v1 `(hub)` page navigation (v2 does its own `profiles`-based role checks), and every sensitive prefix is already explicitly listed. Flipping to deny-by-default would need a full v1 route audit first.

## Requirements

- [x] Make Zoho webhook HMAC verification mandatory — reject (200, to avoid Zoho retry storms) if `ZOHO_WEBHOOK_SECRET` is unset, instead of silently skipping verification.
- [x] Stop logging the full raw webhook request body; log only `contentType`/`bodyLength`.
- [x] Remove `image/svg+xml` from `/api/upload`'s allowed MIME types.
- [x] Add a `productName` allowlist and a `customers` table existence check to `/api/upload`, closing anonymous storage abuse under arbitrary customer paths.
- [x] Gate ops-chat's Sanity MCP tool set (`sanityMCP`/`mcpTools`) to `admin`/`pm` roles in code, not just the system prompt.
- [x] Resolve `pnpm audit` HIGH-severity findings: `xlsx` (no npm-registry fix exists — repoint to SheetJS's own CDN build), `sharp`/`serialize-javascript`/`brace-expansion`/`js-yaml`/`fast-uri` (transitive — pin via `pnpm.overrides`).
- [x] Decide and document the `role-access.ts` fail-open question — resolved as "leave as-is" via `AskUserQuestion`, not a silent skip.

## Out of Scope / Must-Not-Change

- Critical/High findings #1–#5 — handled in task 174.
- The onboarding customer-ID widening itself — implemented in task 174 (same finding family, `AskUserQuestion`-confirmed in this task's session but the code change lives in 174's file list).
- Second-sweep findings (customer_assets/customer_products RLS, unauthenticated adminClient routes) — not yet discovered at this point in the session; see tasks 176/177.
- Remaining MODERATE `pnpm audit` findings (`postcss`, `uuid`, `hono`/`@hono/node-server`) — all transitive dev-tool dependencies (shadcn CLI's MCP SDK, PostCSS build chain), not present in the runtime request path; left unaddressed per scope (nothing beyond HIGH/CRITICAL was requested).

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/route.ts` | Modify | Mandatory HMAC verification; stopped logging raw body |
| `src/app/api/upload/route.ts` | Modify | Dropped `image/svg+xml`; added product allowlist + customer-existence check |
| `src/app/api/ops-chat/route.ts` | Modify | Sanity MCP tools now conditional on `isStaff` (`admin`/`pm`) |
| `package.json` | Modify | Added `pnpm.overrides` for `sharp`, `serialize-javascript`, `brace-expansion`, `js-yaml`, `fast-uri`; `xlsx` repointed to `https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz` (resolved `0.20.3`) |

## Implementation Notes

### What Changed
- Webhook route: signature check moved before payload parsing; a missing `ZOHO_WEBHOOK_SECRET` now logs `console.error` and returns `{received: true}` (200, matching Zoho's own retry-avoidance convention used elsewhere in the same file) without processing the payload, instead of silently treating "no secret configured" as "allow all."
- Upload route: added a `VALID_PRODUCTS` allowlist (matching the pattern already used in the onboarding PATCH route) and an `adminClient` lookup confirming `customerId` exists in `customers` before accepting the upload — both checks run before the file-type/size validation.
- ops-chat: introduced `isStaff = role === "admin" || role === "pm"`; the Sanity `createMCPClient()` call and resulting `mcpTools` are now `null`/`{}` for non-staff callers, so the merged `tools: { ...localTools, ...mcpTools }` object never contains Sanity write tools for a `client`/`developer`/`hr` session regardless of what the user asks the assistant to do.
- `xlsx`: SheetJS stopped publishing patched builds to the npm registry past `0.18.5` (moved to their own CDN); confirmed via `pnpm view xlsx versions` that npm tops out there. Verified the CDN tarball resolves (`curl -sIL`) before installing via `pnpm add xlsx@https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`, landing on `0.20.3` — past both the prototype-pollution (<0.19.3) and ReDoS (<0.20.2) fix thresholds. Usage confirmed limited to `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx`, a pm/admin-gated Excel import.
- Transitive deps: confirmed via `pnpm why <pkg> --prod` that `sharp` (Next.js image optimization, peer-resolved), `serialize-javascript`/`brace-expansion`/`js-yaml`/`fast-uri` (all build-tooling transitive deps — `@ducanh2912/next-pwa`'s workbox-build/webpack chain, `shadcn` CLI's `cosmiconfig`) had patched versions available; added `pnpm.overrides` to force resolution. `brace-expansion` needed a blanket override (`">=5.0.7"`) rather than range-scoped overrides — the range-keyed attempt (`"brace-expansion@>=3.0.0 <5.0.7"`) left some transitive instances unpatched; the blanket form fully resolved it.
- `role-access.ts`: no code change. Decision captured via `AskUserQuestion` — recommended option ("leave as-is") selected by user.

### Deviations From Plan
- None. All items resolved as scoped; the one open design question (`role-access.ts` default) was explicitly surfaced and resolved via `AskUserQuestion` rather than assumed.

### Verification Run
- `npx tsc --noEmit` — PASS after every edit.
- `pnpm audit --prod` — HIGH/CRITICAL count: 17 (post-task-174 baseline, before this task's dependency fixes) → 0 after `next` (task 174) + `xlsx` CDN swap + `pnpm.overrides` (this task). 6 MODERATE advisories remain, all transitive dev-tooling, explicitly out of scope (see above).
- No live browser verification — all changes are server-side API logic, dependency resolution, or non-UI config; no UI surface was touched.
