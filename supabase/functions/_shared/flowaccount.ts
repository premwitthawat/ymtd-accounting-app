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
export const TOKEN_URL = Deno.env.get("FLOWACCOUNT_TOKEN_URL") ?? "https://openapi.flowaccount.com/token";
export const MOCK = Deno.env.get("FLOWACCOUNT_MOCK") === "true";

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
// cached on companies.flowaccount_contact_id so repeat documents don't
// pile duplicates into the FlowAccount address book.
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

export interface IssuedDocument {
  documentId: string;
  documentNumber: string;
}

export type DocumentKind = "receipts" | "billing-notes";

const MOCK_NUMBER_PREFIX: Record<DocumentKind, string> = { receipts: "MOCKRE", "billing-notes": "MOCKINV" };

// Creates one document (receipt or billing note — FlowAccount's inline
// document endpoints share a payload shape, only the path differs).
// Field names follow the inline-document schema; exact acceptance can
// only be proven against the sandbox once credentials arrive — flagged
// in the work report, and isolated here so a rename lands in one place.
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
  }
): Promise<IssuedDocument> {
  if (MOCK) {
    const { year, month } = bangkokYearMonth(new Date());
    return {
      documentId: `mock-${kind}-${args.mockKey}`,
      documentNumber: `${MOCK_NUMBER_PREFIX[kind]}${year}${month}-${args.mockKey.slice(0, 8)}`,
    };
  }

  const res = await flowFetch(`${BASE_URL}/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: args.contactId,
      contactName: args.company.name,
      contactTaxId: args.company.tax_id ?? "",
      contactAddress: args.company.address ?? "",
      contactBranch: args.company.branch_code ?? "00000",
      publishedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()),
      documentLines: args.lines.map(line => ({
        productName: line.productName,
        quantity: 1,
        unitName: "งาน",
        pricePerUnit: line.amount,
        total: line.amount,
      })),
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
    throw new Error(`FlowAccount ${kind} create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  const doc = body.data ?? body;
  return {
    documentId: String(doc.recordId ?? doc.documentId ?? doc.id),
    documentNumber: String(doc.documentSerial ?? doc.documentNumber ?? doc.recordId ?? doc.id),
  };
}

export async function exportPdfBase64(accessToken: string, kind: DocumentKind, documentId: string): Promise<string> {
  if (MOCK) return MOCK_PDF_BASE64;

  const res = await flowFetch(`${BASE_URL}/${kind}/${documentId}/export-pdf/base64`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
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
