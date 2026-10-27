-- Keeps the old Oracle system's ids next to the new rows, so the import can be re-run safely
-- and later modules (customers, invoices, receipts) can be linked to the right products and locations.
alter table products    add column if not exists ora_pcode int unique;
alter table products    add column if not exists legacy jsonb;      -- old price columns (OP, RATEA/B/C, ...) so nothing is lost
alter table price_lists add column if not exists ora_catid int unique;
alter table companies   add column if not exists ora_deptid int unique;
alter table brands      add column if not exists ora_genid int unique;
alter table locations   add column if not exists ora_ccode int unique;
alter table app_users   add column if not exists ora_collectorid int unique;
