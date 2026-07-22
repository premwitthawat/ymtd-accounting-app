-- Was storing a signed Storage URL directly (expires after
-- SLIP_URL_EXPIRY_SECONDS, see 011/line-webhook), which meant a slip
-- nobody reviewed within 30 days went dead and had to be manually
-- re-signed. Storing the object path instead — permanent, since it's
-- just a filename, not a credential — and the frontend mints a fresh
-- signed URL on demand each time staff open "ดูสลิป"
-- (CompanyPaymentRecords.jsx), so there's no link left sitting around
-- to expire in the first place.
alter table payment_records rename column slip_url to slip_path;
