-- Edit orders that are not delivered yet, scheduled order tasks, a calendar of tasks, claims.
-- Needs 0007, 0008, 0013, 0016.
--
--  * edit_sale: change the items, discount, charges and remarks of an Active or Packed order. Stock and the customer's
--    account are corrected. A Delivered or Completed order is changed with a return or claim instead.
--  * sale_tasks: schedule an order to be packed, delivered or completed on a day. tasks: your own to-do items.
--  * Returns and claims are only for Delivered or Completed orders. A claim is numbered C:0001, a return R-0001.
--  * Product search also matches the price list name.

alter table stock_movements drop constraint if exists stock_movements_type_check;
alter table stock_movements add constraint stock_movements_type_check
  check (type in ('opening','receive','issue','adjust','sale','sale_cancel','sale_return','sale_edit','market_buy','transfer_in','transfer_out','purchase','purchase_cancel'));

alter table sales add column if not exists edit_count int not null default 0;
alter table sales add column if not exists edited_at timestamptz;
alter table sales add column if not exists edited_by uuid references app_users(id) on delete set null;

-- ---------- scheduled actions on orders, and own tasks ----------
create table if not exists sale_tasks (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  action text not null check (action in ('pack', 'deliver', 'complete')),
  due_date date not null,
  note text,
  done_at timestamptz,
  done_by uuid references app_users(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sale_tasks_due_idx on sale_tasks (due_date) where done_at is null;
create index if not exists sale_tasks_sale_idx on sale_tasks (sale_id);
alter table sale_tasks enable row level security;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date not null,
  note text,
  customer_id uuid references customers(id) on delete set null,
  done_at timestamptz,
  done_by uuid references app_users(id) on delete set null,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tasks_due_idx on tasks (due_date);
alter table tasks enable row level security;

-- ---------- returns and claims ----------
create sequence if not exists claim_no_seq;
alter table sale_returns add column if not exists kind text not null default 'return' check (kind in ('return', 'claim'));

drop function if exists create_return(uuid, jsonb, boolean, text, uuid);
create or replace function create_return(p_sale uuid, p_lines jsonb, p_damaged boolean, p_reason text, p_user uuid, p_kind text default 'return')
returns uuid language plpgsql as $$
declare
  s sales%rowtype;
  c customers%rowtype;
  it sale_items%rowtype;
  ln jsonb;
  r_id uuid;
  r_no text;
  q numeric; done numeric; amt numeric; tot numeric := 0;
  loc uuid;
  n int := 0;
  claim boolean := coalesce(p_kind, 'return') = 'claim';
  dmg boolean := coalesce(p_damaged, false) or coalesce(p_kind, 'return') = 'claim';   -- claimed goods are not put back in stock
begin
  select * into s from sales where id = p_sale for update;
  if not found or s.status <> 'confirmed' then raise exception 'Invoice not found or cancelled.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one item to return.'; end if;
  if s.fulfil_status not in ('delivered', 'completed') then raise exception 'Only a delivered or completed order can be returned or claimed. Edit the order instead.'; end if;
  select * into c from customers where id = s.customer_id;

  insert into sale_returns (sale_id, damaged, reason, salesman_id, route_id, area_id, created_by, kind, no)
  values (s.id, dmg, nullif(trim(coalesce(p_reason, '')), ''), s.salesman_id, s.route_id, s.area_id, p_user,
          case when claim then 'claim' else 'return' end,
          case when claim then 'C:' || lpad(nextval('claim_no_seq')::text, 4, '0') else 'R-' || lpad(nextval('return_no_seq')::text, 4, '0') end)
  returning id, no into r_id, r_no;

  for ln in select value from jsonb_array_elements(p_lines) loop
    q := (ln->>'qty')::numeric;
    if q is null or q <= 0 then continue; end if;
    select * into it from sale_items where id = (ln->>'item_id')::uuid and sale_id = s.id;
    if not found then raise exception 'That item is not on this invoice.'; end if;
    select coalesce(sum(l.qty), 0) into done from sale_return_lines l where l.sale_item_id = it.id;
    if q + done > it.qty then raise exception 'Return quantity is larger than what is left to return for %.', it.name; end if;
    amt := round(q * it.price * (1 - it.disc_pct / 100));
    insert into sale_return_lines (return_id, sale_item_id, product_id, name, qty, amount) values (r_id, it.id, it.product_id, it.name, q, amt);
    tot := tot + amt;
    n := n + 1;
    if not dmg then
      -- goods go back to the location most of the item came from
      select location_id into loc from sale_item_allocs where sale_item_id = it.id order by qty desc, id limit 1;
      if loc is not null then
        insert into stock_movements (product_id, location_id, qty, type, note, ref) values (it.product_id, loc, q, 'sale_return', r_no, r_id);
      end if;
    end if;
  end loop;
  if n = 0 then raise exception 'Enter a return quantity above zero.'; end if;

  update sale_returns set amount = tot where id = r_id;
  insert into customer_ledger (customer_id, type, amount, ref) values (s.customer_id, 'return', -tot, r_id);
  if c.is_walk_in then
    -- the cash customer gets the money back at once
    insert into customer_ledger (customer_id, type, amount, ref) values (s.customer_id, 'refund', tot, r_id);
    insert into expenses (amount, category, note, ref_type, ref_id, created_by)
    values (tot, 'Refund', (case when claim then 'Cash claim refund ' else 'Cash refund ' end) || r_no || ' - Invoice ' || s.no, 'return', r_id, p_user);
  end if;
  return r_id;
end $$;

-- ---------- product search: the price list name is also a search word ----------
create or replace function inventory_list(
  p_q text default null, p_list uuid default null, p_filter text default 'all',
  p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, legacy_no int, name_en text, code_name text, name_ur text, scheme text,
  cp numeric, unit text, reorder_level numeric, list_name text, brand text, company text,
  on_hand numeric, racks text[], locations text[], by_location jsonb, total bigint
) language sql stable as $$
  select p.id, p.legacy_no, p.name_en, p.code_name, p.name_ur, p.scheme,
         p.cp, p.unit, p.reorder_level, l.name, b.name, c.name,
         coalesce(s.on_hand, 0),
         coalesce(rk.racks, '{}'), coalesce(lc.locs, '{}'), coalesce(bl.by_loc, '[]'::jsonb),
         count(*) over ()
  from products p
  left join price_lists l on l.id = p.list_id
  left join brands b on b.id = p.brand_id
  left join companies c on c.id = p.company_id
  left join lateral (select sum(m.qty) as on_hand from stock_movements m where m.product_id = p.id) s on true
  left join lateral (select array_agg(r.code order by r.code) as racks
                     from product_racks pr join racks r on r.id = pr.rack_id
                     where pr.product_id = p.id) rk on true
  left join lateral (select array_agg(lo.name order by lo.name) as locs
                     from product_locations pl join locations lo on lo.id = pl.location_id
                     where pl.product_id = p.id) lc on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('location', x.name, 'qty', x.qty, 'racks', x.racks) order by x.name) as by_loc
    from (
      select lo.name, coalesce(sl.qty, 0) as qty,
             coalesce((select array_agg(r.code order by r.code) from product_racks pr
                       join racks r on r.id = pr.rack_id
                       where pr.product_id = p.id and r.location_id = lo.id), '{}') as racks
      from locations lo
      left join stock_levels sl on sl.location_id = lo.id and sl.product_id = p.id
      where lo.active and (sl.qty is not null or exists
            (select 1 from product_locations pl where pl.product_id = p.id and pl.location_id = lo.id))
    ) x
  ) bl on true
  where p.active
    and (l.id is null or l.visible)   -- products of hidden lists are left out
    and (coalesce(trim(p_q), '') = '' or not exists (
           -- every word typed or spoken must match somewhere (any order); "cd70" also matches "CD 70".
           -- coalesce() matters: a NULL field (no brand, no Urdu name) must count as "no match", not "unknown".
           select 1 from unnest(regexp_split_to_array(trim(p_q), '\s+')) as t(w)
           where t.w <> '' and not (
                 coalesce(p.name_en, '')   ilike '%' || t.w || '%'
              or coalesce(p.code_name, '') ilike '%' || t.w || '%'
              or coalesce(p.name_ur, '')   ilike '%' || t.w || '%'
              or coalesce(b.name, '')      ilike '%' || t.w || '%'
              or coalesce(l.name, '')      ilike '%' || t.w || '%'   -- the list name works as a search word too
              or replace(coalesce(p.name_en, ''), ' ', '')   ilike '%' || t.w || '%'
              or replace(coalesce(p.code_name, ''), ' ', '') ilike '%' || t.w || '%'
              or exists (select 1 from product_racks pr2 join racks r2 on r2.id = pr2.rack_id
                         where pr2.product_id = p.id and r2.code ilike '%' || t.w || '%')
           )))
    and (p_list is null or p.list_id = p_list)
    and (p_filter = 'all'
         or (p_filter = 'low'    and p.reorder_level > 0 and coalesce(s.on_hand, 0) <= p.reorder_level)
         or (p_filter = 'out'    and coalesce(s.on_hand, 0) <= 0)
         or (p_filter = 'norack' and rk.racks is null))
  order by p.legacy_no nulls last, p.name_en
  limit p_limit offset p_offset
