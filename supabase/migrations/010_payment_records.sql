-- Replaces 009's `invoices` table. That table used "invoice" language
-- and hung off companies directly — doesn't match how this business
-- actually works: there's no invoice document yet. Staff track a
-- monthly filing (ภงด./สปส./ภพ.30/...) as a `tasks` row with its own
-- due_date, and the client pays *that filing* by its due date. A real
-- invoice is a future concern (issued in FlowAccount once that
-- integration exists), not something this app generates.
--
-- payment_records now hangs off tasks (not companies): a company can
-- have several filings due at once, and a payment/slip belongs to one
-- specific filing. This also removes the "guess the oldest unpaid
-- invoice" logic line-webhook needed before — there's now an actual
-- task to attach the slip to.
--
-- amount is nullable: unlike 009's invoices (which assumed a
-- pre-existing amount to bill), nothing in this schema currently
-- computes what a given filing costs — staff read it off the payment
-- slip when reviewing, so it's only known at approval time.
drop table if exists invoices cascade;

create table payment_records (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references tasks(id) on delete cascade,
  amount numeric,
  status text not null default 'unpaid' check (status in ('unpaid', 'pending_review', 'paid')),
  slip_url text,
  created_at timestamptz not null default now()
);

alter table payment_records enable row level security;

-- Same reasoning as 009: money/slip data, so authenticated-only rather
-- than the `using (true)` every other table still has pending its
-- Milestone 3 tightening.
create policy "payment_records_authenticated_read" on payment_records
  for select to authenticated using (true);
create policy "payment_records_authenticated_write" on payment_records
  for insert to authenticated with check (true);
create policy "payment_records_authenticated_update" on payment_records
  for update to authenticated using (true) with check (true);

alter publication supabase_realtime add table payment_records;
