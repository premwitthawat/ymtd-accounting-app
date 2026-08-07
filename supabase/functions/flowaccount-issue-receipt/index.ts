// Issues a FlowAccount receipt (ใบเสร็จรับเงิน) for one *paid*
// payment_records row, on an explicit staff click from
// CompanyPaymentRecords.jsx — deliberately NOT auto-fired when status
// flips to 'paid': a tax document issued with the wrong amount has to
// be unwound with a credit note, which costs far more than making a
// human confirm the numbers once. Auto-issue is a later phase, after
// master data (tax_id / unit_price) has proven itself clean.
//
// Modeled on admin-users/index.ts (CORS preflight + JWT + role
// re-check against profiles), not line-webhook/index.ts — that one has
// no CORS because LINE posts to it directly, while this is called from
// the browser.
//
// Talks to FlowAccount OpenAPI (client-credentials OAuth). Defaults
// point at the SANDBOX — production is opt-in via env, never the
// fallback, so a half-configured deploy can't issue real documents.
// FLOWACCOUNT_MOCK=true short-circuits every outbound call with
// shape-identical fakes: real credentials take 1–2 business days to be
// approved, and the rest of the flow (validation, storage, DB writes,
// idempotency) shouldn't have to wait for them to be testable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const BASE_URL = Deno.env.get("FLOWACCOUNT_BASE_URL") ?? "https://openapi.flowaccount.com/test";
const TOKEN_URL = Deno.env.get("FLOWACCOUNT_TOKEN_URL") ?? "https://openapi.flowaccount.com/token";
const MOCK = Deno.env.get("FLOWACCOUNT_MOCK") === "true";

// Copied verbatim from line-webhook/index.ts (per the brief: reuse, don't
// reinvent) — the year/month folder in the storage path should follow the
// calendar month staff experience, not the edge region's clock.
function bangkokYearMonth(date: Date): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  return {
    year: parts.find(p => p.type === "year")!.value,
    month: parts.find(p => p.type === "month")!.value,
  };
}

// Storage keys treat "/" as folder separators, so a "/" inside a company
// short name or a FlowAccount document number ("RE-2026/08/001" style)
// would silently create extra nesting. Same sanitizer line-webhook uses
// for slips, extended to the document number.
const safePathPart = (s: string) => s.replace(/[/\\]/g, "-");

const round2 = (n: number) => Math.round(n * 100) / 100;

// FlowAccount's own rate-limit announcement recommends exponential
// backoff on 429 (sandbox allows just 20 req/min, and one receipt costs
// up to 4 calls: token + contact + create + export). Retry-After is
// honored when present; otherwise 1s/2s/4s.
async function flowFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return flowFetch(url, init, attempt + 1);
  }
  return res;
}

// A tiny but structurally valid PDF, so the mock path exercises the
// exact same decode → upload → signed-URL pipeline as the real one and
// "ดูใบเสร็จ" opens something a PDF viewer accepts.
const MOCK_PDF_BASE64 = btoa(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF"
);

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;

// Client-credentials token, cached in integration_tokens (service-role
// only, see 017). The 60s slack means a token that *technically* has a
// few seconds left never gets used for a multi-call sequence that would
// outlive it mid-flight.
async function getAccessToken(admin: Admin): Promise<string> {
  if (MOCK) return "mock-token";

  const { data: cached } = await admin
    .from("integration_tokens")
    .select("access_token, expires_at")
    .eq("provider", "flowaccount")
    .maybeSingle();
  if (cached && new Date(cached.expires_at).getTime() - Date.now() > 60_000) {
    return cached.access_token;
  }

  const clientId = Deno.env.get("FLOWACCOUNT_CLIENT_ID");
  const clientSecret = Deno.env.get("FLOWACCOUNT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET not configured");
  }

  const res = await flowFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "flowaccount-api" }),
  });
  if (!res.ok) throw new Error(`FlowAccount token request failed (${res.status}): ${await res.text()}`);
  const token = (await res.json()) as { access_token: string; expires_in: number };

  const { error } = await admin.from("integration_tokens").upsert({
    provider: "flowaccount",
    access_token: token.access_token,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`token cache write failed: ${error.message}`);
  return token.access_token;
}

