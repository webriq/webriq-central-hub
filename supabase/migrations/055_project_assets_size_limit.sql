-- Migration 055: raise project-assets bucket file_size_limit (task 114 live-run fix)
-- Task 106 set 50MB (migration 050) — sufficient for its 40-file Task attachments dataset.
-- Issue attachments include files up to 118.9MB (confirmed via live export metadata:
-- Screen Recording 2026-01-20 175721.mp4), so 50MB rejects several real uploads with
-- "The object exceeded the maximum allowed size". Raised to 200MB for headroom.

update storage.buckets
set file_size_limit = 209715200 -- 200MB
where id = 'project-assets';