$$;

-- ---------- on-hand stock for a few products (used when an order is opened for editing) ----------
create or replace function stock_on_hand(p_products uuid[]) returns table (product_id uuid, qty numeric)
language sql stable as $$
  select m.product_id, sum(m.qty) from stock_movements m where m.product_id = any(p_products) group by m.product_id
$$;

-- ---------- edit an order ----------
create or replace function edit_sale(
  p_sale uuid, p_location uuid, p_lines jsonb, p_discount numeric, p_bilti numeric, p_local numeric,
  p_remarks text, p_term text, p_user uuid, p_can_discount boolean, p_allowed uuid[]
) returns uuid language plpgsql as $$
declare
  c customers%rowtype;
  r routes%rowtype;
  p products%rowtype;
  s sales%rowtype;
  ln jsonb;
  loc record;
  al record;
  s_id uuid;
  s_no text;
  item_id uuid;
  n int := 0;
  q numeric; fr numeric; want numeric; forced uuid; loc_name text;
  price numeric; pct numeric; defpct numeric; ldisc numeric;
  gross numeric := 0; sum_ldisc numeric := 0; tot numeric; bal numeric;
  neg boolean; have numeric; take numeric; left_q numeric; first_loc uuid;
  v_discount numeric := coalesce(p_discount, 0);
  v_bilti numeric := round(coalesce(p_bilti, 0));
  v_local numeric := round(coalesce(p_local, 0));
  is_mkt boolean; m_cost numeric; m_vendor text; m_sup uuid; mloc uuid; mp_id uuid; mp_no text;
