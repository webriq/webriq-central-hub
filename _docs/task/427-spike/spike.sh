#!/usr/bin/env bash
# Task 427 spike helper — runs SQL against the LOCAL disposable Supabase stack ONLY.
#   _docs/task/427-spike/spike.sh -c "select 1"        # inline SQL
#   _docs/task/427-spike/spike.sh -f path/to/file.sql  # a file
# Refuses to run if the repo's live Supabase project ref appears anywhere in the target, or if the target
# host is not loopback. Never reads the DB password from .env; uses the local stack's default.
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB_URL="${SPIKE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
LIVE_REF="$(grep -oE 'https://[a-z0-9]+\.supabase\.co' .env 2>/dev/null | head -1 | sed -E 's#https://([a-z0-9]+)\..*#\1#' || true)"
if [[ -n "$LIVE_REF" && "$DB_URL" == *"$LIVE_REF"* ]]; then echo "REFUSING: target contains the live project ref." >&2; exit 2; fi
if [[ "$DB_URL" != *"127.0.0.1"* && "$DB_URL" != *"localhost"* ]]; then echo "REFUSING: target is not loopback ($DB_URL)." >&2; exit 2; fi
exec psql "$DB_URL" -X -v ON_ERROR_STOP=1 -P pager=off "$@"
