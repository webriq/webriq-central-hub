# 328: Ticket Conversation — Map Thread Authors & Comment Commenters to Hub Users, Show Exact Name + Avatar

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed (2026-08-28)

---

## Completion Note

Marked complete at the user's explicit request after implementation + quality gate, **skipping
the `test` and `document` stages**.

- Verified: `npx tsc --noEmit`, `pnpm lint`, `pnpm build` all pass; simplify quality gate PASS
  with no required fixes.
- **Not verified:** browser acceptance against Zoho Desk — names and avatars/initials on
  TKT-20994 (the screenshot's ticket) and a ticket with `NON_DESK_USER` comment commenters.
  Requires a live dev server + Supabase data, unavailable this session. The specific things to
  eyeball when a live environment is available:
  - `NON_DESK_USER` comment rows show the real person's name, never `"Staff"`.
  - Agents whose `profiles` row has an `avatar_url` render the photo; everyone else a
    two-letter monogram (single-word names like "WebriQ" → "WE", not "W").
  - Collapsed and expanded rows show the same avatar; Threads/Comments counts & ordering
    unchanged.

---

## Overview

On the ticket detail page (`/desk/tickets/[ticketId]`), the Conversations / Threads / Comments
feed shows each message with a one-letter monogram and, for many rows, the literal text
**"Staff"** instead of the person's name (see screenshot: _"Roseller Enriquez has updated the
status…"_ rendered under the name **Staff**). Zoho Desk itself (target screenshot) shows the
real agent name and their profile photo.

Two defects, both fixable at render time in `page.tsx` — **no re-import required**, because the
importers already persist the raw author identity in `source_meta`:

1. **Name.** `page.tsx` only reads `source_meta.author.name` (written by the **threads**
   importer). The **comments** importer writes `source_meta.commenter` (never `author`), so for
   every imported comment `importedAuthorName` is `null`. It then falls back to
   `staffByAuthorId.get(author_id)` → but `author_id` is `null` whenever the commenter had no
   email on the Zoho side, which is the case for all 467 `NON_DESK_USER` commenters (the WebriQ
   dev team commenting from Zoho Projects — Renato Dulog, Roseller Enriquez, Kenet Medez, …).
   Final fallback: the string `"Staff"`.

2. **Avatar.** `MessageCard` renders only `m.authorName.slice(0, 1)` in a grey circle. There is
   no avatar `<img>` at all, and no two-initial fallback.

### Data confirmed from the export files

`_from_zoho/desk-threads.json` (1,167 rows) — each row has `author: { name, email, photoURL, type }`
where `type ∈ { END_USER, AGENT }` (71 rows have no author). `photoURL` present on ~53%.

`_from_zoho/desk-ticket-comments.json` (1,118 rows) — each row has
`commenter: { id, name, email, photoURL, type, firstName, lastName, roleName }` where
`type ∈ { AGENT: 649, NON_DESK_USER: 467, END_USER: 2 }`.
- `AGENT` rows carry a real `email` (`helpdesk@webriq.us`, `nina.baraquil@webriq.services`,
  `april.trocio@webriq.services`).
- `NON_DESK_USER` rows have `email: null` — the only usable identity key is `commenter.name`.
  (`commenter.id` is a useless constant `300063000045574011` repeated across different people.)

Zoho `photoURL` values point at `desk.zoho.com/supportapi/...` and
`profile.zoho.com/file/download?...&API=true` — both are **auth-gated** (same failure class as
the Zoho Desk inline images handled by `absolutizeZohoDeskInlineImages`) and must **not** be
used as `<img src>`. Avatars come from a matched Hub `profiles.avatar_url` (already re-hosted
into the public `user-avatars` Supabase bucket by task 288) or fall back to initials.

## Requirements

- [ ] Every message row (thread or comment) shows the **exact author name** Zoho recorded —
      never the literal `"Staff"`, never a bare email when a name exists.
- [ ] When the author resolves to a Hub user (`profiles`) **with** an `avatar_url`, show that
      avatar image (round, `object-cover`).
- [ ] Otherwise show a **two-character initial** monogram with a deterministic background color
      (matches the `AvatarStack` convention: first letter of the first two words; for a
      single-word name, the first two letters; uppercase).
- [ ] Applies to Hub staff, Hub clients, and unmatched external senders alike (initials for the
      last two, per the request).
- [ ] `authorName` resolution order for a **staff/agent** row:
      `source_meta.author.name` → `source_meta.commenter.name` → matched `profiles.full_name`
      → matched `desk_agents.full_name` → `"Staff"` (true last resort only).
- [ ] `authorName` resolution order for a **client** row:
      `source_meta.author.name` → `source_meta.commenter.name` → resolved ticket `contactName`.
- [ ] Avatar match cascade (staff rows): existing `author_id` → `profiles` by email
      (`source_meta.author.email` / `source_meta.commenter.email`, lowercased) → `profiles` by
      normalized `full_name` (accent-stripped, lowercased, whitespace-collapsed) against the
      row's Zoho name. First hit with a non-null `avatar_url` wins; otherwise initials.
- [ ] `MessageItem.authorName` stays a plain non-null string (consumed by `_attachments-tab.tsx`).

## Out of Scope / Must-Not-Change

- **No changes to the importers** (`api/admin/zoho-import/desk-threads/route.ts`,
  `api/admin/zoho-import/desk-ticket-comments/route.ts`) and **no re-import**. Everything needed
  is already in `source_meta`.
- **No new migration / no new DB column.** Do not add `avatar_url` to `desk_agents` or
  `contacts`. If a `desk_agents` row has no avatar, initials are the correct output.
- Do **not** use Zoho `photoURL` as an `<img src>` (auth-gated — would render broken images).
- Do not touch the Threads/Comments split logic, the `kind` derivation, tint/"Reply from us"
  label, collapse/expand behavior, or the reply/comment composers.
- `contacts` has no `avatar_url` and no reliable name→profile bridge — clients get initials.
  Do not build a client-avatar pipeline here.
- Fuzzy name matching beyond simple normalization (e.g. "Niña Anjerrie Baraquil" vs
  "Nina Baraquil") is out of scope — those rows are `AGENT` type and match by email anyway; any
  residual misses fall back to the (still correct) Zoho name + initials.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketId]/_resolve.ts` | Modify | Add `normalizeName()` and `initialsFrom()` + `AVATAR_COLORS`/`colorForName()` shared helpers (server + client safe — pure functions). |
| `src/app/(hub)/desk/tickets/[ticketId]/page.tsx` | Modify | Build a profile lookup keyed by id **and** lowercased email **and** normalized full_name; add a `desk_agents` name/email lookup; resolve `authorName` + new `avatarUrl` per message via the cascades above. |
| `src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx` | Modify | Add `avatarUrl: string \| null` to `MessageItem`; render `<img>` when present else a two-initial colored monogram (both in the expanded header **and** the collapsed row — same `Avatar` sub-component). |
| `src/app/(hub)/desk/tickets/[ticketId]/_attachments-tab.tsx` | Modify (minimal) | Only if the local `MessageItem` structural type needs the new optional field — keep `authorName` usage unchanged. |

## Code Context

### `page.tsx` — current message mapping (the bug)

```tsx
// staff lookup today: only by author_id (UUID), only full_name
const { data: staffProfiles } = await supabase.from("profiles").select("id, full_name").in("id", staffAuthorIds);
for (const p of staffProfiles ?? []) staffByAuthorId.set(p.id, p.full_name);

