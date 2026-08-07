-- FlowAccount receipt issuing, part 1: the fields. 010_payment_records
-- said "a real invoice is a future concern (issued in FlowAccount once
-- that integration exists)" — this is that integration arriving. The
-- flowaccount-issue-receipt Edge Function (same feature branch) reads
-- and writes everything added here.

-- What FlowAccount needs to put on a legally-usable receipt: the
-- client's tax ID and registered address, plus the branch code
-- (สำนักงานใหญ่ = '00000', the default for every client here — none of
-- them are branches of a larger entity, but the column exists because
-- the document format requires the field either way).
--
-- flowaccount_contact_id caches the FlowAccount-side contact created
-- for this company on first receipt, so later receipts reuse it instead
-- of piling up duplicate contacts in the FlowAccount address book. Not
-- unique/not FK — it's an opaque foreign system's ID, and FlowAccount
-- owns its lifecycle.
alter table companies add column tax_id text;
alter table companies add column address text;
alter table companies add column branch_code text default '00000';
alter table companies add column flowaccount_contact_id text;

-- Maps a service type to the product/service line item FlowAccount
-- expects on the receipt, with a standing price to prefill the issue
-- form. unit_price is a *default*, not the invoice amount — staff
-- confirm/adjust per receipt, because per-client pricing exists.
alter table task_types add column flowaccount_product_name text;
alter table task_types add column unit_price numeric;

-- Why three amount columns when `amount` already exists: accounting fees
-- paid by a juristic person are subject to 3% withholding tax, so the
-- bank slip staff see (and record into `amount` today) is the *net*
-- transfer, while the receipt must show the *gross* service fee with
-- the withheld tax broken out. One number can't carry all of that:
--   amount_gross    = ค่าบริการเต็ม (what the receipt shows)
--   wht_amount      = amount_gross * wht_rate / 100 (หัก ณ ที่จ่าย)
--   amount_received = amount_gross - wht_amount (should match the slip)
-- `amount` itself stays untouched — CompanyPaymentRecords.jsx and the
-- slip-review flow still read/write it, and the two flows must keep
-- working independently until master data is complete.
alter table payment_records add column amount_gross numeric;
alter table payment_records add column wht_rate numeric default 0;
alter table payment_records add column wht_amount numeric;
alter table payment_records add column amount_received numeric;
alter table payment_records add column flowaccount_document_id text;
alter table payment_records add column flowaccount_document_number text;
-- Object path in the `receipts` bucket, NOT a URL — same rule as
-- slip_path (013_slip_path_not_url.sql): the bucket is private, a
-- usable stored URL would have to be signed, and signed URLs expire.
-- The frontend mints a fresh signed URL each time staff click
-- "ดูใบเสร็จ".
alter table payment_records add column receipt_path text;
alter table payment_records add column issued_at timestamptz;

-- The DB-level idempotency guard. The Edge Function early-returns when
-- flowaccount_document_id is already set, but two concurrent clicks can
-- both pass that check — this index makes the second write fail instead
-- of silently recording a duplicate document. Partial (where not null)
-- because every record starts with the column null and nulls must not
-- collide.
create unique index payment_records_flowaccount_document_id_key
  on payment_records (flowaccount_document_id)
  where flowaccount_document_id is not null;

-- Storage for the exported PDFs. Private like payment_slips
-- (009_invoices_billing.sql) — receipts carry client tax IDs and
-- amounts. No anon insert policy though, unlike payment_slips: nothing
-- client-side ever writes here, only the Edge Function via service_role
-- (which bypasses RLS), so authenticated read is the only policy needed.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');
