-- Per-month deadline overrides, set by a manager from the app.
--
-- A filing type's deadline is the same day every month
-- (task_types.default_due_day) right up until that day lands on a
-- weekend or a public holiday, when the real last day slides to the
-- next business day. Thai public holidays aren't something this app can
-- know: they move year to year, some are declared only a few weeks
-- ahead, and the revenue department hands out one-off extensions on top
-- of that. So rather than hardcoding a holiday calendar that would go
-- stale, a manager sets the actual last day for the affected type for
-- that one month here, and every company's task of that type moves with
-- it. The month after falls back to the default on its own — an
-- override is never carried forward.
--
-- This is not just display: scripts/send-reminders.js schedules the
-- client-facing LINE nudges off tasks.due_date ("ครบกำหนดพรุ่งนี้" the
-- day before, then daily from the due date on), so a deadline that's
-- two days early chases clients over a holiday weekend for something
-- that isn't actually late yet.
--
-- Keyed by type name rather than task_types.key by FK on purpose: an
-- ad-hoc per-company service ("อื่นๆ") has no task_types row, and a type
-- deleted from the main catalog keeps its existing company_services
-- rows as ad-hoc ones — in both cases the month's override should
-- still apply.
create table period_due_days (
  period text not null,  -- 'YYYY-MM', same key as tasks.period
  type text not null,    -- task_types.key, or an ad-hoc company_services.type
  due_day int not null check (due_day between 1 and 31),
  updated_at timestamptz not null default now(),
  primary key (period, type)
);

alter table period_due_days enable row level security;
-- TEMP: open like every other table until the real RLS pass; the app
-- gates this panel to owner/manager the same way it gates user admin.
create policy "period_due_days_open" on period_due_days for all using (true) with check (true);
alter publication supabase_realtime add table period_due_days;

-- Same function as 006, with the month's override taking precedence over
-- the per-company custom day and the type default. Only affects tasks
-- generated *after* the override is set (a company added mid-month);
-- the app pushes the new date onto already-generated rows itself.
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
    make_date(y, m, clamp_day_to_month(y, m, coalesce(pdd.due_day, cs.custom_due_day, tt.default_due_day))),
    coalesce(tt.phase, 3),
    'pending',
    'unpaid',
    ''
  from company_services cs
  join companies c on c.id = cs.company_id
  left join task_types tt on tt.key = cs.type
  left join period_due_days pdd on pdd.period = cur_period and pdd.type = cs.type
  where cs.active
    and not exists (select 1 from tasks t2 where t2.company_service_id = cs.id and t2.period = cur_period);
end;
$$;
