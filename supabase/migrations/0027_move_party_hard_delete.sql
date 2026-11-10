-- Move a party between customers and suppliers, and hard delete routes and price lists.
-- Needs 0001-0026.
--
-- Moving CONVERTS the account, it does not archive it. Everything is re-labelled to the other side and the old
-- record is deleted, all in one transaction (any problem undoes the whole move):
--   customer -> supplier:  sales invoices become purchases, payments received become payments made, sale returns
--                          become purchase returns, the ledger is copied entry by entry
--   supplier -> customer:  the same, the other way round
-- Ledger amounts keep their sign, so the balance number stays exactly the same (a customer who owed us 5,000 becomes
-- a supplier we owe 5,000 - that is what "their invoices are our purchases" means).
-- Stock is NOT touched: the documents are only re-labelled, no stock movements are added or removed.
-- Each document keeps its id, so ledger entries still point at the right document.

-- ---------- purchase returns (goods we send back to a supplier; filled by moves, no screen yet) ----------
create sequence if not exists purchase_return_no_seq;
create table if not exists purchase_returns (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('PRT-' || lpad(nextval('purchase_return_no_seq')::text, 4, '0')),
  purchase_id uuid not null references purchases(id),
  return_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  amount numeric(14,2) not null default 0,
  damaged boolean not null default false,
  reason text,
  kind text not null default 'return' check (kind in ('return', 'claim')),
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists purchase_returns_purchase_idx on purchase_returns (purchase_id);
create table if not exists purchase_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references purchase_returns(id) on delete cascade,
  purchase_item_id uuid not null references purchase_items(id),
  product_id uuid not null references products(id),
  name text not null,
  qty numeric(14,3) not null check (qty > 0),
  amount numeric(14,2) not null
);
alter table purchase_returns      enable row level security;
alter table purchase_return_lines enable row level security;

-- ---------- customer -> supplier ----------
create or replace function move_customer_to_supplier(p_customer uuid, p_user uuid) returns uuid
language plpgsql as $$
declare
  c customers%rowtype;
  v_city text;
  v_extra text;
  v_notes text;
  v_loc uuid;
  n int;
  sp_id uuid;
