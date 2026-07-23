// LINE webhook receiver. LINE calls this directly (not from a browser),
// so there's no CORS handling here, unlike admin-users/index.ts. Must
// always answer 200 as fast as possible — LINE retries (and can disable
// the webhook after repeated failures) on anything else, so per-event
// errors are logged, never surfaced as a non-200 response.
//
// Verifies the `x-line-signature` header against LINE_CHANNEL_SECRET
// (HMAC-SHA256 of the raw body, LINE's standard webhook auth) so a
// spoofed POST can't inject a fake groupId. Set it as a function secret
// (`supabase secrets set LINE_CHANNEL_SECRET=...`) — value is in the
// LINE Developers console under the channel's "Messaging API" tab.
//
// Also handles payment-slip images: when a group sends an image, it's
// matched against that company's *awaiting-payment* record — one staff
// have already marked "ส่งแจ้งชำระแล้ว" for (payment_records.status =
// 'unpaid' with notice_sent_at set, see 012_payment_notice_reminders.sql)
// — then fetched from LINE and stored in the (private) `payment_slips`
// bucket. Matching only tasks staff have *actually billed the client
// for* (not just any unpaid task) matters: group chats aren't
// slip-only, so anything looser here means ordinary photos in
// conversation get mistaken for payment slips. Requires
// LINE_CHANNEL_ACCESS_TOKEN (function secret) plus the standard
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, which Supabase injects into
// every edge function automatically.
//
// Also handles the text "clear" (any casing) as a shortcut: staff
// already confirmed payment in the group conversation itself (or
// approved a slip verbally) and typing "clear" closes out that
// company's oldest awaiting-payment record as paid directly, without
// also having to open the app and click through — same record-matching
// rule as slip images (oldest unpaid/pending_review record with
// notice_sent_at set), just skipping straight to 'paid' with no slip
// required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface LineEvent {
  type: string;
  source?: { type: string; groupId?: string; userId?: string; roomId?: string };
  message?: { id: string; type: string; text?: string };
  [key: string]: unknown;
}

// Created once per isolate (not per-request, unlike admin-users) since
// it only depends on env vars, never on the caller — LINE never sends a
// user JWT, so there's no per-request identity to bind the client to.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function verifySignature(rawBody: string, signature: string | null, channelSecret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

// Records every group the bot is in, with its real LINE display name, so
// staff can link it to a company from the app's LINE Groups panel
// instead of the bot ever posting in the (client-facing) group chat or
// someone digging through these function logs for a raw groupId.
// maybeSingle-then-insert (not upsert) so first_seen_at doesn't get
// bumped on every later message from a group we've already recorded.
async function recordLineGroup(groupId: string, accessToken: string | undefined) {
  const { data: existing, error: existingErr } = await supabase
    .from("line_groups")
    .select("line_group_id")
    .eq("line_group_id", groupId)
    .maybeSingle();
  if (existingErr) throw new Error(`line_groups lookup failed: ${existingErr.message}`);
  if (existing) return;

  // Group summary can 404 (e.g. token not yet configured, or LINE
  // hasn't indexed the group yet) — not fatal, just leaves group_name
  // null and staff match by first_seen_at instead.
  let groupName: string | null = null;
  if (accessToken) {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) groupName = ((await res.json()) as { groupName?: string }).groupName ?? null;
  }

  const { error: insertErr } = await supabase.from("line_groups").insert({ line_group_id: groupId, group_name: groupName });
  if (insertErr) throw new Error(`line_groups insert failed: ${insertErr.message}`);
}

