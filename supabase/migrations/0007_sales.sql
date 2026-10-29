-- Sales: invoices, payments, customer ledger, discounts and settings.
-- Invoice creation, cancelling and collecting money are database functions, so stock, ledger and payment
-- change together or not at all.

-- ---------- settings and selling rules ----------
create table app_settings (key text primary key, value jsonb not null);
insert into app_settings (key, value) values ('allow_negative_stock', 'false'::jsonb) on conflict (key) do nothing;
alter table app_settings enable row level security;

alter table brands    add column if not exists discount_pct numeric(5,2) not null default 0;
alter table locations add column if not exists sell_priority int not null default 100;  -- lower = sold from first

create table customer_brand_discounts (
  customer_id uuid not null references customers(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  pct numeric(5,2) not null check (pct between 0 and 100),
  primary key (customer_id, brand_id)
);
alter table customer_brand_discounts enable row level security;

-- stock movements: new kinds and a link to the document that caused them
alter table stock_movements add column if not exists ref uuid;
alter table stock_movements drop constraint if exists stock_movements_type_check;
alter table stock_movements add constraint stock_movements_type_check
  check (type in ('opening','receive','issue','adjust','sale','sale_cancel','sale_return','market_buy','transfer_in','transfer_out'));

-- ---------- customer ledger ----------
-- amount > 0: the customer owes more (invoice).  amount < 0: the customer owes less (payment, return).
create table customer_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  ts timestamptz not null default now(),
  entry_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  type text not null check (type in ('opening','invoice','payment','return','refund','reversal')),
  amount numeric(14,2) not null,
  ref uuid,
  note text
);
create index customer_ledger_idx on customer_ledger (customer_id, ts);
alter table customer_ledger enable row level security;

-- opening balances entered with customers so far become the first ledger entries
insert into customer_ledger (customer_id, type, amount, ref)
select c.id, 'opening', c.opening_balance, c.id from customers c
where c.opening_balance <> 0 and not exists (select 1 from customer_ledger l where l.customer_id = c.id and l.type = 'opening');

create view customer_balances with (security_invoker = true) as
  select customer_id, sum(amount) as balance from customer_ledger group by customer_id;
revoke all on customer_balances from anon, authenticated;

