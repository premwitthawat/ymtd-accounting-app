-- Turns the "main service" list (ภงด.1, สปส., ...) from a hardcoded
-- constant in the frontend into a real catalog anyone can extend from the
-- Add/Edit Company dialog, instead of needing a code change.
--
-- `color` is a palette KEY (e.g. 'blue'), not a raw Tailwind class string —
-- Tailwind's build-time scanner only generates CSS for class names it can
-- see literally in the source, so actual class strings stay in
-- src/data/tasks.js's TYPE_PALETTE lookup, not in the database.

create table task_types (
  key text primary key,
  default_due_day int not null,
  phase int not null default 3,
  color text not null default 'slate',
  created_at timestamptz not null default now()
);

alter table task_types enable row level security;

-- TEMP: open like companies/tasks were in Milestone 1 — tightened to
-- owner/manager-only writes in Milestone 3 along with everything else.
create policy "task_types_open" on task_types for all using (true) with check (true);

alter publication supabase_realtime add table task_types;

insert into task_types (key, default_due_day, phase, color) values
  ('ภงด.1', 15, 2, 'blue'),
  ('ภงด.3', 15, 2, 'blue'),
  ('ภงด.53', 15, 2, 'blue'),
  ('ภพ.36', 15, 2, 'violet'),
  ('กยศ.', 15, 2, 'emerald'),
  ('สปส.', 22, 3, 'amber'),
  ('ภพ.30', 23, 3, 'rose'),
  ('ใบหัก ณ ที่จ่าย', 10, 1, 'slate'),
  ('ประมาณการกำไรขาดทุน', 20, 3, 'slate');
