-- Sale types, sale status, payment methods and local charges.
-- Needs 0007 (sales), 0008 (returns), 0012 (team dashboard).
--
--  * Counter sale (paid at once, can be held) or Ledger sale (cash or credit, delivered later).
--  * Status of every invoice: Active (hold), Packed, Delivered, Completed. Cancelled stays separate.
--  * Payment methods (Cash, Bank, Easypaisa, JazzCash ... editable in Settings). Every payment records its method.
--  * Local charges (delivery inside the city). Bilti stays for delivery outside the city.
--  * Return numbers become R-0001.

-- ---------- payment methods ----------
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_methods_name_idx on payment_methods (lower(name));
alter table payment_methods enable row level security;
insert into payment_methods (name, sort) select v.n, v.s from (values ('Cash', 10), ('Bank', 20), ('Easypaisa', 30), ('JazzCash', 40)) as v(n, s)
 where not exists (select 1 from payment_methods p where lower(p.name) = lower(v.n));

alter table payments add column if not exists method_id uuid references payment_methods(id) on delete set null;
alter table payments add column if not exists method text;
update payments set method = 'Cash', method_id = (select id from payment_methods where lower(name) = 'cash') where method is null;

-- ---------- sale type, status, local charges ----------
do $mig$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'sales' and column_name = 'fulfil_status') then
    alter table sales add column sale_kind text not null default 'ledger' check (sale_kind in ('counter', 'ledger'));
    alter table sales add column pay_term text not null default 'credit' check (pay_term in ('cash', 'credit'));
    alter table sales add column fulfil_status text not null default 'active' check (fulfil_status in ('active', 'packed', 'delivered', 'completed'));
    alter table sales add column local_charges numeric(14,2) not null default 0;
    alter table sales add column contact_name text;
    alter table sales add column contact_phone text;
    alter table sales add column status_changed_at timestamptz;
    alter table sales add column status_changed_by uuid references app_users(id) on delete set null;
    -- invoices made before this change: walk-in sales are counter sales; paid ones are Completed, the rest Delivered
    update sales s set sale_kind = 'counter', pay_term = 'cash' from customers c where c.id = s.customer_id and c.is_walk_in;
    update sales set fulfil_status = case when paid >= total then 'completed' else 'delivered' end where status = 'confirmed';
  end if;
end
$mig$;
alter table sales add column if not exists active_first smallint generated always as (case when status = 'confirmed' and fulfil_status = 'active' then 0 else 1 end) stored;
create index if not exists sales_list_idx on sales (active_first, created_at desc);

-- ---------- return numbers: R-0001 ----------
alter table sale_returns alter column no set default ('R-' || lpad(nextval('return_no_seq')::text, 4, '0'));
update sale_returns set no = 'R-' || substr(no, 5) where no like 'RET-%';

-- ---------- create an invoice ----------
drop function if exists create_sale(uuid, uuid, jsonb, numeric, numeric, numeric, text, text, uuid, boolean, uuid[]);
create or replace function create_sale(
  p_customer uuid, p_location uuid, p_lines jsonb, p_discount numeric, p_bilti numeric,
  p_remarks text, p_idem text, p_user uuid, p_can_discount boolean, p_allowed uuid[],
  p_kind text default 'ledger', p_term text default 'credit', p_hold boolean default false, p_local numeric default 0,
  p_contact_name text default null, p_contact_phone text default null, p_pays jsonb default '[]'::jsonb
) returns uuid language plpgsql as $$
declare
  c customers%rowtype;
  r routes%rowtype;
  p products%rowtype;
  ln jsonb;
  loc record;
  s_id uuid;
  s_no text;
  item_id uuid;
  pay_id uuid;
  n int := 0;
  q numeric; fr numeric; want numeric; forced uuid; loc_name text;
  price numeric; pct numeric; defpct numeric; ldisc numeric;
  gross numeric := 0; sum_ldisc numeric := 0; tot numeric; v_paid numeric; v_credit numeric; bal numeric;
  neg boolean; have numeric; take numeric; left_q numeric; first_loc uuid;
  v_discount numeric := coalesce(p_discount, 0);
  v_bilti numeric := round(coalesce(p_bilti, 0));
  v_local numeric := round(coalesce(p_local, 0));
  v_name text; pays_total numeric := 0; pr jsonb; pm payment_methods%rowtype; amt numeric;