// ...
const importedAuthor = m.source_meta?.author as { name?: string } | null | undefined;   // ← undefined for comments
const importedAuthorName = typeof importedAuthor?.name === "string" && importedAuthor.name.trim()
  ? importedAuthor.name.trim() : null;
return {
  authorName:
    m.author_type === "staff"
      ? importedAuthorName ?? staffByAuthorId.get(m.author_id ?? "") ?? "Staff"   // ← "Staff"
      : importedAuthorName ?? contactName,
  // no avatarUrl
};
```

### Target mapping (new)

```tsx
// source_meta carries EITHER author (threads) OR commenter (comments) — same shape.
const idn = (m.source_meta?.author ?? m.source_meta?.commenter) as
  { name?: string; email?: string } | null | undefined;
const zohoName = idn?.name?.trim() || null;
const zohoEmail = idn?.email?.toLowerCase().trim() || null;

// profile match: author_id → email → normalized name
const prof =
  (m.author_id ? profileById.get(m.author_id) : null) ??
  (zohoEmail ? profileByEmail.get(zohoEmail) : null) ??
  (zohoName ? profileByNormName.get(normalizeName(zohoName)) : null) ??
  null;
const agent = zohoEmail ? deskAgentByEmail.get(zohoEmail)
            : zohoName ? deskAgentByNormName.get(normalizeName(zohoName)) : null;

const authorName =
  m.author_type === "staff"
    ? zohoName ?? prof?.full_name ?? agent?.full_name ?? "Staff"
    : zohoName ?? contactName;

