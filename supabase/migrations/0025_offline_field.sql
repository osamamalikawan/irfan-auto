-- Offline work for the salesman app. Needs 0010 (visits) and 0016 (attendance).
--
--  * Start / end of work can be saved on the phone and sent later; the day and time recorded are the moment he really tapped.
--  * A visit sent twice (a retry after a lost answer) is saved once.

-- The old versions are replaced (a second, similar function would make every call ambiguous).
drop function if exists attendance_check_in(uuid, double precision, double precision, real);
drop function if exists attendance_check_out(uuid, double precision, double precision, real);

create or replace function attendance_check_in(p_user uuid, p_lat double precision, p_lng double precision, p_acc real, p_at timestamptz default now())
returns attendance language plpgsql as $$
declare a attendance%rowtype; v_at timestamptz := coalesce(p_at, now()); v_day date := ((coalesce(p_at, now()) at time zone 'Asia/Karachi')::date);
begin
  insert into attendance (user_id, work_date, check_in_at, in_lat, in_lng, in_accuracy) values (p_user, v_day, v_at, p_lat, p_lng, p_acc)
  on conflict (user_id, work_date) do update
    set check_out_at = null, out_lat = null, out_lng = null, out_accuracy = null
    where attendance.check_out_at is not null
  returning * into a;
  if not found then
    select * into a from attendance where user_id = p_user and work_date = v_day;
  end if;
  return a;
end $$;

-- Ends the shift that was open at that moment (also works when it is sent the next day).
create or replace function attendance_check_out(p_user uuid, p_lat double precision, p_lng double precision, p_acc real, p_at timestamptz default now())
returns attendance language plpgsql as $$
declare a attendance%rowtype; v_at timestamptz := coalesce(p_at, now());
begin
  update attendance set check_out_at = greatest(v_at, check_in_at), out_lat = p_lat, out_lng = p_lng, out_accuracy = p_acc
   where id = (select x.id from attendance x where x.user_id = p_user and x.check_out_at is null and x.check_in_at <= v_at order by x.check_in_at desc limit 1)
  returning * into a;
  if not found then raise exception 'You are not checked in.'; end if;
  return a;
end $$;

alter table visits add column if not exists idem_key text;
create unique index if not exists visits_idem_key on visits (idem_key) where idem_key is not null;
