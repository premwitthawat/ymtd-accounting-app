-- Milestone 1: shared data, no auth enforcement yet.
-- Policies below are intentionally open (using (true)) so the app works
-- before login exists. They get tightened in Milestone 3.

create table companies (
  id bigint generated always as identity primary key,
  name text not null,
  short text not null,
  owner text not null,
  created_at timestamptz not null default now()
);

create table tasks (
  id bigint generated always as identity primary key,
  key text not null unique,
  company_id bigint not null references companies(id) on delete cascade,
  company text not null,
  owner text not null,
  type text not null,
  due_day int not null,
  phase int not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table companies enable row level security;
alter table tasks enable row level security;

-- TEMP: tightened in Milestone 3 once login/roles exist.
create policy "companies_open" on companies for all using (true) with check (true);
create policy "tasks_open" on tasks for all using (true) with check (true);

-- Realtime: broadcast row changes so multiple browsers stay in sync.
alter publication supabase_realtime add table companies;
alter publication supabase_realtime add table tasks;