const avatarUrl = prof?.avatar_url ?? null;
```

### `_conversation-thread.tsx` — reusable Avatar (replace the 1-letter circle at line ~140)

```tsx
function Avatar({ name, url, size = "md" }: { name: string; url: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6 text-[9px]" : "w-7 h-7 text-[11px]";
  if (url) {
    return (
      <span className={cn(dim, "rounded-full overflow-hidden shrink-0 bg-[#EDF0F7] inline-flex")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase user-avatars bucket URL, not a static asset */}
        <img src={url} alt={name} className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn(dim, "rounded-full flex items-center justify-center font-semibold text-white shrink-0")}
      style={{ background: colorForName(name) }}  // dynamic single color — lookup map, allowed per CLAUDE.md
    >
      {initialsFrom(name)}
    </span>
  );
}
```

### `_resolve.ts` — helpers to add (mirror `_v2-listing/_avatar-stack.tsx`)

```ts
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

export function normalizeName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function colorForName(name: string): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}
```

> Note on `style={{ background }}`: CLAUDE.md allows `style` for a computed single color where a
> static class map can't express it; `colorForName` returns one of 6 fixed hex values, matching
> the existing `AvatarStack` / `OwnerChip` precedent. Keep it consistent with those.

## Implementation Steps

1. Add `normalizeName`, `initialsFrom`, `colorForName`, `AVATAR_COLORS` to `_resolve.ts`.
2. In `page.tsx`:
   - Collect, per staff message, the candidate identity: `author_id`, plus
     `source_meta.author?.email/name` **or** `source_meta.commenter?.email/name`.
   - Widen the `profiles` query to `select("id, full_name, avatar_url")` and fetch by the union
     of: `author_id` list, lowercased email list, normalized-name list. (PostgREST can't `.in()`
     on a normalized expression — fetch by `full_name` in the raw name list, then bucket by
     `normalizeName(row.full_name)` client-side.)
   - Build `profileById`, `profileByEmail`, `profileByNormName` maps.
   - Fetch `desk_agents` (`external_id, full_name, email`) for the same email/name candidates;
     build `deskAgentByEmail` / `deskAgentByNormName`.
   - Replace the `authorName` ternary with the cascade above; add `avatarUrl`.
3. In `_conversation-thread.tsx`:
   - Add `avatarUrl: string | null` to `MessageItem`.
   - Add the `Avatar` sub-component; use it in `MessageCard` (expanded header uses `md`; keep
     the same element in the collapsed state — it already shares one header row).
   - Import `initialsFrom` / `colorForName` from `../_resolve`.
4. If `tsc` flags `_attachments-tab.tsx`'s local `MessageItem` pick, add `avatarUrl` there as
   optional or omit from the pick — do not change its `authorName` rendering.
5. Run verification (below).

## Acceptance Criteria

- [ ] On a ticket with comments from a `NON_DESK_USER` (e.g. search DB for a `ticket_messages`
      row whose `source_meta->commenter->>type = 'NON_DESK_USER'`), the row shows that person's
      real name (e.g. "Roseller Enriquez"), not "Staff".
- [ ] A comment/thread from a WebriQ agent whose `profiles` row has an `avatar_url` renders the
      avatar image; view it in the network tab loading from the `user-avatars` bucket.
- [ ] A client (`END_USER`) row and any unmatched sender show a **two-letter** monogram with a
      stable color, no broken-image icon.
- [ ] Single-word names ("WebriQ") render two letters ("WE"), not one.
- [ ] Collapsed and expanded rows show the same avatar.
- [ ] `npx tsc --noEmit`, `pnpm lint`, `pnpm build` all pass.
- [ ] No change to Threads/Comments counts, ordering, tint, or composer behavior (regression
      check on the same ticket used for task 323/324 acceptance).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build
# Browser: open /desk/tickets/TKT-20994 (the screenshot's ticket) and a ticket with
# NON_DESK_USER comments; confirm names + avatars/initials against Zoho Desk.
```

Optional DB spot-check (read-only, via Supabase SQL editor — no live access in this repo):

```sql
select source_meta->'commenter'->>'type' as ctype, count(*)
from ticket_messages
where source_meta ? 'commenter'
group by 1;
```

## Compatibility Touchpoints

- No packaging/adapter/install surface impact.
- No migration, no importer change, no env var.
- `MessageItem` gains one field — internal to the `[ticketId]` route; `_attachments-tab.tsx` is
  the only other consumer and only reads `authorName`.

## Implementation Notes

### What Changed
- Ticket conversation rows now resolve the **exact** author name and an avatar instead of
  falling through to the literal `"Staff"` with a one-letter monogram.
