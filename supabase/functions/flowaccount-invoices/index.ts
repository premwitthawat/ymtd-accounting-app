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
  bangkokYearMonth,
  createDocument,
  deleteDocument,
  ensureContact,
  exportPdfToBucket,
  getAccessToken,
  MOCK,
  round2,
  safePathPart,
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

// Payment terms for the monthly fee: issued on the 1st, due by the end
// of the month being billed. Day 0 of the *next* month is the last day
// of this one, which also keeps February and 30-day months honest.
const lastDayOfPeriod = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
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
  // ใบวางบิลรวมฉบับล่าสุดของบริษัท (021) — มีได้ทีละฉบับ ฉบับเก่าถูกลบเมื่อออกใหม่/หนี้หมด
  billing_note_doc_id: string | null;
  billing_note_number: string | null;
}

// ใบของบริษัทที่ยังไม่ชำระทั้งหมด (รวมงวดปัจจุบัน) เรียงงวดเก่า → ใหม่ — ใช้ทั้งตอน
// ตัดสินใจออกใบวางบิลรวม และตอนเช็คว่าหนี้หมดหรือยังหลังรับชำระ
async function unpaidInvoicesOf(admin: Admin, companyId: number): Promise<InvoiceRow[]> {
  const { data, error } = await admin
    .from("company_invoices")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "unpaid")
    .order("period", { ascending: true });
  if (error) throw new Error(`unpaid invoices read failed: ${error.message}`);
  return (data ?? []) as InvoiceRow[];
}

// ลบใบวางบิลรวมฉบับที่ค้างอยู่ (ถ้ามี) — เรียกเมื่อจะออกฉบับใหม่แทน หรือเมื่อลูกหนี้
// เคลียร์ครบแล้ว การลบใน FlowAccount ล้มเหลวไม่ใช่เหตุให้ทั้งงานพัง (เช่น มีคนลบจาก
// หน้าเว็บไปก่อน หรือใบขยับสถานะจนลบไม่ได้) — สำคัญที่ column ต้องถูกล้างเสมอ ไม่งั้น
// เดือนหน้าจะพยายามลบใบเดิมซ้ำไม่รู้จบ
async function dropBillingNote(admin: Admin, accessToken: string, company: CompanyRow) {
  if (!company.billing_note_doc_id) return;
  try {
    await deleteDocument(accessToken, "billing", company.billing_note_doc_id);
  } catch (err) {
    console.warn(`flowaccount-invoices: delete billing note ${company.billing_note_number} (${company.billing_note_doc_id}) failed`, err);
  }
  await removeBillingNotePdf(admin, company);
  const { error } = await admin.from("companies").update({ billing_note_doc_id: null, billing_note_number: null }).eq("id", company.id);
  if (error) throw new Error(`billing note clear failed: ${error.message}`);
  company.billing_note_doc_id = null;
  company.billing_note_number = null;
}

// ไฟล์ PDF ของใบวางบิลที่ถูกลบ — signed URL ที่ส่งเข้ากลุ่มไปแล้วอายุ 30 วันและชี้ไฟล์นี้
// ตรง ๆ การลบเอกสารใน FlowAccount อย่างเดียวไม่ทำให้ลิงก์ตาย จึงลบไฟล์ทิ้งด้วย
// path สร้างจากเดือนที่ export (ใบออกวันที่ 1 และถูกแทน/เคลียร์ภายใน ≤ 1 เดือน →
// ลองเดือนนี้กับเดือนก่อนครอบคลุมกรณีจริง) พลาดก็แค่ไฟล์ตกค้างจนลิงก์หมดอายุเอง
async function removeBillingNotePdf(admin: Admin, company: { id: number; billing_note_number: string | null }) {
  if (!company.billing_note_number) return;
  const now = new Date();
  const prev = new Date(now);
  prev.setUTCDate(0); // วันสุดท้ายของเดือนก่อน
  const paths = [now, prev].map(d => {
    const { year, month } = bangkokYearMonth(d);
    return `company-${company.id}/${year}/${month}/${safePathPart(company.billing_note_number!)}.pdf`;
  });
  const { error } = await admin.storage.from("invoices").remove(paths);
  if (error) console.warn(`flowaccount-invoices: remove billing note pdf failed: ${error.message}`);
}

