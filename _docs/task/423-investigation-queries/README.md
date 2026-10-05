# Task 423 — read-only investigation scripts

Read-only (`select` / Realtime subscribe only; nothing is written). They use the project's own `.env`
(service key) and print aggregates only (no row data / PII). Run from the repo root:

    node --experimental-websocket --env-file=.env _docs/task/423-investigation-queries/01-match-and-status-counts.mjs
    node --experimental-websocket --env-file=.env _docs/task/423-investigation-queries/02-orphans-and-unmatched.mjs

(`--experimental-websocket` is needed on Node 20 because supabase-js's Realtime client is constructed even
for plain selects.) The `.mjs` files must be copied/run from the repo root so `@supabase/supabase-js` resolves.

`00-realtime-probe-NAIVE-DO-NOT-TRUST.mjs` is kept as a cautionary example: a subscribe status of `SUBSCRIBED`
is returned even for a nonexistent table. The correct probe listens for the server's `system` message
(`ok: Subscribed to PostgreSQL` vs `error: Unable to subscribe to changes with given parameters…`) and must be run
with a known-published positive control (`customer_products`) and a nonexistent-table negative control.
Findings were recorded in the task doc; counts are a point-in-time snapshot (2026-10-05).
