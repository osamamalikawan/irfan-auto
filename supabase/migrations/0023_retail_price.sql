-- Retail price (RP) next to the existing price (CP).
-- Counter sales use RP and ledger sales use CP; when a product has only one of them, that one is used.
-- Needs 0001-0022.

alter table products add column if not exists rp numeric(12,2) not null default 0 check (rp >= 0);

-- ---------- create_sale: line price from the invoice's price type ----------
-- Each line may carry "price_type": "rp" | "cp". Without it counter sales use RP and ledger sales use CP.
-- A typed price still wins. Choosing the product's RP or CP never needs the "change prices" permission.
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

    price := case
      when ln->>'price' is not null then round((ln->>'price')::numeric)
      when coalesce(ln->>'price_type', case when p_kind = 'counter' then 'rp' else 'cp' end) = 'rp' then case when p.rp > 0 then p.rp else p.cp end
      else case when p.cp > 0 then p.cp else p.rp end
    end;
    if price <= 0 then raise exception 'Set a price for % before selling it.', p.name_en; end if;
    if price <> p.cp and price <> p.rp and not p_can_discount and not is_mkt then raise exception 'You do not have permission to change prices.'; end if;

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

-- ---------- edit_sale: same price rule (new lines default to CP unless the line says "rp") ----------
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

    price := case
      when ln->>'price' is not null then round((ln->>'price')::numeric)
      when coalesce(ln->>'price_type', 'cp') = 'rp' then case when p.rp > 0 then p.rp else p.cp end
      else case when p.cp > 0 then p.cp else p.rp end
    end;
    if price <= 0 then raise exception 'Set a price for % before selling it.', p.name_en; end if;
    if price <> p.cp and price <> p.rp and not p_can_discount and not is_mkt then raise exception 'You do not have permission to change prices.'; end if;

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

-- ---------- Products page: RP column and a "No RP" filter ----------
drop function if exists products_page(text, uuid, uuid, uuid, uuid, text, int, int);
create or replace function products_page(
  p_q text default null, p_list uuid default null, p_company uuid default null, p_brand uuid default null,
  p_supplier uuid default null, p_filter text default 'all', p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, name_en text, name_ur text, code_name text, scheme text, cp numeric, rp numeric, purchase_price numeric, unit text,
  reorder_level numeric, list_id uuid, list_name text, company_id uuid, company text, brand_id uuid, brand text,
  on_hand numeric, suppliers jsonb, total bigint
) language sql stable as $$
  select p.id, p.name_en, p.name_ur, p.code_name, p.scheme, p.cp, p.rp, p.purchase_price, p.unit, p.reorder_level,
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
         or (p_filter = 'nolist' and p.list_id is null)
         or (p_filter = 'norp' and p.rp <= 0))
    and not exists (
      select 1 from unnest(string_to_array(trim(coalesce(p_q, '')), ' ')) w
      where w <> '' and not (concat_ws(' ', p.name_en, p.name_ur, p.code_name, b.name, c.name, (select string_agg(su2.name, ' ') from product_suppliers ps2 join suppliers su2 on su2.id = ps2.supplier_id where ps2.product_id = p.id)) ilike '%' || w || '%'))
  order by p.name_en
  limit p_limit offset p_offset
$$;
revoke all on function products_page(text, uuid, uuid, uuid, uuid, text, int, int) from public, anon, authenticated;
