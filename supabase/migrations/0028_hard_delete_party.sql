-- Hard delete a customer or a supplier together with everything that belongs to them.
-- Needs 0027. Both functions are all-or-nothing and do nothing until p_force is true: without it they only
-- return what would be deleted ({ needs_confirm: true, ...counts }) so the screen can ask first.
-- Stock is NOT touched: stock movements made by deleted invoices or purchases stay as they are.

-- ---------- customer: invoices, payments, returns, salesman requests, ledger, remarks, visits ----------
create or replace function delete_customer(p_customer uuid, p_force boolean default false) returns jsonb
language plpgsql as $$
declare
  c customers%rowtype;
  n_sales int; n_pay int; n_ret int; n_req int; v_bal numeric;
begin
  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Customer not found.'; end if;
  if c.is_walk_in then raise exception 'The walk-in customer cannot be deleted.'; end if;
  select count(*) into n_sales from sales where customer_id = c.id;
  select count(*) into n_pay   from payments where customer_id = c.id;
  select count(*) into n_ret   from sale_returns r join sales s on s.id = r.sale_id where s.customer_id = c.id;
  select (select count(*) from order_requests where customer_id = c.id)
       + (select count(*) from payment_requests where customer_id = c.id)
       + (select count(*) from return_requests where customer_id = c.id) into n_req;
  select coalesce(sum(amount), 0) into v_bal from customer_ledger where customer_id = c.id;
  if not p_force then
    return jsonb_build_object('deleted', false, 'needs_confirm', true, 'name', c.name, 'code', c.code, 'balance', v_bal,
      'invoices', n_sales, 'payments', n_pay, 'returns', n_ret, 'requests', n_req);
  end if;

  update market_purchases set sale_id = null where sale_id in (select id from sales where customer_id = c.id);
  delete from return_requests  where customer_id = c.id;
  delete from payment_requests where customer_id = c.id;
  delete from order_requests   where customer_id = c.id;
  delete from sale_return_lines where return_id in (select r.id from sale_returns r join sales s on s.id = r.sale_id where s.customer_id = c.id);
  delete from sale_returns where sale_id in (select id from sales where customer_id = c.id);
  delete from payments where customer_id = c.id;
  delete from sales where customer_id = c.id;
  delete from customers where id = c.id;   -- ledger, remarks, phones, groups, route history and visits go with it
  return jsonb_build_object('deleted', true, 'name', c.name);
end $$;

-- ---------- supplier: purchases, payments, returns, purchase orders, ledger ----------
create or replace function delete_supplier(p_supplier uuid, p_force boolean default false) returns jsonb
language plpgsql as $$
declare
  s suppliers%rowtype;
  n_pur int; n_pay int; n_ret int; n_po int; v_bal numeric;
begin
  select * into s from suppliers where id = p_supplier for update;
  if not found then raise exception 'Supplier not found.'; end if;
  select count(*) into n_pur from purchases where supplier_id = s.id;
  select count(*) into n_pay from supplier_payments where supplier_id = s.id;
  select count(*) into n_ret from purchase_returns r join purchases p on p.id = r.purchase_id where p.supplier_id = s.id;
  select count(*) into n_po  from purchase_orders where supplier_id = s.id;
  select coalesce(sum(amount), 0) into v_bal from supplier_ledger where supplier_id = s.id;
  if not p_force then
    return jsonb_build_object('deleted', false, 'needs_confirm', true, 'name', s.name, 'code', s.code, 'balance', v_bal,
      'purchases', n_pur, 'payments', n_pay, 'returns', n_ret, 'orders', n_po);
  end if;

  delete from purchase_return_lines where return_id in (select r.id from purchase_returns r join purchases p on p.id = r.purchase_id where p.supplier_id = s.id);
  delete from purchase_returns where purchase_id in (select id from purchases where supplier_id = s.id);
  delete from supplier_payments where supplier_id = s.id;
  delete from purchases where supplier_id = s.id;
  delete from purchase_orders where supplier_id = s.id;   -- their items go with them
  delete from suppliers where id = s.id;                  -- ledger and product links go with it
  return jsonb_build_object('deleted', true, 'name', s.name);
end $$;

revoke all on function delete_customer(uuid, boolean) from public, anon, authenticated;
revoke all on function delete_supplier(uuid, boolean) from public, anon, authenticated;
