-- WebriQ Central Hub — Sprint 5
-- Migration 015: Reply drafts — PM-reviewed client updates before Cliq send (M8)

create table if not exists reply_drafts (
  id                  uuid primary key default gen_random_uuid(),
  classification_id   uuid not null
                        references classification_records(id) on delete cascade,
  customer_id         text not null
                        references customers(customer_id) on delete cascade,
  execution_record_id uuid
                        references execution_records(id) on delete cascade,
  draft_content       text not null,
  pm_edited_content   text,
  pm_diff             text,
  status              text not null default 'DRAFT'
                        check (status in ('DRAFT', 'SENT', 'DISCARDED')),
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_reply_drafts_classification_id
  on reply_drafts (classification_id);

create index if not exists idx_reply_drafts_customer_id
  on reply_drafts (customer_id);

alter table reply_drafts enable row level security;

create policy "authenticated_read_reply_drafts"
  on reply_drafts for select to authenticated using (true);

create policy "authenticated_write_reply_drafts"
  on reply_drafts for all to authenticated using (true) with check (true);
