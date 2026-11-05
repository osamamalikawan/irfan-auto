-- A log of when a salesman's phone had location (GPS) turned off, or the app's location permission taken away, while he was on duty.
-- The phone records "off" and "on" moments and uploads them with the location points; the office sees them on the
-- Live map and Attendance screens. Needs 0016. Safe to run once.

create table location_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  attendance_id uuid references attendance(id) on delete set null,
  kind text not null check (kind in ('location_off', 'location_on', 'permission_off', 'permission_on')),
  at timestamptz not null,                   -- the phone's clock when it happened
  received_at timestamptz not null default now(),
  unique (user_id, at, kind)                 -- a retried upload cannot duplicate an entry
);
create index location_events_user_idx on location_events (user_id, at desc);
alter table location_events enable row level security;
