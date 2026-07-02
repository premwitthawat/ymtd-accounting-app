-- Milestone 4: real due dates, monthly recurrence, payment tracking.
--
-- Until now `tasks` was one perpetual row per (company, service) — there
-- was no month boundary at all, so "done" just stayed done forever. This
-- introduces `company_services` as the durable "this company needs this
-- service" config (survives months, can be soft-retired without losing
-- history), and makes `tasks` a per-period instance generated from it.

create table company_services (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies(id) on delete cascade,
  type text not null,
  custom_due_day int, -- override; null = use task_types.default_due_day
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, type)
);

alter table company_services enable row level security;
-- TEMP: open like every other table until Milestone 3's real RLS pass.
create policy "company_services_open" on company_services for all using (true) with check (true);
alter publication supabase_realtime add table company_services;

-- Clamp a day-of-month to a real day in that year/month (e.g. day 31 in
-- February), used both for backfill below and for monthly generation.
create or replace function clamp_day_to_month(y int, m int, d int) returns int
language sql immutable as $$
  select least(d, extract(day from (make_date(y, m, 1) + interval '1 month' - interval '1 day'))::int)
$$;

-- Migrate each existing (company_id, type) pair into a durable service
-- config. Standard types (found in task_types) get no override; ad-hoc
-- "other" types keep their current due_day as a per-company override,
-- since they have no global default.
insert into company_services (company_id, type, custom_due_day)
select
  t.company_id,
  t.type,
  case when tt.key is null then t.due_day else null end
from (select distinct company_id, type, due_day from tasks) t
left join task_types tt on tt.key = t.type;

alter table tasks add column company_service_id bigint references company_services(id) on delete cascade;
alter table tasks add column period text;
alter table tasks add column due_date date;
alter table tasks add column payment_status text not null default 'unpaid' check (payment_status in ('not_applicable', 'unpaid', 'paid'));

-- Backfill existing rows as belonging to the current period (there's no
-- real month history before this migration). The company_services/task_types
-- join is pulled into a CTE because an UPDATE's FROM-clause JOIN can't
-- reference the table being updated (only SET/WHERE can) — Postgres
-- rejects `left join task_types tt on tt.key = t.type` directly inline.
with cs_join as (
  select cs.id as company_service_id, cs.company_id, cs.type, cs.custom_due_day, tt.default_due_day
  from company_services cs
  left join task_types tt on tt.key = cs.type
)
update tasks t
set company_service_id = cj.company_service_id,
    period = to_char(current_date, 'YYYY-MM'),
    due_date = make_date(
      extract(year from current_date)::int,
      extract(month from current_date)::int,
      clamp_day_to_month(extract(year from current_date)::int, extract(month from current_date)::int, coalesce(cj.custom_due_day, cj.default_due_day, t.due_day))
    )
from cs_join cj
where cj.company_id = t.company_id and cj.type = t.type;

alter table tasks alter column company_service_id set not null;
alter table tasks alter column period set not null;
alter table tasks alter column due_date set not null;
alter table tasks drop column due_day;

-- key now needs the period folded in to stay unique across months.
update tasks set key = company_id || '-' || type || '-' || period;
alter table tasks add constraint tasks_company_service_period_key unique (company_service_id, period);

-- SECURITY DEFINER: controlled privilege escalation — the function body is
-- fixed/deterministic (only inserts pending tasks for this company's own
-- active services), so it's safe to let any authenticated user call it,
-- rather than requiring company_services INSERT rights just to view the
-- dashboard.
create or replace function ensure_current_period_tasks() returns void
language plpgsql security definer set search_path = public as $$
declare
  cur_period text := to_char(current_date, 'YYYY-MM');
  y int := extract(year from current_date)::int;
  m int := extract(month from current_date)::int;
begin
  insert into tasks (key, company_id, company, owner, type, company_service_id, period, due_date, phase, status, payment_status, note)
  select
    cs.company_id || '-' || cs.type || '-' || cur_period,
    cs.company_id,
    c.short,
    c.owner,
    cs.type,
    cs.id,
    cur_period,
    make_date(y, m, clamp_day_to_month(y, m, coalesce(cs.custom_due_day, tt.default_due_day))),
    coalesce(tt.phase, 3),
    'pending',
    'unpaid',
    ''
  from company_services cs
  join companies c on c.id = cs.company_id
  left join task_types tt on tt.key = cs.type
  where cs.active
    and not exists (select 1 from tasks t2 where t2.company_service_id = cs.id and t2.period = cur_period);
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which
-- normally covers `authenticated` — but this is called from the client on
-- every load, so make it explicit rather than relying on the default.
grant execute on function ensure_current_period_tasks() to authenticated;
