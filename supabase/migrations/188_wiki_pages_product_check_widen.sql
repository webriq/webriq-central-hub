-- Migration 188: widen wiki_pages_product_check to the 6 Wiki spaces (task 494)
--
-- Production 500s on Wiki Import / New Page with 23514 "violates check constraint
-- wiki_pages_product_check". Migration 149 was applied with task 395's original 4-value list
-- (StackShift | PublishForge | PipelineForge | CiteForge); task 399 later widened the check by
-- editing 149 in place, which never reached the database. This re-creates the check with the
-- current WIKI_PRODUCTS list (src/types/wiki.ts). Idempotent.
--
-- Legacy 'StackShift' rows (only possible under the old check, invisible in the UI since
-- WIKI_PRODUCTS has no plain 'StackShift') move to 'StackShift I' (task 494 D1).

begin;

-- Drop first: the old check itself rejects the 'StackShift I' remap value.
alter table wiki_pages drop constraint if exists wiki_pages_product_check;
update wiki_pages set product = 'StackShift I' where product = 'StackShift';
alter table wiki_pages add constraint wiki_pages_product_check
  check (product in ('PipelineForge', 'PublishForge', 'CiteForge', 'StackShift I', 'StackShift II', 'Citation Grader'));

commit;
