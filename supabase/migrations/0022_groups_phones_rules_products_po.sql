-- Customer groups, several phone numbers, invoice rules (credit limit and overdue days),
-- product suppliers, and purchase orders. Needs 0001-0021.

-- ---------- customer groups (a customer can be in none, one or several) ----------
create table if not exists customer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists customer_groups_name_key on customer_groups (lower(name));
create table if not exists customer_group_members (
  customer_id uuid not null references customers(id) on delete cascade,
  group_id uuid not null references customer_groups(id) on delete cascade,
  primary key (customer_id, group_id)
);
create index if not exists customer_group_members_group_idx on customer_group_members (group_id);
alter table customer_groups        enable row level security;
alter table customer_group_members enable row level security;
insert into customer_groups (name) values ('Archive'), ('Dead'), ('Defaulter'), ('Closed') on conflict do nothing;

-- ---------- several phone numbers per customer ----------
-- customers.phone / phone2 stay as the first two numbers (other screens and the Android app read them);
-- phone_search holds every number so the customer search finds all of them.
create table if not exists customer_phones (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  phone text not null,
  label text,
  position int not null default 0
);
create index if not exists customer_phones_idx on customer_phones (customer_id, position);
alter table customer_phones enable row level security;
alter table customers add column if not exists phone_search text;
insert into customer_phones (customer_id, phone, position)
select c.id, trim(c.phone), 0 from customers c
where nullif(trim(coalesce(c.phone, '')), '') is not null and not exists (select 1 from customer_phones p where p.customer_id = c.id);
insert into customer_phones (customer_id, phone, position)
select c.id, trim(c.phone2), 1 from customers c
where nullif(trim(coalesce(c.phone2, '')), '') is not null
  and not exists (select 1 from customer_phones p where p.customer_id = c.id and p.phone = trim(c.phone2));
update customers c set phone_search = (select string_agg(p.phone, ' ' order by p.position) from customer_phones p where p.customer_id = c.id);

-- ---------- invoice days limit (admin sets it per customer; 0 = no day check) ----------
alter table customers add column if not exists invoice_days_limit int not null default 30 check (invoice_days_limit >= 0);

-- Money the customer still owes on invoices older than p_days days.
-- Payments and returns are applied to the oldest invoices first, so: balance minus what is still unpaid on the newer invoices.
create or replace function customer_overdue(p_customer uuid, p_days int) returns numeric
language sql stable as $$
  select case when coalesce(p_days, 0) <= 0 then 0::numeric else greatest(
    coalesce((select sum(amount) from customer_ledger where customer_id = p_customer), 0)
    - coalesce((select sum(greatest(total - paid, 0)) from sales
                where customer_id = p_customer and status = 'confirmed'
                  and sale_date >= ((now() at time zone 'Asia/Karachi')::date - p_days)), 0),
    0) end
$$;
revoke all on function customer_overdue(uuid, int) from public, anon, authenticated;

