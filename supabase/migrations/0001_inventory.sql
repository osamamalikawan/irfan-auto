-- Irfan Autos: Inventory module (no users/auth yet).
-- All access goes through the Next.js server using the service-role key.
-- RLS is enabled with no policies, so the public anon key can read/write nothing.

create extension if not exists pg_trgm;

create table price_lists (id uuid primary key default gen_random_uuid(), name text not null unique);
create table companies   (id uuid primary key default gen_random_uuid(), name text not null unique);
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  company_id uuid references companies(id) on delete set null
);
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null default 'Godown',
  active boolean not null default true
);
create table racks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  code text not null,
  unique (location_id, code)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  legacy_no int unique,               -- "#" column of the old sheet
  name_en text not null,
  code_name text,
  name_ur text,
  scheme text,                        -- raw text, e.g. "9+1"
  scheme_buy int,
  scheme_free int,
  cost numeric(14,2) not null default 0,   -- CP
  unit text not null default 'pc',
  reorder_level numeric(14,3) not null default 0,
  list_id uuid references price_lists(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  default_location_id uuid references locations(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_list_idx on products(list_id);
create index products_name_trgm on products using gin (name_en gin_trgm_ops);
create index products_code_trgm on products using gin (code_name gin_trgm_ops);
create index products_urdu_trgm on products using gin (name_ur gin_trgm_ops);

-- A product can sit in several locations, and on several racks.
create table product_locations (
  product_id uuid not null references products(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (product_id, location_id)
);
create table product_racks (
  product_id uuid not null references products(id) on delete cascade,
  rack_id uuid not null references racks(id) on delete cascade,
  primary key (product_id, rack_id)
);

-- Stock ledger: quantity is always derived from this, never overwritten.
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  location_id uuid not null references locations(id),
  qty numeric(14,3) not null check (qty <> 0),   -- signed
  type text not null check (type in ('opening','receive','issue','adjust')),
  note text,
  created_at timestamptz not null default now()
);
create index stock_movements_pl_idx on stock_movements(product_id, location_id);

create view stock_levels with (security_invoker = true) as
  select product_id, location_id, sum(qty) as qty
  from stock_movements group by product_id, location_id;

-- Paged, filtered list for the stock screen (and the Android app).
create or replace function inventory_list(
  p_q text default null, p_list uuid default null, p_filter text default 'all',
  p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, legacy_no int, name_en text, code_name text, name_ur text, scheme text,
  cost numeric, unit text, reorder_level numeric, list_name text, brand text, company text,
  on_hand numeric, racks text[], locations text[], by_location jsonb, total bigint
) language sql stable as $$
  select p.id, p.legacy_no, p.name_en, p.code_name, p.name_ur, p.scheme,
         p.cost, p.unit, p.reorder_level, l.name, b.name, c.name,
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
    and (coalesce(p_q, '') = '' or p.name_en ilike '%' || p_q || '%'
         or p.code_name ilike '%' || p_q || '%' or p.name_ur ilike '%' || p_q || '%'
         or b.name ilike '%' || p_q || '%'
         or exists (select 1 from product_racks pr2 join racks r2 on r2.id = pr2.rack_id
                    where pr2.product_id = p.id and r2.code ilike '%' || p_q || '%'))
    and (p_list is null or p.list_id = p_list)
    and (p_filter = 'all'
         or (p_filter = 'low'    and p.reorder_level > 0 and coalesce(s.on_hand, 0) <= p.reorder_level)
         or (p_filter = 'out'    and coalesce(s.on_hand, 0) <= 0)
         or (p_filter = 'norack' and rk.racks is null))
  order by p.legacy_no nulls last, p.name_en
  limit p_limit offset p_offset
$$;

-- Atomic stock change; refuses to take a location below zero.
create or replace function adjust_stock(
  p_product uuid, p_location uuid, p_qty numeric, p_type text, p_note text default null
) returns numeric language plpgsql as $$
declare cur numeric;
begin
  if p_qty = 0 then raise exception 'Quantity cannot be zero'; end if;
  select coalesce(sum(qty), 0) into cur from stock_movements
   where product_id = p_product and location_id = p_location;
  if cur + p_qty < 0 then
    raise exception 'Not enough stock here (have %)', cur;
  end if;
  insert into stock_movements(product_id, location_id, qty, type, note)
  values (p_product, p_location, p_qty, p_type, nullif(p_note, ''));
  insert into product_locations(product_id, location_id) values (p_product, p_location)
  on conflict do nothing;
  return cur + p_qty;
end $$;

alter table price_lists       enable row level security;
alter table companies         enable row level security;
alter table brands            enable row level security;
alter table locations         enable row level security;
alter table racks             enable row level security;
alter table products          enable row level security;
alter table product_locations enable row level security;
alter table product_racks     enable row level security;
alter table stock_movements   enable row level security;

revoke all on function inventory_list(text, uuid, text, int, int) from public, anon, authenticated;
revoke all on function adjust_stock(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on stock_levels from anon, authenticated;