begin
  if p_idem is not null then
    select id into s_id from sales where idem_key = p_idem;
    if found then return s_id; end if;
  end if;

  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Choose a customer.'; end if;
  if c.status <> 'active' then raise exception 'This customer is archived. Make them active before creating an invoice.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one item.'; end if;
  if v_discount < 0 then raise exception 'Discount cannot be negative.'; end if;
  if v_bilti < 0 then raise exception 'Bilti cannot be negative.'; end if;
  if v_local < 0 then raise exception 'Local charges cannot be negative.'; end if;
  if p_kind not in ('counter', 'ledger') then raise exception 'Choose counter sale or ledger sale.'; end if;
  if p_term not in ('cash', 'credit') then raise exception 'Choose cash or credit.'; end if;
  if p_kind = 'ledger' and c.is_walk_in then raise exception 'Choose a customer for a ledger sale.'; end if;
  if v_discount > 0 and not p_can_discount then raise exception 'You do not have permission to give a discount.'; end if;

  select (value = 'true'::jsonb) into neg from app_settings where key = 'allow_negative_stock';
  neg := coalesce(neg, false);

  select * into r from routes where id = c.route_id;

  -- a walk-in customer can give a name and phone; they are printed on this invoice only
  v_name := case when c.is_walk_in and nullif(trim(coalesce(p_contact_name, '')), '') is not null then trim(p_contact_name) else c.name end;
  insert into sales (customer_id, customer_name, route_id, area_id, salesman_id, discount, bilti, local_charges, remarks, idem_key, created_by,
                     sale_kind, pay_term, contact_name, contact_phone)
  values (c.id, v_name, c.route_id, c.area_id, coalesce(r.salesman_id, p_user), v_discount, v_bilti, v_local,
          nullif(trim(coalesce(p_remarks, '')), ''), p_idem, p_user,
          p_kind, case when p_kind = 'counter' then 'cash' else p_term end,
          case when c.is_walk_in then nullif(trim(coalesce(p_contact_name, '')), '') end,
          case when c.is_walk_in then nullif(trim(coalesce(p_contact_phone, '')), '') end)
  returning id, no into s_id, s_no;

  for ln in select value from jsonb_array_elements(p_lines) loop
    n := n + 1;
    select * into p from products where id = (ln->>'product_id')::uuid and active;
    if not found then raise exception 'Part not found or inactive (line %).', n; end if;
    q := (ln->>'qty')::numeric;
    if q is null or q <= 0 then raise exception 'Quantity must be above zero for %.', p.name_en; end if;
    perform pg_advisory_xact_lock(hashtext(p.id::text));   -- two sellers cannot take the same stock at once

    fr := case when coalesce(p.scheme_buy, 0) > 0 and coalesce(p.scheme_free, 0) > 0
               then floor(q / p.scheme_buy) * p.scheme_free else 0 end;
    want := q + fr;

    price := case when ln->>'price' is null then p.cp else round((ln->>'price')::numeric) end;
    if price <= 0 then raise exception 'Set a counter price for % before selling it.', p.name_en; end if;
    if price <> p.cp and not p_can_discount then raise exception 'You do not have permission to change prices.'; end if;

    select coalesce(
             (select d.pct from customer_brand_discounts d where d.customer_id = c.id and d.brand_id = p.brand_id),
             (select b.discount_pct from brands b where b.id = p.brand_id), 0) into defpct;
    pct := case when ln->>'disc_pct' is null then defpct else (ln->>'disc_pct')::numeric end;
    if pct < 0 or pct > 100 then raise exception 'Discount percent must be between 0 and 100.'; end if;
    if pct <> defpct and not p_can_discount then raise exception 'You do not have permission to change discounts.'; end if;

    ldisc := round(q * price * pct / 100);
    insert into sale_items (sale_id, line_no, product_id, name, qty, free, price, disc_pct, line_disc)
    values (s_id, n, p.id, p.name_en, q, fr, price, pct, ldisc) returning id into item_id;
    gross := gross + q * price;
    sum_ldisc := sum_ldisc + ldisc;

    forced := coalesce(nullif(ln->>'location_id', '')::uuid, p_location);
    left_q := want;
    first_loc := null;
    if forced is not null then
      if p_allowed is not null and not (forced = any(p_allowed)) then raise exception 'You cannot sell from that location.'; end if;
      select name into loc_name from locations where id = forced and active;
      if not found then raise exception 'Choose a valid stock location.'; end if;
      select coalesce(sum(qty), 0) into have from stock_movements where product_id = p.id and location_id = forced;
      if have < want and not neg then raise exception 'Only % of % at %.', have, p.name_en, loc_name; end if;
      insert into sale_item_allocs (sale_item_id, location_id, qty) values (item_id, forced, want);
      insert into stock_movements (product_id, location_id, qty, type, note, ref) values (p.id, forced, -want, 'sale', s_no, s_id);
    else
      -- take from the location sold from first, then the next, among the locations this person may sell from
      for loc in select id from locations where active and (p_allowed is null or id = any(p_allowed)) order by sell_priority, name loop
        if first_loc is null then first_loc := loc.id; end if;
        exit when left_q <= 0;
        select coalesce(sum(qty), 0) into have from stock_movements where product_id = p.id and location_id = loc.id;
        if have > 0 then
          take := least(have, left_q);
          insert into sale_item_allocs (sale_item_id, location_id, qty) values (item_id, loc.id, take);
          insert into stock_movements (product_id, location_id, qty, type, note, ref) values (p.id, loc.id, -take, 'sale', s_no, s_id);
          left_q := left_q - take;
        end if;
      end loop;
      if left_q > 0 then
        if neg and first_loc is not null then
          insert into sale_item_allocs (sale_item_id, location_id, qty) values (item_id, first_loc, left_q);
          insert into stock_movements (product_id, location_id, qty, type, note, ref) values (p.id, first_loc, -left_q, 'sale', s_no, s_id);
        else
          raise exception 'Only % of % available in the locations you can sell from.', want - left_q, p.name_en;
        end if;
      end if;
    end if;
  end loop;

  tot := gross - sum_ldisc - v_discount + v_bilti + v_local;
  if tot < 0 then raise exception 'Discount is larger than the total.'; end if;

  -- money received with the invoice: one row per payment method (split payment)
  if p_pays is not null and jsonb_typeof(p_pays) = 'array' then
    for pr in select value from jsonb_array_elements(p_pays) loop
      pays_total := pays_total + greatest(round(coalesce((pr->>'amount')::numeric, 0), 2), 0);
    end loop;
  end if;
  if p_kind = 'counter' and p_hold then pays_total := 0; end if;      -- on hold: nothing is received yet
  if p_kind = 'counter' and not p_hold and pays_total <> tot then
    raise exception 'A counter sale is paid in full. Received % of %.', pays_total, tot;
  end if;
  if pays_total > tot then raise exception 'Payment is larger than the invoice total.'; end if;
  v_paid := pays_total;
  v_credit := tot - v_paid;
  if p_kind = 'ledger' and v_credit > 0 and c.credit_limit > 0 then
    select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
    if bal + v_credit > c.credit_limit then
      raise exception 'This credit sale exceeds the customer credit limit of %.', c.credit_limit;
    end if;
  end if;

  update sales set total = tot, paid = v_paid, line_discount = sum_ldisc,
         fulfil_status = case when p_kind = 'counter' and not p_hold then 'completed' else 'active' end
   where id = s_id;
  insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'invoice', tot, s_id);
  if v_paid > 0 then
    for pr in select value from jsonb_array_elements(p_pays) loop
      amt := round(coalesce((pr->>'amount')::numeric, 0), 2);
      continue when amt <= 0;
      select * into pm from payment_methods where id = nullif(pr->>'method_id', '')::uuid and active;
      if not found then raise exception 'Choose a valid payment method.'; end if;
      insert into payments (customer_id, amount, kind, sale_id, collector_id, route_id, area_id, created_by, method_id, method)
      values (c.id, amt, 'invoice', s_id, coalesce(r.salesman_id, p_user), c.route_id, c.area_id, p_user, pm.id, pm.name)
      returning id into pay_id;
      insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'payment', -amt, pay_id);
    end loop;
  end if;
  return s_id;
