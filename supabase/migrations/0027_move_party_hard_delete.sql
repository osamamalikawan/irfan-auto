-- Move a customer to the suppliers list (and back), and hard delete routes and price lists.
-- Needs 0001-0026.
--
-- Moving copies the contact details into a new record on the other side and archives the old one.
-- Invoices, payments and purchases stay with the old (archived) record, so history is never rewritten.
-- A move is refused while the old record has a balance, so nothing is counted twice in Accounts.

-- ---------- customer -> supplier ----------
create or replace function move_customer_to_supplier(p_customer uuid, p_user uuid) returns uuid
language plpgsql as $$
declare
  c customers%rowtype;
  bal numeric;
  v_city text;
  v_extra text;
  v_notes text;
  sp_id uuid;
  sp_code text;
begin
  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Customer not found.'; end if;
  if c.is_walk_in then raise exception 'The walk-in customer cannot be moved.'; end if;

  select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
  if bal <> 0 then
    raise exception 'This customer has a balance of Rs %. Settle it to zero before moving them to suppliers.', to_char(abs(bal), 'FM999,999,999,990.00');
  end if;
  if exists (select 1 from suppliers where lower(name) = lower(c.name)) then
    raise exception 'A supplier called "%" already exists. Rename one of them first.', c.name;
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
  returning id, code into sp_id, sp_code;

  update customers set status = 'archived', updated_at = now() where id = c.id;
  insert into customer_remarks (customer_id, text, by_user, by_name)
  values (c.id, 'Moved to suppliers as ' || sp_code, p_user, coalesce((select name from app_users where id = p_user), 'System'));
  return sp_id;
end $$;

-- ---------- supplier -> customer ----------
create or replace function move_supplier_to_customer(p_supplier uuid) returns uuid
language plpgsql as $$
declare
  s suppliers%rowtype;
  bal numeric;
  n_po int;
  v_p1 text;
  v_p2 text;
  cu_id uuid;
  cu_code text;
begin
  select * into s from suppliers where id = p_supplier for update;
  if not found then raise exception 'Supplier not found.'; end if;

  select coalesce(sum(amount), 0) into bal from supplier_ledger where supplier_id = s.id;
  if bal <> 0 then
    raise exception 'This supplier has a balance of Rs %. Settle it to zero before moving them to customers.', to_char(abs(bal), 'FM999,999,999,990.00');
  end if;
  select count(*) into n_po from purchase_orders where supplier_id = s.id and status = 'open';
  if n_po > 0 then
    raise exception 'This supplier has % open purchase order(s). Receive or cancel them first.', n_po;
  end if;

  v_p1 := nullif(trim(coalesce(s.phone, '')), '');
  v_p2 := nullif(trim(coalesce(s.phone2, '')), '');
  if v_p2 = v_p1 then v_p2 := null; end if;

  insert into customers (name, name_ur, owner, phone, phone2, phone_search, address, ntn, email, credit_days)
  values (s.name, s.name_ur, s.contact, v_p1, v_p2, nullif(concat_ws(' ', v_p1, v_p2), ''), s.address, s.ntn, s.email, s.credit_days)
  returning id, code into cu_id, cu_code;
  if v_p1 is not null then insert into customer_phones (customer_id, phone, position) values (cu_id, v_p1, 0); end if;
  if v_p2 is not null then insert into customer_phones (customer_id, phone, position) values (cu_id, v_p2, 1); end if;

  update suppliers
     set status = 'archived', updated_at = now(),
         notes = concat_ws(E'\n', nullif(notes, ''), 'Moved to customer ' || cu_code)
   where id = s.id;
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