begin
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if s.status <> 'confirmed' then raise exception 'A cancelled invoice cannot be edited.'; end if;
  if s.fulfil_status in ('delivered', 'completed') then raise exception 'A delivered or completed order cannot be edited. Use a return or claim instead.'; end if;
  if exists (select 1 from sale_returns where sale_id = s.id) then raise exception 'This invoice already has a return, so it cannot be edited.'; end if;
  select * into c from customers where id = s.customer_id for update;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one item.'; end if;
  if v_discount < 0 then raise exception 'Discount cannot be negative.'; end if;
  if v_bilti < 0 then raise exception 'Bilti cannot be negative.'; end if;
  if v_local < 0 then raise exception 'Local charges cannot be negative.'; end if;
  if p_term is not null and p_term not in ('cash', 'credit') then raise exception 'Choose cash or credit.'; end if;
  if v_discount > coalesce(s.discount, 0) and not p_can_discount then raise exception 'You do not have permission to give a discount.'; end if;

  select (value = 'true'::jsonb) into neg from app_settings where key = 'allow_negative_stock';
  neg := coalesce(neg, false);
  select * into r from routes where id = c.route_id;
  s_id := s.id; s_no := s.no;

  -- put the old goods back (a market line nets to zero stock; it is bought again below)
  for al in select a.location_id, a.qty, i.product_id, i.market
            from sale_item_allocs a join sale_items i on i.id = a.sale_item_id where i.sale_id = s_id loop
    if not al.market then
      insert into stock_movements (product_id, location_id, qty, type, note, ref) values (al.product_id, al.location_id, al.qty, 'sale_edit', s_no, s_id);
    end if;
  end loop;
  delete from expenses where ref_type = 'market' and ref_id in (select id from market_purchases where sale_id = s_id);
  delete from market_purchases where sale_id = s_id;
  delete from sale_items where sale_id = s_id;   -- their stock locations go with them

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
  if tot < s.paid then raise exception 'The new total (%) is less than the money already received on this invoice (%).', tot, s.paid; end if;
  if s.sale_kind = 'ledger' and tot > s.total and c.credit_limit > 0 then
    select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
    if bal + (tot - s.total) > c.credit_limit then
      raise exception 'This change takes the customer over the credit limit of %.', c.credit_limit;
    end if;
  end if;

  update sales set total = tot, line_discount = sum_ldisc, discount = v_discount, bilti = v_bilti, local_charges = v_local,
         remarks = nullif(trim(coalesce(p_remarks, '')), ''),
         pay_term = case when s.sale_kind = 'ledger' and p_term is not null then p_term else pay_term end,
         edit_count = edit_count + 1, edited_at = now(), edited_by = p_user
   where id = s_id;
  update customer_ledger set amount = tot where type = 'invoice' and ref = s_id;
  return s_id;
end $$;

revoke all on function edit_sale(uuid, uuid, jsonb, numeric, numeric, numeric, text, text, uuid, boolean, uuid[]) from public, anon, authenticated;
revoke all on function create_return(uuid, jsonb, boolean, text, uuid, text) from public, anon, authenticated;
revoke all on function stock_on_hand(uuid[]) from public, anon, authenticated;
