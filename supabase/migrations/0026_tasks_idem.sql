-- A task added from the salesman app while offline may be sent twice (a retry after a lost answer): the second one is ignored.
alter table tasks add column if not exists idem_key text;
create unique index if not exists tasks_idem_key on tasks (idem_key) where idem_key is not null;
