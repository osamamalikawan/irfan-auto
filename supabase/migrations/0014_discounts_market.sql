-- Discount screens, customer promises and market purchases.
-- Needs 0006 (customers), 0007 (sales), 0008 (expenses), 0010 (visits) and 0013 (sale types).
-- create_sale below is the 0013 version (counter / ledger sales, split payments) plus market lines.

-- ---------- brand and customer discounts (the data already used by invoices) ----------
-- brands.discount_pct and customer_brand_discounts were created in 0007; this gives the screens their summary.
create or replace function brand_discount_stats()
returns table (id uuid, name text, company text, discount_pct numeric, products bigint, deals bigint)
language sql stable as $$
  select b.id, b.name, c.name, b.discount_pct,
         (select count(*) from products p where p.brand_id = b.id and p.active),
         (select count(*) from customer_brand_discounts d where d.brand_id = b.id)
  from brands b left join companies c on c.id = b.company_id
  order by b.name
$$;
revoke all on function brand_discount_stats() from public, anon, authenticated;

-- ---------- market purchases ----------
create sequence market_no_seq;
create table market_purchases (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('MP-' || lpad(nextval('market_no_seq')::text, 4, '0')),
  purchase_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  product_id uuid not null references products(id),
  qty numeric(14,3) not null check (qty > 0),        -- pieces bought, including free pieces
  cost numeric(14,2) not null check (cost > 0),      -- price per piece we paid
  total numeric(14,2) not null,
  vendor text,                                        -- shop or person we bought from
  sale_id uuid references sales(id),
  sale_no text,
  sale_amount numeric(14,2) not null default 0,       -- what the customer pays for these pieces
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index market_purchases_date_idx on market_purchases (purchase_date desc);
alter table market_purchases enable row level security;

alter table sale_items add column if not exists market boolean not null default false;
alter table sale_items add column if not exists market_cost numeric(14,2);

-- ---------- invoices: a line can now be bought from the market ----------
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
  is_mkt boolean; m_cost numeric; m_vendor text; mloc uuid; mp_id uuid; mp_no text;
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

    -- a line bought from the market for this invoice: { "market": { "cost": n, "vendor": "..." } }
    m_cost := null;
    m_vendor := null;
    is_mkt := coalesce(jsonb_typeof(ln->'market') = 'object', false);
    if is_mkt then
      m_cost := round((ln->'market'->>'cost')::numeric);
      if m_cost is null or m_cost <= 0 then raise exception 'Enter the cost price for % bought from the market.', p.name_en; end if;
      m_vendor := nullif(trim(coalesce(ln->'market'->>'vendor', '')), '');
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
      insert into market_purchases (product_id, qty, cost, total, vendor, sale_id, sale_no, sale_amount, created_by)
      values (p.id, want, m_cost, m_cost * want, m_vendor, s_id, s_no, q * price - ldisc, p_user) returning id, no into mp_id, mp_no;
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

revoke all on function create_sale(uuid, uuid, jsonb, numeric, numeric, text, text, uuid, boolean, uuid[], text, text, boolean, numeric, text, text, jsonb) from public, anon, authenticated;
