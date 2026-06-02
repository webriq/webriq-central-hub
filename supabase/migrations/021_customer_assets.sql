create table if not exists customer_assets (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id) on delete cascade,
  type text not null check (type in ('file', 'link', 'credential')),
  label text not null,
  value text not null,
  masked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table customer_assets enable row level security;

create policy "Authenticated users can manage customer assets"
  on customer_assets for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