-- ---------- invoices ----------
create sequence sale_no_seq;
create table sales (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('INV-' || lpad(nextval('sale_no_seq')::text, 4, '0')),
  sale_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  customer_id uuid not null references customers(id),
  customer_name text not null,
  route_id uuid references routes(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  discount numeric(14,2) not null default 0,        -- discount on the whole invoice
  line_discount numeric(14,2) not null default 0,   -- sum of the per-item discounts
  bilti numeric(14,2) not null default 0,           -- transport / freight charged
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  remarks text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  idem_key text unique,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index sales_customer_idx on sales (customer_id, created_at desc);
create index sales_date_idx on sales (sale_date desc);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  line_no int not null,
  product_id uuid not null references products(id),
  name text not null,
  qty numeric(14,3) not null check (qty > 0),
  free numeric(14,3) not null default 0,            -- free pieces from the buy+free scheme
  price numeric(14,2) not null,
  disc_pct numeric(5,2) not null default 0,
  line_disc numeric(14,2) not null default 0
);
create index sale_items_sale_idx on sale_items (sale_id);

-- which location each piece came from (an item can be filled from several locations)
create table sale_item_allocs (
  id uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references sale_items(id) on delete cascade,
  location_id uuid not null references locations(id),
  qty numeric(14,3) not null
);
create index sale_item_allocs_idx on sale_item_allocs (sale_item_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  pay_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  customer_id uuid not null references customers(id),
  amount numeric(14,2) not null check (amount > 0),
  kind text not null check (kind in ('invoice','collection')),  -- paid with an invoice / collected later
  sale_id uuid references sales(id),
  collector_id uuid references app_users(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  reversed boolean not null default false,
  idem_key text unique,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_customer_idx on payments (customer_id, created_at desc);

alter table sales            enable row level security;
alter table sale_items       enable row level security;
alter table sale_item_allocs enable row level security;
alter table payments         enable row level security;

-- ---------- create an invoice ----------
create or replace function create_sale(
  p_customer uuid, p_location uuid, p_lines jsonb, p_discount numeric, p_bilti numeric, p_paid numeric,
  p_remarks text, p_idem text, p_user uuid, p_can_discount boolean, p_allowed uuid[]
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
  if v_discount > 0 and not p_can_discount then raise exception 'You do not have permission to give a discount.'; end if;

  select (value = 'true'::jsonb) into neg from app_settings where key = 'allow_negative_stock';
  neg := coalesce(neg, false);

  select * into r from routes where id = c.route_id;

  insert into sales (customer_id, customer_name, route_id, area_id, salesman_id, discount, bilti, remarks, idem_key, created_by)
  values (c.id, c.name, c.route_id, c.area_id, coalesce(r.salesman_id, p_user), v_discount, v_bilti,
          nullif(trim(coalesce(p_remarks, '')), ''), p_idem, p_user)
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

  tot := gross - sum_ldisc - v_discount + v_bilti;
  if tot < 0 then raise exception 'Discount is larger than the total.'; end if;
  v_paid := case when c.is_walk_in then tot else coalesce(p_paid, 0) end;
  if v_paid < 0 then raise exception 'Payment cannot be negative.'; end if;
  if v_paid > tot then raise exception 'Payment is larger than the invoice total.'; end if;
  v_credit := tot - v_paid;
  if v_credit > 0 and c.credit_limit > 0 then
    select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
    if bal + v_credit > c.credit_limit then
      raise exception 'This credit sale exceeds the customer credit limit of %.', c.credit_limit;
    end if;
  end if;

  update sales set total = tot, paid = v_paid, line_discount = sum_ldisc where id = s_id;
  insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'invoice', tot, s_id);
  if v_paid > 0 then
    insert into payments (customer_id, amount, kind, sale_id, collector_id, route_id, area_id, created_by)
    values (c.id, v_paid, 'invoice', s_id, coalesce(r.salesman_id, p_user), c.route_id, c.area_id, p_user)
    returning id into pay_id;
    insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'payment', -v_paid, pay_id);
  end if;
  return s_id;
end $$;

-- ---------- cancel an invoice ----------
create or replace function cancel_sale(p_sale uuid, p_user uuid) returns void language plpgsql as $$
declare
  s sales%rowtype;
  a record;
  pay record;
begin
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if s.status <> 'confirmed' then raise exception 'Only confirmed invoices can be cancelled.'; end if;
  for a in select i.product_id, al.location_id, al.qty
           from sale_items i join sale_item_allocs al on al.sale_item_id = i.id where i.sale_id = s.id loop
    insert into stock_movements (product_id, location_id, qty, type, note, ref) values (a.product_id, a.location_id, a.qty, 'sale_cancel', s.no, s.id);
  end loop;
  update sales set status = 'cancelled', cancelled_at = now() where id = s.id;
  insert into customer_ledger (customer_id, type, amount, ref) values (s.customer_id, 'reversal', -s.total, s.id);
  for pay in select id, amount from payments where sale_id = s.id and not reversed loop
    insert into customer_ledger (customer_id, type, amount, ref) values (s.customer_id, 'reversal', pay.amount, pay.id);
    update payments set reversed = true where id = pay.id;
  end loop;
end $$;

-- ---------- collect money from a customer ----------
create or replace function collect_payment(p_customer uuid, p_amount numeric, p_idem text, p_user uuid) returns uuid language plpgsql as $$
declare
  c customers%rowtype;
  r routes%rowtype;
  bal numeric;
  pay_id uuid;
begin
  if p_idem is not null then
    select id into pay_id from payments where idem_key = p_idem;
    if found then return pay_id; end if;
  end if;
  select * into c from customers where id = p_customer for update;
  if not found then raise exception 'Choose a customer.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero.'; end if;
  select coalesce(sum(amount), 0) into bal from customer_ledger where customer_id = c.id;
  if p_amount > bal then raise exception 'Amount is more than the outstanding balance of %.', bal; end if;
  select * into r from routes where id = c.route_id;
  insert into payments (customer_id, amount, kind, collector_id, route_id, area_id, idem_key, created_by)
  values (c.id, p_amount, 'collection', coalesce(r.salesman_id, p_user), c.route_id, c.area_id, p_idem, p_user)
  returning id into pay_id;
  insert into customer_ledger (customer_id, type, amount, ref) values (c.id, 'payment', -p_amount, pay_id);
  return pay_id;
end $$;

revoke all on function create_sale(uuid, uuid, jsonb, numeric, numeric, numeric, text, text, uuid, boolean, uuid[]) from public, anon, authenticated;
revoke all on function cancel_sale(uuid, uuid) from public, anon, authenticated;
revoke all on function collect_payment(uuid, numeric, text, uuid) from public, anon, authenticated;
