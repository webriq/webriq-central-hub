# 015: Wire Cliq Webhook Token into sendCliqNotification

**Created:** 2026-05-21
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-05-21

---

## Overview

`sendCliqNotification()` in `src/lib/zoho/index.ts` was stubbed to POST to `ZOHO_CLIQ_WEBHOOK_URL` but never included authentication. The Zoho Cliq Webhook Token approach has now been confirmed working — the token is stored in `.env` as `ZOHO_CLIQ_WEBHOOK_TOKEN` and must be appended as `?zapikey=<token>` to the URL.

## Requirements

- [ ] `sendCliqNotification` appends `?zapikey=${ZOHO_CLIQ_WEBHOOK_TOKEN}` to the URL before fetching
- [ ] Gracefully no-ops if either env var is missing (don't throw)
- [ ] Remove the stale "no-op until configured" comment

## Out of Scope / Must-Not-Change

- The function signature — callers (`src/lib/ai/classify.ts`) must not change
- OAuth token env vars (`ZOHO_CLIQ_ACCESS_TOKEN`, etc.) — already removed from `.env`
- Any other function in `src/lib/zoho/index.ts`

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/zoho/index.ts` | Modify | Append zapikey to webhook URL |

## Code Context

### File: `src/lib/zoho/index.ts` (lines 69–83)

```ts
// Cliq incoming webhook notification — no-op until ZOHO_CLIQ_WEBHOOK_URL is configured (O12)
export async function sendCliqNotification(message: string): Promise<void> {
  const url = process.env.ZOHO_CLIQ_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    console.error("[cliq] notification failed:", err instanceof Error ? err.message : err);
  }
}
```

**Target change:** build the final URL as:
```ts
const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
const token = process.env.ZOHO_CLIQ_WEBHOOK_TOKEN;
if (!webhookUrl || !token) return;
const url = `${webhookUrl}?zapikey=${token}`;
```

### Caller (no change needed): `src/lib/ai/classify.ts` lines 111–118

```ts
if (
  classificationResult?.priority === "CRITICAL" ||
  classificationResult?.priority === "HIGH"
) {
  await sendCliqNotification(
    `${classificationResult.priority === "CRITICAL" ? "🔴 CRITICAL" : "🟠 HIGH"} task classified: "${title}" (${classificationResult.task_type}) — Customer: ${customerId} — Confidence: ${classificationResult.confidence_score}% — ID: ${record.id}`
  );
}
```

## Implementation Steps

1. Open `src/lib/zoho/index.ts`
2. In `sendCliqNotification`, replace the current URL read with:
   ```ts
   const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
   const token = process.env.ZOHO_CLIQ_WEBHOOK_TOKEN;
   if (!webhookUrl || !token) return;
   const url = `${webhookUrl}?zapikey=${token}`;
   ```
3. Remove the stale comment on line 69

## Acceptance Criteria

- [ ] `sendCliqNotification("test")` posts to the correct URL with `?zapikey=...`
- [ ] Function returns silently if either env var is absent
- [ ] `npx tsc --noEmit` passes with no errors

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual: trigger a test webhook POST to `/api/webhooks` with a HIGH priority payload and confirm a message appears in `#Central Hub App` in Zoho Cliq.

## Compatibility Touchpoints

- No API surface change — callers unaffected
