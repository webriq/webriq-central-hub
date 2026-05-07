-- ─── Add completed_percentage to customer_products ──────────────────────────
-- Stores real field-completion progress (0–100) per product so the PM
-- dashboard can show per-product bars without re-computing from onboarding_data.
alter table customer_products
  add column if not exists completed_percentage numeric(5,2) not null default 0
    check (completed_percentage >= 0 and completed_percentage <= 100);

-- ─── Enable Supabase Realtime for PM dashboard live-update subscription ──────
-- Allows the PM dashboard to receive UPDATE events as customers fill the form.
alter publication supabase_realtime add table customer_products;
