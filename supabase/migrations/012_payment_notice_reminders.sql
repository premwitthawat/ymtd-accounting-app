-- Switches the daily LINE reminder from "due_date is near" to "staff
-- told the client the amount and it's still unpaid" — this firm
-- calculates the amount and messages the client directly (manually, in
-- the LINE group); the government filing due_date doesn't reliably
-- line up with when that actually happens, so due_date was reminding
-- at the wrong times.
--
-- notice_sent_at: set by staff from the app (CompanyPaymentRecords —
-- "ส่งแจ้งชำระแล้ว") the moment they've sent the amount to the client.
-- Marks a payment_records row as "start the daily chase" rather than
-- something staff created retroactively.
--
-- last_reminded_at: lets scripts/send-reminders.js tell "already
-- reminded today" from "due for today's reminder" without relying on
-- the cron only ever running once — a manual workflow_dispatch re-run
-- the same day shouldn't double-message a client.
alter table payment_records add column notice_sent_at timestamptz;
alter table payment_records add column last_reminded_at timestamptz;