// หลังรับชำระ: ถ้าบริษัทไม่เหลือใบค้างแล้ว ใบวางบิลรวมที่ค้างอยู่ (ถ้ามี) หมดหน้าที่ —
// ลบทิ้ง กันลูกค้ากดลิงก์เก่าแล้วเจอยอดที่จ่ายไปแล้ว ล้มเหลวแค่ log ไม่กระทบใบเสร็จ
async function clearBillingNoteIfSettled(
  admin: Admin,
  accessToken: string,
  company: { id: number; billing_note_doc_id: string | null; billing_note_number: string | null }
) {
  if (!company.billing_note_doc_id) return;
  const { data: remaining, error } = await admin
    .from("company_invoices")
    .select("id")
    .eq("company_id", company.id)
    .eq("status", "unpaid")
    .limit(1);
  if (error) {
    console.warn(`flowaccount-invoices: unpaid check for billing-note cleanup failed: ${error.message}`);
    return;
  }
  if (remaining?.length) return;
  try {
    await deleteDocument(accessToken, "billing", company.billing_note_doc_id);
  } catch (err) {
    console.warn(`flowaccount-invoices: delete settled billing note ${company.billing_note_number} failed`, err);
  }
  await removeBillingNotePdf(admin, company);
  const { error: clearErr } = await admin.from("companies").update({ billing_note_doc_id: null, billing_note_number: null }).eq("id", company.id);
  if (clearErr) console.warn(`flowaccount-invoices: billing note clear failed: ${clearErr.message}`);
}

// ใบวางบิลรวม (ใหม่แทนเก่าเสมอ ให้มีทีละฉบับ): บรรทัดละงวดที่ค้าง ยอด/หัก ณ ที่จ่าย
// ตามใบแจ้งหนี้จริงของแต่ละงวด — ใบแจ้งหนี้รายเดือนยังแยกใบใครใบมันเพื่อการบัญชี
// ใบวางบิลเป็นแค่เอกสารหน้าเดียวให้ลูกค้าเห็นยอดรวมที่ต้องโอน
async function issueBillingNote(admin: Admin, accessToken: string, company: CompanyRow, unpaid: InvoiceRow[]) {
  await dropBillingNote(admin, accessToken, company);
  const gross = round2(unpaid.reduce((s, inv) => s + Number(inv.amount_gross), 0));
  const whtAmount = round2(unpaid.reduce((s, inv) => s + Number(inv.wht_amount), 0));
  const latest = unpaid[unpaid.length - 1];
  const contactId = await ensureContact(admin, accessToken, { ...company, tax_id: company.tax_id! });
  const doc = await createDocument(accessToken, "billing", {
    mockKey: `bl-${company.id}-${latest.period}`,
    contactId,
    company,
    lines: unpaid.map(inv => ({ productName: `ค่าบริการทำบัญชีประจำเดือน ${periodThaiLabel(inv.period)}`, amount: Number(inv.amount_gross) })),
    amountGross: gross,
    // อัตราคำนวณย้อนจากยอดจริงที่แช่แข็งไว้ในใบแต่ละงวด — ไม่ใช้ company.wht_rate
    // ปัจจุบัน เพราะถ้าอัตราเพิ่งถูกแก้ เปอร์เซ็นต์กับยอดเงินในเอกสารจะขัดกันเอง
    whtRate: gross > 0 && whtAmount > 0 ? round2((whtAmount / gross) * 100) : 0,
    whtAmount,
    issuedOn: `${latest.period}-01`,
    dueDate: lastDayOfPeriod(latest.period),
    remarks: `รวมยอดค้างชำระถึงงวด ${periodThaiLabel(latest.period)}`,
  });
  // บันทึกเลขเอกสารก่อนดึง PDF — แบบเดียวกับใบแจ้งหนี้/ใบเสร็จ: ถ้าดึง PDF พัง
  // แถวยังชี้ใบจริง รอบถัดไป dropBillingNote จะลบทิ้งแล้วออกใหม่ ไม่เกิดใบกำพร้า
  const { error } = await admin
    .from("companies")
    .update({ billing_note_doc_id: doc.documentId, billing_note_number: doc.documentNumber })
    .eq("id", company.id);
  if (error) throw new Error(`billing note write failed: ${error.message}`);
  company.billing_note_doc_id = doc.documentId;
  company.billing_note_number = doc.documentNumber;
  const path = await exportPdfToBucket(admin, accessToken, "billing", doc, "invoices", company.id);
  return { doc, path, gross, whtAmount };
}

