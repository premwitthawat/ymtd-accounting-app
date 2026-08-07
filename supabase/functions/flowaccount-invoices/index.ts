// Monthly service-fee invoices (ใบแจ้งหนี้/ใบวางบิล) — two actions:
//
//   generate   — issue this month's invoice for every active company
//                with a monthly_fee: billing note in FlowAccount, PDF
//                into the `invoices` bucket, one LINE push into the
//                company's group. Called by the monthly-invoices
//                workflow on the 1st (service_role), and re-runnable
//                any time — already-invoiced companies are skipped, so
//                a cron retry or manual workflow_dispatch never
//                double-bills. NO follow-up reminders, by explicit
//                instruction: the daily reminder pipeline chases tax
//                payments only; the invoice push is one-shot.
//
//   mark-paid  — staff confirm the client paid: flips the invoice to
//                'paid' and immediately auto-issues the receipt with
//                the amounts the invoice fixed on the 1st. Auto is safe
//                here precisely because nothing is guessed at receipt
//                time (unlike the per-filing receipts, which keep their
//                human-confirmed modal); the human step happened when
//                the invoice went out.
//
// Auth: the raw service_role key (cron) or an owner/manager JWT — same
// role gate as everything else that touches money documents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bangkokPeriod,
  createDocument,
  ensureContact,
  exportPdfToBucket,
  getAccessToken,
  MOCK,
  round2,
  type Admin,
  type IssuedDocument,
} from "../_shared/flowaccount.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const periodThaiLabel = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
};

const formatBaht = (n: number) => new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

async function pushLineMessage(groupId: string, text: string, accessToken: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) throw new Error(`LINE push failed (${res.status}): ${await res.text()}`);
}

interface InvoiceRow {
  id: string;
  company_id: number;
  period: string;
  amount_gross: number;
  wht_rate: number;
  wht_amount: number;
  amount_due: number;
  status: string;
  paid_at: string | null;
  flowaccount_document_id: string | null;
  flowaccount_document_number: string | null;
  invoice_path: string | null;
  line_pushed_at: string | null;
  receipt_document_id: string | null;
  receipt_document_number: string | null;
  receipt_path: string | null;
  receipt_issued_at: string | null;
}

interface CompanyRow {
  id: number;
  name: string;
  short: string;
  active: boolean;
  tax_id: string | null;
  address: string | null;
  branch_code: string | null;
  flowaccount_contact_id: string | null;
  monthly_fee: number | null;
  wht_rate: number;
  line_group_id: string | null;
}

