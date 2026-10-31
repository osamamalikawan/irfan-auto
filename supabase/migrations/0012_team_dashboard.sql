-- Sales Team (performance against targets) and the Dashboard numbers.
-- Needs 0007 (sales, payments), 0008 (returns), 0010 (visits).

-- Actual sales, collections and visits per salesman, route or area for a period.
-- Sales are net of returns and exclude bilti; collections are payments actually received.
create or replace function team_actuals(p_from date, p_to date, p_group text)
returns table (entity_id uuid, sales numeric, collection numeric, visits bigint)
language sql stable as $$
  select x.k, coalesce(sum(x.s), 0), coalesce(sum(x.c), 0), coalesce(sum(x.v), 0)::bigint
  from (
    select case p_group when 'route' then route_id when 'area' then area_id else salesman_id end as k,
           (total - bilti) as s, 0::numeric as c, 0 as v
    from sales where status = 'confirmed' and sale_date between p_from and p_to
    union all
    select case p_group when 'route' then route_id when 'area' then area_id else salesman_id end,
           -amount, 0::numeric, 0
    from sale_returns where return_date between p_from and p_to
    union all
    select case p_group when 'route' then route_id when 'area' then area_id else collector_id end,
           0::numeric, amount, 0
    from payments where not reversed and pay_date between p_from and p_to
    union all
    select case p_group when 'route' then route_id when 'area' then area_id else user_id end,
           0::numeric, 0::numeric, 1
    from visits where visit_date between p_from and p_to
  ) x
  where x.k is not null
  group by x.k
$$;

-- Today's numbers for the Dashboard. p_routes = null means everybody; otherwise only those routes.
create or replace function dashboard_numbers(p_day date, p_routes uuid[]) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'today_sales', coalesce((select sum(total - bilti) from sales
        where status = 'confirmed' and sale_date = p_day and (p_routes is null or route_id = any(p_routes))), 0),
    'today_invoices', coalesce((select count(*) from sales
        where status = 'confirmed' and sale_date = p_day and (p_routes is null or route_id = any(p_routes))), 0),
    'today_collections', coalesce((select sum(amount) from payments
        where not reversed and pay_date = p_day and (p_routes is null or route_id = any(p_routes))), 0),
    'receivables', coalesce((select sum(b.balance) from customer_balances b join customers c on c.id = b.customer_id
        where b.balance > 0 and (p_routes is null or c.route_id = any(p_routes))), 0),
    'money_in_hand', coalesce((select sum(amount) from payments where not reversed), 0)
        - coalesce((select sum(amount) from supplier_payments where not reversed), 0)
        - coalesce((select sum(amount) from expenses where not voided), 0)
  )
$$;

revoke all on function team_actuals(date, date, text) from public, anon, authenticated;
revoke all on function dashboard_numbers(date, uuid[]) from public, anon, authenticated;
