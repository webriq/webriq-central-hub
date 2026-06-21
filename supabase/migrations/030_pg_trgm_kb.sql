create extension if not exists pg_trgm;

-- Text-similarity KB lookup — no embedding/OpenAI required.
-- Uses pg_trgm similarity() on request_pattern; threshold typically 0.2–0.4.
create or replace function match_kb_by_text(
  query_text text,
  match_threshold float default 0.2,
  match_count int default 1
)
returns table (
  id text,
  request_pattern text,
  classification text,
  lane int,
  execution_steps jsonb,
  similarity float
)
language sql stable
as $$
  select * from (
    select
      e.id::text,
      e.request_pattern,
      e.classification,
      e.lane,
      e.execution_steps::jsonb,
      similarity(e.request_pattern, query_text) as similarity
    from kb_entries e
    where e.request_pattern is not null
  ) sub
  where sub.similarity > match_threshold
  order by sub.similarity desc
  limit match_count;
$$;
