-- Salesman's own account: the money he collected from customers and what he handed over to the office.
-- Needs 0016. Safe to run once.
--
--  collected  = every payment he received (collector = him), cash or bank/Easypaisa/JazzCash
--  handed over = recorded by the office when it receives the money from him (or confirms a bank transfer arrived)
--  balance    = collected - handed over = money still to be accounted for by him
--
-- Counting starts on `cash_start` (default: the day you run this), so old payments from before this feature do not
-- show up as money he "still holds". To count from another day, change app_users.cash_start for that salesman.

alter table app_users add column if not exists cash_start date not null default ((now() at time zone 'Asia/Karachi')::date);

create sequence if not exists handover_no_seq;
create table cash_handovers (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('HO-' || lpad(nextval('handover_no_seq')::text, 4, '0')),
  user_id uuid not null references app_users(id),
  amount numeric(14,2) not null check (amount > 0),
  method_id uuid references payment_methods(id) on delete set null,
  method text,
  handed_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  note text,
  voided boolean not null default false,          -- a wrong entry is voided, never deleted
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cash_handovers_user_idx on cash_handovers (user_id, handed_date desc);
alter table cash_handovers enable row level security;

-- Balance up to and including a day.
create or replace function salesman_cash_balance(p_user uuid, p_to date) returns numeric language sql stable as $$
  select coalesce((select sum(p.amount) from payments p, app_users u
                    where u.id = p_user and p.collector_id = u.id and not p.reversed and p.pay_date >= u.cash_start and p.pay_date <= p_to), 0)
       - coalesce((select sum(h.amount) from cash_handovers h, app_users u
                    where u.id = p_user and h.user_id = u.id and not h.voided and h.handed_date >= u.cash_start and h.handed_date <= p_to), 0)
$$;

-- The statement between two days, oldest first, with the running balance. amount > 0 collected, amount < 0 handed over.
create or replace function salesman_cash_statement(p_user uuid, p_from date, p_to date)
returns table (ts timestamptz, entry_date date, type text, ref uuid, customer_name text, method text, note text, amount numeric, balance numeric)
language sql stable as $$
  with st as (select cash_start from app_users where id = p_user),
  ev as (
    select p.created_at as t, p.pay_date as d, 'collection'::text as k, p.id as r, c.name::text as cust, p.method::text as m, null::text as nt, p.amount as amt
      from payments p join customers c on c.id = p.customer_id, st
     where p.collector_id = p_user and not p.reversed and p.pay_date >= st.cash_start and p.pay_date <= p_to
    union all
    select h.created_at, h.handed_date, 'handover'::text, h.id, null::text, h.method::text, h.note::text, -h.amount
      from cash_handovers h, st
     where h.user_id = p_user and not h.voided and h.handed_date >= st.cash_start and h.handed_date <= p_to
  ),
  run as (select ev.*, sum(ev.amt) over (order by ev.d, ev.t, ev.r rows between unbounded preceding and current row) as bal from ev)
  select run.t, run.d, run.k, run.r, run.cust, run.m, run.nt, run.amt, run.bal from run where run.d >= p_from order by run.d, run.t, run.r
$$;

-- Every active salesman's position, for the office.
create or replace function salesman_cash_balances()
returns table (user_id uuid, name text, cash_start date, collected numeric, handed_over numeric, balance numeric)
language sql stable as $$
  select u.id, u.name::text, u.cash_start, c.s, h.s, c.s - h.s
    from app_users u
    cross join lateral (select coalesce(sum(p.amount), 0) as s from payments p
                         where p.collector_id = u.id and not p.reversed and p.pay_date >= u.cash_start) c
    cross join lateral (select coalesce(sum(x.amount), 0) as s from cash_handovers x
                         where x.user_id = u.id and not x.voided and x.handed_date >= u.cash_start) h
   where u.is_salesman and u.active
   order by u.name
$$;

-- The customers on a salesman's routes with what each owes.
create or replace function salesman_customers(p_user uuid)
returns table (id uuid, code text, name text, name_ur text, phone text, credit_limit numeric, area text, route text, balance numeric)
language sql stable as $$
  select c.id, c.code::text, c.name::text, c.name_ur::text, c.phone::text, c.credit_limit::numeric, a.name::text, r.name::text, coalesce(b.balance, 0)::numeric
    from customers c
    join routes r on r.id = c.route_id
    left join areas a on a.id = c.area_id
    left join customer_balances b on b.customer_id = c.id
   where r.salesman_id = p_user and c.status = 'active' and not c.is_walk_in
   order by c.name
$$;