// One company's invoice for the period, end to end. Multi-step against
// an external system, so ordered to be resumable rather than atomic:
// the row is reserved first (unique company+period), the FlowAccount
// document id is CAS-written the moment it exists, and PDF/LINE steps
// re-run harmlessly — a crash at any point leaves a row a later run
// picks up and finishes instead of a duplicate bill.
async function issueInvoiceFor(admin: Admin, company: CompanyRow, period: string, lineToken: string | undefined) {
  const { data: reserved, error: reserveErr } = await admin
    .from("company_invoices")
    .upsert(
      {
        company_id: company.id,
        period,
        // Committed at reservation so a resume issues exactly what was
        // first computed, even if fees/extras changed in between.
        ...(await (async () => {
          const { data: extras, error } = await admin.from("invoice_extras").select("description, amount").eq("company_id", company.id).eq("period", period);
          if (error) throw new Error(`invoice_extras read failed: ${error.message}`);
          const gross = round2(Number(company.monthly_fee) + (extras ?? []).reduce((sum: number, e: { amount: number }) => sum + Number(e.amount), 0));
          const whtAmount = round2((gross * company.wht_rate) / 100);
          return { amount_gross: gross, wht_rate: company.wht_rate, wht_amount: whtAmount, amount_due: round2(gross - whtAmount) };
        })()),
      },
      { onConflict: "company_id,period", ignoreDuplicates: true }
    )
    .select("*");
  if (reserveErr) throw new Error(`invoice reserve failed: ${reserveErr.message}`);

  // ignoreDuplicates returns nothing when the row already existed —
  // fetch it to tell "already fully issued" from "reserved but crashed
  // mid-issue last time".
  let invoice: InvoiceRow;
  if (reserved?.length) {
    invoice = reserved[0] as InvoiceRow;
  } else {
    const { data: existing, error } = await admin
      .from("company_invoices")
      .select("*")
      .eq("company_id", company.id)
      .eq("period", period)
      .single();
    if (error) throw new Error(`invoice fetch failed: ${error.message}`);
    invoice = existing as InvoiceRow;
    // "Nothing left to do" must include the LINE leg being impossible
    // right now (no group linked / no token), or a company that can't
    // be pushed to would be reported as freshly invoiced on every
    // re-run forever. When a group gets linked later, linePending turns
    // true and the next run resumes just the push.
    const linePending = !invoice.line_pushed_at && !!company.line_group_id && !!lineToken;
    if (invoice.flowaccount_document_id && invoice.invoice_path && !linePending) {
      return { company: company.short, outcome: "skipped" as const };
    }
  }

  const accessToken = await getAccessToken(admin);

  let doc: IssuedDocument;
  if (invoice.flowaccount_document_id) {
    doc = { documentId: invoice.flowaccount_document_id, documentNumber: invoice.flowaccount_document_number ?? invoice.flowaccount_document_id };
  } else {
    const contactId = await ensureContact(admin, accessToken, { ...company, tax_id: company.tax_id! });
    const { data: extras } = await admin.from("invoice_extras").select("description, amount").eq("company_id", company.id).eq("period", period);
    doc = await createDocument(accessToken, "billing-notes", {
      mockKey: invoice.id,
      contactId,
      company,
      lines: [
        { productName: `ค่าบริการทำบัญชีประจำเดือน ${periodThaiLabel(period)}`, amount: Number(company.monthly_fee) },
        ...(extras ?? []).map((e: { description: string; amount: number }) => ({ productName: e.description, amount: Number(e.amount) })),
      ],
      amountGross: invoice.amount_gross,
      whtRate: invoice.wht_rate,
      whtAmount: invoice.wht_amount,
    });

    const { data: updated, error: saveErr } = await admin
      .from("company_invoices")
      .update({ flowaccount_document_id: doc.documentId, flowaccount_document_number: doc.documentNumber })
      .eq("id", invoice.id)
      .is("flowaccount_document_id", null)
      .select("id");
    if (saveErr) throw new Error(`invoice document write failed: ${saveErr.message}`);
    if (!updated?.length) {
      console.error(
        `flowaccount-invoices: lost issue race for invoice ${invoice.id} — document ${doc.documentNumber} (${doc.documentId}) is orphaned in FlowAccount and should be voided manually`
      );
      return { company: company.short, outcome: "skipped" as const };
    }
  }

  let invoicePath = invoice.invoice_path;
  if (!invoicePath) {
    invoicePath = await exportPdfToBucket(admin, accessToken, "billing-notes", doc, "invoices", company.id);
    const { error } = await admin.from("company_invoices").update({ invoice_path: invoicePath }).eq("id", invoice.id);
    if (error) throw new Error(`invoice_path write failed: ${error.message}`);
  }

  // The one-shot client notification. Its failure doesn't fail the
  // invoice — the document exists either way — but line_pushed_at stays
  // null so a re-run (or staff, from the app) can tell it never landed.
  if (!invoice.line_pushed_at) {
    if (!company.line_group_id) {
      console.warn(`flowaccount-invoices: ${company.short} has no line_group_id, invoice ${doc.documentNumber} not pushed`);
    } else if (!lineToken) {
      console.warn("flowaccount-invoices: LINE_CHANNEL_ACCESS_TOKEN not set, skipping push");
    } else {
      // 30 days: clients open this from chat history well after the 1st.
      const { data: signed, error: signErr } = await admin.storage.from("invoices").createSignedUrl(invoicePath, 2_592_000);
      if (signErr || !signed) throw new Error(`invoice signed URL failed: ${signErr?.message}`);
      const lines = [
        "[ใบแจ้งหนี้ค่าบริการ]",
        company.short,
        `ประจำเดือน ${periodThaiLabel(invoice.period)}`,
        `ยอดรวม ${formatBaht(invoice.amount_gross)} บาท`,
        ...(invoice.wht_amount > 0
          ? [`หัก ณ ที่จ่าย ${invoice.wht_rate}% คงเหลือชำระ ${formatBaht(invoice.amount_due)} บาท`]
          : []),
        `ใบแจ้งหนี้: ${signed.signedUrl}`,
        "ชำระแล้วรบกวนส่งสลิปในกลุ่มนี้ได้เลยครับ",
      ];
      await pushLineMessage(company.line_group_id, lines.join("\n"), lineToken);
      const { error } = await admin.from("company_invoices").update({ line_pushed_at: new Date().toISOString() }).eq("id", invoice.id);
      if (error) throw new Error(`line_pushed_at write failed: ${error.message}`);
    }
  }

  return { company: company.short, outcome: "created" as const, document_number: doc.documentNumber };
}