- `_resolve.ts` (at `desk/tickets/_resolve.ts`, not `[ticketId]/_resolve.ts` as the plan wrote
  it — corrected) gained three pure, server+client-safe helpers: `normalizeName`,
  `initialsFrom`, `colorForName`, plus the `AVATAR_COLORS` palette.
- `[ticketId]/page.tsx`: added `identityOf(m)` which folds `source_meta.author` (threads) **or**
  `source_meta.commenter` (comments) into a single `{ name, email }`. Built three lookups —
  `profileById` (by `author_id`), `profileByNormName` (by exact `profiles.full_name`, bucketed
  on the normalized key — the only key available for import-unmatched `NON_DESK_USER`
  commenters since `profiles` has no email column), and `deskAgentByEmail` / `deskAgentByNormName`
  (name/email safety net, no avatar). Per-message resolution cascade:
  staff → `zohoName ?? matched profile.full_name ?? matched desk_agent.full_name ?? "Staff"`;
  client → `zohoName ?? contactName`. `avatarUrl = matched profile.avatar_url ?? null`
  (staff rows only — avoids a same-name client colliding onto a staff photo).
- `_conversation-thread.tsx`: `MessageItem` gained `avatarUrl: string | null`; new `Avatar`
  sub-component renders the `<img>` (round, `object-cover`) when a URL is present else a
  two-initial monogram with `colorForName` background; replaced the old
  `authorName.slice(0,1)` circle in `MessageCard` (shared by the collapsed + expanded header,
  so both states get it).
- Zoho `photoURL` deliberately not used anywhere — auth-gated, would render broken images.

### Files Changed
- `src/app/(hub)/desk/tickets/_resolve.ts` — added `normalizeName` / `initialsFrom` /
  `colorForName` / `AVATAR_COLORS`.
- `src/app/(hub)/desk/tickets/[ticketId]/page.tsx` — identity fold + profile/desk_agent
  lookups + name/avatar resolution cascade.
- `src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx` — `MessageItem.avatarUrl`,
  `Avatar` component, `MessageCard` uses it.

### Deviations From Plan
- Plan referenced the helper file as `[ticketId]/_resolve.ts`; the actual shared file is one
  level up at `desk/tickets/_resolve.ts` (imported as `../_resolve` from both `page.tsx` and
  `_conversation-thread.tsx`). No functional change.
- `_attachments-tab.tsx` needed no edit — its `MessageItem` structural use only touches
  `attachments` / `authorName` / `createdAt`; the new optional-looking field is additive.
- Did not add a name-based `profiles` email lookup (plan's "by email" step) — `profiles` has no
  email column in this codebase; the importer's `author_id` already covers every email-matched
  row, and name matching covers the rest.

### Verification Run
- `npx tsc --noEmit` — PASS (clean)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm build` — PASS
- Browser acceptance (names/avatars vs Zoho Desk on TKT-20994 + a NON_DESK_USER-comment
  ticket) — NOT RUN (no live dev server / DB access in this session); handed to `test` stage.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Helpers in `_resolve.ts` are pure and safe for the shared server+client
  import; no `"use client"`/`"use server"` needed.
- `identityOf` narrows `source_meta` via `{ name?: unknown; email?: unknown }` + `typeof`
  guards — no `any`. The `data as ProfileLite[]` casts match the file's existing supabase-row
  cast style (`as MessageRow[]`, `as TicketDetailRow`).
- `Avatar`'s `style={{ background: colorForName(name) }}` matches the shipped
  `_v2-listing/_avatar-stack.tsx` monogram convention (computed hex not in the Tailwind
  palette; CLAUDE.md's "don't refit existing files to the rejected rule" applies).
- `<img>` has no `onError` fallback — consistent with every other `avatar_url` render site in
  the codebase (nav bell, issue/task detail, `_avatar-stack.tsx`); URLs are public-bucket
  re-hosts.
- Simplify pass tightened `page.tsx`: destructured `zohoEmail` (removed an `as string` cast),
  hoisted `isStaff`, corrected the `profileByNormName` comment to not overstate what the exact
  `.in("full_name", …)` match does.

### Deviations
- **Minor** — shared helper file is `desk/tickets/_resolve.ts`, not `[ticketId]/_resolve.ts`
  as the plan wrote it (imported `../_resolve` from both consumers). No functional impact.
- **Minor** — plan's "match `profiles` by email" step dropped: `profiles` has no email column
  in this schema; `author_id` already covers import-email-matched rows and `full_name` covers
  the rest. Documented in Implementation Notes.
- **Minor** — `_attachments-tab.tsx` left untouched (plan flagged it "if needed"); its
  structural `MessageItem` use only reads `attachments`/`authorName`/`createdAt`.

### Required Fixes
- None.
