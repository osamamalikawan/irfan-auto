-- Salesman field work: attendance, live location, and office-approved requests.
-- Needs 0004 (users), 0006 (customers), 0007-0015 (sales, payments, returns). Safe to run once, after 0015.
--
--  * Attendance: one row per salesman per day, with the place and time of check-in and check-out.
--  * Location pings: the phone sends its position while the salesman is on duty; the office sees the latest one.
--  * Requests: a salesman never writes to stock or the ledger himself. He files an order, a payment or a return;
--    when the office approves it, the existing create_sale / collect_payment / create_return runs in the same
--    database step, so stock and the customer ledger are changed only by approved requests.

-- ---------- permissions (added to the Salesman role; Administrator already has everything) ----------
update roles set perms = perms || array['attendance.mark', 'orders.request', 'payments.request', 'returns.request']
 where id = 'salesman' and not ('attendance.mark' = any (perms));

-- ---------- attendance ----------
create table attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  work_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  check_in_at timestamptz not null default now(),
  in_lat double precision not null,
  in_lng double precision not null,
  in_accuracy real,                          -- metres
  check_out_at timestamptz,
  out_lat double precision,
  out_lng double precision,
  out_accuracy real,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);
create index attendance_date_idx on attendance (work_date desc, user_id);
alter table attendance enable row level security;

-- Start work. A second tap while still on duty changes nothing; after a check-out the same day it resumes the shift.
create or replace function attendance_check_in(p_user uuid, p_lat double precision, p_lng double precision, p_acc real)
returns attendance language plpgsql as $$
declare a attendance%rowtype;
begin
  insert into attendance (user_id, in_lat, in_lng, in_accuracy) values (p_user, p_lat, p_lng, p_acc)
  on conflict (user_id, work_date) do update
    set check_out_at = null, out_lat = null, out_lng = null, out_accuracy = null
    where attendance.check_out_at is not null
  returning * into a;
  if not found then
    select * into a from attendance where user_id = p_user and work_date = ((now() at time zone 'Asia/Karachi')::date);
  end if;
  return a;
end $$;

create or replace function attendance_check_out(p_user uuid, p_lat double precision, p_lng double precision, p_acc real)
returns attendance language plpgsql as $$
declare a attendance%rowtype;
begin
  update attendance set check_out_at = now(), out_lat = p_lat, out_lng = p_lng, out_accuracy = p_acc
   where user_id = p_user and work_date = ((now() at time zone 'Asia/Karachi')::date) and check_out_at is null
  returning * into a;
  if not found then raise exception 'You are not checked in today.'; end if;
  return a;
end $$;

-- ---------- location pings ----------
create table location_pings (
  id bigint generated always as identity primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  attendance_id uuid references attendance(id) on delete set null,
  recorded_at timestamptz not null,          -- the phone's clock when the position was taken
  received_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  battery smallint,
  unique (user_id, recorded_at)              -- a retried upload cannot duplicate a point
);
create index location_pings_user_idx on location_pings (user_id, recorded_at desc);
alter table location_pings enable row level security;

-- Every active salesman with his last known position and whether he is on duty today.
create or replace function salesman_locations()
returns table (user_id uuid, name text, lat double precision, lng double precision, accuracy real, recorded_at timestamptz,
               battery smallint, on_duty boolean, check_in_at timestamptz, check_out_at timestamptz)
language sql stable as $$
  select u.id, u.name, p.lat, p.lng, p.accuracy, p.recorded_at, p.battery,
         (a.id is not null and a.check_out_at is null), a.check_in_at, a.check_out_at
    from app_users u
    left join lateral (select x.* from location_pings x where x.user_id = u.id order by x.recorded_at desc limit 1) p on true
    left join attendance a on a.user_id = u.id and a.work_date = ((now() at time zone 'Asia/Karachi')::date)
   where u.is_salesman and u.active
   order by u.name
$$;

-- ---------- requests ----------
create sequence order_req_seq;
create sequence payment_req_seq;
create sequence return_req_seq;

