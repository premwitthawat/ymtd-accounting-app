-- Milestone 5: automated billing. Adds a LINE notify-group link per
-- company and an invoices table for tracking amounts owed, due dates,
-- and payment-slip proof uploaded by the client.
--
-- invoices.company_id is bigint (not uuid) because companies.id is
-- `bigint generated always as identity` (see 001_init.sql) — matching
-- the existing key type rather than the uuid suggested in the request.

alter table companies add column line_group_id text;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references companies(id) on delete cascade,
  amount numeric not null,
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'pending_review', 'paid')),
  slip_url text,
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;

-- Unlike companies/tasks/task_types (still "TEMP: open" from Milestone 1,
-- per 001_init.sql/005_task_types.sql), invoices carries money and slip
-- images, so it goes straight to authenticated-only rather than
-- `using (true)`. Clients upload slips anonymously via the storage
-- bucket below, not by writing this table directly — staff review and
-- reconcile from the authenticated app.
create policy "invoices_authenticated_read" on invoices
  for select to authenticated using (true);

create policy "invoices_authenticated_write" on invoices
  for insert to authenticated with check (true);

create policy "invoices_authenticated_update" on invoices
  for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table invoices;

-- Storage: payment slip images. Bucket is private (public = false) —
-- reads go through RLS + a signed/authenticated fetch, not a public URL.
insert into storage.buckets (id, name, public)
values ('payment_slips', 'payment_slips', false)
on conflict (id) do nothing;

-- Anyone with the link (no login) can drop a slip in during checkout,
-- as requested; only staff (authenticated) can read them back.
create policy "payment_slips_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'payment_slips');

create policy "payment_slips_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment_slips');