async function handleGenerate(admin: Admin, period: string) {
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, short, active, tax_id, address, branch_code, flowaccount_contact_id, monthly_fee, wht_rate, line_group_id")
    .eq("active", true)
    .gt("monthly_fee", 0)
    .order("id");
  if (error) return json({ error: error.message }, 500);

  const created: Record<string, string>[] = [];
  const skipped: string[] = [];
  const failed: { company: string; error: string }[] = [];

  for (const company of (companies ?? []) as CompanyRow[]) {
    if (!company.tax_id?.trim()) {
      failed.push({ company: company.short, error: "ยังไม่มีเลขผู้เสียภาษี (tax_id)" });
      continue;
    }
    try {
      const result = await issueInvoiceFor(admin, company, period, Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"));
      if (result.outcome === "created") created.push({ company: result.company, document_number: result.document_number! });
      else skipped.push(result.company);
    } catch (err) {
      console.error(`flowaccount-invoices: ${company.short} failed`, err);
      failed.push({ company: company.short, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({ period, created, skipped, failed, mock: MOCK || undefined });
}

async function handleMarkPaid(admin: Admin, invoiceId: string) {
  const { data: invoice, error: invoiceErr } = await admin
    .from("company_invoices")
    .select("*, companies(id, name, short, tax_id, address, branch_code, flowaccount_contact_id)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceErr) return json({ error: invoiceErr.message }, 400);
  if (!invoice) return json({ error: "ไม่พบใบแจ้งหนี้นี้" }, 404);
  if (!invoice.flowaccount_document_id) return json({ error: "ใบแจ้งหนี้นี้ยังออกไม่สำเร็จ รอรอบสร้างใบแจ้งหนี้ก่อน" }, 400);

  const company = invoice.companies as unknown as {
    id: number;
    name: string;
    short: string;
    tax_id: string | null;
    address: string | null;
    branch_code: string | null;
    flowaccount_contact_id: string | null;
  };

  // CAS so two staff clicking together only record one payment moment;
  // whoever loses just proceeds to the (idempotent) receipt step.
  if (invoice.status !== "paid") {
    const { error } = await admin
      .from("company_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .eq("status", "unpaid");
    if (error) return json({ error: error.message }, 500);
  }

  const storeReceiptPdf = async (accessToken: string, doc: IssuedDocument): Promise<string> => {
    const path = await exportPdfToBucket(admin, accessToken, "receipts", doc, "receipts", company.id);
    const { error } = await admin.from("company_invoices").update({ receipt_path: path }).eq("id", invoice.id);
    if (error) throw new Error(`receipt_path write failed: ${error.message}`);
    return path;
  };

  try {
    const accessToken = await getAccessToken(admin);

    // Same layered idempotency as flowaccount-issue-receipt: existing
    // receipt never re-issues, a missing PDF heals, and the CAS write
    // catches a race.
    if (invoice.receipt_document_id) {
      const doc: IssuedDocument = { documentId: invoice.receipt_document_id, documentNumber: invoice.receipt_document_number ?? invoice.receipt_document_id };
      const receiptPath = invoice.receipt_path ?? (await storeReceiptPdf(accessToken, doc));
      return json({ already_paid: true, receipt_document_number: doc.documentNumber, receipt_path: receiptPath });
    }

    const contactId = await ensureContact(admin, accessToken, { ...company, tax_id: company.tax_id! });
    const doc = await createDocument(accessToken, "receipts", {
      mockKey: `inv-${invoice.id}`,
      contactId,
      company,
      lines: [{ productName: `ค่าบริการทำบัญชีประจำเดือน ${periodThaiLabel(invoice.period)} (ตามใบแจ้งหนี้ ${invoice.flowaccount_document_number})`, amount: invoice.amount_gross }],
      amountGross: invoice.amount_gross,
      whtRate: invoice.wht_rate,
      whtAmount: invoice.wht_amount,
    });

    const { data: updated, error: saveErr } = await admin
      .from("company_invoices")
      .update({ receipt_document_id: doc.documentId, receipt_document_number: doc.documentNumber, receipt_issued_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .is("receipt_document_id", null)
      .select("id");
    if (saveErr) throw new Error(`receipt write failed: ${saveErr.message}`);
    if (!updated?.length) {
      console.error(
        `flowaccount-invoices: lost receipt race for invoice ${invoice.id} — document ${doc.documentNumber} (${doc.documentId}) is orphaned in FlowAccount and should be voided manually`
      );
      return json({ error: "มีการบันทึกรับชำระพร้อมกันจากที่อื่น กรุณารีเฟรชแล้วตรวจสอบ" }, 409);
    }

    let receiptPath: string | null = null;
    try {
      receiptPath = await storeReceiptPdf(accessToken, doc);
    } catch (pdfErr) {
      console.error("flowaccount-invoices: receipt PDF export failed after issue", pdfErr);
      return json(
        { error: `รับชำระและออกใบเสร็จ ${doc.documentNumber} แล้ว แต่ดึง PDF ไม่สำเร็จ — กด "รับชำระแล้ว" ซ้ำเพื่อลองดึงอีกครั้ง`, receipt_document_number: doc.documentNumber },
        502
      );
    }

    return json({ receipt_document_number: doc.documentNumber, receipt_path: receiptPath, mock: MOCK || undefined });
  } catch (err) {
    console.error("flowaccount-invoices: mark-paid failed", err);
    return json({ error: err instanceof Error ? err.message : "FlowAccount request failed" }, 502);
  }
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Missing auth" }, 401);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // The monthly workflow calls with the raw service_role key — no user
  // exists at 08:30 on the 1st. Anything else must be a live
  // owner/manager session, same gate as the other document functions.
  if (jwt !== serviceKey) {
    const { data: callerAuth, error: callerAuthErr } = await admin.auth.getUser(jwt);
    if (callerAuthErr || !callerAuth.user) return json({ error: "Invalid session" }, 401);
    const { data: callerProfile, error: callerProfileErr } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", callerAuth.user.id)
      .single();
    if (callerProfileErr || !callerProfile?.active || !["owner", "manager"].includes(callerProfile.role)) {
      return json({ error: "Forbidden — owner/manager only" }, 403);
    }
  }

  let body: { action?: string; period?: string; invoice_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.action === "generate") {
    const period = typeof body.period === "string" && /^\d{4}-\d{2}$/.test(body.period) ? body.period : bangkokPeriod(new Date());
    return handleGenerate(admin, period);
  }
  if (body.action === "mark-paid") {
    const invoiceId = String(body.invoice_id ?? "");
    if (!invoiceId) return json({ error: "Missing invoice_id" }, 400);
    return handleMarkPaid(admin, invoiceId);
  }
  return json({ error: "Unknown action" }, 400);
});