end $$;

-- ---------- receive money against one invoice (a held counter sale, or cash on delivery) ----------
create or replace function pay_sale(p_sale uuid, p_pays jsonb, p_user uuid) returns void language plpgsql as $$
declare
  s sales%rowtype; c customers%rowtype; r routes%rowtype;
  pr jsonb; pm payment_methods%rowtype; amt numeric; added numeric := 0; n int := 0; pay_id uuid;
begin
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if s.status <> 'confirmed' then raise exception 'This invoice is cancelled.'; end if;
  select * into c from customers where id = s.customer_id for update;
  select * into r from routes where id = c.route_id;
  for pr in select value from jsonb_array_elements(coalesce(p_pays, '[]'::jsonb)) loop
    amt := round(coalesce((pr->>'amount')::numeric, 0), 2);
    continue when amt <= 0;
    select * into pm from payment_methods where id = nullif(pr->>'method_id', '')::uuid and active;
    if not found then raise exception 'Choose a valid payment method.'; end if;
    insert into payments (customer_id, amount, kind, sale_id, collector_id, route_id, area_id, created_by, method_id, method)
    values (c.id, amt, 'invoice', s.id, coalesce(r.salesman_id, p_user), c.route_id, c.area_id, p_user, pm.id, pm.name)
    returning id into pay_id;
    insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'payment', -amt, pay_id);
    added := added + amt; n := n + 1;
  end loop;
  if n = 0 then raise exception 'Enter an amount above zero.'; end if;
  if s.paid + added > s.total then raise exception 'That is more than the amount due on this invoice (%).', s.total - s.paid; end if;
  update sales set paid = s.paid + added,
         fulfil_status = case when s.sale_kind = 'counter' and s.paid + added >= s.total then 'completed' else s.fulfil_status end
   where id = s.id;
