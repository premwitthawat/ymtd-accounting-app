-- Two hard lessons from the 3 Sep 2026 live test of the "paid" command, plus the
-- storage the combined-billing-note feature needs.

-- (1) One LINE group must map to at most one company. The staff test group ended
-- up linked to two rows (the firm's own row and the test company), and every
-- group→company lookup in line-webhook uses maybeSingle(), which errors on
-- multiple rows — so "paid" died silently for over an hour. The app UI already
-- clears the previous owner before linking (LineGroupsPanel), so this index
-- only blocks the mistake, it doesn't change any working flow. Partial index
-- because many companies legitimately have no group yet.
-- กันเหนียวก่อนสร้าง index: ถ้ายังมีกลุ่มผูกซ้ำหลงเหลือ ให้แถวที่ผูกก่อน (id ต่ำสุด)
-- ถือกลุ่มไว้ แล้วปลดแถวที่เหลือ — ไม่งั้น create index ล้มและพาคอลัมน์ล่างล้มทั้งไฟล์
update companies c
  set line_group_id = null
  where line_group_id is not null
    and exists (
      select 1 from companies c2
      where c2.line_group_id = c.line_group_id and c2.id < c.id
    );

create unique index if not exists companies_line_group_id_key
  on companies (line_group_id)
  where line_group_id is not null;

-- (2) When a client owes more than the current month, the office sends ONE
-- combined billing note (ใบวางบิลรวม) listing every unpaid month, so the client
-- sees a single document with the full amount due — the invoices themselves
-- stay one-per-month for bookkeeping. The current note lives in FlowAccount;
-- we keep its id so next month's run (or the payment that clears the debt) can
-- delete the stale note instead of letting one pile up per month. Only the
-- LATEST note matters, hence columns on companies rather than a history table.
alter table companies add column if not exists billing_note_doc_id text;
alter table companies add column if not exists billing_note_number text;
