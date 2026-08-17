-- 010 gave payment_records select/insert/update policies but no delete —
-- at the time nothing ever removed a record. Real usage found a case that
-- needs it: a one-off filing (e.g. a license renewal) whose record was
-- created (or its notice armed) by mistake carries over month after month
-- as "รอชำระ" and keeps the daily LINE chase alive, and the only way staff
-- could silence it was to falsely mark it paid. The app now has an
-- "เอาออก" button (CompanyPaymentRecords.jsx) that deletes the record,
-- which requires this policy — without it the delete silently matches
-- zero rows.
--
-- `to authenticated using (true)` matches 010's existing write policies
-- (role-level tightening is Milestone 3's job); the button itself is only
-- rendered for owner/manager.
--
-- Numbered 020 out of sequence on purpose: 016–019 are reserved by the
-- in-flight FlowAccount branch and not applied yet. This file is
-- standalone and safe to run before them.
create policy "payment_records_authenticated_delete" on payment_records
  for delete to authenticated using (true);
