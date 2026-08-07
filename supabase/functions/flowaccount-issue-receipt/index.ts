// Issues a FlowAccount receipt (ใบเสร็จรับเงิน) for one *paid*
// payment_records row, on an explicit staff click from
// CompanyPaymentRecords.jsx — deliberately NOT auto-fired when status
// flips to 'paid': these are per-filing payments whose amounts staff
// read off slips, so a human confirms the numbers in the modal first.
// (The monthly service-fee invoices in flowaccount-invoices DO
// auto-issue their receipt — there the amount was fixed when the
// invoice went out, so nothing is guessed.)
//
// Modeled on admin-users/index.ts (CORS preflight + JWT + role
// re-check against profiles), not line-webhook/index.ts — that one has
// no CORS because LINE posts to it directly, while this is called from
// the browser. FlowAccount specifics (token cache, contact reuse, mock
// mode, payload shape) live in ../_shared/flowaccount.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDocument, ensureContact, exportPdfToBucket, getAccessToken, MOCK, round2, type IssuedDocument } from "../_shared/flowaccount.ts";

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

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return json({ error: "Missing auth" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: callerAuth, error: callerAuthErr } = await admin.auth.getUser(jwt);
  if (callerAuthErr || !callerAuth.user) return json({ error: "Invalid session" }, 401);

  // Same gate as the UI that shows the button (canApprove = owner or
  // manager): issuing a tax document in the firm's name is not an
  // employee-level action, and the browser check alone is decoration.
  const { data: callerProfile, error: callerProfileErr } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", callerAuth.user.id)
    .single();
  if (callerProfileErr || !callerProfile?.active || !["owner", "manager"].includes(callerProfile.role)) {
    return json({ error: "Forbidden — owner/manager only" }, 403);
  }

  let body: { payment_record_id?: string; amount_gross?: number; wht_rate?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const recordId = String(body.payment_record_id ?? "");
  if (!recordId) return json({ error: "Missing payment_record_id" }, 400);

  const { data: record, error: recordErr } = await admin
    .from("payment_records")
    .select(
      "id, status, amount, flowaccount_document_id, flowaccount_document_number, receipt_path, issued_at, tasks!inner(id, type, company_id, companies(id, name, short, tax_id, address, branch_code, flowaccount_contact_id))"
    )
    .eq("id", recordId)
    .maybeSingle();
  if (recordErr) return json({ error: recordErr.message }, 400);
  if (!record) return json({ error: "ไม่พบรายการชำระเงินนี้" }, 404);

  const task = record.tasks as unknown as {
    id: number;
    type: string;
    company_id: number;
    companies: { id: number; name: string; short: string; tax_id: string | null; address: string | null; branch_code: string | null; flowaccount_contact_id: string | null };
  };
  const company = task.companies;

  const storePdf = async (accessToken: string, doc: IssuedDocument): Promise<string> => {
    const path = await exportPdfToBucket(admin, accessToken, "receipts", doc, "receipts", company.id);
    const { error } = await admin.from("payment_records").update({ receipt_path: path }).eq("id", record.id);
    if (error) throw new Error(`receipt_path write failed: ${error.message}`);
    return path;
  };

  // Idempotency, layer 1: a receipt already exists for this record →
  // never create a second one. If its PDF also landed, this is a pure
  // read; if the earlier export failed (the "orphan" case), heal it by
  // re-exporting — export-pdf creates nothing on the FlowAccount side,
  // so this stays safe to repeat.
  if (record.flowaccount_document_id) {
    const doc: IssuedDocument = { documentId: record.flowaccount_document_id, documentNumber: record.flowaccount_document_number ?? record.flowaccount_document_id };
    let receiptPath = record.receipt_path;
    if (!receiptPath) {
      try {
        const accessToken = await getAccessToken(admin);
        receiptPath = await storePdf(accessToken, doc);
      } catch (err) {
        console.error("flowaccount-issue-receipt: PDF heal failed", err);
        return json({ error: `ใบเสร็จ ${doc.documentNumber} ออกแล้ว แต่ดึง PDF ไม่สำเร็จ ลองใหม่อีกครั้ง`, document_number: doc.documentNumber }, 502);
      }
    }
    return json({ already_issued: true, document_id: doc.documentId, document_number: doc.documentNumber, receipt_path: receiptPath, issued_at: record.issued_at });
  }

  // Validation — everything wrong reported at once, so staff fix the
  // master data in one pass instead of replaying the click per field.
  const problems: string[] = [];
  if (record.status !== "paid") problems.push("รายการยังไม่อยู่ในสถานะชำระแล้ว");
  const amountGross = Number(body.amount_gross);
  if (!Number.isFinite(amountGross) || amountGross <= 0) problems.push("ไม่ได้ระบุยอดค่าบริการเต็ม (amount_gross)");
  if (!company.tax_id?.trim()) problems.push(`บริษัท ${company.short} ยังไม่มีเลขผู้เสียภาษี (tax_id)`);
  const whtRate = Number(body.wht_rate ?? 0);
  if (!Number.isFinite(whtRate) || whtRate < 0 || whtRate >= 100) problems.push("อัตราหัก ณ ที่จ่ายไม่ถูกต้อง");
  if (problems.length) return json({ error: problems.join(" · ") }, 400);

  const whtAmount = round2(amountGross * whtRate / 100);
  const amountReceived = round2(amountGross - whtAmount);

  // The receipt line item: explicit mapping if staff set one on the
  // service type, otherwise the type name itself — which is what the
  // receipt would say in Thai anyway.
  const { data: taskType } = await admin.from("task_types").select("flowaccount_product_name").eq("key", task.type).maybeSingle();
  const productName = taskType?.flowaccount_product_name?.trim() || `ค่าบริการ${task.type}`;

  try {
    const accessToken = await getAccessToken(admin);
    const contactId = await ensureContact(admin, accessToken, { ...company, tax_id: company.tax_id! });
    const doc = await createDocument(accessToken, "receipts", {
      mockKey: record.id,
      contactId,
      company,
      lines: [{ productName, amount: amountGross }],
      amountGross,
      whtRate,
      whtAmount,
    });

    // Persist the document BEFORE attempting the PDF. If the export (or
    // anything after it) fails and this hadn't been written, the receipt
    // would exist in FlowAccount with the app blind to it — and the
    // button would happily issue a duplicate on the next click.
    //
    // Idempotency, layer 2: `.is(null)` makes this a compare-and-set —
    // two clicks racing past the early-return both reach here, but only
    // one row-update matches. The loser's FlowAccount document is
    // logged as garbage to void by hand; the DB stays consistent.
    const { data: updated, error: saveErr } = await admin
      .from("payment_records")
      .update({
        flowaccount_document_id: doc.documentId,
        flowaccount_document_number: doc.documentNumber,
        amount_gross: amountGross,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        amount_received: amountReceived,
        issued_at: new Date().toISOString(),
      })
      .eq("id", record.id)
      .is("flowaccount_document_id", null)
      .select("id");
    if (saveErr) throw new Error(`payment_records write failed: ${saveErr.message}`);
    if (!updated?.length) {
      console.error(
        `flowaccount-issue-receipt: lost issue race for payment_records ${record.id} — document ${doc.documentNumber} (${doc.documentId}) is now orphaned in FlowAccount and should be voided manually`
      );
      return json({ error: "มีการออกใบเสร็จรายการนี้พร้อมกันจากที่อื่น กรุณารีเฟรชแล้วตรวจสอบ" }, 409);
    }

    let receiptPath: string | null = null;
    try {
      receiptPath = await storePdf(accessToken, doc);
    } catch (pdfErr) {
      // Document is already saved above — surfacing the PDF failure is
      // safe, and the next click takes the heal path instead of
      // re-issuing.
      console.error("flowaccount-issue-receipt: PDF export failed after issue", pdfErr);
      return json({ error: `ออกใบเสร็จ ${doc.documentNumber} สำเร็จ แต่ดึง PDF ไม่สำเร็จ — กดออกใบเสร็จซ้ำเพื่อลองดึงอีกครั้ง`, document_number: doc.documentNumber }, 502);
    }

    return json({ document_id: doc.documentId, document_number: doc.documentNumber, receipt_path: receiptPath, mock: MOCK || undefined });
  } catch (err) {
    console.error("flowaccount-issue-receipt: issue failed", err);
    return json({ error: err instanceof Error ? err.message : "FlowAccount request failed" }, 502);
  }
});