-- Temporary invoice. `lines` is what the salesman entered; `final_lines` is what the office actually invoiced.
create table order_requests (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('ORQ-' || lpad(nextval('order_req_seq')::text, 4, '0')),
  customer_id uuid not null references customers(id),
  customer_name text not null,
  salesman_id uuid not null references app_users(id),
  kind text not null default 'ledger' check (kind in ('counter', 'ledger')),
  term text not null default 'credit' check (term in ('cash', 'credit')),
  lines jsonb not null,                      -- [{ product_id, name, qty, price }]  (price = list price when entered, for display)
  bilti numeric(14,2) not null default 0,
  local_charges numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  remarks text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  final_lines jsonb,
  sale_id uuid references sales(id) on delete set null,
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  idem_key text unique,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index order_requests_status_idx on order_requests (status, created_at desc);
create index order_requests_salesman_idx on order_requests (salesman_id, created_at desc);

create table payment_requests (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('PRQ-' || lpad(nextval('payment_req_seq')::text, 4, '0')),
  customer_id uuid not null references customers(id),
  customer_name text not null,
  salesman_id uuid not null references app_users(id),
  amount numeric(14,2) not null check (amount > 0),
  method_id uuid references payment_methods(id) on delete set null,
  method text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approved_amount numeric(14,2),
  payment_id uuid references payments(id) on delete set null,
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  idem_key text unique,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index payment_requests_status_idx on payment_requests (status, created_at desc);
create index payment_requests_salesman_idx on payment_requests (salesman_id, created_at desc);

-- Goods taken back from a customer: a return, or a claim (defective goods). Both go through create_return when approved.
create table return_requests (
  id uuid primary key default gen_random_uuid(),
  no text not null unique default ('RRQ-' || lpad(nextval('return_req_seq')::text, 4, '0')),
  kind text not null default 'return' check (kind in ('return', 'claim')),
  sale_id uuid not null references sales(id),
  sale_no text not null,
  customer_id uuid not null references customers(id),
  customer_name text not null,
  salesman_id uuid not null references app_users(id),
  lines jsonb not null,                      -- [{ item_id, name, qty }]
  damaged boolean not null default false,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  return_id uuid references sale_returns(id) on delete set null,
  reviewed_by uuid references app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  idem_key text unique,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index return_requests_status_idx on return_requests (status, created_at desc);
create index return_requests_salesman_idx on return_requests (salesman_id, created_at desc);

alter table order_requests   enable row level security;
alter table payment_requests enable row level security;
alter table return_requests  enable row level security;

-- ---------- approve an order: becomes a normal Active invoice ----------
-- p_lines (optional) replaces the salesman's lines: [{ product_id, qty, price?, disc_pct?, location_id? }]
create or replace function approve_order_request(
  p_req uuid, p_user uuid, p_lines jsonb, p_discount numeric, p_bilti numeric, p_local numeric, p_remarks text,
  p_can_discount boolean, p_allowed uuid[]
) returns uuid language plpgsql as $$
declare r order_requests%rowtype; v_lines jsonb; s_id uuid;
begin
  select * into r from order_requests where id = p_req for update;
  if not found then raise exception 'Order request not found.'; end if;
  if r.status = 'approved' then return r.sale_id; end if;                 -- a double tap changes nothing
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status; end if;

  v_lines := p_lines;
  if v_lines is null then
    select jsonb_agg(jsonb_build_object('product_id', l->>'product_id', 'qty', (l->>'qty')::numeric)) into v_lines
      from jsonb_array_elements(r.lines) l;
  end if;

  s_id := create_sale(r.customer_id, null, v_lines, coalesce(p_discount, r.discount), coalesce(p_bilti, r.bilti),
                      coalesce(p_remarks, r.remarks), 'orq-' || r.id::text, p_user, p_can_discount, p_allowed,
                      r.kind, r.term, false, coalesce(p_local, r.local_charges), null, null, '[]'::jsonb);
  update sales set salesman_id = r.salesman_id where id = s_id;           -- the sale counts for the salesman who took the order
  update order_requests set status = 'approved', final_lines = v_lines, sale_id = s_id, reviewed_by = p_user, reviewed_at = now()
   where id = r.id;
  return s_id;
end $$;

-- ---------- approve a payment: goes into the customer ledger ----------
create or replace function approve_payment_request(p_req uuid, p_user uuid, p_amount numeric, p_method uuid)
returns uuid language plpgsql as $$
declare r payment_requests%rowtype; v_amount numeric; pay_id uuid;
begin
  select * into r from payment_requests where id = p_req for update;
  if not found then raise exception 'Payment request not found.'; end if;
  if r.status = 'approved' then return r.payment_id; end if;
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status; end if;

  v_amount := coalesce(p_amount, r.amount);
  pay_id := collect_payment(r.customer_id, v_amount, coalesce(p_method, r.method_id), 'prq-' || r.id::text, p_user);
  update payments set collector_id = r.salesman_id where id = pay_id;      -- collection counts for the salesman who took the money
  update payment_requests set status = 'approved', approved_amount = v_amount, payment_id = pay_id, reviewed_by = p_user, reviewed_at = now()
   where id = r.id;
  return pay_id;
end $$;

-- ---------- approve a return or claim: stock back, customer credited ----------
-- p_lines (optional) replaces the salesman's lines: [{ item_id, qty }]
create or replace function approve_return_request(p_req uuid, p_user uuid, p_lines jsonb, p_damaged boolean)
returns uuid language plpgsql as $$
declare r return_requests%rowtype; v_lines jsonb; ret_id uuid;
begin
  select * into r from return_requests where id = p_req for update;
  if not found then raise exception 'Return request not found.'; end if;
  if r.status = 'approved' then return r.return_id; end if;
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status; end if;

  v_lines := p_lines;
  if v_lines is null then
    select jsonb_agg(jsonb_build_object('item_id', l->>'item_id', 'qty', (l->>'qty')::numeric)) into v_lines
      from jsonb_array_elements(r.lines) l;
  end if;

  ret_id := create_return(r.sale_id, v_lines, coalesce(p_damaged, r.damaged), coalesce(r.reason, ''), p_user);
  update sale_returns set salesman_id = r.salesman_id where id = ret_id;
  update return_requests set status = 'approved', return_id = ret_id, reviewed_by = p_user, reviewed_at = now() where id = r.id;
  return ret_id;
end $$;
