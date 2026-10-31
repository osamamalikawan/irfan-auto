-- Route plans: a route on a date is completed with a fuel cost, and customers' responses are recorded.
-- Needs 0008 (expenses) and 0010 (visits, route types).

-- A response can carry a promise to pay (the old system's PROMISE table).
alter table visits add column if not exists promise_date date;
alter table visits add column if not exists promise_amount numeric(14,2);

create table route_runs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  run_date date not null,
  salesman_id uuid references app_users(id) on delete set null,
  planned int not null default 0,                 -- customers on the route when it was completed
  fuel_cost numeric(14,2) not null default 0,
  note text,
  expense_id uuid references expenses(id) on delete set null,
  completed_by uuid references app_users(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (route_id, run_date)
);
create index route_runs_date_idx on route_runs (run_date desc);
alter table route_runs enable row level security;

-- Mark a route completed for a date. The fuel cost is posted to Expenses as "Fuel".
create or replace function complete_route(p_route uuid, p_date date, p_fuel numeric, p_note text, p_user uuid)
returns uuid language plpgsql as $$
declare
  r routes%rowtype;
  run_id uuid;
  exp_id uuid;
  n int;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Karachi')::date);
  v_fuel numeric := round(coalesce(p_fuel, 0));
begin
  select * into r from routes where id = p_route for update;
  if not found then raise exception 'Route not found.'; end if;
  if v_date > v_today then raise exception 'You cannot complete a route for a future date.'; end if;
  if v_fuel < 0 then raise exception 'Fuel cost cannot be negative.'; end if;
  if exists (select 1 from route_runs where route_id = r.id and run_date = v_date) then
    raise exception 'This route is already completed for that date.';
  end if;
  select count(*) into n from customers where route_id = r.id and status = 'active' and not is_walk_in;
  insert into route_runs (route_id, run_date, salesman_id, planned, fuel_cost, note, completed_by)
  values (r.id, v_date, r.salesman_id, n, v_fuel, nullif(trim(coalesce(p_note, '')), ''), p_user)
  returning id into run_id;
  if v_fuel > 0 then
    insert into expenses (expense_date, amount, category, note, route_id, ref_type, ref_id, created_by)
    values (v_date, v_fuel, 'Fuel', 'Fuel - ' || r.name || ' (' || v_date::text || ')', r.id, 'route_run', run_id, p_user)
    returning id into exp_id;
    update route_runs set expense_id = exp_id where id = run_id;
  end if;
  return run_id;
end $$;

-- Reopen a completed route: its fuel expense is cancelled.
create or replace function undo_route(p_run uuid, p_user uuid) returns void language plpgsql as $$
declare rr route_runs%rowtype;
begin
  select * into rr from route_runs where id = p_run for update;
  if not found then raise exception 'Completed route not found.'; end if;
  if rr.expense_id is not null then update expenses set voided = true where id = rr.expense_id; end if;
  delete from route_runs where id = rr.id;
end $$;

revoke all on function complete_route(uuid, date, numeric, text, uuid) from public, anon, authenticated;
revoke all on function undo_route(uuid, uuid) from public, anon, authenticated;
