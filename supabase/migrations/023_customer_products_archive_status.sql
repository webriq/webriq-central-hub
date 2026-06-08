-- Expand customer_products.status CHECK constraint to allow 'archived' for soft-delete.
ALTER TABLE customer_products DROP CONSTRAINT IF EXISTS customer_products_status_check;
ALTER TABLE customer_products ADD CONSTRAINT customer_products_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));
