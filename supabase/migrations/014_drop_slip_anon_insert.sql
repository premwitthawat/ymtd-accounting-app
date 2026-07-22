-- payment_slips_anon_insert (009_invoices_billing.sql) let the public
-- anon key upload directly into the private `payment_slips` bucket —
-- meant for clients dropping a slip in during checkout without logging
-- in, back when the old `invoices` flow expected that. 010 replaced
-- that flow entirely: slips now arrive via line-webhook uploading with
-- the service-role key (which bypasses RLS anyway), so this policy is
-- dead weight that left the bucket writable by anyone holding the
-- public anon key. Read policy is untouched — staff still need it.
drop policy if exists "payment_slips_anon_insert" on storage.objects;