// การแจ้งลูกค้าครั้งเดียวของงวดนี้ — ตัดสินใจตรงนี้ว่าจะส่งหน้าตาไหน:
//   ไม่มียอดค้างเก่า → ลิงก์ใบแจ้งหนี้งวดนี้ (พฤติกรรมเดิม)
//   มียอดค้างเก่า   → ออกใบวางบิลรวมทุกงวดที่ค้าง แล้วส่งลิงก์ใบวางบิลใบเดียว
//                     พร้อมสรุปรายงวด ลูกค้าเห็นยอดรวมที่ต้องโอนในเอกสารเดียว
// ส่งไม่สำเร็จไม่ทำให้ใบแจ้งหนี้พัง — line_pushed_at คงค้างไว้ให้รอบถัดไปส่งซ้ำ
async function notifyClient(admin: Admin, accessToken: string, company: CompanyRow, invoice: InvoiceRow, lineToken: string | undefined) {
  if (invoice.line_pushed_at) return;
  // resume ของงวดที่ถูกจ่ายไประหว่างทาง (เช่น กด "รับชำระแล้ว" ในแอปหลัง push แรกพัง)
  // — อย่าทวงสิ่งที่จ่ายแล้ว
  if (invoice.status !== "unpaid") return;
  const unpaid = await unpaidInvoicesOf(admin, company.id);
  const arrears = unpaid.filter(inv => inv.id !== invoice.id);
  // หนี้เหลือใบเดียว (งวดนี้เอง) แต่ยังถือใบวางบิลรวมของรอบก่อน = ใบนั้นล้าสมัยแล้ว
  if (!arrears.length) await dropBillingNote(admin, accessToken, company);

  if (!company.line_group_id) {
    console.warn(`flowaccount-invoices: ${company.short} has no line_group_id, invoice ${invoice.flowaccount_document_number} not pushed`);
    return;
  }
  if (!lineToken) {
    console.warn("flowaccount-invoices: LINE_CHANNEL_ACCESS_TOKEN not set, skipping push");
    return;
  }

  let lines: string[];
  if (arrears.length) {
    const bill = await issueBillingNote(admin, accessToken, company, unpaid);
    const { data: signed, error: signErr } = await admin.storage.from("invoices").createSignedUrl(bill.path, 2_592_000);
    if (signErr || !signed) throw new Error(`billing note signed URL failed: ${signErr?.message}`);
    lines = [
      "[ใบแจ้งหนี้ค่าบริการ]",
      company.short,
      `ประจำเดือน ${periodThaiLabel(invoice.period)} ยอด ${formatBaht(invoice.amount_gross)} บาท`,
      `⚠ มียอดค้างชำระเดิม ${arrears.length} งวด:`,
      ...arrears.map(inv => `- ${periodThaiLabel(inv.period)} ${formatBaht(inv.amount_gross)} บาท`),
      `รวมค้างทั้งหมด ${formatBaht(bill.gross)} บาท`,
      ...(bill.whtAmount > 0 ? [`หัก ณ ที่จ่ายรวม ${formatBaht(bill.whtAmount)} บาท คงเหลือชำระ ${formatBaht(round2(bill.gross - bill.whtAmount))} บาท`] : []),
      `ใบวางบิลรวม: ${signed.signedUrl}`,
      "ชำระแล้วรบกวนส่งสลิปในกลุ่มนี้ได้เลยครับ",
    ];
  } else {
    // 30 days: clients open this from chat history well after the 1st.
    const { data: signed, error: signErr } = await admin.storage.from("invoices").createSignedUrl(invoice.invoice_path!, 2_592_000);
    if (signErr || !signed) throw new Error(`invoice signed URL failed: ${signErr?.message}`);
    lines = [
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
  }
  await pushLineMessage(company.line_group_id, lines.join("\n"), lineToken);
  const { error } = await admin.from("company_invoices").update({ line_pushed_at: new Date().toISOString() }).eq("id", invoice.id);
  if (error) throw new Error(`line_pushed_at write failed: ${error.message}`);
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
    doc = await createDocument(accessToken, "invoice", {
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
      issuedOn: `${period}-01`,
      dueDate: lastDayOfPeriod(period),
      remarks: `ค่าบริการประจำเดือน ${periodThaiLabel(period)}`,
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
    invoicePath = await exportPdfToBucket(admin, accessToken, "invoice", doc, "invoices", company.id);
    const { error } = await admin.from("company_invoices").update({ invoice_path: invoicePath }).eq("id", invoice.id);
    if (error) throw new Error(`invoice_path write failed: ${error.message}`);
  }

  // แจ้งลูกค้า (ปกติ/ใบวางบิลรวม — notifyClient ตัดสินใจจากยอดค้างจริง) ครั้งเดียวต่อ
  // งวด ส่งพลาดไม่ทำให้ใบพัง line_pushed_at ยังว่างให้รอบถัดไปส่งซ้ำ
  await notifyClient(
    admin,
    accessToken,
    company,
    { ...invoice, flowaccount_document_number: doc.documentNumber, invoice_path: invoicePath },
    lineToken
  );

  return { company: company.short, outcome: "created" as const, document_number: doc.documentNumber };
}

async function handleGenerate(admin: Admin, period: string) {
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, short, active, tax_id, address, branch_code, flowaccount_contact_id, monthly_fee, wht_rate, line_group_id, billing_note_doc_id, billing_note_number")
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
    .select("*, companies(id, name, short, tax_id, address, branch_code, flowaccount_contact_id, line_group_id, billing_note_doc_id, billing_note_number)")
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
    line_group_id: string | null;
    billing_note_doc_id: string | null;
    billing_note_number: string | null;
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
    const path = await exportPdfToBucket(admin, accessToken, "receipt", doc, "receipts", company.id);
    const { error } = await admin.from("company_invoices").update({ receipt_path: path }).eq("id", invoice.id);
    if (error) throw new Error(`receipt_path write failed: ${error.message}`);
    return path;
  };

  // Delivers the receipt into the client's LINE group, once — same
  // whether mark-paid came from the app button or the "paid" chat
  // command, so the client's experience doesn't depend on which door
  // staff used. Push failure is non-fatal (the receipt exists either
  // way); receipt_line_pushed_at stays null so the next mark-paid call
  // retries just this step.
  const pushReceiptToLine = async (doc: IssuedDocument, receiptPath: string) => {
    if (invoice.receipt_line_pushed_at) return;
    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    if (!company.line_group_id || !lineToken) {
      console.warn(`flowaccount-invoices: receipt ${doc.documentNumber} not pushed (no ${company.line_group_id ? "LINE token" : "line_group_id"})`);
      return;
    }
    try {
      const { data: signed, error: signErr } = await admin.storage.from("receipts").createSignedUrl(receiptPath, 2_592_000);
      if (signErr || !signed) throw new Error(`receipt signed URL failed: ${signErr?.message}`);
      const text = [
        "[ใบเสร็จรับเงิน]",
        company.short,
        `เลขที่ ${doc.documentNumber}`,
        `ค่าบริการประจำเดือน ${periodThaiLabel(invoice.period)}`,
        `ดาวน์โหลด: ${signed.signedUrl}`,
        "ขอบคุณที่ใช้บริการครับ",
      ].join("\n");
      await pushLineMessage(company.line_group_id, text, lineToken);
      const { error } = await admin.from("company_invoices").update({ receipt_line_pushed_at: new Date().toISOString() }).eq("id", invoice.id);
      if (error) throw new Error(`receipt_line_pushed_at write failed: ${error.message}`);
    } catch (err) {
      console.error("flowaccount-invoices: receipt LINE push failed", err);
    }
  };

  try {
    const accessToken = await getAccessToken(admin);

    // Same layered idempotency as flowaccount-issue-receipt: existing
    // receipt never re-issues, a missing PDF heals, and the CAS write
    // catches a race.
    if (invoice.receipt_document_id) {
      const doc: IssuedDocument = { documentId: invoice.receipt_document_id, documentNumber: invoice.receipt_document_number ?? invoice.receipt_document_id };
      const receiptPath = invoice.receipt_path ?? (await storeReceiptPdf(accessToken, doc));
      await pushReceiptToLine(doc, receiptPath);
      await clearBillingNoteIfSettled(admin, accessToken, company);
      return json({ already_paid: true, receipt_document_number: doc.documentNumber, receipt_path: receiptPath });
    }

    // The receipt is an upgrade of this month's invoice, so that
    // invoice must exist first. It normally does (generate runs on the
    // 1st), but a company whose generation failed would otherwise fail
    // deep inside FlowAccount with an opaque error.
    if (!invoice.flowaccount_document_id || !invoice.flowaccount_document_number) {
      return json({ error: "ยังไม่มีใบแจ้งหนี้ของเดือนนี้ในระบบ FlowAccount — ออกใบแจ้งหนี้ก่อนจึงจะออกใบเสร็จได้" }, 409);
    }

    // อ่านซ้ำสด ๆ ก่อนสร้างเอกสารจริง: ข้อมูล invoice ในมืออ่านมาตั้งแต่ต้น request
    // (หลายวินาทีก่อนหน้า — ระหว่างนั้น "paid" ซ้ำ/ปุ่มในแอปอาจออกใบเสร็จไปแล้ว)
    // CAS ตอนบันทึกจับ race ได้ แต่ตอนนั้นเอกสารจริงถูกสร้างใน FlowAccount ไปแล้ว
    // และต้อง void มือ — เช็คตรงนี้ย่นหน้าต่างเหลือระดับมิลลิวินาที
    const { data: freshRow } = await admin
      .from("company_invoices")
      .select("receipt_document_id, receipt_document_number, receipt_path")
      .eq("id", invoice.id)
      .single();
    if (freshRow?.receipt_document_id) {
      const doneDoc: IssuedDocument = { documentId: freshRow.receipt_document_id, documentNumber: freshRow.receipt_document_number ?? freshRow.receipt_document_id };
      const donePath = freshRow.receipt_path ?? (await storeReceiptPdf(accessToken, doneDoc));
      await pushReceiptToLine(doneDoc, donePath);
      await clearBillingNoteIfSettled(admin, accessToken, company);
      return json({ already_paid: true, receipt_document_number: doneDoc.documentNumber, receipt_path: donePath });
    }

    const contactId = await ensureContact(admin, accessToken, { ...company, tax_id: company.tax_id! });
    const doc = await createDocument(accessToken, "receipt", {
      mockKey: `inv-${invoice.id}`,
      contactId,
      company,
      lines: [{ productName: `ค่าบริการทำบัญชีประจำเดือน ${periodThaiLabel(invoice.period)}`, amount: invoice.amount_gross }],
      amountGross: invoice.amount_gross,
      whtRate: invoice.wht_rate,
      whtAmount: invoice.wht_amount,
      remarks: `รับชำระตามใบแจ้งหนี้ ${invoice.flowaccount_document_number}`,
      reference: { documentId: invoice.flowaccount_document_id, documentNumber: invoice.flowaccount_document_number },
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

    await pushReceiptToLine(doc, receiptPath);
    await clearBillingNoteIfSettled(admin, accessToken, company);

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
  //
  // CRON_SECRET is a second service-grade credential for GitHub Actions:
  // the platform-injected SUPABASE_SERVICE_ROLE_KEY is the new sb_secret
  // format here, which the repo's stored secret (legacy JWT) can never
  // equal — a dedicated shared secret keeps the cron independent of
  // whichever key format the platform injects this month.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (jwt !== serviceKey && !(cronSecret && jwt === cronSecret)) {
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