-- ---------- create_sale: same as 0016_customer_area_name, with the two credit rules above ----------
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
  gross numeric := 0; sum_ldisc numeric := 0; tot numeric; v_paid numeric; v_credit numeric; bal numeric; v_over numeric;
  neg boolean; have numeric; take numeric; left_q numeric; first_loc uuid;
  v_discount numeric := coalesce(p_discount, 0);
  v_bilti numeric := round(coalesce(p_bilti, 0));
  v_local numeric := round(coalesce(p_local, 0));
  v_name text; pays_total numeric := 0; pr jsonb; pm payment_methods%rowtype; amt numeric;
  is_mkt boolean; m_cost numeric; m_vendor text; m_sup uuid; mloc uuid; mp_id uuid; mp_no text;
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
  v_name := case when c.is_walk_in and nullif(trim(coalesce(p_contact_name, '')), '') is not null then trim(p_contact_name) else c.name || coalesce(' - ' || (select ar.name from areas ar where ar.id = c.area_id), '') end;
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

    -- a line bought from the market for this invoice: { "market": { "cost": n, "vendor": "..." } }
    m_cost := null;
    m_vendor := null;
    m_sup := null;
    is_mkt := coalesce(jsonb_typeof(ln->'market') = 'object', false);
    if is_mkt then
      m_cost := round((ln->'market'->>'cost')::numeric);
      if m_cost is null or m_cost <= 0 then raise exception 'Enter the cost price for % bought from the market.', p.name_en; end if;
      m_vendor := nullif(trim(coalesce(ln->'market'->>'vendor', '')), '');
      m_sup := nullif(ln->'market'->>'supplier_id', '')::uuid;
      if m_sup is not null then
        select name into m_vendor from suppliers where id = m_sup;
        if not found then raise exception 'Choose a valid supplier for the market purchase.'; end if;
      end if;
    end if;

    price := case when ln->>'price' is null then p.cp else round((ln->>'price')::numeric) end;
    if price <= 0 then raise exception 'Set a counter price for % before selling it.', p.name_en; end if;
    if price <> p.cp and not p_can_discount and not is_mkt then raise exception 'You do not have permission to change prices.'; end if;

    select coalesce(
             (select d.pct from customer_brand_discounts d where d.customer_id = c.id and d.brand_id = p.brand_id),
             (select b.discount_pct from brands b where b.id = p.brand_id), 0) into defpct;
    pct := case when ln->>'disc_pct' is null then defpct else (ln->>'disc_pct')::numeric end;
    if pct < 0 or pct > 100 then raise exception 'Discount percent must be between 0 and 100.'; end if;
    if pct <> defpct and not p_can_discount then raise exception 'You do not have permission to change discounts.'; end if;

    ldisc := round(q * price * pct / 100);
    insert into sale_items (sale_id, line_no, product_id, name, qty, free, price, disc_pct, line_disc, market, market_cost)
    values (s_id, n, p.id, p.name_en, q, fr, price, pct, ldisc, is_mkt, m_cost) returning id into item_id;
    gross := gross + q * price;
    sum_ldisc := sum_ldisc + ldisc;

    forced := coalesce(nullif(ln->>'location_id', '')::uuid, p_location);
    left_q := want;
    first_loc := null;
    if is_mkt then
      -- goods are bought and sold at once through the Market location, so its stock stays at zero
      select id into mloc from locations where type = 'Market' order by name limit 1;
      if not found then
        select id into mloc from locations where name = 'Market';
        if not found then insert into locations (name, type, sell_priority) values ('Market', 'Market', 9000) returning id into mloc; end if;
      end if;
      insert into market_purchases (product_id, qty, cost, total, vendor, supplier_id, sale_id, sale_no, sale_amount, created_by)
      values (p.id, want, m_cost, m_cost * want, m_vendor, m_sup, s_id, s_no, q * price - ldisc, p_user) returning id, no into mp_id, mp_no;
      insert into stock_movements (product_id, location_id, qty, type, note, ref) values (p.id, mloc, want, 'market_buy', mp_no, mp_id);
      insert into sale_item_allocs (sale_item_id, location_id, qty) values (item_id, mloc, want);
      insert into stock_movements (product_id, location_id, qty, type, note, ref) values (p.id, mloc, -want, 'sale', s_no, s_id);
      insert into expenses (expense_date, amount, category, note, ref_type, ref_id, created_by)
      values ((now() at time zone 'Asia/Karachi')::date, m_cost * want, 'Market purchase',
              'Market purchase ' || mp_no || ' - ' || p.name_en || ' x ' || want::text || coalesce(' from ' || m_vendor, ''), 'market', mp_id, p_user);
    elsif forced is not null then
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
  -- credit rules for an invoice that goes on the customer's account
  if p_kind = 'ledger' and v_credit > 0 and not c.is_walk_in then
    select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
    -- 1) the invoice must fit in the remaining credit limit (limit 0 = no limit set)
    if c.credit_limit > 0 and bal + v_credit > c.credit_limit then
      raise exception 'Invoice value % is more than the remaining credit limit of % (limit %, balance %).',
        v_credit, greatest(c.credit_limit - bal, 0), c.credit_limit, bal;
    end if;
    -- 2) no invoice while the customer has unpaid invoices older than the customer's invoice days limit (0 = off)
    v_over := customer_overdue(c.id, c.invoice_days_limit);
    if v_over > 0 then
      raise exception 'This customer has % unpaid for more than % days. Collect payment before making a new invoice.', v_over, c.invoice_days_limit;
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

revoke all on function create_sale(uuid, uuid, jsonb, numeric, numeric, text, text, uuid, boolean, uuid[], text, text, boolean, numeric, text, text, jsonb) from public, anon, authenticated;

-- ---------- suppliers of a product (one product can have several) ----------
create table if not exists product_suppliers (
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, supplier_id)
);
create index if not exists product_suppliers_supplier_idx on product_suppliers (supplier_id);
alter table product_suppliers enable row level security;
-- suppliers we have already bought a product from are linked to it
insert into product_suppliers (product_id, supplier_id)
select distinct pi.product_id, pu.supplier_id from purchase_items pi join purchases pu on pu.id = pi.purchase_id
on conflict do nothing;