// One FlowAccount contact per company, created lazily on the first
// receipt and cached on companies.flowaccount_contact_id so repeat
// receipts don't pile duplicate contacts into the FlowAccount address
// book.
async function ensureContact(
  admin: Admin,
  accessToken: string,
  company: { id: number; name: string; tax_id: string; address: string | null; branch_code: string | null; flowaccount_contact_id: string | null }
): Promise<string> {
  if (company.flowaccount_contact_id) return company.flowaccount_contact_id;

  let contactId: string;
  if (MOCK) {
    contactId = `mock-contact-${company.id}`;
  } else {
    const res = await flowFetch(`${BASE_URL}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: company.name,
        taxId: company.tax_id,
        address: company.address ?? "",
        branchCode: company.branch_code ?? "00000",
        contactType: 3, // juristic person — every client billed through this app is one
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status === false) {
      throw new Error(`FlowAccount contact create failed (${res.status}): ${JSON.stringify(body)}`);
    }
    contactId = String(body.data?.id ?? body.data?.contactId ?? body.id);
  }

  const { error } = await admin.from("companies").update({ flowaccount_contact_id: contactId }).eq("id", company.id);
  if (error) throw new Error(`contact id write-back failed: ${error.message}`);
  return contactId;
}

interface IssuedDocument {
  documentId: string;
  documentNumber: string;
}

async function createReceipt(
  accessToken: string,
  args: {
    recordId: string;
    contactId: string;
    company: { name: string; tax_id: string; address: string | null; branch_code: string | null };
    productName: string;
    amountGross: number;
    whtRate: number;
    whtAmount: number;
  }
): Promise<IssuedDocument> {
  if (MOCK) {
    // Deterministic per record — calling the mock twice for the same
    // record produces the same "document", mirroring how the DB unique
    // index would treat a real duplicate.
    const { year, month } = bangkokYearMonth(new Date());
    return { documentId: `mock-${args.recordId}`, documentNumber: `MOCK${year}${month}-${args.recordId.slice(0, 8)}` };
  }

  // Field names follow FlowAccount's inline-document schema. Exact
  // acceptance can only be proven against the sandbox once credentials
  // arrive — flagged in the work report; the mock covers everything
  // downstream of this call in the meantime.
  const res = await flowFetch(`${BASE_URL}/receipts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: args.contactId,
      contactName: args.company.name,
      contactTaxId: args.company.tax_id,
      contactAddress: args.company.address ?? "",
      contactBranch: args.company.branch_code ?? "00000",
      publishedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()),
      documentLines: [{ productName: args.productName, quantity: 1, unitName: "งาน", pricePerUnit: args.amountGross, total: args.amountGross }],
      subTotal: args.amountGross,
      totalAfterDiscount: args.amountGross,
      isVatInclusive: false,
      grandTotal: args.amountGross,
      withholdingTaxPercent: args.whtRate,
      withholdingTaxAmount: args.whtAmount,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) {
    throw new Error(`FlowAccount receipt create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const doc = body.data ?? body;
  return {
    documentId: String(doc.recordId ?? doc.documentId ?? doc.id),
    documentNumber: String(doc.documentSerial ?? doc.documentNumber ?? doc.recordId ?? doc.id),
  };
}

async function exportPdfBase64(accessToken: string, documentId: string): Promise<string> {
  if (MOCK) return MOCK_PDF_BASE64;

  const res = await flowFetch(`${BASE_URL}/receipts/${documentId}/export-pdf/base64`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false || !body.data) {
    throw new Error(`FlowAccount PDF export failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data as string;
}

// Downloads the PDF and stores it, returning the object path written to
// payment_records.receipt_path. Factored out because it runs from two
// places: the happy path, and the retry that heals a record whose
// receipt exists but whose earlier PDF export failed.
async function storePdf(admin: Admin, accessToken: string, doc: IssuedDocument, companyShort: string, recordId: string): Promise<string> {
  const pdfBase64 = await exportPdfBase64(accessToken, doc.documentId);
  const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

  const { year, month } = bangkokYearMonth(new Date());
  const path = `${safePathPart(companyShort)}/${year}/${month}/${safePathPart(doc.documentNumber)}.pdf`;
  // upsert: a healing retry may re-export the same document to the same
  // path — overwriting an identical PDF is fine, erroring on it is not.
  const { error: uploadErr } = await admin.storage.from("receipts").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw new Error(`receipt upload failed: ${uploadErr.message}`);

  const { error: writeErr } = await admin.from("payment_records").update({ receipt_path: path }).eq("id", recordId);
  if (writeErr) throw new Error(`receipt_path write failed: ${writeErr.message}`);
  return path;
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

  // Idempotency, layer 1: a receipt already exists for this record →
  // never create a second one. If its PDF also landed, this is a pure
  // read; if the earlier export failed (the "orphan" case the brief
  // warns about), heal it by re-exporting — export-pdf creates nothing
  // on the FlowAccount side, so this stays safe to repeat.
  if (record.flowaccount_document_id) {
    const doc: IssuedDocument = { documentId: record.flowaccount_document_id, documentNumber: record.flowaccount_document_number ?? record.flowaccount_document_id };
    let receiptPath = record.receipt_path;
    if (!receiptPath) {
      try {
        const accessToken = await getAccessToken(admin);
        receiptPath = await storePdf(admin, accessToken, doc, company.short, record.id);
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
    const doc = await createReceipt(accessToken, { recordId: record.id, contactId, company: { ...company }, productName, amountGross, whtRate, whtAmount });

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
      receiptPath = await storePdf(admin, accessToken, doc, company.short, record.id);
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
