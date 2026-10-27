-- Users & Roles with PIN login.
-- First sign-in: user "Admin", PIN 1111. The app forces a new PIN straight away.

create extension if not exists pgcrypto;

create table roles (
  id text primary key,
  name text not null unique,
  perms text[] not null default '{}',     -- permission keys, or {"*"} for everything
  own_only boolean not null default false, -- sees only their own customers/sales (used by later modules)
  system boolean not null default false    -- the Administrator role cannot be edited
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_id text not null references roles(id),
  pin_hash text not null,
  active boolean not null default true,
  must_change_pin boolean not null default false,
  location_ids uuid[],                     -- null = may work at every location
  is_salesman boolean not null default false,
  target_sales numeric(14,2) not null default 0,
  target_collection numeric(14,2) not null default 0,
  target_visits int not null default 0,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index app_users_name_key on app_users (lower(name));

alter table roles     enable row level security;
alter table app_users enable row level security;

insert into roles (id, name, perms, own_only, system) values
  ('admin',     'Administrator',    '{"*"}', false, true),
  ('salesman',  'Salesman',         '{sales.create,payments.receive,visits.record,reports.view,customers.view}', true,  false),
  ('cashier',   'Cashier',          '{sales.create,payments.receive,stock.view}', false, false),
  ('warehouse', 'Warehouse Worker', '{stock.transfer,stock.view,racks.manage,stock.restock}', false, false)
on conflict (id) do nothing;

insert into app_users (name, role_id, pin_hash, must_change_pin)
select 'Admin', 'admin', crypt('1111', gen_salt('bf', 10)), true
where not exists (select 1 from app_users);