-- ---------- Products page: products of active (visible) price lists only ----------
create or replace function products_page(
  p_q text default null, p_list uuid default null, p_company uuid default null, p_brand uuid default null,
  p_supplier uuid default null, p_filter text default 'all', p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, name_en text, name_ur text, code_name text, scheme text, cp numeric, purchase_price numeric, unit text,
  reorder_level numeric, list_id uuid, list_name text, company_id uuid, company text, brand_id uuid, brand text,
  on_hand numeric, suppliers jsonb, total bigint
) language sql stable as $$
  select p.id, p.name_en, p.name_ur, p.code_name, p.scheme, p.cp, p.purchase_price, p.unit, p.reorder_level,
         l.id, l.name, c.id, c.name, b.id, b.name, coalesce(s.on_hand, 0), coalesce(sp.sups, '[]'::jsonb), count(*) over ()
  from products p
  left join price_lists l on l.id = p.list_id
  left join brands b on b.id = p.brand_id
  left join companies c on c.id = p.company_id
  left join lateral (select sum(m.qty) as on_hand from stock_movements m where m.product_id = p.id) s on true
  left join lateral (select jsonb_agg(jsonb_build_object('id', su.id, 'name', su.name) order by su.name) as sups
                     from product_suppliers ps join suppliers su on su.id = ps.supplier_id where ps.product_id = p.id) sp on true
  where p.active
    and (l.id is null or l.visible)
    and (p_list is null or p.list_id = p_list)
    and (p_company is null or p.company_id = p_company)
    and (p_brand is null or p.brand_id = p_brand)
    and (p_supplier is null or exists (select 1 from product_suppliers x where x.product_id = p.id and x.supplier_id = p_supplier))
    and (p_filter = 'all'
         or (p_filter = 'nosupplier' and sp.sups is null)
         or (p_filter = 'nobrand' and p.brand_id is null)
         or (p_filter = 'nocompany' and p.company_id is null)
         or (p_filter = 'low' and p.reorder_level > 0 and coalesce(s.on_hand, 0) <= p.reorder_level)
         or (p_filter = 'nolist' and p.list_id is null))
    and not exists (
      select 1 from unnest(string_to_array(trim(coalesce(p_q, '')), ' ')) w
      where w <> '' and not (concat_ws(' ', p.name_en, p.name_ur, p.code_name, b.name, c.name, (select string_agg(su2.name, ' ') from product_suppliers ps2 join suppliers su2 on su2.id = ps2.supplier_id where ps2.product_id = p.id)) ilike '%' || w || '%'))
  order by p.name_en
  limit p_limit offset p_offset
$$;
revoke all on function products_page(text, uuid, uuid, uuid, uuid, text, int, int) from public, anon, authenticated;

-- ---------- purchase orders (what we ask a supplier to send; goods arrive later as a purchase) ----------
create sequence if not exists purchase_order_no_seq;
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('PO-' || lpad(nextval('purchase_order_no_seq')::text, 4, '0')),
  po_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  expected_date date,
  supplier_id uuid not null references suppliers(id),
  supplier_name text not null,
  status text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  total numeric(14,2) not null default 0,
  remarks text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists purchase_orders_supplier_idx on purchase_orders (supplier_id, created_at desc);
create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  line_no int not null,
  product_id uuid not null references products(id),
  name text not null,
  unit text not null default 'pc',
  qty numeric(14,3) not null check (qty > 0),
  cost numeric(14,2) not null default 0
);
create index if not exists purchase_order_items_idx on purchase_order_items (po_id);
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;

-- p_lines: [{ "product_id": uuid, "qty": n, "cost": n }]
create or replace function create_purchase_order(p_supplier uuid, p_lines jsonb, p_expected date, p_remarks text, p_user uuid)
returns uuid language plpgsql as $$
declare
  sp suppliers%rowtype; pr products%rowtype; ln jsonb; po_id uuid; n int := 0; v_q numeric; v_cost numeric; tot numeric := 0;
begin
  select * into sp from suppliers where id = p_supplier;
  if not found then raise exception 'Choose a supplier.'; end if;
  if sp.status <> 'active' then raise exception 'This supplier is archived. Make them active first.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one item.'; end if;
  insert into purchase_orders (supplier_id, supplier_name, expected_date, remarks, created_by)
  values (sp.id, sp.name, p_expected, nullif(trim(coalesce(p_remarks, '')), ''), p_user) returning id into po_id;
  for ln in select value from jsonb_array_elements(p_lines) loop
    n := n + 1;
    select * into pr from products where id = (ln->>'product_id')::uuid;
    if not found then raise exception 'Part not found (line %).', n; end if;
    v_q := (ln->>'qty')::numeric;
    if v_q is null or v_q <= 0 then raise exception 'Quantity must be above zero for %.', pr.name_en; end if;
    v_cost := greatest(coalesce(round((ln->>'cost')::numeric, 2), 0), 0);
    insert into purchase_order_items (po_id, line_no, product_id, name, unit, qty, cost) values (po_id, n, pr.id, pr.name_en, pr.unit, v_q, v_cost);
    tot := tot + v_q * v_cost;
  end loop;
  update purchase_orders set total = tot where id = po_id;
  return po_id;
end $$;
revoke all on function create_purchase_order(uuid, jsonb, date, text, uuid) from public, anon, authenticated;
