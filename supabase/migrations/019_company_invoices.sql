-- Monthly service-fee invoicing (ใบแจ้งหนี้/ใบวางบิล), the second half
-- of the FlowAccount integration. On the 1st of each month the firm
-- bills every client its standing monthly accounting fee (plus any
-- one-off extras staff queued up during the month), the invoice PDF is
-- pushed into the client's LINE group once — deliberately with NO
-- follow-up chasing: the daily reminder pipeline stays reserved for tax
-- payments only, per explicit instruction — and when the client pays,
-- marking the invoice paid auto-issues the receipt with the amounts the
-- invoice already fixed. That last part is why auto-issue is safe here
-- when it wasn't for the per-filing receipts (the brief's phase-1
-- concern): the amount isn't guessed at issue time, it was confirmed by
-- a human when the invoice went out.
--
-- This is the firm's own revenue stream, kept separate from
-- payment_records on purpose: payment_records tracks per-filing
-- payments (mostly tax the firm remits on the client's behalf — money
-- that passes through), while an invoice is one company-month of
-- service fees. Jamming both into payment_records would force a fake
-- task row per invoice and confuse slip matching.

-- The standing fee. null/0 = this company is not billed automatically
-- (e.g. วายเอ็มทีดี itself, or one-off clients).
alter table companies add column monthly_fee numeric;
-- Whether this client withholds 3% on service fees — a property of the
-- client (juristic persons withhold, individuals don't), set once, so
-- invoice generation and the auto-receipt agree on the split without a
-- human re-deciding it monthly.
alter table companies add column wht_rate numeric not null default 0;

create table company_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references companies(id) on delete cascade,
  period text not null,                       -- 'YYYY-MM', the month being billed
  amount_gross numeric not null,              -- monthly_fee + extras, what the invoice shows
  wht_rate numeric not null default 0,
  wht_amount numeric not null default 0,
  amount_due numeric not null,                -- gross - wht = what the transfer should be
  flowaccount_document_id text,
  flowaccount_document_number text,
  invoice_path text,                          -- object path in `invoices` bucket, never a URL
  line_pushed_at timestamptz,                 -- null = the one-shot LINE push didn't happen (no group / push failed)
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  -- The auto-issued receipt lives on the invoice row itself (not
  -- payment_records) because it receipts this invoice, nothing else.
  receipt_document_id text,
  receipt_document_number text,
  receipt_path text,
  receipt_issued_at timestamptz,
  -- Marks the one-shot "receipt delivered into the LINE group" push
  -- (mark-paid sends it whether triggered from the app or the "paid"
  -- chat command) — same role line_pushed_at plays for the invoice
  -- itself: null means it hasn't landed, so a retry knows to send, and
  -- a repeat mark-paid knows NOT to send twice.
  receipt_line_pushed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One invoice per company per month. Doubles as the generator's
  -- idempotency anchor: a re-run (cron retry, manual workflow_dispatch)
  -- reserves the same row and finds it already taken.
  unique (company_id, period)
);

-- Same DB-level duplicate guards as payment_records' receipts (016):
-- the function's checks can be raced, these can't.
create unique index company_invoices_flowaccount_document_id_key
  on company_invoices (flowaccount_document_id)
  where flowaccount_document_id is not null;
create unique index company_invoices_receipt_document_id_key
  on company_invoices (receipt_document_id)
  where receipt_document_id is not null;

-- One-off billable items staff queue during the month ("ปิดงบ",
-- "จดทะเบียนแก้ไข", ...) keyed to the period whose invoice should carry
-- them. Consumed by value, not deleted: the generator sums extras for
-- the period at issue time, and the rows stay as the record of where
-- that invoice's total came from.
create table invoice_extras (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references companies(id) on delete cascade,
  period text not null,
  description text not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table company_invoices enable row level security;
alter table invoice_extras enable row level security;

-- Money data: authenticated-only, like payment_records. Invoices are
-- select-only from the client — every write (generation, mark-paid,
-- receipt fields) goes through the flowaccount-invoices Edge Function
-- with service_role, so a compromised staff session can't fabricate or
-- un-pay an invoice from the browser console. Extras are staff-editable
-- directly: they're inputs to the next invoice, not financial records
-- of one that exists.
create policy "company_invoices_authenticated_read" on company_invoices
  for select to authenticated using (true);
create policy "invoice_extras_authenticated_read" on invoice_extras
  for select to authenticated using (true);
create policy "invoice_extras_authenticated_insert" on invoice_extras
  for insert to authenticated with check (true);
create policy "invoice_extras_authenticated_delete" on invoice_extras
  for delete to authenticated using (true);

alter publication supabase_realtime add table company_invoices;
alter publication supabase_realtime add table invoice_extras;

-- Invoice PDFs, same rules as `receipts` (016): private, path stored
-- not URL, only the Edge Function writes (service_role bypasses RLS),
-- staff read via short-lived signed URLs. The one-shot LINE push signs
-- a longer-lived URL (30 days) since clients open it from chat history.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "invoices_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices');
