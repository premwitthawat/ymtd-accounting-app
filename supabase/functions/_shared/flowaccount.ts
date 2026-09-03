// FlowAccount client shared by flowaccount-issue-receipt (ใบเสร็จ per
// paid filing) and flowaccount-invoices (ใบแจ้งหนี้ on the 1st + its
// auto-receipt). One place owns token caching, contact creation, the
// document payload shape, PDF export, and mock mode — the two functions
// must never drift apart on any of these, or a receipt and the invoice
// it settles could disagree about the same client.
//
// Defaults point at the SANDBOX; production is opt-in via env.
// FLOWACCOUNT_MOCK=true short-circuits every outbound call with
// shape-identical fakes (real credentials take 1–2 business days to be
// approved, and everything downstream shouldn't wait for them).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const BASE_URL = Deno.env.get("FLOWACCOUNT_BASE_URL") ?? "https://openapi.flowaccount.com/test";
export const TOKEN_URL = Deno.env.get("FLOWACCOUNT_TOKEN_URL") ?? "https://openapi.flowaccount.com/test/token";
export const MOCK = Deno.env.get("FLOWACCOUNT_MOCK") === "true";
// The firm's own bank account in FlowAccount (MyCompany > ช่องทางการเงิน),
// numeric id from GET /bank-accounts. Environment-specific, hence env
// rather than a constant. Without it a receipt cannot record the
// transfer that paid it - see createDocument.
export const BANK_ACCOUNT_ID = Deno.env.get("FLOWACCOUNT_BANK_ACCOUNT_ID");

// deno-lint-ignore no-explicit-any
export type Admin = ReturnType<typeof createClient<any>>;

// Copied from line-webhook/index.ts — storage paths and billing periods
// should follow the calendar month staff experience, not the edge
// region's clock.
export function bangkokYearMonth(date: Date): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  return {
    year: parts.find(p => p.type === "year")!.value,
    month: parts.find(p => p.type === "month")!.value,
  };
}

export const bangkokPeriod = (date: Date) => {
  const { year, month } = bangkokYearMonth(date);
  return `${year}-${month}`;
};

// Storage rejects non-ASCII object keys outright (InvalidKey — verified
// against the local stack), and "/" inside a document number would nest
// folders, so path parts get reduced to a safe charset.
export const safePathPart = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "-");

export const round2 = (n: number) => Math.round(n * 100) / 100;

// FlowAccount's rate-limit announcement recommends exponential backoff
// on 429 (sandbox allows just 20 req/min). Retry-After honored when
// present; otherwise 1s/2s/4s.
export async function flowFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return flowFetch(url, init, attempt + 1);
  }
  return res;
}

// A tiny but structurally valid PDF, so mock mode exercises the exact
// same decode → upload → signed-URL pipeline as the real thing.
export const MOCK_PDF_BASE64 = btoa(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF"
);