async function fetchLineImageContent(messageId: string, accessToken: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LINE content API returned ${res.status}: ${await res.text()}`);
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

// Uploads the slip and attaches it to the company's longest-waiting
// awaiting-payment record. A no-op (with a warning log) if the group
// isn't linked to a company, or the company has no payment_records row
// with notice_sent_at set and status still 'unpaid' — that's an
// expected state (e.g. someone in the group posts an unrelated photo,
// or staff haven't billed the client for anything yet), not a failure
// worth retry noise.

// Bangkok, not the runner/edge-region's local time — this only affects
// which folder a slip lands in, but should still match the calendar
// month staff actually experience.
function bangkokYearMonth(date: Date): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  return {
    year: parts.find(p => p.type === "year")!.value,
    month: parts.find(p => p.type === "month")!.value,
  };
}

async function handleSlipImage(groupId: string, messageId: string, accessToken: string) {
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, short")
    .eq("line_group_id", groupId)
    .maybeSingle();
  if (companyErr) throw new Error(`company lookup failed: ${companyErr.message}`);
  if (!company) {
    console.warn(`line-webhook: groupId=${groupId} has no linked company, ignoring image`);
    return;
  }

  const { data: record, error: recordErr } = await supabase
    .from("payment_records")
    .select("id, tasks!inner(company_id)")
    .eq("tasks.company_id", company.id)
    .eq("status", "unpaid")
    .not("notice_sent_at", "is", null)
    .order("notice_sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (recordErr) throw new Error(`payment_records lookup failed: ${recordErr.message}`);
  if (!record) {
    console.warn(`line-webhook: company_id=${company.id} (groupId=${groupId}) has no awaiting-payment notice, ignoring image`);
    return;
  }

  const { bytes, contentType } = await fetchLineImageContent(messageId, accessToken);

  // Storage keys double as folders on "/" (S3-style), so this alone is
  // enough to browse the bucket as company/year/month in the Supabase
  // dashboard — no separate folder-creation step needed. Slashes in a
  // company's short name would otherwise create unintended nesting.
  const safeShort = company.short.replace(/[/\\]/g, "-");
  const { year, month } = bangkokYearMonth(new Date());
  const fileName = `${safeShort}/${year}/${month}/${Date.now()}-${messageId}.jpg`;
  const { error: uploadErr } = await supabase.storage.from("payment_slips").upload(fileName, bytes, { contentType });
  if (uploadErr) throw new Error(`slip upload failed: ${uploadErr.message}`);

  // Stores the object path, not a signed URL — `payment_slips` is
  // private (see 009_invoices_billing.sql — slips carry bank details),
  // so a *usable* stored URL would have to be signed, and signed URLs
  // expire. A path never does; the frontend mints a fresh signed URL
  // on demand each time staff open "ดูสลิป" (CompanyPaymentRecords.jsx),
  // so nothing here ever goes stale.
  const { error: writeErr } = await supabase
    .from("payment_records")
    .update({ status: "pending_review", slip_path: fileName })
    .eq("id", record.id);
  if (writeErr) throw new Error(`payment_records write failed: ${writeErr.message}`);

  console.log(`line-webhook: payment_records ${record.id} -> pending_review, slip=${fileName}`);
}

// Closes out the company's oldest awaiting-payment record as 'paid'
// with no slip involved — staff typed "clear" because they already
// know it's settled (told in the chat, or reviewed a slip that isn't
// this app's concern to re-verify). Mirrors handleSlipImage's matching
// rule (oldest unpaid/pending_review record with notice_sent_at set)
// but also accepts 'pending_review' since this is often used to wave
// through a slip that already came in without staff opening the app.
async function handleClearCommand(groupId: string) {
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id")
    .eq("line_group_id", groupId)
    .maybeSingle();
  if (companyErr) throw new Error(`company lookup failed: ${companyErr.message}`);
  if (!company) {
    console.warn(`line-webhook: groupId=${groupId} has no linked company, ignoring "clear"`);
    return;
  }

  const { data: record, error: recordErr } = await supabase
    .from("payment_records")
    .select("id, task_id, tasks!inner(company_id)")
    .eq("tasks.company_id", company.id)
    .in("status", ["unpaid", "pending_review"])
    .not("notice_sent_at", "is", null)
    .order("notice_sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (recordErr) throw new Error(`payment_records lookup failed: ${recordErr.message}`);
  if (!record) {
    console.warn(`line-webhook: company_id=${company.id} (groupId=${groupId}) has no awaiting-payment notice, ignoring "clear"`);
    return;
  }

  const { error: writeErr } = await supabase.from("payment_records").update({ status: "paid" }).eq("id", record.id);
  if (writeErr) throw new Error(`payment_records write failed: ${writeErr.message}`);

  // Keeps the underlying task's own payment_status in sync, same as
  // the app's in-page approve action does.
  const { error: taskErr } = await supabase.from("tasks").update({ payment_status: "paid" }).eq("id", record.task_id);
  if (taskErr) throw new Error(`tasks write failed: ${taskErr.message}`);

  console.log(`line-webhook: payment_records ${record.id} -> paid via "clear"`);
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();

  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET");
  if (channelSecret) {
    const ok = await verifySignature(rawBody, req.headers.get("x-line-signature"), channelSecret);
    if (!ok) {
      console.error("line-webhook: invalid x-line-signature, rejecting");
      return new Response("Invalid signature", { status: 401 });
    }
  } else {
    // Fails open so setup order (deploy before secrets are set) doesn't
    // brick the webhook — but this should never stay unset in prod.
    console.warn("line-webhook: LINE_CHANNEL_SECRET not set, skipping signature verification");
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody).events as LineEvent[]) ?? [];
  } catch (err) {
    console.error("line-webhook: failed to parse request body", err);
    // Still 200 — LINE has no better body to send on retry.
    return new Response("OK", { status: 200 });
  }

  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

  for (const event of events) {
    try {
      // 'join' fires exactly when the bot is invited into a group;
      // 'message' fires for every message in a group it's already in.
      // Both carry source.groupId, and the spec asks for both to be
      // logged — only 'join' actually means "just invited".
      if ((event.type === "join" || event.type === "message") && event.source?.type === "group" && event.source.groupId) {
        console.log(`line-webhook: groupId=${event.source.groupId} event=${event.type}`);
        await recordLineGroup(event.source.groupId, accessToken);
      }

      if (event.type === "message" && event.message?.type === "image" && event.source?.type === "group" && event.source.groupId) {
        if (!accessToken) {
          console.error("line-webhook: LINE_CHANNEL_ACCESS_TOKEN not set, cannot fetch image content");
        } else {
          await handleSlipImage(event.source.groupId, event.message.id, accessToken);
        }
      }

      // Trimmed + case-insensitive so "Clear" / "CLEAR" / trailing
      // whitespace from a mobile keyboard all still match — this is
      // typed under time pressure in a chat, not a form field.
      if (
        event.type === "message" &&
        event.message?.type === "text" &&
        event.message.text?.trim().toLowerCase() === "clear" &&
        event.source?.type === "group" &&
        event.source.groupId
      ) {
        await handleClearCommand(event.source.groupId);
      }
    } catch (err) {
      console.error("line-webhook: error handling event", event, err);
    }
  }

  return new Response("OK", { status: 200 });
});
