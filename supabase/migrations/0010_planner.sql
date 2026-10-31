-- Monthly planner: route types (weekly / fortnightly / monthly) and visit records.
-- Needs 0006_customers_routes.sql.

alter table routes add column if not exists frequency text not null default 'weekly' check (frequency in ('weekly', 'fortnightly', 'monthly'));
alter table routes add column if not exists cycle_start date;                                   -- fortnightly: the week of this date is a visit week
alter table routes add column if not exists month_week smallint check (month_week between 1 and 5);  -- monthly: 1st..4th occurrence of the visit day, 5 = last

create table visits (
  id uuid primary key default gen_random_uuid(),
  visit_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  customer_id uuid not null references customers(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  area_id uuid references areas(id) on delete set null,
  user_id uuid references app_users(id) on delete set null,
  outcome text not null check (outcome in ('Visited','Order placed','Payment collected','No order','Customer closed','Customer unavailable','Rescheduled','Cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index visits_day_idx on visits (visit_date, route_id);
create index visits_customer_idx on visits (customer_id, visit_date desc);
alter table visits enable row level security;