begin
  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Customer not found.'; end if;
  if c.is_walk_in then raise exception 'The walk-in customer cannot be moved.'; end if;
  if exists (select 1 from suppliers where lower(name) = lower(c.name)) then
    raise exception 'A supplier called "%" already exists. Rename one of them first.', c.name;
  end if;
  select (select count(*) from order_requests where customer_id = c.id)
       + (select count(*) from payment_requests where customer_id = c.id)
       + (select count(*) from return_requests where customer_id = c.id) into n;
  if n > 0 then
    raise exception 'This customer has % salesman request(s) (orders, payments or returns), which cannot move to a supplier.', n;
  end if;
  select id into v_loc from locations where active order by sell_priority, name limit 1;
  if v_loc is null and exists (select 1 from sales where customer_id = c.id) then
    raise exception 'Add a stock location first (purchases need one).';
  end if;

  select ci.name into v_city from areas a join cities ci on ci.id = a.city_id where a.id = c.area_id;
  select string_agg(x.phone, ', ' order by x.position) into v_extra
    from (select phone, position from customer_phones where customer_id = c.id order by position offset 2) x;
  v_notes := 'Moved from customer ' || c.code;
  if nullif(trim(coalesce(c.cnic, '')), '') is not null then v_notes := v_notes || '. CNIC ' || trim(c.cnic); end if;
  if v_extra is not null then v_notes := v_notes || '. Other numbers: ' || v_extra; end if;
  v_notes := v_notes || '.';

  insert into suppliers (name, name_ur, contact, phone, phone2, address, city, ntn, email, credit_days, notes)
  values (c.name, c.name_ur, c.owner, c.phone, c.phone2, c.address, v_city, c.ntn, c.email, c.credit_days, v_notes)
  returning id into sp_id;

  -- sales invoices -> purchases (same id; the invoice number is kept as the supplier's bill number)
  insert into purchases (id, purchase_date, supplier_id, supplier_name, supplier_inv_no, supplier_inv_date, location_id,
                         discount, line_discount, freight, total, paid, remarks, status, created_by, created_at, cancelled_at)
  select s.id, s.sale_date, sp_id, c.name, s.no, s.sale_date,
         coalesce((select a.location_id from sale_item_allocs a join sale_items i on i.id = a.sale_item_id
                    where i.sale_id = s.id order by a.qty desc limit 1), v_loc),
         s.discount, s.line_discount, s.bilti + coalesce(s.local_charges, 0), s.total, s.paid, s.remarks, s.status,
         s.created_by, s.created_at, s.cancelled_at
    from sales s where s.customer_id = c.id order by s.created_at, s.no;
  insert into purchase_items (id, purchase_id, line_no, product_id, name, qty, free, cost, disc_pct, line_disc)
  select i.id, i.sale_id, i.line_no, i.product_id, i.name, i.qty, i.free, i.price, i.disc_pct, i.line_disc
    from sale_items i join sales s on s.id = i.sale_id where s.customer_id = c.id;

  -- payments received -> payments made
  insert into supplier_payments (id, pay_date, supplier_id, amount, method, note, purchase_id, reversed, created_by, created_at)
  select p.id, p.pay_date, sp_id, p.amount,
         case lower(coalesce(p.method, 'cash')) when 'bank' then 'bank' when 'cheque' then 'cheque' else 'cash' end,
         concat_ws(' - ', 'Moved from customer payment', nullif(p.method, '')),
         case when p.kind = 'invoice' then p.sale_id else null end, p.reversed, p.created_by, p.created_at
    from payments p where p.customer_id = c.id order by p.created_at;

  -- sale returns -> purchase returns
  insert into purchase_returns (id, purchase_id, return_date, amount, damaged, reason, kind, created_by, created_at)
  select r.id, r.sale_id, r.return_date, r.amount, r.damaged, r.reason, r.kind, r.created_by, r.created_at
    from sale_returns r join sales s on s.id = r.sale_id where s.customer_id = c.id order by r.created_at;
  insert into purchase_return_lines (id, return_id, purchase_item_id, product_id, name, qty, amount)
  select l.id, l.return_id, l.sale_item_id, l.product_id, l.name, l.qty, l.amount
    from sale_return_lines l join sale_returns r on r.id = l.return_id join sales s on s.id = r.sale_id where s.customer_id = c.id;

  -- ledger: same amounts, same signs
  insert into supplier_ledger (supplier_id, ts, entry_date, type, amount, ref, note)
  select sp_id, l.ts, l.entry_date,
         case l.type when 'invoice' then 'purchase' when 'payment' then 'payment' when 'return' then 'return'
                     when 'opening' then 'opening' else 'reversal' end,
         l.amount, l.ref, case when l.type = 'refund' then concat_ws(' - ', 'Refund', l.note) else l.note end
    from customer_ledger l where l.customer_id = c.id order by l.ts;

  -- remove the old customer side
  update market_purchases set sale_id = null where sale_id in (select id from sales where customer_id = c.id);
  delete from sale_return_lines where return_id in (select r.id from sale_returns r join sales s on s.id = r.sale_id where s.customer_id = c.id);
  delete from sale_returns where sale_id in (select id from sales where customer_id = c.id);
  delete from payments where customer_id = c.id;
  delete from sales where customer_id = c.id;
  delete from customers where id = c.id;
  return sp_id;
end $$;

-- ---------- supplier -> customer ----------
create or replace function move_supplier_to_customer(p_supplier uuid) returns uuid
language plpgsql as $$
declare
  s suppliers%rowtype;
  n int;
  v_p1 text;
  v_p2 text;
  cu_id uuid;
begin
  select * into s from suppliers where id = p_supplier for update;
  if not found then raise exception 'Supplier not found.'; end if;
  select count(*) into n from purchase_orders where supplier_id = s.id;
  if n > 0 then
    raise exception 'This supplier has % purchase order(s), which cannot move to a customer.', n;
  end if;

  v_p1 := nullif(trim(coalesce(s.phone, '')), '');
  v_p2 := nullif(trim(coalesce(s.phone2, '')), '');
  if v_p2 = v_p1 then v_p2 := null; end if;
  insert into customers (name, name_ur, owner, phone, phone2, phone_search, address, ntn, email, credit_days)
  values (s.name, s.name_ur, s.contact, v_p1, v_p2, nullif(concat_ws(' ', v_p1, v_p2), ''), s.address, s.ntn, s.email, s.credit_days)
  returning id into cu_id;
  if v_p1 is not null then insert into customer_phones (customer_id, phone, position) values (cu_id, v_p1, 0); end if;
  if v_p2 is not null then insert into customer_phones (customer_id, phone, position) values (cu_id, v_p2, 1); end if;

  -- purchases -> sales invoices (same id)
  insert into sales (id, sale_date, customer_id, customer_name, discount, line_discount, bilti, total, paid, remarks, status,
                     created_by, created_at, cancelled_at, sale_kind, pay_term, fulfil_status)
  select p.id, p.purchase_date, cu_id, s.name, p.discount, p.line_discount, p.freight, p.total, p.paid,
         concat_ws(' | ', 'Moved from purchase ' || p.no, case when p.supplier_inv_no is not null then 'bill ' || p.supplier_inv_no end, p.remarks),
         p.status, p.created_by, p.created_at, p.cancelled_at, 'ledger', 'credit',
         case when p.paid >= p.total then 'completed' else 'delivered' end
    from purchases p where p.supplier_id = s.id order by p.created_at, p.no;
  insert into sale_items (id, sale_id, line_no, product_id, name, qty, free, price, disc_pct, line_disc)
  select i.id, i.purchase_id, i.line_no, i.product_id, i.name, i.qty, i.free, i.cost, i.disc_pct, i.line_disc
    from purchase_items i join purchases p on p.id = i.purchase_id where p.supplier_id = s.id;

  -- payments made -> payments received
  insert into payments (id, pay_date, customer_id, amount, kind, sale_id, reversed, created_by, created_at, method, method_id)
  select sp.id, sp.pay_date, cu_id, sp.amount, case when sp.purchase_id is not null then 'invoice' else 'collection' end,
         sp.purchase_id, sp.reversed, sp.created_by, sp.created_at, initcap(sp.method),
         (select m.id from payment_methods m where lower(m.name) = sp.method limit 1)
    from supplier_payments sp where sp.supplier_id = s.id order by sp.created_at;

  -- purchase returns -> sale returns
  insert into sale_returns (id, sale_id, return_date, amount, damaged, reason, kind, created_by, created_at)
  select r.id, r.purchase_id, r.return_date, r.amount, r.damaged, r.reason, r.kind, r.created_by, r.created_at
    from purchase_returns r join purchases p on p.id = r.purchase_id where p.supplier_id = s.id order by r.created_at;
  insert into sale_return_lines (id, return_id, sale_item_id, product_id, name, qty, amount)
  select l.id, l.return_id, l.purchase_item_id, l.product_id, l.name, l.qty, l.amount
    from purchase_return_lines l join purchase_returns r on r.id = l.return_id join purchases p on p.id = r.purchase_id where p.supplier_id = s.id;

  -- ledger: same amounts, same signs
  insert into customer_ledger (customer_id, ts, entry_date, type, amount, ref, note)
  select cu_id, l.ts, l.entry_date,
         case l.type when 'purchase' then 'invoice' when 'payment' then 'payment' when 'return' then 'return'
                     when 'opening' then 'opening' else 'reversal' end,
         l.amount, l.ref, l.note
    from supplier_ledger l where l.supplier_id = s.id order by l.ts;

  -- remove the old supplier side
  delete from purchase_return_lines where return_id in (select r.id from purchase_returns r join purchases p on p.id = r.purchase_id where p.supplier_id = s.id);
  delete from purchase_returns where purchase_id in (select id from purchases where supplier_id = s.id);
  delete from supplier_payments where supplier_id = s.id;
  delete from purchases where supplier_id = s.id;
  delete from suppliers where id = s.id;
  return cu_id;
end $$;

-- ---------- hard delete a route ----------
-- Refused while active customers are on it. If it has history (invoices, payments ...), nothing is deleted until
-- p_force is true: the history stays but shows no route, and completed route runs are deleted with the route.
create or replace function delete_route(p_route uuid, p_force boolean default false) returns jsonb
language plpgsql as $$
declare
  r routes%rowtype;
  n_cust int; n_sales int; n_pay int; n_ret int; n_exp int; n_vis int; n_runs int;
begin
  select * into r from routes where id = p_route for update;
  if not found then raise exception 'Route not found.'; end if;
  select count(*) into n_cust from customers where route_id = r.id and status = 'active' and not is_walk_in;
  if n_cust > 0 then
    raise exception '% customer(s) are still on this route. Move them to another route first.', n_cust;
  end if;
  select count(*) into n_sales from sales where route_id = r.id;
  select count(*) into n_pay   from payments where route_id = r.id;
  select count(*) into n_ret   from sale_returns where route_id = r.id;
  select count(*) into n_exp   from expenses where route_id = r.id;
  select count(*) into n_vis   from visits where route_id = r.id;
  select count(*) into n_runs  from route_runs where route_id = r.id;
  if not p_force and (n_sales + n_pay + n_ret + n_exp + n_vis + n_runs) > 0 then
    return jsonb_build_object('deleted', false, 'needs_confirm', true, 'name', r.name,
      'sales', n_sales, 'payments', n_pay, 'returns', n_ret, 'expenses', n_exp, 'visits', n_vis, 'runs', n_runs);
  end if;
  delete from routes where id = r.id;
  return jsonb_build_object('deleted', true, 'name', r.name);
end $$;

-- ---------- hard delete a price list ----------
-- Products are never deleted: they stay and simply have no list. Routes that sold from the list go back to "Any".
-- If the list still has products or routes, nothing is deleted until p_force is true.
create or replace function delete_price_list(p_list uuid, p_force boolean default false) returns jsonb
language plpgsql as $$
declare
  l price_lists%rowtype;
  n_act int; n_del int; n_routes int;
begin
  select * into l from price_lists where id = p_list for update;
  if not found then raise exception 'List not found.'; end if;
  select count(*) into n_act    from products where list_id = l.id and active;
  select count(*) into n_del    from products where list_id = l.id and not active;
  select count(*) into n_routes from routes where list_id = l.id;
  if not p_force and (n_act + n_del + n_routes) > 0 then
    return jsonb_build_object('deleted', false, 'needs_confirm', true, 'name', l.name,
      'products', n_act, 'deleted_products', n_del, 'routes', n_routes);
  end if;
  delete from price_lists where id = l.id;
  return jsonb_build_object('deleted', true, 'name', l.name);
end $$;

revoke all on function move_customer_to_supplier(uuid, uuid) from public, anon, authenticated;
revoke all on function move_supplier_to_customer(uuid) from public, anon, authenticated;
revoke all on function delete_route(uuid, boolean) from public, anon, authenticated;
revoke all on function delete_price_list(uuid, boolean) from public, anon, authenticated;