end $$;

-- ---------- collect money from a customer: now records the payment method ----------
drop function if exists collect_payment(uuid, numeric, text, uuid);
create or replace function collect_payment(p_customer uuid, p_amount numeric, p_method uuid, p_idem text, p_user uuid) returns uuid language plpgsql as $$
declare
  c customers%rowtype; r routes%rowtype; pm payment_methods%rowtype; bal numeric; pay_id uuid;
begin
  if p_idem is not null then
    select id into pay_id from payments where idem_key = p_idem;
    if found then return pay_id; end if;
  end if;
  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Choose a customer.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero.'; end if;
  select * into pm from payment_methods where id = p_method and active;
  if not found then raise exception 'Choose a payment method.'; end if;
  select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
  if p_amount > bal then raise exception 'Amount is more than the outstanding balance of %.', bal; end if;
  select * into r from routes where id = c.route_id;
  insert into payments (customer_id, amount, kind, collector_id, route_id, area_id, idem_key, created_by, method_id, method)
  values (c.id, p_amount, 'collection', coalesce(r.salesman_id, p_user), c.route_id, c.area_id, p_idem, p_user, pm.id, pm.name)
  returning id into pay_id;
  insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'payment', -p_amount, pay_id);
  return pay_id;
end $$;

-- ---------- team and dashboard numbers: local charges are not sales, like bilti ----------
create or replace function team_actuals(p_from date, p_to date, p_group text)
returns table (entity_id uuid, sales numeric, collection numeric, visits bigint)
language sql stable as $$
  select x.k, coalesce(sum(x.s), 0), coalesce(sum(x.c), 0), coalesce(sum(x.v), 0)::bigint
  from (
    select case p_group when 'route' then route_id when 'area' then area_id else salesman_id end as k,
           (total - bilti - local_charges) as s, 0::numeric as c, 0 as v
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

create or replace function dashboard_numbers(p_day date, p_routes uuid[]) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'today_sales', coalesce((select sum(total - bilti - local_charges) from sales
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

revoke all on function create_sale(uuid, uuid, jsonb, numeric, numeric, text, text, uuid, boolean, uuid[], text, text, boolean, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function pay_sale(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function collect_payment(uuid, numeric, uuid, text, uuid) from public, anon, authenticated;
