-- Employees: details, salary (daily / weekly / monthly), payments and a ledger for each person.
-- Every user (login) is an employee: a trigger gives each new user an employee record, and existing users get one below.
-- An employee does not need a login (drivers, helpers...). Needs 0004 (users) and 0008 (expenses).

create sequence employee_code_seq;

create table employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('EMP-' || lpad(nextval('employee_code_seq')::text, 3, '0')),
  name text not null,
  phone text,
  cnic text,
  address text,
  designation text,
  join_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  leave_date date,
  status text not null default 'active' check (status in ('active', 'left')),
  salary_type text not null default 'monthly' check (salary_type in ('daily', 'weekly', 'monthly')),
  salary_amount numeric(14,2) not null default 0 check (salary_amount >= 0),   -- per day, per week or per month, as salary_type says
  weekly_off smallint check (weekly_off between 0 and 6),                      -- daily wages are not earned on this weekday (0 = Sunday ... 6 = Saturday)
  accrue_from date,                                                            -- salary is posted from this day (default: the join date)
  notes text,
  user_id uuid unique references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table employees enable row level security;

-- Positive amounts: the shop owes the employee (salary, bonus, opening balance owed). Negative: paid to him, advance, or deducted.
create table employee_ledger (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  entry_date date not null default ((now() at time zone 'Asia/Karachi')::date),
  type text not null check (type in ('opening', 'salary', 'bonus', 'deduction', 'payment', 'advance')),
  amount numeric(14,2) not null,
  note text,
  period_from date,
  period_to date,
  method text,
  expense_id uuid references expenses(id) on delete set null,   -- the cash-book entry made by a payment or advance
  voided boolean not null default false,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index employee_ledger_idx on employee_ledger (employee_id, entry_date);
-- one salary entry per period, also when it was cancelled (a cancelled period is not posted again)
create unique index employee_salary_period on employee_ledger (employee_id, period_from) where type = 'salary';
alter table employee_ledger enable row level security;

create or replace view employee_balances as
  select employee_id, coalesce(sum(amount), 0) as balance from employee_ledger where not voided group by employee_id;
revoke all on employee_balances from anon, authenticated;

-- ---------- every user is an employee ----------
create or replace function app_users_make_employee() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from employees where user_id = new.id) then
    insert into employees (name, user_id, designation) values (new.name, new.id, (select r.name from roles r where r.id = new.role_id));
  end if;
  return new;
end $$;
create trigger app_users_employee_ins after insert on app_users for each row execute function app_users_make_employee();

create or replace function app_users_sync_employee() returns trigger language plpgsql as $$
begin
  update employees set name = new.name where user_id = new.id;
  return new;
end $$;
create trigger app_users_employee_upd after update of name on app_users for each row execute function app_users_sync_employee();

-- the people who already have a login
insert into employees (name, user_id, designation)
  select u.name, u.id, r.name from app_users u left join roles r on r.id = u.role_id
   where not exists (select 1 from employees e where e.user_id = u.id);

-- Give an employee who has no login a login that was just created (the automatic record of that new user is removed when it is empty).
create or replace function employee_link_user(p_employee uuid, p_user uuid) returns void language plpgsql as $$
declare auto employees%rowtype;
begin
  select * into auto from employees where user_id = p_user;
  if found and auto.id <> p_employee then
    if exists (select 1 from employee_ledger where employee_id = auto.id) then raise exception 'This login already has an employee record with entries.'; end if;
    delete from employees where id = auto.id;
  end if;
  update employees set user_id = p_user where id = p_employee and user_id is null;
  if not found then raise exception 'That employee already has a login.'; end if;
end $$;

-- ---------- payments: the ledger entry and the cash-book entry (Expenses > Salaries) are made together ----------
create or replace function employee_pay(p_employee uuid, p_kind text, p_amount numeric, p_date date, p_method text, p_note text, p_user uuid)
returns uuid language plpgsql as $$
declare e employees%rowtype; x_id uuid; l_id uuid;
begin
  select * into e from employees where id = p_employee for update;
  if not found then raise exception 'Employee not found.'; end if;
  if p_kind not in ('payment', 'advance') then raise exception 'Choose salary payment or advance.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero.'; end if;
  insert into expenses (expense_date, amount, category, note, created_by, ref_type)
    values (coalesce(p_date, (now() at time zone 'Asia/Karachi')::date), p_amount, 'Salaries',
            e.name || (case when p_kind = 'advance' then ' (advance)' else ' (salary)' end) || coalesce(' - ' || nullif(p_note, ''), ''), p_user, 'employee')
    returning id into x_id;
  insert into employee_ledger (employee_id, entry_date, type, amount, note, method, expense_id, created_by)
    values (p_employee, coalesce(p_date, (now() at time zone 'Asia/Karachi')::date), p_kind, -p_amount, nullif(p_note, ''), nullif(p_method, ''), x_id, p_user)
    returning id into l_id;
  update expenses set ref_id = l_id where id = x_id;
  return l_id;
end $$;

-- Cancel an entry (it stays on record). A payment's cash-book entry is cancelled with it.
create or replace function employee_void_entry(p_entry uuid) returns void language plpgsql as $$
declare l employee_ledger%rowtype;
begin
  select * into l from employee_ledger where id = p_entry for update;
  if not found then raise exception 'Entry not found.'; end if;
  if l.voided then return; end if;
  update employee_ledger set voided = true where id = p_entry;
  if l.expense_id is not null then update expenses set voided = true where id = l.expense_id; end if;
end $$;
