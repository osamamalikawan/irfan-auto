-- Customers, cities, areas and routes (from the prototype's Customers and Routes & Areas screens).
-- ora_* columns keep the old Oracle system's ids so the data can be imported later.

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ora_cityno int unique
);
create unique index cities_name_key on cities (lower(name));

create table areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  name text not null
);
create unique index areas_city_name_key on areas (city_id, lower(name));

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  salesman_id uuid references app_users(id) on delete set null,
  list_id uuid references price_lists(id) on delete set null,   -- price list this route sells from (old ROUTE.CATID)
  visit_days text[] not null default '{}',                       -- Mon..Sat
  fuel_cost int not null default 0,
  target_sales numeric(14,2) not null default 0,
  target_collection numeric(14,2) not null default 0,
  target_visits int not null default 0,
  active boolean not null default true,
  ora_routeid int unique,
  created_at timestamptz not null default now()
);
create unique index routes_name_key on routes (lower(name));

create table route_areas (
  route_id uuid not null references routes(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  primary key (route_id, area_id)
);

create sequence customer_code_seq;
create table customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('C-' || lpad(nextval('customer_code_seq')::text, 4, '0')),
  name text not null,
  name_ur text,
  owner text,
  phone text,
  phone2 text,
  address text,
  cnic text,
  ntn text,
  email text,
  gps text,
  credit_limit numeric(14,2) not null default 0,
  credit_days int not null default 0,
  opening_balance numeric(14,2) not null default 0,   -- becomes the first ledger entry when Sales is built
  area_id uuid references areas(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_walk_in boolean not null default false,
  ora_ccode int unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_route_idx on customers (route_id);
create index customers_area_idx on customers (area_id);
create index customers_name_trgm on customers using gin (name gin_trgm_ops);

create table customer_remarks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  text text not null check (char_length(text) <= 500),
  by_user uuid references app_users(id) on delete set null,
  by_name text not null,
  created_at timestamptz not null default now()
);
create index customer_remarks_idx on customer_remarks (customer_id, created_at desc);

create table customer_route_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  from_date date not null default current_date,
  to_date date
);
create index customer_route_history_idx on customer_route_history (customer_id);

-- counts for the Routes & Areas screen
create or replace function area_customer_counts() returns table (area_id uuid, n bigint)
language sql stable as $$ select area_id, count(*) from customers where status = 'active' and not is_walk_in and area_id is not null group by area_id $$;
create or replace function route_customer_counts() returns table (route_id uuid, n bigint)
language sql stable as $$ select route_id, count(*) from customers where status = 'active' and not is_walk_in and route_id is not null group by route_id $$;
revoke all on function area_customer_counts() from public, anon, authenticated;
revoke all on function route_customer_counts() from public, anon, authenticated;

alter table cities                enable row level security;
alter table areas                 enable row level security;
alter table routes                enable row level security;
alter table route_areas           enable row level security;
alter table customers             enable row level security;
alter table customer_remarks      enable row level security;
alter table customer_route_history enable row level security;

-- the shop's cash customer, used later by the Sales screen
insert into customers (code, name, is_walk_in) values ('WALK-IN', 'Walk-in customer', true) on conflict (code) do nothing;