// Client-credentials token, cached in integration_tokens (017,
// service-role only). The 60s slack keeps a nearly-dead token from
// being used for a multi-call sequence that would outlive it.
export async function getAccessToken(admin: Admin): Promise<string> {
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

export interface CompanyIdentity {
  id: number;
  name: string;
  tax_id: string;
  address: string | null;
  branch_code: string | null;
  flowaccount_contact_id: string | null;
}

// One FlowAccount contact per company, created lazily on first use and
// cached on companies.flowaccount_contact_id.
//
// The cache is not an optimisation, it is load-bearing. Verified in the
// sandbox: a document posted *without* contactId silently creates a
// brand-new contact every time (3 documents produced 3 duplicate
// contacts), while a document posted with a contactCode that already
// exists is rejected outright with ERROR.CONTACT_CODE_DUPLICATE. Only
// the numeric contactId both links to the existing contact and creates
// nothing new. At ~30 clients x 12 months x 2 documents, getting this
// wrong would bury the firm address book in ~700 duplicates a year.
export async function ensureContact(admin: Admin, accessToken: string, company: CompanyIdentity): Promise<string> {
  if (company.flowaccount_contact_id) return company.flowaccount_contact_id;

  let contactId: string;
  if (MOCK) {
    contactId = `mock-contact-${company.id}`;
  } else {
    const res = await flowFetch(`${BASE_URL}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contactName: company.name,
        contactType: 3, // juristic person - every client billed through this app is one
        contactGroup: 3, // customer
        contactCode: `YMTD-${company.id}`,
        contactAddress: company.address ?? "",
        contactTaxId: company.tax_id,
        contactBranch: "สำนักงานใหญ่",
        contactBranchCode: company.branch_code ?? "00000",
      }),
    });
    const body = await res.json().catch(() => ({}));
    // Contact responses come back paginated even for a single create:
    // the new row is data.list[0], not data.
    const created = body.data?.list?.[0];
    if (!res.ok || body.status === false || !created?.id) {
      throw new Error(`FlowAccount contact create failed (${res.status}): ${JSON.stringify(body)}`);
    }
    contactId = String(created.id);
  }

  const { error } = await admin.from("companies").update({ flowaccount_contact_id: contactId }).eq("id", company.id);
  if (error) throw new Error(`contact id write-back failed: ${error.message}`);
  return contactId;
}

export interface IssuedDocument {
  documentId: string;
  documentNumber: string;
}

// "billing" is a combined billing note (ใบวางบิลรวม): a presentation document
// listing every month a client still owes, sent as ONE link so the client sees
// one total to transfer — while the underlying invoices stay one-per-month for
// bookkeeping. It carries no payment leg and settles nothing by itself.
export type DocumentKind = "invoice" | "receipt" | "billing";

// A receipt cannot be created on its own. POST /receipts answers
// "Create Receipt API is obsoleted, please follow the Upgrade Receipt
// procedure" and /receipts/with-payment answers the same, so every
// receipt is an *upgrade* of an invoice that already exists. The paths
// are asymmetric as a result: a receipt is created under /upgrade but
// read (and exported) under /receipts.
const PDF_PATH: Record<DocumentKind, string> = { invoice: "tax-invoices", receipt: "receipts", billing: "billing-notes" };

// A receipt is only ever issued because the client has already paid, so
// it should land in FlowAccount as collected rather than as one more
// document awaiting payment - otherwise the firm's own books show the
// money as never received. Recording the payment needs the firm's bank
// account id; when that is not configured the receipt is still issued,
// just without the payment leg, because a client waiting on their
// receipt should not be held hostage to a missing setting. Verified:
// with-payment plus bankAccountId returns status "paid", and a transfer
// without bankAccountId is rejected outright.
const createPath = (kind: DocumentKind) =>
  kind === "invoice" ? "tax-invoices"
  : kind === "billing" ? "billing-notes"
  : BANK_ACCOUNT_ID ? "upgrade/receipts/with-payment" : "upgrade/receipts";

// ลบได้เฉพาะเอกสารสถานะรอดำเนินการ (FlowAccount ลบแบบ soft) — ใช้เก็บกวาดใบวางบิลรวม
// ฉบับเก่าเมื่อออกฉบับใหม่หรือเมื่อหนี้หมด ล้มเหลวไม่ถือเป็นเรื่องคอขาดบาดตาย (เช่น
// ใบถูกลบไปแล้วจากหน้าเว็บ) ผู้เรียกจึงควร catch แล้ว log เอง
export async function deleteDocument(accessToken: string, kind: DocumentKind, documentId: string): Promise<void> {
  if (MOCK) return;
  const res = await flowFetch(`${BASE_URL}/${PDF_PATH[kind]}/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`FlowAccount ${kind} delete failed (${res.status}): ${await res.text()}`);
}

// FlowAccount source-document enum for an upgrade (Quotations = 3,
// Billing Notes = 5, Tax Invoices = 7). Ours always upgrade from the
// tax invoice issued first.
const REFERENCE_TYPE_TAX_INVOICE = 7;

const MOCK_NUMBER_PREFIX: Record<DocumentKind, string> = { invoice: "MOCKINV", receipt: "MOCKRE", billing: "MOCKBL" };

const bangkokDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);

// Creates one document. The payload shape is verified end to end against
// the sandbox (INV2026080001 -> RE2026080001) rather than inferred: the
// published Postman collection and the OpenAPI SDK both disagree with
// the live API in several places, and the live API won.
//
// isVat is hard false - the firm bills accounting service fees and is
// not VAT-registered. Withholding is per-document rather than per-item
// because juristic clients withhold 3% on the whole service fee.
export async function createDocument(
  accessToken: string,
  kind: DocumentKind,
  args: {
    mockKey: string; // deterministic mock identity, so a raced duplicate collides instead of multiplying
    contactId: string;
    company: { name: string; tax_id: string | null; address: string | null; branch_code: string | null };
    lines: { productName: string; amount: number }[];
    amountGross: number;
    whtRate: number;
    whtAmount: number;
    issuedOn?: string; // YYYY-MM-DD, defaults to today in Bangkok
    dueDate?: string; // invoices only; defaults to issuedOn
    remarks?: string;
    reference?: IssuedDocument; // the invoice this receipt settles - required for kind "receipt"
  }
): Promise<IssuedDocument> {
  if (MOCK) {
    const { year, month } = bangkokYearMonth(new Date());
    return {
      documentId: `mock-${kind}-${args.mockKey}`,
      documentNumber: `${MOCK_NUMBER_PREFIX[kind]}${year}${month}-${args.mockKey.slice(0, 8)}`,
    };
  }

  if (kind === "receipt" && !args.reference) {
    throw new Error("createDocument: a receipt must reference the invoice it settles");
  }

  const issuedOn = args.issuedOn ?? bangkokDate(new Date());
  const dueDate = args.dueDate ?? issuedOn;
  // creditType 1 = credit terms (invoice/billing note, payable by dueDate),
  // 3 = settled immediately (receipt).
  const onCredit = kind !== "receipt";
  // FlowAccount derives the due date printed on the document from
  // publishedOn + creditDays and ignores the dueDate field it is sent -
  // verified in the sandbox, where invoices posted with creditDays 0
  // came back due on their own issue date. So the term has to be
  // expressed in days, not as a date. dueDate is still sent for the
  // sake of a payload that says the same thing twice rather than
  // contradicting itself.
  const creditDays = onCredit ? Math.max(0, Math.round((Date.parse(dueDate) - Date.parse(issuedOn)) / 86_400_000)) : 0;

  const res = await flowFetch(`${BASE_URL}/${createPath(kind)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recordId: 0,
      contactId: Number(args.contactId),
      contactName: args.company.name,
      contactAddress: args.company.address ?? "",
      contactTaxId: args.company.tax_id ?? "",
      contactBranch: "สำนักงานใหญ่",
      contactGroup: 3,
      publishedOn: issuedOn,
      creditType: onCredit ? 1 : 3,
      creditDays,
      dueDate,
      isVatInclusive: false,
      useReceiptDeduction: false,
      subTotal: args.amountGross,
      discountPercentage: 0,
      discountAmount: 0,
      totalAfterDiscount: args.amountGross,
      isVat: false,
      vatAmount: 0,
      grandTotal: args.amountGross,
      documentShowWithholdingTax: args.whtRate > 0,
      documentWithholdingTaxPercentage: args.whtRate,
      documentWithholdingTaxAmount: args.whtAmount,
      documentDeductionType: 0,
      documentDeductionAmount: 0,
      remarks: args.remarks ?? "",
      showSignatureOrStamp: true,
      documentStructureType: "SimpleDocument",
      saleAndPurchaseChannel: 0,
      ...(kind === "receipt" && BANK_ACCOUNT_ID
        ? {
            // paymentMethod 5 = transfer, which is how every client
            // here pays (they send a slip into the LINE group).
            documentPaymentStructureType: "SimpleDocumentWithPaymentReceivingTransfer",
            paymentMethod: 5,
            paymentDate: issuedOn,
            collected: round2(args.amountGross - args.whtAmount),
            paymentDeductionType: 0,
            paymentDeductionAmount: 0,
            withheldPercentage: args.whtRate,
            withheldAmount: args.whtAmount,
            bankAccountId: Number(BANK_ACCOUNT_ID),
            paymentRemarks: "รับชำระโดยโอนเงิน",
            remainingCollectedType: 0,
            remainingCollected: 0,
          }
        : {}),
      ...(args.reference
        ? {
            documentReference: [
              {
                recordId: Number(args.reference.documentId),
                referenceDocumentSerial: args.reference.documentNumber,
                referenceDocumentType: REFERENCE_TYPE_TAX_INVOICE,
              },
            ],
          }
        : {}),
      items: args.lines.map(line => ({
        type: 1, // service
        name: line.productName,
        description: "",
        quantity: 1,
        unitName: "งาน",
        pricePerUnit: line.amount,
        total: line.amount,
      })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false || !body.data?.recordId) {
    throw new Error(`FlowAccount ${kind} create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return {
    documentId: String(body.data.recordId),
    documentNumber: String(body.data.documentSerial),
  };
}

export async function exportPdfBase64(accessToken: string, kind: DocumentKind, documentId: string): Promise<string> {
  if (MOCK) return MOCK_PDF_BASE64;

  // The empty JSON body is required, not cosmetic: a bodyless POST is
  // rejected with 415 Unsupported Media Type.
  const res = await flowFetch(`${BASE_URL}/${PDF_PATH[kind]}/${documentId}/export-pdf/base64`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false || !body.data) {
    throw new Error(`FlowAccount ${kind} PDF export failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data as string;
}

// Exports the PDF and drops it in a bucket, returning the object path
// the caller should persist. upsert because heal retries legitimately
// re-export the same document to the same path.
export async function exportPdfToBucket(
  admin: Admin,
  accessToken: string,
  kind: DocumentKind,
  doc: IssuedDocument,
  bucket: string,
  companyId: number
): Promise<string> {
  const pdfBase64 = await exportPdfBase64(accessToken, kind, doc.documentId);
  const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const { year, month } = bangkokYearMonth(new Date());
  const path = `company-${companyId}/${year}/${month}/${safePathPart(doc.documentNumber)}.pdf`;
  const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`${bucket} upload failed: ${error.message}`);
  return path;
}
