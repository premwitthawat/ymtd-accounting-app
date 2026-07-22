-- Lets staff link a LINE group to a company from inside the app instead
-- of the bot posting in the group chat (client-facing chats should stay
-- clean, per explicit request) or digging through Supabase function
-- logs for a groupId. line-webhook records every group it's added to
-- here — with the group's real LINE display name, fetched via the
-- Group Summary API — the moment it joins; staff then pick the matching
-- company from a dropdown (see src/components/LineGroupsPanel.jsx).
--
-- Deliberately doesn't store company_id here: companies.line_group_id
-- (added in 009) stays the single source of truth line-webhook's slip
-- matching already reads from — this table is just a "groups we've
-- seen, ready to assign" inbox, not a second copy of the mapping.
create table line_groups (
  line_group_id text primary key,
  group_name text,
  first_seen_at timestamptz not null default now()
);

alter table line_groups enable row level security;

create policy "line_groups_authenticated_read" on line_groups
  for select to authenticated using (true);
create policy "line_groups_authenticated_write" on line_groups
  for insert to authenticated with check (true);

alter publication supabase_realtime add table line_groups;
