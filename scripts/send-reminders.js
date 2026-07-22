// Daily payment-notice follow-ups: once staff mark a filing's payment
// notice as sent (payment_records.notice_sent_at, set from the app's
// "ส่งแจ้งชำระแล้ว" button), remind that company's LINE group once a
// day until the record leaves 'unpaid' (a slip comes in for review, or
// it's approved as paid). Run by .github/workflows/daily-reminders.yml
// on a daily cron.
//
// This replaced an earlier due_date-based reminder: this firm
// calculates the amount and messages the client directly, and the
// government filing due_date doesn't reliably line up with when that
// actually happens, so due_date was reminding at the wrong times.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

// Service role key, not anon — payment_records' RLS only allows
// authenticated reads/writes, and this script has no logged-in user to
// authenticate as.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// GitHub Actions runners are always UTC and cron start times are
// best-effort (can slip under load), so "today" for the once-a-day
// check is computed from Asia/Bangkok wall-clock time rather than
// assumed from when the job happened to start.
function bangkokDateString(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso)); // en-CA formats as YYYY-MM-DD
}

async function pushLineMessage(groupId, text) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  const today = bangkokDateString(new Date().toISOString());

  const { data: records, error } = await supabase
    .from("payment_records")
    .select("id, last_reminded_at, tasks(type, company, companies(line_group_id))")
    .eq("status", "unpaid")
    .not("notice_sent_at", "is", null);

  if (error) {
    console.error("Failed to query payment_records:", error.message);
    process.exit(1);
  }

  // A manual workflow_dispatch re-run the same day (or any retry)
  // shouldn't double-message a client that was already reminded today.
  const due = records.filter(r => !r.last_reminded_at || bangkokDateString(r.last_reminded_at) !== today);

  console.log(`Found ${records.length} unpaid notice(s) sent, ${due.length} due for a reminder today`);

  // One push per *group* per day, not per record — a company with
  // several outstanding filings (e.g. paid together in one transfer,
  // so one filing's slip clears while the others sit unpaid a while
  // longer) would otherwise get a separate LINE message per filing,
  // which reads as spam in a client-facing group.
  const byGroup = new Map();
  let skipped = 0;
  for (const record of due) {
    const groupId = record.tasks?.companies?.line_group_id;
    if (!groupId) {
      console.warn(`Skipping payment_records ${record.id}: company has no line_group_id`);
      skipped++;
      continue;
    }
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(record);
  }

  let sent = 0;
  let failed = 0;

  for (const [groupId, groupRecords] of byGroup) {
    const text = [
      "[แจ้งเตือนชำระเงิน]",
      groupRecords[0].tasks.company,
      `ยังไม่ได้รับการชำระ ${groupRecords.length} รายการ:`,
      ...groupRecords.map(r => `- ${r.tasks.type}`),
      "กรุณาชำระและส่งสลิปในกลุ่มนี้",
    ].join("\n");

    try {
      await pushLineMessage(groupId, text);
      const { error: updateErr } = await supabase
        .from("payment_records")
        .update({ last_reminded_at: new Date().toISOString() })
        .in(
          "id",
          groupRecords.map(r => r.id)
        );
      if (updateErr) throw new Error(`failed to record last_reminded_at: ${updateErr.message}`);
      console.log(`Sent reminder for group ${groupId} (payment_records ${groupRecords.map(r => r.id).join(", ")})`);
      sent += groupRecords.length;
    } catch (err) {
      console.error(`Failed to send reminder for group ${groupId}:`, err.message);
      failed += groupRecords.length;
    }
  }

  console.log(`Done. sent=${sent} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1); // non-zero exit surfaces as a failed run worth a look
}

main();
