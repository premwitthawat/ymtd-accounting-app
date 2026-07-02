-- Milestone 2: accounts/roles for PIN login. Permission ENFORCEMENT on
-- companies/tasks still lands in Milestone 3 — this migration only adds
-- the accounts themselves.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'employee')),
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
-- Deliberately no policies here: the raw table is fully locked to every
-- client role. All reads/writes go through either the public_profiles
-- view below (safe columns only) or the admin-users Edge Function, which
-- uses the service_role key and bypasses RLS entirely.

-- Views run with the OWNER's privileges by default (not the invoker's),
-- so this can safely expose id/role/label from a table that has zero
-- client-facing policies. Do NOT add `with (security_invoker = true)` —
-- that would make it inherit profiles' deny-all RLS and return nothing.
create view public_profiles as
  select id, role, label from profiles where active;

grant select on public_profiles to anon, authenticated;
